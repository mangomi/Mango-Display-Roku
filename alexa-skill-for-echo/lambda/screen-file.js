// A display's whole screen as a file the Echo downloads, so the skill's
// reply only says which file to load.
//
// Alexa refuses a reply over ~120 KB, and one display's photo lists alone
// reached 270 KB (2026-11-06). A package the screen imports does not count
// toward that, as with the fixed code in apl-package.js. So the screen goes
// into its own package at <root>/echo/screens/<hash>.json, as the layout
// MmScreen plus the screen's commands; the reply is a small document that
// imports it and draws MmScreen. Anything on the document itself that a
// package cannot hold (settings, theme, onConfigChange) stays in the reply.
//
// Unchanged screens hash to the same file. Small live updates (ticks, page
// pictures) still go as commands in the reply.

const crypto = require("crypto");
const env = require("./env");

const NAME = "mangoscreen";
const uploaded = new Set();

/** The file and the small reply for a whole-screen directive. */
function split(directive) {
  const doc = directive.document;
  const file = {
    type: "APL", version: doc.version,
    layouts: { MmScreen: { items: doc.mainTemplate.items } },
    ...(doc.commands ? { commands: doc.commands } : {}),
  };
  const json = JSON.stringify(file);
  const version = crypto.createHash("sha256").update(json).digest("hex").slice(0, 16);
  const { commands, mainTemplate, ...rest } = doc;
  const reply = {
    ...directive,
    document: {
      ...rest,
      import: (doc.import || []).concat({ name: NAME, version, source: env.screenFiles.base + version + ".json" }),
      mainTemplate: { items: [{ type: "MmScreen" }] },
    },
  };
  return { json, version, key: env.screenFiles.prefix + version + ".json", reply };
}

/** Saves a file to the bucket (the SDK comes with the Lambda runtime; only
 * the Lambda saves, so tests and local runs do not). `listFile`: a photo list,
 * replaced in place and cached briefly; a screen never changes. */
async function save(key, json, listFile = false) {
  const stamp = key + "#" + crypto.createHash("sha1").update(json).digest("hex");
  if (uploaded.has(stamp) || !process.env.AWS_LAMBDA_FUNCTION_NAME) return;
  const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
  await new S3Client({}).send(new PutObjectCommand({
    Bucket: env.screenFiles.bucket, Key: key, Body: json, ContentType: "application/json",
    CacheControl: listFile ? "public, max-age=30" : "public, max-age=31536000, immutable",
  }));
  if (listFile) for (const u of uploaded) if (u.startsWith(key + "#")) uploaded.delete(u);
  uploaded.add(stamp);
}

module.exports = { split, save, NAME };
