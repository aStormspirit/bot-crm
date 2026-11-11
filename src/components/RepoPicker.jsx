import { useEffect, useMemo, useState } from 'react';
import { listRepos } from '../github.js';
import { LS } from '../lib.js';

export default function RepoPicker({ user, clientId, onOpen }) {
  const [repos, setRepos] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [manual, setManual] = useState('');
  const recent = LS.get('botcrm:recent', []);

  useEffect(() => { listRepos().then(setRepos).catch(e => setError(e.message)); }, []);

  const shown = useMemo(() => (repos || []).filter(r => r.full_name.toLowerCase().includes(q.toLowerCase())), [repos, q]);

  const openManual = () => {
    const n = manual.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').split('/').slice(0, 2).join('/');
    if (/^[\w.-]+\/[\w.-]+$/.test(n)) onOpen(n); else setError('Формат: owner/repo или ссылка на репозиторий');
  };

  return (
    <div className="center" style={{ maxWidth: 760 }}>
      <div className="card stack">
        <div className="row">
          {user.avatar_url && <img className="avatar" src={user.avatar_url} alt="" />}
          <div className="grow">
            <h1>Выберите репозиторий</h1>
            <div className="muted">Вы вошли как <b>{user.login}</b></div>
          </div>
          <a className="btn ghost" href="/api/auth/logout">Выйти</a>
        </div>

        {recent.length > 0 && (
          <div>
            <div className="muted small" style={{ marginBottom: 6 }}>Недавние</div>
            <div className="row">{recent.map(r => <button key={r} onClick={() => onOpen(r)}>{r}</button>)}</div>
          </div>
        )}

        <div className="row">
          <input className="grow" value={manual} onChange={e => setManual(e.target.value)} onKeyDown={e => e.key === 'Enter' && openManual()} placeholder="owner/repo или ссылка на GitHub" />
          <button className="primary" onClick={openManual}>Открыть</button>
        </div>

        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Поиск по вашим репозиториям…" />
        {error && <div className="hint err">{error}</div>}
        <div className="repo-list">
          {!repos && !error && <div className="repo-item muted">Загрузка…</div>}
          {repos && !shown.length && <div className="repo-item muted">Ничего не найдено</div>}
          {shown.map(r => (
            <div key={r.id} className="repo-item" onClick={() => onOpen(r.full_name)}>
              <div className="grow">
                <b>{r.full_name}</b>
                {r.description && <div className="muted small">{r.description}</div>}
              </div>
              {r.private && <span className="badge">private</span>}
              {r.permissions && !r.permissions.push && <span className="badge warn">только чтение</span>}
            </div>
          ))}
        </div>
        {clientId && (
          <div className="muted small">
            Не видите репозиторий организации? Организация должна разрешить доступ приложению —{' '}
            <a href={`https://github.com/settings/connections/applications/${clientId}`} target="_blank" rel="noopener noreferrer">настроить доступ к организациям ↗</a>
          </div>
        )}
      </div>
    </div>
  );
}
