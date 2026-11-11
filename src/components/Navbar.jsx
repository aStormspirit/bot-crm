import { useEffect, useRef, useState } from 'react';

export const GitHubIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" /></svg>
);

export default function Navbar({ auth, onHome, onToggleSidebar }) {
  const [menu, setMenu] = useState(false);
  const ref = useRef();

  useEffect(() => {
    if (!menu) return;
    const close = e => { if (!ref.current?.contains(e.target)) setMenu(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menu]);

  return (
    <header className="navbar">
      <button className="ghost burger" onClick={onToggleSidebar} aria-label="Проекты">☰</button>
      <a className="brand" href="/" onClick={e => { e.preventDefault(); onHome(); }}>🤖 <span>Bot CRM</span></a>
      <span className="grow" />
      {auth?.configError && <span className="badge warn" title={auth.configError}>Сервер не настроен</span>}
      {!auth ? (
        <span className="muted small">…</span>
      ) : auth.authenticated ? (
        <div className="user-menu" ref={ref}>
          <button className="ghost user-btn" onClick={() => setMenu(m => !m)}>
            {auth.user.avatar_url ? <img className="avatar sm" src={auth.user.avatar_url} alt="" /> : <GitHubIcon />}
            <span className="user-login">{auth.user.login}</span>
            <span className="conn-dot" title="GitHub подключён" />
          </button>
          {menu && (
            <div className="dropdown">
              <div className="dropdown-head">
                <div className="muted small">GitHub подключён</div>
                <b>{auth.user.name || auth.user.login}</b>
              </div>
              <a href={`https://github.com/${auth.user.login}`} target="_blank" rel="noopener noreferrer">Профиль на GitHub ↗</a>
              {auth.clientId && <a href={`https://github.com/settings/connections/applications/${auth.clientId}`} target="_blank" rel="noopener noreferrer">Доступ к организациям ↗</a>}
              <a href="/api/auth/logout" className="danger-link">Отключить GitHub</a>
            </div>
          )}
        </div>
      ) : (
        <a className="btn primary" href="/api/auth/login"><GitHubIcon /> Подключить GitHub</a>
      )}
    </header>
  );
}
