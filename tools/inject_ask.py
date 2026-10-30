"""Put the Ask PHH chat panel (tools/ask_panel.html) into the staff pages, just before </body>.

Inline on purpose: Kinsta serves any .js URL straight from disk, so a separate ask.js would 404 on the PHH site.
Re-running replaces the block between <!-- ASK-PHH START --> and <!-- ASK-PHH END -->. Staff pages only:
never index.html (housekeepers), owner.html, result.html, view.html or message.html.
    python3 tools/inject_ask.py            # staging/office.html, staging/maintenance.html, staging/admin.html
    python3 tools/inject_ask.py --live     # the same three in the repo root (only after Ian says "go live")
Then run tools/bump_build.py.
"""
import re, sys, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
PANEL = (ROOT / "tools" / "ask_panel.html").read_text().strip()
PAGES = ["office.html", "maintenance.html", "admin.html"]
live = "--live" in sys.argv
block = PANEL if not live else PANEL.replace('url("../', 'url("')
for p in PAGES:
    f = ROOT / (p if live else "staging/" + p)
    s = f.read_text()
    s = re.sub(r"\n?<!-- ASK-PHH START.*?<!-- ASK-PHH END -->\n?", "\n", s, flags=re.S)
    i = s.rindex("</body>")
    s = s[:i].rstrip("\n") + "\n" + block + "\n" + s[i:]
    f.write_text(s)
    print("Ask PHH ->", f.relative_to(ROOT))
