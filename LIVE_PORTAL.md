# Live portal architecture — start here

Written 2026-08-24 as a handoff into a fresh session. This describes the
CURRENT architecture. Where it contradicts `HANDOFF.md`, this file wins;
`INFRA.md` is still correct for AWS/R2 facts.

## The idea in one paragraph

Roku (and tvOS next) have no web view, so a render service runs the
portal in headless Chromium, screenshots it, and the device draws native
layers on top. Until now the service **impersonated a display**: it held
the display's socket, intercepted the backend's pushes, replayed them
into inert designer-mode pages, and guessed from outside when a repaint
had landed. Every guess eventually shipped a stale screenshot — a user's
new calendar event missing from the picture, a deleted one still there.

Now the portal runs **live** (`?painted=true`): its own socket, its own
timers, its own reloads, exactly as on an Android TV. It announces when
it has finished redrawing. We listen, screenshot, publish. Nothing is
pushed into it and nothing about its internals is inferred.

## Where the code is

| Repo | Branch | State |
|---|---|---|
| `Mango-Display-Roku` | `live-portal` | not merged, DEPLOYED to the test fleet |
| `Mangomirror-Portal` | `painted-mode-roku` | **PR #68** open against `test-release-auto-deploy`, NOT merged |

Portal side is one new file plus 13 lines in `mainController.js`:

- `WebContent/js/service/paintedMode.js` — the whole mechanism. Inert
  unless `?painted=true`. Changes **no styling** (see Scars below).
- `mainController.js` — parses the flag, hands `$scope` over once, and
  calls `window.mmPaintedNotify(source, widgetType, widgetSettingId)` at
  each redraw path.

Service side:

- `render-service/livePortal.js` — opens/holds the live portal, blocks
  media the device draws, receives signals, steps pages, replays gestures.
- `render-service/paintedWorker.js` — a `DisplayWorker` subclass with the
  impersonation removed. Decides what each signal costs.
- `render-service/capture.js` — `portalFrameOf()` resolves the portal
  whether it is an iframe (old) or the page itself (painted).
- ~~`render-service/portal-preview/`~~ — the pre-merge vendored copy of
  the PR #68 portal files. RETIRED 2026-09-02: #68 is merged and deployed,
  the directory is deleted, and `PORTAL_PREVIEW_DIR` / `PORTAL_PATCH_DIR`
  are unset. The env-gated code paths in `livePortal.js` remain as
  emergency levers only.

## The signal

```js
{ type: "mm-screenshot-ready", source, pageId, pageIndex, pageIndexes,
  widgetType, widgetSettingId, drawComplete: true, seq, ts, changes: [...] }
```

Delivered three ways (postMessage to parent, `window.mmScreenshotStatus`,
DOM event) so it works embedded or top-level. `seq` strictly increases
within one document; a portal self-reload (restart-display push,
orientation) restarts it at 1 and `livePortal.onSignal` resyncs instead
of dropping the new stream.

`pageIndex`/`pageIndexes` are the pages the changed widgets LIVE on
(widget id looked up in `groups`), falling back to the visible page when
a change carries no id. `mmPaintedNotify` accepts one id or an array —
the map-keyed updaters pass `Object.keys(...)` straight through.

**THE RULE (Dave, 2026-08-23): the portal is the ONLY source of
ready-to-snapshot information.** The service adds no readiness timers, no
DOM inspection, and no screenshot passes of its own. Two portal-authored
inputs exist:

- the signal above — `drawComplete` means COMPLETE: paintedMode holds it
  (capped) until images have decoded AND no widget loading spinner
  (`*_spinnerOverlay`) is visible. A calendar range fetch shows a blurred
  "Loading" overlay for ~2.4s; a capture during it shipped that blur to
  the TV as an intermediate frame.
- `mmScreenshot.settled()` — the portal's on-demand answer ("nothing
  queued, nothing loading") that `capture.js` asks once before any
  screenshot no signal preceded (page steps, catch-up renders).

**Completion tracking (Dave, 2026-08-23): a page-level announcement is
held until that page has FULLY drawn.** Showing a page re-runs its
deferred widget inits (calendars and meal plans redraw ~600ms-2.4s after
the page appears), and each completion already reports into paintedMode —
so `reload` waits for the boot page's deferred completions and `page`
waits for the stepped-to page's (only when the step actually re-ran the
init; a no-op step has nothing to wait for). While a RELOAD waits,
EVERYTHING the portal reports is folded into that one announcement — a
reload is a fresh start and its capture-everything covers it all. The
10s gate cap is a safety valve, not timing: a widget whose completion
never comes must not mute the portal, and its late redraw still signals
normally. This replaced the service's boot quiet-window — `open()` now
just waits for the `reload` signal, which IS boot-complete (scar 7's
burst no longer reaches the service; the portal coalesces it at the
source). The one time-based thing left service-side is queueCapture's
400ms batching of several signals into one capture run — it never
decides readiness.

| `source` | Hook (mainController.js) | Fires on |
|---|---|---|
| `reload` | after `$timeout(showNextPage)`, HELD until the shown page's deferred widgets (calendars/meal plans) report drawn | first load; every layout change (arrives as a widgetList push). ONE signal per boot — boot-complete by definition |
| `socket` / `calendar` | in `initializeCalendar` after `updatedCalendarView()` | calendar AND meal-plan data (both flow through `updateCalendarData`), range scrolls |
| `socket` / `weather` \| `notes` \| `quotes` \| `image` \| `news` \| `chores` \| `todo` \| `marketwatch` | top of each updater | that widget's data |
| `socket` / `gesture` \| `overlay` | top of `updateGesture` / `updateOverlayData` | those settings |
| `socket` / `clock-setting` \| `countdown-setting` | top of `updateClock` / `updateCountDownData` | clock/countdown SETTINGS pushes (refreshClock/refreshCountDown). Distinct types on purpose: a plain `clock`/`countdown` would be filtered as a device-drawn tick, and a toggled meridiem then sat stale until the next unrelated capture (bit Dave live 2026-08-24) |
| `socket` / `orientation` | REFRESH_ORIENTATION non-reload branch | orientation while rotated; the orientation-0 branch reloads, which signals as `reload` |
| `portal` / `day-rollover` | `refreshdataOnNextday` | midnight |
| `page` | `mmScreenshot.gotoPage` | only when WE step pages — fires after the swap has finished ON SCREEN (transitions included, capped 4.5s) |

No hook: `traffic` (dead code in the portal — a constant, no handler, no
template), and `gif`/`steps`/`iframely`/`browser_snapshot`/`powerbi`
data pushes (gif is device-drawn; the rest are still catch-up-only, see
Open).

What the service does with each (`paintedWorker.js`):

| Signal | Action |
|---|---|
| `reload` (first one after opening) | capture every page, silent — it is startup (also resets `portalPage`: the portal is back on page 0) |
| `reload` (later) | capture every page, **spinner** — someone edited the layout |
| `day-rollover` | capture every page (the date is on all of them) |
| `gesture`, `overlay`, `orientation` | capture every page, silent — display-wide: targets are per page, effects come from page 0's manifest |
| `clock`, `countdown`, `gif` | ignored — the device animates these natively |
| `page` | ignored — we asked for it; ignoring is REQUIRED (see Scars) |
| first non-page signal while a dispatched gesture is in flight | THE gesture's redraw: same capture, reason `interaction` (publishes imageOnly so the TV swaps just the image — native layers, GIFs included, keep running). The gesture path takes NO capture of its own. |
| anything else | capture every page in `pageIndexes` (falls back to `pageIndex`, then to all) |

The spinner is raised ONLY for `interaction` and `layout change`. Data
arriving on its own must stay silent.

**Celebrations (2026-08-24):** the portal's canvas confetti
(check-off burst, list-complete `fireWorkConfetti`) is suppressed in
painted mode — call sites and wrappers bail on `window.mmPainted` — so
no frozen confetti is ever baked into a capture. Same for the visual
overlays: `overlayController`'s firework/bursting-hearts draw loops bail
on `mmPainted`, and `hideEffects` hides `#fireworksCanvas`/`#bsHearts`
at capture as the service-side backstop (2026-08-26: a live canvas
baked a frozen green shell into every capture — overlayController is
NOT in the vendored preview set, so until the portal deploys, the
backstop is what keeps fleet captures clean). The TV celebrates
natively instead: `InteractionLayer` emits `celebrate {kind,x,y}` on a
tick (burst at the box; finale when the whole list — todos per project,
chores per widget — is done) and `MainScene` plays sprite-sheet bursts
filmed at build time from the portal's own tsparticles presets
(`tools/generate-celebrations.js`). The same tool produces the
Fireworks / Bursting Hearts overlay sheets the render service plays via
`bundledBurstEffect` — those two overlays are no longer Roku exclusions.

## Lifecycle (deliberate — Dave's requirement)

A live portal is a browser tab AND holds the display's socket, so it runs
only while a TV is watching:

- never opened at worker start
- opened on first device contact; reopened by any later poll
- `&launch=1` recaptures every page, and raises the TV's spinner from
  that very reply until the launch render publishes (Dave, 2026-08-24:
  the app shows cached screenshots at launch — old layouts, old events —
  and the user must see it is fetching). `interacting` holds the busy
  janitor off during the portal boot, when nothing is rendering yet.
- closed after `PORTAL_IDLE_MS` (default 180s) with no poll — three
  missed long-polls means the app is gone
- the 20-minute catch-up render stays: if a signal is ever missed or the
  portal goes quiet, the display self-corrects instead of freezing

## Running it

Deployed now: `PAINTED_DISPLAYS=RK,ATV` (prefix entries — every Roku and
Apple TV), `ASSET_ROOT=test`, no portal shim env vars.

- Roll back to the old pipeline: clear `PAINTED_DISPLAYS`. No code change.
- Roll forward: add device ids, or `all`.
- Locally: `PAINTED_DISPLAYS=<id> node fleet.js` (add `PORTAL_PATCH_DIR=<dir>`
  only to try one in-flight portal file over the deployed portal)
- Deploy: zip `buildspec.yml render-service fonts` → S3 → CodeBuild →
  `aws ecs update-service --cluster roku-render --service roku-render --force-new-deployment`
  (the exact exclude list is in INFRA.md)

**Never test against `RK569557324` without asking — that is Dave's live
display.** Use `MD4454256172` (the "claude test" display, major 1 / minor
1715, 1366x928); it has two pages and no physical TV.

## Measured

| | |
|---|---|
| Swipe → published | **~3.5s** honest (the portal's own range fetch is ~2.4s of it; the earlier ~1.9s figure was publishing a frame captured DURING that fetch — the blurred loading overlay) |
| Page capture, portal already open | **300–600ms** (was 5–9s: a browser boot per page) |
| Portal open (cold) | 3.5–4.5s |
| Media per page | **37KB** (was 2400KB) — client blocks what the device draws |
| One live display | **~500MB RSS, ~0.5 vCPU idle** |

Cost follows CPU, ~2 displays per vCPU: roughly **$18/display/month on
Fargate, $7 on EC2 Graviton, $2.50 on spot**, if displays run all day.
The idle CPU is the portal's own (JS thread is 89% idle — it is painting,
not scripting). Reducing it is a portal question and is probably worth
more than any instance choice.

## Scars — things that already went wrong here

Each of these cost real debugging. Do not re-introduce them.

1. **Do not disable animations in the portal.** The portal draws the old
   and new calendar range together during a scroll and removes the old
   copy on `animationend`. With animations off that never fires: the
   calendar shows **doubled and mirrored, permanently**.
2. **Transparency is per PAGE, not per mode.** Only a page whose photo
   the device draws underneath may capture with alpha. Forcing it for all
   pages made every other page publish transparent with nothing behind
   it — black on the TV.
3. **A JPEG has no alpha.** Capturing a transparent page as JPEG flattens
   it onto white and the portal's white text (dates, greeting) vanishes.
   The page looks half-rendered when it is fully drawn and invisible.
4. **Ignore `page` signals.** `gotoPage` emits one; treating it as a
   change to capture makes the worker step pages, see the signal, and
   step again — forever.
5. **Do not raise the spinner for background data.** It has no gesture to
   point at, so it lands in the middle of the screen, and the display
   spins at people for changes they did not make.
6. **`day-rollover` is not device-drawn.** The TV draws the clock, but
   midnight also moves the calendar's today-highlight and week range,
   which are baked into the image.
7. **Capture on the signal STREAM going quiet, not the first signal.** A
   boot or layout change arrives as a burst; the calendar lands ~2.4s
   after the rest. (Since 2026-08-23 the portal solves this at the
   source: the `reload` announcement is held until the deferred widgets
   report drawn, so the burst never reaches the service — but the LESSON
   stands: a portal announcement must mean "everything", or every
   consumer re-learns this scar.)
8. **Verify pixels, never logs.** Every wrong "it works" in this
   project's history came from reading service logs. Download the
   published image, composite it over a dark background (transparent PNGs
   look blank on white), and look at it.

## Rotation (2026-09-02)

The portal implements a rotated display (`mirrorOrientation` 1 = 90°
clockwise, 2 = counter-clockwise) as `portrait.html`: a host page holding
the real page in a CSS-rotated `<iframe id="portraitFrame">`. To a
headless capture that host is an empty document - `portalFrameOf()`
picked it, every extractor found nothing, and the display went to one
page with zero overlays ("everything frozen").

So a rotated display is rendered UNROTATED: `displayWorker.applyOrientation`
swaps the geometry (canvas and output = the device's dims swapped),
`LivePortal.url()` adds `&embed=true` - the portal's own "render the
landscape page directly, never the rotation host" switch, the same flag
its iframe passes - and the manifest carries `rotation` 90/270 (MANIFEST.md).
The device turns the whole canvas once. Every handler keeps working in
the portal's coordinates; nothing is per widget. An `orientation` signal
makes `PaintedWorker.refreshOrientation` re-read the backend record,
reopen the portal if the geometry changed, and recapture every page.

## Open / next

1. ~~Merge PR #68, then delete `portal-preview/`, drop
   `PORTAL_PREVIEW_DIR`~~ DONE 2026-09-02: merged, deployed, shims deleted,
   env vars dropped (task-def rev 11). The env-gated code stays as a lever.
2. ~~Widgets with no signal yet~~ DONE 2026-08-23: news, chores, todo,
   marketwatch, gesture, overlay, orientation hooks added; meal plan was
   already covered (flows through `updateCalendarData` → the calendar
   hook); traffic is dead code in the portal (constant only, no handler,
   no template) so there is nothing to hook; background-settings pushes
   end in `refreshWidget()`, whose widgetList reply already signals as
   `reload`. Still catch-up-only: `steps`, `iframely`, `browser_snapshot`,
   `powerbi` data pushes, and `clock`/`countdown` SETTINGS pushes
   (`refreshClock`/`refreshCountDown` arrive as data but any hook would be
   eaten by the DEVICE_DRAWN ignore — needs a worker-side distinction
   between a tick and a settings change before hooking).
3. ~~`pageIndex` is the page the portal is SHOWING~~ DONE 2026-08-23:
   `paintedMode.js` resolves each change's page by widget id in `groups`
   (`pageIndexes` on the signal, one entry per pushed widget id) and the
   worker captures that union. THREE deeper page-identity bugs found and
   fixed in the same pass — all three made every multi-page painted
   display publish page 0's pixels for EVERY page (verified on
   MD4454256172, whose page 1 is just image+clock yet published page 0's
   full layout):
   - `capture.js` derived the extraction page from the URL's `page=`
     param, which painted URLs do not have → every page's manifest got
     page 0's overlays/targets/regions. Now the caller's `pageIndex` wins.
   - `mmScreenshot.gotoPage` set `quoteIndex` and nothing else, but page
     visibility/z-order are applied imperatively by `showNextPage` -
     bindings moved, the picture never did. The bridge now carries
     `showNextPage` and gotoPage calls it, exactly as the portal's own
     rotation does; the "page" signal fires only after the swap has
     visually settled (computed opacity/transform/visibility across page
     elements, stable frames, capped 4.5s — showNextPage swaps behind an
     800ms timeout and transition classes run 3s).
   - `livePortal.gotoPage` resolved on the NEXT signal of any kind, so a
     data push (or the previous step's late "page" signal) landing
     mid-fade satisfied it and the capture photographed the crossfade.
     It now waits for source `page` with the target `pageIndex`.
   Cost: a page STEP on a display whose pages have a transition class now
   genuinely waits out the 3s entrance animation (~4-5s per step);
   transition-less pages settle in ~1s. Capturing the visible page (the
   swipe path) is unaffected.
4. **Old pipeline still present** (`displayWorker.js` socket path,
   `renderPool.js`, `session.js`). Delete once painted mode is trusted
   for every display.
5. **Scaling**: one socket per display identity means one worker owns a
   display, so >1 task needs a partitioner in front. Single task today.
6. **Coalescing edge**: a data notify landing in the same 250ms debounce
   window as a page-swap notify makes the flushed signal's `source` the
   LAST change's — if that is the data one, the swap's completion signal
   is swallowed and the worker's gotoPage waits out its 15s cap before
   capturing (still correct, just slow). Rare; fix would be flushing
   `page` notifies separately.
7. **Single-image widgets are LOST in painted mode** (pre-existing, seen
   2026-08-23 on MD4454256172 page 1): `BLOCKED_MEDIA` refuses
   myimages.mangodisplay.com, which is right for slideshows and
   backgrounds the device draws from the manifest — but the slideshow
   handler deliberately SKIPPED single-image widgets ("stay baked"), so
   nothing overlaid them and the blocked photo left an empty patch.
   **FIXED 2026-08-31**: the slideshow extractor now emits widgets with
   one or more images (the device's slide timer already no-ops below
   two, so a lone photo shows statically).
8. **Verify pixels means the file the MANIFEST names** (`imageFile`,
   .jpg for normal pages, .png only for layered ones). A stale
   `display_pN.png` from an older run sitting next to a fresh
   `display_pN.jpg` cost an hour of chasing a fixed bug on 2026-08-23 —
   and `publishableFiles()` still uploads such orphans. Consider pruning
   `display_p*.{png,jpg}` not named by any current manifest at publish.

## Month-cell scrolling on painted displays (investigated 2026-09-02)

**Status: designed, not built. Awaiting Dave's go-ahead.**

The problem: month view fits only 2-3 events per cell. Other platforms
scroll the overflow; painted displays cannot (a screenshot catches it
mid-scroll), so scrolling is forced Off and users see "+2 more".

### How the portal's scrolling actually works

`WebContent/js/directives/mangoMirrorScroll.js` is a **jQuery marquee,
not a scroll container**: the inner element is positioned `relative` and
animated `top: boxHeight -> top: -innerHeight`, linear, looping.

- Speeds are derived: `totalHeight * 19`ms (Fast), `* 35`ms (Slow),
  where `totalHeight = boxHeight + innerHeight`. `Off` parks `top: 0`.
- The directive **removes itself when content fits**
  (`boxHeight >= innerHeight`), so overflowing cells are self-
  identifying - the portal has already done that measurement.
- For date cells (`attrs.date`) it excludes the first child (the date
  number) and measures `firstChild.children[1]` - the events list only.
- The wrapper classes and heights are applied BEFORE the `Off` check,
  so the structure we need exists even with scrolling disabled.

### The approach

Because `top` is a CSS property we set directly, we can film the real
marquee rather than settle for discrete pages:

1. Capture with scrolling parked (`top: 0`) and **publish immediately** -
   the user sees their events from the top within a second.
2. Deferred pass (the publish-first machinery from 2026-09-01): for each
   overflowing cell, step `top` across one cycle. All cells advance on a
   SHARED screenshot timeline - set every cell's `top` for frame k, take
   one screenshot, crop them all - so cost is ~60-90 screenshots
   (5-8s) regardless of cell count. Each cell keeps its own frame count,
   so short cells loop faster than tall ones.
3. Ship one small sheet per cell, overlaying the events area only. The
   date number and weather strip stay baked.
4. Hide the baked events ONLY for cells that got a sheet (the weather-
   icon lesson: hide-then-fail leaves a blank patch). Anything that
   fails falls back to today's static behaviour.

Likely **no device changes**: a scrolling cell is a sprite-sheet overlay
with its own frameMs, which both clients already play.

### Consequence worth remembering

If this ships, the **Scrolling option can be re-enabled for TV devices**
in the webapp (PR #142 currently forces it Off for RK/ATV, because we
could not support it). The same directive drives chores and to-do lists,
so those may gain it back too.

### Prove first

One throwaway experiment on a single cell: is a cell crop legible as a
sprite at Roku's output scale, and how does the loop seam read when
content wraps from bottom to top?
