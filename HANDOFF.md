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

**It runs entirely on AWS.** Nothing on anyone's laptop. Verified on a
real Roku Express with every local process stopped.

| | |
|---|---|
| Render service | ECS Fargate, cluster `roku-render`, 1 task, ARM64 |
| Control endpoint | `http://roku-control-1212257186.us-east-1.elb.amazonaws.com` |
| Images | Cloudflare R2, `mango-display-assets`, free egress |
| Backend | **TEST only** (`testapi` / `testportal` / `testsocket`) |
| Cost | ~$55/month — $36 task, $17 load balancer, ~$2 rest |

The channel has exactly **one** address compiled in: the control
endpoint. It learns where images live at runtime, so assets can move
without a channel update.

### What works, verified on the device

Pairing (`RK` + 9 digits, same flow as Tizen); page rendering with native
clock, GIFs/stickers, weather icons, photo slideshows, countdown, layered
page backgrounds; nine visual effects; multi-page rotation with
transitions; a remote pointer matching the portal's own `remotePointer`
directive, with a green outline over anything interactive; page turns by
double-clicking left/right; chores, to-do and sub-task completion;
calendar date navigation on both Weeks and List calendars.

## Next, in rough priority order

1. **Multi-display fleet manager.** The service still serves ONE
   hardcoded display (`DISPLAY_DEVICE_ID`, currently `RK569557324`).
   This is the largest remaining piece and nothing else depends on it.
   Note the constraint below about one socket per display.
2. **HTTPS on the control endpoint.** HTTP today. Needs an ACM
   certificate and a channel change for the scheme.
3. **Production backend.** Still test. The startup banner prints
   `*** PRODUCTION ***` when that changes — check the logs after any
   cutover.
4. **A dedicated secret.** R2 keys currently live in the shared
   `mangomirror-staging-secrets`; the IAM grant covers the whole bundle.
5. **Webapp exclusions.** `ROKU_EXCLUSIONS.md` is a list of settings the
   webapp should hide for `RK` displays. Nobody has implemented it, so a
   user can still pick Fireworks or the video widget and get nothing.
6. **Backend fix B1** (also in `ROKU_EXCLUSIONS.md`): to-do status
   updates do not broadcast `refreshLayout`, but chores do. Probably
   affects every platform, not just Roku.

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

Dave has the dev password. The TV is at `10.0.0.50`.

## Rebuilding and deploying

Build commands are in `INFRA.md`. After pushing a new image:

```
aws ecs update-service --cluster roku-render --service roku-render \
  --force-new-deployment
```
