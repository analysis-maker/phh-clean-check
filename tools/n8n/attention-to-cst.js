import { workflow, node, trigger, ifElse, expr } from '@n8n/workflow-sdk';

const every10 = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: 'Every 10 min 6am-7pm Sydney', parameters: { rule: { interval: [{ field: 'cronExpression', expression: '*/10 6-18 * * *' }] } } } });
const runNow = trigger({ type: 'n8n-nodes-base.manualTrigger', version: 1, config: { name: 'Run Now' } });

const settings = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Settings', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `// PHH Clean Check - Attention Send to CST (Ian: "GO LIVE", 23 Nov 2026).
// Office > Needs attention > "Send to CST" saves the card in qa_attn_cst. Every 10 min this opens ONE HelpScout conversation
// per card in the CST inbox (from cleancheck-alerts@, tag clean-check-attention). Never to the housekeeper. An Undo in the
// queue before the next run stops it (rpc qa_attn_cst_due only returns cards still marked "Sent to CST").
// DRY_RUN = true: builds the conversations and returns them, nothing sent, nothing marked.
const DRY_RUN = false;
return [{ json: { DRY_RUN } }];` } } });

const readKey = node({ type: 'n8n-nodes-base.n8n', version: 1, config: { name: 'Read Sync Key', executeOnce: true, parameters: { resource: 'workflow', operation: 'get', workflowId: { __rl: true, mode: 'id', value: '8ueXETdv3gP06wjP' } }, credentials: { n8nApi: { id: 'CfYcc1eJMFt7MxiR', name: 'n8n account' } } } });

const build = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Build Conversations', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `// Reads the Clean Check sync key at run time (never stored here, never output).
const S = $('Settings').first().json;
let key = '';
for (const n of ($input.first().json.nodes || [])) {
  for (const h of ((((n.parameters || {}).headerParameters || {}).parameters) || [])) { if (h.name === 'x-sync-key' && String(h.value || '').startsWith('phhsync_')) { key = h.value; break; } }
  if (key) break;
}
if (!key) throw new Error('No sync key found. Nothing was sent.');
const SB = 'https://rxhpnowszmetjxbwylil.supabase.co';
const PUB = 'sb_publishable_JaFEZTFufkk0hrminCZdXQ_fQFJ0kLb';
const due = await this.helpers.httpRequest({ method: 'POST', url: SB + '/rest/v1/rpc/qa_attn_cst_due', headers: { apikey: PUB, 'content-type': 'application/json' }, body: { sync_key: key }, json: true });
const list = Array.isArray(due) ? due : [];
const VIEW = 'https://analysis-maker.github.io/phh-clean-check/view.html';
const OFFICE = 'https://professionalholidayhomes.com.au/checkcleaning/office.html';
const NL = String.fromCharCode(10);
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const dayOf = (d) => { if (!d) return ''; const x = DateTime.fromISO(String(d).slice(0, 10), { zone: 'Australia/Sydney' }); return x.isValid ? x.toFormat('ccc d LLL yyyy') : String(d); };
const what = (keys) => { const k = (keys || []).map((x) => String(x).split(':')[0]); const o = []; if (k.includes('ai')) o.push('AI photo review flag'); if (k.includes('note')) o.push('housekeeper note'); if (k.includes('guests')) o.push('more guests than booked'); if (k.includes('missed')) o.push('missed clean check'); return o.join(', ') || 'needs attention item'; };
const out = [];
for (const r of list) {
  const prop = String(r.property_name || 'a property');
  const subject = prop + ': passed to CST from Clean Check (' + what(r.keys) + ')';
  const link = r.submission_id ? VIEW + '?id=' + encodeURIComponent(r.submission_id) + '&from=office' : '';
  const html = '<p><b>' + esc(subject) + '</b></p>'
    + '<p>Property: ' + esc(prop) + (r.res ? ' (booking ' + esc(r.res) + ')' : '') + '<br>Clean date: ' + esc(dayOf(r.clean_date)) + '<br>Housekeeper: ' + esc(r.housekeeper || '') + '<br>Passed on by: ' + esc(r.sent_by || '') + '</p>'
    + (r.note ? '<p><b>Note</b><br>' + esc(r.note).split(NL).join('<br>') + '</p>' : '')
    + (link ? '<p><a href="' + esc(link) + '">Open this clean check (photos and checklist)</a></p>' : '')
    + '<p><a href="' + OFFICE + '?tab=attention">Needs attention in the office view</a></p>'
    + '<p>Sent from Clean Check.</p>';
  const email = 'cleancheck-alerts@professionalholidayhomes.com.au';
  const hs = { subject, mailboxId: 287942, type: 'email', status: 'active', autoReply: false, customer: { email }, threads: [{ type: 'customer', customer: { email }, text: html }], tags: ['clean-check-attention'] };
  out.push({ json: { dry: S.DRY_RUN === true, id: r.id, res: String(r.res), subject, hs } });
}
return out;` } } });

const dry = ifElse({ version: 2.2, config: { name: 'Dry Run?', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: expr('{{ $json.dry }}'), operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } } } });

const logDry = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Log Dry Run', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `// DRY RUN: nothing sent, nothing marked.
const items = $input.all().map((i) => i.json);
return [{ json: { mode: 'DRY_RUN', conversations: items.length, would_send: items.map((it) => ({ res: it.res, subject: it.subject, html: it.hs.threads[0].text })) } }];` } } });

const hsNode = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'HelpScout CST', onError: 'continueRegularOutput', parameters: { method: 'POST', url: 'https://api.helpscout.net/v2/conversations', authentication: 'predefinedCredentialType', nodeCredentialType: 'helpScoutOAuth2Api', sendBody: true, specifyBody: 'json', contentType: 'json', jsonBody: expr('{{ JSON.stringify($json.hs) }}'), options: { response: { response: { fullResponse: true, neverError: true } } } }, credentials: { helpScoutOAuth2Api: { id: '4VZ7qTnqrIZ9pX5Q', name: 'HelpScout account CST AUTH' } } } });

const logSent = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Log Sent', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `// LIVE: marks each card (rpc qa_attn_cst_mark). Only a 2xx sets helpscout_at, so a failed send retries next run (for 2 days).
let key = '';
for (const n of ($('Read Sync Key').first().json.nodes || [])) {
  for (const h of ((((n.parameters || {}).headerParameters || {}).parameters) || [])) { if (h.name === 'x-sync-key' && String(h.value || '').startsWith('phhsync_')) { key = h.value; break; } }
  if (key) break;
}
if (!key) throw new Error('No sync key found.');
const built = $('Build Conversations').all().map((i) => i.json).filter((j) => j.dry === false);
const res = $input.all().map((i) => i.json);
const report = [];
for (let i = 0; i < built.length; i++) {
  const it = built[i], r = res[i] || {};
  const code = Number(r.statusCode || 0);
  const ok = code >= 200 && code < 300;
  const h = r.headers || {};
  const conv = h['resource-id'] || h['Resource-ID'] || '';
  const result = ok ? 'helpscout ' + code + (conv ? ' conversation ' + conv : '') : 'helpscout failed ' + (code || '') + ' ' + String(r.error ? (r.error.message || r.error) : '').slice(0, 150);
  await this.helpers.httpRequest({ method: 'POST', url: 'https://rxhpnowszmetjxbwylil.supabase.co/rest/v1/rpc/qa_attn_cst_mark', headers: { apikey: 'sb_publishable_JaFEZTFufkk0hrminCZdXQ_fQFJ0kLb', 'content-type': 'application/json' }, body: { sync_key: key, p_id: it.id, p_ok: ok, p_result: result }, json: true });
  report.push({ res: it.res, subject: it.subject, result });
}
return [{ json: { mode: 'LIVE', conversations: built.length, report } }];` } } });

export default workflow('attn-to-cst', 'PHH Clean Check - Attention Send to CST')
  .add(every10)
  .to(settings)
  .to(readKey)
  .to(build)
  .to(dry.onTrue(logDry).onFalse(hsNode.to(logSent)))
  .add(runNow)
  .to(settings);
