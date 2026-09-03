# The display manifest

What the render service publishes, and what a client is expected to do
with it. Written down because there is about to be more than one client:
the Roku channel today, an Apple TV app later. tvOS ships no web view at
all, so it needs this same treatment — a native client drawing
server-rendered images plus live widgets.

Nothing in here is Roku-specific by design. Where a field exists *because*
of a Roku limitation it says so, and there is a platform-neutral
alternative alongside it.

## Versioning

`schema` appears at the top of `display.json` and of each page manifest.

Bump it when a field is **removed or changes meaning**. Adding a field
does not need a bump — clients ignore what they do not recognise. A
client that sees a `schema` higher than it knows should keep showing what
it already has rather than guess: a stale screen beats a wrong one.

## Coordinate space

Every rect, in every part of the manifest, is in **canvas coordinates**,
origin top-left. The canvas is the portal's layout space, and since
2026-09-02 that is the display's **own resolution**: 1280×720 for an HD
Roku, 1920×1080 for an FHD one. The page image is exactly canvas-sized,
so it lands 1:1 on the device's plane and text is rasterised on whole
pixels. The Roku channel runs its scene at that same resolution
(manifest `ui_resolutions=fhd,hd`, sized from `GetUIResolution`), so
canvas, image and panel coincide and nothing is resampled; a scene
scaled by the firmware from a single FHD declaration smeared every
letter (2026-09-02). The geometry stays in canvas units so a client can
still scale it - `applyCanvas` (MainScene.brs) keeps a uniform stage
scale as a safety net for a canvas that does not match its scene.

Clients must read `canvas` and never assume 1920×1080.

## display.json

```
schema        contract version (see above)
canvas        { width, height } - the coordinate space above: the
              display's own resolution (e.g. 1280x720, 1920x1080). A
              ROTATED display has the two swapped (e.g. 720x1280): the
              page was rendered unrotated at that size (see rotation).
rotation      0 | 90 | 270 - degrees CLOCKWISE, as the viewer sees it,
              that the client must turn the WHOLE canvas to show it
              upright on this screen. Non-zero always comes with a
              portrait canvas. Turn everything as one unit - page image,
              overlays, effects, pointer - about the canvas centre placed
              on the screen centre; do not rotate elements individually.
              Absent means 0. (Why: the portal implements rotation as a
              CSS-rotated iframe, which a headless capture cannot see
              into; rendering the plain page portrait and turning it on
              the device keeps every rect in the portal's own space.)
updateReason  "auto" for background refreshes (startup, scheduled,
              midnight, data), "edit" when a user changed something.
              Clients use this to decide whether to show a progress
              indicator; a wall display should stay silent for "auto".
imageOnly     true when ONLY the page images changed - a calendar swipe,
              say. A client that keeps live widget layers should swap the
              image and leave them running rather than rebuilding them.
              Rebuilding restarts every animation, which reads as the
              screen freezing.
effects       display-wide decorative overlays (snow, balloons, ...),
              NOT per page - they continue across page transitions
gestures      which remote gestures the user enabled:
              { pageSwipe, calendarScroll }. Honour these; they are the
              same switches the portal obeys.
pages[]       see below
```

### pages[]

```
image         file name, relative to the asset base
imageHash     content hash of the image file (or null from old services).
              Clients MUST key their image caches on this, not on fetch
              time: unchanged pixels keep an unchanged hash, and a page
              rotation must never re-download or re-decode them. Memory
              on TV hardware is the scarcest thing this contract touches.
delaySeconds  dwell before advancing (only when autoRotate)
transition    fade | slideleft | slideright | slideup | slidedown |
              pop | rotate | flip - played when ENTERING this page
autoRotate    whether this page participates in rotation at all
overlays[]    live widgets to draw over the image (below)
targets       things that can be activated (below), or null
regions[]     areas where a gesture is live (below), or null
```

A page image may be a JPEG or a transparent PNG. When it is a PNG the
page is *layered*: something in `overlays` draws **behind** the image
(currently the rotating page background), so the client must respect
draw order rather than assuming the image is the backdrop.

### overlays[]

Each entry has a `type`, a `rect`, and type-specific fields. Types today:
`clock`, `gif`, `slideshow`, `countdown`, `background`.

These exist because the widget cannot be a still: a clock would be wrong
within a minute, a slideshow would never advance. The service extracts
the geometry, hides the element in the captured image, and the client
redraws it live.

**Animated overlays carry two representations:**

- `stripFile`, `cols`, `rows`, `frameCount`, `frameMs` — a pre-built
  sprite sheet. This exists for Roku, whose textures cap around 2048px
  and which cannot decode a GIF; the grid layout and the cap are both
  consequences of that.
- `source` (and `sourcePeriodMs` for weather icons) — the original asset
  URL. A client that can decode a GIF or animate an SVG should prefer
  this and ignore the sheet entirely.

**`scroll` overlays** — natively scrolled content (calendar cells, lists;
Roku `ScrollOverlay`). The render service photographs the cell's content
once as a tall transparent strip and the device does the motion.

- `rect` — the window, canvas px; clip to it.
- `segments` — `[{ file, h }]` strip pieces top-to-bottom, each PNG kept
  ≤ 2048px tall for the GPU. `stripFile` is the first piece, for tooling.
- `stripW`, `stripH` — the strip's size in canvas px (the PNGs are at
  output scale; draw them scaled to this).
- `fromY`, `toY` — the strip's translation relative to the window's top at
  the start and end of one loop: `+rect.h` → `-stripH`, so it enters from
  the bottom edge and leaves past the top.
- `durationMs` — one loop, linear; `loop` — repeat (default true).
- `boxes` — task checkboxes that live INSIDE the scrolling content, in
  strip coordinates: `[{ x, y, w, h, checked, kind, widgetSettingId,
  payload }]`, the same `payload` a page-level target carries. Draw each
  as a poster inside the moving strip so it travels with its row, using
  `sprites` — `{ empty, checked }`, the checkbox art files. A page-level
  `targets` entry never covers these rows (the box is blanked for the
  still), so a client that ignores `boxes` shows a scrolling list with no
  checkboxes. Aim and tick them at their CURRENT on-screen position (strip
  offset + box offset); a tick goes through the ordinary interact call
  with the payload id. Hold the strip while the pointer is over it.

Emitted only to devices whose client understands it
(`NATIVE_SCROLL_PREFIXES` in `render-service/capture.js`); every other
device receives the same cell as a `gif` sprite sheet.

Do not delete `source` when generating a sheet. An earlier version did,
which quietly made the manifest Roku-only.

**`motion`** — a natively animated weather icon (Roku `MotionOverlay`).
The icon's SVG moves its parts with three primitives and the server ships
each moving part ONCE as a transparent PNG plus exactly that motion, so
the device animates it every refresh instead of stepping a filmed sheet.
Emitted only to platforms in `NATIVE_WEATHER_PREFIXES` (capture.js) and
only for icons that decompose; everything else stays a `gif` sheet.
- `rect` — the icon box, canvas px. Every layer PNG is the whole box,
  rendered at exactly the output size; draw them all at `rect`, bottom
  to top.
- A layer that ROTATES is not shipped as a `rotation` track (2026-09-02:
  device-side bitmap rotation made thin rays pulse). It arrives as its
  own `gif` overlay - a frame sheet of the layer at 15 poses/s over its
  cycle, drawn on the pixel grid - placed in the overlay list exactly
  where the layer sits in paint order, between `motion` overlays holding
  the layers below and above it at the same `rect`. A client that draws
  overlays in list order needs nothing new. For these sheets `frameW` /
  `frameH` equal `rect.w` / `rect.h` (canvas px); stretch the sheet to
  `cols x frameW` by `rows x frameH`.
- `layers[]` — `{ file, tracks[], opacity, chain[] }`. `opacity` is the
  layer's value BEFORE its first loop (a delayed raindrop waits invisible).
  `chain` lists outer motions applied on top of the layer's own, outermost
  first — nest one transform group per level (a flake spins and fades
  inside a group that falls).
- `tracks[]` — `{ prop, cycleMs, delayMs, keys[], values[], center }`.
  `prop` is `rotation` (degrees, clockwise as the viewer sees it, about
  `center` = [x, y] px within the box), `translation` (`[[dx, dy]]` px),
  `scale` (`[[sx, sy]]` about `center`) or `opacity`. `keys` are 0..1 positions within one `cycleMs` loop and pair
  with `values`; interpolate linearly, hold the last value to the end of
  the cycle, repeat forever, and wait `delayMs` before the first loop.
- Calendar 10-day strips arrive as TWO `motion` overlays per cell: the
  strip's particles (rain, snow, hail, wind, fog, bolt) at the strip's
  rect, and the condition icon at its own smaller box. Their tracks are
  sampled from the portal's CSS animations (up to 48 keys per cycle), so
  easing is already baked into the keys.

### targets

Controls the client draws itself and can activate — task checkboxes
today.

```
items[]   { rect, checked, widgetSettingId, payload }
          payload identifies the task itself (id, taskId, projectId...).
          Match on payload.id, NOT on position: the list reshuffles as
          items complete, so coordinates go stale between renders.
sprites   { empty, checked } - pre-rendered checkbox art, a convenience
          for clients without decent vector drawing. Optional: draw your
          own if you can.
```

The client should tick optimistically on press and hold that state until
a render disagrees with it. The round trip through the portal takes a few
seconds and the press must feel instant.

### regions[]

Areas where a *gesture* is live rather than a control being pressed —
calendar swipe surfaces today.

```
{ kind: "calendar", rect, id }   id is the widgetSettingId
```

A client should make these visibly interactive when its cursor or focus
is over them. On Roku that is a drawn outline; on tvOS the focus engine
is the natural fit.

## Identity

The service manages a fleet, so **every** control request carries the
display's identity:

```
&device=RK...&major=1&minor=2336&w=1280&h=720
```

The device knows all five after pairing (`w`/`h` is its own UI
resolution, re-read each boot). Identity is not a session: there is no
handshake to lose. Any identified request can create — or, after a
service restart, resurrect — the display's worker, which is the entire
recovery story. Unknown devices are checked against the backend
(`GET mirrors/deviceId/{code}` must say `isActive`) and refused with 404
otherwise.

Requests with no identity route to the display named by the service's
`DISPLAY_*` environment, which keeps pre-identity channels working and
gives the load balancer's health check something to answer.

## Interaction endpoints

Gestures go back to the service, which replays them into a live portal
session — the portal remains the only thing that knows what a gesture
means.

```
GET /interact?type=warm&page=N&device=...
GET /interact?type=tap&page=N&x=&y=&id=&device=...
GET /interact?type=swipeup|swipedown&page=N&x=&y=&id=&device=...
```

`id` is the target's `payload.id` for a tap, the region's `id` for a
swipe. Coordinates are canvas coordinates and act only as a fallback when
the id cannot be resolved.

## Freshness

```
GET /version?device=...           -> { version, busy, assetBase }
GET /wait?since=N&busy=0|1&device=...   long-poll, answered the moment either differs
```

`version` is a **small integer** and must stay small. BrightScript's
ParseJson returns large numbers as single-precision floats — about seven
significant digits — so a 10-digit value silently rounds on the device
and consecutive versions become indistinguishable. That bug made swipes
appear to do nothing at random for a whole day. Any client parsing this
should be assumed to have similar limits.

Report the state you believe in `busy` and `since`. The server answers
immediately whenever its own differs, so a client that missed an update
while it was busy loading corrects itself on its next poll instead of
waiting for the next change.
