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
 * prefix is what stands between the two, so it is generated once per
 * display, kept, and handed to the device over the control channel rather
 * than being derivable from anything public.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const BUCKET = process.env.R2_BUCKET || "mango-display-assets";
const ACCOUNT = process.env.R2_ACCOUNT_ID || "";
const PUBLIC_BASE = (process.env.R2_PUBLIC_BASE || "").replace(/\/+$/, "");
const PREFIX_FILE = path.join(__dirname, ".asset-prefix");

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

// Stable per display and kept out of source control. Losing it is not
// fatal - a new one is generated and the device picks it up on its next
// poll - but it does orphan the old objects until the lifecycle rule
// clears them.
function assetPrefix() {
  try {
    const saved = fs.readFileSync(PREFIX_FILE, "utf8").trim();
    if (saved) return saved;
  } catch (e) {}
  const made = crypto.randomBytes(16).toString("hex");
  fs.writeFileSync(PREFIX_FILE, made);
  return made;
}

// The base a device fetches from. Handed out over the control channel so
// the prefix never appears anywhere public.
function publicBase() {
  if (!PUBLIC_BASE) return "";
  return PUBLIC_BASE + "/" + assetPrefix() + "/";
}

async function putFile(localPath, key) {
  const body = fs.readFileSync(localPath);
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
const uploaded = new Map();
async function publish(dir, files) {
  const prefix = assetPrefix();
  let sent = 0;
  let bytes = 0;
  for (const name of files) {
    const local = path.join(dir, name);
    let stat;
    try {
      stat = fs.statSync(local);
    } catch (e) {
      continue; // never rendered this cycle
    }
    const stamp = stat.size + ":" + Math.round(stat.mtimeMs);
    if (uploaded.get(name) === stamp) continue;
    bytes += await putFile(local, prefix + "/" + name);
    uploaded.set(name, stamp);
    sent++;
  }
  return { sent, bytes, prefix };
}

module.exports = { publish, assetPrefix, publicBase, BUCKET };
