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

**Current spend: effectively zero.** Nothing is running. No task, no load
balancer, no data.

Nothing existing was modified. The VPC, its subnets, route tables and
internet gateway were read but not touched, and nothing else in the
account was gone near.

## Deliberately not done yet

- **No inbound rule on the security group.** There is no service behind it
  yet, so there is nothing to expose.
- **No ALB, no ECS service, no running task.** These are the parts that
  cost money, and they need the image and R2 first.

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

## Blocked on

1. ~~Cloudflare bucket and token~~ — done.
2. ~~Credentials into Secrets Manager~~ — done.
3. **DNS** for `roku-control` → the load balancer, once it exists. Assets
   need no DNS while on the r2.dev URL.

## Teardown

If any of this needs to disappear:

```
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
