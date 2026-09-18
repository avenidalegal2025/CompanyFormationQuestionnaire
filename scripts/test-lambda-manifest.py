#!/usr/bin/env python3
"""The deploy manifest describes every Lambda, and describes them correctly.

    python3 scripts/test-lambda-manifest.py

Offline -- no AWS, no secrets -- so it runs on every push.

This is the guard that makes the manifest a real single source of truth rather
than another file that drifts. The failure it exists to prevent: someone adds
lambda-functions/new_thing.py, nobody adds a manifest entry, and it silently
never deploys. That is exactly how the membership registry ended up 38 lines
behind main. Here, an unlisted source file fails the build and the message
says what to do about it.

It also validates the values that get interpolated into shell inside
deploy-lambda-reusable.yml (`pip install --target . ${{ inputs.deps }}`,
`--function-name "${{ inputs.function_name }}"`). A stray space or quote in
the manifest would be a command-injection hole in a workflow holding AWS
credentials, so the charset is checked rather than assumed.
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "lambda-functions")
MANIFEST = os.path.join(SRC, "deploy-manifest.json")

failures = []


def check(label, ok, detail=""):
    print(f"  {'✓' if ok else '🔴'} {label}" + ("" if ok or not detail else f" — {detail}"))
    if not ok:
        failures.append(label)


print("Lambda deploy manifest — complete, consistent, safe to interpolate\n")

manifest = json.load(open(MANIFEST))
functions = manifest["functions"]
not_deployed = {k: v for k, v in manifest["not_deployed"].items() if not k.startswith("$")}

REQUIRED = {"function_name", "source_file", "target_filename", "handler",
            "runtime", "architecture", "deps", "stub_pil", "layer", "verified"}
RUNTIMES = {"python3.9", "python3.11", "python3.12"}
ARCHES = {"x86_64", "arm64"}

# Interpolated into bash unquoted (deps) or inside double quotes (the rest).
SAFE_NAME = re.compile(r"^[A-Za-z0-9._-]+$")
SAFE_DEPS = re.compile(r"^[A-Za-z0-9._=<>!\[\] -]*$")

for f in functions:
    name = f.get("function_name", "<unnamed>")
    missing = REQUIRED - set(f)
    check(f"{name}: has every field", not missing, f"missing {sorted(missing)}")
    if missing:
        continue

    # The single most common way a hand-deploy breaks: the zip entry and the
    # configured handler stop agreeing and every invoke returns an import
    # error. Derived here so the manifest cannot express the broken pair.
    expected = f["target_filename"][:-3] + ".lambda_handler"
    check(f"{name}: handler matches target_filename",
          f["handler"] == expected,
          f"handler is {f['handler']!r}, target_filename implies {expected!r}")

    check(f"{name}: target_filename is a .py file", f["target_filename"].endswith(".py"))
    check(f"{name}: source exists", os.path.exists(os.path.join(SRC, f["source_file"])),
          f"lambda-functions/{f['source_file']} not found")
    check(f"{name}: runtime is supported", f["runtime"] in RUNTIMES, f["runtime"])
    check(f"{name}: architecture is valid", f["architecture"] in ARCHES, f["architecture"])
    check(f"{name}: stub_pil is a boolean", isinstance(f["stub_pil"], bool))

    for field in ("function_name", "source_file", "target_filename", "handler"):
        check(f"{name}: {field} is shell-safe", bool(SAFE_NAME.match(f[field])), repr(f[field]))
    check(f"{name}: deps is shell-safe", bool(SAFE_DEPS.match(f["deps"])), repr(f["deps"]))

    # reportlab imports PIL and the zip has no Pillow; without the stub the
    # function imports fine locally and 500s in Lambda.
    if "reportlab" in f["deps"]:
        check(f"{name}: stub_pil set (vendors reportlab)", f["stub_pil"] is True)

names = [f["function_name"] for f in functions]
check("no duplicate function names", len(names) == len(set(names)),
      f"{[n for n in names if names.count(n) > 1]}")

overlap = set(names) & set(not_deployed)
check("nothing is both deployed and not_deployed", not overlap, f"{sorted(overlap)}")

# The whole point: a new handler file cannot be added and forgotten.
on_disk = {f for f in os.listdir(SRC) if f.endswith(".py")}
accounted = {f["source_file"] for f in functions} | set(not_deployed)
orphans = sorted(on_disk - accounted)
check(
    "every lambda-functions/*.py is either deployed or declared not-deployed",
    not orphans,
    f"{orphans} — add an entry to functions[] in lambda-functions/deploy-manifest.json, "
    f"or a line in not_deployed saying why it never ships",
)

stale = sorted(f["source_file"] for f in functions
               if f["source_file"] not in on_disk)
check("no manifest entry points at a deleted source file", not stale, f"{stale}")

print(f"\n{'🔴 FAIL: %d check(s).' % len(failures) if failures else '✅ PASS'}")
sys.exit(1 if failures else 0)
