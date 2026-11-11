import { useMemo, useState } from 'react';
import { LS } from '../lib.js';
import { GitHubIcon } from './Navbar.jsx';

export default function ProjectsSidebar({ open, onClose, connected, loadingAuth, repos, error, active, clientId, onOpen, onReload }) {
  const [q, setQ] = useState('');
  const [manual, setManual] = useState('');
  const recent = LS.get('botcrm:recent', []);

  const shown = useMemo(() => {
    const list = repos || [];
    const ql = q.toLowerCase();
    return list.filter(r => r.full_name.toLowerCase().includes(ql));
  }, [repos, q]);

  // недавние — сверху, если не ищем
  const recentRepos = !q && repos ? recent.map(n => repos.find(r => r.full_name === n)).filter(Boolean) : [];
  const rest = shown.filter(r => !recentRepos.includes(r));

  const openManual = () => {
    const n = manual.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').split('/').slice(0, 2).join('/');
    if (/^[\w.-]+\/[\w.-]+$/.test(n)) { onOpen(n); setManual(''); }
  };

  const item = r => (
    <div key={r.id} className={'project' + (r.full_name === active ? ' on' : '')} onClick={() => onOpen(r.full_name)} title={r.description || r.full_name}>
      <span className="project-ico">{r.name[0]?.toUpperCase()}</span>
      <span className="grow project-name">
        <span>{r.name}</span>
        <span className="muted project-owner">{r.owner?.login}</span>
      </span>
      {r.private && <span className="lock" title="Приватный">🔒</span>}
    </div>
  );

  return (
    <>
      {open && <div className="sidebar-backdrop" onClick={onClose} />}
      <aside className={'projects' + (open ? ' open' : '')}>
        <div className="projects-head">
          <span className="section-title">Проекты</span>
          {connected && <button className="ghost" title="Обновить список" onClick={onReload}>⟳</button>}
        </div>

        {loadingAuth ? (
          <div className="muted small pad">Загрузка…</div>
        ) : !connected ? (
          <div className="projects-empty">
            <GitHubIcon size={32} />
            <div>Подключите GitHub, чтобы увидеть свои проекты</div>
            <a className="btn primary" href="/api/auth/login"><GitHubIcon /> Подключить</a>
          </div>
        ) : (
          <>
            <div className="pad-x"><input className="w100" placeholder="Поиск проекта…" value={q} onChange={e => setQ(e.target.value)} /></div>
            <div className="project-list">
              {error && <div className="hint err" style={{ margin: 8 }}>{error}</div>}
              {!repos && !error && <div className="muted small pad">Загрузка проектов…</div>}
              {recentRepos.length > 0 && <div className="group-title">Недавние</div>}
              {recentRepos.map(item)}
              {repos && (recentRepos.length > 0 || q) && <div className="group-title">{q ? `Найдено: ${shown.length}` : 'Все проекты'}</div>}
              {rest.map(item)}
              {repos && !shown.length && <div className="muted small pad">Ничего не найдено</div>}
            </div>
            <div className="projects-foot">
              <div className="row">
                <input className="grow mono" placeholder="owner/repo" value={manual} onChange={e => setManual(e.target.value)} onKeyDown={e => e.key === 'Enter' && openManual()} />
                <button onClick={openManual} title="Открыть по имени">→</button>
              </div>
              {clientId && (
                <a className="small" href={`https://github.com/settings/connections/applications/${clientId}`} target="_blank" rel="noopener noreferrer">
                  Нет проектов организации? Выдать доступ ↗
                </a>
              )}
            </div>
          </>
        )}
      </aside>
    </>
  );
}
