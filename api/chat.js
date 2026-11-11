import crypto from 'node:crypto';
import { getSession } from './_lib/session.js';

/**
 * Прокси к Chat API (dating-api) для разделов «Рассылки» и «Пользователи».
 *
 * Токен Chat API живёт только здесь, в переменных Vercel. Доступ — только у GitHub-логинов из CRM_ADMINS:
 * войти в CRM может любой пользователь GitHub, а рассылка уходит всем людям бота.
 *
 * Переменные: CHAT_API_URL (например https://api.chatwithyou.site), CHAT_API_CRM_TOKEN,
 * CRM_ADMINS (логины GitHub через запятую), при Cloudflare Access — CF_ACCESS_CLIENT_ID и CF_ACCESS_CLIENT_SECRET.
 */

// Только рассылки и чтение пользователей.
const ALLOWED = /^\/(broadcasts(\/audience|\/\d+(\/image)?)?|users(\/stats|\/(vk|tg|web)\/\d+)?)(\?[\w=&%.@-]*)?$/;
const READ_ONLY = /^\/users/;
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
  if (!isAdmin) return res.status(403).json({ message: `У ${login} нет доступа к рассылкам: добавьте логин в CRM_ADMINS` });
  if (!ALLOWED.test(path) || path.includes('..')) return res.status(400).json({ message: 'Path not allowed' });
  if (READ_ONLY.test(path) && req.method !== 'GET') return res.status(405).json({ message: 'Пользователи доступны только для чтения' });

  const headers = { Authorization: `Bearer ${process.env.CHAT_API_CRM_TOKEN}`, Accept: 'application/json' };
  if (process.env.CF_ACCESS_CLIENT_ID && process.env.CF_ACCESS_CLIENT_SECRET) {
    headers['CF-Access-Client-Id'] = process.env.CF_ACCESS_CLIENT_ID;
    headers['CF-Access-Client-Secret'] = process.env.CF_ACCESS_CLIENT_SECRET;
  }
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
    r = await fetch(process.env.CHAT_API_URL.replace(/\/+$/, '') + '/api/v1' + path, { method: req.method, headers, body });
  } catch (e) {
    return res.status(502).json({ message: 'Chat API недоступен: ' + e.message });
  }
  const text = await r.text();
  res.status(r.status);
  res.setHeader('Content-Type', r.headers.get('content-type') || 'application/json');
  res.send(text);
}
