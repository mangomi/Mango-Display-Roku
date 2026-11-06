// A photo's short address: /<list id>/<number>.jpg redirects to that photo
// in the display's latest list. The Echo only knows the address and how
// many photos there are, so a list of any length never travels to it and
// a new list reaches a running screen without a rebuild (Dave, 2026-11-06).
// The skill's Lambda saves the lists (overlay-slideshow.js); they are read
// through the asset CDN, so this function needs no access to the bucket.

const LIST_TTL_MS = 30000;
const lists = new Map();

async function listOf(id) {
  const had = lists.get(id);
  if (had && Date.now() - had.at < LIST_TTL_MS) return had.urls;
  try {
    const r = await fetch(process.env.LISTS_BASE + id + ".json");
    if (r.ok) {
      const urls = (await r.json()).urls;
      if (Array.isArray(urls) && urls.length) {
        if (lists.size > 500) lists.clear();
        lists.set(id, { at: Date.now(), urls });
        return urls;
      }
    }
  } catch (e) {
    console.log("list " + id + " failed: " + e.message);
  }
  return had ? had.urls : null; // a hiccup: the last list we had still works
}

exports.handler = async (event) => {
  const m = /^\/([0-9a-f]{32})\/(\d{1,7})\.jpg$/.exec(event.rawPath || "");
  const no = (statusCode) => ({ statusCode, headers: { "Cache-Control": "no-store" } });
  if (!m) return no(404);
  const urls = await listOf(m[1]);
  if (!urls) return no(404);
  return { statusCode: 302, headers: { Location: urls[Number(m[2]) % urls.length], "Cache-Control": "no-store" } };
};
