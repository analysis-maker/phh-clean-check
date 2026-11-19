// PHH Clean Check - midstay-api (20 Nov 2026, Tori + Summer via Ian "build it"): mid-stay cleans and inspections for long
// stays, added by hand once the stay is booked, tracked in the office Schedule tab. A mid-stay clean given to a housekeeper
// shows in their app from 2 days before it is due, with a Done button. Nothing goes to HomHero, nothing pings anyone.
// One function for staging and live (the pages decide who sees it).
//   Office codes:  POST /list   {code, test?, showDone?}            -> {ok, name, jobs, housekeepers, properties}
//                  POST /add    {code, kind, propertyId, propertyName, res?, guest?, due, cleanerId?, notes?, test?} -> {ok, job}
//                  POST /done   {code, id, doneOn, note?, inspectionId?} -> {ok}   (also saves the Schedule "Check done" record)
//                  POST /cancel {code, id} | /reopen {code, id}  -> {ok}
//   Housekeeper:   POST /mine   {code}                               -> {ok, jobs}
//                  POST /hk-done {code, id, note?}                   -> {ok}
import { createClient } from "jsr:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const ORIGINS = ["https://analysis-maker.github.io", "https://professionalholidayhomes.com.au", "https://www.professionalholidayhomes.com.au"];
const corsFor = (req: Request) => {
  const o = req.headers.get("origin") ?? "";
  return { "access-control-allow-origin": ORIGINS.includes(o) ? o : ORIGINS[0], "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type", "vary": "origin" };
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sydDate = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(new Date(ms));
const shift = (ymd: string, n: number) => { const d = new Date(ymd + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const isTester = (id: unknown, name: unknown) => /^TEST/i.test(String(id ?? "")) || /^test/i.test(String(name ?? ""));
const clean = (s: unknown, n: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const ymdOk = (s: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(s ?? ""));

async function staff(code: unknown) {
  const c = String(code ?? "").replace(/\s+/g, "");
  if (!/^\d{4,10}$/.test(c)) { await sleep(600); return null; }
  const { data } = await sb.from("qa_staff_codes").select("staff_name, active, view").eq("code", c).maybeSingle();
  if (!data || !data.active) { await sleep(600); return null; }
  return { code: c, name: String(data.staff_name) };
}
async function cleaner(code: unknown) {
  const c = String(code ?? "").replace(/\s+/g, "");
  if (!/^\d{4,8}$/.test(c)) { await sleep(600); return null; }
  const { data } = await sb.from("qa_cleaner_codes").select("cleaner_id, cleaner_name, active, team_of").eq("code", c).maybeSingle();
  if (!data || !data.active) { await sleep(600); return null; }
  return { id: String(data.cleaner_id), name: String(data.cleaner_name), tester: isTester(data.cleaner_id, data.cleaner_name), member: !!data.team_of };
}
const pub = (j: any) => ({
  id: j.id, kind: j.kind, propertyId: j.property_id, property: j.property_name, res: j.res, guest: j.guest, due: j.due_on,
  cleanerId: j.cleaner_id, cleaner: j.cleaner_name, notes: j.notes, status: j.status, createdBy: j.created_by, createdAt: j.created_at,
  doneOn: j.done_on, doneBy: j.done_by, doneNote: j.done_note, doneSource: j.done_source, inspectionId: j.inspection_id,
  cancelledBy: j.cancelled_by, test: j.test,
});

Deno.serve(async (req) => {
  const cors = corsFor(req);
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json", "cache-control": "no-store" } });
  const fail = (m: string, s = 400) => json({ error: m }, s);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return fail("Use POST.", 405);
  const route = new URL(req.url).pathname.split("/").pop() ?? "";
  let body: any = {};
  try { body = await req.json(); } catch { return fail("Bad request."); }
  const today = sydDate(Date.now());

  // ---------- Housekeeper ----------
  if (route === "mine" || route === "hk-done") {
    const me = await cleaner(body.code);
    if (!me) return fail("Your code is not right.", 403);
    if (me.member) return json({ ok: true, jobs: [] });
    if (route === "mine") {
      const { data } = await sb.from("qa_midstay_jobs").select("*").eq("cleaner_id", me.id).eq("kind", "clean")
        .in("status", ["booked", "done"]).eq("test", me.tester).lte("due_on", shift(today, 2)).gte("due_on", shift(today, -14)).order("due_on");
      // Done ones stay on the list for the rest of the day they were done.
      const jobs = (data ?? []).filter((j: any) => j.status === "booked" || String(j.done_on) === today)
        .map((j: any) => ({ id: j.id, property: j.property_name, guest: j.guest, due: j.due_on, notes: j.notes, status: j.status, doneOn: j.done_on }));
      return json({ ok: true, jobs });
    }
    const id = String(body.id ?? "");
    if (!/^[0-9a-f-]{36}$/.test(id)) return fail("Bad request.");
    const { data: j } = await sb.from("qa_midstay_jobs").select("*").eq("id", id).maybeSingle();
    if (!j || j.cleaner_id !== me.id || j.status !== "booked") return fail("This job is not on your list any more.", 404);
    const note = clean(body.note, 500) || null;
    const { error } = await sb.from("qa_midstay_jobs").update({ status: "done", done_on: today, done_by: me.name, done_note: note, done_source: "app" }).eq("id", id).eq("status", "booked");
    if (error) return fail("Could not save. Try again.", 500);
    if (j.res) {
      const { data: ck } = await sb.from("qa_office_checks").insert({ kind: "midstay", property_id: j.property_id, property_name: j.property_name, res: j.res, done_on: today, done_by: me.name,
        note: "Mid-stay clean (app)" + (note ? ": " + note : ""), created_by: me.name, test: j.test }).select("id").maybeSingle();
      if (ck) await sb.from("qa_midstay_jobs").update({ check_id: ck.id }).eq("id", id);
    }
    return json({ ok: true });
  }

  // ---------- Office ----------
  const who = await staff(body.code);
  if (!who) return fail("Sign in again with your office code.", 403);
  const test = body.test === true;

  if (route === "list") {
    const since = shift(today, -60);
    let q = sb.from("qa_midstay_jobs").select("*").eq("test", test).order("due_on", { ascending: true }).limit(500);
    if (body.showDone === true) q = q.or(`status.eq.booked,due_on.gte.${since},done_on.gte.${since}`);
    else q = q.eq("status", "booked");
    const { data: jobs, error } = await q;
    if (error) return fail("Could not load the jobs.", 500);
    const { data: hk } = await sb.from("qa_cleaner_codes").select("cleaner_id, cleaner_name, active, team_of").eq("active", true).is("team_of", null).order("cleaner_name");
    const seen = new Set<string>();
    const housekeepers = (hk ?? []).filter((h: any) => (test || !isTester(h.cleaner_id, h.cleaner_name)) && !seen.has(String(h.cleaner_id)) && seen.add(String(h.cleaner_id)))
      .map((h: any) => ({ id: String(h.cleaner_id), name: String(h.cleaner_name) }));
    const { data: pr } = await sb.from("qa_cleans").select("property_id, property_name").gte("clean_date", shift(today, -365)).not("res", "like", "TEST-%").limit(20000);
    const pm = new Map<string, string>();
    for (const p of pr ?? []) if (p.property_id && p.property_name && !pm.has(String(p.property_id))) pm.set(String(p.property_id), String(p.property_name));
    const properties = [...pm.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
    if (test) properties.unshift({ id: "TEST-DEMO", name: "Practice House (practice)" });
    return json({ ok: true, name: who.name, today, jobs: (jobs ?? []).map(pub), housekeepers, properties });
  }

  if (route === "add") {
    const kind = body.kind === "inspection" ? "inspection" : body.kind === "clean" ? "clean" : "";
    const propertyId = clean(body.propertyId, 40), propertyName = clean(body.propertyName, 120);
    if (!kind || !propertyId || !propertyName) return fail("Pick the type and the property.");
    if (!ymdOk(body.due)) return fail("Pick the date it is due.");
    if (String(body.due) < shift(today, -30)) return fail("That date is too far in the past.");
    if (!test && propertyId === "TEST-DEMO") return fail("Practice House only in test mode.");
    let cleanerId: string | null = null, cleanerName: string | null = null;
    if (body.cleanerId) {
      const { data: h } = await sb.from("qa_cleaner_codes").select("cleaner_id, cleaner_name").eq("cleaner_id", String(body.cleanerId)).eq("active", true).limit(1);
      if (!h || !h.length) return fail("That housekeeper was not found.");
      if (!test && isTester(h[0].cleaner_id, h[0].cleaner_name)) return fail("Test codes only in test mode.");
      cleanerId = String(h[0].cleaner_id); cleanerName = String(h[0].cleaner_name);
    }
    const row = {
      kind, property_id: propertyId, property_name: propertyName, res: clean(body.res, 40).replace(/[^\w-]/g, "") || null, guest: clean(body.guest, 120) || null,
      due_on: String(body.due), cleaner_id: cleanerId, cleaner_name: cleanerName, notes: clean(body.notes, 1000) || null, created_by: who.name, test,
    };
    const { data, error } = await sb.from("qa_midstay_jobs").insert(row).select("*").maybeSingle();
    if (error || !data) return fail("Could not save. Try again.", 500);
    return json({ ok: true, job: pub(data) });
  }

  const id = String(body.id ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id)) return fail("Bad request.");
  const { data: j } = await sb.from("qa_midstay_jobs").select("*").eq("id", id).maybeSingle();
  if (!j || j.test !== test) return fail("That job was not found.", 404);

  if (route === "done") {
    if (j.status !== "booked") return fail("That job is not open.");
    const doneOn = ymdOk(body.doneOn) && String(body.doneOn) <= today ? String(body.doneOn) : today;
    const note = clean(body.note, 500) || null;
    const insp = /^[0-9a-f-]{36}$/.test(String(body.inspectionId ?? "")) ? String(body.inspectionId) : null;
    const { error } = await sb.from("qa_midstay_jobs").update({ status: "done", done_on: doneOn, done_by: who.name, done_note: note, done_source: "office", inspection_id: insp }).eq("id", id).eq("status", "booked");
    if (error) return fail("Could not save. Try again.", 500);
    if (j.res) {
      const { data: ck } = await sb.from("qa_office_checks").insert({ kind: "midstay", property_id: j.property_id, property_name: j.property_name, res: j.res, done_on: doneOn, done_by: who.name,
        note: "Mid-stay " + j.kind + (note ? ": " + note : ""), inspection_id: insp, created_by: who.name, test: j.test }).select("id").maybeSingle();
      if (ck) await sb.from("qa_midstay_jobs").update({ check_id: ck.id }).eq("id", id);
    }
    return json({ ok: true });
  }
  if (route === "cancel") {
    if (j.status !== "booked") return fail("That job is not open.");
    await sb.from("qa_midstay_jobs").update({ status: "cancelled", cancelled_by: who.name, cancelled_at: new Date().toISOString() }).eq("id", id);
    return json({ ok: true });
  }
  if (route === "reopen") {
    if (j.check_id) await sb.from("qa_office_checks").delete().eq("id", j.check_id);
    await sb.from("qa_midstay_jobs").update({ status: "booked", done_on: null, done_by: null, done_note: null, done_source: null, inspection_id: null, check_id: null, cancelled_by: null, cancelled_at: null }).eq("id", id);
    return json({ ok: true });
  }
  return fail("Not found.", 404);
});
