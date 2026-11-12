import { useEffect, useState } from 'react';
import { chat } from '../chat.js';
import { Modal, useUi } from '../ui.jsx';

const COLORS = ['#4a76a8', '#e64646', '#2fa36b', '#8a5cd6', '#d98b2b', '#3a9bb5'];
const colorOf = id => COLORS[Math.abs(Number(id) || 0) % COLORS.length];
const initials = title => {
  const w = String(title || '').trim().split(/\s+/).filter(Boolean);
  if (!w.length) return 'VK';
  return (w.length > 1 ? w[0][0] + w[1][0] : w[0].slice(0, 2)).toUpperCase();
};

function ago(iso) {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return 'только что';
  if (m < 60) return `${m} мин назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч назад`;
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function Ava({ id, title, url }) {
  const [bad, setBad] = useState(false);
  if (url && !bad) return <img className="cm-ava" src={url} alt="" referrerPolicy="no-referrer" onError={() => setBad(true)} />;
  return <span className="cm-ava" style={{ background: colorOf(id) }}>{initials(title)}</span>;
}

function statusOf(c) {
  if (!c.enabled || c.status === 'disabled') return { cls: 'off', text: 'Отключено' };
  if (c.status === 'error') return { cls: 'err', text: 'Ошибка' + (c.error ? ': ' + c.error : '') };
  if (c.status === 'ok') return { cls: 'ok', text: 'Работает' };
  return { cls: '', text: 'Проверяется…' };
}

export default function Communities() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { chat('/_status').then(setStatus).catch(e => setError(e.message)); }, []);

  if (error) return <div style={{ padding: 16 }}><div className="hint err">{error}</div></div>;
  if (!status) return <div className="muted" style={{ padding: 16 }}>Загрузка…</div>;
  if (!status.configured || !status.admin) {
    return (
      <div className="no-content">
        <div className="big-ico">🔌</div>
        <h2>{status.configured ? 'Нет доступа к сообществам' : 'Сообщества не подключены'}</h2>
        <p className="muted">
          {status.configured
            ? <>Добавьте <b className="mono">{status.login}</b> в переменную <span className="mono">CRM_ADMINS</span> в Vercel.</>
            : <>Задайте в Vercel <span className="mono">CHAT_API_URL</span>, <span className="mono">CHAT_API_CRM_TOKEN</span> и <span className="mono">CRM_ADMINS</span> — подробности во вкладке «Рассылки».</>}
        </p>
      </div>
    );
  }
  return <List />;
}

function List() {
  const { toast, busy } = useUi();
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [dlg, setDlg] = useState(null); // { groupId? }
  const [, tick] = useState(0);

  const load = () => chat('/channels/vk').then(d => { setItems(d); setError(''); }).catch(e => setError(e.message));
  useEffect(() => {
    load();
    const t = setInterval(() => { load(); tick(n => n + 1); }, 30000);
    return () => clearInterval(t);
  }, []);

  const replaceItem = o => setItems(list => (list || []).map(x => (x.group_id === o.group_id ? o : x)));

  const toggle = c => {
    if (c.enabled && !confirm(`Отключить «${c.title || c.group_id}»? Бот остановит сообщество в течение минуты, рассылки ему приходить не будут. Ключ сохранится, включить можно в любой момент.`)) return;
    busy(async () => {
      replaceItem(await chat(`/channels/vk/${c.group_id}`, { method: 'PATCH', json: { enabled: !c.enabled } }));
      toast(c.enabled ? 'Сообщество отключено' : 'Сообщество включено');
    });
  };

  const onSaved = o => {
    setItems(list => {
      const l = list || [];
      return l.some(x => x.group_id === o.group_id) ? l.map(x => (x.group_id === o.group_id ? o : x)) : [...l, o];
    });
    setDlg(null);
    toast('Готово: бот подхватит сообщество в течение минуты');
  };

  const stat = { ok: 0, err: 0, off: 0 };
  (items || []).forEach(c => {
    const s = statusOf(c).cls;
    if (s === 'off') stat.off++; else if (s === 'err') stat.err++; else if (s === 'ok') stat.ok++;
  });

  return (
    <div>
      <div className="toolbar">
        <h2 style={{ margin: 0 }}>Сообщества ВК</h2>
        <span className="grow" />
        <button className="primary" onClick={() => setDlg({})}>＋ Подключить сообщество</button>
      </div>
      {error && <div className="hint err">{error}</div>}
      {!items && !error && <div className="muted">Загрузка…</div>}
      {items && (
        <>
          <div className="cm-sum">
            <div className="card"><b>{stat.ok}</b><span className="muted small">работают</span></div>
            <div className="card"><b style={{ color: stat.err ? 'var(--danger)' : undefined }}>{stat.err}</b><span className="muted small">с ошибкой</span></div>
            <div className="card"><b style={{ color: 'var(--muted)' }}>{stat.off}</b><span className="muted small">отключено</span></div>
          </div>
          {!items.length ? (
            <div className="muted">Сообществ пока нет. Нажмите «Подключить сообщество».</div>
          ) : (
            <div className="cm-scroll">
              <table className="cm-table">
                <thead><tr><th>Сообщество</th><th>Ключ</th><th>Статус</th><th>На связи</th><th /></tr></thead>
                <tbody>
                  {items.map(c => {
                    const s = statusOf(c);
                    return (
                      <tr key={c.group_id} className={c.enabled ? '' : 'off-row'}>
                        <td>
                          <div className="row">
                            <Ava id={c.group_id} title={c.title} url={c.photo_url} />
                            <div>
                              <div>{c.title || 'Сообщество ' + c.group_id}</div>
                              <div className="muted small">id {c.group_id}{c.enabled && <> · <a href={`https://vk.com/club${c.group_id}`} target="_blank" rel="noreferrer">vk.com/club{c.group_id}</a></>}</div>
                            </div>
                          </div>
                        </td>
                        <td className="mono muted nw">{c.has_token ? c.token_hint : 'нет ключа'}</td>
                        <td><span className={'cm-st ' + s.cls} title={s.text}><i /><span>{s.text}</span></span></td>
                        <td className="muted small nw">{ago(c.last_seen_at)}</td>
                        <td className="nw">
                          <div className="row">
                            {(c.status === 'error' || !c.has_token) && <button className="ghost" onClick={() => setDlg({ groupId: c.group_id })}>Заменить ключ</button>}
                            {c.status === 'error' && c.enabled ? null : c.enabled
                              ? <button className="ghost danger" onClick={() => toggle(c)}>Отключить</button>
                              : <button className="ghost" onClick={() => toggle(c)}>Включить</button>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {dlg && <ConnectDialog groupId={dlg.groupId} onClose={() => setDlg(null)} onSaved={onSaved} />}
    </div>
  );
}

function ConnectDialog({ groupId, onClose, onSaved }) {
  const [token, setToken] = useState('');
  const [found, setFound] = useState(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const replace = groupId != null;

  const edit = v => { setToken(v); setFound(null); setError(''); };

  const check = async () => {
    setChecking(true); setError('');
    try {
      const f = await chat('/channels/vk/check', { method: 'POST', json: { token: token.trim() } });
      setFound(f);
      if (replace && f.group_id !== groupId) setError('Ключ от другого сообщества (id ' + f.group_id + ')');
    } catch (e) { setFound(null); setError(e.message); }
    setChecking(false);
  };

  const save = async () => {
    setSaving(true); setError('');
    try {
      const o = replace
        ? await chat(`/channels/vk/${groupId}/token`, { method: 'PUT', json: { token: token.trim() } })
        : await chat('/channels/vk', { method: 'POST', json: { token: token.trim() } });
      onSaved(o);
    } catch (e) { setError(e.message); setSaving(false); }
  };

  const wrongGroup = replace && found && found.group_id !== groupId;
  const already = !replace && found?.connected;

  return (
    <Modal onClose={onClose}>
      <div className="stack">
        <h2>{replace ? `Заменить ключ сообщества ${groupId}` : 'Подключить сообщество ВК'}</h2>
        <div className="small muted">
          Ключ сообщества: Управление → Работа с API → Создать ключ. Права: сообщения, фотографии, документы, управление.
          Включите Long Poll API (событие «Входящее сообщение») и сообщения сообщества.
        </div>
        <input type="password" autoComplete="off" style={{ width: '100%' }} className="mono" placeholder="vk1.a.…" value={token}
          onChange={e => edit(e.target.value)} onKeyDown={e => e.key === 'Enter' && token.trim() && !found && check()} />
        {error && <div className="hint err">{error}</div>}
        {found && (
          <div className="cm-found">
            <Ava id={found.group_id} title={found.title} url={found.photo_url} />
            <div className="grow">
              <div>{found.title}</div>
              <div className="muted small">id {found.group_id} · Long Poll {found.long_poll ? 'включён' : 'выключен'}</div>
            </div>
            {already ? <span className="badge warn">уже подключено</span> : <span className="badge ok">✓ проверено</span>}
          </div>
        )}
        {found && !found.long_poll && <div className="hint">Long Poll выключен — это не помеха: бот включит его сам при запуске.</div>}
        <div className="row">
          <span className="grow" />
          <button onClick={onClose}>Отмена</button>
          {!found || wrongGroup
            ? <button className="primary" disabled={!token.trim() || checking} onClick={check}>{checking ? 'Проверяю…' : 'Проверить'}</button>
            : <button className="primary" disabled={saving || already && !replace} onClick={save}>{saving ? 'Сохраняю…' : replace ? 'Заменить ключ' : 'Подключить'}</button>}
        </div>
      </div>
    </Modal>
  );
}
