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
   closes duplicate sockets for the same device id. This is why the
   service must run as a **single task** today (see §9). **Never set
   `desiredCount` above 1** without the display→task router built.
2. **The portal is the only source of "ready to screenshot".** Never
   add timers or heuristics on the service or device side to guess
   when a render is done.
3. **Painted mode must be present in the portal the service loads.**
   Until portal PR #68 is deployed to a given environment, the service
   injects vendored copies of two portal files (`PORTAL_PREVIEW_DIR`).
   That shim must be removed once the portal deploys — while it is
   live it MASKS later portal changes to `mainController.js`.

---

## 2. Environment inventory

### Test (live today)

| Thing | Value |
|---|---|
| ECS cluster / service | `roku-render` / `roku-render` |
| Task definition | `roku-render` (ARM64, 1 vCPU / 2 GB) |
| Capacity | `FARGATE_SPOT` weight 1, base 0 |
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

| Item | Test (today) | Prod at launch |
|---|---|---|
| Fargate task | ~$9 (Spot, 1 vCPU/2 GB) | ~$34 (on-demand, 1 vCPU/4 GB) |
| ALB | ~$17 | ~$17 |
| Logs / ECR / Secrets | ~$3 | ~$3 |
| Assets (S3 + CloudFront) | shared $15 Pro plan, covers both | — |
| **Total** | **~$29** | **~$54** |

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
| `test-release-auto-deploy` | test fleet |
| `prod-release-auto-deploy` | prod fleet |

Protect `prod-release-auto-deploy` so only release owners can merge.

### 7.2 Jenkins jobs (path-filtered — one repo, three artifacts)

| Job | Triggers on | Result |
|---|---|---|
| `roku-render-service` | `render-service/**`, `fonts/**`, `buildspec.yml`, `deploy/**` | auto-deploy to the branch's environment |
| `roku-channel` | `manifest`, `components/**`, `source/**`, `images/**`, `media/**`, `fonts/**`, `package.sh` | signed channel zip as a build artifact; store submission stays manual |
| `tvos-app` | `tvos/**` | archive; optional TestFlight upload; App Store release manual |

`fonts/**` deliberately triggers two jobs — a font change affects both
the service image and the channel bundle.

**Service pipeline steps** (Jenkins orchestrates the existing
CodeBuild rather than building Docker itself: the image is ARM64 and
CodeBuild builds arm64 natively):

1. checkout
2. CI gates: `node --check` on every JS file; `render-service/test/`
   suites; fail if `render-service/portal-preview/` still exists once
   portal PR #68 has shipped
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
| `MemoryUtilization` (ECS service) | > 70% for 15 min | Approaching the display ceiling → resize (§9) |
| Render-queue depth (custom metric, to be emitted) | sustained > 3 | Renders are queuing; raise `RENDER_CONCURRENCY` and/or vCPU |
| `RunningTaskCount` | < 1 for 5 min | Fleet is down — check Spot interruption / task crash |
| ALB `HTTPCode_Target_5XX_Count` | > 10 in 5 min | Service erroring; check logs |
| Deployment failure (EventBridge `ECS Deployment State Change` = FAILED) | any | Roll back (§7.4) |

Route to email/SNS the team actually reads. **Alerting is what makes
capacity management calm** — resizing is a two-minute planned action if
you get warned, and an outage if you do not.

Useful log greps (`/ecs/roku-render*`):
- `live portal ready` — a display's portal booted
- `captured page(s) ... (reason)` — every render, with why
- `preempting in-flight render` — a user edit jumped the queue
- `[portal error]` — errors from inside the portal page

---

## 9. Capacity and growth

### The hard constraint

**The service runs as ONE task.** Each display's portal holds that
display's backend socket, and the backend closes duplicates. Two tasks
behind the ALB would both open portals for the same display and fight
over its socket.

> **Never raise `desiredCount` above 1** on the current architecture.
> If memory is high, resize the task (below) — do not add tasks.
> Horizontal scaling requires the display→task router, which is not
> built yet.

### Growth is manual by design

Fargate task size is fixed in the task definition; a running task
cannot be resized, and AWS auto-scaling scales task *count*, not size.
So growth is a deliberate action:

1. Edit `deploy/taskdef-<env>.json`: raise `cpu`, `memory`, and
   `RENDER_CONCURRENCY` together.
2. Register the revision and update the service (a ~60–90 s rolling
   restart, same as any deploy).

### Capacity ladder

Two limits apply at once — memory (~181 MB per watched display) and
render slots (`RENDER_CONCURRENCY`, default **1**: the whole fleet
renders one page at a time).

| Task size | `RENDER_CONCURRENCY` | Realistic watched displays |
|---|---|---|
| 1 vCPU / 4 GB | 1 | ~20 |
| 2 vCPU / 8 GB | 2 | ~40 |
| 2 vCPU / 16 GB | 2–3 | ~80 |
| 4 vCPU / 30 GB | 4 | ~150 |
| 8 vCPU / 60 GB | 6 | ~300 |
| 16 vCPU / 120 GB (Fargate max) | 8–12 | ~600 (untested) |

Memory was measured (Phase 0 density test); the render-queue behaviour
at high display counts is **not** yet load-tested. Do that before
relying on the bottom two rows.

Beyond ~600 displays, or when the fleet needs high availability, build
the router: an always-on front door mapping display → task. It is also
the first component of the cheaper "socket sentinel" architecture
(see the cost brainstorm in the project memory).

---

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
If `PORTAL_PREVIEW_DIR` is still set, the service is serving its own
vendored copies of `mainController.js` / `paintedMode.js` and masking
the deployed portal. Remove the shim (§1, rule 3).

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
