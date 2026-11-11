import crypto from 'node:crypto';
import { STATE_COOKIE, baseUrl, cookie } from '../_lib/session.js';

export default function handler(req, res) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) return res.status(500).send('GITHUB_CLIENT_ID не задан в переменных окружения Vercel');
  const state = crypto.randomBytes(16).toString('hex');
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseUrl(req)}/api/auth/callback`,
    scope: 'repo read:user read:org',
    state,
    allow_signup: 'true',
  });
  res.setHeader('Set-Cookie', cookie(req, STATE_COOKIE, state, 600));
  res.redirect(302, `https://github.com/login/oauth/authorize?${params}`);
}
