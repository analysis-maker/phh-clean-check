"""Copy staging pages to the live root, swapping staging-only addresses for live ones.

Root = staging copy with clean-api-v11 -> clean-api, office-api-v2 -> office-api (as a full function URL) and "../" removed.
Run only after Ian says "go live", then tools/bump_build.py, then commit:
    python3 tools/make_live.py index.html office.html maintenance.html admin.html message.html
"""
import sys, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
pages = sys.argv[1:] or ["index.html", "office.html", "maintenance.html", "admin.html", "message.html"]
for p in pages:
    s = (ROOT / "staging" / p).read_text()
    s = s.replace("/functions/v1/clean-api-v11", "/functions/v1/clean-api")
    s = s.replace('/functions/v1/office-api-v2"', '/functions/v1/office-api"')
    s = s.replace('"../', '"').replace("(\"../", "(\"").replace("url(\"../", "url(\"")
    (ROOT / p).write_text(s)
    print("live <- staging:", p)
