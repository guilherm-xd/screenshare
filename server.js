const express = require('express');
const http = require('http');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const HOST_KEY = process.env.HOST_KEY || '';
const VIEW_KEY = process.env.VIEW_KEY || '';

if (HOST_KEY.length < 12 || VIEW_KEY.length < 12 || HOST_KEY === VIEW_KEY) {
  console.error('Defina HOST_KEY e VIEW_KEY diferentes entre si, com 12 ou mais caracteres, no arquivo .env');
  process.exit(1);
}

let iceServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];
if (process.env.ICE_SERVERS) {
  try {
    iceServers = JSON.parse(process.env.ICE_SERVERS);
  } catch (e) {
    console.error('ICE_SERVERS nao e um JSON valido');
    process.exit(1);
  }
}

const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILS = 5;
const RELAY_TYPES = new Set(['offer', 'answer', 'candidate']);
const failures = new Map();

function safeEqual(input, expected) {
  const a = crypto.createHash('sha256').update(String(input || '')).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

function clientIp(req) {
  return req.headers['cf-connecting-ip'] || req.socket.remoteAddress || 'unknown';
}

function isBlocked(ip) {
  const f = failures.get(ip);
  if (!f) return false;
  if (Date.now() - f.last > WINDOW_MS) {
    failures.delete(ip);
    return false;
  }
  return f.count >= MAX_FAILS;
}

function registerFail(ip) {
  const f = failures.get(ip) || { count: 0, last: 0 };
  f.count += 1;
  f.last = Date.now();
  failures.set(ip, f);
}

function send(ws, data) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(data));
}

const app = express();
app.disable('x-powered-by');
app.get('/config', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Cache-Control', 'no-store');
  res.json({ iceServers });
});
app.use(express.static('public'));
app.use(express.static('docs'));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 });

let host = null;
const viewers = new Map();
let nextId = 1;

wss.on('connection', (ws, req) => {
  const ip = clientIp(req);
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  const authTimer = setTimeout(() => {
    if (!ws.role) ws.close();
  }, 10000);

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (!msg || typeof msg.type !== 'string') return;

    if (msg.type === 'host' || msg.type === 'viewer') {
      if (ws.role) return;

      if (isBlocked(ip)) {
        send(ws, { type: 'denied', blocked: true });
        ws.close();
        return;
      }

      const expected = msg.type === 'host' ? HOST_KEY : VIEW_KEY;
      if (!safeEqual(msg.key, expected)) {
        registerFail(ip);
        send(ws, { type: 'denied' });
        return;
      }

      failures.delete(ip);
      clearTimeout(authTimer);

      if (msg.type === 'host') {
        if (host && host !== ws) host.close();
        host = ws;
        ws.role = 'host';
        viewers.forEach((v) => send(host, { type: 'viewer-joined', id: v.id }));
      } else {
        viewers.forEach((v) => {
          send(v, { type: 'replaced' });
          v.close();
        });
        viewers.clear();
        ws.role = 'viewer';
        ws.id = String(nextId++);
        viewers.set(ws.id, ws);
        if (host) send(host, { type: 'viewer-joined', id: ws.id });
        else send(ws, { type: 'waiting' });
      }
      return;
    }

    if (!RELAY_TYPES.has(msg.type)) return;

    if (ws.role === 'host' && msg.to) {
      const v = viewers.get(String(msg.to));
      send(v, { type: msg.type, sdp: msg.sdp, candidate: msg.candidate });
      return;
    }

    if (ws.role === 'viewer' && host) {
      send(host, { type: msg.type, from: ws.id, sdp: msg.sdp, candidate: msg.candidate });
    }
  });

  ws.on('close', () => {
    clearTimeout(authTimer);
    if (ws.role === 'host' && host === ws) {
      host = null;
      viewers.forEach((v) => send(v, { type: 'host-left' }));
    }
    if (ws.role === 'viewer') {
      viewers.delete(ws.id);
      send(host, { type: 'viewer-left', id: ws.id });
    }
  });
});

setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) {
      ws.terminate();
      return;
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 25000);

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Servidor pronto. Abra o host em: http://127.0.0.1:${PORT}/host.html`);
});
