import { getSession } from './_lib/session.js';

// Разрешаем только нужные эндпоинты GitHub API.
const ALLOWED = /^\/(user(\/repos)?(\?.*)?|repos\/[\w.-]+\/[\w.-]+(\/.*)?|gists(\/[0-9a-f]+)?(\?.*)?)$/;

export const config = { api: { bodyParser: { sizeLimit: '4.5mb' } } };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  // Защита от CSRF: кастомный заголовок нельзя отправить с чужого сайта без CORS.
  if (req.headers['x-requested-with'] !== 'botcrm') return res.status(403).json({ message: 'Forbidden' });
  if (!['GET', 'POST', 'PATCH'].includes(req.method)) return res.status(405).json({ message: 'Method not allowed' });

  const session = getSession(req);
  if (!session) return res.status(401).json({ message: 'Not authenticated' });

  const path = String(req.query.path || '');
  if (!ALLOWED.test(path) || path.includes('..')) return res.status(400).json({ message: 'Path not allowed' });

  const headers = {
    Authorization: `Bearer ${session.t}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'bot-content-crm',
  };
  let body;
  if (req.method !== 'GET') {
    headers['Content-Type'] = 'application/json';
    body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
  }
  const r = await fetch(`https://api.github.com${path}`, { method: req.method, headers, body });
  const text = await r.text();
  res.status(r.status);
  res.setHeader('Content-Type', r.headers.get('content-type') || 'application/json');
  res.send(text);
}
