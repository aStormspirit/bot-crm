import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { chat } from '../chat.js';
import { useUi } from '../ui.jsx';
import { BROADCAST_PLATFORMS } from './Broadcasts.jsx';

const Users = lazy(() => import('./Users.jsx'));

const nf = new Intl.NumberFormat('ru-RU');
const num = n => (n == null ? '—' : nf.format(n));
const pct = (a, b, digits = 1) => (b ? `${(Math.round((a / b) * 100 * 10 ** digits) / 10 ** digits).toLocaleString('ru-RU')}%` : '—');
const dShort = iso => new Date(iso + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
const dLong = iso => new Date(iso + 'T12:00:00').toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' });

/** Синие ступени последовательной шкалы (светлая → тёмная). */
const RAMP = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b'];

/* ===================== раздел ===================== */

export default function Analytics({ platform }) {
  const [view, setView] = useState('overview');
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { chat('/_status').then(setStatus).catch(e => setError(e.message)); }, []);

  if (error) return <div style={{ padding: 16 }}><div className="hint err">{error}</div></div>;
  if (!status) return <div className="muted" style={{ padding: 16 }}>Загрузка…</div>;
  if (!status.configured || !status.admin) {
    return (
      <div className="no-content">
        <div className="big-ico">📊</div>
        <h2>{status.configured ? 'Нет доступа к аналитике' : 'Аналитика не подключена'}</h2>
        <p className="muted">
          Аналитика читает базу Chat API через тот же доступ, что и «Рассылки».{' '}
          {status.configured
            ? <>Добавьте <b className="mono">{status.login}</b> в переменную <span className="mono">CRM_ADMINS</span> в Vercel.</>
            : <>Задайте в Vercel <span className="mono">CHAT_API_URL</span>, <span className="mono">CHAT_API_CRM_TOKEN</span> и <span className="mono">CRM_ADMINS</span> — подробности во вкладке «Рассылки».</>}
        </p>
      </div>
    );
  }
  return (
    <div className="an-wrap">
      <div className="an-top">
        <div className="seg">
          <button className={view === 'overview' ? 'on' : ''} onClick={() => setView('overview')}>📊 Обзор</button>
          <button className={view === 'people' ? 'on' : ''} onClick={() => setView('people')}>👥 Люди</button>
        </div>
      </div>
      <div className="an-body">
        {view === 'overview' ? <Overview platform={platform} /> : (
          <Suspense fallback={<div className="muted" style={{ padding: 16 }}>Загрузка…</div>}><Users platform={platform} /></Suspense>
        )}
      </div>
    </div>
  );
}

/* ===================== обзор ===================== */

function Overview({ platform }) {
  const { busy } = useUi();
  const [platforms, setPlatforms] = useState([platform || 'tg']);
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const pq = platforms.map(p => 'platforms=' + p).join('&');

  const load = () => chat(`/analytics?${pq}&days=${days}`).then(d => { setData(d); setError(''); }).catch(e => setError(e.message));
  useEffect(() => { if (platforms.length) { setData(null); load(); } }, [pq, days]);

  const s = data?.summary;
  return (
    <div className="an">
      <div className="toolbar an-filters">
        <div className="row">
          {BROADCAST_PLATFORMS.map(p => (
            <label key={p.id} className="row chk">
              <input type="checkbox" checked={platforms.includes(p.id)}
                onChange={() => setPlatforms(ps => (ps.includes(p.id) ? ps.filter(x => x !== p.id) : [...ps, p.id]))} />
              {p.label}
            </label>
          ))}
        </div>
        <span className="grow" />
        <select value={days} onChange={e => setDays(Number(e.target.value))} title="Период графиков">
          <option value={14}>14 дней</option>
          <option value={30}>30 дней</option>
          <option value={90}>90 дней</option>
        </select>
        <button className="ghost" title="Обновить" onClick={() => busy(load)}>⟳</button>
      </div>

      {!platforms.length ? <div className="empty">Выберите хотя бы одну площадку.</div>
        : error ? <div className="hint err">{error}</div>
        : !data ? <div className="muted">Считаем…</div> : (
          <>
            <section className="an-kpis">
              <Kpi big label="Всего пользователей" value={num(s.users)} sub={`с премиумом сейчас ${num(s.premium_active)} · ${pct(s.premium_active, s.users)}`} />
              <Kpi label="Новые сегодня" value={num(s.new_1)} delta={[s.new_1, s.new_1_prev]} deltaLabel="ко вчера" />
              <Kpi label="Новые за 7 дней" value={num(s.new_7)} delta={[s.new_7, s.new_7_prev]} deltaLabel="к прошлой неделе" />
              <Kpi label="Новые за 30 дней" value={num(s.new_30)} delta={[s.new_30, s.new_30_prev]} deltaLabel="к прошлым 30 дням" />
            </section>
            <section className="an-kpis">
              <Kpi label="DAU — активны сегодня" value={num(s.dau)} sub={`${pct(s.dau, s.users)} от всех`} />
              <Kpi label="WAU — за 7 дней" value={num(s.wau)} sub={`${pct(s.wau, s.users)} от всех`} />
              <Kpi label="MAU — за 30 дней" value={num(s.mau)} sub={`${pct(s.mau, s.users)} от всех`} />
              <Kpi label="Липкость DAU / MAU" value={pct(s.dau, s.mau, 0)} sub="какая доля аудитории месяца заходит каждый день" />
            </section>

            <div className="an-grid">
              <Card title="Новые пользователи по дням" note="по дате первого сообщения боту, Москва">
                <BarChart data={data.daily} field="new" unit="новых" />
              </Card>
              <Card title="Активные пользователи по дням (DAU)" note="писали боту или искали собеседника">
                <BarChart data={data.daily} field="active" unit="активных" />
              </Card>
            </div>

            <Card title="Удержание (retention)" note={retentionNote(s.activity_since)}>
              <div className="an-ret">
                {['d1', 'd7', 'd30'].map(k => {
                  const r = data.retention[k];
                  return (
                    <div key={k} className="an-ret-tile">
                      <span className="muted small">День {k.slice(1)}</span>
                      <b>{r.base ? pct(r.kept, r.base) : '—'}</b>
                      <small className="muted">{r.base ? `вернулись ${num(r.kept)} из ${num(r.base)}` : 'пока мало данных'}</small>
                    </div>
                  );
                })}
              </div>
              <Cohorts rows={data.cohorts} />
            </Card>

            <div className="an-grid">
              <Card title="Воронка" note="за всё время, по людям">
                <Funnel steps={data.funnel} />
              </Card>
              <Card title="Диалоги">
                <BarChart data={data.daily} field="dialogs" unit="диалогов" height={150} />
                <dl className="an-dl">
                  <dt>Диалогов за 30 дней</dt><dd>{num(data.engagement.dialogs_30)}</dd>
                  <dt>Обычная длительность (медиана)</dt><dd>{data.engagement.median_minutes == null ? '—' : `${Math.round(data.engagement.median_minutes * 10) / 10} мин`}</dd>
                  <dt>Закончились жалобой</dt><dd>{num(data.engagement.reported_30)} · {pct(data.engagement.reported_30, data.engagement.dialogs_30)}</dd>
                  <dt>Поисков на человека</dt><dd>{(Math.round(data.engagement.searches_per_user * 10) / 10).toLocaleString('ru-RU')}</dd>
                  <dt>Купили премиум хоть раз</dt><dd>{num(s.premium_ever)} · {pct(s.premium_ever, s.users)}</dd>
                </dl>
              </Card>
            </div>

            <details className="an-table">
              <summary>Таблица по дням</summary>
              <div className="u-table-wrap">
                <table className="u-table">
                  <thead><tr><th>День</th><th className="num">Новые</th><th className="num">Активные</th><th className="num">Диалоги</th></tr></thead>
                  <tbody>{[...data.daily].reverse().map(d => (
                    <tr key={d.day}><td>{dLong(d.day)}</td><td className="num">{num(d.new)}</td><td className="num">{num(d.active)}</td><td className="num">{num(d.dialogs)}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            </details>
          </>
        )}
    </div>
  );
}

function retentionNote(since) {
  const base = 'доля пришедших, кто вернулся ровно на N-й день; когорты — по неделе прихода';
  return since ? `${base}. Активность по дням собирается с ${dShort(since)}; до этого восстановлена по приходу, последнему визиту и диалогам` : base;
}

function Kpi({ label, value, sub, delta, deltaLabel, big }) {
  let d = null;
  if (delta) {
    const [now, prev] = delta;
    if (prev > 0) {
      const ch = Math.round(((now - prev) / prev) * 100);
      d = <span className={'an-delta ' + (ch > 0 ? 'up' : ch < 0 ? 'down' : '')}>{ch > 0 ? '▲' : ch < 0 ? '▼' : '='} {Math.abs(ch)}% {deltaLabel}</span>;
    } else if (now > 0) d = <span className="an-delta muted">раньше было 0</span>;
  }
  return (
    <div className={'an-kpi' + (big ? ' big' : '')}>
      <span className="muted small">{label}</span>
      <b>{value}</b>
      {d}
      {sub && <small className="muted">{sub}</small>}
    </div>
  );
}

function Card({ title, note, children }) {
  return (
    <section className="an-card">
      <h3>{title}</h3>
      {note && <div className="muted small an-note">{note}</div>}
      {children}
    </section>
  );
}

/* ===================== графики ===================== */

function niceMax(v) {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return v;
}

function BarChart({ data, field, unit, height = 190 }) {
  const ref = useRef();
  const [w, setW] = useState(600);
  const [hover, setHover] = useState(null);
  useLayoutEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const pad = { l: 36, r: 8, t: 10, b: 22 };
  const max = niceMax(Math.max(0, ...data.map(d => d[field])));
  const iw = w - pad.l - pad.r, ih = height - pad.t - pad.b;
  const step = iw / data.length, bw = Math.max(2, step - 2);
  const y = v => pad.t + ih - (v / max) * ih;
  const ticks = [0, max / 2, max];
  const every = Math.ceil(data.length / Math.max(2, Math.floor(iw / 64)));
  const total = data.reduce((a, d) => a + d[field], 0);
  const h = hover != null ? data[hover] : null;
  return (
    <div className="an-chart" ref={ref}>
      <svg width={w} height={height} role="img" aria-label={`${unit} по дням, всего ${total}`}
        onMouseLeave={() => setHover(null)}>
        {ticks.map(t => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} className="an-grid-line" />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className="an-axis">{num(Math.round(t))}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const v = d[field], x = pad.l + i * step + 1, top = y(v), bh = pad.t + ih - top, r = Math.min(4, bw / 2, bh);
          return (
            <g key={d.day}>
              {v > 0 && (
                <path className={'an-bar' + (hover === i ? ' on' : '')}
                  d={`M${x},${pad.t + ih} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${pad.t + ih} Z`} />
              )}
              <rect x={pad.l + i * step} y={pad.t} width={step} height={ih} fill="transparent" onMouseEnter={() => setHover(i)} />
              {i % every === 0 && <text x={x + bw / 2} y={height - 6} textAnchor="middle" className="an-axis">{dShort(d.day)}</text>}
            </g>
          );
        })}
        <line x1={pad.l} x2={w - pad.r} y1={pad.t + ih} y2={pad.t + ih} className="an-base" />
      </svg>
      {h && (
        <div className="an-tip" style={{ left: Math.min(w - 150, Math.max(0, pad.l + hover * step + step / 2 - 70)) }}>
          <div className="muted small">{dLong(h.day)}</div>
          <b>{num(h[field])}</b> {unit}
        </div>
      )}
      <div className="muted small">Всего за период: <b>{num(total)}</b></div>
    </div>
  );
}

function Cohorts({ rows }) {
  const width = Math.max(1, ...rows.map(r => r.kept.length));
  if (!rows.length) return <div className="muted small">Пока нет людей за последние 8 недель.</div>;
  const cell = (n, size, k) => {
    if (!size) return <td key={k} className="an-coh-empty" />;
    const share = n / size;
    const idx = Math.min(RAMP.length - 1, Math.round(share * (RAMP.length - 1)));
    return (
      <td key={k} style={{ background: RAMP[idx], color: idx >= 7 ? '#fff' : '#0b0b0b' }}
        title={`Неделя ${k}: ${n} из ${size}`}>{k === 0 ? '100%' : pct(n, size, 0)}</td>
    );
  };
  return (
    <div className="u-table-wrap an-coh-wrap">
      <table className="an-coh">
        <thead>
          <tr><th>Неделя прихода</th><th className="num">Людей</th>{Array.from({ length: width }, (_, k) => <th key={k} className="num">{k === 0 ? 'Нед. 0' : `+${k}`}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.week}>
              <td>с {dShort(r.week)}</td>
              <td className="num">{num(r.size)}</td>
              {Array.from({ length: width }, (_, k) => (k < r.kept.length ? cell(k === 0 ? r.size : r.kept[k], r.size, k) : <td key={k} className="an-coh-empty" />))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="muted small">Доля людей когорты, которые были активны на этой неделе после прихода. Чем темнее, тем больше вернулись.</div>
    </div>
  );
}

function Funnel({ steps }) {
  const top = steps[0]?.users || 0;
  return (
    <div className="an-funnel">
      {steps.map((s, i) => (
        <div key={s.step} className="an-fstep">
          <div className="row" style={{ gap: 8 }}>
            <span className="grow">{s.label}</span>
            <b>{num(s.users)}</b>
            <span className="muted small an-fpct">{pct(s.users, top, 0)}</span>
          </div>
          <div className="an-fbar"><i style={{ width: top ? `${(s.users / top) * 100}%` : 0 }} /></div>
          {i > 0 && <small className="muted">из прошлого шага: {pct(s.users, steps[i - 1].users, 0)}</small>}
        </div>
      ))}
    </div>
  );
}
