import { useCallback, useEffect, useRef, useState } from 'react';
import { chat } from '../chat.js';
import { MAX_UPLOAD } from '../lib.js';
import { useUi } from '../ui.jsx';

export const BROADCAST_PLATFORMS = [
  { id: 'tg', label: 'Telegram' },
  { id: 'vk', label: 'ВКонтакте' },
  { id: 'web', label: 'Сайт' },
];
const EVENTS = [
  { id: 'first_seen', label: 'Человек впервые написал боту', hint: 'Приветственная цепочка: через час, через день после первого /start.' },
  { id: 'last_seen', label: 'Человек давно не заходил', hint: 'Отсчёт от последнего сообщения человека боту.' },
  { id: 'dialog_ended', label: 'Закончился диалог', hint: 'Отсчёт от конца последнего анонимного диалога.' },
  { id: 'premium_ended', label: 'Закончился премиум', hint: 'Отсчёт от даты окончания премиума.' },
];
const UNITS = [{ id: 1, label: 'минут' }, { id: 60, label: 'часов' }, { id: 1440, label: 'дней' }];
const STATUS = {
  scheduled: { label: 'Запланирована', cls: 'plan' },
  sending: { label: 'Отправляется', cls: 'run' },
  done: { label: 'Отправлена', cls: 'ok' },
  active: { label: 'Работает', cls: 'run' },
  paused: { label: 'На паузе', cls: 'pause' },
  cancelled: { label: 'Отменена', cls: 'off' },
};
const evLabel = id => EVENTS.find(e => e.id === id)?.label || id;
const fmt = iso => (iso ? new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const pad = n => String(n).padStart(2, '0');
const toLocalInput = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

function delayText(min) {
  if (min === 0) return 'сразу';
  if (min % 1440 === 0) return `через ${min / 1440} дн.`;
  if (min % 60 === 0) return `через ${min / 60} ч`;
  return `через ${min} мин`;
}
function splitDelay(min) {
  const unit = min && min % 1440 === 0 ? 1440 : min && min % 60 === 0 ? 60 : 1;
  return { amount: (min || 0) / unit, unit };
}
const whenText = b => (b.kind === 'at'
  ? (b.status === 'done' ? `ушла ${fmt(b.finished_at || b.send_at)}` : fmt(b.send_at))
  : `${delayText(b.delay_minutes)} · ${evLabel(b.event).toLowerCase()}${b.repeat ? ' · каждый раз' : ''}`);

/* ===================== раздел ===================== */

export default function Broadcasts({ platform, botName }) {
  const { toast, busy } = useUi();
  const [status, setStatus] = useState(null);
  const [list, setList] = useState(null);
  const [sel, setSel] = useState(null); // id | 'new'
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const st = await chat('/_status');
    setStatus(st);
    if (!st.configured || !st.admin) return;
    setList(await chat('/broadcasts'));
  }, []);

  useEffect(() => { load().catch(e => setError(e.message)); }, [load]);

  if (error) return <div style={{ padding: 16 }}><div className="hint err">{error}</div></div>;
  if (!status) return <div className="muted" style={{ padding: 16 }}>Загрузка рассылок…</div>;
  if (!status.configured) return <NotConfigured />;
  if (!status.admin) {
    return (
      <div className="no-content">
        <div className="big-ico">🔒</div>
        <h2>Нет доступа к рассылкам</h2>
        <p className="muted">Рассылка уходит всем людям бота, поэтому раздел открыт только логинам GitHub из переменной <span className="mono">CRM_ADMINS</span> в Vercel. Добавьте туда <b className="mono">{status.login}</b>.</p>
      </div>
    );
  }
  if (!list) return <div className="muted" style={{ padding: 16 }}>Загрузка рассылок…</div>;

  const current = sel === 'new' ? null : list.find(b => b.id === sel);
  const upsert = b => setList(l => (l.some(x => x.id === b.id) ? l.map(x => (x.id === b.id ? b : x)) : [b, ...l]));

  return (
    <div className="bc">
      <div className="bc-list">
        <div className="bc-list-head">
          <b className="grow">Рассылки</b>
          <button className="ghost" title="Обновить" onClick={() => busy(load)}>⟳</button>
          <button className="primary" onClick={() => setSel('new')}>＋ Новая</button>
        </div>
        {list.length === 0 && <div className="muted small" style={{ padding: 12 }}>Рассылок пока нет. Создайте первую: разовую по времени или цепочку после события.</div>}
        {list.map(b => (
          <div key={b.id} className={'bc-item' + (sel === b.id ? ' on' : '')} onClick={() => setSel(b.id)}>
            <div className="row" style={{ gap: 6 }}>
              <span className="grow bc-title">{b.title || b.text.split('\n')[0]}</span>
              <span className={'st st-' + STATUS[b.status].cls}>{STATUS[b.status].label}</span>
            </div>
            <div className="muted small">
              {b.kind === 'at' ? '🕑 ' : '⚡ '}{whenText(b)}
            </div>
            <div className="muted small">
              {b.platforms.map(p => BROADCAST_PLATFORMS.find(x => x.id === p)?.label || p).join(', ')}
              {b.sent_count > 0 && <> · отправлено {b.sent_count}</>}
            </div>
          </div>
        ))}
      </div>
      <div className="bc-main">
        {sel === 'new' || current ? (
          <Editor key={sel} b={current} platform={platform} botName={botName} toast={toast} busy={busy}
            onSaved={b => { upsert(b); setSel(b.id); }}
            onDeleted={id => { setList(l => l.filter(x => x.id !== id)); setSel(null); }} />
        ) : (
          <div className="empty">
            <div className="big-ico">📣</div>
            Выберите рассылку слева или создайте новую.
            <div className="small" style={{ maxWidth: 460, margin: '10px auto 0' }}>
              <b>По времени</b> — одно сообщение всем людям бота сейчас или в указанный момент.<br />
              <b>После события</b> — сообщение каждому человеку через паузу после события: первого входа, конца диалога, окончания премиума.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function NotConfigured() {
  return (
    <div className="no-content">
      <div className="big-ico">📣</div>
      <h2>Рассылки не подключены</h2>
      <p className="muted">Рассылки отправляет Chat API. Чтобы CRM могла ими управлять, задайте в Vercel (Settings → Environment Variables) и передеплойте CRM:</p>
      <table className="bc-env">
        <tbody>
          <tr><td className="mono">CHAT_API_URL</td><td>адрес Chat API, например https://api.chatwithyou.site</td></tr>
          <tr><td className="mono">CHAT_API_CRM_TOKEN</td><td>тот же секрет, что CHAT_API_CRM_TOKEN у Chat API (ENV_FILE)</td></tr>
          <tr><td className="mono">CRM_ADMINS</td><td>логины GitHub через запятую, кому можно делать рассылки</td></tr>
          <tr><td className="mono">CF_ACCESS_CLIENT_ID<br />CF_ACCESS_CLIENT_SECRET</td><td>если Chat API закрыт Cloudflare Access</td></tr>
        </tbody>
      </table>
    </div>
  );
}

/* ===================== редактор ===================== */

function Editor({ b, platform, botName, toast, busy, onSaved, onDeleted }) {
  const isNew = !b;
  const locked = b && ['sending', 'done', 'cancelled'].includes(b.status);
  const d0 = splitDelay(b?.delay_minutes ?? 60);
  const [title, setTitle] = useState(b?.title || '');
  const [text, setText] = useState(b?.text || '');
  const [platforms, setPlatforms] = useState(b?.platforms || [platform || 'tg']);
  const [kind, setKind] = useState(b?.kind || 'at');
  const [when, setWhen] = useState(b?.kind === 'at' && b.status === 'scheduled' && new Date(b.send_at) > new Date() ? 'later' : isNew ? 'now' : 'later');
  const [sendAt, setSendAt] = useState(toLocalInput(b?.send_at ? new Date(b.send_at) : new Date(Date.now() + 3600e3)));
  const [event, setEvent] = useState(b?.event || 'first_seen');
  const [amount, setAmount] = useState(d0.amount);
  const [unit, setUnit] = useState(d0.unit);
  const [repeat, setRepeat] = useState(!!b?.repeat);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [audience, setAudience] = useState(null);
  const pickRef = useRef();

  useEffect(() => {
    if (kind !== 'at' || !platforms.length) { setAudience(null); return; }
    const q = platforms.map(p => 'platforms=' + p).join('&');
    chat('/broadcasts/audience?' + q).then(r => setAudience(r.recipients)).catch(() => setAudience(null));
  }, [kind, platforms.join()]);

  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const hasImage = !!file || (!!b?.has_image);
  const capLimit = hasImage && platforms.includes('tg') ? 1024 : 4096;
  const delay = Math.max(0, Math.round(Number(amount) || 0) * unit);
  const ev = EVENTS.find(e => e.id === event);
  const problems = [];
  if (!text.trim()) problems.push('Нужен текст');
  if (text.length > capLimit) problems.push(`Текст длиннее ${capLimit} символов${capLimit === 1024 ? ' (подпись к фото в Telegram)' : ''}`);
  if (!platforms.length) problems.push('Выберите, кому отправить');
  if (kind === 'at' && when === 'later' && !(new Date(sendAt) > new Date())) problems.push('Время отправки уже прошло');

  const togglePlatform = p => setPlatforms(ps => (ps.includes(p) ? ps.filter(x => x !== p) : [...ps, p]));

  const uploadImage = async id => {
    if (!file) return null;
    const form = new FormData();
    form.append('file', file);
    return chat(`/broadcasts/${id}/image`, { method: 'PUT', form });
  };

  const save = () => busy(async () => {
    if (problems.length) return toast(problems[0], { err: true });
    const at = kind === 'at' ? (when === 'now' ? new Date() : new Date(sendAt)) : null;
    if (kind === 'at' && when === 'now' && isNew) {
      const who = audience != null ? `${audience} получател${audience % 10 === 1 && audience % 100 !== 11 ? 'ю' : 'ям'}` : 'всем людям бота';
      if (!confirm(`Отправить рассылку сейчас — ${who}? Отменить уже отправленное нельзя.`)) return;
    }
    let saved;
    if (isNew) {
      const body = { title, text, platforms, kind };
      if (kind === 'at') {
        // Сначала создаём с запасом по времени, чтобы фото успело прикрепиться до отправки.
        body.send_at = (file && when === 'now' ? new Date(Date.now() + 120e3) : at).toISOString();
      } else Object.assign(body, { event, delay_minutes: delay, repeat });
      saved = await chat('/broadcasts', { method: 'POST', json: body });
      if (file) {
        saved = await uploadImage(saved.id);
        if (kind === 'at' && when === 'now') saved = await chat(`/broadcasts/${saved.id}`, { method: 'PATCH', json: { send_at: new Date().toISOString() } });
      }
      toast(kind === 'at' ? (when === 'now' ? 'Рассылка поставлена в очередь, уйдёт в течение минуты' : 'Рассылка запланирована') : 'Рассылка запущена: будет уходить после события');
    } else {
      const patch = { title, text, platforms };
      if (kind === 'at') patch.send_at = at.toISOString();
      else Object.assign(patch, { delay_minutes: delay, repeat });
      saved = await chat(`/broadcasts/${b.id}`, { method: 'PATCH', json: patch });
      if (file) saved = await uploadImage(b.id);
      toast('Сохранено');
    }
    setFile(null);
    onSaved(saved);
  });

  const setStatus = (s, msg) => busy(async () => {
    if (msg && !confirm(msg)) return;
    onSaved(await chat(`/broadcasts/${b.id}`, { method: 'PATCH', json: { status: s } }));
  });
  const removeImage = () => busy(async () => onSaved(await chat(`/broadcasts/${b.id}/image`, { method: 'DELETE' })));
  const remove = () => busy(async () => {
    if (!confirm('Удалить рассылку вместе с журналом отправки?')) return;
    await chat(`/broadcasts/${b.id}`, { method: 'DELETE' });
    onDeleted(b.id);
  });

  return (
    <div className="bc-editor">
      <div className="bc-form">
        <div className="row">
          <h2 className="grow" style={{ margin: 0 }}>{isNew ? 'Новая рассылка' : (b.title || 'Рассылка')}</h2>
          {b && <span className={'st st-' + STATUS[b.status].cls}>{STATUS[b.status].label}</span>}
        </div>
        {b && (
          <div className="muted small">
            Создана {fmt(b.created_at)}{b.sent_count > 0 && <> · поставлено в очередь <b>{b.sent_count}</b></>}
            {b.kind === 'event' && b.active_since && <> · учитывает события с {fmt(b.active_since)}</>}
          </div>
        )}
        {locked && <div className="hint small">{b.status === 'sending' ? 'Рассылка отправляется. Её можно только отменить: кто уже получил, тех это не касается.' : 'Рассылка завершена, менять её нельзя. Чтобы отправить похожую, создайте новую.'}</div>}

        <label className="fld"><span>Название (видно только в CRM)</span>
          <input value={title} disabled={locked} placeholder="Например: Акция на премиум, ноябрь" onChange={e => setTitle(e.target.value)} />
        </label>

        <label className="fld">
          <span>Текст сообщения <span className={'counter' + (text.length > capLimit ? ' over' : '')}>{text.length} / {capLimit}</span></span>
          <textarea rows={7} value={text} disabled={locked} onChange={e => setText(e.target.value)} placeholder="Что получат люди" />
        </label>

        <div className="fld"><span>Фото</span>
          <input type="file" hidden ref={pickRef} accept="image/png,image/jpeg,image/webp" onChange={e => {
            const f = e.target.files[0];
            if (f && f.size > MAX_UPLOAD) return toast('Файл больше 3 МБ — сожмите его', { err: true });
            setFile(f || null);
          }} />
          <div className="row">
            {preview ? <img className="bc-thumb" src={preview} alt="" /> : b?.has_image ? <span className="tag">фото прикреплено</span> : <span className="muted small">Без фото</span>}
            {!locked && <button onClick={() => { pickRef.current.value = ''; pickRef.current.click(); }}>{hasImage ? 'Заменить' : 'Добавить'}</button>}
            {!locked && file && <button className="ghost" onClick={() => setFile(null)}>Не загружать</button>}
            {!locked && !file && b?.has_image && <button className="danger" onClick={removeImage}>Убрать</button>}
          </div>
        </div>

        <div className="fld"><span>Кому</span>
          <div className="row">
            {BROADCAST_PLATFORMS.map(p => (
              <label key={p.id} className="row chk">
                <input type="checkbox" disabled={locked} checked={platforms.includes(p.id)} onChange={() => togglePlatform(p.id)} />
                {p.label}{p.id === platform && <span className="muted small">(этот бот)</span>}
              </label>
            ))}
          </div>
          <small className="muted">Всем людям, кто уже писал боту на выбранных площадках. Кто писал в два сообщества ВК, получит в оба.</small>
        </div>

        <div className="fld"><span>Когда</span>
          {isNew && (
            <div className="seg">
              <button className={kind === 'at' ? 'on' : ''} onClick={() => setKind('at')}>🕑 По времени</button>
              <button className={kind === 'event' ? 'on' : ''} onClick={() => setKind('event')}>⚡ После события</button>
            </div>
          )}
          {kind === 'at' ? (
            <div className="bc-when">
              {(isNew || b.status === 'scheduled') && (
                <>
                  <label className="row chk"><input type="radio" checked={when === 'now'} disabled={locked} onChange={() => setWhen('now')} /> Сейчас</label>
                  <label className="row chk"><input type="radio" checked={when === 'later'} disabled={locked} onChange={() => setWhen('later')} /> В указанное время
                    <input type="datetime-local" value={sendAt} disabled={locked || when !== 'later'} onChange={e => setSendAt(e.target.value)} />
                  </label>
                  <small className="muted">Время вашего устройства ({Intl.DateTimeFormat().resolvedOptions().timeZone}).</small>
                </>
              )}
              {locked && <div className="small">{whenText(b)}</div>}
              {audience != null && !locked && <div className="small">Получат сейчас: <b>{audience}</b></div>}
            </div>
          ) : (
            <div className="bc-when">
              <label className="row">
                <span className="muted">Событие</span>
                <select className="grow" value={event} disabled={!isNew} onChange={e => setEvent(e.target.value)}>
                  {EVENTS.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
                </select>
              </label>
              <small className="muted">{ev?.hint}</small>
              <label className="row">
                <span className="muted">Пауза</span>
                <input type="number" min="0" style={{ width: 90 }} value={amount} disabled={locked} onChange={e => setAmount(e.target.value)} />
                <select value={unit} disabled={locked} onChange={e => setUnit(Number(e.target.value))}>
                  {UNITS.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}
                </select>
                <span className="muted small">→ {delayText(delay)} после события</span>
              </label>
              <label className="row chk">
                <input type="checkbox" checked={repeat} disabled={locked} onChange={e => setRepeat(e.target.checked)} />
                Отправлять после каждого нового события (иначе человеку один раз)
              </label>
              <small className="muted">
                Учитываются только события после запуска рассылки. Ночью (23:00–10:00 МСК) рассылки после события
                ждут утра. Кто в этот момент ищет собеседника или в диалоге, получит позже.
              </small>
            </div>
          )}
        </div>

        {problems.length > 0 && !locked && <div className="hint err small">{problems.join('. ')}</div>}

        <div className="row bc-actions">
          {!locked && (
            <button className="primary" disabled={problems.length > 0} onClick={save}>
              {isNew ? (kind === 'at' ? (when === 'now' ? 'Отправить сейчас' : 'Запланировать') : 'Запустить') : 'Сохранить изменения'}
            </button>
          )}
          {b?.kind === 'event' && b.status === 'active' && <button onClick={() => setStatus('paused')}>⏸ Пауза</button>}
          {b?.kind === 'event' && b.status === 'paused' && <button onClick={() => setStatus('active')}>▶ Возобновить</button>}
          {b && ['scheduled', 'sending', 'active', 'paused'].includes(b.status) && (
            <button className="danger" onClick={() => setStatus('cancelled', 'Отменить рассылку? Вернуть её будет нельзя.')}>Отменить рассылку</button>
          )}
          {b && b.status !== 'sending' && <button className="ghost danger" onClick={remove}>Удалить</button>}
        </div>
      </div>

      <div className="bc-preview">
        <div className="muted small" style={{ marginBottom: 6 }}>Так увидит человек{botName ? ` в «${botName}»` : ''}</div>
        <div className="bubble-wrap">
          <div className="bubble">
            {(preview || b?.has_image) && <div className="bubble-img">{preview ? <img src={preview} alt="" /> : <div className="muted small" style={{ padding: 30, textAlign: 'center' }}>фото</div>}</div>}
            <div className="bubble-text">{text || <span className="muted">Текст сообщения</span>}</div>
            <span className="bubble-time">{new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
