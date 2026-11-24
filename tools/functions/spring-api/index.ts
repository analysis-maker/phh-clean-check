// PHH Clean Check - spring-api. Spring cleans only; nothing else in Clean Check changes.
// Staff book a spring clean (owner approval recorded, no reply is not a yes). n8n "PHH Clean Check - Spring Clean Block"
// opens ONE HelpScout conversation asking CST to add a Maintenance Block in HomHero (status requested). Staff then enter the
// block number (or tick Blocked) in the office tab, or n8n finds the block with a READ-ONLY HomHero check (status -> blocked),
// and n8n sends the housekeeper one phone ping. A cancel asks CST to cancel the block (5 Nov: API-made blocks were unsafe,
// so nothing in Clean Check or n8n writes to HomHero any more). The housekeeper sees it in their list and does it with the
// spring clean checklist and before / after photos. It is the same record as an Extra clean "Spring clean" (qa_extras,
// linked by spring_clean_id), so office approval sets status done and the property's last spring clean date
// (trigger qa_extras_spring_after -> qa_property_spring). Nothing here calls HomHero. test=true rows (test housekeepers) never go to CST.
// LIVE spring-api v3 (10 Nov, Ian: go live): accepts the PHH web address as well as github.io.
// 24 Nov 2026: checklist v2 (48 items, new Laundry section) lives in checklist.ts. Same source deploys to spring-api-staging
// and spring-api. /spring-review shows only the items a spring clean was ticked against, so an older submission isn't
// counted against items it never had. A draft started before v2 went live (V2_FROM) keeps the 31-item list until it is sent.
// Routes (all POST, JSON):
//   housekeeper {code}:        /spring-today -> {ok, springCleans[]}   today or tomorrow, once blocked (test rows straight away)
//   housekeeper {code, id}:    /spring-open, /spring-upload-url {kind,n}, /spring-save-photo {kind,n,path,stampedAt}, /spring-submit {checklist, note}
//   staff (not maintenance) or office code: /spring-properties, /spring-create, /spring-list, /spring-cancel, /spring-review, /spring-decide, /spring-mark-blocked
//   n8n (x-sync-key):          /spring-pending, /spring-update
import { createClient } from "jsr:@supabase/supabase-js@2";
import { SPRING_CHECKLIST_RAW, V1_IDS, V2_FROM } from "./checklist.ts";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const ORIGINS = [Deno.env.get("ALLOWED_ORIGIN") ?? "https://analysis-maker.github.io", "https://analysis-maker.github.io", "https://professionalholidayhomes.com.au", "https://www.professionalholidayhomes.com.au"];
const corsFor = (req: Request) => { const o = req.headers.get("origin") ?? ""; return { "access-control-allow-origin": ORIGINS.includes(o) ? o : ORIGINS[0], "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type", "vary": "origin" }; };
const BUCKET = "clean-photos";
const isOwnerClean = (name: unknown) => /\(owners?\)/i.test(String(name ?? ""));
// Same n8n key as the other Clean Check functions, compared by hash (as office-api-v2 does).
const SYNC_KEY_SHA256 = "a2579f8029fdd60249a3354216c54ad6d0659a57dc33222d9090227437b4428f";
async function syncKeyOk(v: string | null) {
  if (!v) return false;
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v));
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, "0")).join("") === SYNC_KEY_SHA256;
}
async function staffName(code: unknown): Promise<string | null> {
  const c = String(code ?? "").trim();
  if (!/^\d{4,10}$/.test(c)) return null;
  const { data: st } = await sb.from("qa_staff_codes").select("staff_name, active, view").eq("code", c).maybeSingle();
  if (st && st.active && st.view !== "maintenance") return st.staff_name || "Staff";
  const { data: cl } = await sb.from("qa_cleaner_codes").select("cleaner_id, active").eq("code", c).maybeSingle();
  if (cl && cl.active && cl.cleaner_id === "*") return "PHH office";
  return null;
}
const memberLabel = (member: string, lead: string) => `${member}, for ${String(lead).replace(/\s*\(.*\)\s*$/, "").trim() || lead}`;

// PHH spring clean checklist (checklist.ts). Every item ticked or N/A ("as applicable").
const SPRING_CHECKLIST = SPRING_CHECKLIST_RAW.map((s) => ({ id: s.id, title: s.title, items: s.items.map(([id, text]) => ({ id, text })) }));
const SPRING_CHECKLIST_V1 = SPRING_CHECKLIST.map((s) => ({ ...s, items: s.items.filter((it) => V1_IDS.has(it.id)) })).filter((s) => s.items.length);
// A draft started before v2 went live keeps the 31-item list until it is sent.
const listFor = (ex: any) => (ex && ex.created_at && new Date(ex.created_at) < new Date(V2_FROM) ? SPRING_CHECKLIST_V1 : SPRING_CHECKLIST);
// The checklist a saved spring clean was ticked against (older submissions have fewer items).
const sectionsFor = (saved: Record<string, string> | null) => {
  const keys = saved ? Object.keys(saved) : [];
  if (!keys.length) return SPRING_CHECKLIST;
  return SPRING_CHECKLIST.map((s) => ({ ...s, items: s.items.filter((it) => it.id in saved!) })).filter((s) => s.items.length);
};
// Housekeepers see a spring clean once it is marked blocked in HomHero (or done). Test bookings (test housekeepers) show straight away.
const springVisible = (s: any) => s && (s.status === "blocked" || s.status === "done" || (s.test && s.status === "requested"));

Deno.serve(async (req) => {
  const cors = corsFor(req);
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json", "cache-control": "no-store" } });
  const fail = (msg: string, status = 400) => json({ error: msg }, status);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return fail("Use POST.", 405);
  const route = new URL(req.url).pathname.split("/").pop();
  let body: any;
  try { body = await req.json(); } catch { return fail("Bad request."); }

  // Housekeeper list: this housekeeper's spring cleans for today or tomorrow (a team member sees their lead's).
  if (route === "spring-today") {
    const code = String(body.code ?? "").trim();
    if (!/^\d{4,8}$/.test(code)) return json({ ok: true, springCleans: [] });
    const { data: who } = await sb.from("qa_cleaner_codes").select("cleaner_id, active, team_of").eq("code", code).maybeSingle();
    if (!who || !who.active || who.cleaner_id === "*") return json({ ok: true, springCleans: [] });
    const lead = who.team_of ? String(who.team_of) : String(who.cleaner_id);
    const ymd = (o: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(new Date(Date.now() + o * 86400000));
    const { data: sp } = await sb.from("qa_spring_cleans").select("id, property_name, date_from, date_to, status, test")
      .eq("cleaner_id", lead).neq("status", "cancelled").lte("date_from", ymd(1)).gte("date_to", ymd(0)).order("date_from");
    const vis = (sp ?? []).filter(springVisible);
    const { data: exs } = vis.length ? await sb.from("qa_extras").select("spring_clean_id, status").in("spring_clean_id", vis.map((s: any) => s.id)) : { data: [] as any[] };
    const exOf = new Map((exs ?? []).map((e: any) => [e.spring_clean_id, e.status]));
    return json({ ok: true, springCleans: vis.map((s: any) => ({ id: s.id, property: s.property_name, from: s.date_from, to: s.date_to, state: exOf.get(s.id) ?? "new" })) });
  }

  // ---------- The housekeeper's spring clean, booked by the office ----------
  // Same record as an Extra clean of type "Spring clean" (qa_extras, before/after photos, office approval),
  // linked to the booking by qa_extras.spring_clean_id. Body always {code, id} where id = qa_spring_cleans.id.
  if (route === "spring-open" || route === "spring-upload-url" || route === "spring-save-photo" || route === "spring-submit") {
    const code = String(body.code ?? "").trim();
    const nope = async () => { await new Promise((r) => setTimeout(r, 600)); return fail("This spring clean is not available.", 403); };
    if (!/^\d{4,8}$/.test(code) || !/^[0-9a-f-]{36}$/i.test(String(body.id ?? ""))) return await nope();
    const { data: who } = await sb.from("qa_cleaner_codes").select("cleaner_id, cleaner_name, active, team_of, member_name").eq("code", code).maybeSingle();
    if (!who || !who.active || who.cleaner_id === "*") return await nope();
    const lead = who.team_of ? String(who.team_of) : String(who.cleaner_id);
    const { data: sc } = await sb.from("qa_spring_cleans").select("*").eq("id", body.id).maybeSingle();
    if (!sc || String(sc.cleaner_id ?? "") !== lead || !springVisible(sc)) return await nope();
    const ymd = (o: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(new Date(Date.now() + o * 86400000));
    const openNow = ymd(1) >= sc.date_from && ymd(-3) <= sc.date_to;
    const { data: ex0 } = await sb.from("qa_extras").select("*").eq("spring_clean_id", sc.id).maybeSingle();
    let ex: any = ex0;
    const byName = who.team_of ? memberLabel(String(who.member_name ?? who.cleaner_name), String(sc.cleaner_name ?? "")) : String(who.cleaner_name);
    const info = () => ({
      id: sc.id, property: sc.property_name, from: sc.date_from, to: sc.date_to, notes: sc.notes ?? null, open: openNow,
      checklist: listFor(ex), extra: ex ? { id: ex.id, status: ex.status, note: ex.note, officeNote: ex.office_note, checklist: ex.checklist ?? {}, submittedAt: ex.submitted_at } : null,
    });
    if (route === "spring-open") {
      if (ex && ex.status === "draft") {
        const photos = (ex.photos ?? []) as any[];
        const { data: signed } = photos.length ? await sb.storage.from(BUCKET).createSignedUrls(photos.map((p) => p.path), 3600) : { data: [] as any[] };
        const urlOf = new Map((signed ?? []).map((x: any) => [x.path, x.signedUrl]));
        return json({ ok: true, ...info(), photos: photos.map((p) => ({ kind: p.kind, n: p.n, stampedAt: p.stampedAt ?? null, url: urlOf.get(p.path) ?? null })) });
      }
      return json({ ok: true, ...info(), photos: [] });
    }
    if (!openNow) return fail("This spring clean opens the day before it is booked.", 403);
    if (ex && ex.status !== "draft") return fail("This spring clean has already been sent to PHH.", 409);
    if (!ex) {
      const { data: made, error } = await sb.from("qa_extras").insert({ cleaner_id: lead, cleaner_name: byName, property_id: sc.property_id, property_name: sc.property_name, extra_type: "Spring clean", spring_clean_id: sc.id }).select("*").single();
      if (error) {
        const { data: again } = await sb.from("qa_extras").select("*").eq("spring_clean_id", sc.id).maybeSingle();
        if (!again) return fail("Could not start the spring clean. Try again.", 500);
        ex = again;
      } else ex = made;
    }
    const kind = body.kind === "before" || body.kind === "after" ? body.kind : null;
    const n = Number(body.n);
    const photoOk = !!kind && Number.isInteger(n) && n >= 1 && n <= 12;
    if (route === "spring-upload-url") {
      if (!photoOk) return fail("Unknown photo.");
      const path = `extras/${ex.id}/${kind}-${n}-${Date.now()}.jpg`;
      const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(path);
      if (error) return fail("Could not prepare the photo upload. Try again.", 500);
      return json({ signedUrl: data.signedUrl, path });
    }
    if (route === "spring-save-photo") {
      if (!photoOk) return fail("Unknown photo.");
      const path = String(body.path ?? "");
      if (!path.startsWith(`extras/${ex.id}/${kind}-${n}-`)) return fail("A photo did not upload. Retake it.");
      const { data: files } = await sb.storage.from(BUCKET).list(`extras/${ex.id}`, { limit: 1000 });
      if (!(files ?? []).some((f: any) => `extras/${ex.id}/${f.name}` === path)) return fail("A photo did not upload. Retake it.");
      const clip = (v: unknown) => String(v ?? "").trim().slice(0, 40) || null;
      const photos = ((ex.photos ?? []) as any[]).filter((p) => !(p.kind === kind && p.n === n));
      photos.push({ kind, n, path, stampedAt: clip(body.stampedAt), takenAt: clip(body.takenAt) });
      photos.sort((x, y) => (x.kind === y.kind ? x.n - y.n : x.kind === "before" ? -1 : 1));
      const { error } = await sb.from("qa_extras").update({ photos }).eq("id", ex.id);
      if (error) return fail("Could not save the photo. Try again.", 500);
      return json({ ok: true, before: photos.filter((p) => p.kind === "before").length, after: photos.filter((p) => p.kind === "after").length });
    }
    // spring-submit
    const ph = (ex.photos ?? []) as any[];
    if (!ph.some((p) => p.kind === "before")) return fail("Take at least one before photo.");
    if (!ph.some((p) => p.kind === "after")) return fail("Take at least one after photo.");
    const ticks = body.checklist && typeof body.checklist === "object" ? body.checklist : {};
    const items = listFor(ex).flatMap((s) => s.items);
    const list: Record<string, string> = {};
    for (const it of items) { const v = ticks[it.id]; if (v === "done" || v === "na") list[it.id] = v; }
    const left = items.filter((it) => !list[it.id]).length;
    if (left) return fail(left + " checklist item" + (left > 1 ? "s" : "") + " still to tick (or mark N/A).");
    const note = String(body.note ?? "").trim().slice(0, 1000);
    const { error } = await sb.from("qa_extras").update({ status: "submitted", note: note || "Spring clean checklist done.", checklist: list, cleaner_name: byName, submitted_at: new Date().toISOString() }).eq("id", ex.id).eq("status", "draft");
    if (error) return fail("Could not send. Try again.", 500);
    return json({ ok: true });
  }

  // ---------- Spring cleans, office side. Staff codes (not maintenance) or the office code. ----------
  //   /spring-properties {code, includeTest?} -> {ok, properties:[{id, name, defaultCleanerId, usualCleaner, lastSpringClean}], housekeepers:[{id, name, test}]}
  //   /spring-create {code, propertyId, from, to, cleanerId, ownerApproved:true, approvedBy, approvedOn, notes?} -> {ok, id, warnings[]}
  //   /spring-list   {code, includeTest?} -> {ok, rows[]}
  //   /spring-cancel {code, id} -> {ok}            (if CST was asked or it was blocked, n8n asks CST to cancel the block)
  //   /spring-mark-blocked {code, id, blockId?} -> {ok}   staff: the HomHero Maintenance Block is in (number optional), status -> blocked
  //   /spring-review {code, id} -> {ok, extra}      before and after photos (1-hour links) and the ticked checklist
  //   /spring-decide {code, id, decision: approved|declined, note?} -> {ok}   approval sets done and the last spring clean date
  if (["spring-properties", "spring-create", "spring-list", "spring-cancel", "spring-review", "spring-decide", "spring-mark-blocked"].includes(String(route))) {
    const staff = await staffName(body.code);
    if (!staff) { await new Promise((r) => setTimeout(r, 600)); return fail("That code is not right.", 403); }
    const ymd = (o: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(new Date(Date.now() + o * 86400000));
    const isDate = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v + "T00:00:00Z"));
    const includeTest = body.includeTest === true;
    const testId = (id: unknown) => /^TEST/.test(String(id ?? ""));
    async function housekeepers() {
      const { data } = await sb.from("qa_cleaner_codes").select("cleaner_id, cleaner_name, active, team_of").eq("active", true).is("team_of", null).neq("cleaner_id", "*");
      const seen = new Map<string, { id: string; name: string; test: boolean }>();
      for (const c of data ?? []) {
        const id = String(c.cleaner_id); if (!id || id === "claude-test" || seen.has(id)) continue;
        if (testId(id) && !includeTest) continue;
        seen.set(id, { id, name: String(c.cleaner_name), test: testId(id) });
      }
      return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
    }

    if (route === "spring-properties") {
      const since = ymd(-180);
      const rows: any[] = [];
      for (let page = 0; page < 10; page++) {
        const { data, error } = await sb.from("qa_cleans").select("property_id, property_name, clean_date, cleaner_id, cleaner_name")
          .gte("clean_date", since).lte("clean_date", ymd(0)).not("res", "like", "TEST-%").not("property_id", "is", null).order("clean_date", { ascending: false }).range(page * 1000, page * 1000 + 999);
        if (error) return fail("Could not load properties. Try again in a minute.", 500);
        rows.push(...(data ?? [])); if (!data || data.length < 1000) break;
      }
      // 7 Nov 2026: past cleans are read first (above, newest first, capped at 10,000 rows) so year-ahead bookings can never
      // push them out; properties that only have upcoming cleans are added from a separate read (names only).
      for (let page = 0; page < 10; page++) {
        const { data, error } = await sb.from("qa_cleans").select("property_id, property_name, clean_date")
          .gt("clean_date", ymd(0)).not("res", "like", "TEST-%").not("property_id", "is", null).order("clean_date", { ascending: true }).range(page * 1000, page * 1000 + 999);
        if (error) return fail("Could not load properties. Try again in a minute.", 500);
        rows.push(...(data ?? []).map((r: any) => ({ ...r, cleaner_id: null, cleaner_name: null }))); if (!data || data.length < 1000) break;
      }
      const hks = await housekeepers();
      const hkIds = new Set(hks.map((h) => h.id));
      const props = new Map<string, any>();
      for (const r of rows) {
        const id = String(r.property_id);
        const p = props.get(id) ?? { id, name: String(r.property_name), recent: [] as any[] };
        if (r.cleaner_id && !isOwnerClean(r.cleaner_name) && r.clean_date <= ymd(0) && p.recent.length < 5) p.recent.push(r);
        props.set(id, p);
      }
      const { data: last } = await sb.from("qa_property_spring").select("property_id, last_spring_clean");
      const lastOf = new Map((last ?? []).map((l: any) => [String(l.property_id), l.last_spring_clean]));
      const properties = [...props.values()].map((p: any) => {
        const count = new Map<string, number>(); for (const r of p.recent) count.set(String(r.cleaner_id), (count.get(String(r.cleaner_id)) ?? 0) + 1);
        const top = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
        const usual = top ? p.recent.find((r: any) => String(r.cleaner_id) === top[0]) : null;
        return { id: p.id, name: p.name, defaultCleanerId: usual && hkIds.has(String(usual.cleaner_id)) ? String(usual.cleaner_id) : null,
          usualCleaner: usual ? String(usual.cleaner_name) : null, lastSpringClean: lastOf.get(p.id) ?? null };
      }).sort((a, b) => a.name.localeCompare(b.name));
      return json({ ok: true, name: staff, properties, housekeepers: hks });
    }

    if (route === "spring-create") {
      const pid = String(body.propertyId ?? "").trim();
      if (!/^\d{1,12}$/.test(pid)) return fail("Pick the property from the list.");
      const { data: p } = await sb.from("qa_cleans").select("property_name").eq("property_id", pid).not("res", "like", "TEST-%").order("clean_date", { ascending: false }).limit(1).maybeSingle();
      if (!p) return fail("Pick the property from the list.");
      if (body.ownerApproved !== true) return fail("The owner must approve the spring clean first. No reply is not a yes.");
      const approvedBy = String(body.approvedBy ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
      if (approvedBy.length < 2) return fail("Add who approved it (the owner's name).");
      if (!isDate(body.approvedOn) || body.approvedOn > ymd(0)) return fail("Add the date the owner approved it (today or earlier).");
      if (!isDate(body.from) || !isDate(body.to)) return fail("Pick the spring clean dates.");
      if (body.from < ymd(0)) return fail("The first day can't be in the past.");
      if (body.to < body.from) return fail("The last day is before the first day.");
      if ((Date.parse(body.to) - Date.parse(body.from)) / 86400000 > 14) return fail("A spring clean can be booked for up to 14 days.");
      const hks = await housekeepers();
      const hk = hks.find((h) => h.id === String(body.cleanerId ?? ""));
      if (!hk) return fail("Pick the housekeeper.");
      const { data: clash } = await sb.from("qa_spring_cleans").select("id").eq("property_id", pid).neq("status", "cancelled").lte("date_from", body.to).gte("date_to", body.from);
      if ((clash ?? []).length) return fail("This property already has a spring clean booked on those dates.");
      const warnings: string[] = [];
      const { data: near } = await sb.from("qa_cleans").select("res, clean_date, hh_status").eq("property_id", pid).not("res", "like", "TEST-%").gte("clean_date", body.from).lte("clean_date", body.to);
      const other = (near ?? []).filter((c: any) => c.hh_status !== "Cancelled" && c.clean_date !== body.from);
      if (other.length) warnings.push("HomHero has a departure clean at this property on " + other.map((c: any) => c.clean_date).join(", ") + ", so a guest may be booked in those dates. Check before CST adds the block.");
      const notes = String(body.notes ?? "").trim().slice(0, 1000) || null;
      const { data: made, error } = await sb.from("qa_spring_cleans").insert({
        property_id: pid, property_name: String(p.property_name), date_from: body.from, date_to: body.to, cleaner_id: hk.id, cleaner_name: hk.name,
        owner_approved: true, approved_by: approvedBy, approved_at: body.approvedOn, requested_by: staff, notes, test: hk.test,
      }).select("id").single();
      if (error) return fail("Could not book the spring clean. Try again.", 500);
      return json({ ok: true, id: made.id, test: hk.test, warnings });
    }

    if (route === "spring-list") {
      let q = sb.from("qa_spring_cleans").select("*").gte("date_to", ymd(-120)).order("date_from", { ascending: true }).limit(500);
      if (!includeTest) q = q.eq("test", false);
      const { data, error } = await q;
      if (error) return fail("Could not load spring cleans. Try again in a minute.", 500);
      const ids = (data ?? []).map((s: any) => s.id);
      const { data: exs } = ids.length ? await sb.from("qa_extras").select("id, spring_clean_id, status, photos, submitted_at, decided_by, office_note, note").in("spring_clean_id", ids) : { data: [] as any[] };
      const exOf = new Map((exs ?? []).map((e: any) => [e.spring_clean_id, e]));
      const rows = (data ?? []).map((s: any) => {
        const e: any = exOf.get(s.id);
        return { id: s.id, propertyId: s.property_id, property: s.property_name, from: s.date_from, to: s.date_to, cleaner: s.cleaner_name, cleanerId: s.cleaner_id,
          approvedBy: s.approved_by, approvedOn: s.approved_at, requestedBy: s.requested_by, createdAt: s.created_at, notes: s.notes, status: s.status, test: s.test,
          hhBlockId: s.hh_block_id, hhError: s.hh_error, cancelledBy: s.cancelled_by,
          cstSentAt: s.cst_sent_at, cstDryRunAt: s.cst_dry_run_at, cstError: s.cst_error, cstCancelSentAt: s.cst_cancel_sent_at, cstCancelDryAt: s.cst_cancel_dry_at,
          blockedBy: s.blocked_by, blockedSource: s.blocked_source, blockedAt: s.hh_blocked_at, blockCheck: s.block_check, hhDetect: s.hh_detect,
          pingSentAt: s.ping_sent_at, pingDryAt: s.ping_dry_at,
          extra: e ? { status: e.status, before: (e.photos ?? []).filter((x: any) => x.kind === "before").length, after: (e.photos ?? []).filter((x: any) => x.kind === "after").length,
            submittedAt: e.submitted_at, decidedBy: e.decided_by, officeNote: e.office_note, note: e.note } : null };
      });
      return json({ ok: true, name: staff, rows });
    }

    const sid = String(body.id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(sid)) return fail("Pick a spring clean.");
    const { data: sc } = await sb.from("qa_spring_cleans").select("*").eq("id", sid).maybeSingle();
    if (!sc) return fail("This spring clean was not found.", 404);
    const { data: ex } = await sb.from("qa_extras").select("*").eq("spring_clean_id", sid).maybeSingle();

    if (route === "spring-cancel") {
      if (sc.status === "cancelled") return json({ ok: true });
      if (sc.status === "done" || (ex && ex.status !== "draft")) return fail("The housekeeper has already sent this spring clean, so it can't be cancelled.");
      const { error } = await sb.from("qa_spring_cleans").update({ status: "cancelled", cancelled_by: staff, cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", sid);
      if (error) return fail("Could not cancel. Try again.", 500);
      return json({ ok: true, cstToCancel: !!(sc.cst_sent_at || sc.hh_blocked_at) });
    }
    if (route === "spring-mark-blocked") {
      if (sc.status !== "requested" && sc.status !== "blocked") return fail("Only an open spring clean can be marked blocked.");
      const raw = String(body.blockId ?? "").replace(/[#\s]/g, "");
      if (raw && !/^\d{5,8}$/.test(raw)) return fail("The HomHero block number is the reservation number, for example 267120.");
      const bid = raw ? Number(raw) : null;
      if (!bid && sc.status === "blocked") return fail("It is already marked blocked. Enter the block number to add it.");
      const now = new Date().toISOString();
      const patch: any = { hh_block_id: bid ?? sc.hh_block_id, status: "blocked", blocked_by: staff, blocked_source: "staff", updated_at: now, cst_sending_at: null };
      if (sc.status === "requested") patch.hh_blocked_at = now;
      if (bid !== Number(sc.hh_block_id ?? 0)) { patch.block_check = null; patch.block_checked_at = null; }
      const { error } = await sb.from("qa_spring_cleans").update(patch).eq("id", sid).in("status", ["requested", "blocked"]);
      if (error) return fail("Could not save. Try again.", 500);
      return json({ ok: true, blockId: patch.hh_block_id });
    }
    if (!ex || ex.status === "draft") return fail("The housekeeper has not sent this spring clean yet.", 404);
    if (route === "spring-review") {
      const photos = (ex.photos ?? []) as any[];
      const { data: signed } = photos.length ? await sb.storage.from(BUCKET).createSignedUrls(photos.map((x) => x.path), 3600) : { data: [] as any[] };
      const urlOf = new Map((signed ?? []).map((x: any) => [x.path, x.signedUrl]));
      return json({ ok: true, extra: { id: ex.id, status: ex.status, cleaner: ex.cleaner_name, note: ex.note, submittedAt: ex.submitted_at, decidedBy: ex.decided_by, officeNote: ex.office_note,
        checklist: ex.checklist ?? {}, sections: sectionsFor(ex.checklist ?? null),
        photos: photos.map((x) => ({ kind: x.kind, n: x.n, stampedAt: x.stampedAt ?? null, url: urlOf.get(x.path) ?? null })) } });
    }
    // spring-decide
    const decision = body.decision === "approved" || body.decision === "declined" ? body.decision : null;
    if (!decision) return fail("Choose approve or decline.");
    const note = String(body.note ?? "").trim().slice(0, 500);
    if (decision === "declined" && note.length < 3) return fail("Add a short reason so the housekeeper knows why.");
    const { error } = await sb.from("qa_extras").update({ status: decision, decided_at: new Date().toISOString(), decided_by: staff, office_note: note || null }).eq("id", ex.id);
    if (error) return fail("Could not save. Try again.", 500);
    return json({ ok: true });
  }

  // ---------- Spring cleans, n8n "PHH Clean Check - Spring Clean Block" (sync key header, same check as /sync) ----------
  // Rework 5 Nov 2026: NOTHING writes to HomHero. A block made with POST /admin/reservation (#267079) had no room or creator,
  // could not be cancelled, and its number was later reused by RMS for a real guest booking. So:
  //   asks:    status requested, CST not asked yet           -> n8n opens ONE HelpScout conversation (CST inbox) asking for a Maintenance Block
  //   cancels: cancelled after CST was asked or it was blocked -> n8n opens one short HelpScout conversation asking CST to cancel the block
  //   checks:  requested with no block number, or blocked with a number not yet checked -> n8n READ-ONLY HomHero GET /reservations
  //   pings:   blocked, housekeeper not pinged yet            -> push-api /send, one phone notification
  // Dry run: test rows are included only with dry_run AND include_test; every ping goes to the tester phone only (TESTER below),
  // and each dry-run step is recorded once (cst_dry_run_at, cst_cancel_dry_at, ping_dry_at) so a re-run repeats nothing.
  //   /spring-pending {include_test?, dry_run?} -> {ok, dry, asks[], cancels[], checks[], pings[], window}
  //   /spring-update  {id, action, ...} -> {ok}
  //     claim_cst | cst_sent {conv_id, request, cancel} | cst_failed {error, request} | cst_dry {request, cancel}
  //     detected {block_id, dry, detail} | possible {detail} | verified {result}
  //     ping_claim {dry} | ping_result {result, unclaim?}
  if (route === "spring-pending" || route === "spring-update") {
    if (!(await syncKeyOk(req.headers.get("x-sync-key")))) return fail("Forbidden.", 403);
    const TESTER = "Test 1 (Ian)";
    if (route === "spring-pending") {
      const dry = body.dry_run !== false;
      const withTest = body.include_test === true && dry;
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(new Date());
      const base = () => { let q = sb.from("qa_spring_cleans").select("*"); if (!withTest) q = q.eq("test", false); return q; };
      let qa = base().eq("status", "requested").is("cst_sent_at", null).lt("cst_tries", 5).gte("date_to", today);
      qa = dry ? qa.is("cst_dry_run_at", null) : qa;
      let qc = base().eq("status", "cancelled").is("cst_cancel_sent_at", null).lt("cst_tries", 10);
      qc = dry ? qc.is("cst_cancel_dry_at", null).or("cst_sent_at.not.is.null,cst_dry_run_at.not.is.null,hh_blocked_at.not.is.null")
               : qc.or("cst_sent_at.not.is.null,hh_blocked_at.not.is.null");
      const qk = base().in("status", ["requested", "blocked"]).gte("date_to", today).or("and(status.eq.requested,hh_block_id.is.null),and(status.eq.blocked,hh_block_id.not.is.null,block_check.is.null)");
      // A staff-entered block number is pinged only once the read-only check has confirmed it (a wrong number never pings).
      let qp = base().eq("status", "blocked").gte("date_to", today).or("hh_block_id.is.null,block_check.like.ok*");
      qp = dry ? qp.is("ping_dry_at", null) : qp.is("ping_sent_at", null);
      const [{ data: a }, { data: c }, { data: k }, { data: p }] = await Promise.all([qa.order("created_at").limit(20), qc.limit(20), qk.limit(40), qp.limit(20)]);
      const out = (s: any) => ({ id: s.id, test: !!s.test, areaId: Number(s.property_id), property: s.property_name, from: s.date_from, to: s.date_to,
        cleaner: s.cleaner_name, requestedBy: s.requested_by, approvedBy: s.approved_by, approvedOn: s.approved_at, notes: s.notes, status: s.status,
        blockId: s.hh_block_id, blockOk: /^ok/.test(String(s.block_check ?? "")), cstAsked: !!s.cst_sent_at, cstConv: s.cst_conv_id, blockedSource: s.blocked_source,
        pingTo: dry ? TESTER : s.cleaner_name });
      const ks = (k ?? []).map(out);
      let window = null;
      if (ks.length) {
        const from = ks.map((x) => x.from).sort()[0], to = ks.map((x) => x.to).sort().slice(-1)[0];
        const d = new Date(from + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - 14);
        window = { arrival_from: d.toISOString().slice(0, 10), arrival_to: to };
      }
      return json({ ok: true, dry, asks: (a ?? []).map(out), cancels: (c ?? []).map(out), checks: ks, pings: (p ?? []).map(out), window });
    }
    const id = String(body.id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) return fail("Bad id.");
    const { data: s } = await sb.from("qa_spring_cleans").select("*").eq("id", id).maybeSingle();
    if (!s) return fail("Not found.", 404);
    const now = new Date().toISOString();
    const req1 = body.request && typeof body.request === "object" ? body.request : null;
    const errText = String(body.error ?? "").slice(0, 500) || null;
    const detail = body.detail && typeof body.detail === "object" ? body.detail : null;
    const isCancel = s.status === "cancelled";
    let patch: any = null;
    if (body.action === "claim_cst") {
      // Live HelpScout send only. One sender at a time (a claim older than 30 minutes counts as abandoned). Test rows never go to CST.
      if (s.test) return json({ ok: false, reason: "test rows never go to CST" });
      const stale = new Date(Date.now() - 30 * 60000).toISOString();
      const { data: got } = await sb.from("qa_spring_cleans").update({ cst_sending_at: now }).eq("id", id).or(`cst_sending_at.is.null,cst_sending_at.lt.${stale}`).select("id");
      return json({ ok: (got ?? []).length === 1 });
    }
    if (body.action === "cst_sent") {
      if (s.test) return fail("Test rows never go to CST.");
      const conv = String(body.conv_id ?? "").slice(0, 40) || null;
      patch = isCancel ? { cst_cancel_sent_at: now, cst_cancel_conv_id: conv, cst_cancel_request: req1 } : { cst_sent_at: now, cst_conv_id: conv, cst_request: req1 };
      Object.assign(patch, { cst_error: null, cst_sending_at: null });
    } else if (body.action === "cst_failed") patch = { cst_tries: (s.cst_tries ?? 0) + 1, cst_error: errText, cst_sending_at: null, ...(isCancel ? { cst_cancel_request: req1 } : { cst_request: req1 }) };
    else if (body.action === "cst_dry") patch = isCancel ? { cst_cancel_dry_at: now, cst_cancel_request: req1 } : { cst_dry_run_at: now, cst_request: req1 };
    else if (body.action === "detected") {
      // Read-only HomHero check found a SPRING CLEAN Maintenance block at this property over these dates.
      const bid = Number(body.block_id);
      if (!(bid > 0)) return fail("Bad block id.");
      if (s.status !== "requested" || s.hh_block_id) return json({ ok: true, unchanged: true });
      const det = { ...(detail ?? {}), blockId: bid, at: now };
      if (body.dry === true && !s.test) patch = { hh_detect: { ...det, dryRun: "would mark blocked" } };
      else patch = { hh_detect: det, hh_block_id: bid, status: "blocked", hh_blocked_at: now, blocked_by: "HomHero check", blocked_source: "homhero-check",
        block_check: "ok: Maintenance block found in HomHero", block_checked_at: now, cst_sending_at: null };
    } else if (body.action === "possible") patch = { hh_detect: { ...(detail ?? {}), at: now, note: "Maintenance block here without SPRING in its notes, not used" } };
    else if (body.action === "verified") patch = { block_check: String(body.result ?? "").slice(0, 300) || null, block_checked_at: now };
    else if (body.action === "ping_claim") {
      if (s.status !== "blocked") return json({ ok: false, reason: "not blocked" });
      const dry = body.dry === true;
      if (!dry && s.test) return json({ ok: false, reason: "test rows are pinged in dry run only" });
      const field = dry ? "ping_dry_at" : "ping_sent_at";
      const { data: got } = await sb.from("qa_spring_cleans").update({ [field]: now }).eq("id", id).is(field, null).select("id");
      return json({ ok: (got ?? []).length === 1, to: dry ? TESTER : s.cleaner_name });
    } else if (body.action === "ping_result") {
      patch = { ping_result: body.result && typeof body.result === "object" ? body.result : null };
      if (body.unclaim === true) patch.ping_sent_at = null; // housekeeper had no phone on: try again next run
    } else return fail("Unknown action.");
    patch.updated_at = now;
    const { error } = await sb.from("qa_spring_cleans").update(patch).eq("id", id);
    if (error) return fail("Could not save: " + error.message, 500);
    return json({ ok: true });
  }

  return fail("Not found.", 404);
});
