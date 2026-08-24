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
{ type: "mm-screenshot-ready", source, pageId, pageIndex,
  widgetType, widgetSettingId, drawComplete: true, seq, ts, changes: [...] }
```

Delivered three ways (postMessage to parent, `window.mmScreenshotStatus`,
DOM event) so it works embedded or top-level. `seq` strictly increases.

| `source` | Hook (mainController.js) | Fires on |
|---|---|---|
| `reload` | after `$timeout(showNextPage)` ~3610 | first load; every layout change (arrives as a widgetList push) |
| `socket` / `calendar` | after `updatedCalendarView()` returns, ~12646 | calendar data, range scrolls |
| `socket` / `weather` \| `notes` \| `quotes` \| `image` | top of each updater | that widget's data |
| `portal` / `day-rollover` | `refreshdataOnNextday` ~3174 | midnight |
| `page` | `mmScreenshot.gotoPage` | only when WE step pages |

What the service does with each (`paintedWorker.js`):

| Signal | Action |
|---|---|
| `reload` (first one after opening) | capture every page, silent — it is startup |
| `reload` (later) | capture every page, **spinner** — someone edited the layout |
| `day-rollover` | capture every page (the date is on all of them) |
| `clock`, `countdown`, `gif` | ignored — the device animates these natively |
| `page` | ignored — we asked for it; ignoring is REQUIRED (see Scars) |
| anything else | capture only `pageIndex` |

The spinner is raised ONLY for `interaction` and `layout change`. Data
arriving on its own must stay silent.

## Lifecycle (deliberate — Dave's requirement)

A live portal is a browser tab AND holds the display's socket, so it runs
only while a TV is watching:

- never opened at worker start
- opened on first device contact; reopened by any later poll
- `&launch=1` recaptures every page
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
| Swipe → published | **~1.9s** (was 15–23s before any of this work) |
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
   after the rest.
8. **Verify pixels, never logs.** Every wrong "it works" in this
   project's history came from reading service logs. Download the
   published image, composite it over a dark background (transparent PNGs
   look blank on white), and look at it.

## Open / next

1. **Merge PR #68**, then delete `portal-preview/`, drop
   `PORTAL_PREVIEW_DIR`, and remove the `PREVIEW_DIR` block in
   `livePortal.js`.
2. **Widgets with no signal yet**: chores, to-dos, news, meal plan,
   market watch, traffic, orientation/background/gesture/overlay
   settings. They reach the TV only via the 20-minute catch-up. One line
   each, same style.
3. **`pageIndex` is the page the portal is SHOWING**, not the page the
   widget lives on (read from `groups[quoteIndex]`). A widget updating on
   a non-visible page reports the wrong page. `widgetSettingId` is
   correct. Fix by searching `groups` for the widget id.
4. **Old pipeline still present** (`displayWorker.js` socket path,
   `renderPool.js`, `session.js`). Delete once painted mode is trusted
   for every display.
5. **Scaling**: one socket per display identity means one worker owns a
   display, so >1 task needs a partitioner in front. Single task today.
