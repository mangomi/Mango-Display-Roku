# Bug handoff: broken-image tiles baked into painted captures while DOM-based visual overlays are enabled

> **STATUS (2026-08-27, fixed by the server-side session):** both
> suggested directions implemented. (1) Service backstop: effect
> elements are now BORN hidden — `livePortal.installEffectHide()`
> injects a persistent `opacity:0 !important` CSS rule via
> `addInitScript` (survives self-reloads), selectors from the new
> shared `nativeWidgets.effectHideSelectors()`; verified in Playwright
> that late-spawned `.leaf`/`.web-line` elements compute to opacity 0
> across reloads while page content is untouched. Deployed to the test
> fleet. (2) Portal source fix: `updateOverLay`'s effect dispatch bails
> on `window.mmPainted` after the nightMode block (night mode must stay
> capturable) — rides PR #68 as usual. Pixel-level confirmation per the
> recipe below still wants a Falling Leaves toggle on a test display —
> Dave or the tvOS session. The optional content-hashing of ALL
> generated sprite filenames (Current state §3) remains open.

Written 2026-08-26 by the tvOS-port session, for the agent managing
server-side changes. Found while verifying the Apple TV client's effect
players against the test fleet; the bug is entirely server/portal-side
and affects EVERY painted client identically (Roku today, tvOS now) —
the tiles are in the published pixels.

Verified end-to-end with code reading and live captures; every claim
below has a file:line or a reproduction attached. Nothing has been
changed — service and portal are untouched by the finding session.

## Symptom

With **Falling Leaves**, **Flowing Hearts**, or **Flying Witch &
spiders** enabled on a painted display, the published page captures
(`display_pN.png/jpg`) contain scattered Chromium broken-image
placeholder tiles (small white-bordered squares with the landscape
glyph, often rotated via the portal's own CSS animation). Dozens per
capture at worst. Every TV shows them, baked under the live overlays
the devices draw themselves.

Reproduced on display `ATV447393236` (test env, account
appletv@g.com, "Apple TV Spike"). Its currently published captures are
clean — the last toggles of the session disabled all effects — but the
bug reproduces on demand (recipe below).

## Mechanism (three parts, each verified)

1. **Painted sessions force-fail effect image requests.**
   `render-service/livePortal.js:41` —
   `BLOCKED_MEDIA = /\/visualoverlays\/|myimages\.mangodisplay\.com|\/backgrounds\//`
   — and `:144` fulfills matches with `status 204, body ""`. Correct
   idea (the device draws effects natively; media the device renders
   must not be downloaded per capture), but it means every effect
   `<img>` in the portal *becomes* a broken-image glyph rather than
   art. Invisible only if the hide layer (part 3) actually covers it.

2. **The portal spawns effect elements continuously.**
   `Mangomirror-Portal WebContent/js/controller/overlayController.js:747-763`:
   falling leaves `document.createElement("img")`,
   `className = "leaf"`, src under S3 `/visualoverlays/fall/`, spawned
   on an interval (~1/s, and equivalents for `.heart`, the dropping
   `.spider` + `web-line` threads, `.elf`). Fresh DOM nodes appear for
   as long as the overlay is enabled.

3. **The hide pass is one-shot and per-element.**
   `render-service/nativeWidgets.js:1730` (`hideEffects`) sets
   `el.style.opacity = "0"` on the elements that exist at that moment,
   using ids/classes from the `EFFECTS` table plus hardcoded extras
   (`:1733-1743`). The class lists are CORRECT (`.leaf` matches the
   portal — verified). But it runs **once per capture run**
   (`render-service/capture.js:513`), before the run steps through the
   pages — and page steps legitimately take seconds each (transition
   settling, LIVE_PORTAL.md "Open/next" §3). Every element spawned
   after the pass and before a given page's screenshot is unhidden →
   its (force-failed) broken-image glyph is baked into that page.

So: not a selector gap, a **timing hole** — one-shot inline-style
hiding versus a continuously-respawning population, with the
blocklist guaranteeing that anything that slips through looks like a
broken-image tile instead of art.

## Why only some effects show it (confirms the diagnosis)

Observed across a full 11-effect sweep on the tvOS client (screenshots
in Dave's chat, 2026-08-26):

| Effect | Portal mechanism | Tiles? |
|---|---|---|
| Falling Leaves | `<img class="leaf">` respawned ~1/s | YES, worst case |
| Flying Witch set | drop `.spider` imgs + `web-line` threads respawn; `#witch/#bat` persistent | YES, several |
| Flowing Hearts | `<img class="heart">` respawned | yes, occasional single tiles |
| Disappearing Elf | `.elf` img recreated per pop (slow cadence) | not caught, same exposure |
| Flying Santa | single persistent `#santa` img | no — hidden reliably |
| Balloons / Fireworks / Bursting Hearts | canvas drawing (`#balloonCanvas`, `#fireworksCanvas`, `#bsHearts`) — image loads fail silently inside JS drawing | no |
| Snow | text glyphs (❅), no imgs | no |
| String lights | `.stringlight` (hidden; no tiles observed) | no |

Persistent-single-element and canvas effects are immune; respawning
`<img>` effects are exactly the ones that tile. That pattern is the
timing hole's fingerprint.

## Suggested fix directions (choose/combine — your call)

The celebrations work already set the precedent for this exact
situation (LIVE_PORTAL.md "Celebrations (2026-08-24)"): portal-side
suppression at the source, service-side backstop at capture. Both
halves apply here:

1. **Service-side backstop (reaches the fleet immediately):** install
   the hide as a persistent CSS RULE instead of per-element inline
   styles, so elements are born hidden. E.g. via Playwright
   `page.addInitScript` in `livePortal.js` (survives the portal's
   self-reloads — restart-display pushes reload the document, which
   would drop a one-time `<style>` injection): on DOMContentLoaded,
   append a style node like
   `.leaf,.heart,.spider,.web-line,.elf,.stringlight { opacity: 0 !important; }`
   plus the id-based selectors from the `EFFECTS` table. Painted
   sessions only (livePortal IS painted-only, so the injection site is
   inherently safe for normal portals). `hideEffects` can stay as-is —
   redundant but harmless — or be reduced to the canvas/id cases.

2. **Portal-side source fix (the real one):** don't spawn effect DOM
   at all when `window.mmPainted` — same bail the canvas confetti and
   `overlayController`'s firework/bursting-hearts draw loops already
   perform. NOTE the deployment caveat documented in LIVE_PORTAL.md:
   `overlayController.js` is NOT in the vendored `portal-preview/`
   set, so a portal-side change does not reach the test fleet until
   PR #68 (`painted-mode-roku`) carries it and deploys — which is why
   the backstop (1) matters.

Cautions:

- **Scar 1 (LIVE_PORTAL.md): do NOT disable animations globally** in
  the portal — the calendar-scroll cleanup depends on `animationend`.
  Hiding/not-spawning effect elements is fine; a blanket
  `animation: none` is not.
- Don't widen `BLOCKED_MEDIA` or narrow it as part of this — single-
  image-widget loss (LIVE_PORTAL.md Open §7) is a separate known issue.
- Keep the hide painted-only. Real devices (Android TV portals) must
  keep drawing their own effects.

## Reproduction / verification recipe

1. Pick a painted test display — `ATV447393236` (tvOS sim; identity in
   the finding session's notes) or `MD4454256172` ("claude test").
   **Never `RK569557324`** (Dave's live display).
2. In the test webapp: display Settings → Visual Overlays → enable
   **Falling Leaves** → Save. Wait for the resulting capture to
   publish (~15-30s).
3. Verify pixels, never logs: fetch the page PNG the manifest names
   from the display's asset base and composite it over a dark
   background (transparent PNGs hide the tiles on white):

   ```
   curl -s "<assetBase>/display_p0.png?t=check" -o /tmp/p0.png
   python3 - <<'EOF'
   from PIL import Image
   img = Image.open('/tmp/p0.png').convert('RGBA')
   bg = Image.new('RGBA', img.size, (30,60,30,255))
   bg.alpha_composite(img)
   bg.convert('RGB').save('/tmp/p0-composited.png')
   EOF
   ```

   Before the fix: white broken-image tiles scattered through the
   composite (the finding session counted ~25 with leaves enabled).
   After the fix: none, across several consecutive captures (spawns
   are ~1/s, so let two or three captures happen — e.g. toggle another
   setting — to exercise the race window).
4. Confirm no regression on the immune effects (balloons still absent
   from captures, snow clean) and that a REAL portal (non-painted,
   e.g. designer preview) still shows its effects.

## Current state

- No server or portal files were modified by the finding session.
- The ATV test display currently has all visual overlays OFF and its
  published captures are clean.
- The tvOS client keeps its own defensive change (evicting effect
  sprite URLs from its image cache when the effect set changes —
  `tvos/` commit `2937646`); unrelated to this bug but found in the
  same sweep: effect sprite files regenerate under fixed filenames,
  and only `bundledBurstEffect` content-hashes its output. If you
  want to close that class of staleness fleet-wide, content-hashing
  all generated effect sprite filenames (like the burst sheets) would
  do it — separate, optional.
