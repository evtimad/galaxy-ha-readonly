import http from 'node:http';
import dgram from 'node:dgram';
import net from 'node:net';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const optionsPath = '/data/options.json';
const defaults = {
  panel_name: 'Galaxy 3-144 V5.00', module_name: 'E080-08A', listen_protocol: 'udp',
  listen_port: 1002, bind_address: '0.0.0.0', allowed_sender: '', event_format: 'auto',
  retain_events: 500, log_raw_messages: false
};
let options = defaults;
try { options = { ...defaults, ...JSON.parse(fs.readFileSync(optionsPath, 'utf8')) }; } catch { console.warn('Using default options'); }

const state = {
  panel: { name: options.panel_name, module: options.module_name, mode: 'read-only', receiver: `${options.listen_protocol}:${options.listen_port}`, lastSender: null, lastMessageAt: null },
  stats: { received: 0, rejected: 0, parseErrors: 0, startedAt: new Date().toISOString() },
  events: []
};
const sse = new Set();

function safeText(buffer) {
  return buffer.toString('utf8').replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\uFFFF]/g, '').trim().slice(0, 4096);
}
function classify(text) {
  const upper = text.toUpperCase();
  const codes = [
    ['BA','burglary_alarm','Аларма'], ['BR','burglary_restore','Възстановена аларма'],
    ['TA','tamper','Тампер'], ['TR','tamper_restore','Възстановен тампер'],
    ['FA','fire','Пожар'], ['FR','fire_restore','Възстановен пожар'],
    ['PA','panic','Паник аларма'], ['OP','disarmed','Изключване'], ['CL','armed','Включване'],
    ['AT','ac_fault','Проблем AC'], ['AR','ac_restore','AC възстановено'],
    ['YT','battery_fault','Проблем акумулатор'], ['YR','battery_restore','Акумулатор възстановен']
  ];
  const hit = codes.find(([code]) => new RegExp(`(^|[^A-Z])${code}([^A-Z]|$)`).test(upper));
  return hit ? { code: hit[0], type: hit[1], title: hit[2] } : { code: null, type: 'event', title: 'Събитие от панела' };
}
function hexPreview(buffer) { return buffer.subarray(0, 256).toString('hex').match(/.{1,2}/g)?.join(' ') || ''; }
function redact(text) {
  return text.replace(/\b\d{6,}\b/g, value => `${value.slice(0,2)}***${value.slice(-2)}`);
}
function publish(message, sender, transport) {
  if (options.allowed_sender && sender !== options.allowed_sender) {
    state.stats.rejected += 1;
    console.warn(`Rejected message from ${sender}`);
    return;
  }
  const text = safeText(message);
  if (!text && message.length === 0) { state.stats.parseErrors += 1; return; }
  const meta = classify(text);
  const event = {
    id: crypto.randomUUID(), time: new Date().toISOString(), sender, transport,
    format: options.event_format === 'raw' ? 'raw' : 'sia_text', ...meta,
    message: redact(text || '[binary payload]'), bytes: message.length, hex: hexPreview(message)
  };
  state.stats.received += 1;
  state.panel.lastSender = sender;
  state.panel.lastMessageAt = event.time;
  state.events.unshift(event);
  state.events.length = Math.min(state.events.length, options.retain_events);
  if (options.log_raw_messages) console.log(`[raw:${sender}] ${redact(text)}`);
  const payload = `event: galaxy\ndata: ${JSON.stringify(event)}\n\n`;
  for (const res of sse) res.write(payload);
}

if (options.listen_protocol === 'udp') {
  const socket = dgram.createSocket('udp4');
  socket.on('message', (msg, info) => publish(msg, info.address, 'udp'));
  socket.on('error', error => console.error('UDP listener error:', error.message));
  socket.bind(options.listen_port, options.bind_address, () => console.log(`Read-only UDP listener on ${options.bind_address}:${options.listen_port}`));
} else {
  const server = net.createServer(socket => {
    const sender = socket.remoteAddress?.replace('::ffff:','') || 'unknown';
    socket.setTimeout(30000);
    let pending = '';
    socket.on('data', chunk => {
      pending += chunk.toString('utf8');
      const lines = pending.split(/\r?\n/); pending = lines.pop() || '';
      for (const line of lines) publish(Buffer.from(line), sender, 'tcp');
      if (pending.length > 4096) { publish(Buffer.from(pending), sender, 'tcp'); pending = ''; }
    });
    socket.on('end', () => { if (pending.trim()) publish(Buffer.from(pending), sender, 'tcp'); });
    socket.on('timeout', () => socket.destroy());
  });
  server.on('error', error => console.error('TCP listener error:', error.message));
  server.listen(options.listen_port, options.bind_address, () => console.log(`Read-only TCP listener on ${options.bind_address}:${options.listen_port}`));
}

const web = http.createServer((req,res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/state') return json(res, state);
  if (url.pathname === '/api/events') return json(res, state.events.slice(0, Math.min(500, Number(url.searchParams.get('limit') || 100))));
  if (url.pathname === '/api/stream') {
    res.writeHead(200, {'content-type':'text/event-stream','cache-control':'no-cache','connection':'keep-alive'});
    res.write(`event: state\ndata: ${JSON.stringify(state)}\n\n`); sse.add(res); req.on('close',()=>sse.delete(res)); return;
  }
  const file = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\//,'');
  const target = path.join(__dirname, 'public', file);
  if (!target.startsWith(path.join(__dirname,'public')) || !fs.existsSync(target)) { res.writeHead(404); return res.end('Not found'); }
  const type = target.endsWith('.js') ? 'text/javascript' : target.endsWith('.css') ? 'text/css' : 'text/html';
  res.writeHead(200, {'content-type':`${type}; charset=utf-8`,'cache-control':'no-store'}); fs.createReadStream(target).pipe(res);
});
function json(res, value) { res.writeHead(200, {'content-type':'application/json','cache-control':'no-store'}); res.end(JSON.stringify(value)); }
web.listen(8099, '0.0.0.0', () => console.log('Ingress UI listening on port 8099'));
