# Start here

Read this first, then `INFRA.md`. Everything is committed and pushed to
`main` at https://github.com/mangomi/Mango-Display-Roku.

## What this is

Mango Display on Roku. tvOS has no web view and neither does Roku, so the
portal cannot run on the device. Instead a **render service** loads the
portal in headless Chromium, screenshots each page, and extracts the
widgets that cannot be a still image — clock, GIFs, weather icons, photo
slideshows, countdown, page backgrounds — into a **manifest**. The Roku
channel draws the screenshot and redraws those widgets natively on top,
so the clock ticks and the stickers animate.

`MANIFEST.md` is the contract between the two. `NATIVE_WIDGETS.md` is the
rendering architecture and the per-widget decisions.

## State as of 2026-08-10

**It runs entirely on AWS and serves a fleet.** Nothing on anyone's
laptop. The service manages one `DisplayWorker` per display — its socket
(exactly one owner per identity), render queue, version counter, working
directory, and derived R2 prefix. Every control request carries the
display's identity, so any request can create or resurrect a worker; the
container keeps no registry, and after a restart the TVs' own long-polls
rebuild exactly the fleet that really exists. Workers whose TV stops
polling for 30 min are torn down (a dark display costs nothing) and come
back on its next poll. Unknown device codes are validated against the
backend before a worker is born, and refused with 404.

| | |
|---|---|
| Render service | ECS Fargate, cluster `roku-render`, 1 task, ARM64 — **single-task by design** (see INFRA cutover notes) |
| Control endpoint | `https://roku-control-test.mangodisplay.com` — HTTPS only, `*.mangodisplay.com` ACM cert, no :80. The bare `roku-control.…` name is **reserved for production** (it currently also reaches the test service; host rules split it when prod exists — runbook in INFRA.md) |
| Environments | channel builds via `./package.sh [test\|prod]` (env.brs is generated; checked-in default is test; prod requires `PROD_API_VERSION`); assets live under `test/` and `prod/` folders in the one bucket (`ASSET_ROOT`) |
| Images | Cloudflare R2, `mango-display-assets`, free egress, HMAC-derived prefix per display |
| Backend | **TEST only** (`testapi` / `testportal` / `testsocket`) |
| Cost | ~$55/month — $36 task, $17 load balancer, ~$2 rest |

The channel has exactly **one** address compiled in: the control
endpoint. It learns where images live at runtime, so assets can move
without a channel update. Renders across displays share a semaphore
(`RENDER_CONCURRENCY`, default 1 — the task is 1 vCPU/2GB and a render
is a whole Chromium); the TVs' spinners cover the queueing.

### What works, verified on the device

Pairing (`RK` + 9 digits, same flow as Tizen); page rendering with native
clock, GIFs/stickers, weather icons, photo slideshows, countdown, layered
page backgrounds; nine visual effects; multi-page rotation with
transitions; a remote pointer matching the portal's own `remotePointer`
directive, with a green outline over anything interactive; page turns by
double-clicking left/right; chores, to-do and sub-task completion;
calendar date navigation on both Weeks and List calendars.

## Next, in rough priority order

1. **`saveMirror` is 500ing on testapi (found 2026-08-10, with Dave's
   backend dev as of 2026-08-11).** Every registration attempt returns
   `{"error":{}}` HTTP 500. What is established, so nobody re-chases it:
   requests arrive intact (a POST to the PUT-only `users/logIn` earns a
   clean 405); fresh never-seen codes fail on first contact (not a
   duplicate-ID conflict — the GET before and after says "Mirror not
   registered" both times, nothing inserts); and it is
   **payload-independent** — the Tizen payload, a stripped
   `{deviceId}`-only body, a body without deviceWidth/Height, and the
   `deviceType:"Linked Browser"` shape all 500 identically. So it is
   not validation logic rejecting a field: the handler throws
   unconditionally (bad staging deploy, missing config/dependency, or
   the DB write path), and the empty error object means the real
   message only exists in the server logs — e.g. 2026-08-11 01:45–01:49
   UTC, codes RK425665818/RK166818393/RK876387572/RK849161885/
   RK785579285. Until fixed, **no new device of any platform can pair
   against the test backend** (already-registered devices are fine —
   they never re-POST). `tools/fake-device.js` re-tests in seconds.
2. **Production backend.** Still test. The startup banner prints
   `*** PRODUCTION ***` when that changes — check the logs after any
   cutover.
3. **A dedicated secret.** R2 keys currently live in the shared
   `mangomirror-staging-secrets`; the IAM grant covers the whole bundle.
   Adding `ASSET_PREFIX_SECRET` there at the same time would decouple
   asset prefixes from R2 key rotation (today the R2 secret key doubles
   as the HMAC key).
4. **Webapp exclusions.** `ROKU_EXCLUSIONS.md` is a list of settings the
   webapp should hide for `RK` displays. Nobody has implemented it, so a
   user can still pick Fireworks or the video widget and get nothing.
5. **Backend fix B1** (also in `ROKU_EXCLUSIONS.md`): to-do status
   updates do not broadcast `refreshLayout`, but chores do. Probably
   affects every platform, not just Roku.
6. **Drop the `DISPLAY_*` legacy env** once the identity-sending channel
   is on every fielded device, and retire `serve.py`/`display.jpg`
   single-display leftovers.

Apple TV is planned but deliberately not started. The manifest is already
platform-neutral for it.

## Things that will bite you

- **One socket per display identity.** The backend closes a duplicate. If
  a laptop and the container are both connected as the same display, they
  fight. The fleet manager must guarantee exactly one owner.
- **Version numbers must stay small integers.** BrightScript's `ParseJson`
  returns large numbers as single-precision floats, so a 10-digit value
  rounds on the device and consecutive versions become
  indistinguishable. This cost a day: swipes appeared to do nothing at
  random.
- **The ALB idle timeout is 120s deliberately.** The control channel is a
  long poll held ~50s. The default 60s severs it.
- **A missing SceneGraph node is a runtime failure, not a build one.**
  `findNode` returning invalid takes down `init()` and the channel never
  leaves its splash screen, while `brighterscript` reports success. There
  is an audit loop in the git history; run it before shipping a channel.
- **Do not pull base images from Docker Hub in CodeBuild** (429), and do
  not pin a `playwright:vX` base image (browser/library drift).
- **Verify what changed on screen, not that something was published.** An
  early "12/12 passing" only proved a publish happened; the widget's own
  pixels had not moved.

## Testing on the device

```
# sideload after a change
cd ~/Projects/Mango-Display-Roku && ./package.sh
curl -s --digest -u rokudev:PASSWORD -F "mysubmit=Install" \
  -F "archive=@MangoDisplayRoku.zip" http://10.0.0.50/plugin_install

# screenshot what is actually on screen
curl -s --digest -u rokudev:PASSWORD "http://10.0.0.50/plugin_inspect" \
  -F "archive=" -F "mysubmit=Screenshot"     # then GET pkgs/dev.jpg?time=<ts>

# console (drops often; it replays a backlog on connect, so ordering lies)
nc 10.0.0.50 8085
```

Credentials for the TV are in `~/.mangodisplay/roku.env` on Dave's Mac
(host, user, dev-mode password) — read them from there, they are
deliberately not in this repo:

```
set -a; . ~/.mangodisplay/roku.env; set +a
curl -s --digest -u "$ROKU_DEV_USER:$ROKU_DEV_PASSWORD" \
  -F "mysubmit=Install" -F "archive=@MangoDisplayRoku.zip" \
  "http://$ROKU_DEV_HOST/plugin_install"
```

## Rebuilding and deploying

Build commands are in `INFRA.md`. After pushing a new image:

```
aws ecs update-service --cluster roku-render --service roku-render \
  --force-new-deployment
```
