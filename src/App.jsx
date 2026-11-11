import { useCallback, useEffect, useRef, useState } from 'react';
import Navbar from './components/Navbar.jsx';
import ProjectsSidebar from './components/ProjectsSidebar.jsx';
import Welcome from './components/Welcome.jsx';
import Workspace from './components/Workspace.jsx';
import { gh, listRepos } from './github.js';
import { LS } from './lib.js';
import { useUi } from './ui.jsx';

const repoFromUrl = () => {
  const m = location.pathname.match(/^\/([\w.-]+)\/([\w.-]+)\/?$/);
  return m ? `${m[1]}/${m[2]}` : null;
};

export default function App() {
  const { busy, toast } = useUi();
  const [auth, setAuth] = useState(null); // {authenticated, user, clientId, configError}
  const [repos, setRepos] = useState(null);
  const [reposError, setReposError] = useState('');
  const [repo, setRepo] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const dirtyCount = useRef(0);
  const repoRef = useRef(null);
  repoRef.current = repo;

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

  const loadRepos = useCallback(() => {
    setReposError('');
    return listRepos().then(setRepos).catch(e => setReposError(e.message));
  }, []);

  const openRepo = useCallback((full, { push = true } = {}) => {
    if (repoRef.current?.full_name === full) { setSidebarOpen(false); return; }
    if (dirtyCount.current && !confirm('Есть несохранённые изменения. Перейти в другой проект без сохранения?')) return;
    return busy(async () => {
      const r = await gh(`/repos/${full}`);
      dirtyCount.current = 0;
      setRepo(r);
      setSidebarOpen(false);
      LS.set('botcrm:recent', [r.full_name, ...LS.get('botcrm:recent', []).filter(x => x !== r.full_name)].slice(0, 5));
      if (push && location.pathname !== '/' + r.full_name) history.pushState(null, '', '/' + r.full_name);
    });
  }, [busy]);

  useEffect(() => {
    if (!auth?.authenticated) return;
    loadRepos();
    const initial = repoFromUrl();
    if (initial) openRepo(initial, { push: false });
    const onPop = () => {
      const full = repoFromUrl();
      if (!full) setRepo(null); else openRepo(full, { push: false });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [auth?.authenticated]);

  const goHome = () => {
    if (dirtyCount.current && !confirm('Есть несохранённые изменения. Закрыть проект без сохранения?')) return;
    dirtyCount.current = 0;
    setRepo(null);
    history.pushState(null, '', '/');
  };

  const connected = !!auth?.authenticated;

  return (
    <div className="app">
      <Navbar auth={auth} onHome={goHome} onToggleSidebar={() => setSidebarOpen(o => !o)} />
      <div className="app-body">
        <ProjectsSidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          connected={connected}
          loadingAuth={!auth}
          repos={repos}
          error={reposError}
          active={repo?.full_name}
          clientId={auth?.clientId}
          onOpen={openRepo}
          onReload={loadRepos}
        />
        <div className="app-main">
          {connected && repo
            ? <Workspace key={repo.full_name} repo={repo} onDirty={n => { dirtyCount.current = n; }} />
            : <Welcome auth={auth} repos={repos} onOpen={openRepo} />}
        </div>
      </div>
    </div>
  );
}
