# Production infrastructure

Everything created for the hosted render service, in order, with what it
costs and how to remove it. Account **945710099949**, region
**us-east-1**. Everything is tagged `Project=Roku` — including anything
added for tvOS later, so cost tracking stays under one label.

> Cost allocation tags are not retroactive and must be switched on by
> hand: Billing → Cost allocation tags → activate `Project`. Until that is
> done these resources will not group in Cost Explorer.

## Decisions

| | |
|---|---|
| Region | us-east-1, alongside the existing stack |
| Compute | Fargate to start; EC2 Graviton spot later once the load profile is known (~$115 vs ~$40 per 1,000 displays/month) |
| Assets | S3 `mango-roku-assets` behind CloudFront (flat-rate Pro plan, $15/mo for 50TB — replaced R2 2026-08-27; free egress stopped being unique and R2's custom domain wanted the DNS zone on Cloudflare) |
| VPC | existing `vpc-0405158ee9ea3d85b` (172.16.0.0/16) |
| Hostnames | `rokuassets.mangodisplay.com` (assets, LIVE), `roku-control.mangodisplay.com` (prod control, pending) |

**No NAT gateway is needed.** That VPC already routes `0.0.0.0/0` through
`igw-01061c68769d44c71` on both subnets, so Fargate tasks run with a
public IP and reach the portal, API and S3 directly. Saves ~$32/month plus
per-GB processing.

## Created so far

| # | Resource | Identifier | Cost |
|---|---|---|---|
| 1 | ECR repository | `mango-display-render` | storage only, pennies |
| 2 | ECS cluster | `roku-render` | free — only tasks cost |
| 3 | CloudWatch log group | `/ecs/roku-render` | free until logs arrive |
| 4 | Log retention, 14 days | on the above | prevents unbounded growth |
| 5 | IAM role | `roku-render-execution` + `AmazonECSTaskExecutionRolePolicy` | free |
| 6 | IAM role | `roku-render-task` | free |
| 7 | Security group | `sg-00d529710ca26dcc1` | free |
| 8 | Inline policy `read-r2-credentials` on `roku-render-execution` | reads one secret ARN | free |
| 9 | S3 bucket for build source | `roku-render-build-945710099949` | pennies |
| 10 | IAM role + policy | `roku-render-build` (CodeBuild) | free |
| 11 | CodeBuild project | `roku-render-build`, ARM, privileged | ~$0.05 per build |
| 12 | Container image | `mango-display-render:v1` in ECR, 568MB, arm64 | storage only |
| 13 | Security group rule | port 80 from anywhere -> `roku-render-sg` | free |
| 14 | Security group | `roku-render-task-sg` (`sg-0cef8da8f496529ed`), 8091 from the ALB only | free |
| 15 | Application Load Balancer | `roku-control`, idle timeout **120s** | ~$17/mo |
| 16 | Target group | `roku-control-tg`, health check `/version` | free |
| 17 | ~~Listener HTTP :80~~ | removed 2026-08-11 with its :80 SG rule — the endpoint is HTTPS-only | — |
| 18 | Task definition | `roku-render:1`, 1 vCPU / 2GB, ARM64 | free |
| 19 | ECS service | `roku-render`, 1 task | ~$36/mo |
| 20 | Listener | HTTPS :443 -> target group, `*.mangodisplay.com` ACM cert (shared with the main product — NOT ours to delete), TLS13-1-2-2021-06 | free |
| 21 | Security group rule | port 443 from anywhere -> `sg-00d529710ca26dcc1` | free |
| 22 | DNS | `roku-control` CNAME -> the ALB, in **WordPress.com** DNS (mangodisplay.com's host), added by Dave 2026-08-11 | free |

**Live at** `https://roku-control.mangodisplay.com`
— the only address compiled into the channel, and it survives an ALB
rebuild (re-point the CNAME). Everything else, including where images
live, is learned from it at runtime.

**Running cost: roughly $55/month** for one display. The load balancer is
fixed; the task handles many displays once the fleet manager lands.

Nothing pre-existing was modified. The VPC, its subnets, route tables and
internet gateway were read but only added to; nothing else in the account
was touched.

## Assets — S3 + CloudFront (replaced Cloudflare R2, 2026-08-27)

| | |
|---|---|
| Bucket | `mango-roku-assets` (us-east-1, fully private, tag `Project=Roku`) |
| Distribution | `ERYTMHZUWUXMT` — `https://rokuassets.mangodisplay.com` (alias) / `d1qjms2klzrc83.cloudfront.net` |
| Plan | CloudFront flat-rate **Pro** ($15/mo, 50TB + bundled WAF/DDoS) — enrolled by Dave |
| Origin access | OAC `E2VP9FNAB45830`; bucket policy allows only this distribution. No public S3 access |
| Cache policy | `Managed-CachingOptimized` — flat-rate plans allow only MANAGED policies, and every managed policy that keys on query strings also forwards the `Host` header, which breaks S3 origins (bucket resolution follows Host; existing keys 404). Correctness lives in upload Cache-Control instead: `display.json` no-store, page images no-cache (revalidate per fetch), content-named sprite art 1y immutable |
| Publish auth | task role `roku-render-task` (`s3:PutObject/DeleteObject` on the bucket) — no stored keys |
| Prefix secret | `roku-asset-prefix-secret` (Secrets Manager, injected as `ASSET_PREFIX_SECRET`) — dedicated and stable; task-role temporary creds rotate, so the old fall-back-to-secret-key derivation would have rotated every display's prefix per deploy |
| DNS | `rokuassets` CNAME + ACM validation CNAME live on WordPress.com DNS (Dave's dashboard). Leave the validation record: it auto-renews cert `93c60abd-…` |
| Env | `ASSET_BUCKET`, `ASSET_PUBLIC_BASE`, `ASSET_ROOT` (`test`/`prod`) on the task definition |

Each display publishes under an environment root plus its derived
prefix (`/test/<prefix>/display.json`, `/prod/<prefix>/…` — `ASSET_ROOT`
on the service). The bucket is private to CloudFront, but paths are the
real privacy boundary for TVs (they fetch without credentials): the
prefix keeps one household's calendar, chores and photos out of reach
of anyone who knows the hostname. It is handed to the device over the
control channel, never published anywhere.

Prod uses the SAME bucket and distribution with `ASSET_ROOT=prod` — one
CloudFront for both environments (Dave's call).

Cloudflare is fully retired: Dave deleted the R2 bucket and API token
(2026-08-27), so task definitions ≤5 cannot be rolled back to. The
`CLOUDFLARE_ROKU_*` entries in `mangomirror-staging-secrets` are inert
leftovers. The old shared-secret exposure note is resolved: this service
no longer reads that bundle at all.

## Building the container

Built on CodeBuild, not a laptop - rebuilds should not depend on anyone's
machine being awake, and Docker Desktop on macOS is a liability.

```
# after changing render-service/ or the Dockerfile:
cd ~/Projects/Mango-Display-Roku
zip -qr /tmp/source.zip buildspec.yml render-service fonts \
  -x "render-service/node_modules/*" "render-service/display_p*" \
     "render-service/overlay_*" "render-service/effect_*" \
     "render-service/ui_check_*" "render-service/*.manifest.json" \
     "render-service/display.json" "render-service/display.jpg" \
     "render-service/.version" \
     "render-service/.asset-prefix" "render-service/calendar-override.json" \
     "render-service/displays/*"
aws s3 cp /tmp/source.zip s3://roku-render-build-945710099949/source.zip
aws codebuild start-build --project-name roku-render-build
```

Two traps already hit, both fixed in the Dockerfile:

- **Do not pull from Docker Hub.** Builds run from shared AWS addresses
  and anonymous pulls are rate-limited (429). Use
  `public.ecr.aws/docker/library/...` - same image, no credentials.
- **Do not pin a `playwright:vX` base image.** It ships a browser matched
  to one library version, and this project already drifted (code on
  1.61.1, Dockerfile pinned to 1.47.0) - which fails at runtime, not at
  build. The browser is installed by the same Playwright that drives it.

## Cutover notes

- **The ALB idle timeout is 120s, not the default 60s.** The control
  channel is a long poll held for ~50s and the client waits 55s; the
  default would sever it.
- **One socket per display identity.** The backend closes duplicate
  connections for the same display. The fleet manager guarantees one
  worker per display *within* one task — which is why the service is
  **single-task by design**. Scaling desired-count past 1 puts two
  sockets on every display and they fight forever; scaling out needs a
  partitioner in front, not a bigger number.
- **Asset prefixes are derived, not stored** —
  HMAC(secret, deviceId), where the secret is `ASSET_PREFIX_SECRET` or,
  failing that, the R2 secret key. They survive redeploys (the ephemeral
  `.asset-prefix` file did not — every deploy used to orphan the
  display's objects). Rotating the R2 key rotates every prefix: devices
  learn the new base on their next poll, the old objects orphan once.
- **`DISPLAY_*` env vars are now the legacy fallback**, serving requests
  that carry no identity: the pre-identity channel and the balancer's
  health check. Keep them until every fielded channel sends identity;
  after that they can be dropped and the fleet starts empty.
- **During a deploy, both tasks publish the same R2 prefixes** — last
  writer wins. A code fix in the new image can be transiently reverted
  on R2 by the draining task's final renders and only sticks at the new
  task's next publish (≤20 min, usually minutes via a data push). The
  target group's deregistration delay is the size of that window; it
  only needs to exceed the 50s long-poll hold, so set it to 60s
  (default is 300):
  `aws elbv2 modify-target-group-attributes --target-group-arn <roku-control-tg arn> --attributes Key=deregistration_delay.timeout_seconds,Value=60`
- **HTTPS-only since 2026-08-11.** The control reply carries the
  display's asset prefix - the household's only content secret - so the
  :80 listener is gone, not redirected. The cert is the product's
  existing `*.mangodisplay.com` wildcard; ACM renews it automatically.

## Production runbook (decided 2026-08-11, execute on Dave's go)

Same physical infrastructure, two running services — the deployable unit
is the blast-radius boundary, so test deploys can never restart
production households. Shared: ALB + cert + listener, cluster, ECR,
CodeBuild, R2 bucket, IAM. Duplicated: target group, task definition,
service, log group.

The environment matrix (test values are live; prod confirmed from the
portal's `environment_config.js` and the webapp's `environment.prod.ts`):

| | test | prod |
|---|---|---|
| Control | `roku-control-test.mangodisplay.com` | `roku-control.mangodisplay.com` |
| API | `testapi.mangomirror.com/v1.0.5/` | `api.mangomirror.com/<VERSION>/` — **Dave decides VERSION** (portal prod block and Tizen both use v1.0.5; prod webapp uses v1.0.16) |
| Portal | `testportal.mangodisplay.com` | `portal.mangodisplay.com` |
| Socket | `testsocket.mangomirror.com` | `socket.mangomirror.com` |
| Setup host | `testapp.mangodisplay.com` | `app.mangodisplay.com` |
| `ASSET_ROOT` | `test` | `prod` |
| Channel build | `./package.sh` (default) | `PROD_API_VERSION=vX ./package.sh prod` |

Prerequisites, in order:
1. Device API version confirmed (Dave).
2. `saveMirror` verified working **on prod api** — it is pairing's front
   door; a broken prod saveMirror means no Roku can ever join.
3. The dedicated secret (`roku-render-prod`: R2 keys, optionally
   `ASSET_PREFIX_SECRET`) + execution-role grant for it.

Steps (each is one CLI call unless noted):
1. Create target group `roku-control-prod-tg` — copy of
   `roku-control-tg` (port 8091, health `/version`, same VPC), and set
   its deregistration delay to 60s.
2. Register task definition `roku-render-prod`: same container, image
   pinned to an **immutable tag** (see promotion below), env from the
   prod column, `ASSET_ROOT=prod`, **no `DISPLAY_*`**, prod secret ARNs.
3. Create service `roku-render-prod` on the same cluster (1 task, same
   subnets + task security group, prod target group). Check the log
   banner prints `*** PRODUCTION ***`.
4. Verify prod health via the ALB with a host header before exposing it:
   `curl -H "Host: roku-control.mangodisplay.com" https://roku-control-test.mangodisplay.com/version --resolve ...`
   (any hostname reaches the ALB; rules are what matter next).
5. Add listener host rules on the :443 listener:
   `roku-control-test.…` → `roku-control-tg` (the existing default keeps
   serving until this moment), `roku-control.…` → `roku-control-prod-tg`;
   then set the default action to fixed-response 404 so scanners and
   stale names get nothing.
6. Build the prod channel (`PROD_API_VERSION=vX ./package.sh prod`) and
   pair a real device end to end: fresh code on screen → claim at
   app.mangodisplay.com → content renders → R2 keys land under `prod/`.

Promotion flow (how prod updates after that): CodeBuild pushes every
build to the mutable `v1`/`latest` tags, which is what the TEST service
tracks — fine for test, never for prod. To promote a build that proved
out on the test TV, re-tag that exact image immutably and move prod to
it:
```
MANIFEST=$(aws ecr batch-get-image --repository-name mango-display-render \
  --image-ids imageTag=v1 --query 'images[0].imageManifest' --output text)
aws ecr put-image --repository-name mango-display-render \
  --image-tag prod-YYYYMMDD --image-manifest "$MANIFEST"
# then register a roku-render-prod revision pointing at :prod-YYYYMMDD
# and update-service --force-new-deployment
```
Test keeps deploying freely the whole time; the two services never share
a deploy.

Idle thrift: the test service can sit at zero between sessions —
`aws ecs update-service --cluster roku-render --service roku-render --desired-count 0`
(and `1` to wake it; TVs resurrect their workers by polling). Running
both 24/7 is ~$91/month, prod alone ~$55.

Also before real customers: a custom domain for assets — the r2.dev URL
is rate-limited and uncached. One domain serves both `test/` and `prod/`
folders, and devices pick it up at runtime with no channel change.

## Blocked on

1. ~~Cloudflare bucket and token~~ — done.
2. ~~Credentials into Secrets Manager~~ — done.
3. ~~DNS~~ — done 2026-08-11: `roku-control.mangodisplay.com` and
   `roku-control-test.mangodisplay.com` CNAME to the ALB from
   WordPress.com DNS. Assets still ride the r2.dev URL (custom domain
   for them remains a pre-production item, above).
4. **Production go** — waiting on the device API version (Dave) and a
   prod `saveMirror` check; everything else is written above.

## Teardown

If any of this needs to disappear:

```
# stop the running service FIRST - this is what costs money
aws ecs update-service --cluster roku-render --service roku-render --desired-count 0
aws ecs delete-service --cluster roku-render --service roku-render --force
aws elbv2 delete-listener --listener-arn arn:aws:elasticloadbalancing:us-east-1:945710099949:listener/app/roku-control/943befa1af8d0dee/7c528dc40e20576f
aws elbv2 delete-load-balancer --load-balancer-arn arn:aws:elasticloadbalancing:us-east-1:945710099949:loadbalancer/app/roku-control/943befa1af8d0dee
# do NOT delete the *.mangodisplay.com ACM cert - it belongs to the main
# product; also remove the roku-control CNAME in WordPress.com DNS by hand
aws elbv2 delete-target-group --target-group-arn arn:aws:elasticloadbalancing:us-east-1:945710099949:targetgroup/roku-control-tg/3f7379948f5b9ebf
aws ecs delete-cluster --cluster roku-render
aws ecr delete-repository --repository-name mango-display-render --force
aws logs delete-log-group --log-group-name /ecs/roku-render
aws iam detach-role-policy --role-name roku-render-execution \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
aws iam delete-role --role-name roku-render-execution
aws iam delete-role --role-name roku-render-task
aws ec2 delete-security-group --group-id sg-00d529710ca26dcc1
```

Everything above is standalone — removing it affects nothing else in the
account.
