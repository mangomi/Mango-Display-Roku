# Echo Show ↔ Roku parity

The Alexa skill is the third thin client of the render service, after the
Roku channel and the Apple TV app (`ECHO_SHOW.md` for the design, deploy and
tests). This file tracks what of the Roku client it does yet. Goal: on par
with Roku (Dave, 2026-10-27).

**Roku reference point: `42e9379`** (branch `live-portal`), the latest
channel commit when this tracker started.

## Porting workflow (same as tvos/PARITY.md)

1. Read this file.
2. `git log 42e9379..HEAD -- components/ source/ images/ fonts/ manifest`
   lists Roku-side changes since the reference point.
3. Port the behavioral ones; skip Roku-only mechanics (texture-cap
   packing, the keep-alive video, registry plumbing). The commit messages
   are the spec.
4. Move the hash above when caught up.

## How the Echo differs (by platform, not by choice)

- **No code on the device.** Every behavior is either an APL document the
  Echo runs on its own (clock ticks, animations, touch feedback) or a
  request back to the skill's Lambda (pairing, updates, interactions).
- **No long-poll.** A screen-locked heartbeat asks `/version` every 10s
  (pairing: every 5s); the heartbeat is also what keeps the screen awake.
- **Touch instead of a remote.** The Roku's pointer + OK becomes a direct
  tap at the same canvas point; no pointer is drawn.
- **No custom fonts in APL.** Overlay text uses the Echo's font at the
  measured size.
- **Portrait is native.** An Echo Show 15 on its side reports a portrait
  viewport; the manifest's `rotation` is ignored (the Echo is already
  upright).

## Status

| Roku feature | Echo | Notes |
|---|---|---|
| Device code + pairing screen | done | `ET` + 9 digits from the Alexa device + user ids; re-enabling the skill rerolls |
| "Connected / Loading your display..." | done | |
| Display updates (calendar edits, layouts) | done | ≤10s; verified on hardware 2026-10-27 |
| Unpaired in webapp → pairing screen | done | not yet seen on hardware |
| Stay awake | in test | screenLock heartbeat; overnight run from 2026-10-27 13:48 |
| Page image, canvas scaling | done | verified portrait, Echo Show 15; same-layout updates cross-fade in place (no full-screen redraw) |
| Page background (`background`) | built | cycles every photo on intervalSeconds with its transition, no empty frame; Unsplash at screen size |
| Clock | done | verified on hardware |
| Countdown | built | ticks on the Echo from utcTime, one second ahead like the Roku |
| Touch: checkbox taps (targets → `/interact`) | built | instant tick, held until a render agrees; awaiting hardware test |
| Touch: calendar swipes (regions) | built | honours `gestures.calendarScroll`; awaiting hardware test |
| Touch: page swipes left/right | built | horizontal swipe anywhere (and on calendars) when pageSwipe is allowed |
| Page rotation + transitions | built | Roku dwell rules, entering page's transition 3s inOutCubic; touch restarts the dwell; verified rotating on hardware |
| GIF overlays (sprite sheets) | built | one frame through a window, stepped by a tick handler |
| Slideshows | built | same module as backgrounds |
| Motion weather icons | built | keyframes as path() easings |
| Scrolling lists (`scroll`) | built | checkboxes inside tick, held and updated in place |
| Effects (particles, sprite movers, popups, droppers) | built | all eight Roku types, as layouts; checkbox celebrations on (test: CELEBRATION_URL) |
| Night mode | built | black screen + the moving badge (a motion overlay) |
| Busy spinner | built | the Roku art and rules: Connected screen, service busy (75s watchdog), calendar swipe |
| Fonts | won't match | APL has no custom fonts; option: server-rendered glyphs |

## Parity audit 2026-10-28 (Roku session)

Fixed (Echo now does what the Roku does):
- one calendar swipe in flight, freed when its imageOnly render lands or
  after 8s (was a 1.2s debounce);
- unconfirmed checkbox presses held 180s (was 30s);
- slideshows and backgrounds resume at the next photo after a whole new
  screen (per widgetSettingId + page, reported with every refresh/touch);
- scroll-strip checkboxes celebrate and count toward their list's finale;
- a render-service 404 sends the Echo to pairing only when the backend
  agrees the claim is gone (the fleet answers 404 during hand-over);
- a manifest with no pages keeps the screen; in-place updates restart
  the dwell; delaySeconds 0-2 clamp to 3s; no imageHash -> version tag;
- a screen built busy arms the 75s spinner watchdog.

Kept different, on purpose or by APL:
- **Rebuild scope**: any layout change replaces the whole document
  (every page's GIFs, slideshows and effects restart); the Roku rebuilds
  only the current page's overlays. Slideshow resume removes the worst of
  it; effects restart is accepted for now.
- **Swipe spinner** shows at once on the Echo (Dave, 2026-10-27); the Roku
  waits for the server's busy.
- **No `warm` interact**: the Echo has no pointer appearing; the first
  touch pays the cold-session cost.
- **Brightness** dims the page colour around a contain-fit photo too (one
  black layer over the rect); the Roku dims only the photo.
- **Background with one photo** draws a still (the Roku draws nothing);
  matches the build-7 one-image client change.
- **First photo** shows at once (no fade-in): Image onLoad is unreliable on
  the Echo.
- **Effects** loop one seeded path per document instead of re-randomising
  each trip; popups last a little longer; particles capped 16 (10 small),
  droppers 8 (5) - document size and APL's command model.
- **Z-order**: effects fly over the checkbox ticks (ticks live in the page
  layers); the Roku draws ticks on top. Cosmetic.
- **Strip boxes** need both sprites (the service always sends both).
- **Bold** applied whenever the element is bold (closer to the portal).
- **Pairing** re-posts saveMirror every 5s while unregistered (Roku once
  per run); harmless to the backend.
- Production needs `CELEBRATION_URL` set on the prod Lambda
  (.../prod/celebrations/burst.png) once the service publishes it there.
