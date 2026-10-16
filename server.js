const express = require("express");
const http = require("http");
const crypto = require("crypto");
const path = require("path");
const { WebSocketServer } = require("ws");

const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const HOST_KEY = process.env.HOST_KEY || "";
const VIEW_KEY = process.env.VIEW_KEY || "";
const KEY_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  console.error("PORT precisa ser um número entre 1 e 65535.");
  process.exit(1);
}

if (
  !KEY_PATTERN.test(HOST_KEY) ||
  !KEY_PATTERN.test(VIEW_KEY) ||
  /^(SUBSTITUA|CHANGE_ME|REPLACE_ME)/i.test(HOST_KEY) ||
  /^(SUBSTITUA|CHANGE_ME|REPLACE_ME)/i.test(VIEW_KEY) ||
  HOST_KEY === VIEW_KEY
) {
  console.error(
    "Defina HOST_KEY e VIEW_KEY diferentes, com 32 a 128 caracteres alfanuméricos, usando npm run genkey.",
  );
  process.exit(1);
}

function parseIceServers(raw) {
  if (!raw) {
    return [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ];
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error("ICE_SERVERS precisa ser um JSON válido.");
    process.exit(1);
  }

  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 10) {
    console.error("ICE_SERVERS precisa ser uma lista com 1 a 10 servidores.");
    process.exit(1);
  }

  for (const item of parsed) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      console.error("Cada item de ICE_SERVERS precisa ser um objeto.");
      process.exit(1);
    }

    const urls = Array.isArray(item.urls) ? item.urls : [item.urls];
    if (
      !urls.length ||
      urls.length > 10 ||
      urls.some(
        (url) =>
          typeof url !== "string" ||
          url.length > 512 ||
          !/^(stun|stuns|turn|turns):/i.test(url),
      )
    ) {
      console.error("ICE_SERVERS contém uma URL inválida.");
      process.exit(1);
    }

    if (
      item.username !== undefined &&
      (typeof item.username !== "string" || item.username.length > 2048)
    ) {
      console.error("O usuário de ICE_SERVERS é inválido.");
      process.exit(1);
    }

    if (
      item.credential !== undefined &&
      (typeof item.credential !== "string" || item.credential.length > 2048)
    ) {
      console.error("A credencial de ICE_SERVERS é inválida.");
      process.exit(1);
    }
  }

  return parsed.map((item) => {
    const clean = { urls: item.urls };
    if (item.username !== undefined) clean.username = item.username;
    if (item.credential !== undefined) clean.credential = item.credential;
    if (item.credentialType !== undefined && item.credentialType === "password")
      clean.credentialType = "password";
    return clean;
  });
}

function parseAllowedOrigins(raw) {
  const origins = new Set();
  for (const value of raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)) {
    try {
      const parsed = new URL(value);
      if (
        !["http:", "https:"].includes(parsed.protocol) ||
        parsed.origin === "null" ||
        parsed.pathname !== "/" ||
        parsed.search ||
        parsed.hash ||
        parsed.username ||
        parsed.password
      ) {
        throw new Error("invalid origin");
      }
      origins.add(parsed.origin);
    } catch {
      console.error(`ALLOWED_ORIGINS contém uma origem inválida: ${value}`);
      process.exit(1);
    }
  }
  return origins;
}

function parseAllowedHosts(raw) {
  const hosts = new Set();
  for (const value of raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)) {
    if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(value)) {
      console.error(`ALLOWED_HOSTS contém um host inválido: ${value}`);
      process.exit(1);
    }
    hosts.add(value);
  }
  return hosts;
}

const iceServers = parseIceServers(process.env.ICE_SERVERS || "");
const allowedOrigins = parseAllowedOrigins(process.env.ALLOWED_ORIGINS || "");
const allowedHosts = parseAllowedHosts(process.env.ALLOWED_HOSTS || "");
const turnUrlsRaw = (process.env.TURN_URLS || "").trim();
const turnSharedSecret = process.env.TURN_SHARED_SECRET || "";
const turnTtlRaw = process.env.TURN_TTL_SECONDS || "3600";
const turnUrls = turnUrlsRaw
  ? turnUrlsRaw.split(",").map((url) => url.trim())
  : [];
const turnTtlSeconds = Number.parseInt(turnTtlRaw, 10);

if (
  turnUrls.length > 10 ||
  turnUrls.some((url) => !/^turns?:[^\s,]+$/i.test(url))
) {
  console.error(
    "TURN_URLS precisa conter URLs turn: ou turns: válidas, separadas por vírgula.",
  );
  process.exit(1);
}

if (Boolean(turnUrls.length) !== Boolean(turnSharedSecret)) {
  console.error("Configure TURN_URLS e TURN_SHARED_SECRET juntos.");
  process.exit(1);
}

if (turnSharedSecret && turnSharedSecret.length < 32) {
  console.error(
    "TURN_SHARED_SECRET precisa ter pelo menos 32 caracteres aleatórios.",
  );
  process.exit(1);
}

if (
  !Number.isInteger(turnTtlSeconds) ||
  turnTtlSeconds < 300 ||
  turnTtlSeconds > 86400
) {
  console.error("TURN_TTL_SECONDS precisa ficar entre 300 e 86400.");
  process.exit(1);
}

function getIceServers() {
  const configured = iceServers.map((item) => ({ ...item }));
  if (turnUrls.length) {
    const username = `${Math.floor(Date.now() / 1000) + turnTtlSeconds}:${crypto.randomBytes(12).toString("hex")}`;
    const credential = crypto
      .createHmac("sha1", turnSharedSecret)
      .update(username)
      .digest("base64");
    configured.push({ urls: turnUrls, username, credential });
  }
  return configured;
}
const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILS = 5;
const MAX_FAILURE_ENTRIES = 10000;
const MAX_CONNECTIONS = 20;
const MAX_CONNECTIONS_PER_IP = 6;
const MESSAGE_WINDOW_MS = 10 * 1000;
const MAX_MESSAGES_PER_WINDOW = 300;
const MAX_SDP_LENGTH = 60 * 1024;
const MAX_CANDIDATE_LENGTH = 4096;
const RELAY_TYPES = new Set(["offer", "answer", "candidate"]);
const failures = new Map();
const activeConnectionsByIp = new Map();
let activeConnections = 0;

function safeEqual(input, expected) {
  const a = crypto.createHash("sha256").update(input).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

function isLoopback(address) {
  if (!address) return false;
  return (
    address === "127.0.0.1" ||
    address === "::1" ||
    address === "::ffff:127.0.0.1"
  );
}

function clientIp(req) {
  const remoteAddress = req.socket.remoteAddress || "unknown";
  const forwardedIp = req.headers["cf-connecting-ip"];
  if (
    isLoopback(remoteAddress) &&
    typeof forwardedIp === "string" &&
    forwardedIp.length <= 64 &&
    !/[\s,]/.test(forwardedIp)
  ) {
    return forwardedIp;
  }
  return remoteAddress;
}

function isHostAllowed(hostHeader) {
  if (typeof hostHeader !== "string" || !hostHeader || hostHeader.length > 255)
    return false;
  if (!/^[a-z0-9.\-:\[\]]+$/i.test(hostHeader)) return false;
  let hostname;
  try {
    hostname = new URL(`http://${hostHeader}`).hostname;
  } catch {
    return false;
  }
  if (["127.0.0.1", "localhost", "[::1]"].includes(hostname)) return true;
  if (hostname.endsWith(".trycloudflare.com")) return true;
  return allowedHosts.has(hostname);
}

function isOriginAllowed(origin, host) {
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.origin === "null" ||
      parsed.username ||
      parsed.password
    )
      return false;
    if (parsed.host.toLowerCase() === String(host || "").toLowerCase())
      return true;
    return allowedOrigins.has(parsed.origin);
  } catch {
    return false;
  }
}

function applyCors(req, res) {
  const origin = req.get("origin");
  if (!origin) return true;
  if (!isOriginAllowed(origin, req.headers.host)) {
    res.status(403).json({ error: "Origem não autorizada." });
    return false;
  }
  res.set("Access-Control-Allow-Origin", new URL(origin).origin);
  res.vary("Origin");
  return true;
}

function isBlocked(ip) {
  if (isLoopback(ip)) return false;
  const failure = failures.get(ip);
  if (!failure) return false;
  if (Date.now() - failure.last > WINDOW_MS) {
    failures.delete(ip);
    return false;
  }
  return failure.count >= MAX_FAILS;
}

function registerFail(ip) {
  if (isLoopback(ip)) return;
  if (!failures.has(ip) && failures.size >= MAX_FAILURE_ENTRIES) {
    failures.delete(failures.keys().next().value);
  }
  const failure = failures.get(ip) || { count: 0, last: 0 };
  failure.count += 1;
  failure.last = Date.now();
  failures.set(ip, failure);
}

function send(ws, data) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(data));
}

function validSdp(sdp, expectedType) {
  return Boolean(
    sdp &&
    typeof sdp === "object" &&
    !Array.isArray(sdp) &&
    sdp.type === expectedType &&
    typeof sdp.sdp === "string" &&
    sdp.sdp.length <= MAX_SDP_LENGTH,
  );
}

function validCandidate(candidate) {
  return Boolean(
    candidate &&
    typeof candidate === "object" &&
    !Array.isArray(candidate) &&
    typeof candidate.candidate === "string" &&
    candidate.candidate.length <= MAX_CANDIDATE_LENGTH,
  );
}

function rejectUpgrade(socket, status, message) {
  if (socket.destroyed) return;
  socket.end(
    `HTTP/1.1 ${status} ${message}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
  );
}

const app = express();
app.disable("x-powered-by");
app.use((req, res, next) => {
  if (!isHostAllowed(req.headers.host)) {
    res.status(403).type("text/plain").send("Host não autorizado.");
    return;
  }
  next();
});
app.use((req, res, next) => {
  res.set(
    "Content-Security-Policy",
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self' ws: wss:; media-src 'self' blob:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  );
  res.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), display-capture=(self), fullscreen=(self)",
  );
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Referrer-Policy", "no-referrer");
  res.set("X-Frame-Options", "DENY");
  res.set("Cache-Control", "no-store");
  next();
});

function configOrigin(req, res, next) {
  if (!applyCors(req, res)) return;
  next();
}

app.options("/config", configOrigin, (req, res) => {
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  res.status(204).end();
});

app.post(
  "/config",
  configOrigin,
  express.json({ limit: "2kb", strict: true }),
  (req, res) => {
    const ip = clientIp(req);
    if (isBlocked(ip)) {
      res.set("Retry-After", String(Math.ceil(WINDOW_MS / 1000)));
      res.status(429).json({ error: "Muitas tentativas. Aguarde 10 minutos." });
      return;
    }

    const key = req.body && req.body.key;
    if (
      typeof key !== "string" ||
      key.length > 128 ||
      (!safeEqual(key, HOST_KEY) && !safeEqual(key, VIEW_KEY))
    ) {
      registerFail(ip);
      res.status(401).json({ error: "Chave incorreta ou ausente." });
      return;
    }

    failures.delete(ip);
    res.json({ iceServers: getIceServers() });
  },
);

app.all("/config", (req, res) => {
  res.set("Allow", "POST, OPTIONS");
  res.status(405).json({ error: "Método não permitido." });
});

app.use(express.static(path.join(__dirname, "public")));
app.use(express.static(path.join(__dirname, "docs")));
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (
    err &&
    (err.type === "entity.too.large" ||
      err.type === "entity.parse.failed" ||
      err instanceof SyntaxError)
  ) {
    res.status(400).json({ error: "Requisição inválida." });
    return;
  }
  if (
    err &&
    Number.isInteger(err.status) &&
    err.status >= 400 &&
    err.status < 500
  ) {
    res.status(err.status).json({ error: "Requisição inválida." });
    return;
  }
  res.status(500).json({ error: "Erro interno." });
});

const server = http.createServer(app);
server.maxHeadersCount = 100;
server.headersTimeout = 10000;
server.requestTimeout = 15000;
const wss = new WebSocketServer({
  noServer: true,
  maxPayload: 64 * 1024,
  perMessageDeflate: false,
});

server.on("upgrade", (req, socket, head) => {
  socket.on("error", () => {});
  let pathname;
  try {
    pathname = new URL(req.url, "http://localhost").pathname;
  } catch {
    rejectUpgrade(socket, 400, "Bad Request");
    return;
  }

  if (pathname !== "/") {
    rejectUpgrade(socket, 404, "Not Found");
    return;
  }

  if (!isHostAllowed(req.headers.host)) {
    rejectUpgrade(socket, 403, "Forbidden");
    return;
  }

  if (!isOriginAllowed(req.headers.origin, req.headers.host)) {
    rejectUpgrade(socket, 403, "Forbidden");
    return;
  }

  const ip = clientIp(req);
  if (
    activeConnections >= MAX_CONNECTIONS ||
    (activeConnectionsByIp.get(ip) || 0) >= MAX_CONNECTIONS_PER_IP
  ) {
    rejectUpgrade(socket, 429, "Too Many Requests");
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    activeConnections += 1;
    activeConnectionsByIp.set(ip, (activeConnectionsByIp.get(ip) || 0) + 1);
    ws.clientIp = ip;
    wss.emit("connection", ws, req);
  });
});

let host = null;
const viewers = new Map();
let nextId = 1;

wss.on("connection", (ws) => {
  const ip = ws.clientIp;
  ws.isAlive = true;
  ws.messageWindowStart = Date.now();
  ws.messageCount = 0;
  ws.on("error", () => {});
  ws.on("pong", () => {
    ws.isAlive = true;
  });

  const authTimer = setTimeout(() => {
    if (!ws.role) ws.close(1008, "Autenticação obrigatória");
  }, 10000);

  ws.on("message", (raw, isBinary) => {
    const now = Date.now();
    if (now - ws.messageWindowStart >= MESSAGE_WINDOW_MS) {
      ws.messageWindowStart = now;
      ws.messageCount = 0;
    }
    ws.messageCount += 1;
    if (ws.messageCount > MAX_MESSAGES_PER_WINDOW || isBinary) {
      ws.close(1008, "Limite de mensagens excedido");
      return;
    }

    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg.type !== "string") return;

    if (msg.type === "host" || msg.type === "viewer") {
      if (ws.role) return;

      if (isBlocked(ip)) {
        send(ws, { type: "denied", blocked: true });
        ws.close(1008, "Muitas tentativas");
        return;
      }

      if (typeof msg.key !== "string" || msg.key.length > 128) {
        registerFail(ip);
        send(ws, { type: "denied" });
        return;
      }

      const expected = msg.type === "host" ? HOST_KEY : VIEW_KEY;
      if (!safeEqual(msg.key, expected)) {
        registerFail(ip);
        send(ws, { type: "denied" });
        return;
      }

      failures.delete(ip);
      clearTimeout(authTimer);

      if (msg.type === "host") {
        if (host && host !== ws) host.close(1000, "Host substituído");
        host = ws;
        ws.role = "host";
        viewers.forEach((viewer) =>
          send(host, { type: "viewer-joined", id: viewer.id }),
        );
      } else {
        viewers.forEach((viewer) => {
          send(viewer, { type: "replaced" });
          viewer.close(1000, "Visualizador substituído");
        });
        viewers.clear();
        ws.role = "viewer";
        ws.id = String(nextId++);
        viewers.set(ws.id, ws);
        if (host) send(host, { type: "viewer-joined", id: ws.id });
        else send(ws, { type: "waiting" });
      }
      return;
    }

    if (!RELAY_TYPES.has(msg.type) || !ws.role) return;

    if (
      msg.type === "offer" &&
      ws.role === "host" &&
      typeof msg.to === "string" &&
      /^\d{1,20}$/.test(msg.to) &&
      validSdp(msg.sdp, "offer")
    ) {
      send(viewers.get(msg.to), { type: "offer", sdp: msg.sdp });
      return;
    }

    if (
      msg.type === "answer" &&
      ws.role === "viewer" &&
      validSdp(msg.sdp, "answer")
    ) {
      send(host, { type: "answer", from: ws.id, sdp: msg.sdp });
      return;
    }

    if (msg.type === "candidate" && validCandidate(msg.candidate)) {
      if (
        ws.role === "host" &&
        typeof msg.to === "string" &&
        /^\d{1,20}$/.test(msg.to)
      ) {
        send(viewers.get(msg.to), {
          type: "candidate",
          candidate: msg.candidate,
        });
      } else if (ws.role === "viewer") {
        send(host, {
          type: "candidate",
          from: ws.id,
          candidate: msg.candidate,
        });
      }
    }
  });

  ws.on("close", () => {
    clearTimeout(authTimer);
    activeConnections = Math.max(0, activeConnections - 1);
    const activeForIp = Math.max(0, (activeConnectionsByIp.get(ip) || 1) - 1);
    if (activeForIp === 0) activeConnectionsByIp.delete(ip);
    else activeConnectionsByIp.set(ip, activeForIp);

    if (ws.role === "host" && host === ws) {
      host = null;
      viewers.forEach((viewer) => send(viewer, { type: "host-left" }));
    }
    if (ws.role === "viewer") {
      viewers.delete(ws.id);
      send(host, { type: "viewer-left", id: ws.id });
    }
  });
});

const failureCleanup = setInterval(() => {
  const now = Date.now();
  failures.forEach((failure, ip) => {
    if (now - failure.last > WINDOW_MS) failures.delete(ip);
  });
}, 60 * 1000);
failureCleanup.unref();

const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) {
      ws.terminate();
      return;
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 25000);
heartbeat.unref();

server.listen(PORT, "127.0.0.1", () => {
  console.log(
    `Servidor pronto. Abra o host em: http://127.0.0.1:${PORT}/host.html`,
  );
});
