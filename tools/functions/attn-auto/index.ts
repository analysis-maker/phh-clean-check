// PHH Clean Check - attn-auto v1 (23 Nov 2026, Bella via Ian: "I really don't have time" for Needs attention).
// "Do this for me" on the office Needs attention queue. Sorts every open card, says what it would do and why,
// and only acts when an office user approves (one tap). Office codes only. Never messages housekeepers, never touches HomHero.
//   POST /plan  {code, days?=7} -> {ok, summary:{close, you, wait}, items:[{res, keys, property, cleanDate, housekeeper, action, reason, tag}]}
//   POST /apply {code, items:[{res, keys[], reason}]} -> {ok, done}   (marks each card handled through attn-api /handle, note "Auto: ...")
//   POST /cst   {code, res, keys[], note?} -> {ok}   (staging: "Send to CST" queues the card for the CST inbox and marks it handled)
// Rules (Ian, 23 Nov): AI 2.5 or lower, or any high flag, always stays with a person. Notes and "more guests" are already
// in the CST inbox (n8n Office Notes to CST, qa_alerts), so they close once sent, unless the AI reads them as damage,
// maintenance, safety or a guest complaint. Missed checks close once the 7pm #checkclean report has covered that day.
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const sb = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const PRICE = { in: 3, out: 15 };
const ORIGINS = ["https://analysis-maker.github.io", "https://professionalholidayhomes.com.au", "https://www.professionalholidayhomes.com.au"];
const corsFor = (req: Request) => {
  const o = req.headers.get("origin") ?? "";
  return { "access-control-allow-origin": ORIGINS.includes(o) ? o : ORIGINS[0], "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type", "vary": "origin" };
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sydDate = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(new Date(ms));
const sydHour = () => Number(new Intl.DateTimeFormat("en-US", { timeZone: "Australia/Sydney", hourCycle: "h23", hour: "2-digit" }).format(new Date()));
const sydTime = (iso: string) => new Date(iso).toLocaleString("en-AU", { timeZone: "Australia/Sydney", weekday: "short", hour: "numeric", minute: "2-digit" });

async function staff(code: unknown) {
  const c = String(code ?? "").replace(/\s+/g, "");
  if (!/^\d{4,10}$/.test(c)) { await sleep(600); return null; }
  const { data } = await sb.from("qa_staff_codes").select("staff_name, active, view").eq("code", c).maybeSingle();
  if (!data || !data.active || String(data.view ?? "office") === "maintenance") { await sleep(600); return null; }
  return { code: c, name: String(data.staff_name) };
}
const attn = (route: string, body: unknown) => fetch(`${URL_}/functions/v1/attn-api/${route}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());

const TRIAGE = `You help the housekeeping office of Professional Holiday Homes (holiday rentals, NSW) clear its "needs attention" list after each departure clean.
For each item decide if a person in the office must act ("you") or nothing more is needed ("close").

Items are either:
- AI: an AI photo review of a finished clean (score 1 to 5, 5 = nothing found) with its flags. A housekeeper already sees tips from it.
  "you" ONLY if a flag describes something a guest would clearly notice and that needs someone to go back before the next guests:
  dirty toilet, hair or grime in a shower or bath, food or rubbish left, unmade bed, wet or dirty linen, pests, damage, a safety risk,
  or photos that do not show the property at all (screens, wrong place). Everything else is "close": presentation (cushions, towel
  folding, items not straight), photo quality (blurry, dark, angle, glare, cropped, missing a view), streaks, small marks, minor dust.
- NOTE: the housekeeper's note to the office. It is already in the customer service inbox.
  "you" if it reports damage, something broken or not working, a maintenance problem, a safety issue, a strong smell or pests,
  or a complaint about the property's condition. "close" for lost property, a missing item (cushion, throw, pillow), supplies,
  scheduling or access info, owner on site, or anything purely informational.

Reply with JSON only, no other text: {"items":[{"id":"...","action":"you"|"close","reason":"..."}]}. One item per input id, in order.
reason: under 14 words, plain Australian English, what it is and (for "you") what to check. No em dashes.`;

async function triageBatch(list: { id: string; text: string }[], model: string) {
  const out = new Map<string, { action: string; reason: string }>();
  let err: string | null = null, usage: any = {};
  try {
    const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 55000);
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", signal: ctl.signal,
      headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model, max_tokens: 3000, system: TRIAGE, messages: [{ role: "user", content: list.map((x) => `### ${x.id}\n${x.text}`).join("\n\n") }] }),
    });
    clearTimeout(tm);
    const j = await r.json();
    if (!r.ok) throw new Error("ai " + r.status + " " + String(j?.error?.message ?? "").slice(0, 120));
    usage = j?.usage ?? {};
    const txt = (j.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
    // Read each {"id":..,"action":..,"reason":..} on its own, so one bad item (or a cut-off reply) never loses the rest.
    for (const m of txt.matchAll(/\{[^{}]*"id"\s*:\s*"([^"]+)"[^{}]*\}/g)) {
      try {
        const it = JSON.parse(m[0]);
        out.set(String(it.id), { action: String(it.action) === "close" ? "close" : "you", reason: String(it.reason ?? "").replace(/\s*[\u2014\u2013]\s*/g, ", ").slice(0, 140) });
      } catch { /* skip */ }
    }
    if (out.size < list.length) err = `sorted ${out.size} of ${list.length}`;
  } catch (e) { err = String((e as Error)?.message ?? e).slice(0, 300); }
  return { out, usage, err };
}

async function triage(list: { id: string; text: string }[]) {
  const out = new Map<string, { action: string; reason: string }>();
  if (!list.length || !KEY) return { out, cost: 0, err: KEY ? null : "no key" };
  const { data: st } = await sb.from("qa_assistant_settings").select("model").eq("id", 1).maybeSingle();
  const model = String(st?.model || "claude-sonnet-5-5");
  // The AI sees short ids (i1, i2 ...) so it can't mangle long keys; mapped back here.
  const idOf = new Map<string, string>();
  const short = list.map((x, i) => { idOf.set("i" + (i + 1), x.id); return { id: "i" + (i + 1), text: x.text }; });
  const batches: { id: string; text: string }[][] = [];
  for (let i = 0; i < short.length; i += 12) batches.push(short.slice(i, i + 12));
  const res = await Promise.all(batches.map((b) => triageBatch(b, model)));
  let inT = 0, outT = 0; const errs: string[] = [];
  for (const r of res) { r.out.forEach((v, k) => { const key = idOf.get(k); if (key) out.set(key, v); }); inT += r.usage.input_tokens ?? 0; outT += r.usage.output_tokens ?? 0; if (r.err) errs.push(r.err); }
  const cost = (inT * PRICE.in + outT * PRICE.out) / 1e6;
  const err = errs.length ? errs.join("; ").slice(0, 300) : null;
  await sb.from("qa_assistant_log").insert({ staff_name: "attn-auto", is_admin: true, view: "attn-auto", page: "office", question: `triage ${list.length} items in ${batches.length} batches`,
    answer: `${out.size} sorted`, model, input_tokens: inT, output_tokens: outT, cost_usd: Math.round(cost * 1e6) / 1e6, error: err });
  return { out, cost, err: out.size < list.length ? err : null };
}

Deno.serve(async (req) => {
  const cors = corsFor(req);
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json", "cache-control": "no-store" } });
  const fail = (m: string, s = 400) => json({ error: m }, s);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return fail("Use POST.", 405);
  const route = new URL(req.url).pathname.split("/").pop() ?? "";
  let body: any = {};
  try { body = await req.json(); } catch { return fail("Bad request."); }
  const who = await staff(body.code);
  if (!who) return fail("Sign in again with your office code.", 403);

  if (route === "apply") {
    const items = (Array.isArray(body.items) ? body.items : []).slice(0, 150);
    let done = 0;
    for (const it of items) {
      const res = String(it.res ?? "").slice(0, 40);
      const keys = (Array.isArray(it.keys) ? it.keys : []).map(String).slice(0, 10);
      if (!res || !keys.length) continue;
      const note = ("Auto: " + String(it.reason ?? "sorted by Do this for me")).slice(0, 300);
      const r = await attn("handle", { code: who.code, res, keys, note });
      if (r && r.ok) done++;
    }
    return json({ ok: true, done });
  }

  if (route === "cst") {
    const res = String(body.res ?? "").slice(0, 40);
    const keys = (Array.isArray(body.keys) ? body.keys : []).map(String).slice(0, 10);
    if (!res || !keys.length) return fail("Bad request.");
    const note = String(body.note ?? "").replace(/\s+/g, " ").trim().slice(0, 500);
    const { error } = await sb.from("qa_attn_cst").insert({ res, keys, note: note || null, sent_by: who.name });
    if (error) return fail("Could not save. Try again.", 500);
    const r = await attn("handle", { code: who.code, res, keys, note: "Sent to CST" + (note ? ": " + note : "") });
    return json({ ok: !!(r && r.ok) });
  }

  if (route !== "plan") return fail("Not found.", 404);
  const days = Math.max(1, Math.min(14, Math.floor(Number(body.days) || 7)));
  const q = await attn("queue", { code: who.code, days, handled: false });
  if (!q || !q.ok) return fail("Could not load the queue. Try again.", 502);
  const cards: any[] = (q.items ?? []).filter((c: any) => !c.handled);

  // Notes / more guests already sent to the CST inbox (qa_alerts, live rows only).
  const resList = [...new Set(cards.map((c) => String(c.res)))];
  const sent = new Map<string, string>();
  if (resList.length) {
    const { data } = await sb.from("qa_alerts").select("kind, res, sent_at").in("res", resList).in("kind", ["office_note", "guests_over"]).eq("test", false).not("sent_at", "is", null);
    for (const a of data ?? []) sent.set(`${a.kind === "office_note" ? "note" : "guests"}:${a.res}`, String(a.sent_at));
  }
  const nextIn = new Map<string, string>();
  if (resList.length) {
    const { data } = await sb.from("qa_cleans").select("res, next_arrival_at").in("res", resList);
    for (const c of data ?? []) if (c.next_arrival_at) nextIn.set(String(c.res), String(c.next_arrival_at));
  }
  // next_arrival_at is Sydney local time without a zone
  const arrived = (res: string) => { const n = nextIn.get(res); return !!n && n.replace(" ", "T").slice(0, 16) <= new Intl.DateTimeFormat("sv-SE", { timeZone: "Australia/Sydney", dateStyle: "short", timeStyle: "short" }).format(new Date()).replace(" ", "T"); };
  const today = sydDate(Date.now());
  const reportDone = (d: string) => String(d) < today || (String(d) === today && sydHour() >= 19);

  // Per key: decide by rule, or send to the AI.
  type Part = { key: string; kind: string; action: string; reason: string };
  const parts = new Map<string, Part[]>();
  const ask: { id: string; text: string }[] = [];
  for (const c of cards) {
    const ps: Part[] = [];
    for (const key of c.keys as string[]) {
      const kind = key.split(":")[0];
      if (kind === "missed") {
        ps.push(reportDone(c.cleanDate)
          ? { key, kind, action: "close", reason: "No clean check. In the 7pm #checkclean report for Marson and Bella" }
          : { key, kind, action: "wait", reason: "No clean check yet. Tonight's 7pm report will pick it up" });
      } else if (kind === "guests") {
        const at = sent.get(`guests:${c.res}`);
        ps.push(at ? { key, kind, action: "close", reason: `More guests than booked. In the CST inbox since ${sydTime(at)}` }
          : { key, kind, action: "wait", reason: "More guests than booked. Going to the CST inbox at the next run" });
      } else if (kind === "note") {
        const at = sent.get(`note:${c.res}`);
        if (!at) ps.push({ key, kind, action: "wait", reason: "Note going to the CST inbox at the next run" });
        else { ps.push({ key, kind, action: "ai", reason: `In the CST inbox since ${sydTime(at)}` }); ask.push({ id: key, text: `NOTE at ${c.property}: ${String(c.note ?? "").slice(0, 600)}` }); }
      } else if (kind === "ai") {
        const a = c.ai ?? {}; const score = Number(a.score);
        const flags: any[] = Array.isArray(a.flags) ? a.flags : [];
        if (!(score > 2.5) || flags.some((f) => f.severity === "high")) {
          ps.push({ key, kind, action: "you", reason: `AI ${score || "?"}/5${flags.some((f) => f.severity === "high") ? " with a high flag" : ""}. Always checked by a person` });
        } else if (!flags.length) {
          ps.push({ key, kind, action: "close", reason: `AI ${score}/5, minor notes only. Tips are in the housekeeper's results` });
        } else {
          ps.push({ key, kind, action: "ai", reason: `AI ${score}/5` });
          ask.push({ id: key, text: `AI ${score}/5 at ${c.property}. Summary: ${String(a.summary ?? "").slice(0, 400)}\nFlags:\n` + flags.map((f) => `- [${f.severity}] ${f.label}: ${String(f.note ?? "").slice(0, 200)}`).join("\n") });
        }
      }
    }
    parts.set(String(c.res), ps);
  }
  const t = await triage(ask);
  const items = cards.map((c) => {
    const ps = parts.get(String(c.res)) ?? [];
    for (const p of ps) if (p.action === "ai") {
      const d = t.out.get(p.key);
      if (!d) { p.action = "you"; p.reason += ". Could not sort it automatically"; }
      else { p.action = d.action; p.reason = (p.kind === "note" ? p.reason + ". " : p.reason + ", ") + d.reason; }
      // An AI flag from a clean whose next guests have already arrived can't be fixed by sending someone back.
      if (p.kind === "ai" && p.action === "you" && arrived(String(c.res))) { p.action = "close"; p.reason = p.reason.replace(/\.?\s*$/, "") + ". Next guests already arrived, tips are in the housekeeper's results"; }
    }
    const action = ps.some((p) => p.action === "you") ? "you" : ps.some((p) => p.action === "wait") ? "wait" : "close";
    const pick = ps.filter((p) => p.action === action);
    return { res: c.res, keys: c.keys, property: c.property, cleanDate: c.cleanDate, housekeeper: c.housekeeper, kinds: c.kinds, prio: c.prio,
      action, reason: pick.map((p) => p.reason).join(". ").slice(0, 280), all: ps.map((p) => ({ kind: p.kind, action: p.action, reason: p.reason })) };
  });
  const summary = { close: items.filter((i) => i.action === "close").length, you: items.filter((i) => i.action === "you").length, wait: items.filter((i) => i.action === "wait").length };
  return json({ ok: true, summary, items, aiError: t.err ? "Some items could not be sorted automatically." : null });
});
