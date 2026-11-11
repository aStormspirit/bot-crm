import { SESSION_COOKIE, STATE_COOKIE, baseUrl, cookie, parseCookies, seal } from '../_lib/session.js';

const fail = (res, msg) => res.redirect(302, `/?auth_error=${encodeURIComponent(msg)}`);

export default async function handler(req, res) {
  const { code, state, error, error_description } = req.query;
  if (error) return fail(res, error_description || error);
  const expected = parseCookies(req)[STATE_COOKIE];
  if (!code || !state || !expected || state !== expected) {
    return fail(res, `Сессия входа не найдена. Откройте CRM по адресу ${baseUrl(req)} и нажмите «Подключить GitHub» ещё раз. Если ошибка повторяется — Callback URL в OAuth App должен быть ${baseUrl(req)}/api/auth/callback`);
  }

  try {
    const r = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        ...(process.env.APP_URL ? { redirect_uri: `${baseUrl(req)}/api/auth/callback` } : {}),
      }),
    });
    const data = await r.json();
    if (!data.access_token) return fail(res, data.error_description || data.error || 'GitHub не выдал токен');

    res.setHeader('Set-Cookie', [
      cookie(req, SESSION_COOKIE, seal({ t: data.access_token, s: data.scope }), 60 * 60 * 24 * 30),
      cookie(req, STATE_COOKIE, '', 0),
    ]);
    res.redirect(302, '/');
  } catch (e) {
    fail(res, e.message);
  }
}
