# Portal → host signal: `mm-screenshot-ready`

**HISTORICAL — this proposal has since been implemented** as
`WebContent/js/service/paintedMode.js` on the portal's `painted-mode-roku`
branch (PR #68), with a different shape than sketched here: the mechanism
lives in its own file behind `?painted=true`, and the signal carries
`source`/`widgetType`/`widgetSettingId`/`pageIndexes` instead of a
free-form reason. See `LIVE_PORTAL.md` for the current contract.

## Why

Mango Display on Roku (and tvOS next) cannot run the portal: those
platforms have no web view. Instead a render service loads the portal in
headless Chromium, screenshots each page, and the TV draws that image
with native widgets on top.

That means **a screenshot is only correct if the portal has finished
redrawing.** Today the portal announces readiness exactly once, at first
load — `mainController.js:3482`:

```js
window.parent.postMessage({ type: "mm-designer-ready" }, "*");
```

After that we are blind. When a socket update arrives we have to *guess*
when the portal is done, and every guess has failed in production:

- A calendar update assigns its data and re-binds immediately, but the
  real redraw runs ~2.4s later (`updateCalendarData` → `$timeout 2000` →
  `initializeCalendar` → `$timeout 400` → `updatedCalendarView`). Any
  "has it changed / has it gone quiet" test is satisfied inside that gap.
- Result seen by a real user: they add a calendar event, the push
  arrives, the service captures, publishes — and the event is not in the
  picture. It appears up to 20 minutes later when a scheduled render
  happens to rebuild the page from scratch.

The fix belongs in the portal, because **only the portal knows when the
portal is finished.**

## What to implement

One event, emitted whenever the portal reaches a stable, fully painted
state — no matter what caused it.

```js
window.parent.postMessage({
  type: "mm-screenshot-ready",
  reason: "socket:refreshCalenderData",  // free-form, see below
  seq: 7,                                 // increments every time
  ts: Date.now(),
}, "*");
```

Plus the same information on the window, so a host that missed an event
can still poll:

```js
window.mmScreenshotReady = { seq: 7, reason: "...", ts: 1234567890 };
```

And — optional but valuable — the matching "I have started changing"
event, so the host never captures mid-cycle:

```js
window.parent.postMessage({ type: "mm-screenshot-pending", reason, ts }, "*");
```

### Rules

1. **Fire after the DOM is painted, not when the data lands.** The end of
   the deferred chain, not the start. Reuse the image-wait helper that
   already guards `mm-designer-ready` (`mainController.js:~3484`) — it
   waits for `<img>` tags *and* CSS background layers, capped so a broken
   image cannot stall it. That helper is exactly right and should be
   shared.
2. **Debounce ~150–250ms.** A burst of widget updates in one socket
   message must produce ONE ready event, not five.
3. **`seq` must strictly increase** for the life of the page. It is how
   the host knows "a new settled state exists" without comparing content.
4. **Guard it like the existing signal.** Only meaningful when embedded
   (`window.parent !== window`); harmless otherwise.
5. **Fire on first load too** — alongside or instead of
   `mm-designer-ready`, so one mechanism covers every case. Please keep
   `mm-designer-ready` firing as well until we have migrated.

## Where to call it

`WebContent/js/controller/mainController.js`, line numbers as of
2026-08-16. Each is the completion of a redraw path:

| # | Call site | Line | Reason string |
|---|---|---|---|
| 1 | end of `updatedCalendarView` (final calendar paint) | 12580 | `socket:refreshCalenderData` |
| 2 | end of `updateNotes` (after its `resizeNotes` timeout) | 4965 | `socket:refreshNotes` |
| 3 | end of `updateQuotes` | 5012 | `socket:refreshQuotes` |
| 4 | end of `updateWeatherData` | 4323 | `socket:refreshWeather` |
| 5 | end of `updateClock` | 5055 | `socket:refreshClock` |
| 6 | end of `updateImageWidgetData` | 4279 | `socket:refreshImageWidgetData` |
| 7 | end of `loadInitialWidgetSetting` (full widget list / layout applied) | 3074 | `layout` |
| 8 | end of `refreshWidget` | 4163 | `layout:refreshWidget` |
| 9 | end of `refreshdataOnNextday` (the midnight/day-rollover refresh) | 3033 | `scheduled:nextday` |
| 10 | end of `updateGesture` / `updateOverlayData` | 16087 / 16092 | `settings` |
| 11 | after an orientation or background-setting change repaints | — | `settings:orientation` / `settings:background` |
| 12 | first load, where `mm-designer-ready` fires today | 3482 | `initial-load` |

Anything else that visibly changes the page should call it too — the
list above is what we can see from outside, and the rule is simply: **if
the user would see it change, the host needs to know it settled.**

### Suggested implementation

```js
// one helper, near the existing designer-ready code
var mmSeq = 0, mmTimer = null;
$scope.markScreenshotReady = function (reason) {
  if (window.parent === window) return;
  window.parent.postMessage({ type: "mm-screenshot-pending", reason: reason, ts: Date.now() }, "*");
  if (mmTimer) clearTimeout(mmTimer);
  mmTimer = setTimeout(function () {
    // reuse the existing image/background wait that guards
    // mm-designer-ready, then:
    mmSeq++;
    window.mmScreenshotReady = { seq: mmSeq, reason: reason, ts: Date.now() };
    window.parent.postMessage(
      { type: "mm-screenshot-ready", reason: reason, seq: mmSeq, ts: Date.now() }, "*");
  }, 200);
};
```

Then one line at the end of each path above:
`$scope.markScreenshotReady("socket:refreshCalenderData");`

## What we do with it

Once this exists, the render service stops guessing entirely:

- **Any update** — socket, layout, scheduled, self-initiated — we wait
  for `seq` to advance, then capture. One rule for every widget type,
  including ones written after this.
- **Portal-initiated refreshes** (midnight rollover, the portal's own
  timers) reach the TV automatically. Today we do not even know they
  happened.
- **Remote gestures** (a swipe on a calendar) get much simpler: the TV
  sends the gesture, we replay it into the portal, and wait for the same
  signal. We can delete the machinery that currently intercepts the
  backend's socket reply to work out when a swipe finished.
- **First load** is covered by the same path, so a display is in sync
  from the moment it starts.

## Notes / non-requirements

- No new endpoints, no backend change: this is a `postMessage` between
  the portal and the page embedding it.
- No behaviour change for normal (non-embedded) portal users — the guard
  in rule 4 makes it a no-op there.
- Firing too often is safe (we debounce and compare `seq`). Firing too
  *rarely*, or before the paint, is what breaks displays.
