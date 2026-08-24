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
- `render-service/portal-preview/` — **TEMPORARY** vendored copy of the
  PR #68 portal files, served by request interception so this runs before
  that merges. Its README has the three-step removal.

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
| `socket` / `orientation` | REFRESH_ORIENTATION non-reload branch | orientation while rotated; the orientation-0 branch reloads, which signals as `reload` |
| `portal` / `day-rollover` | `refreshdataOnNextday` | midnight |
| `page` | `mmScreenshot.gotoPage` | only when WE step pages — fires after the swap has finished ON SCREEN (transitions included, capped 4.5s) |

No hook: `traffic` (dead code in the portal — a constant, no handler, no
template), and `clock`/`countdown`/`gif`/`steps`/`iframely`/
`browser_snapshot`/`powerbi` data pushes (first three are device-drawn;
the rest are still catch-up-only, see Open).

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

Deployed now: `PAINTED_DISPLAYS=RK569557324` (Dave's Roku Express),
`PORTAL_PREVIEW_DIR=/app/portal-preview`, `ASSET_ROOT=test`.

- Roll back to the old pipeline: clear `PAINTED_DISPLAYS`. No code change.
- Roll forward: add device ids, or `all`.
- Locally: `PAINTED_DISPLAYS=<id> PORTAL_PREVIEW_DIR=~/Projects/Mangomirror-Portal/WebContent node fleet.js`
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

## Open / next

1. **Merge PR #68**, then delete `portal-preview/`, drop
   `PORTAL_PREVIEW_DIR`, and remove the `PREVIEW_DIR` block in
   `livePortal.js`.
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
   handler deliberately SKIPS single-image widgets ("stay baked"), so
   nothing overlays them and the blocked photo leaves an empty patch.
   Either narrow the block to media an overlay will actually carry, or
   emit single-image widgets as (static) overlays too.
8. **Verify pixels means the file the MANIFEST names** (`imageFile`,
   .jpg for normal pages, .png only for layered ones). A stale
   `display_pN.png` from an older run sitting next to a fresh
   `display_pN.jpg` cost an hour of chasing a fixed bug on 2026-08-23 —
   and `publishableFiles()` still uploads such orphans. Consider pruning
   `display_p*.{png,jpg}` not named by any current manifest at publish.
