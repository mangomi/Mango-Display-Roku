# Native widget strategy — Roku

The Roku app shows server-rendered images of the portal. Widgets whose
content changes faster than the render cadence get **native overlays**:
the render hides them (or their dynamic elements), publishes their
geometry/config in `manifest.json`, and the Roku app re-creates them
natively on top of the image.

This file is the single source of truth for how every portal widget type
is handled on Roku.

## The overlay contract

Each render produces two artifacts (same folder, same version):

- `display.jpg` — the page image, with native elements hidden
- `manifest.json` — geometry + config for everything the Roku draws itself

```json
{
  "canvas": { "width": 1920, "height": 1080 },
  "overlays": [
    {
      "type": "clock",
      "widgetSettingId": 123,
      "page": 0,
      "elements": { "time": { "rect": {}, "fontSizePx": 0, "...": "..." } }
    }
  ]
}
```

Coordinates are in canvas space (1920×1080), which is also the Roku
scene's FHD design space — they map 1:1, at every output resolution.

Adding a native widget type touches exactly two registries:

1. `render-service/nativeWidgets.js` — how to find, measure, and hide it
   in the rendered page (one handler object per type)
2. Roku `components/MainScene.brs` `m.overlayRegistry` — maps the
   manifest `type` to a SceneGraph component (one line), plus the
   component itself in `components/overlays/`

## Widget handling table

| Widget | Strategy | Status | Notes |
|---|---|---|---|
| Clock | **Native overlay** (time + date lines) | ✅ built | Greeting line stays in the image (re-rendered on schedule). Device timezone, not display timezone, for now. |
| Countdown | **Native overlay** (planned next) | ⬜ planned | Same pattern as clock; day/hour/min/sec boxes. Seconds only possible natively. |
| Photo slideshow (image widget) | **Native overlay** | ✅ built | Manifest carries the portal-resolved URL list (any source: Unsplash/Google Photos/iCloud/S3, capped 60) + `imageDelayTime` + `isCropToFill` (cover/contain via loadDisplayMode) + per-widget transition (fade/slides/flip, clipped to the rect). A/B Posters preload + swap; decode capped at rect size; failed URLs skip ahead; single-image widgets stay baked. Photos are **hidden from the render** (a baked photo of another aspect ratio would peek around contain-fit photos); the widget panel stays baked. Position persists across page rotations (each visit resumes at the next photo), and the fallback refresh timer stays dormant while the long-poll is healthy so live slideshows are never rebuilt mid-dwell. Google/iCloud URL expiry is refreshed by the 20-min scheduled renders. Page *background* slideshows are phase 2 (layered render). |
| Video / YouTube (Iframily video) | Native Video node (planned) | ⬜ planned | Roku plays MP4/HLS natively in the rect. YouTube embeds cannot work on Roku — disable in editor for Roku devices. |
| Weather | In image + **animated icons as native overlays** | ✅ built | Text/temps stay in the image (refresh via scheduled renders). Animated SVG icons (SMIL/CSS — no frames to decode) are **filmed live in the browser** after the still: each icon's animation period is parsed from its SVG source (`dur=`/`animation:`) and exactly one full cycle is captured (capped at 12 s; unknown periods fall back to a 2.6 s window), so loops wrap seamlessly — the sun completes its rotation instead of snapping back. One shared capture burst serves all icons; each keeps the frames spanning its own cycle. Played by `GifOverlay` (emitted as type `gif`, zero Roku changes). Static icon stays in the image as fallback; captures include the underlying background, so they blend seamlessly. Detection fetches each icon URL Node-side (S3 bucket lacks CORS for in-page reads) and skips static icons. |
| Calendar (all views) | In image | ✅ | Midnight re-render handles date rollover. |
| News | In image | ✅ | Headline page advances on re-renders, not every 5 min. |
| Quotes | In image | ✅ | Quirk: portal picks a random quote per render. |
| Sticky notes | In image | ✅ | |
| Todo | In image | ✅ | Auto-scroll of long lists is lost (static crop). |
| Chores | In image | ✅ | Badge shine/star animations lost (static). |
| Meal plan | In image | ✅ | |
| GIFs & stickers | **Native overlay** (sprite grid) | ✅ built | Render service decodes the GIF into a cols×rows PNG sprite sheet (alpha preserved, ≤36 frames, sheet capped at 2048×2048 — GPUs reject taller single-column strips; big stickers trade texture resolution for frame count, never below 35%). Timing lives in a sidecar .json so cache hits keep true speed. `GifOverlay` steps the grid 2-D through a clipped window. Any number animate at once. Non-animated GIFs stay in the image. MP4 conversion rejected: one-Video-node limit + no alpha. |
| Browser snapshot | In image | ✅ | Already a screenshot upstream. |
| Marketwatch (TradingView) | In image | ✅ | Live tickers become render-cadence snapshots. |
| Power BI | In image | ✅ | Render-cadence snapshots. |
| Health graphs | In image | ✅ | |
| PDF / docs / embed website (Iframily) | In image | ✅ | Multi-page PDF rotation lost (shows page at render time). |
| Seasonal overlays (snow, hearts, …) | Dropped on Roku v1 | ⬜ decide | Animated by nature; either disable for Roku displays or accept static frame. |
| Touch/remote interactivity | Not supported on Roku | — | Display-side editing (calendar/todo modals) is off; Roku remote can't do it meaningfully. |

## Pages & transitions

Every page renders as its own image + overlay set; `display.json` is the
Roku's single source of truth: `{ pages: [{ image, delaySeconds,
transition, autoRotate, overlays }] }`. Page metadata (count, per-page
delay/transition/rotation flag) is read from the portal's Angular scope
during the page-0 render (scope-tree walk from `$rootScope` — works with
debug info off). The Roku rotates pages on each page's own delay and
animates between them with SceneGraph.

| Portal transition | Roku | Notes |
|---|---|---|
| fade | ✅ native | opacity crossfade |
| slideleft / slideright / slideup / slidedown | ✅ native | position animation |
| pop | ✅ native | scale + fade from center |
| rotate | ✅ native | 2-D spin + fade (portal's is 2-D too) |
| flip | ⚠️ approximated | Roku has no 3-D transforms; horizontal squash-and-expand card flip |

All transitions run at the portal's 3 s ease. Unknown names fall back to
fade. Each page's image and its native overlays live in one "slot" group
and the slot is what animates — so the clock fades/slides/squashes in
lockstep with its page, and the incoming page's overlays ride in live. Designer mode keeps every page in the DOM (hidden pages are
`visibility:hidden`), so extractors filter overlays by the rendered
page's index — widget element ids carry it (`clock_<id>_<page>`).

## Freshness model (who updates what, when)

| Source of change | Mechanism | Latency |
|---|---|---|
| Layout/content edits | Socket push → watcher re-render → long-poll notify | ~5 s |
| Widget data (weather, calendar, …) | Scheduled re-render every 20 min | ≤ 20 min |
| Date rollover | Scheduled re-render at local midnight | ~instant |
| Clock time | Native overlay, ticks on-device | live |
| Service restart | Startup render on watcher boot | ~5 s |
