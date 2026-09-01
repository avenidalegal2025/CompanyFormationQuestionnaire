# sunbiz-name-search-lambda

Source for the AWS Lambda `sunbiz-lambda-latest` (us-west-1), used by
`src/app/api/check-name-availability/route.ts` to check Florida entity-name
availability against `search.sunbiz.org`.

The previous `requests` + BeautifulSoup implementation was 403'd by Cloudflare's
bot challenge. This version drives headless Chromium through Playwright with
anti-automation flags, and routes traffic through a residential proxy because
Cloudflare also blocks AWS datacenter IPs.

## Why the Playwright base image

Cloudflare fingerprints the Chromium build: build 131 was blocked, 145 passes.
Playwright's own image carries a current Chromium plus every system library it
needs; the AWS Python base image does not.

## Configuration (Lambda env vars)

| Var | Value |
|---|---|
| `HOME`, `XDG_CACHE_HOME` | `/tmp` (the image filesystem is read-only) |
| `PROXY_SERVER` | `http://residential-proxy.scrapeops.io:8181` |
| `PROXY_USERNAME` / `PROXY_PASSWORD` | ScrapeOps credentials — **never commit these** |
| `CHROMIUM_ARGS` | optional comma-separated override of the launch flags |

Without `PROXY_SERVER` the function goes direct, which works from a residential
IP but is blocked from Lambda.

Function settings: memory 3008 MB, timeout 300 s, ephemeral storage 2048 MB.
A typical search takes ~15 s.

## Build & deploy

```bash
ACCOUNT=043206426879; REGION=us-west-1
REPO=$ACCOUNT.dkr.ecr.$REGION.amazonaws.com/sunbiz-lambda-latest
TAG=playwright-$(date +%Y%m%d)

aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $REPO
docker build --platform linux/amd64 -t $REPO:$TAG .
docker push $REPO:$TAG
aws lambda update-function-code --region $REGION \
  --function-name sunbiz-lambda-latest --image-uri $REPO:$TAG
```

The pre-Playwright image is still tagged `:latest`, so a rollback is
`update-function-code --image-uri $REPO:latest` (it will 403 again, but it
restores the prior behaviour).

## Contract

Accepts either a direct Invoke payload or an API Gateway / Function URL event
with a JSON `body`:

```json
{"companyName": "TRIMARAN", "entityType": "LLC"}
```

Returns `{"statusCode": 200, "body": "{...}"}` where the body carries
`existing_entities`, each `{name, documentNumber, status, detailUrl,
eventDateFiled?}`. The calling route fails closed: any error envelope or a
missing `existing_entities` array returns 503 rather than reporting the name as
available.
