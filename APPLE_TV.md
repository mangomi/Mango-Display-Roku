# Apple TV (tvOS) port — investigation & plan

**Status: investigation only. No code exists yet. Nothing here is built.**

Dave's directive (2026-08-26): port the Roku thin-client approach to
Apple TV **reusing everything server-side** — same render fleet, same
DNS names, same `/wait` + `/interact` contract, same R2 assets, same
manifests. The only backend-visible difference is a new device-code
prefix (**`ATV`** — confirmed by Dave 2026-08-26). This document is
the starting context for the session that builds it.

Read alongside: `LIVE_PORTAL.md` (server architecture — start there),
`MANIFEST.md` (the manifest schema), `NATIVE_WIDGETS.md` (overlay
extraction), `ROKU_EXCLUSIONS.md` (webapp option gating — applies to
any painted TV, not just Roku), `INFRA.md` (deploy runbook).

---

## 1. What exists today (the part that does NOT change)

The device is a dumb terminal. The render service (ECS `roku-render`,
`render-service/` in this repo) runs the user's live portal in headless
Chromium, captures page screenshots, extracts "native widget" manifests
(clock, countdown, effects, tap targets…), uploads everything to R2,
and answers device long-polls. **None of that is Roku-specific.** The
painted-mode gate is a plain device-id list (`PAINTED_DISPLAYS` env,
`fleet.js:182`) — no prefix logic — so an Apple TV device id works
against the deployed test fleet today by adding its id to that list.
No new fleet, no new DNS, no service code changes for a spike.

### The device contract (what a tvOS client must implement)

Environment (compiled into the Roku build by `package.sh`; tvOS should
mirror the pattern — test endpoints by default, prod by build flag):

- test: `apiBase https://testapi.mangomirror.com/v1.0.5/`,
  `setupHost testapp.mangodisplay.com`,
  `controlBase https://roku-control-test.mangodisplay.com`
- prod: `api.mangomirror.com/v1.0.5/` (API version decided 2026-08-26),
  `app.mangodisplay.com`, `roku-control.mangodisplay.com` (DNS does not
  exist yet — part of prod-fleet standup, shared with Roku).

Flow (Roku reference files in parentheses):

1. **Registration/pairing** (`components/PairingTask.brs`): generate
   `ATV` + 9 digits once, persist forever; register via the backend's
   `mirrors/saveMirror` exactly like Tizen/Roku; show the pairing screen
   (logo, "Display Device Code", the code, "go to {setupHost}" line)
   until the webapp claims it. Persist in **Keychain**, not
   UserDefaults, so the identity survives app reinstalls (Roku uses
   `roRegistrySection "mangodisplay"`, `MainScene.brs:101`).
2. **Long-poll** (`components/VersionTask.brs`):
   `GET {controlBase}/wait?since=N&busy=B&mem=M[&launch=1&lastexit=..&lastexitat=..]&id=..&major=..&minor=..&w=..&h=..`
   Held open until the display version exceeds N. Reply carries
   `{version, busy, assetBase, manifest, pages…}` (`display.json`).
   `launch=1` on a genuine app launch makes the service recapture
   everything and raise the busy spinner from that very reply (cached
   images may be stale). Fallback refresh timer at 60s for when the
   poll cannot connect.
3. **Pages** (`components/MainScene.brs`): A/B buffered slots — each
   slot = page image (JPEG/PNG from `assetBase`) + that page's native
   overlays, swapped as a unit (instant for refreshes, animated for
   page turns). Page rotation per `delaySeconds` from display.json.
   `imageOnly` manifests swap just the image (interaction renders) so
   native layers keep running.
4. **Native overlays** (`components/overlays/`): Clock and Countdown
   (server sends *values + format tables*, localized server-side — the
   client only composes strings and picks fonts; see `ClockOverlay.brs`
   and the fonts note below), GifOverlay (sprite-sheet strips),
   SlideshowOverlay, page background layers.
5. **Effects** (`components/effects/`, registry in `MainScene.brs:55`):
   `balloons/snow/leaves/hearts → ParticleEffect` (config-driven
   spawner: sizeRange, speedRange, sine drift, fade-in),
   `spritesheet → GifOverlay`, `spritemover → SpriteMover` (Santa,
   witch…), `popup → PopupEffect` (elf, scary, fireworks, bursting
   hearts — plays sheet grids at random positions; dwell = exact
   playthrough multiples), `dropper → DropperEffect` (thread spiders),
   string lights. All art arrives as pre-rendered PNG sprite sheets in
   the manifest (`stripFile`, frameW/H, cols, rows, frameCount,
   frameMs) resolved against `assetBase`. **Sheets port 1:1.**
6. **Interactivity** (`components/InteractionLayer.brs`): remote-driven
   pointer (appears center on OK, arrows nudge 10px / glide 250px/s,
   15s hide), highlight box over targets, checkbox targets from the
   manifest (checkbox-only rects + 12px pad), optimistic tick with
   local override until the portal render agrees, double-click arrows =
   page turn / calendar swipe (gesture availability from display.json
   `gestures`), one-swipe-at-a-time lock released by the swipe's own
   manifest. Actions:
   `GET {controlBase}/interact?type=tap|swipeup|swipedown|warm&page=..&x=..&y=..&id=..{identity}`.
7. **Celebrations** (`components/effects/CelebrationBurst.*`,
   `source/celebrationMap.brs`): a bundled confetti burst sheet plays
   at the ticked box; full-display 7-burst finale when a list
   completes (todos grouped per project, chores per widget). The sheet
   (`images/celebrations/burst.png`) is generated by
   `tools/generate-celebrations.js`; **the map file is emitted as
   BrightScript — the generator needs a ~5-line change to also emit
   JSON for tvOS.**
8. **Spinners**: launch spinner over stale cached pages; busy spinner
   centered (or at `busyAt` for gestures) while a user edit renders;
   75s watchdog forces it off.
9. **Exit reporting**: Roku reports the previous exit reason on next
   launch (`&lastexit=`). tvOS has no equivalent API — see §3.

### Fonts

The portal offers ~60 Google Fonts (regular weight only, by design —
Dave 2026-08-24). Roku bundles TTFs fetched by
`tools/fetch-roku-fonts.sh` into `fonts/gf/` with a family→file map
(`source/fontMap.brs`). tvOS: bundle the same TTFs (OFL-licensed —
embedding in apps is fine, keep the license file) and register them at
launch; fall back to Source Sans Pro / system when a family is missing.
The generator's map could emit JSON for tvOS the same way as the
celebrations map.

---

## 2. Why the same architecture is right on tvOS

**tvOS has no WKWebView / no WebKit.** Same constraint that forced the
Roku screenshot architecture (TVML/TVMLKit is deprecated and was never
a general browser). So the thin-client + server-rendered-pages model is
exactly as necessary on Apple TV as on Roku — this is not a compromise
port, it is the correct architecture for the platform.

Hardware is dramatically better than a Roku Express (A8 in the 2015
Apple TV HD is already faster; A12/A15 in 4K models are phones-class).
Nothing we render will stress it.

---

## 3. Similar vs different

| Area | Roku (built) | tvOS (to build) |
|---|---|---|
| Server/fleet/DNS/R2 | roku-render ECS + roku-control(-test) | **identical — zero changes** (add device id to `PAINTED_DISPLAYS` for testing) |
| Device contract | /wait, /interact, display.json, manifests | **identical** |
| Language/UI | BrightScript + SceneGraph XML | Swift + SwiftUI/UIKit (SpriteKit optional for effects) |
| Tooling | sideload zip to real device; telnet logs; no simulator | Xcode; **tvOS Simulator on this Mac** (fast loop; the iOS-simulator MCP panel may drive it — verify); real device via USB-C/network pairing |
| Keep-alive | **The 2h `EXIT_IDLE_AUTO_EXIT` hack**: muted looping Video as FIRST scene child (see MainScene.xml comment — placement is load-bearing) | **Not needed.** `UIApplication.shared.isIdleTimerDisabled = true` is a documented API that prevents idle sleep while foreground. Delete the whole concern. Residual: user's own "Sleep After" HDMI-CEC/TV settings, same as Roku |
| Exit reason | `roAppManager.GetLastExitInfo()` (OS 13+) → `&lastexit=` | No API. Use lifecycle notifications (`didEnterBackground`, `willTerminate` — not guaranteed) + **MetricKit** crash/hang diagnostics; service infers silence from missed polls as today |
| Pointer input | Arrow-key nudge/glide (10px steps, 250px/s hold) | **Better**: Siri Remote trackpad via `GCMicroGamepad` gives analog deltas — a real gliding pointer. Keep the same reveal-on-click, 15s-hide, highlight semantics. Native swipe gestures can drive page turns/calendar swipes (nicer than double-tap-arrow) |
| Focus engine | n/a (custom pointer) | tvOS apps normally use the focus engine; we bypass it (full-screen canvas + custom pointer). Allowed — games do this. Must still handle **Menu/Back** correctly (App Review checks: Menu at top level must return to the tvOS home screen — default behavior, don't swallow it) |
| Sprite playback | Poster + clip-group frame stepping (transform-after-clip trap, see PopupEffect.brs header) | `CALayer.contentsRect` frame stepping or SpriteKit texture atlas — no clip/transform trap. Same sheets, same JSON metas. (Later option: real particle systems via CAEmitterLayer/SpriteKit replacing sheets — do NOT do this in v1; sheets keep one art pipeline for both platforms) |
| Texture limits | 2048×2048 sheet cap (why generator packs to it) | Comfortably 4096+; keep 2048 sheets shared |
| Persistence | roRegistry | Keychain (survives reinstall) for identity; UserDefaults for the rest |
| Fonts | Bundled TTFs + fontMap.brs | Same TTFs, `CTFontManagerRegisterFontsForURL` at launch, JSON map |
| Device code | `RK` + 9 digits | `ATV` + 9 digits (confirmed) |
| Env switch | package.sh test/prod regenerating env.brs | Xcode build configurations (Debug/TestFlight→test, Release→prod) or an xcconfig flag — same "test by default, prod is deliberate" posture |
| Auto-launch on boot | Not possible | Not possible (same). Enterprise/signage option unique to Apple: **single-app mode via MDM/Apple Configurator** pins the device to one app — worth mentioning to signage customers |
| Store fee | Free | **$99/yr Apple Developer Program** (already paid — the iOS app ships from this account) |
| Beta | Beta channels: 20 users, 120-day hard expiry, no review | **TestFlight**: internal 100 testers instantly, external up to 10,000 (light review), builds expire 90 days. Much better |
| Review | Roku certification (~weeks) | App Review (typically 1–3 days). Guidelines to mind: **4.2** minimum functionality (fine — real product category, the iOS app is precedent), **3.1.1** no external-purchase steering (pairing copy stays activation-only, same rule as Roku), **5.1.1** account-based apps (device companion — fine), **Sign in with Apple NOT required** (no third-party login in the app; pairing code only), privacy **nutrition labels** in App Store Connect + privacy policy URL |
| Store assets | Posters + splash | **Layered parallax app icon** (required), top-shelf image, tvOS screenshots — different art tasks |
| Update mechanics | Store review per channel update; thin client makes them rare | Same story: App Review per binary update, auto-updates on users' devices; fleet ships everything else |

## 4. Backend / webapp deltas (small, shared with the RK rollout)

- **Prefix**: **`ATV` — decided and confirmed free by Dave
  (2026-08-26).** Webapp `AppSettings`
  (`src/app/service/app.settings.ts`) today has `MD` / `APP` (iOS) /
  `AND` (Android); `RK` is pending per ROKU_EXCLUSIONS.md; an
  `..._APPLETV = 'ATV'` constant slots in alongside them.
- **Exclusions**: everything in ROKU_EXCLUSIONS.md is a *painted TV*
  constraint, not a Roku constraint (no scroll, no modals, no text
  entry, TV-remote gesture set, video widget undecided). The webapp
  gating being built for `RK` should key on a device-class check that
  includes `ATV` from day one.
- **saveMirror / claim / portal**: no changes — the device registers
  and pairs exactly like Roku.
- **Painted gating**: add the ATV test device id to `PAINTED_DISPLAYS`
  (env change on the task definition, not code).

## 5. Genuinely new work (the tvOS client itself)

Swift reimplementation of the Roku components, in rough build order:

1. Project setup, env config, Keychain identity, `ATV` code gen.
2. Pairing screen + `saveMirror` + claim polling (`PairingTask` parity).
3. `/wait` long-poll loop + display.json handling + A/B page slots +
   rotation + launch spinner (`VersionTask` + `MainScene` core).
4. Clock + Countdown overlays (value composition, fonts).
5. Effects players: particle, popup, dropper, sprite-mover, gif strips,
   slideshow, string lights (one shared sheet-player primitive goes a
   long way — `CALayer.contentsRect` stepping).
6. Interaction layer: trackpad pointer, targets, optimistic ticks,
   `/interact`, gestures, busy-at spinner.
7. Celebrations (burst + finale) — needs the generator's JSON-map tweak.
8. `isIdleTimerDisabled`, lifecycle/session reporting, memory pressure
   handler (`didReceiveMemoryWarning` → report `mem=` like Roku does).
9. Store prep: layered icon, top shelf, screenshots, nutrition labels,
   TestFlight, review.

Estimate context: the Roku client was built from scratch inside ~3
weeks of sessions *while also building the render service*. The tvOS
client reuses the service untouched, has a far better language,
simulator, and debugger — parity should be faster than the Roku build
was. The service-side density/cost numbers are unchanged (a painted
display costs the same whatever the TV runs).

## 6. Open questions / risks

1. ~~Prefix~~ **RESOLVED**: `ATV` confirmed by Dave 2026-08-26.
2. **App Review posture**: an always-on ambient display that disables
   idle sleep is legitimate (`isIdleTimerDisabled` exists for exactly
   this), but write the App Review notes to explain the product ("smart
   display companion; the TV is the display") to preempt a 4.2 or
   "battery/screen abuse" misread. The shipped iOS app's review history
   helps.
3. **Menu/Back semantics**: our full-screen canvas must not trap Menu;
   top-level Menu must exit to the home screen or review rejects.
4. **OLED burn-in responsibility**: same as Roku — user's TV, their
   settings; nightMode handling stays a portal/backend feature.
5. **Minimum tvOS version**: pick tvOS 17+ (SwiftUI maturity, ~all
   in-use devices) unless analytics say otherwise.
6. **Simulator vs device for input**: trackpad/GCMicroGamepad behavior
   differs on the simulator — pointer feel must be tuned on hardware.
   (Dave has Apple TV hardware? — confirm.)

## 7. Code organization & staying in sync with Roku (Dave, 2026-08-26)

The tvOS app lives **in this repo** as a sibling folder (working name
`tvos/`), next to the Roku channel and the render service. No separate
repo. The layout, as it actually is:

```
Mango-Display-Roku/
├── manifest, components/, source/, images/, media/, package.sh
│                        ← the ROKU CLIENT lives at the repo root
│                          (historical: Roku's package wants manifest at
│                          the top; the repo grew Roku-first)
├── render-service/      ← the Fargate service - shared brain, both TVs
├── buildspec.yml        ← service image build (CodeBuild)
├── fonts/               ← SHARED: bundled by the channel AND baked into
│                          the service image so captures use the same fonts
├── tools/               ← SHARED: font + celebration-sheet generators
├── tvos/                ← the APPLE TV CLIENT (to be created), with its
│                          PARITY.md marker
└── *.md                 ← docs
```

Do NOT reshuffle the Roku files into a `roku/` folder as part of the
tvOS work — packaging, the deploy runbook, and the porting-workflow
paths all assume the current layout, and the tidy-up is cosmetic. If it
ever happens, it happens on its own after the Roku store release.

**Portal ownership — hands off.** All portal changes (the
`Mangomirror-Portal` repo, branch `painted-mode-roku` — merged 2026-09-02;
the old vendored copies in `render-service/portal-preview/` are gone) are owned by Dave's
original Roku session/context — its memory holds the sync ritual and
the signalling rules. A tvOS session must never edit either location;
the TVs never see portal code anyway (it runs in the server's browser —
both TV clients only consume images and manifests). Reading is fine; if
portal behavior seems wrong or missing, stop and report to Dave.

Rules that keep the two clients in step:

- **`tvos/PARITY.md`** states the Roku commit the tvOS app currently
  matches ("behavior parity as of `<hash>`"). Every porting pass ends
  by updating it.
- **The porting workflow** for any future session: read
  `tvos/PARITY.md`, then
  `git log <hash>..HEAD -- components/ source/ images/ fonts/ manifest`
  to list Roku-side changes since parity, port the *behavioral* ones
  (skip Roku-only mechanics like texture-cap packing or the keep-alive
  video), update PARITY.md.
- **Commit messages are the porting spec.** Roku commits here describe
  behavior and rationale, not just code — keep that up; the tvOS
  session reads the story, not the diff.
- **No code is shared** (BrightScript vs Swift, zero overlap). What IS
  shared and must stay platform-neutral: the manifest contract, the
  sprite sheets/fonts and their generator tools (which should emit JSON
  maps alongside the .brs ones), and the render service. Most features
  ship in the service and touch neither app — the apps only change when
  a new manifest concept appears, so the porting burden stays small.

## 8. Suggested phases

- **Phase A (spike, ~days)**: pairing + /wait + page display on the
  tvOS simulator against the test fleet (id in PAINTED_DISPLAYS).
  Proves the whole loop with zero server work.
- **Phase B (parity)**: overlays → effects → interaction → celebrations,
  checked against the same "claude test" display the Roku used
  (fixture rules in the memory files apply).
- **Phase C (hardening)**: real hardware, idle/sleep soak, memory soak,
  lifecycle/exit reporting.
- **Phase D (store)**: assets, TestFlight beta, App Review.

*Written 2026-08-26 from the session that shipped celebrations. Roku
reference commit at time of writing: `cfc6c1a` on `live-portal`.*
