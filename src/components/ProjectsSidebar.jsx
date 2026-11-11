import { useMemo, useState } from 'react';
import { LS } from '../lib.js';
import { PLATFORMS } from '../store.js';
import { GitHubIcon } from './Navbar.jsx';

export default function ProjectsSidebar({
  open, onClose, connected, loadingAuth, store, repos, reposError, active, clientId,
  onOpenBot, onOpenRepo, onReloadRepos, onNewProject, onEditProject, onNewBot, onEditBot, onToggleProject,
}) {
  const [q, setQ] = useState('');
  const [manual, setManual] = useState('');
  const projects = store.data?.projects || [];
  const [reposOpen, setReposOpen] = useState(() => LS.get('botcrm:reposOpen', null));
  const showRepos = reposOpen ?? projects.length === 0;
  const toggleRepos = () => { LS.set('botcrm:reposOpen', !showRepos); setReposOpen(!showRepos); };

  const shownRepos = useMemo(() => (repos || []).filter(r => r.full_name.toLowerCase().includes(q.toLowerCase())), [repos, q]);

  const openManual = () => {
    const n = manual.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').split('/').slice(0, 2).join('/');
    if (/^[\w.-]+\/[\w.-]+$/.test(n)) { onOpenRepo(n); setManual(''); }
  };

  return (
    <>
      {open && <div className="sidebar-backdrop" onClick={onClose} />}
      <aside className={'projects' + (open ? ' open' : '')}>
        {loadingAuth ? (
          <div className="muted small pad">Загрузка…</div>
        ) : !connected ? (
          <>
            <div className="projects-head"><span className="section-title">Проекты</span></div>
            <div className="projects-empty">
              <GitHubIcon size={32} />
              <div>Подключите GitHub, чтобы создавать проекты и добавлять в них ботов</div>
              <a className="btn primary" href="/api/auth/login"><GitHubIcon /> Подключить</a>
            </div>
          </>
        ) : (
          <div className="project-scroll">
            <div className="projects-head">
              <span className="section-title">Проекты</span>
              <button className="ghost icon-btn" title="Новый проект" onClick={onNewProject}>＋</button>
            </div>

            {store.mode === 'local' && store.data && (
              <div className="hint sync-hint">
                Проекты сохраняются только в этом браузере.{' '}
                <a href="/api/auth/login">Переподключите GitHub</a>, чтобы они были доступны с любого устройства.
              </div>
            )}

            {!store.data ? (
              <div className="muted small pad">Загрузка проектов…</div>
            ) : projects.length === 0 ? (
              <div className="projects-empty compact">
                <div>Создайте проект и добавьте в него ботов, которые в нём работают</div>
                <button className="primary" onClick={onNewProject}>＋ Создать проект</button>
              </div>
            ) : (
              <div className="tree">
                {projects.map(p => (
                  <div key={p.id} className="tree-project">
                    <div className="tree-row project-row" onClick={() => onToggleProject(p.id)}>
                      <span className="caret">{p.collapsed ? '▸' : '▾'}</span>
                      <span className="tree-emoji">{p.emoji}</span>
                      <span className="grow ellipsis"><b>{p.name}</b></span>
                      <span className="muted count">{p.bots.length || ''}</span>
                      <span className="row-acts">
                        <button className="ghost icon-btn" title="Добавить бота" onClick={e => { e.stopPropagation(); onNewBot(p.id); }}>＋</button>
                        <button className="ghost icon-btn" title="Настройки проекта" onClick={e => { e.stopPropagation(); onEditProject(p); }}>⋯</button>
                      </span>
                    </div>
                    {!p.collapsed && (
                      <div className="tree-children">
                        {p.bots.map(b => (
                          <div key={b.id} className={'tree-row bot-row' + (active === 'bot:' + b.id ? ' on' : '')} onClick={() => onOpenBot(b.id)} title={`${b.repo}${b.folder ? '/' + b.folder : ''}`}>
                            <span className="tree-emoji">{PLATFORMS[b.platform]?.icon || '🤖'}</span>
                            <span className="grow bot-name">
                              <span className="ellipsis">{b.name}</span>
                              <span className="muted ellipsis bot-repo">{b.repo}{b.folder ? '/' + b.folder : ''}</span>
                            </span>
                            <span className="row-acts">
                              <button className="ghost icon-btn" title="Настройки бота" onClick={e => { e.stopPropagation(); onEditBot(b.id); }}>⋯</button>
                            </span>
                          </div>
                        ))}
                        <div className="tree-row add-row" onClick={() => onNewBot(p.id)}>＋ Добавить бота</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="projects-head repos-head" onClick={toggleRepos}>
              <span className="section-title"><span className="caret">{showRepos ? '▾' : '▸'}</span> Репозитории GitHub</span>
              {showRepos && <button className="ghost icon-btn" title="Обновить список" onClick={e => { e.stopPropagation(); onReloadRepos(); }}>⟳</button>}
            </div>
            {showRepos && (
              <>
                <div className="pad-x"><input className="w100" placeholder="Поиск репозитория…" value={q} onChange={e => setQ(e.target.value)} /></div>
                {reposError && <div className="hint err" style={{ margin: 8 }}>{reposError}</div>}
                {!repos && !reposError && <div className="muted small pad">Загрузка…</div>}
                {shownRepos.map(r => (
                  <div key={r.id} className={'tree-row repo-row' + (active === r.full_name ? ' on' : '')} onClick={() => onOpenRepo(r.full_name)} title={r.description || r.full_name}>
                    <span className="project-ico">{r.name[0]?.toUpperCase()}</span>
                    <span className="grow bot-name">
                      <span className="ellipsis">{r.name}</span>
                      <span className="muted ellipsis bot-repo">{r.owner?.login}{r.private ? ' · 🔒' : ''}</span>
                    </span>
                    <span className="row-acts">
                      <button className="ghost icon-btn" title="Добавить как бота в проект" onClick={e => { e.stopPropagation(); onNewBot(null, r.full_name); }}>＋</button>
                    </span>
                  </div>
                ))}
                {repos && !shownRepos.length && <div className="muted small pad">Ничего не найдено</div>}
                <div className="pad-x row" style={{ marginTop: 8 }}>
                  <input className="grow mono" placeholder="owner/repo" value={manual} onChange={e => setManual(e.target.value)} onKeyDown={e => e.key === 'Enter' && openManual()} />
                  <button onClick={openManual} title="Открыть по имени">→</button>
                </div>
                {clientId && (
                  <a className="small pad" style={{ display: 'block' }} href={`https://github.com/settings/connections/applications/${clientId}`} target="_blank" rel="noopener noreferrer">
                    Нет репозиториев организации? Выдать доступ ↗
                  </a>
                )}
              </>
            )}
          </div>
        )}
      </aside>
    </>
  );
}
