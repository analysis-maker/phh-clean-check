// Exercises the housekeeper outbox in index.html: a hung upload must not freeze the queue,
// and the finished check is posted before every photo has uploaded.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import vm from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const start = html.indexOf("  function outbox(){");
const end = html.indexOf("  function save(){", start);
if (start < 0 || end < 0) throw new Error("outbox block not found");
let src = "  var OUTBOX = \"phh-cc-outbox\";\n" + html.slice(start, end);
src = src.replaceAll("25000", "40").replaceAll("90000", "40").replaceAll("12000", "40");

const store = {};
const localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
const idb = new Map();
function photoGet(res, k) { return Promise.resolve(idb.get(res + "|" + k) || null); }
function photoPut(rec) { idb.set(rec.res + "|" + rec.k, rec); return Promise.resolve(); }
function photosDrop(res) {
  for (const k of [...idb.keys()]) if (k.startsWith(res + "|")) idb.delete(k);
  return Promise.resolve();
}

const calls = [];
let hangPut = false;
function fetch(url, opts) {
  calls.push({ url: String(url), body: opts && opts.body });
  if (String(url).includes("/slow")) {
    return new Promise((_resolve, reject) => {
      opts.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    });
  }
  if (String(url).includes("/upload-url")) {
    return Promise.resolve({ ok: true, json: async () => ({ signedUrl: "https://upload.test/put", path: "TEST-P1-1119-1/ph_keys-1.jpg" }) });
  }
  if (String(url).includes("/put")) {
    if (hangPut) {
      return new Promise((_resolve, reject) => {
        const sig = opts && opts.signal;
        if (sig) sig.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
      });
    }
    return Promise.resolve({ ok: true });
  }
  if (String(url).includes("/submit")) {
    const b = JSON.parse(opts.body);
    if (b.deferPhotos) return Promise.resolve({ ok: true, json: async () => ({ ok: true, id: "sub-1", pending: 1 }) });
    return Promise.resolve({ ok: true, json: async () => ({ ok: true, id: "sub-full" }) });
  }
  if (String(url).includes("/photos-attach")) {
    return Promise.resolve({ ok: true, json: async () => ({ ok: true, id: "sub-1", left: 0 }) });
  }
  if (String(url).includes("/phone-pending")) {
    return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
  }
  return Promise.resolve({ ok: false, status: 500, json: async () => ({ error: "nope" }) });
}

const ctx = {
  fetch, localStorage, photoGet, photoPut, photosDrop,
  API: "https://example.test/functions/v1/clean-api-v11",
  OFFICE_API: "https://example.test/functions/v1/office-api",
  LIVE: true, RES: "TEST-P1-1119-1", completing: false,
  state: { photos: {} },
  location: { pathname: "/phh-clean-check/staging/index.html" },
  console, setTimeout, clearTimeout, AbortController, Promise, Date, Math, JSON, Object, URL,
  window: {},
};
ctx.window.crypto = { randomUUID: () => "11111111-1111-1111-1111-111111111111" };
vm.createContext(ctx);
vm.runInContext(src + "\nthis.__fn = { sendOne, sendOutbox, outbox, setOutbox, fetchTimeout, bodyFor, unsentCount, entryPhotos, reportPending };", ctx);
const fn = ctx.__fn;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const ac = new AbortController();
let aborted = false;
const hung = new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error("fetchTimeout did not abort")), 500);
  fn.fetchTimeout("https://example.test/slow", { method: "GET" }, 30).then(() => { clearTimeout(t); resolve("unexpected"); }, (e) => {
    clearTimeout(t); aborted = e && e.message === "No signal"; resolve("aborted");
  });
});
await hung;
assert(aborted, "a request that never answers should fail as No signal");

const entry = {
  res: "TEST-P1-1119-1", t: "", property: "Practice House",
  completedAt: new Date().toISOString(), client: "client-1",
  payload: {
    cleaner: "Test Keeper", checklistVersion: "2026-10-29-v13", startedAt: new Date().toISOString(),
    consumables: "no", noBbq: false, absent: [], extra: { photos: [] }, rooms: { bedrooms: 1, bathrooms: 1 },
    items: [{ id: "ent_keys", text: "keys", status: "done" }],
    photos: [{ id: "ph_keys", label: "Guest keys in lockbox", path: null, stampedAt: new Date().toISOString() }],
    maintenance: [],
  },
};
idb.set(entry.res + "|ph_keys", { res: entry.res, k: "ph_keys", blob: new Uint8Array([1, 2, 3]), label: "Guest keys in lockbox" });
localStorage.setItem("phh-cleaner-code", "1357");
fn.setOutbox({ [entry.res]: entry });
hangPut = true;
await fn.sendOutbox();
const after = fn.outbox()[entry.res];
assert(after, "a hung photo must not drop the queued check");
assert(after.submittedId === "sub-1", "the check itself is sent before the photo finishes, got " + after.submittedId);
assert(!after.error, "a network timeout is not shown as an error");
const submit = calls.find((c) => String(c.url).includes("/submit"));
assert(submit && JSON.parse(submit.body).deferPhotos === true, "submit is deferred while a photo is still uploading");
assert(fn.unsentCount(after) === 1, "the photo stays queued");
const pending = calls.filter((c) => String(c.url).includes("/phone-pending"));
assert(pending.length >= 1, "the phone tells the office the check is still on the phone");
const pendingBody = JSON.parse(pending[0].body);
assert(pendingBody.res === entry.res && pendingBody.completedAt && pendingBody.device, "heartbeat is for this booking and this phone");

hangPut = false;
calls.length = 0;
await fn.sendOutbox();
assert(!fn.outbox()[entry.res], "once the photo attaches, the queued check is cleared");
assert(calls.some((c) => String(c.url).includes("/photos-attach")), "the late photo is attached to the same check");

console.log("outbox queue tests passed");
