import yaml from 'js-yaml';

export const IMG_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'];
export const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon', avif: 'image/avif' };
export const MAX_UPLOAD = 3 * 1024 * 1024; // лимит тела запроса Vercel ~4.5 МБ, base64 +33%
export const DEFAULT_CFG = {
  textExt: 'json,yaml,yml,txt,md,ftl,po,properties,toml,csv,xml',
  textDirs: '',
  imageDirs: '',
  exclude: 'node_modules,.git,.github,dist,build,vendor,.venv,venv,__pycache__,.next,coverage,package.json,package-lock.json,tsconfig.json,composer.json,composer.lock,yarn.lock,pnpm-lock.yaml,renovate.json,.eslintrc.json,.prettierrc,manifest.json,vercel.json',
};

export const ext = p => { const b = p.split('/').pop(); return b.includes('.') ? b.split('.').pop().toLowerCase() : ''; };
export const dirOf = p => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
export const baseName = p => p.split('/').pop();
export const list = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);

export const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

export function b64ToText(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}
export const fileToB64 = file => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1]);
  r.onerror = rej;
  r.readAsDataURL(file);
});

export function allPaths(tree, dirty) {
  const set = new Set(tree.keys());
  for (const [p, d] of dirty) d.type === 'delete' ? set.delete(p) : set.add(p);
  return [...set].sort((a, b) => a.localeCompare(b));
}
export function matches(path, kind, cfg) {
  const ex = list(cfg.exclude);
  if (path.split('/').some(s => ex.includes(s))) return false;
  const exts = kind === 'texts' ? list(cfg.textExt).map(x => x.toLowerCase().replace(/^\./, '')) : IMG_EXT;
  if (!exts.includes(ext(path))) return false;
  const dirs = list(kind === 'texts' ? cfg.textDirs : cfg.imageDirs).map(d => d.replace(/^\/+|\/+$/g, ''));
  return !dirs.length || dirs.some(d => path === d || path.startsWith(d + '/'));
}

/* ---- документ: JSON / YAML / raw ---- */
export const isObj = v => v !== null && typeof v === 'object';
export function flatten(v, pre = [], out = []) {
  if (isObj(v) && Object.keys(v).length) {
    for (const k of Object.keys(v)) flatten(v[k], [...pre, Array.isArray(v) ? Number(k) : k], out);
  } else if (pre.length && !isObj(v)) out.push(pre);
  return out;
}
export function getPath(o, p) {
  let c = o;
  for (const k of p) { if (!isObj(c) || !(k in c)) return { found: false }; c = c[k]; }
  return isObj(c) ? { found: false } : { found: true, value: c };
}
export function setPath(o, p, val) {
  let c = o;
  for (let i = 0; i < p.length - 1; i++) {
    if (!isObj(c[p[i]])) c[p[i]] = typeof p[i + 1] === 'number' ? [] : {};
    c = c[p[i]];
  }
  const last = p[p.length - 1], old = c[last];
  if (typeof old === 'number' && val.trim() !== '' && !isNaN(Number(val))) val = Number(val);
  else if (typeof old === 'boolean' && (val === 'true' || val === 'false')) val = val === 'true';
  else if (old === null && val === '') val = null;
  c[last] = val;
}
export function delPath(o, p) {
  let c = o;
  for (let i = 0; i < p.length - 1; i++) { if (!isObj(c[p[i]])) return; c = c[p[i]]; }
  if (Array.isArray(c)) c.splice(p[p.length - 1], 1); else delete c[p[p.length - 1]];
}
export function parseData(kind, text) {
  const data = kind === 'json' ? JSON.parse(text) : yaml.load(text);
  if (!isObj(data)) throw new Error('корневой элемент должен быть объектом');
  return data;
}
export function makeDoc(path, text, base) {
  const e = ext(path);
  let doc = { path, kind: 'raw', text, base };
  try {
    if (e === 'json') {
      const data = text.trim() ? parseData('json', text) : {};
      const m = text.match(/\n([ \t]+)\S/);
      doc = { ...doc, kind: 'json', data, indent: m ? (m[1][0] === '\t' ? '\t' : m[1].length) : 2, nl: text.endsWith('\n') || !text };
    } else if (e === 'yaml' || e === 'yml') {
      const data = text.trim() ? parseData('yaml', text) : {};
      doc = { ...doc, kind: 'yaml', data, hasComments: /^\s*#/m.test(text) };
    }
  } catch (err) {
    doc = { path, kind: 'raw', text, base, parseError: err.message };
  }
  return doc;
}
export function serialize(doc) {
  if (doc.kind === 'json') return JSON.stringify(doc.data, null, doc.indent) + (doc.nl ? '\n' : '');
  if (doc.kind === 'yaml') return yaml.dump(doc.data, { lineWidth: -1, noRefs: true });
  return doc.text;
}
const PH_RE = /\{\{?\s*[\w.]*\s*\}?\}|\$\{[^}]*\}|%[\d$]*[sdif]|<\/?[a-z][^>]*>/gi;
export const placeholders = s => (String(s ?? '').match(PH_RE) || []).sort().join('|');
