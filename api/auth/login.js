import crypto from 'node:crypto';
import { STATE_COOKIE, baseUrl, cookie } from '../_lib/session.js';

export default function handler(req, res) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) return res.status(500).send('GITHUB_CLIENT_ID не задан в переменных окружения Vercel');
  const state = crypto.randomBytes(16).toString('hex');
  const params = new URLSearchParams({ client_id: clientId, scope: 'repo read:user read:org gist', state, allow_signup: 'true' });
  // Без APP_URL не передаём redirect_uri: GitHub сам вернёт на Callback URL из настроек OAuth App.
  // Так вход не ломается, если адрес на Vercel отличается от вычисленного.
  if (process.env.APP_URL) params.set('redirect_uri', `${baseUrl(req)}/api/auth/callback`);
  res.setHeader('Set-Cookie', cookie(req, STATE_COOKIE, state, 600));
  res.redirect(302, `https://github.com/login/oauth/authorize?${params}`);
}
