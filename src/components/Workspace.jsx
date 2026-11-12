import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { blobText, listBranches, loadTree } from '../github.js';
import { DEFAULT_CFG, LS, allPaths, botCfg, dirOf, ext, makeDoc, matches, serialize, baseName, isObj } from '../lib.js';
import { useUi } from '../ui.jsx';
import TextEditor from './TextEditor.jsx';
import Images from './Images.jsx';
import ScreensView from './ScreensView.jsx';
import { findContentPath } from '../content.js';
import { findFlowPath } from '../flowPath.js';
const FlowMap = lazy(() => import('./FlowMap.jsx'));
const Broadcasts = lazy(() => import('./Broadcasts.jsx'));
const Analytics = lazy(() => import('./Analytics.jsx'));
const Communities = lazy(() => import('./Communities.jsx'));
import CommitDialog from './CommitDialog.jsx';
import SettingsDialog from './SettingsDialog.jsx';
import { PLATFORMS } from '../store.js';

export default function Workspace({ repo, bot, project, onDirty, onEditBot, onSaveBotCfg, onAddAsBot }) {
  const { toast, busy } = useUi();
  const full = repo.full_name;
  const canPush = !repo.permissions || repo.permissions.push;

  const [branches, setBranches] = useState([]);
  const [branch, setBranch] = useState(null);
  const [tree, setTree] = useState(null);
  const [headSha, setHeadSha] = useState('');
  const [dirty, setDirty] = useState(() => new Map());
  const docs = useRef(new Map());
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const [docVer, setDocVer] = useState(0);
  const branchKey = 'botcrm:branch:' + (bot ? 'bot:' + bot.id : full);
  const [cfg, setCfg] = useState(() => (bot ? botCfg(bot) : { ...DEFAULT_CFG, ...LS.get('botcrm:cfg:' + full, {}) }));
  const botCfgKey = bot ? JSON.stringify(botCfg(bot)) : '';
  useEffect(() => { if (bot) setCfg(botCfg(bot)); }, [botCfgKey]);
  const [tab, setTab] = useState(bot ? 'screens' : 'texts');
  const [file, setFile] = useState(null);
  const [cmp, setCmp] = useState('');
  const [filter, setFilter] = useState('');
  const [imgDir, setImgDir] = useState('');
  const [modal, setModal] = useState(null);
  const [flowData, setFlowData] = useState(null);
  const [flowErrors, setFlowErrors] = useState([]);
  const [focus, setFocus] = useState(null);
  const [promoFlow, setPromoFlow] = useState(null);
  const [, bump] = useState(0);

  const resetEdits = () => { setDirty(new Map()); docs.current.clear(); setDocVer(v => v + 1); };

  const reload = useCallback(async br => {
    const t = await loadTree(full, br);
    setTree(t.tree);
    setHeadSha(t.headSha);
    if (t.truncated) toast('Репозиторий очень большой — показана часть файлов. Укажите папки в настройках.', { err: true, ms: 9000 });
    return t.tree;
  }, [full, toast]);

  useEffect(() => {
    busy(async () => {
      const bs = await listBranches(full);
      let b = LS.get(branchKey, '') || bot?.branch || repo.default_branch;
      if (!bs.includes(b)) b = repo.default_branch;
      setBranches(bs);
      setBranch(b);
      await reload(b);
    });
  }, [full]);

  useEffect(() => { onDirty?.(dirty.size); }, [dirty.size]);

  useEffect(() => {
    const h = e => { if (dirtyRef.current.size) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, []);

  const confirmDiscard = msg => !dirty.size || confirm(msg);

  const changeBranch = b => {
    if (!confirmDiscard('Несохранённые изменения будут потеряны. Переключить ветку?')) return;
    setBranch(b); LS.set(branchKey, b);
    resetEdits(); setFile(null); setCmp('');
    busy(() => reload(b));
  };
  const refresh = () => {
    if (!confirmDiscard('Несохранённые изменения будут потеряны. Обновить?')) return;
    resetEdits();
    busy(async () => { const t = await reload(branch); if (file && !t.has(file)) setFile(null); toast('Обновлено'); });
  };

  /* ---- операции над документами ---- */
  const baseText = useCallback(async path => {
    const t = tree.get(path);
    return t ? blobText(full, t.sha) : null;
  }, [tree, full]);

  const getDoc = useCallback(async path => {
    if (docs.current.has(path)) return docs.current.get(path);
    const d = dirtyRef.current.get(path);
    const base = await baseText(path);
    const text = d?.type === 'text' ? d.content : base ?? '';
    const doc = makeDoc(path, text, base);
    docs.current.set(path, doc);
    return doc;
  }, [baseText]);

  const commitDoc = useCallback((doc, text = serialize(doc)) => {
    if (doc.kind === 'raw') doc.text = text;
    setDirty(prev => {
      const n = new Map(prev);
      if (doc.base !== null && text === doc.base) n.delete(doc.path);
      else n.set(doc.path, { type: 'text', content: text });
      return n;
    });
  }, []);

  const setChange = useCallback((path, change) => {
    setDirty(prev => {
      const n = new Map(prev);
      if (change === null) n.delete(path);
      else if (change.type === 'delete' && !tree.has(path)) n.delete(path);
      else n.set(path, change);
      return n;
    });
    docs.current.delete(path);
  }, [tree]);

  const paths = useMemo(() => (tree ? allPaths(tree, dirty) : []), [tree, dirty]);
  const filesOf = useCallback(kind => paths.filter(p => matches(p, kind, cfg)), [paths, cfg]);

  const openFile = p => {
    setCmp(c => (c && c !== p && dirOf(c) === dirOf(p) && ext(c) === ext(p) ? c : ''));
    setFile(p);
  };

  const newTextFile = async () => {
    const dirs = cfg.textDirs.split(',').map(s => s.trim()).filter(Boolean);
    const def = file ? dirOf(file) + '/' : dirs[0] ? dirs[0].replace(/\/$/, '') + '/' : '';
    let p = prompt('Путь нового файла (например locales/de.json):', def);
    if (!p) return;
    p = p.trim().replace(/^\/+/, '');
    if (paths.includes(p)) return toast('Такой файл уже существует', { err: true });
    let content = '';
    if (ext(p) === 'json') {
      content = '{}\n';
      const cur = file && docs.current.get(file);
      if (cur?.kind === 'json' && confirm(`Скопировать ключи из ${baseName(cur.path)} (с пустыми значениями)?`)) {
        const blank = v => (isObj(v) ? (Array.isArray(v) ? v.map(blank) : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, blank(x)]))) : '');
        content = JSON.stringify(blank(cur.data), null, cur.indent) + '\n';
      }
    }
    setChange(p, { type: 'text', content });
    if (!matches(p, 'texts', cfg)) toast('Файл создан, но не попадает под фильтры из настроек', { err: true });
    const prev = file;
    setFile(p);
    setCmp(prev && dirOf(prev) === dirOf(p) && ext(prev) === ext(p) ? prev : '');
  };

  const afterCommit = async ({ prUrl, commitSha, newBranch, count }) => {
    resetEdits();
    let b = branch;
    if (newBranch) { b = newBranch; setBranches(x => [...x, newBranch]); setBranch(newBranch); LS.set(branchKey, newBranch); }
    const t = await reload(b);
    if (file && !t.has(file)) setFile(null);
    setModal(null);
    toast(prUrl
      ? <>Создан Pull Request: <a href={prUrl} target="_blank" rel="noopener noreferrer">открыть ↗</a></>
      : <>Сохранено файлов: {count}. <a href={`${repo.html_url}/commit/${commitSha}`} target="_blank" rel="noopener noreferrer">коммит ↗</a></>, { ms: 12000 });
  };

  const ws = { full, repo, tree, dirty, docs, docVer, getDoc, commitDoc, setChange, cfg, filesOf, paths };
  const contentPath = useMemo(() => (tree ? findContentPath([...tree.keys()], bot?.folder) : null), [tree, bot?.folder]);
  const contentScreens = contentPath ? docs.current.get(contentPath)?.data?.screens || [] : [];
  const flowPath = useMemo(() => (tree ? findFlowPath([...tree.keys()], bot?.folder) : null), [tree, bot?.folder]);
  const showScreensTab = !!contentPath || (!!bot && !flowPath);
  const blocked = flowErrors.length > 0;

  // У бота с картой тексты и картинки правятся на карте: отдельные вкладки не нужны.
  const fileTabs = !!tree && !flowPath;
  const showBroadcasts = !!bot || !!flowPath;
  const showCommunities = showBroadcasts && bot?.platform === 'vk';
  const broadcastPlatform = flowData?.bot || ({ telegram: 'tg', vk: 'vk', web: 'web' })[bot?.platform] || 'tg';

  useEffect(() => {
    if (flowPath && ((tab === 'screens' && !contentPath) || tab === 'texts' || tab === 'images')) setTab('map');
    if (!flowPath && tab === 'map') setTab(showScreensTab ? 'screens' : 'texts');
  }, [flowPath, contentPath]);
  useEffect(() => { setFlowData(null); setFlowErrors([]); setPromoFlow(null); }, [flowPath]);

  // Вкладке «Рассылки» нужны экраны промо, даже если карту не открывали (с учётом несохранённых правок).
  const flowDirty = flowPath ? dirty.get(flowPath) : null;
  useEffect(() => {
    if (tab !== 'broadcasts' || !flowPath || !tree) return;
    let alive = true;
    (async () => {
      const d = await getDoc(flowPath);
      const text = flowDirty?.type === 'text' ? flowDirty.content : d.text;
      const { parseFlow } = await import('../flow.js'); // yaml не в основном бандле
      const { data } = parseFlow(text ?? '');
      if (alive) setPromoFlow({ data, flowPath });
    })().catch(() => alive && setPromoFlow(null));
    return () => { alive = false; };
  }, [tab, flowPath, tree, flowDirty, docVer, getDoc]);

  const textFiles = tree ? filesOf('texts').filter(p => p.toLowerCase().includes(filter.toLowerCase())) : [];
  const imageFiles = tree ? filesOf('images') : [];

  return (
    <div className="ws">
      <div className="ws-head">
        <div className="ws-title">
          {bot ? (
            <>
              {project && <span className="muted crumb">{project.emoji} {project.name} /</span>}
              <span>{PLATFORMS[bot.platform]?.icon || '🤖'} {bot.name}</span>
              <a className="muted repo-link mono" href={`${repo.html_url}${bot.folder ? `/tree/${branch || repo.default_branch}/${bot.folder}` : ''}`} target="_blank" rel="noopener noreferrer" title="Открыть на GitHub">{full}{bot.folder ? '/' + bot.folder : ''} ↗</a>
            </>
          ) : (
            <a href={repo.html_url} target="_blank" rel="noopener noreferrer" title="Открыть на GitHub">{full}</a>
          )}
          {repo.private && <span className="badge">private</span>}
          {!canPush && <span className="badge warn">только чтение</span>}
        </div>
        {branch && (
          <label className="branch" title="Ветка">
            <span className="muted">⎇</span>
            <select value={branch} onChange={e => changeBranch(e.target.value)}>
              {branches.map(b => <option key={b}>{b}</option>)}
            </select>
          </label>
        )}
        <button className="ghost" title="Обновить из GitHub" onClick={refresh}>⟳</button>
        <span className="grow" />
        {bot ? <button onClick={onEditBot}>🤖 Бот</button> : <button onClick={onAddAsBot} title="Добавить этот репозиторий как бота в проект">＋ В проект</button>}
        <button onClick={() => setModal('settings')}>⚙ Файлы</button>
        <button className="primary" disabled={!dirty.size || blocked} title={blocked ? `В карте бота ошибок: ${flowErrors.length} — исправьте их во вкладке «Карта»` : ''} onClick={() => setModal('commit')}>
          Сохранить {dirty.size > 0 && `(${dirty.size})`}
        </button>
      </div>

      <div className="body">
        <aside className="side">
          <div className="tabs">
            {flowPath && <button className={tab === 'map' ? 'on' : ''} onClick={() => setTab('map')}>🗺 Карта</button>}
            {showScreensTab && <button className={tab === 'screens' ? 'on' : ''} onClick={() => setTab('screens')}>📱 Экраны</button>}
            {fileTabs && <button className={tab === 'texts' ? 'on' : ''} onClick={() => setTab('texts')}>📝 Тексты</button>}
            {fileTabs && <button className={tab === 'images' ? 'on' : ''} onClick={() => setTab('images')}>🖼 Картинки</button>}
            {showBroadcasts && <button className={tab === 'broadcasts' ? 'on' : ''} onClick={() => setTab('broadcasts')}>📣 Рассылки</button>}
            {showBroadcasts && <button className={tab === 'analytics' ? 'on' : ''} onClick={() => setTab('analytics')}>📊 Аналитика</button>}
            {showCommunities && <button className={tab === 'communities' ? 'on' : ''} onClick={() => setTab('communities')}>🔌 Сообщества</button>}
          </div>
          {(tab === 'texts' || tab === 'images') && (
            <div style={{ padding: 8 }}>
              <input style={{ width: '100%' }} placeholder="Фильтр файлов…" value={filter} onChange={e => setFilter(e.target.value)} />
            </div>
          )}
          <div className="files">
            {tab === 'communities' ? (
              <div className="muted small" style={{ padding: 12, lineHeight: 1.5 }}>
                Сообщества ВК, к которым подключён бот. Ключи хранит Chat API в зашифрованном виде; в CRM они видны только частично.
                Бот подхватывает новое сообщество за минуту, без перезапуска.
              </div>
            ) : tab === 'analytics' ? (
              <div className="muted small" style={{ padding: 12, lineHeight: 1.5 }}>
                Аналитика по базе Chat API: сколько людей в боте, новые, активные, удержание, воронка и диалоги.
                Дни считаются по Москве. В разделе «Люди» — поиск и карточка человека.
              </div>
            ) : tab === 'broadcasts' ? (
              <div className="muted small" style={{ padding: 12, lineHeight: 1.5 }}>
                Рассылки отправляет Chat API всем людям бота: разово по времени или каждому через паузу после события.
                Текст и фото рассылки хранятся в Chat API, а не в репозитории.
              </div>
            ) : tab === 'map' ? (
              flowData ? Object.entries(flowData.screens || {}).map(([sid, sc]) => (
                <div key={sid} className={'file' + (focus?.id === sid ? ' on' : '') + (flowErrors.some(e => e.screen === sid) ? ' has-err' : '')}
                  onClick={() => setFocus({ id: sid, t: Date.now() })}>
                  {flowData.start === sid ? '▶ ' : sc?.on ? '⚡ ' : ''}{sc?.title || sid}
                </div>
              )) : <div className="muted small" style={{ padding: 12 }}>Загрузка…</div>
            ) : tab === 'screens' ? (
              contentScreens.length ? contentScreens.map(sc => (
                <div key={sc.id} className="file" onClick={() => document.getElementById('screen-' + sc.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                  {sc.title}
                </div>
              )) : <div className="muted small" style={{ padding: 12 }}>{contentPath ? 'Загрузка…' : 'Нет файла контента'}</div>
            ) : tab === 'texts' ? (
              textFiles.length ? textFiles.map((p, i) => {
                const d = dirOf(p), showDir = i === 0 || dirOf(textFiles[i - 1]) !== d;
                return (
                  <div key={p}>
                    {showDir && <div className="dir">{d || '/'}</div>}
                    <div className={'file' + (p === file ? ' on' : '')} onClick={() => openFile(p)}>
                      {dirty.has(p) && <span className="dot" />}{baseName(p)}
                    </div>
                  </div>
                );
              }) : tree && <div className="muted" style={{ padding: 12 }}>Файлы не найдены. Проверьте расширения и папки в ⚙ Настройках.</div>
            ) : (
              <ImageDirs files={imageFiles} filter={filter} imgDir={imgDir} setImgDir={setImgDir} />
            )}
          </div>
          {tab === 'texts' && fileTabs && <div style={{ padding: 8, borderTop: '1px solid var(--line)' }}><button style={{ width: '100%' }} onClick={newTextFile}>+ Новый файл</button></div>}
        </aside>

        <main className={'main' + (['map', 'broadcasts', 'analytics'].includes(tab) ? ' flush' : '')}>
          {tab === 'communities' && showCommunities ? (
            <Suspense fallback={<div className="muted" style={{ padding: 16 }}>Загрузка…</div>}>
              <Communities />
            </Suspense>
          ) : tab === 'analytics' ? (
            <Suspense fallback={<div className="muted" style={{ padding: 16 }}>Загрузка…</div>}>
              <Analytics platform={broadcastPlatform} />
            </Suspense>
          ) : tab === 'broadcasts' ? (
            <Suspense fallback={<div className="muted" style={{ padding: 16 }}>Загрузка…</div>}>
              <Broadcasts platform={broadcastPlatform} botName={bot?.name}
                promo={promoFlow ? { ...promoFlow, ws, onOpenScreen: sid => { setTab('map'); setFocus({ id: sid, t: Date.now() }); } } : null} />
            </Suspense>
          ) : !tree ? null : tab === 'map' && flowPath ? (
            <Suspense fallback={<div className="muted" style={{ padding: 16 }}>Загрузка карты…</div>}>
              <FlowMap key={flowPath + '|' + docVer} ws={ws} path={flowPath} focus={focus} onLoaded={setFlowData} onErrors={setFlowErrors} />
            </Suspense>
          ) : tab === 'screens' ? (
            contentPath ? <ScreensView key={contentPath} ws={ws} path={contentPath} bot={bot} onLoaded={() => bump(n => n + 1)} />
              : <NoContent bot={bot} />
          ) : tab === 'texts' ? (
            file ? <TextEditor key={file + '|' + docVer} ws={ws} file={file} cmp={cmp} setCmp={setCmp} onDeleted={() => setFile(null)} />
              : <div className="empty"><div className="big-ico">📝</div>Выберите файл с текстами слева.<br /><span className="small">JSON и YAML открываются как таблица «ключ → текст», остальные — как обычный текст.</span></div>
          ) : (
            <Images ws={ws} files={imageFiles.filter(p => (!imgDir || dirOf(p) === imgDir) && p.toLowerCase().includes(filter.toLowerCase()))} imgDir={imgDir} setImgDir={setImgDir} />
          )}
        </main>
      </div>

      {modal === 'settings' && <SettingsDialog cfg={cfg} title={bot ? `Файлы бота «${bot.name}»` : `Файлы репозитория ${full}`} onClose={() => setModal(null)}
        onSave={c => {
          setCfg(c); setModal(null);
          if (bot) onSaveBotCfg(c);
          else if (c === DEFAULT_CFG) LS.del('botcrm:cfg:' + full); else LS.set('botcrm:cfg:' + full, c);
        }} />}
      {modal === 'commit' && <CommitDialog ws={ws} branch={branch} headSha={headSha} canPush={canPush} onClose={() => setModal(null)} onDone={afterCommit}
        onUndo={p => { setChange(p, null); if (p === file && !tree.has(p)) setFile(null); setDocVer(v => v + 1); }} />}
    </div>
  );
}

function ImageDirs({ files, filter, imgDir, setImgDir }) {
  const dirs = new Map();
  files.filter(p => p.toLowerCase().includes(filter.toLowerCase())).forEach(p => dirs.set(dirOf(p), (dirs.get(dirOf(p)) || 0) + 1));
  return (
    <>
      <div className={'file' + (!imgDir ? ' on' : '')} onClick={() => setImgDir('')}>Все картинки <span className="muted">({files.length})</span></div>
      {[...dirs].map(([d, n]) => (
        <div key={d} className={'file' + (imgDir === d ? ' on' : '')} onClick={() => setImgDir(d)}>📁 {d || '/'} <span className="muted">({n})</span></div>
      ))}
    </>
  );
}

function NoContent({ bot }) {
  return (
    <div className="no-content">
      <div className="big-ico">📱</div>
      <h2>Экраны бота пока недоступны</h2>
      <p className="muted">
        Чтобы видеть карту бота (экраны, кнопки и переходы), сценарий должен лежать отдельно от кода — в файле
        {' '}<span className="mono">flow/flow.yaml</span>{bot?.folder ? <> внутри папки <span className="mono">{bot.folder}</span></> : ''}.
        Старый формат <span className="mono">content/content.json</span> (bot-crm/1) тоже поддерживается.
      </p>
      <p className="muted">
        Формат описан в README Bot CRM. Пока можно править файлы во вкладках «Тексты» и «Картинки».
      </p>
    </div>
  );
}
