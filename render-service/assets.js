/*
 * Publishing rendered assets to Cloudflare R2.
 *
 * R2 rather than S3 for one reason: egress is free. Images to devices is
 * the only cost here that scales purely with display count and never gets
 * cheaper with cleverness, so it is the one worth designing away.
 *
 * Every display publishes under its own unguessable prefix:
 *
 *     /<prefix>/display.json
 *     /<prefix>/display_p0.png
 *
 * The bucket is public - the TVs fetch with no credentials, so it has to
 * be. But these images are a household's calendar, their chores with
 * names on them, their photos. With predictable paths, anyone who learned
 * the hostname could walk into other people's screens by guessing. The
 * prefix is what stands between the two, so it is derived per display,
 * never stored anywhere public, and handed to the device over the control
 * channel only.
 *
 * The prefix is DERIVED, not generated-and-saved: the container's disk is
 * ephemeral, so a saved prefix died on every deploy and orphaned the
 * display's objects each time. HMAC(secret, deviceId) gives the same
 * answer on every instance with no state to lose, and stays unguessable
 * without the secret. Rotating the secret rotates every prefix - devices
 * pick the new base up on their next poll and the old objects orphan,
 * which is the same, survivable event as losing the old prefix file was.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } = require("@aws-sdk/client-s3");

// 2026-08-27: publishing moved to native S3 + CloudFront (bucket
// mango-roku-assets, flat-rate CloudFront plans made egress a non-issue
// and R2's custom-domain path wanted the DNS zone on Cloudflare). The
// R2 branch below stays for rollback and local setups; ASSET_BUCKET
// selects native S3 with credentials from the task role.
const AWS_BUCKET = process.env.ASSET_BUCKET || "";
const BUCKET = AWS_BUCKET || process.env.R2_BUCKET || "mango-display-assets";
const ACCOUNT = process.env.R2_ACCOUNT_ID || "";
const PUBLIC_BASE = (process.env.ASSET_PUBLIC_BASE || process.env.R2_PUBLIC_BASE || "").replace(/\/+$/, "");
// Environment folder inside the shared bucket ("test", "prod"): both
// pipelines share one bucket and one r2.dev hostname, split by top-level
// key. Devices never see this decision - they are handed the full
// assetBase at runtime. Empty means bucket-root (the pre-split layout).
const ROOT = (process.env.ASSET_ROOT || "").replace(/^\/+|\/+$/g, "");
// Only content-addressed sprite art is ever deleted from the bucket.
// display.json and the page images keep stable names and must never be
// reaped just because one publish did not list them (a page that failed
// to render this cycle is still on a device's screen).
const REAPABLE = /^(overlay_wxc_[0-9a-f]+_[0-9a-f]+|overlay_gif_[0-9a-f]+)\.(png|json)$/;
const rootedKey = (rest) => (ROOT ? ROOT + "/" : "") + rest;

const TYPES = {
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

let client = null;
function s3() {
  if (client) return client;
  if (AWS_BUCKET) {
    // native S3: default endpoint, credentials from the Fargate task
    // role via the SDK's default chain (no stored keys)
    client = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });
    return client;
  }
  if (!ACCOUNT) throw new Error("R2_ACCOUNT_ID is not set");
  client = new S3Client({
    region: "auto",
    endpoint: "https://" + ACCOUNT + ".r2.cloudflarestorage.com",
    // credentials come from the environment: the mango-r2 profile locally,
    // and Secrets Manager when running on Fargate
  });
  return client;
}

// The HMAC key. A dedicated ASSET_PREFIX_SECRET wins; failing that the R2
// secret key itself, which every deployment that can publish necessarily
// has. Local development with neither (publishing disabled) gets a fixed
// key - those prefixes never leave the machine.
async function prefixSecret() {
  if (process.env.ASSET_PREFIX_SECRET) return process.env.ASSET_PREFIX_SECRET;
  if (process.env.AWS_SECRET_ACCESS_KEY) return process.env.AWS_SECRET_ACCESS_KEY;
  if (enabled()) {
    // resolved the same way the upload client resolves them (profile,
    // SSO, whatever the SDK finds) so local publishing derives the same
    // prefix a Fargate task would only if they share credentials - which
    // is exactly the property we want
    const creds = await s3().config.credentials();
    if (creds && creds.secretAccessKey) return creds.secretAccessKey;
  }
  return "local-development-only";
}

async function derivePrefix(deviceId) {
  const secret = await prefixSecret();
  return crypto.createHmac("sha256", secret).update("asset-prefix:" + deviceId).digest("hex").slice(0, 32);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// publishing is opt-in: with nothing configured the service serves from
// disk, which is how development works
function enabled() {
  return !!(PUBLIC_BASE && (AWS_BUCKET || ACCOUNT));
}

// One per display: owns the display's prefix and remembers what it has
// already uploaded, so a render only ships the files it changed.
class AssetPublisher {
  constructor(prefix) {
    this.prefix = prefix;
    this.uploaded = new Map(); // name -> size:mtime stamp
    /* objects already in the bucket when this process started, not yet
     * re-uploaded by it. The reaper only ever knew about files IT had
     * uploaded, so superseded sprite art from before a restart orphaned
     * forever - two displays had accumulated 214 objects that way. */
    this.remote = new Set();
  }

  /* Learn what the bucket already holds for this display, so reaping can
   * remove art that predates this process. Best effort: a failure here
   * only means we prune less, never that we publish wrongly. */
  async seedFromRemote() {
    if (!enabled()) return 0;
    const base = rootedKey(this.prefix + "/");
    let token;
    try {
      do {
        const page = await s3().send(
          new ListObjectsV2Command({ Bucket: BUCKET, Prefix: base, ContinuationToken: token }),
        );
        for (const obj of page.Contents || []) {
          const name = obj.Key.slice(base.length);
          if (name && !name.includes("/")) this.remote.add(name);
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
    } catch (e) {
      this.remote.clear();
      return 0;
    }
    return this.remote.size;
  }

  // The base a device fetches from. Handed out over the control channel
  // so the prefix never appears anywhere public.
  publicBase() {
    if (!PUBLIC_BASE) return "";
    return PUBLIC_BASE + "/" + rootedKey(this.prefix + "/");
  }

  async putFile(localPath, key, attempt = 1) {
    const body = fs.readFileSync(localPath);
    try {
      return await this.putOnce(body, localPath, key);
    } catch (e) {
      // TLS resets and transient 5xx happen on long batches; the first
      // publish alone is ~30 files including megabyte sprite sheets
      if (attempt >= 3) throw e;
      await sleep(attempt * 500);
      return this.putFile(localPath, key, attempt + 1);
    }
  }

  async putOnce(body, localPath, key) {
    await s3().send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: body,
        ContentType: TYPES[path.extname(localPath).toLowerCase()] || "application/octet-stream",
        // Version-correctness lives in these headers, not in query-string
        // cache busting: CloudFront's flat-rate plans only allow MANAGED
        // cache policies, and every managed policy that keys on query
        // strings also forwards the Host header - which breaks S3 origins
        // (bucket resolution follows Host; live 404s on existing keys,
        // 2026-08-27). So the CDN ignores query strings entirely and:
        // - display.json is never cached (a device's "anything new?")
        // - page images revalidate every fetch (stable names, changing
        //   pixels; a 304 from same-region S3 is trivially cheap)
        // - content-named sprite art caches for a year (a new filming is
        //   a new filename by design)
        CacheControl: key.endsWith("display.json")
          ? "no-store"
          : /^(overlay_|effect_)/.test(path.basename(key))
            ? "public, max-age=31536000, immutable"
            : "public, no-cache",
      }),
    );
    return body.length;
  }

  // Upload only what changed. A render rewrites every page image but the
  // sprite sheets are content-hashed and mostly identical between renders;
  // re-uploading them would burn write operations, which unlike egress are
  // not free.
  async publish(dir, files, opts) {
    let sent = 0;
    let bytes = 0;
    const failed = [];
    // Concurrent puts: the publish gates the version announcement now, so
    // its wall-clock is user-visible latency on every swipe and edit. A
    // typical publish is 2-3 small files; parallelizing turns ~400-600ms
    // of serial round trips into the slowest single put. Capped so a
    // first-boot publish (~30 files incl. megabyte sprite sheets) does
    // not open thirty simultaneous TLS streams.
    const MAX_PARALLEL = 6;
    const work = [];
    for (const name of files) {
      const local = path.join(dir, name);
      let stat;
      try {
        stat = fs.statSync(local);
      } catch (e) {
        continue; // never rendered this cycle
      }
      const stamp = stat.size + ":" + Math.round(stat.mtimeMs);
      if (this.uploaded.get(name) === stamp) continue;
      work.push({ name, local, stamp });
    }
    for (let i = 0; i < work.length; i += MAX_PARALLEL) {
      const batch = work.slice(i, i + MAX_PARALLEL);
      const results = await Promise.allSettled(
        batch.map((w) => this.putFile(w.local, rootedKey(this.prefix + "/" + w.name))),
      );
      results.forEach((r, j) => {
        const w = batch[j];
        if (r.status === "fulfilled") {
          bytes += r.value;
          this.uploaded.set(w.name, w.stamp);
          this.remote.delete(w.name); /* ours now, tracked by stamp */
          sent++;
        } else {
          // One bad file must not strand the rest - a missing sprite is a
          // blank patch, a missing manifest is a display that never
          // updates. Not marking it uploaded means the next render
          // retries it.
          failed.push(w.name);
        }
      });
    }
    const removed = await this.reap(files, opts && opts.reapRemote === true);
    return { sent, bytes, prefix: this.prefix, failed, removed };
  }

  // Delete objects we uploaded that the display no longer publishes.
  //
  // Sprite sheets are named by their CONTENT (a re-filmed weather icon
  // gets a new filename by design, so a device can never pair a cached
  // texture with a new frame grid). The cost is a new object per filming:
  // seven variants of the same sun had already piled up in the bucket,
  // and nothing ever removed them. The generators prune superseded
  // variants from local disk after a 10-minute grace - long past any
  // manifest still live on a device - so "we uploaded it, it is gone
  // locally, and this publish does not list it" is a safe delete.
  //
  // Best effort by design: a failed delete is retried on the next publish
  // (the name stays in `uploaded`), and it never touches the version
  // announcement.
  async reap(files, includeRemote) {
    const live = new Set(files);
    let candidates = [...this.uploaded.keys()];
    /* Pre-existing objects are only safe to judge against a COMPLETE
     * publish: a staged publish (priority page first) lists just that
     * page's files, and pruning on it would delete art the other pages
     * still reference. */
    if (includeRemote) candidates = candidates.concat([...this.remote]);
    const stale = candidates.filter((name) => !live.has(name) && REAPABLE.test(name));
    if (!stale.length) return 0;
    let removed = 0;
    for (const name of stale) {
      try {
        await s3().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: rootedKey(this.prefix + "/" + name) }));
        this.uploaded.delete(name);
        this.remote.delete(name);
        removed++;
      } catch (e) {
        // leave it in `uploaded` so the next publish tries again
      }
    }
    return removed;
  }
}

module.exports = { AssetPublisher, derivePrefix, enabled, BUCKET };
