/** Запросы к Chat API через /api/chat (раздел «Рассылки»). Токен Chat API в браузер не попадает. */

function errorText(data, status) {
  const d = data?.detail ?? data?.message;
  if (Array.isArray(d)) return d.map(x => x.msg || JSON.stringify(x)).join('; ');
  return d || `Ошибка ${status}`;
}

export async function chat(path, { method = 'GET', json, form } = {}) {
  const headers = { 'X-Requested-With': 'botcrm' };
  let body;
  if (json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
  if (form) body = form;
  const r = await fetch(`/api/chat?path=${encodeURIComponent(path)}`, { method, headers, body, cache: 'no-store', credentials: 'same-origin' });
  if (r.status === 204) return null;
  let data = null;
  try { data = await r.json(); } catch {}
  if (!r.ok) throw new Error(errorText(data, r.status));
  return data;
}
