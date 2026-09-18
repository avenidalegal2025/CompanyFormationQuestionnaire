#!/usr/bin/env python3
"""Is every document Lambda answering?

    python3 scripts/check-lambda-health.py

Which functions to probe comes from lambda-functions/deploy-manifest.json, and
each function's URL is resolved from AWS at run time.

Both of those are deliberate, and each fixes a bug that was live on
2026-09-17:

1. The URLs used to be seven hardcoded lines in lambda-monitoring.yml, kept in
   step with reality by hand. They were not. The list probed
   `membership-registry-lambda` -- an orphan function nothing calls -- while
   the function production actually uses (MembershipRegistryStack-...,
   the one named in .env.local) was never probed at all. The health check was
   green because it was asking the wrong function. Names now come from the
   manifest, so a function that is deployed is a function that is monitored.

2. Those URLs are AuthType NONE -- unauthenticated endpoints that generate
   documents -- and the repository is public. Resolving them from AWS keeps
   them out of the source tree.

A 4xx is healthy here: these functions reject a bare probe payload with
400 "Missing 'form_data'". 5xx means the function is crashing on invoke, which
is exactly what SS-4 did, unnoticed, for 12 days from 2026-04-07 -- the old
check only alarmed on total unreachability.
"""
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "lambda-functions")
TIMEOUT = 30


def aws_env():
    """Credentials from .env.local when present, else the ambient environment.

    In CI the ambient environment is what configure-aws-credentials set; on a
    laptop the default profile is a DIFFERENT account that happens to look
    like this one, so .env.local must win.
    """
    import re
    path = os.path.join(ROOT, ".env.local")
    vals = dict(re.findall(r"^([A-Z0-9_]+)=(.*)$", open(path).read(), re.M)) if os.path.exists(path) else {}
    e = dict(os.environ)
    for k in ("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"):
        if vals.get(k):
            e[k] = vals[k].strip().strip('"')
    e["AWS_DEFAULT_REGION"] = (vals.get("AWS_REGION") or e.get("AWS_REGION") or "us-west-1").strip().strip('"')
    return e


def probe(url):
    req = urllib.request.Request(
        url, method="POST", data=b'{"health_check": true}',
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception:
        return 0


def main():
    manifest = json.load(open(os.path.join(SRC, "deploy-manifest.json")))
    env = aws_env()
    if not env.get("AWS_ACCESS_KEY_ID"):
        print("No AWS credentials — cannot resolve function URLs, nothing probed.")
        print("Set AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY (repo secrets in CI).")
        return 2

    print("Lambda health — every deployed function answers\n")
    failures = []
    for f in manifest["functions"]:
        name = f["function_name"]
        r = subprocess.run(
            ["aws", "lambda", "get-function-url-config", "--function-name", name,
             "--query", "FunctionUrl", "--output", "text"],
            env=env, capture_output=True, text=True, timeout=120,
        )
        url = r.stdout.strip()
        if r.returncode != 0 or not url.startswith("http"):
            # Not every function needs a URL; say so rather than inventing a pass.
            print(f"  · {name:<52} no function URL configured — not probed")
            continue

        status = probe(url)
        if status == 0:
            print(f"  🔴 {name:<52} unreachable")
            failures.append((name, "unreachable"))
        elif 500 <= status < 600:
            print(f"  🔴 {name:<52} HTTP {status} — crashing on invoke")
            failures.append((name, f"HTTP {status}"))
        elif 400 <= status < 500:
            print(f"  ✓ {name:<52} HTTP {status} (rejects bare probe — healthy)")
        else:
            print(f"  ✓ {name:<52} HTTP {status}")

    print(f"\n{'🔴 FAIL: ' + ', '.join(n for n, _ in failures) if failures else '✅ PASS'}")
    for name, why in failures:
        print(f"::error title={name}::{why}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
