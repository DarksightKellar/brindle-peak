"""
Zip the production build for an itch.io HTML upload: index.html at the zip's root, forward-slash paths
(Windows' Compress-Archive writes backslashes, which itch's unpacker does not read as folders).

    npm run itch    # builds, then writes release/first-snow-web-<date>.zip
"""
import datetime, os, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'dist')
OUT_DIR = os.path.join(ROOT, 'release')
os.makedirs(OUT_DIR, exist_ok=True)
out = os.path.join(OUT_DIR, f'first-snow-web-{datetime.date.today().isoformat()}.zip')

with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for root, _, files in os.walk(SRC):
        for f in files:
            full = os.path.join(root, f)
            z.write(full, os.path.relpath(full, SRC).replace(os.sep, '/'))
print(f'{os.path.relpath(out, ROOT)}: {os.path.getsize(out) / 1e6:.1f} MB')
