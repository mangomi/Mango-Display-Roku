# Mango Display TV platform — runbook

For whoever operates the render fleet and ships releases. Short on
purpose: the why, the history and every measurement live in
`OPS_RUNBOOK_DETAIL.md`. Other docs: `INFRA.md` (AWS inventory),
`LIVE_PORTAL.md` (architecture), `MANIFEST.md` (device contract),
`APPLE_TV.md`, `TVOS_PARITY_QUEUE.md`.

**If you change how something is deployed, change this file in the same
commit.**

---

## 1. What runs where

TVs are thin clients. The **render service** (Node + headless Chromium
on ECS Fargate) keeps each watched display's real portal page open,
screenshots it when the portal says it has redrawn, and publishes page
images + `display.json` to S3/CloudFront. The TV long-polls `/wait`,
fetches the manifest when the version changes, and animates clock,
GIFs, scroll strips and weather natively. Gestures come back via
`/interact`.

Golden rules:

1. **One portal per display, one socket per display.** The ownership
   layer (§4) leases each display to exactly one task. Never run more
   than one task with `OWNERSHIP=off`.
2. **The portal is the only source of "ready to screenshot".** No
   timers or heuristics on either side.
3. **The portal the service loads must have painted mode.** Test and
   prod both do (verified 2026-09-07). `PORTAL_PREVIEW_DIR` /
   `PORTAL_PATCH_DIR` are dev levers only — never on a task definition.

| | Test | Production |
|---|---|---|
| Control endpoint | `roku-control-test.mangodisplay.com` | `roku-control.mangodisplay.com` |
| ECS service (cluster `roku-render`) | `roku-render` | `roku-render-prod` |
| Task definition | `roku-render` (1 vCPU / 2 GB, image `latest`) | `roku-render-prod` (2 vCPU / 8 GB, image `prod-<sha>`) |
| API / portal / socket | `testapi` / `testportal` / `testsocket` (v1.0.5) | `api` / `portal` / `socket` (v1.0.5) |
| Assets | `mango-roku-assets/test/` | `mango-roku-assets/prod/` — both via `rokuassets.mangodisplay.com` |
| Ownership table | `roku-display-owner-test` | `roku-display-owner-prod` |
| Log group | `/ecs/roku-render` | `/ecs/roku-render-prod` |
| Target group / health | `roku-control-tg` / `/healthz` | `roku-control-prod-tg` / `/healthz` |
| Capacity | `FARGATE` base 1 + `FARGATE_SPOT` weight 4 | same |
| Auto-scaling | 1–14 tasks, memory 70 % / CPU 65 % | same |
| Alarms | `roku-render-test-*` | `roku-render-prod-*` |
| Tags | `Project=Roku`, `Environment=test` | `Project=Roku`, `Environment=prod` |
| Channel build | `./package.sh` | `./package.sh prod` (setup at `app.mangodisplay.com`) |

Shared: the balancer `roku-control` (host rules split the two names;
anything else gets a 404), the cluster, ECR `mango-display-render`,
CodeBuild `roku-render-build`, the bucket and CloudFront, the AWS Budget
"Roku render service" ($500/month on the `Project=Roku` tag, alerts at
$250 and $400 to Dave).

---

## 2. Deploying

### Branches

| Branch | Deploys |
|---|---|
| feature → PR | nothing |
| `test-release-auto-deploy` | test fleet, automatically |
| `prod-release-auto-deploy` | production fleet, automatically |
| `live-portal` | development trunk for the TV platform |
| `main` | nothing; updated days after a prod release has soaked |

Habit: merge into `test-release-auto-deploy` first, watch the staging
build and the test fleet, then merge the same commit into
`prod-release-auto-deploy`.

### Jenkins jobs (https://jenkins.mangomirror.com)

| Job | Trigger | What it does |
|---|---|---|
| `Roku-Staging-Service` | push to `test-release-auto-deploy` touching `render-service/`, `fonts/` or `buildspec.yml` | syntax gate → package server code → S3 → CodeBuild (tags `v1`/`latest`) → `update-service --force-new-deployment` → smoke `/version` |
| `Roku-Production-Service` | same paths on `prod-release-auto-deploy` | same, but the image is tagged `prod-<sha8>`, a `roku-render-prod` task-definition revision is registered on it, the service is rolled to that revision, smoke `/healthz` |

A push that only touches the channel, tvOS or docs builds nothing.
*Build Now* always builds. Slack gets start/success/failure. About five
minutes end to end; households see nothing (new task before old, cached
pages, one-second hand-over).

**Never pin the TEST task definition to an immutable tag** — the staging
job deploys whatever image the current revision names, so it must stay
on `latest`.

### Rollback (production)

```
aws ecs list-task-definitions --family-prefix roku-render-prod --sort DESC
aws ecs update-service --cluster roku-render --service roku-render-prod \
  --task-definition roku-render-prod:<previous> --force-new-deployment
```

About 90 seconds. Every production revision names the exact image it
ran, so any earlier revision is a valid target.

### Roku channel

Not in Jenkins. `./package.sh` (test) or `./package.sh prod`, sideload
the zip on a Roku that holds the signing key, sign with `plugin_package`,
download the `.pkg`, upload in the Roku dashboard. Signed packages and
the recovery steps: `signing/CREDENTIALS.md`. Bump `build_version` in
`manifest` before every upload.

### Manual service deploy (escape hatch)

`OPS_RUNBOOK_DETAIL.md` §7.3 has the zip → S3 → CodeBuild → ECS
commands the jobs automate.

---

## 3. Watching it

Alarms (both environments; production ones prefixed `roku-render-prod-`):

| Alarm | Means |
|---|---|
| `task-ceiling` | at the 14-task spend limit for 15 min — raise `--max-capacity` and the budget if the growth is real |
| `refusing` | a task refused new displays for 10 min — scaling is not keeping up, or the maximum binds |
| `unhealthy-workers` | a display's portal will not open after three tries — read that display's log |
| `unhealthy-hosts` | a task is failing `/healthz` — ECS replaces it; if it repeats, the cause is upstream |
| `owner-table-errors` | DynamoDB errors on the owner table |
| Budget $250 / $400 | growth notice (email) |

`/healthz` on either hostname returns the answering task's id, usage,
owned displays and admission state. Useful log greps: `claimed`,
`ownership: lost`, `released every row`, `refusing`, `live portal
ready`, `captured page(s)`, `portal open failed`, `UNHANDLED REJECTION`.

Quick triage:

- **A display stopped updating:** `RunningTaskCount` first, then grep
  the device id; no `live portal ready` → portal boot failed, look for
  `[portal error]` and `portal console before the failure`. The TV
  keeps cached pages throughout.
- **`[portal error] 403`:** benign display-scoped API calls; ignore
  unless captures fail.
- **Spot capacity gone for a long stretch:** move the service to
  `capacityProvider=FARGATE,weight=1,base=1` temporarily.

---

## 4. Scaling and ownership (the essentials)

- Each display is **leased** to one task in DynamoDB (90 s lease,
  renewed every 30 s). A poll landing on another task is **forwarded**
  to the owner; an unowned display is **claimed** unless the task is
  refusing (memory ≥ 85 %, CPU ≥ 70 % for 30 s, 4+ portals booting, or
  20 claims in the last minute). Clean shutdowns release rows; sudden
  deaths recover within a lease.
- ECS scales on real memory/CPU. **Capacity is CPU-bound: about 20
  watched displays per 2 vCPU task** (measured 2026-09-07); 14 tasks ≈
  250. The idle-repaint guard in the service and portal PR #74 lower
  idle CPU per portal, which is the lever — re-measure with the
  simulator after each such change.
- Simulator: `SIM_DISPLAYS=1` on a **test** task accepts `SIM*` device
  ids; `render-service/sim-devices.js` polls as N devices (task
  definition `roku-sim` runs it on the cluster). Exit code 2 = a double
  owner was seen.
- Knobs (env): `OWNERSHIP`, `OWNERSHIP_TABLE`, `RENDER_CONCURRENCY`,
  `REFUSE_*`, `MAX_BOOTING`, `MAX_CLAIMS_PER_MIN`, `HEALTH_STALE_MS`.

Full design, drill results and numbers: `OPS_RUNBOOK_DETAIL.md` §9.

---

## 5. Post-production to-do

Reviewed with Dave 2026-09-07. Revisit after the first weeks of
production; none blocked launch.

| # | Item | Where | Why |
|---|---|---|---|
| 1 | Channel backoff with jitter and a launch delay | channel (next beta build) | hundreds of Rokus retrying every 5 s after a restart is rude to the service |
| 2 | Cache pruning on the task disk | service | strips and sheets accumulate; a deploy clears it today, a long-lived task would not |
| 3 | Persisted display records | service | a backend outage must never block a display the service has not seen since its last restart |
| 4 | Canary display after every portal/service deploy, with an alarm | infra + portal | a portal change that breaks painted mode should page, not wait for a customer |
| 5 | Portrait "never signalled ready" | portal/service | reproducible with a portrait layout in designer mode; same error a tester's portrait Roku logged — root cause before selling portrait |
| 6 | Promote portal PR #74 (no marquee animation in painted mode) | portal | halves idle CPU per portal → doubles displays per task |
| 7 | Shared weather-icon library filmed once | service + channel | removes per-display icon filming and the idle SVG repainting for good |
| 8 | Confirm the idle-repaint guard's effect on Fargate | test | measured 2× on a Mac; a 20-minute simulator run settles it |
| 9 | Move the signing password out of git history | repo | Dave deferred; do before the repo is shared more widely |
| 10 | Rename test resources with `-test` if the tags are not enough | infra | recreate of the test service; runbook + Jenkins update |
