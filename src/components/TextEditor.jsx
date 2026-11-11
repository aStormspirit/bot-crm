import { useEffect, useMemo, useRef, useState } from 'react';
import { baseName, delPath, dirOf, ext, flatten, getPath, parseData, placeholders, serialize, setPath } from '../lib.js';
import { useUi } from '../ui.jsx';

export default function TextEditor({ ws, file, cmp, setCmp, onDeleted }) {
  const { toast } = useUi();
  const [state, setState] = useState(null);
  const [raw, setRaw] = useState(false);
  const [rawText, setRawText] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const doc = await ws.getDoc(file);
        const c = cmp ? await ws.getDoc(cmp) : null;
        if (alive) setState({ doc, cmpDoc: c && c.kind !== 'raw' ? c : null });
      } catch (e) { toast(e.message, { err: true }); }
    })();
    return () => { alive = false; };
  }, [file, cmp]);

  if (!state) return <div className="muted">Загрузка…</div>;
  const { doc, cmpDoc } = state;
  const showRaw = doc.kind === 'raw' || raw;

  const siblings = ws.filesOf('texts').filter(p => p !== doc.path && dirOf(p) === dirOf(doc.path) && ext(p) === ext(doc.path));

  const toggleRaw = () => {
    if (!raw) { setRawText(serialize(doc)); setRaw(true); return; }
    try { doc.data = parseData(doc.kind, rawText); setRaw(false); }
    catch (e) { toast('Ошибка синтаксиса: ' + e.message, { err: true }); }
  };

  const deleteFile = () => {
    if (!confirm(`Удалить ${doc.path}?`)) return;
    ws.setChange(doc.path, { type: 'delete' });
    onDeleted();
  };

  const onRawChange = v => {
    setRawText(v);
    if (doc.kind === 'raw') return ws.commitDoc(doc, v);
    try { doc.data = parseData(doc.kind, v); ws.commitDoc(doc, doc.kind === 'json' ? v : serialize(doc)); } catch { /* ждём валидный текст */ }
  };

  return (
    <div>
      <div className="toolbar">
        <h2 className="grow mono" style={{ margin: 0 }}>{doc.path} {doc.base === null && <span className="badge">новый</span>}</h2>
        {doc.kind !== 'raw' && <button onClick={toggleRaw}>{raw ? '▦ Таблица' : '⌨ Исходный код'}</button>}
        <button className="danger" onClick={deleteFile}>Удалить файл</button>
      </div>
      {doc.parseError && <div className="hint">Не удалось разобрать файл ({doc.parseError}) — открыт как текст.</div>}
      {doc.kind === 'yaml' && doc.hasComments && !raw && <div className="hint">В этом YAML есть комментарии — при редактировании в таблице они удалятся. Чтобы сохранить их, используйте «Исходный код».</div>}

      {showRaw ? (
        <textarea className="raw" spellCheck={false} value={doc.kind === 'raw' ? doc.text : rawText} onChange={e => onRawChange(e.target.value)} />
      ) : (
        <>
          {siblings.length > 0 && (
            <div className="toolbar">
              <span className="muted">Сравнить с (например, другим языком):</span>
              <select value={cmp} onChange={e => setCmp(e.target.value)}>
                <option value="">— нет —</option>
                {siblings.map(p => <option key={p} value={p}>{baseName(p)}</option>)}
              </select>
            </div>
          )}
          <KeyTable ws={ws} cols={[doc, cmpDoc].filter(Boolean)} />
        </>
      )}
    </div>
  );
}

function KeyTable({ ws, cols }) {
  const { toast } = useUi();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [showN, setShowN] = useState(300);
  const [newKey, setNewKey] = useState('');
  const timer = useRef();
  const main = cols[0], compare = cols.length > 1;

  const baseData = useMemo(() => cols.map(c => {
    try { return c.base == null ? null : parseData(c.kind, c.base); } catch { return null; }
  }), [cols.map(c => c.path).join('|')]);

  const keyMap = new Map();
  cols.forEach(c => flatten(c.data).forEach(p => { const k = JSON.stringify(p); if (!keyMap.has(k)) keyMap.set(k, p); }));
  let rows = [...keyMap.values()];
  const ql = q.toLowerCase();
  if (ql) rows = rows.filter(p => p.join('.').toLowerCase().includes(ql) || cols.some(c => String(getPath(c.data, p).value ?? '').toLowerCase().includes(ql)));
  const missing = compare ? rows.filter(p => cols.some(c => { const g = getPath(c.data, p); return !g.found || g.value === ''; })).length : 0;

  const onSearch = v => { setSearch(v); clearTimeout(timer.current); timer.current = setTimeout(() => { setQ(v); setShowN(300); }, 200); };

  const edit = (ci, p, value) => { setPath(cols[ci].data, p, value); ws.commitDoc(cols[ci]); };

  const addKey = () => {
    const k = newKey.trim();
    if (!k) return;
    const p = k.split('.').map(x => (/^\d+$/.test(x) ? Number(x) : x));
    if (getPath(main.data, p).found) return toast('Такой ключ уже есть', { err: true });
    try { setPath(main.data, p, ''); } catch { return toast('Нельзя создать ключ по этому пути', { err: true }); }
    ws.commitDoc(main);
    setNewKey(''); setSearch(k); setQ(k);
  };

  const delKey = p => {
    if (!confirm(`Удалить ключ «${p.join('.')}»${compare ? ' во всех открытых файлах' : ''}?`)) return;
    cols.forEach(c => { if (getPath(c.data, p).found) { delPath(c.data, p); ws.commitDoc(c); } });
  };

  return (
    <>
      <div className="toolbar">
        <input className="grow" placeholder="Поиск по ключам и текстам…" value={search} onChange={e => onSearch(e.target.value)} />
        <span className="muted">{rows.length} ключей{compare && <> · <span style={{ color: 'var(--warn)' }}>{missing} без перевода</span></>}</span>
      </div>
      <div className="toolbar">
        <input className="grow mono" placeholder="новый.ключ (вложенность через точку)" value={newKey} onChange={e => setNewKey(e.target.value)} onKeyDown={e => e.key === 'Enter' && addKey()} />
        <button onClick={addKey}>+ Добавить ключ</button>
      </div>
      {rows.length ? (
        <table className="kv">
          <thead><tr><th>Ключ</th>{cols.map(c => <th key={c.path} className="mono">{baseName(c.path)}</th>)}</tr></thead>
          <tbody>
            {rows.slice(0, showN).map(p => {
              const k = JSON.stringify(p);
              const ph = compare ? cols.map(c => getPath(c.data, p)).filter(g => g.found && g.value !== '').map(g => placeholders(g.value)) : [];
              const warn = ph.length > 1 && new Set(ph).size > 1;
              return (
                <tr key={k}>
                  <td className="key mono">
                    {p.join('.')}
                    {warn && <span className="warnmark" title="Переменные или теги отличаются между файлами"> ⚠</span>}
                    <div className="acts">
                      <button className="ghost" title="Скопировать ключ" onClick={() => { navigator.clipboard?.writeText(p.join('.')); toast('Ключ скопирован', { ms: 1500 }); }}>⧉</button>
                      <button className="ghost danger" title="Удалить ключ" onClick={() => delKey(p)}>✕</button>
                    </div>
                  </td>
                  {cols.map((c, ci) => {
                    const g = getPath(c.data, p), v = g.found ? String(g.value ?? '') : '';
                    const bg = baseData[ci] ? getPath(baseData[ci], p) : { found: false };
                    const changed = bg.found ? String(bg.value ?? '') !== v || !g.found : g.found && c.base !== null;
                    const rowsN = Math.min(12, Math.max(1, v.split('\n').length, Math.ceil(v.length / 60)));
                    return (
                      <td key={c.path}>
                        <textarea rows={rowsN} value={v} placeholder={g.found ? '' : '— нет текста —'}
                          className={`${!g.found || v === '' ? 'missing' : ''} ${changed ? 'changed' : ''}`}
                          onChange={e => edit(ci, p, e.target.value)} />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : <div className="empty">Нет ключей</div>}
      {rows.length > showN && <div style={{ textAlign: 'center', margin: 12 }}><button onClick={() => setShowN(n => n + 500)}>Показать ещё ({rows.length - showN})</button></div>}
    </>
  );
}
