const fs = require('fs');
const http = require('http');
const path = require('path');
const { translate, primaryGuildId } = require('../utils/i18n');
const { getGuildConfig } = require('../utils/storage');
const { CATEGORIES } = require('../commands/help');

const SITE_DIR = path.join(process.cwd(), 'site');
const PORT = Number(process.env.SERVER_PORT || process.env.PORT) || 26574;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.json': 'application/json',
};
const WINDOW_MS = 60_000;
const MAX_PER_IP = 300;
const MAX_API_PER_IP = 60;
const MAX_PER_SECOND = 120;
const MAX_CONNECTIONS = 500;
const MAX_TRACKED_IPS = 20_000;
const STATUS_TTL_MS = 5_000;
const HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Access-Control-Allow-Origin': '*',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
};

const both = text => ({ ar: text, en: translate(text) });

// Descriptions come from the running bot, so the site can never list a stale command
function buildCommandList(client) {
  const listed = new Set();
  const categories = CATEGORIES.map(category => ({
    id: category.id,
    label: both(category.label),
    commands: category.commands.map(([name, desc]) => {
      listed.add(name.split(' ')[0]);
      const line = translate('**' + name + '** — ' + desc);
      const english = line.replace(/^\*\*[^*]+\*\* — /, '');
      const slash = client.commands.get(name.slice(1).split(' ')[0])?.data.description;
      return { name, desc: { ar: desc, en: /[؀-ۿ]/.test(english) ? translate(slash || desc) : english } };
    }),
  }));

  const rest = [...client.commands.values()]
    .filter(cmd => !listed.has('/' + cmd.data.name))
    .map(cmd => ({ name: '/' + cmd.data.name, desc: both(cmd.data.description) }));
  if (rest.length) categories.push({ id: 'other', label: { ar: 'أخرى', en: 'Other' }, commands: rest });
  return JSON.stringify({ categories });
}

function send(res, status, type, body, cache, extra) {
  res.writeHead(status, { ...HEADERS, ...extra, 'Content-Type': type, 'Cache-Control': cache || 'no-cache' });
  res.end(res.req.method === 'HEAD' ? undefined : body);
}

// Files stay in memory, so a traffic spike never touches the disk and unknown paths cannot escape the site folder
function loadSite(dir = SITE_DIR, files = new Map()) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { loadSite(full, files); continue; }
    const type = TYPES[path.extname(entry.name)];
    if (!type) continue;
    const isMedia = type.startsWith('image/') || type.startsWith('font/');
    files.set('/' + path.relative(SITE_DIR, full).split(path.sep).join('/'), {
      type, data: fs.readFileSync(full), cache: type.startsWith('text/html') ? 'no-cache' : 'public, max-age=' + (isMedia ? 86400 : 3600),
    });
  }
  return files;
}

// Only the proxy in front of the app can add the last forwarded address, so it cannot be faked
function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',').map(ip => ip.trim()).filter(Boolean);
  return forwarded[forwarded.length - 1] || null;
}

const visitors = new Map();
let second = 0;
let secondCount = 0;

function overloaded() {
  const now = Math.floor(Date.now() / 1000);
  if (now !== second) { second = now; secondCount = 0; }
  secondCount += 1;
  return secondCount > MAX_PER_SECOND;
}

function overLimit(ip, isApi) {
  if (!ip) return false;
  const now = Date.now();
  let visitor = visitors.get(ip);
  if (!visitor || now >= visitor.resetAt) {
    if (visitors.size >= MAX_TRACKED_IPS) visitors.clear();
    visitor = { all: 0, api: 0, resetAt: now + WINDOW_MS };
    visitors.set(ip, visitor);
  }
  visitor.all += 1;
  if (isApi) visitor.api += 1;
  return visitor.all > MAX_PER_IP || visitor.api > MAX_API_PER_IP;
}

function statusReader(client) {
  let body = '';
  let builtAt = 0;
  return () => {
    if (Date.now() - builtAt < STATUS_TTL_MS) return body;
    const guildId = primaryGuildId();
    const cfg = getGuildConfig(guildId);
    body = JSON.stringify({
      online: client.isReady(), ping: Math.round(client.ws.ping), commands: client.commands.size,
      applications: Boolean(cfg.applications_open),
      applyUrl: cfg.applications_open ? 'https://discord.com/channels/' + guildId + '/' + cfg.apply_room : null,
    });
    builtAt = Date.now();
    return body;
  };
}

module.exports = {
  name: 'clientReady',
  once: true,
  async execute(client) {
    const commands = buildCommandList(client);
    fs.writeFileSync(path.join(SITE_DIR, 'commands.json'), commands);
    const files = loadSite();
    const readStatus = statusReader(client);

    const server = http.createServer((req, res) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'text/plain', 'Method not allowed');
      if (overloaded()) return send(res, 503, 'text/plain', 'Busy, try again shortly', null, { 'Retry-After': '5' });

      let pathname;
      try {
        pathname = decodeURIComponent(new URL(req.url, 'http://site').pathname);
      } catch {
        return send(res, 400, 'text/plain', 'Bad request');
      }

      const isApi = pathname.startsWith('/api/');
      if (overLimit(clientIp(req), isApi)) return send(res, 429, 'text/plain', 'Too many requests', null, { 'Retry-After': '60' });

      if (pathname === '/api/commands') return send(res, 200, 'application/json', commands, 'public, max-age=300');
      if (pathname === '/api/status') return send(res, 200, 'application/json', readStatus());

      const file = files.get(pathname === '/' ? '/index.html' : pathname);
      if (!file) return send(res, 404, 'text/plain', 'Not found');
      return send(res, 200, file.type, file.data, file.cache);
    });

    server.requestTimeout = 10_000;
    server.headersTimeout = 8_000;
    server.keepAliveTimeout = 5_000;
    server.maxConnections = MAX_CONNECTIONS;
    setInterval(() => {
      const now = Date.now();
      for (const [ip, visitor] of visitors) if (now >= visitor.resetAt) visitors.delete(ip);
    }, WINDOW_MS).unref();

    // A site failure must never take the bot down with it
    server.on('error', err => console.error('[WEBSITE]', err.message));
    server.listen(PORT, '0.0.0.0', () => console.log('[WEBSITE] Listening on port ' + PORT));
  },
};
