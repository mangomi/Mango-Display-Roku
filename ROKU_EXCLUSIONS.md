# Roku exclusions — webapp changes needed

Notes for the **webapp** developer. Nothing in the webapp has been
changed; this is the running list of options that should be hidden or
disabled when the display is a Roku, so users can't pick something that
will do nothing on screen.

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
| 1 | Settings → Visual Overlays | **Fireworks & Confetti** | `firework` | Confirmed — hide for RK | Per-particle burst physics (rockets, ~100 sparks with gravity/drag, confetti tumble). Roku's animation system is declarative — paths are described up front — so this needs a per-frame simulation in BrightScript on low-end hardware. Judders badly at exactly the moment it should impress. Decided 2026-08-03: not worth it for v1. |
| 2 | Settings → Visual Overlays | **Bursting Hearts** | `bsHeart` | Confirmed — hide for RK | Same reason: a heart grows, pops and shatters into ~15 smaller hearts on individual trajectories. Per-frame physics, same cost/benefit. |
| 3 | Widget picker (and widget settings) | **Video widget** | Iframily `contentType: "video"` | Confirmed — hide for RK | Not supported on Roku in v1 (decided 2026-08-03). YouTube and Vimeo widgets are `<iframe>` embeds, and a third-party Roku channel has no browser and no YouTube player SDK — they can never play. Direct MP4/HLS URLs *can* play natively (a prototype worked), so this may later become "allowed, but only with a direct video URL" instead of a full exclusion. Until then hiding the whole widget avoids users adding a video that silently shows nothing. |

## Candidates (not decided — raise before implementing)

| Where | Option | Setting key | Note |
|---|---|---|---|
| — | **Night mode** | `nightMode` | **Probably NOT an exclusion — needs one live check.** The portal covers the screen with a solid-black fullscreen element plus a "Night mode" badge; headless Chrome paints that fine (the `<video>` there is largely a keep-awake hack for browser devices, which Roku doesn't need), so the render itself works. The open question is whether the backend swaps the layout for night mode or just flags it over the existing one. If it swaps the layout, nothing to do. If the widgets stay in the layout, the Roku's native overlays (clock, countdown, stickers, effects) would keep drawing on top of the black screen, and the render service needs to pass a `nightMode` flag so the app can suppress its overlay and effect layers (~20 lines both sides). Settle it by running one render while night mode is active and checking whether the manifest still lists overlays. |
| Settings | **Touch / gesture options** | `gesture.*` | Roku has no touch input and the display-side editing modals aren't reachable. Harmless if left visible, but the options do nothing on a Roku display. |

## Things that are NOT excluded

Worth stating explicitly, since these were all in doubt at some point and
now work natively on Roku: floating balloons, flowing hearts, falling
leaves, falling snowflakes, colourful string lights, flying Santa,
disappearing elf, scary pop-ups, and the flying witch set (witch, bats,
crawling spiders and the spiders that drop on threads). Animated GIF and
sticker widgets, animated weather icons, photo slideshows, page
background slideshows, the clock and the countdown all work too.
