#!/usr/bin/env python3
"""Is the code running in AWS the code that is in this repo?

The document Lambdas (SS-4, 2848, 8821, bylaws, registries, DOCX->PDF) are
deployed by hand, so a merged fix can sit in main for weeks without reaching a
customer's document. This downloads each deployed function and compares its
handler file byte-for-byte with the matching file under lambda-functions/.

    python3 scripts/check-lambda-drift.py

Read-only: list-functions + get-function (a presigned download URL). Needs
AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY in .env.local, account 043206426879.
Exit code 1 if anything has drifted.
"""
import difflib
import hashlib
import io
import json
import os
import re
import subprocess
import sys
import urllib.request
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "lambda-functions")


def aws_env():
    env_local = os.path.join(ROOT, ".env.local")
    vals = dict(re.findall(r"^([A-Z0-9_]+)=(.*)$", open(env_local).read(), re.M)) if os.path.exists(env_local) else {}
    e = dict(os.environ)
    for k in ("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"):
        if vals.get(k):
            e[k] = vals[k].strip().strip('"')
    e["AWS_DEFAULT_REGION"] = (vals.get("AWS_REGION") or e.get("AWS_REGION") or "us-west-1").strip().strip('"')
    return e


# Several functions were deployed with their entry file renamed to the CDK
# default (lambda_function.py), so the handler name alone cannot find the
# source. Established 2026-09-17 by downloading each zip and diffing it against
# every file in lambda-functions/ — each pair below was a >98% match with no
# close second. Add a line here when a new function is deployed by hand.
RENAMED = {
    "BylawsLambda": "bylaws_lambda.py",
    "Fill2848Lambda-arm64": "2848_lambda_s3.py",
    "Fill8821Lambda-arm64": "8821_lambda_s3_complete.py",
    "ShareholderRegistryLambda": "shareholder_registry_lambda.py",
    "OrganizationalResolutionS-OrganizationalResolution-LB7obOUKKQ8R":
        "organizational-resolution-lambda.py",
}

# No file under lambda-functions/ corresponds to these; they are older stacks or
# experiments, not the document pipeline. Listed so the report says "out of
# scope" rather than implying the check silently skipped something that matters.
OUT_OF_SCOPE = {
    "Fill2848Lambda": "superseded by Fill2848Lambda-arm64",
    "SS4LLCStack-SS4LLC-arm64": "older SS-4 stack; live SS-4 is ss4-lambda-s3-complete",
    "SS4LLCStack-SS4LLC6A7F87A7-yMWn8SfPv77e": "older SS-4 stack",
    "LlcLambdaCdkStack-LLCTriggerLambda2135A790-8vjIJ4nWdxYt": "trigger shim, not in this repo",
    "layer-diagnostics": "diagnostic",
    "simple-sunbiz-check": "not in this repo",
}


def aws(env, *args):
    r = subprocess.run(["aws", *args], env=env, capture_output=True, text=True, timeout=300)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip()[:300])
    return r.stdout


def normalize(blob):
    """Text of the file, line endings ignored.

    The repo lives on a Windows drive, so several files are CRLF while the
    deployed zip is LF. A byte comparison called four unchanged functions
    drifted; only the content matters here.
    """
    return blob.decode("utf8", "replace").replace("\r\n", "\n").replace("\r", "\n").rstrip() + "\n"


def main():
    env = aws_env()
    funcs = json.loads(aws(env, "lambda", "list-functions", "--output", "json"))["Functions"]
    local = {f: normalize(open(os.path.join(SRC, f), "rb").read())
             for f in os.listdir(SRC) if f.endswith(".py")}
    by_hash = {hashlib.md5(v.encode()).hexdigest(): k for k, v in local.items()}

    drifted, matched, unknown = [], [], []
    for fn in funcs:
        name = fn["FunctionName"]
        if not str(fn.get("Runtime", "")).startswith("python"):
            unknown.append((name, f"not a python function ({fn.get('Runtime') or 'image'})"))
            continue
        # Compare ONLY the file this function actually runs. A CDK bundle can
        # carry stale copies of unrelated handlers (the airtable-fields zip
        # ships six of them), and comparing those reported drift for functions
        # that are in fact current.
        handler = fn.get("Handler", "")           # "ss4_lambda_s3_complete.lambda_handler"
        module = handler.rsplit(".", 1)[0]        # "ss4_lambda_s3_complete"
        entry = module.replace(".", "/") + ".py"  # "ss4_lambda_s3_complete.py"
        base = RENAMED.get(name) or os.path.basename(entry)
        if base not in local:
            why = OUT_OF_SCOPE.get(name) or f"handler {entry} has no counterpart in lambda-functions/"
            unknown.append((name, why))
            continue
        try:
            url = aws(env, "lambda", "get-function", "--function-name", name,
                      "--query", "Code.Location", "--output", "text").strip()
            if not url.startswith("http"):
                unknown.append((name, "no downloadable code (image or layer)"))
                continue
            z = zipfile.ZipFile(io.BytesIO(urllib.request.urlopen(url, timeout=180).read()))
        except Exception as exc:  # noqa: BLE001 — report, don't abort the sweep
            unknown.append((name, str(exc)[:120]))
            continue

        if entry not in z.namelist():
            unknown.append((name, f"handler {entry} not in the deployed zip"))
            continue
        blob = normalize(z.read(entry))
        if hashlib.md5(blob.encode()).hexdigest() == hashlib.md5(local[base].encode()).hexdigest():
            matched.append((name, base, fn["LastModified"][:10]))
        else:
            other = by_hash.get(hashlib.md5(blob.encode()).hexdigest())
            # How far apart, in lines — "differs" on its own does not say
            # whether it is one comment or a rewrite.
            diff = list(difflib.unified_diff(blob.splitlines(), local[base].splitlines(), n=0))
            changed = sum(1 for l in diff if l[:1] in "+-" and l[:3] not in ("+++", "---"))
            drifted.append((name, base, fn["LastModified"][:10], changed, other))

    print("Lambda drift — is AWS running what main says?\n")
    for name, base, when in sorted(matched):
        print(f"  ✓ {name:<52} {base:<38} identical (deployed {when})")
    for name, why in sorted(unknown):
        print(f"  · {name:<52} not compared: {why}")
    for name, base, when, changed, other in sorted(drifted):
        note = f" — deployed copy is {other}" if other else ""
        print(f"  🔴 {name:<52} {base:<38} DIFFERS by {changed} line(s) (deployed {when}){note}")

    print(f"\n{len(matched)} identical · {len(drifted)} drifted · {len(unknown)} not compared")
    if drifted:
        print("\n🔴 A fix merged to main is not what customers are getting from these functions.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
