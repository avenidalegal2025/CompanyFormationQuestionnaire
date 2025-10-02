#!/bin/bash
set -euo pipefail
BUCKET="$1"
OUT=/tmp/ec2_inventory
rm -rf "$OUT" && mkdir -p "$OUT"
# System info
uname -a > "$OUT/system_info.txt"
if command -v lsb_release >/dev/null 2>&1; then lsb_release -a >> "$OUT/system_info.txt" 2>&1; fi
# Firefox
command -v firefox > "$OUT/firefox_path.txt" 2>&1 || true
firefox --version > "$OUT/firefox_version.txt" 2>&1 || true
# Geckodriver
command -v geckodriver > "$OUT/geckodriver_path.txt" 2>&1 || true
geckodriver --version > "$OUT/geckodriver_version.txt" 2>&1 || true
# Python & pip
python3 --version > "$OUT/python_version.txt" 2>&1 || true
python3 -m pip --version > "$OUT/pip_version.txt" 2>&1 || true
python3 -m pip freeze > "$OUT/pip_freeze.txt" 2>&1 || true
# Node & npm
if command -v node >/dev/null 2>&1; then node -v > "$OUT/node_version.txt" 2>&1; fi
if command -v npm  >/dev/null 2>&1; then npm -v  > "$OUT/npm_version.txt"  2>&1; fi
# Env
printenv | sort > "$OUT/environment.txt"
# Xvfb
command -v Xvfb > "$OUT/xvfb_path.txt" 2>&1 || true
Xvfb -version > "$OUT/xvfb_version.txt" 2>&1 || true
# Critical libs
bash -lc 'for lib in libasound.so.2 libdbus-glib-1.so.2 libgtk-3.so.0 libX11.so.6 libnss3.so; do ldconfig -p | grep -F "$lib" || true; done' > "$OUT/critical_libs.txt" 2>&1 || true
# Selenium smoke
python3 - <<'PY' > "$OUT/selenium_smoke.txt"
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
try:
    options = Options()
    options.add_argument('--headless')
    d = webdriver.Firefox(options=options)
    d.get('https://httpbin.org/get')
    print('selenium_ok:true')
    print('title:', d.title)
    d.quit()
except Exception as e:
    print('selenium_ok:false')
    print('err:', e)
PY
# Archive and upload
cd /tmp && tar -czf ec2_inventory.tgz ec2_inventory
aws s3 cp /tmp/ec2_inventory.tgz "s3://$BUCKET/" --region us-west-1
