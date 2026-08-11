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
| Assets | Cloudflare R2 — free egress is the one line item that otherwise scales forever |
| VPC | existing `vpc-0405158ee9ea3d85b` (172.16.0.0/16) |
| Hostnames | `roku-assets.mangodisplay.com`, `roku-control.mangodisplay.com` |

**No NAT gateway is needed.** That VPC already routes `0.0.0.0/0` through
`igw-01061c68769d44c71` on both subnets, so Fargate tasks run with a
public IP and reach the portal, API and R2 directly. Saves ~$32/month plus
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
| 17 | Listener | HTTP :80 -> target group | free |
| 18 | Task definition | `roku-render:1`, 1 vCPU / 2GB, ARM64 | free |
| 19 | ECS service | `roku-render`, 1 task | ~$36/mo |

**Live at** `http://roku-control-1212257186.us-east-1.elb.amazonaws.com`
— the only address compiled into the channel. Everything else, including
where images live, is learned from it at runtime.

**Running cost: roughly $55/month** for one display. The load balancer is
fixed; the task handles many displays once the fleet manager lands.

Nothing pre-existing was modified. The VPC, its subnets, route tables and
internet gateway were read but only added to; nothing else in the account
was touched.

## Cloudflare R2

| | |
|---|---|
| Account ID | `8ed09dea0b5cd688d9d200627603e0be` |
| Bucket | `mango-display-assets` |
| Public base | `https://pub-8ecd1ea9ae404328b96820980559dd49.r2.dev` |
| Credentials | `mangomirror-staging-secrets` -> `CLOUDFLARE_ROKU_ACCESS_KEY`, `CLOUDFLARE_ROKU_SECRET_ACCESS_KEY` |
| Local testing | AWS CLI profile `mango-r2` on Dave's Mac |

Each display publishes under a random 16-byte prefix
(`/<prefix>/display.json`). The bucket is public because TVs fetch
without credentials, so the prefix is the only thing keeping one
household's calendar, chores and photos out of reach of anyone who knows
the hostname. It is handed to the device over the control channel, never
published anywhere.

The r2.dev URL is rate-limited and has no Cloudflare caching - fine for
Stage 1, replace with a custom domain before real displays. The device
reads its asset base from the control channel, so that swap is
configuration, not a channel rebuild.

**Worth fixing before production:** the R2 keys live in the shared
`mangomirror-staging-secrets` bundle. ECS injects only the two Cloudflare
values, but the IAM grant is on the whole secret, so a compromised render
container could read every staging credential in it. A dedicated secret
for this service removes that.

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
- **HTTP, not HTTPS.** Fine for the test backend, needs a certificate
  before production - the device would need the new scheme.

## Blocked on

1. ~~Cloudflare bucket and token~~ — done.
2. ~~Credentials into Secrets Manager~~ — done.
3. **DNS** — optional. `roku-control.mangodisplay.com` could point at the
   load balancer instead of its AWS hostname, which would also let the
   address survive rebuilding the ALB. Assets need no DNS on the r2.dev
   URL. Neither blocks anything today.

## Teardown

If any of this needs to disappear:

```
# stop the running service FIRST - this is what costs money
aws ecs update-service --cluster roku-render --service roku-render --desired-count 0
aws ecs delete-service --cluster roku-render --service roku-render --force
aws elbv2 delete-listener --listener-arn arn:aws:elasticloadbalancing:us-east-1:945710099949:listener/app/roku-control/943befa1af8d0dee/ca5a7ad5bd0cea45
aws elbv2 delete-load-balancer --load-balancer-arn arn:aws:elasticloadbalancing:us-east-1:945710099949:loadbalancer/app/roku-control/943befa1af8d0dee
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
