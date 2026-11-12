import crypto from 'node:crypto';
import { getSession } from './_lib/session.js';

/**
 * Прокси к Chat API (dating-api) для разделов «Рассылки», «Аналитика» и «Сообщества» (ВК).
 *
 * Токен Chat API живёт только здесь, в переменных Vercel. Доступ — только у GitHub-логинов из CRM_ADMINS:
 * войти в CRM может любой пользователь GitHub, а рассылка уходит всем людям бота, а ключи сообществ управляют самими ботами.
 *
 * Переменные: CHAT_API_URL (например https://api.chatwithyou.site), CHAT_API_CRM_TOKEN,
 * CRM_ADMINS (логины GitHub через запятую), при Cloudflare Access — CF_ACCESS_CLIENT_ID и CF_ACCESS_CLIENT_SECRET.
 */

// Рассылки, чтение пользователей и аналитики, сообщества ВК (без /tokens, /import, /status — они для бота).
const ALLOWED = /^\/(broadcasts(\/audience|\/\d+(\/image)?)?|users(\/stats|\/(vk|tg|web)\/\d+)?|analytics|channels\/vk(\/check|\/\d+(\/token)?)?)(\?[\w=&%.@-]*)?$/;
const READ_ONLY = /^\/(users|analytics)/;
const METHODS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'];
const MAX_BODY = 4.5 * 1024 * 1024;

export const config = { api: { bodyParser: false } };

const logins = new Map(); // sha256(токен) -> { login, until }

async function githubLogin(token) {
  const key = crypto.createHash('sha256').update(token).digest('hex');
  const hit = logins.get(key);
  if (hit && hit.until > Date.now()) return hit.login;
  const r = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'bot-content-crm' },
  });
  if (!r.ok) return null;
  const login = String((await r.json()).login || '');
  logins.set(key, { login, until: Date.now() + 5 * 60 * 1000 });
  return login;
}

const admins = () => String(process.env.CRM_ADMINS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const configured = () => !!(process.env.CHAT_API_URL && process.env.CHAT_API_CRM_TOKEN && admins().length);

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) throw Object.assign(new Error('Файл слишком большой'), { status: 413 });
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.headers['x-requested-with'] !== 'botcrm') return res.status(403).json({ message: 'Forbidden' });
  if (!METHODS.includes(req.method)) return res.status(405).json({ message: 'Method not allowed' });

  const session = getSession(req);
  if (!session) return res.status(401).json({ message: 'Войдите через GitHub' });
  const login = await githubLogin(session.t);
  if (!login) return res.status(401).json({ message: 'Сессия истекла — войдите снова' });
  const isAdmin = admins().includes(login.toLowerCase());

  const path = String(req.query.path || '');
  if (path === '/_status') {
    return res.status(200).json({ configured: configured(), admin: isAdmin, login });
  }
  if (!configured()) return res.status(503).json({ message: 'Рассылки не настроены: задайте CHAT_API_URL, CHAT_API_CRM_TOKEN и CRM_ADMINS в Vercel' });
  if (!isAdmin) return res.status(403).json({ message: `У ${login} нет доступа к разделам Chat API (рассылки, аналитика, сообщества): добавьте логин в CRM_ADMINS` });
  if (!ALLOWED.test(path) || path.includes('..')) return res.status(400).json({ message: 'Path not allowed' });
  if (READ_ONLY.test(path) && req.method !== 'GET') return res.status(405).json({ message: 'Пользователи и аналитика доступны только для чтения' });

  const headers = chatHeaders();
  let body;
  if (req.method !== 'GET' && req.method !== 'DELETE') {
    try {
      body = await readBody(req);
    } catch (e) {
      return res.status(e.status || 400).json({ message: e.message });
    }
    if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];
  }
  let r;
  try {
    r = await fetch(upstream(path), { method: req.method, headers, body, redirect: 'manual', signal: AbortSignal.timeout(25000) });
  } catch (e) {
    const timeout = e.name === 'TimeoutError' || e.name === 'AbortError';
    return res.status(timeout ? 504 : 502).json({ message: timeout ? 'Chat API не ответил за 25 секунд' : 'Chat API недоступен: ' + e.message });
  }
  const problem = upstreamProblem(r);
  if (problem) return res.status(502).json({ message: problem });
  const text = await r.text();
  res.status(r.status);
  res.setHeader('Content-Type', r.headers.get('content-type') || 'application/json');
  res.send(text);
}

const upstream = path => process.env.CHAT_API_URL.replace(/\/+$/, '') + '/api/v1' + path;

function chatHeaders() {
  const headers = { Authorization: `Bearer ${process.env.CHAT_API_CRM_TOKEN}`, Accept: 'application/json' };
  if (process.env.CF_ACCESS_CLIENT_ID && process.env.CF_ACCESS_CLIENT_SECRET) {
    headers['CF-Access-Client-Id'] = process.env.CF_ACCESS_CLIENT_ID;
    headers['CF-Access-Client-Secret'] = process.env.CF_ACCESS_CLIENT_SECRET;
  }
  return headers;
}

/** Ответ не от Chat API: редирект Cloudflare Access на вход или чужая HTML-страница. */
function upstreamProblem(r) {
  const cf = process.env.CF_ACCESS_CLIENT_ID && process.env.CF_ACCESS_CLIENT_SECRET;
  const loc = r.headers.get('location') || '';
  if (r.status >= 300 && r.status < 400) {
    if (/cloudflareaccess\.com|cdn-cgi\/access/.test(loc)) {
      return cf
        ? 'Cloudflare Access не пропускает CRM: сервисный токен из CF_ACCESS_CLIENT_ID/SECRET не добавлен в политику (Service Auth) приложения Chat API или ключи скопированы с ошибкой'
        : 'Chat API закрыт Cloudflare Access: задайте в Vercel CF_ACCESS_CLIENT_ID и CF_ACCESS_CLIENT_SECRET и сделайте Redeploy';
    }
    return `Chat API ответил перенаправлением (${r.status}) на ${loc || 'другой адрес'}: проверьте CHAT_API_URL`;
  }
  const type = r.headers.get('content-type') || '';
  if (r.status === 403 && !type.includes('json')) {
    return 'Cloudflare отклонил запрос (403): проверьте сервисный токен Cloudflare Access и политику приложения Chat API';
  }
  if (r.status === 401 && type.includes('json')) {
    return 'Chat API не принял токен: CHAT_API_CRM_TOKEN в Vercel должен совпадать с CHAT_API_CRM_TOKEN в ENV_FILE сервера, а сервер — быть передеплоен после его добавления';
  }
  if (r.ok && r.status !== 204 && !type.includes('json')) {
    return `Chat API ответил не JSON (${type || 'без типа'}): проверьте CHAT_API_URL и Cloudflare Access`;
  }
  return null;
}
