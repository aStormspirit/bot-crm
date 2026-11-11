import { useEffect, useState } from 'react';
import { chat } from '../chat.js';
import { useUi } from '../ui.jsx';
import { BROADCAST_PLATFORMS } from './Broadcasts.jsx';

const PAGE = 50;
const PHASE = { idle: null, searching: { label: 'в поиске', cls: 'plan' }, chatting: { label: 'в диалоге', cls: 'run' } };
const platLabel = p => BROADCAST_PLATFORMS.find(x => x.id === p)?.label || p;
const fmt = iso => (iso ? new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');

function ago(iso) {
  if (!iso) return '—';
  const m = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000));
  if (m < 1) return 'только что';
  if (m < 60) return `${m} мин назад`;
  if (m < 60 * 24) return `${Math.round(m / 60)} ч назад`;
  if (m < 60 * 24 * 60) return `${Math.round(m / 1440)} дн. назад`;
  return fmt(iso);
}
const premiumState = until => (!until ? null : new Date(until) > new Date() ? 'active' : 'ended');
const profileUrl = u => (u.platform === 'tg' && u.handle ? `https://t.me/${u.handle.replace(/^@/, '')}` : u.platform === 'vk' ? `https://vk.com/id${u.user_id}` : null);

export default function Users({ platform }) {
  const { busy } = useUi();
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [platforms, setPlatforms] = useState([platform || 'tg']);
  const [q, setQ] = useState('');
  const [qDeb, setQDeb] = useState('');
  const [premium, setPremium] = useState('any');
  const [active, setActive] = useState('any');
  const [sort, setSort] = useState('last_seen');
  const [page, setPage] = useState(0);
  const [stats, setStats] = useState(null);
  const [list, setList] = useState(null);
  const [open, setOpen] = useState(null); // {platform, user_id}

  useEffect(() => { chat('/_status').then(setStatus).catch(e => setError(e.message)); }, []);
  useEffect(() => { const t = setTimeout(() => setQDeb(q), 350); return () => clearTimeout(t); }, [q]);
  useEffect(() => { setPage(0); }, [qDeb, premium, active, sort, platforms.join()]);

  const pq = platforms.map(p => 'platforms=' + p).join('&');
  const ready = status?.configured && status?.admin && platforms.length > 0;

  useEffect(() => {
    if (!ready) return;
    chat('/users/stats?' + pq).then(setStats).catch(e => setError(e.message));
  }, [ready, pq]);

  useEffect(() => {
    if (!ready) return;
    const params = new URLSearchParams({ q: qDeb, premium, active, sort, limit: PAGE, offset: page * PAGE });
    let alive = true;
    chat(`/users?${pq}&${params}`).then(r => alive && setList(r)).catch(e => alive && setError(e.message));
    return () => { alive = false; };
  }, [ready, pq, qDeb, premium, active, sort, page]);

  if (error) return <div style={{ padding: 16 }}><div className="hint err">{error}</div></div>;
  if (!status) return <div className="muted" style={{ padding: 16 }}>Загрузка…</div>;
  if (!status.configured || !status.admin) {
    return (
      <div className="no-content">
        <div className="big-ico">👥</div>
        <h2>{status.configured ? 'Нет доступа к пользователям' : 'Пользователи не подключены'}</h2>
        <p className="muted">
          Раздел читает базу Chat API через тот же доступ, что и «Рассылки».{' '}
          {status.configured
            ? <>Добавьте <b className="mono">{status.login}</b> в переменную <span className="mono">CRM_ADMINS</span> в Vercel.</>
            : <>Задайте в Vercel <span className="mono">CHAT_API_URL</span>, <span className="mono">CHAT_API_CRM_TOKEN</span> и <span className="mono">CRM_ADMINS</span> — подробности во вкладке «Рассылки».</>}
        </p>
      </div>
    );
  }

  const reload = () => busy(async () => {
    setStats(await chat('/users/stats?' + pq));
    const params = new URLSearchParams({ q: qDeb, premium, active, sort, limit: PAGE, offset: page * PAGE });
    setList(await chat(`/users?${pq}&${params}`));
  });
  const pages = list ? Math.max(1, Math.ceil(list.total / PAGE)) : 1;
  const tile = (n, label, sub, filter) => (
    <button className="u-tile" onClick={filter}>
      <b>{n ?? '…'}</b><span>{label}</span>{sub && <small className="muted">{sub}</small>}
    </button>
  );

  return (
    <div className="u">
      <div className="u-main">
        <div className="u-tiles">
          {tile(stats?.total, 'всего', null, () => { setPremium('any'); setActive('any'); })}
          {tile(stats?.active_24h, 'активны за сутки', stats && `за неделю ${stats.active_7d}`, () => { setActive('24h'); setPremium('any'); })}
          {tile(stats?.new_24h, 'новых за сутки', stats && `за неделю ${stats.new_7d}`, () => { setSort('started'); setActive('any'); })}
          {tile(stats?.premium, 'с премиумом', stats?.total ? `${Math.round((stats.premium / stats.total) * 1000) / 10}%` : null, () => { setPremium('yes'); setActive('any'); })}
          {tile(stats ? stats.searching + stats.chatting : null, 'сейчас в чате', stats && `ищут ${stats.searching} · в диалоге ${stats.chatting}`, null)}
        </div>

        <div className="toolbar u-filters">
          <div className="row">
            {BROADCAST_PLATFORMS.map(p => (
              <label key={p.id} className="row chk">
                <input type="checkbox" checked={platforms.includes(p.id)}
                  onChange={() => setPlatforms(ps => (ps.includes(p.id) ? ps.filter(x => x !== p.id) : [...ps, p.id]))} />
                {p.label}
              </label>
            ))}
          </div>
          <input className="grow" placeholder="ID или имя пользователя" value={q} onChange={e => setQ(e.target.value)} />
          <select value={active} onChange={e => setActive(e.target.value)} title="Активность">
            <option value="any">Любая активность</option>
            <option value="24h">Активны за сутки</option>
            <option value="7d">Активны за неделю</option>
            <option value="30d">Активны за месяц</option>
            <option value="gone">Не заходили больше месяца</option>
          </select>
          <select value={premium} onChange={e => setPremium(e.target.value)} title="Премиум">
            <option value="any">Премиум: все</option>
            <option value="yes">Премиум действует</option>
            <option value="ended">Премиум закончился</option>
            <option value="no">Без премиума</option>
          </select>
          <select value={sort} onChange={e => setSort(e.target.value)} title="Порядок">
            <option value="last_seen">Сначала недавно активные</option>
            <option value="started">Сначала новые</option>
            <option value="searches">Больше всего поисков</option>
            <option value="premium">По сроку премиума</option>
          </select>
          <button className="ghost" title="Обновить" onClick={reload}>⟳</button>
        </div>

        {!platforms.length ? <div className="empty">Выберите хотя бы одну площадку.</div> : !list ? <div className="muted">Загрузка…</div> : (
          <>
            <div className="u-table-wrap">
              <table className="u-table">
                <thead>
                  <tr><th>Человек</th><th>Площадка</th><th>Пришёл</th><th>Был</th><th className="num">Поисков</th><th>Премиум</th><th>Сейчас</th></tr>
                </thead>
                <tbody>
                  {list.items.map(u => {
                    const ps = premiumState(u.premium_until), ph = PHASE[u.phase];
                    const on = open && open.platform === u.platform && open.user_id === u.user_id;
                    return (
                      <tr key={u.platform + u.user_id} className={on ? 'on' : ''} onClick={() => setOpen({ platform: u.platform, user_id: u.user_id })}>
                        <td><b>{u.handle ? '@' + u.handle.replace(/^@/, '') : 'без имени'}</b><div className="muted mono small">{u.user_id}</div></td>
                        <td>{platLabel(u.platform)}{u.channels > 1 && <div className="muted small">{u.channels} чата</div>}</td>
                        <td title={fmt(u.started_at)}>{ago(u.started_at)}</td>
                        <td title={fmt(u.last_seen_at)}>{ago(u.last_seen_at)}</td>
                        <td className="num">{u.search_count}</td>
                        <td>{ps === 'active' ? <span className="st st-ok" title={fmt(u.premium_until)}>до {new Date(u.premium_until).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}</span> : ps === 'ended' ? <span className="st">закончился</span> : <span className="muted">—</span>}</td>
                        <td>{ph ? <span className={'st st-' + ph.cls}>{ph.label}</span> : <span className="muted">—</span>}</td>
                      </tr>
                    );
                  })}
                  {!list.items.length && <tr><td colSpan="7" className="muted" style={{ textAlign: 'center', padding: 24 }}>Никого не нашлось</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="row u-pager">
              <span className="muted small grow">Найдено: {list.total}</span>
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Назад</button>
              <span className="small">{page + 1} / {pages}</span>
              <button disabled={page + 1 >= pages} onClick={() => setPage(p => p + 1)}>Вперёд →</button>
            </div>
          </>
        )}
      </div>
      {open && <UserCard key={open.platform + open.user_id} who={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function UserCard({ who, onClose }) {
  const [u, setU] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { chat(`/users/${who.platform}/${who.user_id}`).then(setU).catch(e => setErr(e.message)); }, []);
  const url = u && profileUrl(u);
  const ps = u && premiumState(u.premium_until);
  return (
    <aside className="fpanel">
      <div className="fpanel-head">
        <div className="grow">
          <b>{u?.handle ? '@' + u.handle.replace(/^@/, '') : 'Человек'}</b>
          <div className="muted small">{platLabel(who.platform)} · <span className="mono">{who.user_id}</span></div>
        </div>
        <button className="ghost" onClick={onClose} title="Закрыть">✕</button>
      </div>
      <div className="fpanel-body">
        {err && <div className="hint err">{err}</div>}
        {!u && !err && <div className="muted">Загрузка…</div>}
        {u && (
          <>
            {url && <a href={url} target="_blank" rel="noopener noreferrer">Открыть профиль ↗</a>}
            <dl className="u-dl">
              <dt>Пришёл</dt><dd>{fmt(u.started_at)}</dd>
              <dt>Последний раз</dt><dd>{fmt(u.last_seen_at)} <span className="muted">({ago(u.last_seen_at)})</span></dd>
              <dt>Сейчас</dt><dd>{PHASE[u.phase]?.label || 'вне чата'}</dd>
              <dt>Поисков</dt><dd>{u.search_count}</dd>
              <dt>Диалогов</dt><dd>{u.dialogs}{u.reported > 0 && <span className="muted"> · {u.reported} закончились жалобой</span>}{u.last_dialog_at && <div className="muted small">последний {fmt(u.last_dialog_at)}</div>}</dd>
              <dt>Премиум</dt><dd>{ps === 'active' ? `действует до ${fmt(u.premium_until)}` : ps === 'ended' ? `закончился ${fmt(u.premium_until)}` : 'нет'}</dd>
            </dl>
            <div className="fld"><span>Через какие чаты писал</span>
              {u.chats.map(c => (
                <div key={c.platform + c.external_id} className="u-chat">
                  <b>{c.title || c.external_id}</b> <span className="muted mono small">{c.external_id}</span>
                  <div className="muted small">с {fmt(c.started_at)} · был {ago(c.last_seen_at)} · поисков {c.search_count}</div>
                </div>
              ))}
            </div>
            <div className="fld"><span>Рассылки, которые получил</span>
              {u.broadcasts.length ? u.broadcasts.map(b => (
                <div key={b.id} className="u-chat">
                  <b>{b.title || b.text.split('\n')[0]}</b>
                  <div className="muted small">{fmt(b.sent_at)}{b.times > 1 && ` · ${b.times} раза`}</div>
                </div>
              )) : <span className="muted small">Пока ни одной</span>}
            </div>
            <small className="muted">Переписка в CRM не показывается.</small>
          </>
        )}
      </div>
    </aside>
  );
}
