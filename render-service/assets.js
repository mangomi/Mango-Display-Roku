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
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const BUCKET = process.env.R2_BUCKET || "mango-display-assets";
const ACCOUNT = process.env.R2_ACCOUNT_ID || "";
const PUBLIC_BASE = (process.env.R2_PUBLIC_BASE || "").replace(/\/+$/, "");

const TYPES = {
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

let client = null;
function s3() {
  if (client) return client;
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
  return !!(ACCOUNT && PUBLIC_BASE);
}

// One per display: owns the display's prefix and remembers what it has
// already uploaded, so a render only ships the files it changed.
class AssetPublisher {
  constructor(prefix) {
    this.prefix = prefix;
    this.uploaded = new Map(); // name -> size:mtime stamp
  }

  // The base a device fetches from. Handed out over the control channel
  // so the prefix never appears anywhere public.
  publicBase() {
    if (!PUBLIC_BASE) return "";
    return PUBLIC_BASE + "/" + this.prefix + "/";
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
        // display.json must never be served stale - it is how a device
        // learns there is anything new. The images it names are already
        // cache-busted per render.
        CacheControl: key.endsWith("display.json") ? "no-store" : "public, max-age=31536000",
      }),
    );
    return body.length;
  }

  // Upload only what changed. A render rewrites every page image but the
  // sprite sheets are content-hashed and mostly identical between renders;
  // re-uploading them would burn write operations, which unlike egress are
  // not free.
  async publish(dir, files) {
    let sent = 0;
    let bytes = 0;
    const failed = [];
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
      try {
        bytes += await this.putFile(local, this.prefix + "/" + name);
        this.uploaded.set(name, stamp);
        sent++;
      } catch (e) {
        // One bad file must not strand the rest - a missing sprite is a
        // blank patch, a missing manifest is a display that never updates.
        // Not marking it uploaded means the next render retries it.
        failed.push(name);
      }
    }
    return { sent, bytes, prefix: this.prefix, failed };
  }
}

module.exports = { AssetPublisher, derivePrefix, enabled, BUCKET };
