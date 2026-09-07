# Mango Display TV platform — operations runbook

Audience: whoever operates the render fleet and ships releases. Covers
the render service (AWS), the Roku channel, and the Apple TV app.

Companion docs: `INFRA.md` (how test was built, and why),
`LIVE_PORTAL.md` (architecture and its scars), `MANIFEST.md` (the
device contract), `APPLE_TV.md` (tvOS port), `TVOS_PARITY_QUEUE.md`
(client changes pending).

---

## 1. The system in one page

TVs are thin clients. They do not run a browser and cannot render the
portal. Instead:

1. The **render service** (Node + headless Chromium, on ECS Fargate)
   opens the user's real portal page for each watched display.
2. The portal announces when it has finished drawing; the service
   screenshots each page, extracts "native widget" instructions
   (clock, countdown, effects, tap targets), and uploads images +
   `display.json` to S3, served by CloudFront.
3. The TV **long-polls** `/wait`; when the version bumps it fetches the
   manifest, swaps page images, and animates the native layers itself.
4. User gestures on the TV go back through `/interact`, which drives
   the live portal and publishes a fresh capture.

### Golden rules — violating these breaks displays

1. **ONE portal per display, ONE socket per display.** The backend
   closes duplicate sockets for the same device id. The display
   ownership layer (§9, `render-service/ownership.js`) is what lets
   several tasks run: each display is leased to exactly one task and
   the others forward to it. **Never run more than one task with
   `OWNERSHIP=off`** — that is the single-task mode and two of them
   fight over every socket.
2. **The portal is the only source of "ready to screenshot".** Never
   add timers or heuristics on the service or device side to guess
   when a render is done.
3. **Painted mode must be present in the portal the service loads.**
   Test has it (portal PR #68 merged and deployed 2026-09-02; the
   pre-merge shim is retired). Prod must have it natively before a prod
   fleet exists. `PORTAL_PREVIEW_DIR` / `PORTAL_PATCH_DIR` are emergency
   levers only — a pinned file MASKS the deployed one while set.

---

## 2. Environment inventory

### Test (live today)

| Thing | Value |
|---|---|
| ECS cluster / service | `roku-render` / `roku-render` |
| Task definition | `roku-render` (ARM64, 2 vCPU / 8 GB, 40 GB ephemeral, `RENDER_CONCURRENCY=2`) |
| Capacity | `FARGATE` base 1 weight 1 + `FARGATE_SPOT` weight 4 (one on-demand task, Spot above it) |
| Auto-scaling | 1–14 tasks; target tracking on average memory 70% and CPU 65% (policies `roku-render-memory-70`, `roku-render-cpu-65`) |
| Ownership table | DynamoDB `roku-display-owner-test` (TTL on `ttl`) |
| Health check | `/healthz` (503 when the ownership store fails or watched displays stop publishing) |
| Synthetic displays | `SIM_DISPLAYS=1` (test only — the service refuses to start with it on a prod API base) |
| Control endpoint | `roku-control-test.mangodisplay.com` → ALB `roku-control` |
| Target group | `roku-control-tg` |
| Log group | `/ecs/roku-render` |
| Assets | bucket `mango-roku-assets`, prefix `test/` |
| CDN | CloudFront `ERYTMHZUWUXMT` → `rokuassets.mangodisplay.com` (plan: Pro) |
| Prefix secret | `roku-asset-prefix-secret` |
| Build | S3 `roku-render-build-945710099949` → CodeBuild `roku-render-build` → ECR |
| Painted gate | `PAINTED_DISPLAYS=RK,ATV` (prefix match: every Roku and Apple TV) |

### Production (to be built — §4)

| Thing | Planned value |
|---|---|
| ECS cluster / service | `roku-render-prod` / `roku-render-prod` |
| Task definition | `roku-render-prod` (ARM64, start 1 vCPU / 4 GB) |
| Capacity | `FARGATE` base 1 (on-demand — see §9), Spot only for extra tasks later |
| Control endpoint | `roku-control.mangodisplay.com` → ALB `roku-control-prod` |
| Log group | `/ecs/roku-render-prod` |
| Assets | same bucket + CloudFront, prefix `prod/` |
| Prefix secret | **its own** secret — must NOT share test's, or prod and test displays derive the same asset prefixes |
| API version | `v1.0.5` (decided 2026-08-26; baked into `package.sh prod`) |

Everything is tagged `Project=Roku` for cost tracking. Keep that up.

---

## 3. Blocking dependencies before prod serves a display

1. **Portal PR #68** (painted mode) merged to `test-release-auto-deploy`,
   deployed, soaked — then promoted to `prod-release-auto-deploy`. The
   prod fleet cannot work against a prod portal without painted mode.
2. **Webapp PR #142** (Roku/Apple TV unsupported options) promoted to
   prod, so prod users cannot enable options their TV cannot do.
3. **Roku repo pushed to GitHub.** As of 2026-08-28, 73 commits exist
   only on the developer machine; `origin` has `main` only. Jenkins
   cannot deploy what is not pushed.
4. Roku channel store submission / tvOS TestFlight — separate track,
   see §10.

---

## 4. Building production (step by step)

Prerequisite: an ACM certificate for `roku-control.mangodisplay.com`
(DNS validation), and the two DNS records in §5.

1. **Cluster + logs**
   ```
   aws ecs create-cluster --cluster-name roku-render-prod \
     --tags key=Project,value=Roku
   aws logs create-log-group --log-group-name /ecs/roku-render-prod
   aws ecs put-cluster-capacity-providers --cluster roku-render-prod \
     --capacity-providers FARGATE FARGATE_SPOT \
     --default-capacity-provider-strategy capacityProvider=FARGATE,weight=1,base=1
   ```
2. **Secret** — new prefix secret, 32 random bytes:
   ```
   aws secretsmanager create-secret --name roku-asset-prefix-secret-prod \
     --secret-string "$(openssl rand -hex 32)" --tags Key=Project,Value=Roku
   ```
3. **IAM** — mirror the test roles:
   - task role `roku-render-prod-task`: `s3:PutObject`/`s3:DeleteObject`
     on `arn:aws:s3:::mango-roku-assets/prod/*`
   - execution role `roku-render-prod-execution`: ECR pull, CloudWatch
     logs, `secretsmanager:GetSecretValue` on the prod secret only
4. **Task definition** — from `deploy/taskdef-prod.json` in this repo
   (see §7). Environment differs from test only in:
   `MANGO_API_BASE`, `MANGO_PORTAL_BASE`, `MANGO_SOCKET_BASE`,
   `ASSET_ROOT=prod`, the prod secret ARN, and **no
   `PORTAL_PREVIEW_DIR`** (prod portal must have painted mode natively).
5. **ALB** `roku-control-prod`, internet-facing, HTTPS:443 with the ACM
   cert, target group `roku-control-prod-tg` (type `ip`, port 8080,
   health check `/health`), HTTP:80 → redirect to HTTPS.
6. **Service**
   ```
   aws ecs create-service --cluster roku-render-prod \
     --service-name roku-render-prod --task-definition roku-render-prod \
     --desired-count 1 \
     --capacity-provider-strategy capacityProvider=FARGATE,weight=1,base=1 \
     --network-configuration "awsvpcConfiguration={subnets=[...],securityGroups=[...],assignPublicIp=ENABLED}" \
     --load-balancers "targetGroupArn=...,containerName=render,containerPort=8080" \
     --tags key=Project,value=Roku
   ```
   No NAT gateway: the VPC routes `0.0.0.0/0` through its internet
   gateway, so public-IP tasks reach the portal, API and S3 directly.
7. **Alarms** — §8.
8. **Channel prod build** — `./package.sh prod` (API v1.0.5 is the
   default; `PROD_API_VERSION` overrides). The checked-in `env.brs` is
   always the test one; the prod build regenerates it and restores it.

---

## 5. DNS (WordPress.com panel — no automation)

Records needed for production:

| Type | Name | Value |
|---|---|---|
| CNAME | (ACM gives it) `_<hash>.roku-control` | `_<hash>.acm-validations.aws` |
| CNAME | `roku-control` | the ALB's DNS name |

Leave the ACM validation record in place forever — it is what lets the
certificate auto-renew. Already live for assets:
`rokuassets` → `d1qjms2klzrc83.cloudfront.net` plus its validation
record. Test's `roku-control-test` already points at ALB `roku-control`.

---

## 6. Costs

| Item | Test (today) | Prod at ~100 screens |
|---|---|---|
| Fargate task | ~$9 (Spot, 1 vCPU/2 GB) | $68-89 (on-demand, 2 vCPU/8-16 GB) |
| ALB | ~$17 | ~$17 |
| Logs / ECR / Secrets / S3 requests | ~$3 | ~$7 |
| Assets (S3 + CloudFront) | shared $15 Pro plan, covers both | — |
| **Total** | **~$29** | **~$92-113** |

All-in at ~100 prod screens (test + prod + the shared CloudFront plan):
**~$136-157/month**, or ~$120-140 with a 1-year Compute Savings Plan.
That is roughly **$1.00-1.15 per screen per month**.

**Do not confuse this with the density test's $0.13-0.20/display.** That
figure is the MARGINAL cost of one more display (RAM + compute) and is
still accurate. At 100 screens the FIXED floor dominates - two ALBs and
a task sized with headroom cost the same at 10 screens as at 100. The
fully-loaded average falls with scale: ~$1.10/screen at 100,
~$0.41 at 500, ~$0.37 at 1,000.

Structural note: the ALB is not optional. The device long-poll holds a
connection ~50s and API Gateway's ~30s timeout cannot carry it, so
~$17 per environment is a floor until the ownership/sentinel work
changes the shape.

**Cost attribution:** ECS task costs only inherit tags when the service
sets `propagateTags` - a service tagged `Project=Roku` whose tasks are
untagged puts all its Fargate spend in "untagged" (this was the case
until 2026-08-31). The test service is now set to `SERVICE`; **do the
same when creating the prod service**:
```
aws ecs update-service --cluster <c> --service <s> --propagate-tags SERVICE
```
Tags attach only to tasks launched AFTER the change, so it takes effect
on the next deployment.

Prod growth (measured ~181 MB per watched display, plus an 80 MB floor):
~100 displays on 2 vCPU/16 GB ≈ **$89/mo (~$0.89/display)**;
~300 displays on 4 vCPU/30 GB ≈ **$178/mo (~$0.59/display)**.
A 1-year Compute Savings Plan sized to the on-demand base task takes
~20–30% off that baseline once the fleet's floor is known.

Note: displays only cost while **watched**. The portal closes after
3 minutes without a device poll, and the worker is evicted after 30.

### Asset retention and cleanup

Two layers keep the bucket from growing forever:

1. **Lifecycle rules on `mango-roku-assets`** (applied 2026-08-28):
   objects untouched for **60 days** expire, and incomplete multipart
   uploads abort after 7 days. This is the churned-display case — a
   user who tries the product and stops. It is safe because any display
   still in use re-uploads its whole set whenever its worker restarts
   (every deploy, and after 30 minutes idle), refreshing the clock.
   **Do not shorten this window without thought**: sprite sheets can
   sit unchanged for a long time on a lightly-used display, and
   deleting one that is still referenced leaves a blank patch on
   someone's wall (CloudFront serves it from cache for a while, then
   404s).
2. **In-process reaping.** Each worker lists its display's prefix at
   startup and prunes content-addressed sprite art that the current
   manifest no longer references. Only `overlay_wxc_*` / `overlay_gif_*`
   names are ever deleted — manifests and page images keep stable names
   and are never reaped — and pre-existing objects are only judged
   against a COMPLETE publish, never a staged single-page one.
   Log lines: `N existing object(s) known for reaping`, `N stale
   removed`. First run pruned 60 orphans across two displays.

Storage is not a meaningful cost (10,000 displays ≈ $2–3/month). The
reasons this matters are hygiene on active displays and **data
retention**: these images are households' calendars, chores with
children's names, and family photos. The 60-day window is the figure
to quote in app-store privacy disclosures.

---

## 7. Deployment

### 7.1 Branch model (matches webapp and portal repos)

| Branch | Deploys |
|---|---|
| feature branch → PR | nothing; CI checks only |
| `test-release-auto-deploy` | test fleet, automatically |
| `prod-release-auto-deploy` | prod fleet, automatically |
| `main` | nothing — merged a few days AFTER a prod deploy has soaked |

Protect `prod-release-auto-deploy` so only release owners can merge.
`main` is the "this has survived production" marker, not a development
branch: it deliberately lags, and is updated once a prod release has
run clean for a few days (Dave's convention across all repos).

**Live for the render service** (created 2026-08-31): Jenkins job
`Roku-Staging-Service` builds and deploys on every push to
`test-release-auto-deploy` in `mangomi/Mango-Display-Roku`. See §7.2.

### 7.2 Jenkins jobs (path-filtered — one repo, three artifacts)

| Job | Triggers on | Result |
|---|---|---|
| **`Roku-Staging-Service`** (BUILT 2026-08-31) | a push to `test-release-auto-deploy` that touches `render-service/`, `fonts/` or `buildspec.yml` | auto-deploy of the render service to the test fleet |

**Path filtering:** the job's Git SCM carries *included regions*
(`render-service/.*`, `fonts/.*`, `buildspec\.yml`). The GitHub hook
wakes Jenkins to poll, and polling honours those regions — so a push
that only touches `tvos/`, the Roku channel (`components/`, `source/`,
`images/`, `media/`, `manifest`) or documentation triggers **no build
and no fleet restart**. A manual *Build Now* always builds, regardless,
which is the escape hatch for a forced redeploy.
| `roku-channel` | `manifest`, `components/**`, `source/**`, `images/**`, `media/**`, `fonts/**`, `package.sh` | signed channel zip as a build artifact; store submission stays manual |
| `tvos-app` | `tvos/**` | archive; optional TestFlight upload; App Store release manual |

`fonts/**` deliberately triggers two jobs — a font change affects both
the service image and the channel bundle.

**Service pipeline steps** (Jenkins orchestrates the existing
CodeBuild rather than building Docker itself: the image is ARM64 and
CodeBuild builds arm64 natively):

1. checkout
2. CI gates: `node --check` on every JS file; `render-service/test/`
   suites; fail if `render-service/portal-preview/` or `portal-patch/`
   reappears (both retired 2026-09-02)
3. package the deploy zip with the repo's packaging script (same logic
   humans use — do not hand-type the exclusion list)
4. upload to S3 → `codebuild start-build` tagged with the git SHA →
   wait
5. register a task-definition revision from `deploy/taskdef-<env>.json`
   with the new image
6. `ecs update-service` → wait for `services-stable`
7. smoke test: portal boots and one capture publishes, else fail

**Prod job difference:** do not rebuild. Find the image already built
and tested for that commit SHA, retag it `:prod`, deploy it. What was
tested is what ships.

**Jenkins IAM** (dedicated user/role, nothing broader): `s3:PutObject`
on the build bucket; `codebuild:StartBuild`/`BatchGetBuilds`;
ECR describe/get/put for retagging; `ecs:RegisterTaskDefinition`,
`ecs:UpdateService`, `ecs:DescribeServices`; `iam:PassRole` limited to
the task and execution roles.

### 7.3 Manual deploy (until Jenkins exists)

```
cd Mango-Display-Roku
zip -qr /tmp/source.zip buildspec.yml render-service fonts \
  -x "render-service/node_modules/*" "render-service/display_p*" \
     "render-service/overlay_*" "render-service/effect_*" \
     "render-service/ui_check_*" "render-service/*.manifest.json" \
     "render-service/display.json" "render-service/display.jpg" \
     "render-service/.version" "render-service/.asset-prefix" \
     "render-service/calendar-override.json" "render-service/displays/*"
aws s3 cp /tmp/source.zip s3://roku-render-build-945710099949/source.zip
aws codebuild start-build --project-name roku-render-build
# wait for SUCCEEDED, then:
aws ecs update-service --cluster roku-render --service roku-render --force-new-deployment
```

Deploys restart the fleet: TVs keep showing cached pages and portals
reopen on the next poll. Expect ~60–90 s.

### 7.3b What a deployment does to a watching user

Settings: `minimumHealthyPercent 100`, `maximumPercent 200`, target-group
deregistration delay 60s. ECS starts the NEW task before stopping the
old, so there is never zero capacity.

What the user sees: **essentially nothing.**

- The display never blanks - page images are on CloudFront and already
  cached on the device.
- No spinner: a deploy's render is "startup"/background (rank 1), and
  the spinner is reserved for user-driven work.
- Clock, countdowns, weather and effect animations keep running; they
  are native on the device and independent of the server.
- Worst case the display is a minute or two stale, then refreshes.

What genuinely drops:

- **The display's WebSocket**, for ~15-30s, while the old portal closes
  and the new one boots. No data is lost: the new portal loads current
  state from the API on boot, so anything pushed during the gap appears
  in the first render after.
- **An interaction mid-deploy** may be slow or need a retry if it lands
  on a task whose portal has not opened yet.

Two caveats:

- **Brief double-socket window.** While the new task is live and the old
  is draining, both can hold a portal for the same display, and the
  backend closes one of the two sockets. It resolves as the old task
  exits; the 60s deregistration delay bounds it.
- **Cold sprite cache.** A fresh container (deploy OR Spot interruption)
  has no filmed sheets. Filming used to block the first publish for
  40-90s; since 2026-09-01 both the calendar cells and the widget icons
  defer it - the page publishes immediately and the animations arrive a
  few seconds later.

**The deployment circuit breaker is ENABLED on test (2026-09-01) and
must be enabled on production too.** With it on, ECS gives up on a
deployment whose tasks keep failing to start or stay healthy and rolls
back to the last good task definition on its own, instead of leaving a
broken deploy up until someone notices. Jenkins still fails the build,
so you get both the automatic recovery and the alert:
```
aws ecs update-service --cluster <c> --service <s> \
  --deployment-configuration \
  "deploymentCircuitBreaker={enable=true,rollback=true},minimumHealthyPercent=100,maximumPercent=200"
```

### 7.4 Rollback

```
# list revisions, pick the previous one
aws ecs list-task-definitions --family-prefix roku-render-prod --sort DESC
aws ecs update-service --cluster roku-render-prod --service roku-render-prod \
  --task-definition roku-render-prod:<N-1> --force-new-deployment
```
~90 seconds. Keep an ECR lifecycle policy retaining the last ~20 images
so rollback targets still exist.

---

## 8. Monitoring and alarms

Create in both environments (prod at minimum):

| Alarm | Threshold | Meaning / action |
|---|---|---|
| `RunningTaskCount` | at the scaling maximum (14) for 15 min | The $500 spend limit is engaged; fleet has outgrown it — raise `--max-capacity` (and the budget) if the growth is real |
| `Refusing` (custom, per task) | 1 for 10 min | A task is full and scaling has not caught up — check memory/CPU, task count, and whether the maximum binds |
| `UnhealthyWorkers` (custom) | > 0 for 15 min | A display's portal will not open after three tries — read that display's log (`portal open failed`, `portal console before the failure`) |
| Target group `UnHealthyHostCount` | > 0 for 5 min | `/healthz` is failing: ownership store down or nothing publishing — ECS replaces the task; if it repeats, the cause is upstream |
| DynamoDB `ThrottledRequests` / `SystemErrors` on the owner table | any | Claims and renewals failing; leases will lapse and displays hand over needlessly |
| ALB `HTTPCode_Target_5XX_Count` | > 10 in 5 min | Service erroring; check logs |
| AWS Budget "Roku render service" | $250 and $400 (of the $500 limit) | Growth notice — email to Dave |
| Deployment failure (EventBridge `ECS Deployment State Change` = FAILED) | any | Roll back (§7.4) |

Route to email/SNS the team actually reads. **Alerting is what makes
capacity management calm** — resizing is a two-minute planned action if
you get warned, and an outage if you do not.

Useful log greps (`/ecs/roku-render*`):
- `claimed <device>` / `ownership: lost` / `released every row` — the ownership layer at work
- `refusing <device>` — a task declined a new display (full)
- `UNHANDLED REJECTION (contained)` — a worker bug that would have restarted the whole task before 2026-09-07
- `live portal ready` — a display's portal booted
- `captured page(s) ... (reason)` — every render, with why
- `preempting in-flight render` — a user edit jumped the queue
- `[portal error]` — errors from inside the portal page

---

## 9. Capacity, scaling, and growth

### Decision (2026-09-06/07, Dave)

**Scale out on ECS auto-scaling with the display ownership layer.**
One ECS service, any number of tasks, scaled by ECS on the service's
real memory and CPU. A hard spend limit of **$500/month**, enforced as a
**14-task maximum**. Stay on Fargate: one on-demand base task, Fargate
Spot for every task above it. No EC2, no instances. Nobody adds or
removes tasks by hand.

(This replaces the 2026-08-29 single-task / vertical-scaling decision.
The reasoning there was right about the constraint; ownership is what
removes it.)

### How ownership works (`render-service/ownership.js`, `fleet.js`)

1. A device's poll lands on any task via the load balancer.
2. The task looks the display up in the ownership table (DynamoDB
   `roku-display-owner-<env>`, key `deviceId`).
3. If this task owns it: serve. If another task owns it: **forward** the
   request to that task's private address (`taskAddr`) and relay the
   reply — the device never sees the hop. If nobody owns it: **claim**
   with a conditional write, unless this task is refusing.
4. Ownership is a **lease**: 90 s, renewed every 30 s. A task that dies
   stops renewing and its displays become claimable within 90 s. A task
   that stops cleanly (deploy, scale-in, Spot reclaim) **releases its
   rows first**, so the hand-over takes one poll, not one lease.
5. A task **refuses** new claims (`admission()` in fleet.js) when its
   own memory passes 85% or its CPU has held above 70% for 30 s
   (`usage.js`), while 4 or more of its portals are still booting, or
   after 20 claims in the last minute. The device gets a 503 with
   `Retry-After: 5`, re-polls, and lands on a less loaded task. The
   booting/rate limits exist because usage lags: a fresh task once took
   89 displays in ninety seconds before its CPU sample moved.

Every reply carries `x-mm-owner: <taskId>`; the simulator uses it to
prove no display ever has two owners.

Measured in the phase 0–3 drills (2026-09-07, ~600,000 polls, zero
double owners): sudden death → every display re-claimed 85–125 s after
the kill; clean shutdown, deploy and real Fargate Spot reclaims → rows
released within 1 s, displays re-claimed in 8–75 s where a task had
room (up to ~6 min when the whole fleet was refusing at the ceiling).
A rolling deploy of 14 tasks under load cost the polling devices one
hand-over each and not one failed poll.

### Scaling settings

| Setting | Value | Why |
|---|---|---|
| Scale-out / scale-in | target tracking on `ECSServiceAverageMemoryUtilization` 70% and `ECSServiceAverageCPUUtilization` 65% | ECS follows whichever asks for more tasks. Built-in metrics, no custom metric. |
| Task range | min 1, **max 14** | The $500/month limit: one on-demand task (~$89) + 13 Spot tasks (~$27–30 each) + the ALB/logs floor. Recompute if the task size changes. |
| Cooldowns | scale-out 120 s, scale-in 300 s | A task takes ~1 min to become healthy. Target tracking removes ONE task per scale-in cooldown at low load (measured: 14→13→12 at 15-min steps), so 15 min meant hours of idle Spot tasks after a peak; 5 min drains a peak in about an hour. |
| Claim refusal | memory ≥ 85%, CPU ≥ 70% for 30 s, ≥ 4 portals booting, or 20 claims/min | `REFUSE_MEM_FRACTION`, `REFUSE_CPU_FRACTION`, `REFUSE_CPU_SUSTAIN_MS`, `MAX_BOOTING`, `MAX_CLAIMS_PER_MIN` |
| Lease | 90 s, renew 30 s | `OWNERSHIP_LEASE_MS`, `OWNERSHIP_RENEW_MS` |
| Capacity | `FARGATE` base 1 weight 1, `FARGATE_SPOT` weight 4 | One task can never be reclaimed; the rest are ~70% off. |
| Deregistration delay | 60 s | Lets an in-flight 50 s long-poll finish before a draining task goes. |

A display count is deliberately **not** the scaling signal: a one-page
clock and a five-page calendar wall are different loads. `OwnedDisplays`
is published per task and per service for dashboards and alarms only.

### Environment variables (fleet)

| Variable | Meaning |
|---|---|
| `OWNERSHIP` | `off` (single task, the default), `memory` (one process, tests), `dynamo` (the fleet) |
| `OWNERSHIP_TABLE` | the DynamoDB table |
| `TASK_ID`, `TASK_ADDR` | overrides; on Fargate both come from the task metadata endpoint |
| `SIM_DISPLAYS=1` | accept synthetic `SIM*` displays (test only; refuses to start on a prod API base) |
| `SERVICE_NAME` | metric dimension (`roku-render-test` / `roku-render-prod`) |
| `RENDER_CONCURRENCY` | render slots per task (2 on the 2 vCPU task) |
| `MAX_BOOTING`, `MAX_CLAIMS_PER_MIN` | admission control (4, 20) |
| `HEALTH_STALE_MS` | `/healthz` fails when watched displays have asked for captures and nothing published for this long (15 min) |

### Load and ownership testing

`render-service/sim-devices.js` is the device simulator: N pretend TVs polling
`/wait` exactly like the channel, reporting owners, hand-overs, gaps
and every 503 by reason. It pairs with `SIM_DISPLAYS=1` on the service,
which maps `SIM*` ids onto the "claude test" layout in designer mode
(no socket, so hundreds coexist). Phase 0 runs three service processes
on a laptop against the real test table:

```
VERSION_PORT=8191 TASK_ID=laptop-A TASK_ADDR=127.0.0.1:8191 OWNERSHIP=dynamo \
  OWNERSHIP_TABLE=roku-display-owner-test SIM_DISPLAYS=1 node render-service/fleet.js
node render-service/sim-devices.js --base http://127.0.0.1:8191,http://127.0.0.1:8192,http://127.0.0.1:8193 --count 24 --ramp 40
```

Exit code 2 from the simulator means a double owner was seen.

For the cluster, run it as a throwaway task from the same image (task
definition `roku-sim`, 0.25 vCPU / 0.5 GB, Spot; the soak in phase 4
ran 100 synthetic devices from it):

```
aws ecs run-task --cluster roku-render --task-definition roku-sim --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[<subnet>],securityGroups=[sg-0cef8da8f496529ed],assignPublicIp=ENABLED}" \
  --capacity-provider-strategy capacityProvider=FARGATE_SPOT,weight=1 --tags key=Project,value=Roku
```

Stop it with `aws ecs stop-task`; its displays evict from the fleet
after 30 idle minutes.

### Capacity (per task, 2 vCPU / 8 GB) — measured 2026-09-07

**CPU binds long before memory.** An idle live portal costs ~150–165 MB
and, before the idle-repaint guard, ~5% of the task's 2 vCPU: 16–22
portals put a task at 83–100% CPU with memory at 35–41% of 8 GB. So a
task held **~18–20 watched displays** and 14 tasks ≈ **~250**, not the
1,000 the plan assumed from the 2026-08-24 memory-only test.

Where the CPU goes (one idle portal on a laptop, ~30% of a core): the
six weather-icon SVG `<img>`s animate themselves and Chromium repaints
them at frame rate (~half); timers/rAF/CSS animations ~5%; the rest is
image/marquee repainting. The service now hides the SVG icons while a
portal is idle (`html.mm-idle`, lifted for every capture — the device
draws them natively anyway). The remaining idle repaint is a **portal
PR**: in painted mode nothing should repaint between changes. Each
halving of idle CPU doubles displays per task and halves the cost per
display, which is the lever that reaches the 50-cent target.

Re-measure after every such change: the simulator ramp (below) gives
the number in ten minutes.

### Auto-scaling timing (measured)

Target tracking needs three 1-minute datapoints past the target, then
provisions: the first scale-out came ~5 min after CPU crossed the
target, then one task per minute. Admission control is what keeps the
tasks healthy in that window; devices past capacity retry every 5 s
until a task has room. Scale-in follows the 15-minute cooldown.

Four real Fargate Spot interruptions landed during the ramp; each task
released its rows within a second of the warning.

### Startup after a restart or deploy

Every display of a dead task re-claims within a lease, then re-renders.
With one render slot per vCPU those renders queue: measured on a laptop,
the last of 10 displays behind one slot waited ~5 minutes for its first
capture. TVs show cached pages meanwhile (no spinner — a service
restart is not an app launch). At scale this is why `RENDER_CONCURRENCY`
tracks vCPUs and why the 15-minute scale-in cooldown exists.

## 10. Three artifacts, three release cadences

| Artifact | Version identity | Release tag | Ships via |
|---|---|---|---|
| render service | image tag = git SHA | `service-<semver>` | Jenkins → ECS (continuous) |
| Roku channel | `manifest` `major.minor.build` | `roku-channel-<x.y.z>` | Roku dashboard, store review |
| Apple TV app | bundle version | `tvos-<x.y.z>` | App Store Connect / TestFlight |

**The service will always be ahead of the TVs.** That is the design.
It stays safe on one rule:

> New manifest fields must be **ignorable by older clients**. A TV that
> does not know a field must behave as it did before, not break.

If a genuinely breaking change is ever needed, the escape hatch exists:
every device sends its channel version in the poll (`major`/`minor`), so
the service can serve an older manifest shape to older clients.

`TVOS_PARITY_QUEUE.md` tracks client-side work the service has gotten
ahead of; `tvos/PARITY.md` records which Roku commit the tvOS app
matches. Update both when porting.

Beta/staged rollout: Roku beta channels take up to 20 testers and
**expire after 120 days**; TestFlight allows 10,000 external testers
with builds expiring after 90 days.

---

## 11. Troubleshooting

**A display stopped updating.**
Check `RunningTaskCount` first (Spot interruption or crash), then grep
the log for the device id. `live portal ready` missing → the portal
failed to boot; look for `[portal error]`. The TV keeps showing cached
pages throughout, which is why this is rarely urgent.

**Everything is slow after an edit.**
Look at the render reasons in the log. A background render (`scheduled`,
`midnight`) in flight used to make edits wait; user edits now preempt
(`preempting in-flight render`). If you see repeated `midnight`
captures at odd hours, the portal's day-rollover guard has regressed.

**Images look stale / wrong art.**
Sprite sheets are content-hashed; a regenerated sheet gets a NEW
filename by design. If art is stale, something is serving an old
manifest — check the CloudFront cache headers (page images are
`no-cache`, sheets are 1-year immutable) and the version in
`display.json`.

**A portal change didn't reach displays.**
If `PORTAL_PREVIEW_DIR` or `PORTAL_PATCH_DIR` is set on the task
definition, the service is serving its own copy of the named file(s) and
masking the deployed portal. Neither should be set (§1, rule 3); drop it
with a new task-definition revision.

**`[portal error] 403` lines.**
Known benign class: display-scoped API calls the portal makes that the
render session is not authorised for. Rendering is unaffected. Do not
chase unless captures are actually failing.

**Spot interruption (test).**
Two-minute warning, task dies, ECS restarts it when capacity frees.
Displays ride it out on cached pages. If capacity is unavailable for a
long stretch, temporarily switch the service to `FARGATE`:
```
aws ecs update-service --cluster roku-render --service roku-render \
  --capacity-provider-strategy capacityProvider=FARGATE,weight=1,base=1 \
  --force-new-deployment
```

---

*Written 2026-08-28. Keep this current: if you change how something is
deployed, change it here in the same commit.*
