import { useCallback, useEffect, useRef, useState } from 'react';
import Navbar from './components/Navbar.jsx';
import ProjectsSidebar from './components/ProjectsSidebar.jsx';
import Welcome from './components/Welcome.jsx';
import Workspace from './components/Workspace.jsx';
import ProjectDialog from './components/ProjectDialog.jsx';
import BotDialog from './components/BotDialog.jsx';
import { gh, listRepos } from './github.js';
import { findBot, loadProjects, saveProjects, uid } from './store.js';
import { useUi } from './ui.jsx';

function parseUrl() {
  const b = location.pathname.match(/^\/bot\/([\w-]+)\/?$/);
  if (b) return { type: 'bot', botId: b[1] };
  const m = location.pathname.match(/^\/([\w.-]+)\/([\w.-]+)\/?$/);
  return m ? { type: 'repo', full: `${m[1]}/${m[2]}` } : null;
}
const routeUrl = r => (!r ? '/' : r.type === 'bot' ? `/bot/${r.botId}` : `/${r.full}`);

export default function App() {
  const { busy, toast } = useUi();
  const [auth, setAuth] = useState(null);
  const [repos, setRepos] = useState(null);
  const [reposError, setReposError] = useState('');
  const [store, setStore] = useState({ data: null, mode: 'local', gistId: null });
  const [route, setRoute] = useState(null);       // {type:'bot', botId} | {type:'repo', full}
  const [repoMeta, setRepoMeta] = useState(null); // GitHub-репозиторий открытого бота/репо
  const [dialog, setDialog] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const dirtyCount = useRef(0);
  const storeRef = useRef(store);
  storeRef.current = store;
  const routeRef = useRef(route);
  routeRef.current = route;
  const saveChain = useRef(Promise.resolve());

  /* ---------- auth ---------- */
  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' })
      .then(r => r.json())
      .then(setAuth)
      .catch(e => setAuth({ authenticated: false, configError: 'API недоступно: ' + e.message }));
    const err = new URLSearchParams(location.search).get('auth_error');
    if (err) {
      toast('Не удалось подключить GitHub: ' + err, { err: true, ms: 10000 });
      history.replaceState(null, '', location.pathname);
    }
  }, []);
  const connected = !!auth?.authenticated;

  /* ---------- проекты (Gist) ---------- */
  const persist = useCallback(data => {
    saveChain.current = saveChain.current.then(async () => {
      try {
        const gistId = await saveProjects(storeRef.current, data);
        setStore(s => ({ ...s, gistId }));
        storeRef.current = { ...storeRef.current, gistId };
      } catch (e) {
        toast('Не удалось сохранить проекты в GitHub: ' + e.message, { err: true, ms: 8000 });
      }
    });
  }, [toast]);

  const updateStore = useCallback(fn => {
    const next = fn(structuredClone(storeRef.current.data));
    storeRef.current = { ...storeRef.current, data: next };
    setStore(s => ({ ...s, data: next }));
    persist(next);
    return next;
  }, [persist]);

  const loadRepos = useCallback(() => {
    setReposError('');
    return listRepos().then(setRepos).catch(e => setReposError(e.message));
  }, []);

  /* ---------- навигация ---------- */
  const navigate = useCallback((r, { push = true } = {}) => {
    const cur = routeRef.current;
    const same = cur && r && cur.type === r.type && (r.type === 'bot' ? cur.botId === r.botId : cur.full === r.full);
    if (same) { setSidebarOpen(false); return; }
    if (dirtyCount.current && !confirm('Есть несохранённые изменения. Перейти без сохранения?')) return;
    if (!r) {
      dirtyCount.current = 0; setRoute(null); setRepoMeta(null);
      if (push) history.pushState(null, '', '/');
      return;
    }
    return busy(async () => {
      let full = r.full;
      if (r.type === 'bot') {
        const found = findBot(storeRef.current.data, r.botId);
        if (!found) throw new Error('Бот не найден — возможно, он был удалён');
        full = found.bot.repo;
      }
      const meta = await gh(`/repos/${full}`);
      dirtyCount.current = 0;
      setRepoMeta(meta);
      setRoute(r);
      setSidebarOpen(false);
      if (push && location.pathname !== routeUrl(r)) history.pushState(null, '', routeUrl(r));
    });
  }, [busy]);

  useEffect(() => {
    if (!connected) return;
    loadRepos();
    loadProjects(auth.canSync).then(s => {
      storeRef.current = s;
      setStore(s);
      if (s.error) toast('Проекты загружены из локальной копии: ' + s.error, { err: true });
      if (s.migrate) persist(s.data); // перенести локальные проекты в Gist
      const initial = parseUrl();
      if (initial) navigate(initial, { push: false });
    });
    const onPop = () => navigate(parseUrl(), { push: false });
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [connected]);

  /* ---------- операции с проектами и ботами ---------- */
  const saveProject = (values, projectId) => {
    updateStore(d => {
      if (projectId) Object.assign(d.projects.find(p => p.id === projectId), values);
      else d.projects.push({ id: uid(), ...values, bots: [] });
      return d;
    });
    setDialog(null);
  };
  const deleteProject = projectId => {
    const p = storeRef.current.data.projects.find(x => x.id === projectId);
    if (route?.type === 'bot' && p?.bots.some(b => b.id === route.botId)) navigate(null);
    updateStore(d => ({ ...d, projects: d.projects.filter(x => x.id !== projectId) }));
    setDialog(null);
  };
  const toggleProject = projectId => updateStore(d => {
    const p = d.projects.find(x => x.id === projectId);
    p.collapsed = !p.collapsed;
    return d;
  });

  const saveBot = (values, projectId, botId) => {
    let newId = botId;
    updateStore(d => {
      let target = d.projects.find(p => p.id === projectId);
      if (!target) { target = { id: uid(), name: 'Мои боты', emoji: '🤖', bots: [] }; d.projects.push(target); }
      target.collapsed = false;
      if (botId) {
        const from = d.projects.find(p => p.bots.some(b => b.id === botId));
        const bot = from.bots.find(b => b.id === botId);
        Object.assign(bot, values);
        if (from !== target) { from.bots = from.bots.filter(b => b !== bot); target.bots.push(bot); }
      } else {
        newId = uid();
        target.bots.push({ id: newId, ...values });
      }
      return d;
    });
    setDialog(null);
    const cur = routeRef.current;
    if (!botId) navigate({ type: 'bot', botId: newId });
    else if (cur?.type === 'bot' && cur.botId === botId) {
      // репозиторий мог поменяться — перечитываем
      busy(async () => setRepoMeta(await gh(`/repos/${values.repo}`)));
    }
  };
  const deleteBot = botId => {
    if (route?.type === 'bot' && route.botId === botId) { dirtyCount.current = 0; navigate(null); }
    updateStore(d => { d.projects.forEach(p => { p.bots = p.bots.filter(b => b.id !== botId); }); return d; });
    setDialog(null);
  };
  const saveBotCfg = (botId, cfg) => updateStore(d => {
    const found = findBot(d, botId);
    if (found) Object.assign(found.bot, { textDirs: cfg.textDirs, imageDirs: cfg.imageDirs, textExt: cfg.textExt, exclude: cfg.exclude });
    return d;
  });

  const projects = store.data?.projects || [];
  const activeBot = route?.type === 'bot' ? findBot(store.data, route.botId) : null;
  const activeKey = route?.type === 'bot' ? 'bot:' + route.botId : route?.full;
  const editing = dialog?.type === 'bot' && dialog.botId ? findBot(store.data, dialog.botId) : null;
  const dialogProjects = projects.length ? projects : [{ id: '__new', name: 'Мои боты', emoji: '🤖' }];

  return (
    <div className="app">
      <Navbar auth={auth} onHome={() => navigate(null)} onToggleSidebar={() => setSidebarOpen(o => !o)} />
      <div className="app-body">
        <ProjectsSidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          connected={connected}
          loadingAuth={!auth}
          store={store}
          repos={repos}
          reposError={reposError}
          active={activeKey}
          clientId={auth?.clientId}
          onOpenBot={botId => navigate({ type: 'bot', botId })}
          onOpenRepo={full => navigate({ type: 'repo', full })}
          onReloadRepos={loadRepos}
          onNewProject={() => setDialog({ type: 'project' })}
          onEditProject={p => setDialog({ type: 'project', project: p })}
          onNewBot={(projectId, initialRepo) => setDialog({ type: 'bot', projectId, initialRepo })}
          onEditBot={botId => setDialog({ type: 'bot', botId })}
          onToggleProject={toggleProject}
        />
        <div className="app-main">
          {connected && route && repoMeta && (route.type === 'repo' || activeBot) ? (
            <Workspace
              key={activeKey + '|' + repoMeta.full_name + '|' + (activeBot?.bot.branch || '')}
              repo={repoMeta}
              bot={activeBot?.bot}
              project={activeBot?.project}
              onDirty={n => { dirtyCount.current = n; }}
              onEditBot={() => setDialog({ type: 'bot', botId: route.botId })}
              onSaveBotCfg={cfg => saveBotCfg(route.botId, cfg)}
              onAddAsBot={() => setDialog({ type: 'bot', initialRepo: repoMeta.full_name })}
            />
          ) : (
            <Welcome
              auth={auth}
              store={store}
              repos={repos}
              onOpenBot={botId => navigate({ type: 'bot', botId })}
              onOpenRepo={full => navigate({ type: 'repo', full })}
              onNewProject={() => setDialog({ type: 'project' })}
              onNewBot={projectId => setDialog({ type: 'bot', projectId })}
            />
          )}
        </div>
      </div>

      {dialog?.type === 'project' && (
        <ProjectDialog
          project={dialog.project}
          onClose={() => setDialog(null)}
          onSave={v => saveProject(v, dialog.project?.id)}
          onDelete={() => deleteProject(dialog.project.id)}
        />
      )}
      {dialog?.type === 'bot' && (
        <BotDialog
          bot={editing?.bot}
          projectId={editing?.project.id || dialog.projectId || dialogProjects[0].id}
          projects={dialogProjects}
          repos={repos}
          initialRepo={dialog.initialRepo}
          onClose={() => setDialog(null)}
          onSave={(v, projectId) => saveBot(v, projectId, dialog.botId)}
          onDelete={() => deleteBot(dialog.botId)}
        />
      )}
    </div>
  );
}
