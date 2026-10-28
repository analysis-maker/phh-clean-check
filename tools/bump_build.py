"""Stamp every app page with a new build id and make sure each page has the self-update check.

Why: phones (iPhone Home Screen apps above all) and GitHub Pages (max-age=600) can keep showing an old copy of a page.
Each page carries <meta name="phh-build">. On load it fetches itself fresh (a unique address, so no cache) and, if the
build id differs, reopens itself at a new address, which forces the fresh copy. Run before every commit that changes pages:
    python3 tools/bump_build.py
"""
import re, sys, time, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
PAGES = ["index.html", "office.html", "owner.html", "maintenance.html", "result.html", "view.html"]
BUILD = time.strftime("%Y%m%d%H%M%S", time.gmtime())
CHECK = """<script>
/* Self-update (tools/bump_build.py): if this copy is older than the live page, reopen it fresh. */
(function(){
  try{
    var me = document.querySelector('meta[name="phh-build"]'); if(!me || !window.fetch) return;
    var b = me.getAttribute("content"), sep = location.search ? "&" : "?";
    fetch(location.pathname + location.search + sep + "_chk=" + Date.now(), { cache: "no-store", credentials: "same-origin" })
      .then(function(r){ return r.ok ? r.text() : ""; })
      .then(function(t){
        var m = /name="phh-build" content="([0-9]+)"/.exec(t || ""); if(!m || m[1] === b || m[1] < b) return;
        var key = "phh-upd-" + m[1]; try{ if(sessionStorage.getItem(key)) return; sessionStorage.setItem(key, "1"); }catch(x){}
        var q = (location.search || "").replace(/([?&])_v=[^&]*&?/, "$1").replace(/[?&]$/, "");
        location.replace(location.pathname + q + (q ? "&" : "?") + "_v=" + m[1] + location.hash);
      }).catch(function(){});
  }catch(e){}
})();
</script>"""
for folder in ["", "staging/"]:
    for p in PAGES:
        f = ROOT / (folder + p)
        if not f.exists(): continue
        s = f.read_text()
        if 'name="phh-build"' in s:
            s = re.sub(r'<meta name="phh-build" content="[0-9]+">', '<meta name="phh-build" content="%s">' % BUILD, s)
        else:
            s = s.replace('<meta charset="utf-8">', '<meta charset="utf-8"><meta name="phh-build" content="%s">' % BUILD, 1)
            assert 'name="phh-build"' in s, f
        if "/* Self-update (tools/bump_build.py)" not in s:
            i = s.index("</head>")
            s = s[:i] + CHECK + "\n" + s[i:]
        f.write_text(s)
print("build", BUILD)
