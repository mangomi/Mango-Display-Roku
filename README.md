# Mango Display — Roku (registration spike)

Proves the Mango Display registration flow works on Roku. Port of the
Tizen app's pairing logic (Mango-Display-Tizen `index.html`) to
BrightScript/SceneGraph. No backend changes required — it talks to the
same two endpoints the Samsung app uses.

**Environment: the spike is pinned to the TEST backend**
(`testapi.mangomirror.com`), so displays must be claimed from
**testapp.mangodisplay.com** (or a local `ng serve --configuration
staging`), not the production webapp. The environment lives in one
place: `m.env` at the top of `components/MainScene.brs`.

## What it does

1. Generates a device code `RK` + 9 random digits (digits 1–9, same
   charset as Tizen's `SM` codes) and persists it in the Roku registry
   (the equivalent of `localStorage`).
2. Shows the code full-screen with "Setup at testapp.mangodisplay.com".
3. Polls `GET https://testapi.mangomirror.com/v1.0.5/mirrors/deviceId/{code}`
   every 5 seconds.
4. On an error response (device unknown), self-registers via
   `POST /mirrors/saveMirror` — payload identical to the Tizen app's,
   including `deviceType: "Android tablet"`, so the backend treats it
   exactly like a known device type. Swap in a real Roku device type
   once the backend supports one.
5. When the display is claimed in the webapp (`isActive: true`), it
   shows a full-screen test image plus a small "Linked | major X minor Y"
   caption — the point where the real app would start showing rendered
   display pages.

Press `*` (options) on the remote to discard the code and start over
with a fresh one (like clearing localStorage on Tizen). Back exits.

## Flow mapping (Tizen → Roku)

| Tizen (web app)                  | Roku                                  |
|----------------------------------|---------------------------------------|
| `localStorage` displayCode       | `roRegistrySection("mangodisplay")`   |
| `fetch()` / `XMLHttpRequest`     | `roUrlTransfer` in a Task node thread |
| redirect to portal URL           | (later: fetch rendered page images)   |
| Samsung back-button exit         | Scene default Back handling           |
| `SM` prefix                      | `RK` prefix                           |

## Running it on a Roku

You need any Roku device (a TCL/Hisense/onn Roku TV or a Roku stick)
in developer mode:

1. On the Roku remote press: **Home ×3, Up ×2, Right, Left, Right,
   Left, Right**. The Developer Settings screen appears.
2. Enable the installer, note the device IP, set a dev password,
   accept, and let it reboot.
3. Build the zip: `./package.sh`
4. Open `http://ROKU_TV_IP` in a browser (login `rokudev` + your dev
   password), upload `MangoDisplayRoku.zip`, click Install. The app
   launches immediately. (Or use the `curl` command `package.sh` prints.)

Sideloaded apps need no Roku account, store listing, or certification.
Only one sideloaded app can exist at a time; re-uploading replaces it
but keeps the registry (so the device code survives updates).

## TV setup for always-on use

Roku offers no API for an app to block the screensaver, so each TV needs
a one-time setting (same instruction commercial signage apps give):

**Home → Settings → Theme → Screensaver wait time → Disable screensaver**
(older Roku models: Settings → Screensaver)

Future phase: ship a companion Mango Display *screensaver channel* so the
dashboard appears automatically whenever the TV idles — turns the
constraint into an auto-start feature.

## Debugging

BrightScript console (prints, crashes) streams over telnet:

    telnet ROKU_TV_IP 8085

All app logs are prefixed `[Mango]`.

## Notes / follow-ups

- The claim UI in the webapp only checks the code is non-empty, so the
  `RK` prefix flows through today. If the backend ever validates
  prefixes or the webapp adds per-platform setup instructions, add
  `RK` there.
- The two clients disagree on the "unknown device" error message
  (Tizen matches `Mirror not registered`, the webapp matches a longer
  message), so this app deliberately treats *any* error payload as
  "not registered yet" instead of string-matching.
- `deviceMode: "portrait"` is copied from Tizen verbatim. Roku is
  landscape-only; fix alongside the deviceType cleanup.
- Next phase: replace the hardcoded test image with per-display
  server-rendered page images (see the Roku architecture plan —
  screenshot pipeline + thin client).
