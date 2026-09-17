# Mango Display — TV clients and the render service

One repository holds everything that puts a Mango Display layout on a
TV that cannot run the portal itself:

| Folder | What it is |
|---|---|
| `components/`, `source/`, `manifest`, `images/`, `fonts/` | The **Roku channel** (BrightScript / SceneGraph). |
| `tvos/` | The **Apple TV app** (Swift, Xcode project `tvos/MangoDisplayTV.xcodeproj`). |
| `render-service/` | The **render service** (Node + headless Chromium on ECS) that runs each display's live portal, captures the pages, extracts native widget overlays and answers the devices' long-polls. Shared by both TV clients. |
| `signing/` | Roku packages that were uploaded to the Roku dashboard, plus signing notes. |
| `tools/` | Device simulator and other helpers. |

Start with `OPS_RUNBOOK.md` for operating it and `LIVE_PORTAL.md` for
how the service works. The rest of the docs are listed at the end.

## Where the code is — read this before you start

**`live-portal` is the trunk. Always start from it, for everything.**
Roku channel, Apple TV app, render service and docs all land on
`live-portal` first, and it is never rewound. If you are looking for
"the latest code", it is here.

The two other long-lived branches are **deploy pointers**, not places
to work:

| Branch | Holds | Who moves it |
|---|---|---|
| `live-portal` | the latest of everything | every change, as it is made |
| `test-release-auto-deploy` | exactly what the **test** render fleet runs | a commit is copied here (cherry-pick) once it is ready to try on test; Jenkins deploys it |
| `prod-release-auto-deploy` | exactly what the **production** render fleet runs | the same commit is copied here only after Dave approves that specific change; Jenkins deploys it |

Rules that keep this true:

- Nothing reaches a deploy branch that is not already on `live-portal`.
  Promotion copies individual commits; a whole branch is never pushed
  over a deploy branch.
- Before every push to a deploy branch, diff it against the source
  (`git diff --stat <deploy-branch> <ref> -- render-service fonts
  buildspec.yml`). Only the approved change may show.
- Jenkins only reacts to `render-service/`, `fonts/` and
  `buildspec.yml`. Channel, tvOS and doc commits on the deploy
  branches deploy nothing.
- The running production task names its image by commit
  (`mango-display-render:prod-<sha8>`), so what production runs can
  always be tied back to a commit on `prod-release-auto-deploy`.

**`main` is stale.** It is still GitHub's default branch but stopped
receiving commits on 2026-08-15 and is far behind `live-portal`. Do not
start from it. (Either fast-forward it to `live-portal` or change the
default branch; until then, ignore it.)

### Channel and app code vs. what users run

A branch push never releases a TV client. Users run whatever package
was last **uploaded**:

- **Roku**: the `.pkg` uploaded to the Roku dashboard (beta channel for
  testers, public channel for households). The packages that were
  uploaded live in `signing/`; the release steps and the list of
  channel changes waiting for the next upload are in `OPS_RUNBOOK.md`
  §5a. `manifest` carries `build_version`.
- **Apple TV**: the build uploaded to App Store Connect / TestFlight
  from `tvos/MangoDisplayTV.xcodeproj`. See `APPLE_TV.md` and
  `tvos/PARITY.md`.

So the latest Roku or tvOS code is on `live-portal`; what is actually
on TVs is the last uploaded package. Cut a new package from
`live-portal` when the queued changes should ship.

### Render service: what runs where

| Environment | ECS service | Branch | Image tag |
|---|---|---|---|
| test | `roku-render` | `test-release-auto-deploy` | `latest` |
| production | `roku-render-prod` | `prod-release-auto-deploy` | `prod-<sha8>` |

Both are on the ECS cluster `roku-render`; details, alarms and the
rollback command are in `OPS_RUNBOOK.md` and `INFRA.md`.

## Typical change, end to end

1. Branch or commit on `live-portal`.
2. Render-service change: cherry-pick the commit onto
   `test-release-auto-deploy`, push, let Jenkins deploy, verify on a
   test display. Then, with approval, cherry-pick the same commit onto
   `prod-release-auto-deploy` and push.
3. Roku channel change: it waits on `live-portal` until the next
   package is cut (`./package.sh` / `./package.sh prod`, sign, upload).
4. Apple TV change: it waits on `live-portal` until the next Xcode
   build is uploaded.

## Running the Roku channel on a device

Any Roku in developer mode (Home ×3, Up ×2, Right, Left, Right, Left,
Right; enable the installer, set a dev password, reboot):

1. `./package.sh` builds `MangoDisplayRoku.zip` (test backend);
   `./package.sh prod` builds the production variant.
2. Open `http://ROKU_TV_IP`, log in as `rokudev`, upload the zip,
   Install. Re-uploading keeps the registry, so the device code
   survives updates.
3. Logs stream over telnet: `telnet ROKU_TV_IP 8085`, prefixed
   `[Mango]`.

TVs used as always-on displays need the screensaver disabled once:
Home → Settings → Theme → Screensaver wait time → Disable screensaver.

## Documents

| File | Read it for |
|---|---|
| `OPS_RUNBOOK.md` | day-to-day operation: what runs where, deploying, Jenkins, rollback, channel release queue (§5a), post-production to-do |
| `OPS_RUNBOOK_DETAIL.md` | the long version: design, drills, numbers |
| `INFRA.md` | every AWS/Cloudflare resource, in creation order |
| `LIVE_PORTAL.md` | how the render service runs the live portal and captures it; open items |
| `MANIFEST.md` | the manifest the devices consume |
| `NATIVE_WIDGETS.md` | how overlays (clock, slideshow, gif, strips…) are extracted |
| `APPLE_TV.md`, `tvos/PARITY.md`, `TVOS_PARITY_QUEUE.md` | the Apple TV port and what it still lacks vs. Roku |
| `ROKU_EXCLUSIONS.md` | webapp options gated off for painted TVs |
| `HANDOFF.md` | the original fleet/pairing/HTTPS write-up (rendering sections superseded by `LIVE_PORTAL.md`) |
