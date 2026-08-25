# Roku exclusions — work needed outside the Roku repo

The running list of changes other people own. Nothing outside this repo
has been touched. Two kinds of item:

- **Exclusions** — options the **webapp** should hide or disable when the
  display is a Roku, so users can't pick something that will do nothing
  on screen.
- **Backend fixes** — server-side bugs found while building the Roku
  client that are worth fixing properly rather than working around here.

## How to detect a Roku display

Roku displays register with a device code prefixed **`RK`** (e.g.
`RK569557324`), the same way Samsung uses `SM` and the mobile apps use
`APP` / `AND`. The Roku app generates it as `RK` + 9 digits and registers
it via `mirrors/saveMirror`, exactly like the Tizen app.

The webapp already has prefix constants in `AppSettings`
(`DEVICE_ID_INITIALS`, `..._IOS`, `..._ANDROID`) — a `..._ROKU = 'RK'`
would slot in alongside them. The check is on the display's `deviceId`.

## Exclusions

| # | Where | Option | Setting key | Status | Why |
|---|---|---|---|---|---|
| 1 | Settings → Visual Overlays | **Fireworks & Confetti** | `firework` | ~~Confirmed — hide for RK~~ **RESOLVED 2026-08-24 — supported, do NOT exclude** | Originally excluded because per-particle physics judder in BrightScript. Solved instead by filming the portal's own tsparticles preset at build time into a sprite sheet (`tools/generate-celebrations.js`); the render service plays it as a popup effect (`bundledBurstEffect` in `nativeWidgets.js`), same path as the GIF overlays. No webapp change needed. |
| 2 | Settings → Visual Overlays | **Bursting Hearts** | `bsHeart` | ~~Confirmed — hide for RK~~ **RESOLVED 2026-08-24 — supported, do NOT exclude** | Same sprite-sheet approach as #1. |
| 3 | Widget picker (and widget settings) | **Video widget** | Iframily `contentType: "video"` | Confirmed — hide for RK | Not supported on Roku in v1 (decided 2026-08-03). YouTube and Vimeo widgets are `<iframe>` embeds, and a third-party Roku channel has no browser and no YouTube player SDK — they can never play. Direct MP4/HLS URLs *can* play natively (a prototype worked), so this may later become "allowed, but only with a direct video URL" instead of a full exclusion. Until then hiding the whole widget avoids users adding a video that silently shows nothing. |
| 4 | Widget settings (calendar, chores, todo, notes — anywhere the scroll option appears) | **Auto-scroll / scrolling content** | `mangoMirrorScroll` speed option (Off / Slow / Fast) | Confirmed — hide for RK, force "Off" | Decided 2026-08-03. The Roku shows a rendered image of the page, so a widget that scrolls its content on the web is captured as a fixed crop — anything below the fold is simply never seen, and (once interactivity ships) can't be focused or completed either. Users should size widgets so their content fits rather than relying on scroll. Confirmed live 2026-08-04: a to-do widget with 30 tasks laid out rows down to y=1632 on a 1080-high canvas; only the 18 inside the widget's visible box are rendered or reachable. |
| 5 | Settings → Touch, Mouse or TV Remote control | **View event details on calendar** | `touch_calendar_read` | Confirmed — hide for RK | Decided 2026-08-04. Opens a details modal in the portal. The Roku screen is a rendered image plus native overlays, so a modal only exists if we re-render the page with it open, keep that modal state alive across every later render, and add a way to dismiss it. That is a whole second interaction mode for a read-only popup. |
| 6 | Settings → Touch, Mouse or TV Remote control | **View meal recipe details** | `touch_mealplan_read` | Confirmed — hide for RK | Same as #5 — a details modal. |
| 7 | Settings → Touch, Mouse or TV Remote control | **Family member rewards / transactions in Chores** | `touch_chores_family_access` | Confirmed — hide for RK | Same modal problem as #5, and this one is transactional (redeeming rewards), so a half-working version on a TV is worse than none. |
| 8 | Settings → Touch, Mouse or TV Remote control | **Add or edit tasks (to-do widget)** | `touch_todo_edit` | Confirmed — hide for RK | Decided 2026-08-04. Editing needs text entry. Roku has no web view and no usable text input for this — it would mean an on-screen keyboard driven through the render service, round-tripping a screenshot per keystroke. Completing a task is supported (#K3 below); creating and editing are not. |
| 9 | Settings → Touch, Mouse or TV Remote control | **Add or edit events (calendar widget)** | `touch_calendar_edit` | Confirmed — hide for RK | Same as #8 — event creation needs text, date pickers and account selection. |
| 10 | Settings → Touch, Mouse or TV Remote control | **Edit notes widget content** | `touch_note_edit` | Confirmed — hide for RK | Same as #8. Currently only shown in Touch mode, so nothing is visible on a TV today — listed so it stays hidden for RK if it is ever offered in TV mode. |

**The whole "Modify" group is excluded for Roku** (#8, #9, #10 — every
option under that heading). Nothing on a Roku display can be edited from
the TV; the supported interactions are limited to navigating and ticking
things off.

### Interactivity: what Roku *does* support

The gesture panel already has a **TV Remote Control** mode (`TV_flag`);
for an `RK` display that mode should be forced — "Touch & Mouse Control"
can't apply to a Roku. Within TV mode, exactly four options should
remain, and the other five (#5–#9 above) hidden:

| | Option | Setting key | State |
|---|---|---|---|
| K1 | Double click left/right to turn pages | `touch_page_swipe` | To build — device-side only |
| K2 | Pointer over calendar + double click up/down for more dates | `touch_calendar_scroll` | To build — needs the render service |
| K3 | Pointer over checkbox + select to complete a **chore** | `touch_chores_complete` | **Working**, verified on device |
| K4 | Pointer over checkbox + select to complete a **to-do** | `touch_todo_complete` | **Working**, verified on device (incl. sub-tasks); screen refresh blocked on backend fix B1 |

One option needs no action either way: *tap and hold to pause page
rotation* (`touch_page_hold`) is already hidden when `TV_flag` is true.

## Backend fixes needed

### B1 — To-do status updates don't broadcast `refreshLayout` (chores do)

**Status:** open, confirmed 2026-08-04. Fix agreed for the **backend**; a
render-service workaround was explicitly declined, so please don't add
one here.

**Symptom.** Checking off a to-do from a display saves correctly, but
nothing tells the display to refresh. Checking off a chore does.

**Evidence** (A/B on one live display socket, minutes apart, socket
verified connected throughout):

| Action | Socket push | Re-render |
|---|---|---|
| 6 to-do completions | none | none |
| 1 chore completion | `refreshLayout` in ~1.5 s | started ~2.5 s later |

Both go through the same portal call — `PUT` to
`MANGO_MIRROR_CONSTANT.todoStatusUpdate`, from the one
`$scope.updateTaskStatus` handler (`mainController.js` ~12463) — with the
same payload shape. Only the `widgetType` argument differs (`'todo'` vs
`'chores'`), so the divergence is server-side: whatever emits the socket
broadcast on a chores status update isn't firing for to-dos.

**Impact.** Not Roku-specific. Anything driven by the display socket —
the webapp's own live view and every other display type — should be
equally stale after a to-do is checked off. On Roku the checkbox itself
is drawn natively and holds its state, so only the rest of the row is
affected: strikethrough, the row's position in the list, and project
counts stay stale until the next scheduled render (up to 20 min) or an
unrelated change.

**Wanted.** Emit the same broadcast for to-do status updates (including
sub-tasks) that chores already emit.

## Candidates (not decided — raise before implementing)

| Where | Option | Setting key | Note |
|---|---|---|---|
| — | **Night mode** | `nightMode` | **Probably NOT an exclusion — needs one live check.** The portal covers the screen with a solid-black fullscreen element plus a "Night mode" badge; headless Chrome paints that fine (the `<video>` there is largely a keep-awake hack for browser devices, which Roku doesn't need), so the render itself works. The open question is whether the backend swaps the layout for night mode or just flags it over the existing one. If it swaps the layout, nothing to do. If the widgets stay in the layout, the Roku's native overlays (clock, countdown, stickers, effects) would keep drawing on top of the black screen, and the render service needs to pass a `nightMode` flag so the app can suppress its overlay and effect layers (~20 lines both sides). Settle it by running one render while night mode is active and checking whether the manifest still lists overlays. |
| — | ~~Touch / gesture options~~ | `gesture.*` | **Resolved 2026-08-04** — superseded by exclusions #5–#10 and the supported-interactions table above. The gesture panel *is* relevant to Roku, but only in TV Remote mode and only for the four options listed there. |

## Things that are NOT excluded

Worth stating explicitly, since these were all in doubt at some point and
now work natively on Roku: floating balloons, flowing hearts, falling
leaves, falling snowflakes, colourful string lights, flying Santa,
disappearing elf, scary pop-ups, and the flying witch set (witch, bats,
crawling spiders and the spiders that drop on threads). Animated GIF and
sticker widgets, animated weather icons, photo slideshows, page
background slideshows, the clock and the countdown all work too.

Since 2026-08-24 the **Fireworks & Confetti** and **Bursting Hearts**
overlays work as well (former exclusions #1/#2 — build-time sprite
sheets, see the table). The TV also celebrates task check-offs natively:
a confetti burst on the ticked box, and the portal's full-screen finale
when a list completes — the painted portal suppresses its own canvas
confetti so none of it is ever frozen into a screenshot.
