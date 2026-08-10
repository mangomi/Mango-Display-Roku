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

## Blocked on

1. **Cloudflare**: create the R2 bucket and an S3-compatible API token.
2. **The token into AWS Secrets Manager** via the console — not pasted
   into chat. Tell me the secret name and the task role reads it by ARN.
3. **DNS**: `roku-assets` → the R2 custom domain, `roku-control` → the
   load balancer once it exists.

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
