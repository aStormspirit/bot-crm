import { getSession } from '../_lib/session.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const clientId = process.env.GITHUB_CLIENT_ID || null;
  let session;
  try {
    session = getSession(req);
  } catch (e) {
    return res.status(500).json({ authenticated: false, clientId, configError: e.message });
  }
  if (!session) return res.status(200).json({ authenticated: false, clientId });
  const r = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${session.t}`, Accept: 'application/vnd.github+json', 'User-Agent': 'bot-content-crm' },
  });
  if (!r.ok) return res.status(200).json({ authenticated: false, clientId });
  const u = await r.json();
  res.status(200).json({ authenticated: true, clientId, user: { login: u.login, name: u.name, avatar_url: u.avatar_url },
    // гист нужен для синхронизации проектов между устройствами
    canSync: String(r.headers.get('x-oauth-scopes') || session.s || '').split(/[ ,]+/).includes('gist') });
}
