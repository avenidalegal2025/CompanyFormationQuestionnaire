"""
Convert DOCX to PDF using LibreOffice headless.
Attach a LibreOffice Lambda layer (e.g. shelfio/libreoffice-lambda-layer).
Expects JSON body: { "docx_base64": "<base64>" }
Returns: { "pdf_base64": "<base64>" }
"""

import os
import sys
import json
import base64
import subprocess
import tempfile
import tarfile

# Shelfio layer: archive at /opt/lo.tar.br or /opt/lo.tar.gz; extract to /tmp on first use
_LO_UNPACKED = None

def _get_lo_bin():
    global _LO_UNPACKED
    # Container image (e.g. unofunction LibreOffice) sets LIBREOFFICE_PATH
    for env_key in ('LIBREOFFICE_PATH', 'LIBREOFFICE_BIN'):
        env_bin = os.environ.get(env_key)
        if env_bin and os.path.isfile(env_bin):
            return env_bin
    for path in ('/opt/instdir/program/soffice.bin', '/tmp/instdir/program/soffice.bin', '/opt/libreoffice/program/soffice.bin'):
        if os.path.isfile(path):
            return path
    if _LO_UNPACKED is None:
        lo_bin = '/tmp/instdir/program/soffice.bin'
        if not os.path.isfile(lo_bin):
            # Prefer gzip layer (/opt/lo.tar.gz) - no extra deps; brotli layer needs brotli CLI
            for arc in ('/opt/lo.tar.gz', '/opt/lo.tar.br'):
                if os.path.isfile(arc):
                    if arc.endswith('.gz'):
                        with tarfile.open(arc, 'r:gz') as tar:
                            tar.extractall('/tmp')
                    break
        _LO_UNPACKED = lo_bin if os.path.isfile(lo_bin) else False
    if _LO_UNPACKED and os.path.isfile(_LO_UNPACKED):
        return _LO_UNPACKED
    return 'soffice'


def lambda_handler(event, context):
    try:
        # Support both: Function URL (event.body) and direct Invoke (event.docx_base64)
        body = event.get('body')
        if isinstance(body, str):
            body = json.loads(body)
        payload = body if body else event
        docx_b64 = (payload or {}).get('docx_base64')
        if not docx_b64:
            return {
                'statusCode': 400,
                'headers': {'Content-Type': 'application/json'},
                'body': json.dumps({'error': 'Missing docx_base64'}),
            }
        docx_bytes = base64.b64decode(docx_b64)
    except Exception as e:
        return {
            'statusCode': 400,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps({'error': str(e)}),
        }

    LO_BIN = _get_lo_bin()
    lo_dir = os.path.dirname(LO_BIN)
    lo_root = os.path.dirname(os.path.dirname(LO_BIN))  # e.g. /tmp/instdir or /opt/libreoffice
    with tempfile.TemporaryDirectory() as tmpdir:
        inp = os.path.join(tmpdir, 'input.docx')
        with open(inp, 'wb') as f:
            f.write(docx_bytes)
        out_pdf = os.path.join(tmpdir, 'input.pdf')
        env = os.environ.copy()
        env['HOME'] = tmpdir
        env['SAL_USE_VCLPLUGIN'] = 'svp'
        env['LD_LIBRARY_PATH'] = (lo_dir + os.pathsep + env.get('LD_LIBRARY_PATH', '')).strip(os.pathsep)
        # Point fontconfig at LO's bundled fonts if present (avoids NoSuchElementException from font lookup)
        fonts_dirs = [os.path.join(lo_root, 'share', 'fonts'), '/usr/share/fonts', '/tmp']
        for d in fonts_dirs:
            if os.path.isdir(d):
                break
        else:
            d = tmpdir
        fonts_conf = os.path.join(tmpdir, 'fonts.conf')
        with open(fonts_conf, 'w') as f:
            f.write('<?xml version="1.0"?><fontconfig><dir>%s</dir><cachedir>%s</cachedir></fontconfig>' % (d, os.path.join(tmpdir, 'fontcache')))
        env['FONTCONFIG_FILE'] = fonts_conf
        user_install = 'file://' + tmpdir
        cmd = [
            LO_BIN,
            '-env:UserInstallation=' + user_install,
            '--headless',
            '--invisible',
            '--nofirststartwizard',
            '--nolockcheck',
            '--nologo',
            '--norestore',
            '--writer',
            '--convert-to', 'pdf',
            '--outdir', tmpdir,
            inp,
        ]
        last_stderr = ''
        last_stdout = ''
        last_rc = -1
        num_attempts = 3  # Cold start often needs retries (unofunction pattern)
        for attempt in range(num_attempts):
            try:
                result = subprocess.run(
                    cmd,
                    capture_output=True,
                    timeout=90,
                    env=env,
                    cwd=lo_dir,  # run from LO program dir so relative lib paths resolve
                )
                last_rc = result.returncode
                last_stderr = (result.stderr or b'').decode('utf-8', errors='replace')
                last_stdout = (result.stdout or b'').decode('utf-8', errors='replace')
                if result.returncode == 0 and os.path.isfile(out_pdf):
                    break
            except subprocess.TimeoutExpired as e:
                last_stderr = str(e)
                last_rc = -1
                break
            except FileNotFoundError:
                return {
                    'statusCode': 503,
                    'headers': {'Content-Type': 'application/json'},
                    'body': json.dumps({
                        'error': 'LibreOffice not available. Attach the LibreOffice Lambda layer.',
                    }),
                }
        if last_rc != 0 or not os.path.isfile(out_pdf):
            return {
                'statusCode': 500,
                'headers': {'Content-Type': 'application/json'},
                'body': json.dumps({
                    'error': 'Conversion failed',
                    'stderr': last_stderr,
                    'stdout': last_stdout[:500],
                    'returncode': last_rc,
                }),
            }
        with open(out_pdf, 'rb') as f:
            pdf_b64 = base64.b64encode(f.read()).decode('ascii')

    return {
        'statusCode': 200,
        'headers': {'Content-Type': 'application/json'},
        'body': json.dumps({'pdf_base64': pdf_b64}),
    }
