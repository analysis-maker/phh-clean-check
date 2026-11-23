"""Checklist guard (23 Nov 2026, after the v14 outage).

The housekeeper app (index.html, staging/index.html) and the server (clean-api, clean-api-v11) each hold a copy of the
checklist. clean-api rejects a clean check whose item ids it doesn't know ("The checklist is out of date"). On 23 Nov the
app got two new items without the server, and every clean check sent for ~2 hours bounced.

tools/functions/clean-api/checklist.ts and tools/functions/clean-api-v11/checklist.ts are copies of what is DEPLOYED on
clean-api (live) and clean-api-v11 (staging). Update them in the same step as every deploy. This script fails if an app page would send an item id the deployed server doesn't accept, or leaves out
one the server requires. bump_build.py runs it first, so no page change can be committed past a mismatch.

SERVER_PENDING: ids the page holds but strips before sending (bodyFor), until clean-api is deployed with them.
"""
import re, sys, json, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
# Each page is checked against the copy of the function it talks to. SERVER_PENDING (per page): ids the page holds but
# strips before sending (bodyFor), until that function is deployed with them.
PAGES = {
    "index.html": ("tools/functions/clean-api/checklist.ts", set()),
    "staging/index.html": ("tools/functions/clean-api-v11/checklist.ts", {"out_bbq_grease", "exit_blinds"}),  # clean-api-v11 still v13
}

def server_ids(path):
    t = (ROOT / path).read_text()
    c = json.loads(t[t.index("{"):t.rindex("}") + 1])
    return {i["id"] for s in c["sections"] for i in s["items"]}

def page_ids(p):
    s = (ROOT / p).read_text()
    i = s.index("sections:", s.index('version: "'))
    j = s.index("photos:", i)
    return set(re.findall(r'\{\s*id:\s*"([a-z_0-9]+)",\s*text:', s[i:j]))

def main():
    bad = []
    for p, (srv_path, SERVER_PENDING) in PAGES.items():
        srv = server_ids(srv_path)
        ids = page_ids(p)
        sent = ids - SERVER_PENDING
        extra = sorted(sent - srv); missing = sorted(srv - ids)
        stripped = (ROOT / p).read_text().count("out_bbq_grease\" || i.id === \"exit_blinds") if SERVER_PENDING else 1
        if extra: bad.append(f"{p}: sends items clean-api doesn't know: {extra}")
        if missing: bad.append(f"{p}: missing items clean-api requires: {missing}")
        if SERVER_PENDING and not stripped: bad.append(f"{p}: SERVER_PENDING items are not stripped in bodyFor")
    if bad:
        print("CHECKLIST GUARD FAILED. Deploy the same checklist to clean-api AND clean-api-v11 first, then copy it to tools/functions/clean-api/checklist.ts.")
        for b in bad: print("  - " + b)
        sys.exit(1)
    print("checklist guard ok")

if __name__ == "__main__":
    main()
