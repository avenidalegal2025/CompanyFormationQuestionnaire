#!/usr/bin/env python3
"""Is the code running in AWS the code that is in this repo?

A merged fix can sit in main for weeks without reaching a customer's document.
This downloads each deployed function and compares its handler file with the
matching file under lambda-functions/, and checks that the function's handler,
runtime and architecture in AWS are what the manifest says they should be.

    python3 scripts/check-lambda-drift.py

Which function runs which file comes from lambda-functions/deploy-manifest.json
— the same file .github/workflows/deploy-lambdas.yml builds from, so the two
cannot disagree about what is deployed where.

Read-only: list-functions + get-function (a presigned download URL). Needs
AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY in .env.local, account 043206426879.
Exit code 1 if anything has drifted or is misconfigured.
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


# Which function runs which file, and which functions are deliberately out of
# scope, both come from the deploy manifest — the same file the deploy workflow
# builds from. This script used to carry its own copy of both maps, which is
# the same fact written down twice and free to rot: a function could be
# renamed in the workflow and still be compared against the old source here.
MANIFEST = json.load(open(os.path.join(SRC, "deploy-manifest.json")))
DEPLOYABLE = {f["function_name"]: f for f in MANIFEST["functions"]}
OUT_OF_SCOPE = {k: v for k, v in MANIFEST["not_deployed"].items()
                if not k.startswith("$")}


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

    drifted, matched, unknown, misconfigured = [], [], [], []
    for fn in funcs:
        name = fn["FunctionName"]
        spec = DEPLOYABLE.get(name)
        if spec is None:
            why = OUT_OF_SCOPE.get(name)
            if why is None:
                why = ("not in lambda-functions/deploy-manifest.json — add it to "
                       "functions[] if it should deploy, or to not_deployed")
            unknown.append((name, why))
            continue

        # Compare ONLY the file this function actually runs. A CDK bundle can
        # carry stale copies of unrelated handlers (the airtable-fields zip
        # ships six of them), and comparing those reported drift for functions
        # that are in fact current.
        entry = spec["target_filename"]
        base = spec["source_file"]

        # Configuration drift, not just code drift. On 2026-04-07 five
        # functions kept working code but had their Handler rewritten to
        # lambda_function.lambda_handler, and every invoke 5xx'd for 12 days
        # while the zips still looked right. The manifest says what these
        # three values must be, so say so when AWS disagrees.
        for field, actual, want in (
            ("handler", fn.get("Handler"), spec["handler"]),
            ("runtime", fn.get("Runtime"), spec["runtime"]),
            ("architecture", (fn.get("Architectures") or ["x86_64"])[0], spec["architecture"]),
        ):
            if actual != want:
                misconfigured.append((name, field, actual, want))

        if base not in local:
            unknown.append((name, f"manifest points at lambda-functions/{base}, which is missing"))
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
    for name, field, actual, want in sorted(misconfigured):
        print(f"  🔴 {name:<52} {field} is {actual!r}, manifest says {want!r}")

    print(f"\n{len(matched)} identical · {len(drifted)} drifted · "
          f"{len(misconfigured)} misconfigured · {len(unknown)} not compared")
    if drifted:
        print("\n🔴 A fix merged to main is not what customers are getting from these functions.")
    if misconfigured:
        print("\n🔴 AWS configuration does not match the manifest. A handler that does not "
              "match the zip returns an import error on every invoke.")
    return 1 if (drifted or misconfigured) else 0


if __name__ == "__main__":
    sys.exit(main())
