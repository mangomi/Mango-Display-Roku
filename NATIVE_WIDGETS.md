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
| Countdown | **Native overlay** | ✅ built | Only the `.value` numbers are hidden and re-rendered on device (box chrome, unit labels and event name stay baked). Manifest carries an absolute target epoch computed in the render browser, so the Roku does timezone-free math; ticks every second, honors which units are enabled, and matches the portal's one-second-ahead display. |
| Photo slideshow (image widget) | **Native overlay** | ✅ built | Manifest carries the portal-resolved URL list (any source: Unsplash/Google Photos/iCloud/S3, capped 60) + `imageDelayTime` + `isCropToFill` (cover/contain via loadDisplayMode) + per-widget transition (fade/slides/flip, clipped to the rect). A/B Posters preload + swap; decode capped at rect size; failed URLs skip ahead; single-image widgets stay baked. Photos are **hidden from the render** (a baked photo of another aspect ratio would peek around contain-fit photos); the widget panel stays baked. Position persists across page rotations (each visit resumes at the next photo), and the fallback refresh timer stays dormant while the long-poll is healthy so live slideshows are never rebuilt mid-dwell. Google/iCloud URL expiry is refreshed by the 20-min scheduled renders. Page *background* slideshows are phase 2 (layered render). |
| Video / YouTube (Iframily video) | Native Video node (planned) | ⬜ planned | Roku plays MP4/HLS natively in the rect. YouTube embeds cannot work on Roku — disable in editor for Roku devices. |
| Weather | In image + **animated icons as native overlays** | ✅ built | Text/temps stay in the image (refresh via scheduled renders). Animated SVG icons (SMIL/CSS — no frames to decode) are **filmed live in the browser** after the still: each icon's animation period is parsed from its SVG source (`dur=`/`animation:`) and exactly one full cycle is captured (capped at 12 s; unknown periods fall back to a 2.6 s window), so loops wrap seamlessly — the sun completes its rotation instead of snapping back. One shared capture burst serves all icons; each keeps the frames spanning its own cycle. Played by `GifOverlay` (emitted as type `gif`, zero Roku changes). The static icon is **hidden for the still and restored for the filming pass**, so the overlay is the only source of icon pixels — a baked copy showed through as a stuck ghost whenever the frames didn't cover it exactly (animation overflowing the measured box, or a static icon among animated ones). Elements are matched by geometry, since one widget's icons share an id/class (5-day forecast). For the filming pass the page is **stripped to icons only** — every background, shadow, blur and border is blanked and frames are captured with alpha — so the sprite sheets carry nothing but icon pixels. The still supplies the panel, the overlay supplies the icon, and nothing composites twice (an earlier version filmed the panel too, which showed as a faint square around each icon). Detection fetches each icon URL Node-side (S3 bucket lacks CORS for in-page reads) and skips static icons. |
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

## Layered pages (rotating page backgrounds)

A page background sits *behind* the widgets, so it can't be a normal
overlay. When a page has a rotating background:

1. The render hides the portal's `bg_img_1/2` layers and makes the page
   chrome transparent (`html`, `body`, **`#main`** — which carries the
   page background color — and the page containers), then captures an
   **alpha PNG** (`display_pN.png`) instead of a JPEG. Weather-icon
   filming switches to alpha too, so icons composite over live photos.
2. The manifest emits a `background` overlay: photo list (current photo
   first — the portal splices its queue as it displays), interval, crop,
   transition, brightness, and the page color.
3. The Roku stacks inside each page slot: `under` group (page color +
   crossfading background Posters) → page PNG → overlays. Backgrounds
   reuse `SlideshowOverlay`; `brightness` maps to Poster `blendColor`
   (multiply), matching the portal's `filter: brightness()`.

Single-photo backgrounds stay baked into the render. This under-layer
mechanism also retires the old "overlays always draw on top" limit for
anything that needs to sit beneath widgets.

## OPEN ISSUE — spinner can keep spinning (next session)

**Symptom (reported twice on device):** the spinner keeps turning after
the edited layout is already visible on screen.

**Cause identified:** busy transitions were delivered as *events*. When a
render publishes, the server flushes twice in quick succession — first
`{new version, busy:true}`, then `{busy:false}` a moment later. The TV is
NOT listening for that second flush: it is synchronously fetching the
manifest and loading page images. It then re-arms its long-poll, the
server has nothing newer to say, and the spinner runs until the 75 s
watchdog (or the next render).

**Fix in `4bdb360`, NOT yet verified on device:** the long-poll is now
state-based — the client sends the busy state it believes
(`/wait?since=N&busy=0|1`) and the server replies immediately when its
own state disagrees, so a missed transition self-corrects on the next
re-arm (~250 ms).

**To verify next session** (the app was not reinstalled after this
change — deploy first):
1. `./package.sh` + sideload, restart the watcher.
2. Make a layout edit; confirm the spinner appears, then **stops within
   ~1 s of the change appearing**, not 75 s later.
3. Watch `[Mango] busy=` in `telnet 10.0.0.50 8085` for a clean
   true → false pair per edit.
4. Multi-page displays are the case to exercise — the TV spends longer
   loading, widening the window where it misses signals.

## Update feedback (spinner)

While a **user edit** is rendering, the TV shows a native `BusySpinner`
in the bottom-right TV-safe corner, so a change is visibly on its way
instead of silently arriving ~15 s later. The version server carries a
`busy` flag alongside `version`; it flips true when an edit-driven
render starts (waiters are flushed immediately, so the spinner appears
within a couple of seconds of the save) and false when the new render is
published, held for a 3 s minimum so quick renders still register.
Background refreshes (startup, scheduled, midnight) never spin.

## Render scope (product decision)

**Every user change re-renders the entire display — all pages — not just
the changed widget or page.** Confirmed by Dave 2026-08-02. Widgets can
span pages, and background/theme changes affect everything, so a full
re-render is the always-correct option. Cost is ~5 s per page (plus ~4 s
when animated weather icons need re-filming). Do NOT add per-page dirty
tracking without asking; if render time becomes a problem on displays
with many pages, raise it as a trade-off first.

## Freshness model (who updates what, when)

| Source of change | Mechanism | Latency |
|---|---|---|
| Layout/content edits | Socket push → watcher re-render → long-poll notify | ~5 s |
| Widget data (weather, calendar, …) | Scheduled re-render every 20 min | ≤ 20 min |
| Date rollover | Scheduled re-render at local midnight | ~instant |
| Clock time | Native overlay, ticks on-device | live |
| Service restart | Startup render on watcher boot | ~5 s |
