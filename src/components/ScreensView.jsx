import { useEffect, useMemo, useRef, useState } from 'react';
import { blobB64 } from '../github.js';
import { MAX_UPLOAD, MIME, ext, fileToB64 } from '../lib.js';
import {
  COLORS, cellLabel, cellRef, imagePath, isContentDoc, labelLimit, lostPlaceholders, moveCell,
  placeholdersOf, screensUsing, setCellColor, setCellLabel, setButton, setListItem, setText,
} from '../content.js';
import { Modal, useUi } from '../ui.jsx';

export default function ScreensView({ ws, path, bot, onLoaded }) {
  const { toast } = useUi();
  const [doc, setDoc] = useState(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('screens');
  const [editing, setEditing] = useState(null); // {kb, r, c}
  const [q, setQ] = useState('');

  useEffect(() => {
    let alive = true;
    setDoc(null); setError('');
    ws.getDoc(path).then(d => { if (alive) { setDoc(d); onLoaded?.(); } }).catch(e => alive && setError(e.message));
    return () => { alive = false; };
  }, [path, ws.docVer]);

  if (error) return <div className="hint err">{error}</div>;
  if (!doc) return <div className="muted">Загрузка экранов…</div>;
  if (!isContentDoc(doc)) {
    return <div className="hint err">Файл {path} не в формате bot-crm/1{doc.parseError ? `: ${doc.parseError}` : ''}. Откройте его во вкладке «Тексты», чтобы исправить.</div>;
  }

  const data = doc.data;
  const platform = data.platform === 'vk' || bot?.platform === 'vk' ? 'vk' : 'telegram';
  const commit = () => ws.commitDoc(doc);
  const ctx = { ws, doc, data, platform, path, commit, toast, openButton: (kb, r, c) => setEditing({ kb, r, c }) };

  const ql = q.trim().toLowerCase();
  const screens = (data.screens || []).filter(s => !ql
    || [s.title, s.when, data.texts?.[s.text]].some(v => String(v || '').toLowerCase().includes(ql))
    || data.keyboards?.[s.keyboard]?.rows?.some(row => row.some(c => cellLabel(data, c).toLowerCase().includes(ql))));

  return (
    <div className="screens">
      <div className="toolbar">
        <div className="seg">
          <button className={mode === 'screens' ? 'on' : ''} onClick={() => setMode('screens')}>📱 Экраны <span className="muted">{data.screens?.length || 0}</span></button>
          <button className={mode === 'all' ? 'on' : ''} onClick={() => setMode('all')}>☰ Все тексты и кнопки</button>
        </div>
        <input className="grow" placeholder="Поиск по текстам и кнопкам…" value={q} onChange={e => setQ(e.target.value)} />
      </div>
      <div className="muted small" style={{ margin: '-4px 0 14px' }}>
        Нажмите на текст, кнопку или картинку, чтобы изменить. Правки попадут в <span className="mono">{path}</span> — нажмите «Сохранить», чтобы отправить их в GitHub. После сохранения бота нужно перезапустить (передеплоить).
      </div>

      {mode === 'screens' ? (
        <div className="screen-grid">
          {screens.map(s => <ScreenCard key={s.id} s={s} ctx={ctx} />)}
          {!screens.length && <div className="empty">Ничего не найдено</div>}
        </div>
      ) : (
        <AllContent ctx={ctx} q={ql} />
      )}

      {editing && <ButtonDialog ctx={ctx} {...editing} onClose={() => setEditing(null)} onMove={pos => setEditing(e => ({ ...e, ...pos }))} />}
    </div>
  );
}

/* ================= экран ================= */

function ScreenCard({ s, ctx }) {
  const { data, platform } = ctx;
  const kb = s.keyboard ? data.keyboards?.[s.keyboard] : null;
  const botName = platform === 'vk' ? 'Сообщество' : 'Бот';
  return (
    <div className="screen-card" id={`screen-${s.id}`}>
      <div className="screen-head">
        <b>{s.title}</b>
        {s.when && <div className="muted small">{s.when}</div>}
      </div>
      <div className={`phone ${platform}`}>
        <div className="phone-top">
          <span className="phone-ava">{platform === 'vk' ? 'VK' : '✈'}</span>
          <span><b>{botName}</b><span className="phone-sub">{platform === 'vk' ? 'онлайн' : 'бот'}</span></span>
        </div>
        <div className="phone-chat">
          <div className="bubble-wrap">
            <div className="bubble">
              {s.image && <ImageSlot ctx={ctx} name={s.image} />}
              <EditableText ctx={ctx} textKey={s.text} />
              <span className="bubble-time">12:00</span>
            </div>
            {kb?.type === 'inline' && <Keyboard ctx={ctx} name={s.keyboard} kb={kb} inline />}
          </div>
        </div>
        {kb?.type === 'reply' && <Keyboard ctx={ctx} name={s.keyboard} kb={kb} />}
        {!kb && <div className="phone-input">Сообщение…</div>}
      </div>
    </div>
  );
}

function Keyboard({ ctx, name, kb, inline }) {
  const { data } = ctx;
  return (
    <div className={inline ? 'kb-inline' : 'kb-reply'} title={kb.title || name}>
      {kb.rows.map((row, r) => (
        <div className="kb-row" key={r}>
          {row.map((cell, c) => (
            <button key={c} className={`kb-btn c-${cell.color || 'none'}`} onClick={() => ctx.openButton(name, r, c)} title="Изменить кнопку">
              {cellLabel(data, cell)}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ================= текст в сообщении ================= */

function renderWithPlaceholders(text) {
  const parts = String(text).split(/(\{[a-z_]+\})/gi);
  return parts.map((p, i) => (/^\{[a-z_]+\}$/i.test(p) ? <span key={i} className="ph" title="Подставляется ботом">{p}</span> : p));
}

function EditableText({ ctx, textKey }) {
  const { data, commit, toast } = ctx;
  const value = data.texts?.[textKey];
  const [edit, setEdit] = useState(null);
  const ref = useRef();

  useEffect(() => {
    if (edit !== null && ref.current) {
      ref.current.style.height = 'auto';
      ref.current.style.height = ref.current.scrollHeight + 'px';
    }
  }, [edit]);

  if (value === undefined) return <div className="bubble-text missing-text">⚠ Нет текста {textKey}</div>;

  const save = () => {
    if (edit === null) return;
    const lost = lostPlaceholders(value, edit);
    if (lost.length) {
      toast(`Не удаляйте ${lost.join(', ')} — бот подставляет туда значение`, { err: true, ms: 6000 });
      return;
    }
    if (!edit.trim()) { toast('Текст не может быть пустым', { err: true }); return; }
    if (edit !== value) { setText(data, textKey, edit); commit(); }
    setEdit(null);
  };

  if (edit !== null) {
    return (
      <textarea
        ref={ref}
        className="bubble-edit"
        value={edit}
        autoFocus
        onChange={e => { setEdit(e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
        onBlur={save}
        onKeyDown={e => {
          if (e.key === 'Escape') setEdit(null);
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save();
        }}
      />
    );
  }
  return (
    <div className="bubble-text editable" onClick={() => setEdit(value)} title="Нажмите, чтобы изменить текст">
      {renderWithPlaceholders(value)}
    </div>
  );
}

/* ================= картинка ================= */

function useImageSrc(ws, path) {
  const [src, setSrc] = useState('');
  const d = ws.dirty.get(path);
  const sha = ws.tree.get(path)?.sha;
  useEffect(() => {
    const mime = MIME[ext(path || '')] || 'image/png';
    if (d?.type === 'binary') { setSrc(`data:${d.mime || mime};base64,${d.base64}`); return; }
    if (!sha) { setSrc(''); return; }
    let alive = true;
    blobB64(ws.full, sha).then(b => alive && setSrc(`data:${mime};base64,${b}`)).catch(() => {});
    return () => { alive = false; };
  }, [path, d, sha]);
  return src;
}

function ImageSlot({ ctx, name }) {
  const { ws, data, path, toast } = ctx;
  const file = imagePath(path, data, name);
  const src = useImageSrc(ws, file);
  const input = useRef();
  const replace = async f => {
    if (!f) return;
    if (f.size > MAX_UPLOAD) return toast(`${f.name}: файл больше 3 МБ — сожмите его`, { err: true });
    if (ext(f.name) !== ext(file) && !confirm(`Новый файл в формате .${ext(f.name)}, а бот ждёт .${ext(file)}. Сохранить под старым именем ${file.split('/').pop()}? Telegram и ВК определят формат сами.`)) return;
    ws.setChange(file, { type: 'binary', base64: await fileToB64(f), mime: f.type });
    toast('Картинка заменена. Не забудьте сохранить.');
  };
  return (
    <div className="bubble-img" onClick={() => input.current.click()} title="Заменить картинку">
      <input type="file" hidden ref={input} accept="image/*" onChange={e => replace(e.target.files[0])} />
      {src ? <img src={src} alt="" /> : <div className="img-missing">{file ? 'Загрузка…' : `⚠ Нет картинки ${name}`}</div>}
      <span className="img-overlay">🖼 Заменить {ws.dirty.has(file) && '· изменена'}</span>
    </div>
  );
}

/* ================= диалог кнопки ================= */

function ButtonDialog({ ctx, kb, r, c, onClose, onMove }) {
  const { data, platform, commit, toast } = ctx;
  const cell = data.keyboards[kb]?.rows[r]?.[c];
  const [label, setLabel] = useState(cell ? cellLabel(data, cell) : '');
  const [color, setColor] = useState(cell?.color || null);
  if (!cell) return null;
  const limit = labelLimit(platform, cell);
  const used = screensUsing(data, cellRef(cell));
  const kbTitle = data.keyboards[kb].title || kb;
  const aliases = cell.button ? data.button_aliases?.[cell.button] || [] : [];
  const colors = COLORS[platform];
  const rows = data.keyboards[kb].rows;

  const save = () => {
    const v = label.trim();
    if (!v) return toast('Подпись не может быть пустой', { err: true });
    if (v.length > limit) return toast(`Слишком длинно: максимум ${limit} символов`, { err: true });
    if (v !== cellLabel(data, cell)) setCellLabel(data, cell, v);
    if ((cell.color || null) !== color) setCellColor(data, kb, r, c, color);
    commit();
    onClose();
  };
  const move = dir => {
    moveCell(data, kb, r, c, dir);
    commit();
    // найти новую позицию ячейки
    const nrows = data.keyboards[kb].rows;
    for (let i = 0; i < nrows.length; i++) {
      const j = nrows[i].indexOf(cell);
      if (j >= 0) { onMove({ r: i, c: j }); return; }
    }
  };

  return (
    <Modal onClose={onClose}>
      <h2>Кнопка</h2>
      <div className="stack">
        <label>Подпись<br />
          <input autoFocus className="w100" value={label} maxLength={limit + 20} onChange={e => setLabel(e.target.value)} onKeyDown={e => e.key === 'Enter' && save()} />
          <span className={'small ' + (label.length > limit ? 'err-text' : 'muted')}>{label.length}/{limit}</span>
        </label>
        <div>
          <div style={{ marginBottom: 6 }}>Цвет</div>
          <div className="chips">
            {colors.map(o => (
              <button key={String(o.id)} className={`chip color-chip c-${o.id || 'none'}` + ((color || (platform === 'vk' ? 'secondary' : null)) === (o.id || (platform === 'vk' ? 'secondary' : null)) ? ' on' : '')} onClick={() => setColor(o.id)}>{o.label}</button>
            ))}
          </div>
        </div>
        <div>
          <div style={{ marginBottom: 6 }}>Положение в клавиатуре «{kbTitle}»</div>
          <div className="row">
            <button onClick={() => move('up')} title="Выше">↑</button>
            <button onClick={() => move('left')} disabled={c === 0} title="Левее">←</button>
            <button onClick={() => move('right')} disabled={c === rows[r].length - 1} title="Правее">→</button>
            <button onClick={() => move('down')} title="Ниже">↓</button>
            <span className="muted small">ряд {r + 1} из {rows.length}, место {c + 1}</span>
          </div>
        </div>
        <div className="muted small">
          {cell.list
            ? <>Это пункт списка «{data.lists[cell.list]?.title || cell.list}» — подпись изменится везде, где он показывается.</>
            : <>Кнопка {cell.button}. </>}
          {used.length > 0 && <> Встречается на экранах: {used.map(s => s.title).join(', ')}.</>}
          {aliases.length > 0 && <div style={{ marginTop: 4 }}>Прежние подписи (бот их тоже понимает): {aliases.map(a => `«${a}»`).join(', ')}</div>}
          {cell.button && <div style={{ marginTop: 4 }}>При переименовании старая подпись сохранится, чтобы кнопка работала у тех, кто видит старую клавиатуру.</div>}
        </div>
        <div className="row"><span className="grow" /><button onClick={onClose}>Отмена</button><button className="primary" onClick={save}>Готово</button></div>
      </div>
    </Modal>
  );
}

/* ================= все тексты и кнопки ================= */

function AllContent({ ctx, q }) {
  const { data, platform } = ctx;
  const match = (...vals) => !q || vals.some(v => String(v || '').toLowerCase().includes(q));
  const screenTitles = useMemo(() => {
    const m = {};
    for (const s of data.screens || []) (m[s.text] = m[s.text] || []).push(s.title);
    return m;
  }, [data]);

  const texts = Object.entries(data.texts || {}).filter(([k, v]) => match(k, v, ...(screenTitles[k] || [])));
  const buttons = Object.entries(data.buttons || {}).filter(([k, v]) => match(k, v));
  const lists = Object.entries(data.lists || {});

  return (
    <div className="all-content">
      <section>
        <h3>Тексты сообщений <span className="muted">{texts.length}</span></h3>
        {texts.map(([k, v]) => <TextRow key={k} ctx={ctx} k={k} v={v} where={screenTitles[k]} />)}
      </section>
      <section>
        <h3>Кнопки <span className="muted">{buttons.length}</span></h3>
        <div className="btn-list">
          {buttons.map(([k, v]) => <ButtonRow key={k} ctx={ctx} k={k} v={v} limit={labelLimit(platform, { button: k })} />)}
        </div>
      </section>
      {lists.map(([name, l]) => {
        const its = Object.entries(l.items || {}).filter(([k, v]) => match(k, v, l.title));
        if (!its.length) return null;
        return (
          <section key={name}>
            <h3>{l.title || name} <span className="muted mono small">{name}</span></h3>
            <div className="btn-list">
              {its.map(([k, v]) => <ListRow key={k} ctx={ctx} name={name} k={k} v={v} limit={labelLimit(platform, { list: name })} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function TextRow({ ctx, k, v, where }) {
  const { data, commit } = ctx;
  const [orig] = useState(v);
  const lost = lostPlaceholders(orig, v);
  const ph = placeholdersOf(orig);
  return (
    <div className="text-row">
      <div className="text-row-head">
        <span className="mono small">{k}</span>
        {where && <span className="muted small"> · {where.join(', ')}</span>}
        {ph.length > 0 && <span className="muted small"> · переменные: {ph.join(' ')}</span>}
      </div>
      <textarea className={'w100' + (lost.length ? ' invalid' : '')} rows={Math.min(10, Math.max(2, v.split('\n').length))} value={v}
        onChange={e => { setText(data, k, e.target.value); commit(); }} />
      {lost.length > 0 && <div className="err-text small">Верните {lost.join(', ')} — бот подставляет туда значение</div>}
    </div>
  );
}

function ButtonRow({ ctx, k, v, limit }) {
  const { data, commit } = ctx;
  const [val, setVal] = useState(v);
  useEffect(() => setVal(v), [v]);
  const apply = () => {
    const t = val.trim();
    if (!t || t === v) { setVal(v); return; }
    setButton(data, k, t.slice(0, limit));
    commit();
  };
  return (
    <label className="btn-row">
      <span className="mono small muted">{k}</span>
      <input className={val.length > limit ? 'invalid' : ''} value={val} onChange={e => setVal(e.target.value)} onBlur={apply} onKeyDown={e => e.key === 'Enter' && e.target.blur()} />
    </label>
  );
}

function ListRow({ ctx, name, k, v, limit }) {
  const { data, commit } = ctx;
  return (
    <label className="btn-row">
      <span className="mono small muted">{k}</span>
      <input className={v.length > limit ? 'invalid' : ''} value={v} onChange={e => { setListItem(data, name, k, e.target.value); commit(); }} />
    </label>
  );
}
