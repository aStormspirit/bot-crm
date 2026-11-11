import crypto from 'node:crypto';

export const SESSION_COOKIE = 'botcrm_session';
export const STATE_COOKIE = 'botcrm_oauth_state';

function key() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error('SESSION_SECRET не задан (нужно минимум 16 символов)');
  return crypto.createHash('sha256').update(s).digest();
}

/** AES-256-GCM: токен в cookie зашифрован и не читается ни браузером, ни JS. */
export function seal(obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64url');
}

export function unseal(str) {
  if (!str) return null;
  try {
    const b = Buffer.from(str, 'base64url');
    const d = crypto.createDecipheriv('aes-256-gcm', key(), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'));
  } catch {
    return null;
  }
}

export function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function isHttps(req) {
  return (req.headers['x-forwarded-proto'] || '').split(',')[0] === 'https';
}

export function cookie(req, name, value, maxAgeSec) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSec}`];
  if (isHttps(req)) parts.push('Secure');
  return parts.join('; ');
}

export function baseUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '');
  const proto = isHttps(req) ? 'https' : 'http';
  return `${proto}://${req.headers['x-forwarded-host'] || req.headers.host}`;
}

export function getSession(req) {
  return unseal(parseCookies(req)[SESSION_COOKIE]);
}
