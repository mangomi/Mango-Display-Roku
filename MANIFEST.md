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

Every rect, in every part of the manifest, is in **canvas coordinates**:
1920×1080, origin top-left. That is the portal's layout space, not the
device's. The portal has no responsive reflow, so it is always rendered
at 1920×1080 and the *image* is scaled to the device's resolution; the
geometry stays in canvas units so a client can scale it however it likes.

A Roku running FHD happens to map 1:1. Nothing else should assume that.

## display.json

```
schema        contract version (see above)
canvas        { width, height } - the coordinate space above
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

Do not delete `source` when generating a sheet. An earlier version did,
which quietly made the manifest Roku-only.

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
