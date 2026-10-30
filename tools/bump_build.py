"""Stamp every app page with a new build id and make sure each page has the self-update check.

Why: phones (iPhone Home Screen apps above all) and GitHub Pages (max-age=600) can keep showing an old copy of a page.
Each page carries <meta name="phh-build">. On load it fetches itself fresh (a unique address, so no cache) and, if the
build id differs, reopens itself at a new address, which forces the fresh copy. Run before every commit that changes pages:
    python3 tools/bump_build.py
"""
import re, sys, time, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
PAGES = ["index.html", "office.html", "owner.html", "maintenance.html", "result.html", "view.html", "admin.html", "message.html"]
BUILD = time.strftime("%Y%m%d%H%M%S", time.gmtime())
CHECK = """<script>
/* Self-update (tools/bump_build.py): if this copy is older than the live page, reopen it fresh.
   Runs on open, whenever the app comes back to the front (iPhone keeps Home Screen apps suspended), and every 10 minutes. */
(function(){
  try{
    var me = document.querySelector('meta[name="phh-build"]'); if(!me || !window.fetch) return;
    var b = me.getAttribute("content"), busy = false, last = 0;
    function check(){
      if(busy || Date.now() - last < 20000) return; busy = true; last = Date.now();
      var sep = location.search ? "&" : "?";
      fetch(location.pathname + location.search + sep + "_chk=" + Date.now(), { cache: "no-store", credentials: "same-origin" })
        .then(function(r){ return r.ok ? r.text() : ""; })
        .then(function(t){
          busy = false;
          var m = /name="phh-build" content="([0-9]+)"/.exec(t || ""); if(!m || m[1] <= b) return;
          var key = "phh-upd-" + m[1]; try{ if(sessionStorage.getItem(key)) return; sessionStorage.setItem(key, "1"); }catch(x){}
          var q = (location.search || "").replace(/([?&])_v=[^&]*&?/, "$1").replace(/[?&]$/, "");
          location.replace(location.pathname + q + (q ? "&" : "?") + "_v=" + m[1] + location.hash);
        }).catch(function(){ busy = false; });
    }
    check();
    document.addEventListener("visibilitychange", function(){ if(document.visibilityState === "visible") check(); });
    window.addEventListener("pageshow", function(e){ if(e.persisted) check(); });
    window.addEventListener("focus", check);
    setInterval(function(){ if(document.visibilityState === "visible") check(); }, 600000);
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
        if "/* Self-update (tools/bump_build.py)" in s:
            i = s.rindex("<script>", 0, s.index("/* Self-update (tools/bump_build.py)"))
            j = s.index("</script>", i) + len("</script>")
            s = s[:i] + CHECK + s[j:]
        else:
            i = s.index("</head>")
            s = s[:i] + CHECK + "\n" + s[i:]
        f.write_text(s)
print("build", BUILD)
