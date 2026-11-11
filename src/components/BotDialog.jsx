import { useEffect, useMemo, useRef, useState } from 'react';
import { gh, listBranches, loadTree } from '../github.js';
import { DEFAULT_CFG, IMG_EXT, dirOf, ext, list } from '../lib.js';
import { PLATFORMS } from '../store.js';
import { Modal } from '../ui.jsx';

const TEXT_HINT = ['json', 'yaml', 'yml', 'ftl', 'po', 'properties', 'toml'];
const normRepo = s => s.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/+$/, '').split('/').slice(0, 2).join('/');

/** Папки, где лежит больше всего файлов нужного типа — подсказки для пользователя. */
function suggestDirs(paths, exts, folder) {
  const ex = list(DEFAULT_CFG.exclude);
  const count = new Map();
  for (const p of paths) {
    if (!exts.includes(ext(p)) || p.split('/').some(s => ex.includes(s))) continue;
    if (folder && !p.startsWith(folder + '/')) continue;
    const d = dirOf(p);
    if (d) count.set(d, (count.get(d) || 0) + 1);
  }
  return [...count].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([d, n]) => ({ d, n }));
}

export default function BotDialog({ bot, projects, projectId, repos, initialRepo, onClose, onSave, onDelete }) {
  const [v, setV] = useState(() => ({
    name: bot?.name || '',
    platform: bot?.platform || 'telegram',
    projectId: projectId || projects[0]?.id,
    repo: bot?.repo || initialRepo || '',
    branch: bot?.branch || '',
    folder: bot?.folder || '',
    textDirs: bot?.textDirs || '',
    imageDirs: bot?.imageDirs || '',
  }));
  const set = (k, val) => setV(x => ({ ...x, [k]: val }));
  const [meta, setMeta] = useState({ status: 'idle' }); // idle | loading | ok | error
  const timer = useRef();

  // Загружаем ветки и структуру репозитория, чтобы подсказать папки
  useEffect(() => {
    const full = normRepo(v.repo);
    clearTimeout(timer.current);
    if (!/^[\w.-]+\/[\w.-]+$/.test(full)) { setMeta({ status: 'idle' }); return; }
    let alive = true;
    timer.current = setTimeout(async () => {
      setMeta(m => ({ ...m, status: 'loading' }));
      try {
        const r = await gh(`/repos/${full}`);
        const branches = await listBranches(full);
        const br = v.branch && branches.includes(v.branch) ? v.branch : r.default_branch;
        const t = await loadTree(full, br);
        if (!alive) return;
        setMeta({ status: 'ok', repo: r, branches, paths: [...t.tree.keys()], branch: br });
        setV(x => (x.name ? x : { ...x, name: r.name || full.split('/')[1] }));
      } catch (e) {
        if (alive) setMeta({ status: 'error', error: e.status === 404 ? 'Репозиторий не найден или нет доступа' : e.message });
      }
    }, 400);
    return () => { alive = false; clearTimeout(timer.current); };
  }, [v.repo, v.branch]);

  const folder = v.folder.replace(/^\/+|\/+$/g, '');
  const textSug = useMemo(() => (meta.paths ? suggestDirs(meta.paths, TEXT_HINT, folder) : []), [meta.paths, folder]);
  const imgSug = useMemo(() => (meta.paths ? suggestDirs(meta.paths, IMG_EXT, folder) : []), [meta.paths, folder]);
  const folders = useMemo(() => (meta.paths ? [...new Set(meta.paths.filter(p => p.includes('/')).map(p => p.split('/')[0]))].sort() : []), [meta.paths]);

  const toggle = (k, d) => {
    const cur = list(v[k]);
    set(k, (cur.includes(d) ? cur.filter(x => x !== d) : [...cur, d]).join(', '));
  };

  const canSave = v.name.trim() && /^[\w.-]+\/[\w.-]+$/.test(normRepo(v.repo)) && v.projectId && meta.status !== 'error';
  const save = () => canSave && onSave({
    name: v.name.trim(), platform: v.platform, repo: meta.repo?.full_name || normRepo(v.repo),
    branch: v.branch, folder, textDirs: v.textDirs.trim(), imageDirs: v.imageDirs.trim(),
  }, v.projectId);

  const repoNames = (repos || []).map(r => r.full_name);

  return (
    <Modal onClose={onClose}>
      <h2>{bot ? 'Настройки бота' : 'Добавить бота'}</h2>
      <div className="stack">
        <div className="row">
          <label className="grow">Название бота<br />
            <input autoFocus className="w100" placeholder="Например: Бот поддержки" value={v.name} onChange={e => set('name', e.target.value)} />
          </label>
          {projects.length > 1 && (
            <label>Проект<br />
              <select value={v.projectId} onChange={e => set('projectId', e.target.value)}>
                {projects.map(p => <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>)}
              </select>
            </label>
          )}
        </div>

        <div>
          <div style={{ marginBottom: 6 }}>Платформа</div>
          <div className="chips">
            {Object.entries(PLATFORMS).map(([k, p]) => (
              <button key={k} className={'chip' + (v.platform === k ? ' on' : '')} onClick={() => set('platform', k)}>{p.icon} {p.label}</button>
            ))}
          </div>
        </div>

        <label>Репозиторий GitHub, где живёт бот<br />
          <input className="w100 mono" list="botcrm-repos" placeholder="owner/repo или ссылка" value={v.repo} onChange={e => set('repo', e.target.value)} />
          <datalist id="botcrm-repos">{repoNames.map(n => <option key={n} value={n} />)}</datalist>
        </label>
        {meta.status === 'loading' && <div className="muted small">Читаю репозиторий…</div>}
        {meta.status === 'error' && <div className="hint err">{meta.error}</div>}

        {meta.status === 'ok' && (
          <>
            <div className="row">
              <label>Ветка<br />
                <select value={v.branch} onChange={e => set('branch', e.target.value)}>
                  <option value="">по умолчанию ({meta.repo.default_branch})</option>
                  {meta.branches.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </label>
              <label className="grow">Папка бота <span className="muted">(если в репозитории несколько ботов)</span><br />
                <input className="w100 mono" list="botcrm-folders" placeholder="весь репозиторий" value={v.folder} onChange={e => set('folder', e.target.value)} />
                <datalist id="botcrm-folders">{folders.map(f => <option key={f} value={f} />)}</datalist>
              </label>
            </div>

            <label>Папки с текстами <span className="muted">(пусто = {folder || 'весь репозиторий'})</span><br />
              <input className="w100 mono" placeholder="locales" value={v.textDirs} onChange={e => set('textDirs', e.target.value)} />
            </label>
            {textSug.length > 0 && (
              <div className="chips">
                <span className="muted small">Нашёл тексты:</span>
                {textSug.map(({ d, n }) => <button key={d} className={'chip sm' + (list(v.textDirs).includes(d) ? ' on' : '')} onClick={() => toggle('textDirs', d)}>{d} <span className="muted">{n}</span></button>)}
              </div>
            )}

            <label>Папки с картинками <span className="muted">(пусто = {folder || 'весь репозиторий'})</span><br />
              <input className="w100 mono" placeholder="assets/images" value={v.imageDirs} onChange={e => set('imageDirs', e.target.value)} />
            </label>
            {imgSug.length > 0 && (
              <div className="chips">
                <span className="muted small">Нашёл картинки:</span>
                {imgSug.map(({ d, n }) => <button key={d} className={'chip sm' + (list(v.imageDirs).includes(d) ? ' on' : '')} onClick={() => toggle('imageDirs', d)}>{d} <span className="muted">{n}</span></button>)}
              </div>
            )}
          </>
        )}

        <div className="row">
          {bot && <button className="danger ghost" onClick={() => confirm(`Убрать бота «${bot.name}» из проекта? Файлы в GitHub не будут затронуты.`) && onDelete()}>Удалить бота</button>}
          <span className="grow" />
          <button onClick={onClose}>Отмена</button>
          <button className="primary" disabled={!canSave} onClick={save}>{bot ? 'Сохранить' : 'Добавить бота'}</button>
        </div>
      </div>
    </Modal>
  );
}
