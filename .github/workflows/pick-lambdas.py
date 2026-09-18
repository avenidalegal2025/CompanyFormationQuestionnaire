#!/usr/bin/env python3
"""Decide which Lambdas this push needs to deploy.

Writes `matrix=<json>` and `count=<n>` to stdout in GITHUB_OUTPUT format;
deploy-lambdas.yml redirects that into $GITHUB_OUTPUT.

Rules, in order:

  * workflow_dispatch with a function name -> just that one.
  * workflow_dispatch with 'all' (the default) -> everything in the manifest.
  * push where the manifest or either deploy workflow changed -> everything,
    because the thing that decides HOW to build changed, not just what.
  * push otherwise -> only functions whose source_file appears in the diff.

It lives beside the workflow rather than in scripts/ so that the workflow and
its decision logic move together; scripts/ is for things a human runs.
"""
import json
import os
import subprocess
import sys

ROOT = subprocess.run(
    ["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, check=True
).stdout.strip()
MANIFEST = os.path.join(ROOT, "lambda-functions", "deploy-manifest.json")

# Touch any of these and every function is rebuilt.
GLOBAL_TRIGGERS = {
    "lambda-functions/deploy-manifest.json",
    ".github/workflows/deploy-lambdas.yml",
    ".github/workflows/deploy-lambda-reusable.yml",
    ".github/workflows/pick-lambdas.py",
}

# Fields the reusable workflow takes. Anything else in the manifest (note,
# layer, verified) is documentation and must not reach the matrix, or Actions
# rejects the call with "invalid input".
INPUTS = ("function_name", "source_file", "target_filename", "handler",
          "runtime", "architecture", "deps", "stub_pil")


def changed_files():
    before, sha = os.environ.get("BEFORE", ""), os.environ.get("SHA", "")
    # All-zeroes is a first push / new branch: git has no 'before' to diff.
    if not before or set(before) == {"0"} or not sha:
        return None
    r = subprocess.run(["git", "diff", "--name-only", before, sha],
                       capture_output=True, text=True)
    if r.returncode != 0:
        # A force-push can leave `before` unreachable. Deploying everything is
        # the safe answer: the alternative is silently shipping nothing.
        print(f"::warning::could not diff {before[:8]}..{sha[:8]}; deploying all",
              file=sys.stderr)
        return None
    return [ln for ln in r.stdout.splitlines() if ln]


def main():
    manifest = json.load(open(MANIFEST))
    functions = manifest["functions"]

    only = (os.environ.get("ONLY") or "").strip()
    if only and only != "all":
        picked = [f for f in functions if f["function_name"] == only]
        if not picked:
            names = "\n  ".join(f["function_name"] for f in functions)
            print(f"::error::no function named {only!r} in the manifest. Known:\n  {names}",
                  file=sys.stderr)
            return 1
    elif only == "all":
        picked = functions
    else:
        diff = changed_files()
        if diff is None or GLOBAL_TRIGGERS.intersection(diff):
            picked = functions
        else:
            touched = {p.split("/", 1)[1] for p in diff
                       if p.startswith("lambda-functions/") and "/" in p}
            picked = [f for f in functions if f["source_file"] in touched]

    matrix = [{k: f[k] for k in INPUTS} for f in picked]
    print(f"matrix={json.dumps(matrix, separators=(',', ':'))}")
    print(f"count={len(matrix)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
