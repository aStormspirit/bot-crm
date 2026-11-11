import { b64ToText } from './lib.js';

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

export async function gh(path, { method = 'GET', body } = {}) {
  const r = await fetch(`/api/github?path=${encodeURIComponent(path)}`, {
    method,
    headers: { 'X-Requested-With': 'botcrm', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
    credentials: 'same-origin',
  });
  if (!r.ok) {
    let m = '';
    try { m = (await r.json()).message; } catch {}
    if (r.status === 401) m = 'Сессия истекла — войдите снова';
    if (r.status === 413) m = 'Файл слишком большой для загрузки';
    if (r.status === 404 && method !== 'GET') m = `${m || 'Not Found'} — нет прав на запись в этот репозиторий`;
    throw new ApiError(`GitHub ${r.status}: ${m || r.statusText}`, r.status);
  }
  return r.status === 204 ? null : r.json();
}

const encRef = b => b.split('/').map(encodeURIComponent).join('/');

export async function listRepos() {
  const out = [];
  for (let page = 1; page <= 10; page++) {
    const r = await gh(`/user/repos?per_page=100&sort=updated&page=${page}&affiliation=owner,collaborator,organization_member`);
    out.push(...r);
    if (r.length < 100) break;
  }
  return out;
}

export async function listBranches(full) {
  const out = [];
  for (let page = 1; page <= 5; page++) {
    const r = await gh(`/repos/${full}/branches?per_page=100&page=${page}`);
    out.push(...r.map(b => b.name));
    if (r.length < 100) break;
  }
  return out;
}

export async function headOf(full, branch) {
  const ref = await gh(`/repos/${full}/git/ref/heads/${encRef(branch)}`);
  const commit = await gh(`/repos/${full}/git/commits/${ref.object.sha}`);
  return { commitSha: ref.object.sha, treeSha: commit.tree.sha };
}

export async function loadTree(full, branch) {
  const h = await headOf(full, branch);
  const t = await gh(`/repos/${full}/git/trees/${h.treeSha}?recursive=1`);
  return {
    headSha: h.commitSha,
    tree: new Map(t.tree.filter(x => x.type === 'blob').map(x => [x.path, x])),
    truncated: t.truncated,
  };
}

const blobCache = new Map();
export async function blobB64(full, sha) {
  const key = full + ':' + sha;
  if (!blobCache.has(key)) {
    blobCache.set(key, gh(`/repos/${full}/git/blobs/${sha}`).then(b => b.content.replace(/\s/g, '')).catch(e => { blobCache.delete(key); throw e; }));
  }
  return blobCache.get(key);
}
export const blobText = async (full, sha) => b64ToText(await blobB64(full, sha));

/**
 * Один атомарный коммит со всеми изменениями (Git Data API).
 * onConflict(paths) -> boolean: продолжить ли, если эти файлы изменились в ветке с момента загрузки.
 */
export async function commitChanges({ full, branch, baseHead, tree, dirty, message, newBranch, onConflict }) {
  const rp = `/repos/${full}`;
  const head = await headOf(full, branch);
  if (head.commitSha !== baseHead) {
    const cmp = await gh(`${rp}/compare/${baseHead}...${head.commitSha}`);
    const touched = new Set((cmp.files || []).map(f => f.filename));
    const conflicts = [...dirty.keys()].filter(p => touched.has(p));
    if (conflicts.length && !onConflict(conflicts)) {
      throw new Error('Сохранение отменено. Нажмите ⟳, чтобы загрузить свежую версию.');
    }
  }
  const entries = [];
  for (const [path, ch] of dirty) {
    if (ch.type === 'delete') { entries.push({ path, mode: '100644', type: 'blob', sha: null }); continue; }
    const blob = await gh(`${rp}/git/blobs`, {
      method: 'POST',
      body: ch.type === 'text' ? { content: ch.content, encoding: 'utf-8' } : { content: ch.base64, encoding: 'base64' },
    });
    entries.push({ path, mode: tree.get(path)?.mode || '100644', type: 'blob', sha: blob.sha });
  }
  const newTree = await gh(`${rp}/git/trees`, { method: 'POST', body: { base_tree: head.treeSha, tree: entries } });
  const commit = await gh(`${rp}/git/commits`, { method: 'POST', body: { message, tree: newTree.sha, parents: [head.commitSha] } });
  if (newBranch) {
    await gh(`${rp}/git/refs`, { method: 'POST', body: { ref: `refs/heads/${newBranch}`, sha: commit.sha } });
    const pr = await gh(`${rp}/pulls`, {
      method: 'POST',
      body: {
        title: message, head: newBranch, base: branch,
        body: 'Изменения из Bot Content CRM:\n\n' + [...dirty.keys()].map(p => `- \`${p}\``).join('\n'),
      },
    });
    return { commitSha: commit.sha, prUrl: pr.html_url };
  }
  await gh(`${rp}/git/refs/heads/${encRef(branch)}`, { method: 'PATCH', body: { sha: commit.sha } });
  return { commitSha: commit.sha };
}
