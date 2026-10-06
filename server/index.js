// Servidor HTTP sin dependencias: API JSON + archivos estáticos.
// Por defecto escucha solo en 127.0.0.1 (datos de un niño: no se exponen a la red sin decisión explícita).

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from './store.js';
import { createService, HttpError } from './service.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(here, '..', 'public');
const MAX_BODY = 6_000_000; // fotos en base64

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const SECURITY = {
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new HttpError(413, 'Archivo demasiado grande.'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpError(400, 'JSON inválido.'));
      }
    });
    req.on('error', reject);
  });
}

function send(res, status, body, headers = {}) {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...SECURITY, ...headers });
  res.end(data);
}

export function createApp({ file = null } = {}) {
  const store = new Store(file);
  const svc = createService(store);

  /** Tabla de rutas: [método, patrón, adulto?, manejador] */
  const routes = [];
  const R = (method, pattern, adult, fn) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:([a-zA-Z]+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
    routes.push({ method, re, keys, adult, fn });
  };

  R('GET', '/api/profiles', false, () => ({ profiles: svc.listProfiles(), adult: svc.adultStatus() }));
  R('POST', '/api/profiles', false, ({ body }) => svc.createProfile(body));
  R('GET', '/api/profiles/:pid/home', false, ({ p }) => svc.home(p.pid));
  R('POST', '/api/profiles/:pid/interests', false, ({ p, body }) => svc.setInterests(p.pid, body.interests));
  R('GET', '/api/samples/:level', false, ({ p }) => ({ samples: svc.listSamples(p.level) }));
  R('POST', '/api/profiles/:pid/material', false, ({ p, body }) => svc.previewMaterial({ profileId: p.pid, ...body }));
  R('POST', '/api/profiles/:pid/photo', false, ({ p, body }) => svc.transcribePhoto(p.pid, body.image));
  R('POST', '/api/profiles/:pid/lessons/:lid/rename', false, ({ p, body }) => svc.renameLesson(p.pid, p.lid, body.title));
  R('POST', '/api/profiles/:pid/sessions', false, ({ p, body }) => svc.startStudy(p.pid, body.lessonId));
  R('GET', '/api/profiles/:pid/sessions/:sid', false, ({ p }) => svc.getSession(p.pid, p.sid));
  R('POST', '/api/profiles/:pid/sessions/:sid/answer', false, ({ p, body }) => svc.answer(p.pid, p.sid, body));
  R('POST', '/api/profiles/:pid/sessions/:sid/help', false, ({ p, body }) => svc.help(p.pid, p.sid, body.kind));
  R('POST', '/api/profiles/:pid/sessions/:sid/advance', false, ({ p, body }) => svc.advance(p.pid, p.sid, body.action, body));
  R('POST', '/api/profiles/:pid/review', false, ({ p, body }) => svc.startReview(p.pid, body.conceptKeys));
  R('GET', '/api/profiles/:pid/map', false, ({ p }) => svc.knowledgeMap(p.pid));
  R('POST', '/api/profiles/:pid/exams', false, ({ p, body }) => svc.createExam(p.pid, body));
  R('GET', '/api/profiles/:pid/exams/:eid', false, ({ p }) => svc.getExam(p.pid, p.eid));
  R('POST', '/api/profiles/:pid/exams/:eid/sessions', false, ({ p, body }) => svc.startExamSession(p.pid, p.eid, body.mode));

  // Zona adulta
  R('POST', '/api/adult/setup', false, ({ body }) => svc.setupPin(body.pin));
  R('POST', '/api/adult/unlock', false, ({ body }) => svc.unlock(body.pin));
  R('GET', '/api/adult/status', true, () => svc.adultStatusFull());
  R('POST', '/api/adult/pin', true, ({ body }) => svc.changePin(body.pin));
  R('GET', '/api/adult/profiles/:pid/report', true, ({ p }) => svc.adultReport(p.pid));
  R('GET', '/api/adult/profiles/:pid/sessions/:sid', true, ({ p }) => svc.sessionDetail(p.pid, p.sid));
  R('GET', '/api/adult/profiles/:pid/export', true, ({ p }) => svc.exportProfile(p.pid));
  R('POST', '/api/adult/profiles/:pid/settings', true, ({ p, body }) => svc.setSettings(p.pid, body));
  R('POST', '/api/adult/settings', true, ({ body }) => svc.setSettings(null, body));
  R('POST', '/api/adult/profiles/:pid/reset', true, ({ p }) => svc.resetLearning(p.pid));
  R('DELETE', '/api/adult/profiles/:pid', true, ({ p }) => svc.deleteProfile(p.pid));
  R('DELETE', '/api/adult/profiles/:pid/sessions/:sid', true, ({ p }) => svc.deleteSession(p.pid, p.sid));

  async function handleApi(req, res, url) {
    const route = routes.find((r) => r.method === req.method && r.re.test(url.pathname));
    if (!route) return send(res, 404, { error: 'No encontrado.' });
    const m = route.re.exec(url.pathname);
    const p = {};
    route.keys.forEach((k, i) => (p[k] = decodeURIComponent(m[i + 1])));
    if (route.adult) svc.requireAdult(req.headers['x-adult-token']);
    const body = req.method === 'GET' || req.method === 'DELETE' ? {} : await readBody(req);
    const out = await route.fn({ p, body, query: url.searchParams });
    const headers = url.pathname.endsWith('/export') ? { 'Content-Disposition': 'attachment; filename="datos-del-nino.json"' } : {};
    send(res, 200, out, headers);
  }

  function serveStatic(req, res, url) {
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/') rel = '/index.html';
    const file = path.normalize(path.join(PUBLIC, rel));
    if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, { error: 'Prohibido.' });
    fs.readFile(file, (err, data) => {
      if (err) {
        // SPA: cualquier ruta desconocida sin extensión devuelve index.html
        if (!path.extname(rel)) return fs.readFile(path.join(PUBLIC, 'index.html'), (e2, d2) => (e2 ? send(res, 404, { error: 'No encontrado.' }) : send(res, 200, d2, { 'Content-Type': MIME['.html'] })));
        return send(res, 404, { error: 'No encontrado.' });
      }
      send(res, 200, data, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    });
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Método no permitido.' });
      return serveStatic(req, res, url);
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message });
      console.error(e);
      return send(res, 500, { error: 'Algo salió mal en el tutor. Inténtalo otra vez.' });
    }
  });
  return { server, svc, store };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '127.0.0.1';
  const file = process.env.DATA_FILE || path.join(here, '..', 'data', 'db.json');
  const { server } = createApp({ file });
  server.listen(port, host, () => {
    console.log(`Tutor adaptativo en http://${host}:${port}  (datos: ${file})`);
    if (process.env.ANTHROPIC_API_KEY) console.log('Clave de IA detectada: un adulto puede activar la IA externa en la zona adulta (desactivada por defecto).');
  });
}
