import { useEffect, useState } from 'react';
import Login from './components/Login.jsx';
import RepoPicker from './components/RepoPicker.jsx';
import Workspace from './components/Workspace.jsx';
import { gh } from './github.js';
import { useUi } from './ui.jsx';

export default function App() {
  const { busy } = useUi();
  const [auth, setAuth] = useState(null); // {authenticated, user, clientId, configError}
  const [repo, setRepo] = useState(null);

  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' })
      .then(r => r.json())
      .then(setAuth)
      .catch(e => setAuth({ authenticated: false, configError: 'API недоступно: ' + e.message }));
  }, []);

  // открыть репозиторий из адреса: /owner/repo
  useEffect(() => {
    if (!auth?.authenticated) return;
    const m = location.pathname.match(/^\/([\w.-]+)\/([\w.-]+)\/?$/);
    if (m) openRepo(`${m[1]}/${m[2]}`);
    const onPop = () => { if (location.pathname === '/') setRepo(null); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [auth?.authenticated]);

  const openRepo = full => busy(async () => {
    const r = await gh(`/repos/${full}`);
    setRepo(r);
    if (location.pathname !== '/' + r.full_name) history.pushState(null, '', '/' + r.full_name);
  });
  const closeRepo = () => { setRepo(null); history.pushState(null, '', '/'); };

  if (!auth) return <div className="loading"><div className="spin" /></div>;
  if (!auth.authenticated) return <Login configError={auth.configError} />;
  if (!repo) return <RepoPicker user={auth.user} clientId={auth.clientId} onOpen={openRepo} />;
  return <Workspace key={repo.full_name} repo={repo} user={auth.user} onBack={closeRepo} />;
}
