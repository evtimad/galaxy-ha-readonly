'use strict';
// Galaxy 3-144 / E080 A.Monitor receiver for Home Assistant. Receive-only: no panel control.
const http = require('http'), dgram = require('dgram'), fs = require('fs'), path = require('path');

const defaults = { panel_name: 'Galaxy 3-144 V5.00', module_name: 'E080-08A', listen_port: 10002, allowed_sender: '',
  ack_enabled: true, ha_events: true, zone_names: [], zone_auto_clear_minutes: 0, retain_events: 500, log_raw_messages: true };
let opt = defaults;
try { opt = { ...defaults, ...JSON.parse(fs.readFileSync('/data/options.json', 'utf8')) }; } catch { console.warn('Using default options'); }

// ---- Names (editable in Web UI, stored in /data/names.json) ----
const DATA_DIR = fs.existsSync('/data') ? '/data' : __dirname;
const NAMES_FILE = path.join(DATA_DIR, 'names.json');
const DEFAULT_NAMES = JSON.parse(fs.readFileSync(path.join(__dirname, 'default_names.json'), 'utf8'));
let names;
try { names = JSON.parse(fs.readFileSync(NAMES_FILE, 'utf8')); console.log(`Names loaded from ${NAMES_FILE}`); }
catch { names = JSON.parse(JSON.stringify(DEFAULT_NAMES)); try { fs.writeFileSync(NAMES_FILE, JSON.stringify(names, null, 1)); } catch {} console.log('Names initialised from defaults'); }
names.groups = names.groups || {}; names.zones = names.zones || {};
const optionOverrides = {};
for (const line of opt.zone_names || []) { const m = String(line).match(/^\s*(\d+)\s*[=:]\s*(.+?)\s*$/); if (m) optionOverrides[String(parseInt(m[1], 10))] = m[2]; }
function zoneName(z) { return optionOverrides[z] || names.zones[z]?.name || `Зона ${z}`; }
function groupName(g) { return names.groups[g] || `Група ${g}`; }
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, n);
function validateNames(body) {
  const out = { groups: {}, zones: {} };
  for (const [g, v] of Object.entries(body.groups || {})) if (/^[1-8]$/.test(g)) { const s = clean(v, 40); if (s) out.groups[g] = s; }
  for (const [z, v] of Object.entries(body.zones || {})) {
    if (!/^\d{1,4}$/.test(z)) continue;
    const key = String(parseInt(z, 10));
    out.zones[key] = { name: clean(v?.name, 40) || `Зона ${key}`, group: /^[1-8]$/.test(String(v?.group ?? '')) ? String(v.group) : '', type: clean(v?.type, 20) };
  }
  return out;
}

// ---- Protocol ----
const INIT_HELLO = 0x0000, INIT_ACK = 0x4A04;
function crc16(buf, init) {
  let c = init;
  for (const b of buf) { c ^= b << 8; for (let i = 0; i < 8; i++) c = (c & 0x8000) ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff; }
  return c;
}
function withCrc(body, init) { const c = crc16(body, init); return Buffer.concat([body, Buffer.from([c >> 8, c & 0xff])]); }
function crcOk(m, init) { return init >= 0 && m.length > 2 && crc16(m.subarray(0, -2), init) === m.readUInt16BE(m.length - 2); }
function helloReply(m) { return withCrc(Buffer.from([0x50, m[1], m[2]]), INIT_HELLO); }
function ackFor(m) { return withCrc(Buffer.from([0x06, m[1], m[2], m[3], 0x52, 0xee, 0x63]), INIT_ACK); }
const INIT_FILE = path.join(DATA_DIR, 'crc_inits.json');
const eventInits = { 51: 0x9E81, 63: 0x2912 };
try { Object.assign(eventInits, JSON.parse(fs.readFileSync(INIT_FILE, 'utf8'))); } catch {}
function initFor(m) {
  if (eventInits[m.length] !== undefined) return eventInits[m.length];
  const want = m.readUInt16BE(m.length - 2);
  for (let i = 0; i < 0x10000; i++) if (crc16(m.subarray(0, -2), i) === want) {
    eventInits[m.length] = i;
    try { fs.writeFileSync(INIT_FILE, JSON.stringify(eventInits)); } catch {}
    console.log(`Learned CRC start 0x${i.toString(16)} for ${m.length}-byte events`);
    return i;
  }
  return -1;
}
const XKEY = [0x86, 0x93, 0xb5, 0x37, 0x12, 0xd6, 0xe4, 0x77];
function decode(m) { return Buffer.from(m.subarray(0, m.length - 2).map((b, i) => b ^ XKEY[i % 8])); }
const CODES = { CL: 'Включена', OP: 'Изключена', NL: 'Частично включена', RS: 'Отдалечена връзка',
  BA: 'Взлом', BR: 'Взлом - възстановена', TA: 'Тампер', TR: 'Тампер - възстановен', FA: 'Пожар', FR: 'Пожар - възстановен',
  PA: 'Паник', PR: 'Паник - възстановен', HA: 'Нападение', HR: 'Нападение - възстановено', KA: 'Топлина', KR: 'Топлина - възстановено',
  UA: 'Аларма', UR: 'Аларма - възстановена', MA: 'Медицинска', MR: 'Медицинска - възстановена', BB: 'Зона пропусната (omit)', BU: 'Зона върната',
  AT: 'AC авария', AR: 'AC възстановено', YT: 'Акумулатор авария', YR: 'Акумулатор възстановен' };
const ZONE_ALARM = { BA: 'Взлом', TA: 'Тампер', FA: 'Пожар', PA: 'Паник', HA: 'Нападение', KA: 'Топлина', UA: 'Аларма', MA: 'Медицинска' };
const ZONE_RESTORE = { BR: 'BA', TR: 'TA', FR: 'FA', PR: 'PA', HR: 'HA', KR: 'KA', UR: 'UA', MR: 'MA' };
function parsePayload(m) {
  const d = decode(m).toString('latin1');
  const r = { account: (d.match(/#(\d+)/) || [])[1] || '', time: (d.match(/ti(\d\d:\d\d)/) || [])[1] || '',
    group: (d.match(/\/ri(\d+)/) || [])[1], user: (d.match(/\/id(\d+)/) || [])[1], point: (d.match(/\/pi(\d+)/) || [])[1] };
  const c = d.match(/\/([A-Z]{2})(?=[^A-Za-z]|$)/); r.code = c ? c[1] : '';
  const t = d.match(/A([ -~]{3,})[^ -~]*$/); r.text = t ? t[1].replace(/\s+/g, ' ').trim() : '';
  for (const k of ['group', 'user', 'point']) if (r[k] !== undefined) r[k] = String(parseInt(r[k], 10)); else delete r[k];
  r.description = CODES[r.code] || r.text || r.code;
  r.plain = d.replace(/[^ -~]/g, '.');
  return r;
}

// ---- Persistent state ----
const STATE_FILE = path.join(DATA_DIR, 'galaxy_state.json');
let persisted = { zones: {}, groups: {} };
try { persisted = { zones: {}, groups: {}, ...JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) }; } catch {}
let saveTimer = null;
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { fs.writeFileSync(STATE_FILE, JSON.stringify(persisted)); } catch (e) { console.warn('save:', e.message); } }, 500); }

// ---- Home Assistant API ----
function haToken() {
  if (process.env.SUPERVISOR_TOKEN) return process.env.SUPERVISOR_TOKEN;
  for (const f of ['/run/s6/container_environment/SUPERVISOR_TOKEN', '/var/run/s6/container_environment/SUPERVISOR_TOKEN']) {
    try { const t = fs.readFileSync(f, 'utf8').trim(); if (t) return t; } catch {}
  }
  return '';
}
const HA_TOKEN = haToken();
async function haCall(p, body, quiet) {
  if (!opt.ha_events || !HA_TOKEN) return;
  try {
    const r = await fetch(`http://supervisor/core/api/${p}`, { method: 'POST', headers: { Authorization: `Bearer ${HA_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) console.warn(`HA API ${p}: HTTP ${r.status} ${await r.text()}`); else if (!quiet) console.log(`HA API ${p}: OK`);
  } catch (e) { console.warn(`HA API ${p}: ${e.message}`); }
}
function zoneView(z) {
  const s = persisted.zones[z] || { alarm: false }, n = names.zones[z] || {};
  const g = n.group || '', gs = g && persisted.groups[g] ? persisted.groups[g].state : null;
  return { zone: z, name: zoneName(z), group: g || null, group_name: g ? groupName(g) : null, type: n.type || null,
    armed: !!gs && gs !== 'disarmed', alarm: !!s.alarm, alarm_type: s.alarm_type || null, omitted: !!s.omitted,
    last_code: s.last_code || null, last_text: s.last_text || null, last_change: s.last_change || null, panel_time: s.panel_time || null };
}
function publishZone(z, quiet) {
  const v = zoneView(z);
  return haCall(`states/binary_sensor.galaxy_zone_${z}`, { state: v.alarm ? 'on' : 'off', attributes: {
    friendly_name: v.name, device_class: 'safety', zone: z, group: v.group, group_name: v.group_name, type: v.type, armed: v.armed,
    alarm_type: v.alarm_type, omitted: v.omitted, last_code: v.last_code, last_text: v.last_text, last_change: v.last_change, panel_time: v.panel_time,
    icon: v.alarm ? 'mdi:alarm-light' : v.omitted ? 'mdi:shield-off-outline' : v.armed ? 'mdi:shield-lock' : 'mdi:shield-check' } }, quiet);
}
function publishGroup(g, quiet) {
  const s = persisted.groups[g];
  return haCall(`states/sensor.galaxy_group_${g}`, { state: s.state, attributes: { friendly_name: groupName(g), group: g, user: s.user,
    panel_time: s.panel_time, last_change: s.time, icon: s.state === 'disarmed' ? 'mdi:shield-off-outline' : 'mdi:shield-lock' } }, quiet);
}
function allZones() { return [...new Set([...Object.keys(names.zones), ...Object.keys(persisted.zones)])].sort((a, b) => a - b); }
async function publishAll(quiet) {
  for (const z of allZones()) await publishZone(z, quiet);
  for (const g of Object.keys(persisted.groups)) await publishGroup(g, quiet);
}

// ---- Runtime state ----
const state = {
  panel: { name: opt.panel_name, module: opt.module_name, receiver: `udp:${opt.listen_port}`, mode: opt.ack_enabled ? 'receiver (ACK)' : 'passive',
           session: false, ha: HA_TOKEN ? 'token OK' : 'no token', lastSender: null, lastMessageAt: null },
  stats: { received: 0, events: 0, acks: 0, duplicates: 0, rejected: 0, badCrc: 0, unknown: 0, startedAt: new Date().toISOString() },
  events: [], lastEvent: null
};
const sse = new Set(), recent = new Map();
function notifyUi(ev) { for (const r of sse) r.write(`event: galaxy\ndata: ${JSON.stringify(ev || {})}\n\n`); }
function push(ev) { state.events.unshift(ev); state.events.length = Math.min(state.events.length, opt.retain_events); notifyUi(ev); }
async function haCheck() {
  if (!opt.ha_events) { console.log('HA integration disabled'); return; }
  if (!HA_TOKEN) { console.warn('HA API: SUPERVISOR_TOKEN not found'); return; }
  try {
    const r = await fetch('http://supervisor/core/api/', { headers: { Authorization: `Bearer ${HA_TOKEN}` } });
    console.log(r.ok ? 'HA API: connected' : `HA API: HTTP ${r.status}`);
    if (!r.ok) return;
    if (!state.lastEvent) haCall('states/sensor.galaxy_last_event', { state: 'waiting', attributes: { friendly_name: 'Galaxy last event', icon: 'mdi:shield-alert' } });
    await publishAll(true);
    console.log(`Published ${allZones().length} zone(s), ${Object.keys(persisted.groups).length} group(s)`);
  } catch (e) { console.warn(`HA API: ${e.message}`); }
}

function applyEvent(p, now) {
  if (p.group && ['CL', 'OP', 'NL'].includes(p.code)) {
    persisted.groups[p.group] = { state: p.code === 'OP' ? 'disarmed' : p.code === 'NL' ? 'armed_partial' : 'armed', user: p.user, panel_time: p.time, time: now };
    save(); publishGroup(p.group);
    for (const z of allZones()) if ((names.zones[z] || {}).group === p.group) publishZone(z, true);   // update "armed" attribute
  }
  if (!p.point) return;
  const z = p.point;
  if (ZONE_ALARM[p.code]) {
    persisted.zones[z] = { ...(persisted.zones[z] || {}), alarm: true, alarm_type: ZONE_ALARM[p.code], alarm_code: p.code,
      last_code: p.code, last_text: p.text, panel_time: p.time, last_change: now };
  } else if (ZONE_RESTORE[p.code]) {
    const cur = persisted.zones[z] || {};
    const clears = !cur.alarm_code || cur.alarm_code === ZONE_RESTORE[p.code];
    persisted.zones[z] = { ...cur, alarm: clears ? false : !!cur.alarm, alarm_type: clears ? null : cur.alarm_type, alarm_code: clears ? null : cur.alarm_code,
      last_code: p.code, last_text: p.text, panel_time: p.time, last_change: now };
  } else if (p.code === 'BB' || p.code === 'BU') {
    persisted.zones[z] = { alarm: false, ...(persisted.zones[z] || {}), omitted: p.code === 'BB', last_code: p.code, last_text: p.text, panel_time: p.time, last_change: now };
  } else return;
  save(); publishZone(z);
}

if (opt.zone_auto_clear_minutes > 0) setInterval(() => {
  const limit = Date.now() - opt.zone_auto_clear_minutes * 60000;
  for (const [z, s] of Object.entries(persisted.zones)) if (s.alarm && Date.parse(s.last_change) < limit) {
    Object.assign(s, { alarm: false, alarm_type: null, alarm_code: null, last_text: 'auto-clear', last_change: new Date().toISOString() });
    save(); publishZone(z); console.log(`Zone ${z}: alarm auto-cleared`);
  }
}, 60000);
setInterval(() => publishAll(true), 5 * 60000);

// ---- UDP receiver ----
const sock = dgram.createSocket('udp4');
function send(buf, info, what) { sock.send(buf, info.port, info.address, err => { if (err) console.error(`${what} send error: ${err.message}`); }); }
sock.on('message', (m, info) => {
  const sender = info.address, hex = m.toString('hex'), now = new Date().toISOString();
  if (!opt.allowed_sender || sender !== opt.allowed_sender) { state.stats.rejected++; console.warn(`Ignored ${m.length} bytes from ${sender}`); return; }
  state.stats.received++; state.panel.lastSender = sender; state.panel.lastMessageAt = now;
  if (opt.log_raw_messages) console.log(`[rx ${sender} ${m.length}B] ${hex}`);

  if (m.length === 5 && m[0] === 0x05) {
    if (!crcOk(m, INIT_HELLO)) { state.stats.badCrc++; console.warn('Session frame with bad CRC, not answered'); return; }
    state.panel.session = true;
    if (opt.ack_enabled) send(helloReply(m), info, 'Session reply');
    push({ time: now, type: 'session', title: 'Сесия от E080', detail: hex });
    return;
  }
  if (m[0] === 0x26 && m.length >= 8) {
    if (!crcOk(m, initFor(m))) {
      state.stats.badCrc++; console.warn(`Event ${m.length}B with bad CRC, not acknowledged: ${hex}`);
      push({ time: now, type: 'badcrc', title: `Събитие с лош CRC (${m.length} B)`, detail: hex });
      return;
    }
    if (opt.ack_enabled) { send(ackFor(m), info, 'ACK'); state.stats.acks++; }
    const t = Date.now();
    if (recent.has(hex) && t - recent.get(hex) < 120000) { state.stats.duplicates++; return; }
    recent.set(hex, t); for (const [k, v] of recent) if (t - v > 600000) recent.delete(k);
    state.stats.events++;
    const p = parsePayload(m);
    const isZone = !!(ZONE_ALARM[p.code] || ZONE_RESTORE[p.code] || p.code === 'BB' || p.code === 'BU');
    const zn = isZone && p.point ? zoneName(p.point) : null, gn = p.group ? groupName(p.group) : null;
    const ev = { time: now, type: 'event', title: p.text || p.description || `Събитие (${m.length} B)`, code: p.code, description: p.description,
      group: p.group, group_name: gn, user: p.user, point: p.point, zone_name: zn, panel_time: p.time, detail: p.plain };
    push(ev); state.lastEvent = ev;
    console.log(`Event ${p.code} "${p.text}" group=${p.group ?? '-'} user=${p.user ?? '-'} point=${p.point ?? '-'}${zn ? ` (${zn})` : ''} @${p.time} | ${p.plain}`);
    haCall('events/galaxy_event', { code: p.code, text: p.text, description: p.description, group: p.group, group_name: gn, user: p.user, point: p.point,
      zone: isZone ? p.point : null, zone_name: zn, account: p.account, panel_time: p.time, raw: hex, time: now });
    haCall('states/sensor.galaxy_last_event', { state: (p.text || p.code || 'event').slice(0, 250), attributes: { friendly_name: 'Galaxy last event',
      code: p.code, description: p.description, group: p.group, group_name: gn, user: p.user, point: p.point, zone_name: zn, panel_time: p.time, received: now, icon: 'mdi:shield-alert' } });
    applyEvent(p, now);
    return;
  }
  state.stats.unknown++;
  console.warn(`Unknown frame (${m.length} bytes), not answered: ${hex}`);
  push({ time: now, type: 'unknown', title: `Непознат пакет (${m.length} B)`, detail: hex });
});
sock.on('error', e => console.error('UDP error:', e.message));

// ---- Web UI (Ingress) ----
const pub = path.join(__dirname, 'public');
function json(res, code, obj) { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); }
function startWeb() {
  http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname.endsWith('/api/state')) {
      const zones = Object.fromEntries(allZones().map(z => [z, zoneView(z)]));
      const groups = {};
      for (let g = 1; g <= 8; g++) groups[g] = { name: groupName(String(g)), ...(persisted.groups[g] || { state: null }) };
      return json(res, 200, { ...state, zones, groups });
    }
    if (u.pathname.endsWith('/api/names')) {
      if (req.method === 'GET') return json(res, 200, names);
      if (req.method === 'POST') {
        let body = '';
        req.on('data', c => { body += c; if (body.length > 300000) req.destroy(); });
        req.on('end', () => {
          try {
            const v = validateNames(JSON.parse(body));
            const removed = Object.keys(names.zones).filter(z => !v.zones[z]);
            names = v; fs.writeFileSync(NAMES_FILE, JSON.stringify(names, null, 1));
            console.log(`Names saved: ${Object.keys(names.zones).length} zone(s), ${Object.keys(names.groups).length} group(s)`);
            publishAll(true); notifyUi();
            json(res, 200, { ok: true, zones: Object.keys(names.zones).length, groups: Object.keys(names.groups).length, removed });
          } catch (e) { json(res, 400, { ok: false, error: e.message }); }
        });
        return;
      }
      return json(res, 405, { ok: false });
    }
    if (u.pathname.endsWith('/api/names/reset') && req.method === 'POST') {
      names = JSON.parse(JSON.stringify(DEFAULT_NAMES)); fs.writeFileSync(NAMES_FILE, JSON.stringify(names, null, 1));
      publishAll(true); notifyUi(); return json(res, 200, { ok: true });
    }
    if (u.pathname.endsWith('/api/stream')) {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
      res.write(': ok\n\n'); sse.add(res); req.on('close', () => sse.delete(res)); return;
    }
    const f = path.join(pub, path.basename(u.pathname) || 'index.html');
    const file = fs.existsSync(f) && fs.statSync(f).isFile() ? f : path.join(pub, 'index.html');
    const type = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html';
    res.writeHead(200, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-store' }); fs.createReadStream(file).pipe(res);
  }).listen(8099, '0.0.0.0', () => console.log('Ingress UI on port 8099'));
}

if (require.main === module) {
  sock.bind(opt.listen_port, '0.0.0.0', () => console.log(`Galaxy receiver v0.7.0 on udp/${opt.listen_port}, ACK ${opt.ack_enabled ? 'ON' : 'OFF'}, sender ${opt.allowed_sender || '(none - all ignored)'}, ${allZones().length} zone(s)`));
  setTimeout(haCheck, 3000);
  startWeb();
}
module.exports = { crc16, crcOk, initFor, ackFor, helloReply, parsePayload, applyEvent, persisted, XKEY, validateNames, zoneView, startWeb };
