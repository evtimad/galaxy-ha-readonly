'use strict';
// Galaxy 3-144 / E080 A.Monitor receiver for Home Assistant. No panel control.
const http = require('http'), dgram = require('dgram'), fs = require('fs'), path = require('path');

const defaults = { panel_name: 'Galaxy 3-144 V5.00', module_name: 'E080-08A', listen_port: 10002,
  allowed_sender: '', ack_enabled: true, ha_events: true, retain_events: 500, log_raw_messages: true };
let opt = defaults;
try { opt = { ...defaults, ...JSON.parse(fs.readFileSync('/data/options.json', 'utf8')) }; } catch { console.warn('Using default options'); }

// ---- Protocol ----
const INIT_HELLO = 0x0000, INIT_EVENT = 0x9E81, INIT_ACK = 0x4A04;
function crc16(buf, init) {
  let c = init;
  for (const b of buf) { c ^= b << 8; for (let i = 0; i < 8; i++) c = (c & 0x8000) ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff; }
  return c;
}
function withCrc(body, init) { const c = crc16(body, init); return Buffer.concat([body, Buffer.from([c >> 8, c & 0xff])]); }
function crcOk(m, init) { return m.length > 2 && crc16(m.subarray(0, -2), init) === m.readUInt16BE(m.length - 2); }
function helloReply(m) { return withCrc(Buffer.from([0x50, m[1], m[2]]), INIT_HELLO); }
function ackFor(m) { return withCrc(Buffer.from([0x06, m[1], m[2], m[3], 0x52, 0xee, 0x63]), INIT_ACK); }
function digit(b, key) { const c = b ^ key; return c >= 0x30 && c <= 0x39 ? String.fromCharCode(c) : '?'; }
function panelTime(m) { return m.length > 21 ? `?${digit(m[18], 0xB5)}:${digit(m[20], 0x12)}${digit(m[21], 0xD6)}` : ''; }

// ---- Home Assistant API ----
function haToken() {
  if (process.env.SUPERVISOR_TOKEN) return process.env.SUPERVISOR_TOKEN;
  for (const f of ['/run/s6/container_environment/SUPERVISOR_TOKEN', '/var/run/s6/container_environment/SUPERVISOR_TOKEN']) {
    try { const t = fs.readFileSync(f, 'utf8').trim(); if (t) return t; } catch {}
  }
  return '';
}
const HA_TOKEN = haToken();
async function haCall(p, body) {
  if (!opt.ha_events) return;
  if (!HA_TOKEN) { console.warn(`HA API ${p}: no SUPERVISOR_TOKEN, skipped`); return; }
  try {
    const r = await fetch(`http://supervisor/core/api/${p}`, { method: 'POST', headers: { Authorization: `Bearer ${HA_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (r.ok) console.log(`HA API ${p}: OK`); else console.warn(`HA API ${p}: HTTP ${r.status} ${await r.text()}`);
  } catch (e) { console.warn(`HA API ${p}: ${e.message}`); }
}
async function haCheck() {
  if (!opt.ha_events) { console.log('HA integration disabled'); return; }
  if (!HA_TOKEN) { console.warn('HA API: SUPERVISOR_TOKEN not found'); return; }
  try {
    const r = await fetch('http://supervisor/core/api/', { headers: { Authorization: `Bearer ${HA_TOKEN}` } });
    console.log(r.ok ? 'HA API: connected' : `HA API: HTTP ${r.status}`);
    if (r.ok) haCall('states/sensor.galaxy_last_event', { state: 'waiting', attributes: { friendly_name: 'Galaxy last event', icon: 'mdi:shield-alert' } });
  } catch (e) { console.warn(`HA API: ${e.message}`); }
}

// ---- State ----
const state = {
  panel: { name: opt.panel_name, module: opt.module_name, receiver: `udp:${opt.listen_port}`, mode: opt.ack_enabled ? 'receiver (ACK)' : 'passive',
           session: false, ha: HA_TOKEN ? 'token OK' : 'no token', lastSender: null, lastMessageAt: null },
  stats: { received: 0, events: 0, acks: 0, duplicates: 0, rejected: 0, badCrc: 0, unknown: 0, startedAt: new Date().toISOString() },
  events: []
};
const sse = new Set(), recent = new Map();
function push(ev) {
  state.events.unshift(ev); state.events.length = Math.min(state.events.length, opt.retain_events);
  for (const r of sse) r.write(`event: galaxy\ndata: ${JSON.stringify(ev)}\n\n`);
}
const sock = dgram.createSocket('udp4');
function send(buf, info, what) { sock.send(buf, info.port, info.address, err => { if (err) console.error(`${what} send error: ${err.message}`); }); }

sock.on('message', (m, info) => {
  const sender = info.address, hex = m.toString('hex'), now = new Date().toISOString();
  if (!opt.allowed_sender || sender !== opt.allowed_sender) { state.stats.rejected++; console.warn(`Ignored ${m.length} bytes from ${sender}`); return; }
  state.stats.received++; state.panel.lastSender = sender; state.panel.lastMessageAt = now;
  if (opt.log_raw_messages) console.log(`[rx ${sender} ${m.length}B] ${hex}`);

  // Session start (5 bytes, type 0x05)
  if (m.length === 5 && m[0] === 0x05) {
    if (!crcOk(m, INIT_HELLO)) { state.stats.badCrc++; console.warn('Session frame with bad CRC, not answered'); return; }
    state.panel.session = true;
    if (opt.ack_enabled) { const r = helloReply(m); send(r, info, 'Session reply'); if (opt.log_raw_messages) console.log(`[tx] ${r.toString('hex')}`); }
    push({ time: now, type: 'session', title: 'Сесия от E080', detail: hex, sender });
    return;
  }

  // Event (type 0x26, any length) - acknowledged only when CRC is valid
  if (m[0] === 0x26 && m.length >= 8) {
    if (!crcOk(m, INIT_EVENT)) {
      state.stats.badCrc++; console.warn(`Event ${m.length}B with bad CRC, not acknowledged: ${hex}`);
      push({ time: now, type: 'badcrc', title: `Събитие с лош CRC (${m.length} B)`, detail: hex, sender });
      return;
    }
    if (opt.ack_enabled) { const a = ackFor(m); send(a, info, 'ACK'); state.stats.acks++; if (opt.log_raw_messages) console.log(`[tx] ${a.toString('hex')}`); }
    const seq = m.readUInt16BE(2), key = `${seq}:${hex}`, t = Date.now();
    if (recent.has(key) && t - recent.get(key) < 120000) { state.stats.duplicates++; return; }
    recent.set(key, t); for (const [k, v] of recent) if (t - v > 600000) recent.delete(k);
    state.stats.events++;
    const ev = { time: now, type: 'event', title: `Galaxy събитие (${m.length} B)`, length: m.length, seq: seq.toString(16), panel_time: panelTime(m), detail: hex, sender };
    push(ev);
    haCall('events/galaxy_event', { seq: ev.seq, length: m.length, panel_time: ev.panel_time, raw: hex, sender, time: now });
    haCall('states/sensor.galaxy_last_event', { state: now, attributes: { friendly_name: 'Galaxy last event', seq: ev.seq, length: m.length, panel_time: ev.panel_time, raw: hex, icon: 'mdi:shield-alert' } });
    return;
  }

  state.stats.unknown++;
  console.warn(`Unknown frame (${m.length} bytes), not answered: ${hex}`);
  push({ time: now, type: 'unknown', title: `Непознат пакет (${m.length} B)`, detail: hex, sender });
});
sock.on('error', e => console.error('UDP error:', e.message));
sock.bind(opt.listen_port, '0.0.0.0', () => console.log(`Galaxy receiver v0.4.2 on udp/${opt.listen_port}, ACK ${opt.ack_enabled ? 'ON' : 'OFF'}, sender ${opt.allowed_sender || '(none - all ignored)'}`));
setTimeout(haCheck, 3000);

// ---- Web UI ----
const pub = path.join(__dirname, 'public');
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.endsWith('/api/state')) { res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); return res.end(JSON.stringify(state)); }
  if (u.pathname.endsWith('/api/stream')) {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    res.write(': ok\n\n'); sse.add(res); req.on('close', () => sse.delete(res)); return;
  }
  const f = path.join(pub, path.basename(u.pathname) || 'index.html');
  const file = fs.existsSync(f) && fs.statSync(f).isFile() ? f : path.join(pub, 'index.html');
  const type = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html';
  res.writeHead(200, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-store' }); fs.createReadStream(file).pipe(res);
}).listen(8099, '0.0.0.0', () => console.log('Ingress UI on port 8099'));
