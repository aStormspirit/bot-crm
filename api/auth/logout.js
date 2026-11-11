import { SESSION_COOKIE, cookie } from '../_lib/session.js';

export default function handler(req, res) {
  res.setHeader('Set-Cookie', cookie(req, SESSION_COOKIE, '', 0));
  res.redirect(302, '/');
}
