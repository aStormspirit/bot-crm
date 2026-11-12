import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background, Controls, Handle, MiniMap, Position, ReactFlow, ReactFlowProvider, applyNodeChanges, useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { blobB64 } from '../github.js';
import { MAX_UPLOAD, MIME, ext, fileToB64 } from '../lib.js';
import {
  ID_RE, LIMITS, STYLES, addButton, addScreen, checkFlow, fieldsOf, imageRepoPath, keyboardOf, parseFlow,
  platformOf, referencesTo, removeButton, resolveButtons, schemaPathOf, setButtonTarget, setFlowList,
  setOptString, setPos, setString, setValue, stringify, textOf,
} from '../flow.js';
import { useUi } from '../ui.jsx';

const NODE_W = 260;
const TEXTS = '__texts';

/* ===================== загрузка и правки файла ===================== */

function useFlowFile(ws, path) {
  const [state, setState] = useState({ status: 'loading' });
  const docRef = useRef(null);   // yaml Document
  const wsDocRef = useRef(null); // документ Workspace (кеш файла)

  useEffect(() => {
    let alive = true;
    setState({ status: 'loading' });
    (async () => {
      const d = await ws.getDoc(path);
      const dirty = ws.dirty.get(path);
      const text = dirty?.type === 'text' ? dirty.content : d.text;
      const { doc, data } = parseFlow(text ?? '');
      const baseData = d.base ? parseFlow(d.base).data : data;
      let schemaText = null;
      const sp = schemaPathOf(path);
      if (ws.paths.includes(sp)) schemaText = (await ws.getDoc(sp)).text;
      if (!alive) return;
      docRef.current = doc;
      wsDocRef.current = d;
      setState({ status: 'ok', data, baseData, schemaText });
    })().catch(e => alive && setState({ status: 'error', error: e.message }));
    return () => { alive = false; };
  }, [path, ws.docVer]);

  const apply = useCallback(fn => {
    const doc = docRef.current;
    if (!doc) return;
    fn(doc);
    const text = stringify(doc);
    const data = doc.toJS() || {};
    const d = wsDocRef.current;
    d.text = text;
    if (d.kind === 'yaml') d.data = data;
    ws.commitDoc(d, text);
    setState(s => ({ ...s, data }));
  }, [ws.commitDoc]);

  return { ...state, apply };
}

/** data: URL картинок экранов (из ветки или из несохранённых правок). */
function useImages(ws, keys) {
  const [srcs, setSrcs] = useState({});
  const sig = keys.map(p => p + ':' + (ws.dirty.get(p)?.base64?.length || '') + ':' + (ws.tree?.get(p)?.sha || '')).join('|');
  useEffect(() => {
    let alive = true;
    keys.forEach(async p => {
      const mime = MIME[ext(p)] || 'image/png';
      const d = ws.dirty.get(p);
      let src = '';
      if (d?.type === 'binary') src = `data:${d.mime || mime};base64,${d.base64}`;
      else if (ws.tree?.get(p)) src = `data:${mime};base64,${await blobB64(ws.full, ws.tree.get(p).sha).catch(() => '')}`;
      if (alive) setSrcs(s => (s[p] === src ? s : { ...s, [p]: src }));
    });
    return () => { alive = false; };
  }, [sig]);
  return srcs;
}

/* ===================== карта ===================== */

export default function FlowMap(props) {
  return <ReactFlowProvider><FlowMapInner {...props} /></ReactFlowProvider>;
}

function FlowMapInner({ ws, path, focus, onLoaded, onErrors }) {
  const { toast } = useUi();
  const flow = useFlowFile(ws, path);
  const { data, apply } = flow;
  const [sel, setSel] = useState(null);
  const [showErrors, setShowErrors] = useState(false);
  const [nodes, setNodes] = useState([]);
  const [overlap, setOverlap] = useState(false);
  const rf = useReactFlow();
  const fitted = useRef(false);
  const focusDone = useRef(null); // t последнего применённого focus

  const platform = platformOf(data);
  const screens = data?.screens || {};
  const errors = useMemo(() => (data
    ? checkFlow(data, { schemaText: flow.schemaText, paths: ws.paths, flowPath: path, baseData: flow.baseData })
    : []), [data, flow.schemaText, ws.paths, path, flow.baseData]);
  const errBy = useMemo(() => {
    const m = new Map();
    errors.forEach(e => { const k = e.screen || TEXTS; m.set(k, [...(m.get(k) || []), e]); });
    return m;
  }, [errors]);

  useEffect(() => { onErrors?.(errors); }, [errors]);
  useEffect(() => { if (data) onLoaded?.(data); }, [data]);

  const imgKeys = useMemo(() => [...new Set(Object.values(screens).map(s => s?.image && imageRepoPath(path, s.image)).filter(Boolean))], [data]);
  const imgs = useImages(ws, imgKeys);

  /* --- узлы и рёбра из файла --- */
  const built = useMemo(() => {
    if (!data) return { nodes: [], edges: [] };
    const ids = Object.keys(screens);
    const nodes = ids.map((sid, i) => {
      const s = screens[sid] || {};
      const { rows, from } = resolveButtons(data, sid);
      return {
        id: sid,
        type: 'screen',
        position: { x: s.pos?.x ?? (i % 4) * 320, y: s.pos?.y ?? Math.floor(i / 4) * 420 },
        data: {
          sid, s, rows, from, platform, isStart: data.start === sid,
          img: s.image ? imgs[imageRepoPath(path, s.image)] : null,
          errors: errBy.get(sid) || [],
          title: id => screens[id]?.title || id,
        },
      };
    });
    const edges = [];
    ids.forEach(sid => {
      const s = screens[sid] || {};
      const { rows, from } = resolveButtons(data, sid);
      if (s.next && screens[s.next]) {
        edges.push({ id: `${sid}>next`, source: sid, sourceHandle: 'next', target: s.next, label: 'затем', className: 'e-next' });
      }
      if (from) return; // стрелки рисуются у исходного экрана
      rows.forEach((row, r) => (row || []).forEach((b, c) => {
        const to = b?.goto || b?.next;
        if (!to || !screens[to]) return;
        edges.push({
          id: `${sid}>${r}:${c}`, source: sid, sourceHandle: `b:${r}:${c}`, target: to,
          className: b.goto ? 'e-goto' : 'e-action',
        });
      }));
    });
    return { nodes, edges };
  }, [data, imgs, errBy, platform, path]);

  useEffect(() => {
    setNodes(prev => {
      const keep = new Map(prev.map(n => [n.id, n]));
      return built.nodes.map(n => {
        const p = keep.get(n.id);
        return p ? { ...p, data: n.data, position: p.dragging ? p.position : n.position, selected: n.id === sel } : { ...n, selected: n.id === sel };
      });
    });
  }, [built, sel]);

  const edges = useMemo(() => built.edges.map(e => ({
    ...e, type: 'default',
    markerEnd: { type: 'arrowclosed', width: 16, height: 16 },
    className: e.className + (sel && (e.source === sel || e.target === sel) ? ' hot' : ''),
  })), [built.edges, sel]);

  /* --- первичное позиционирование и проверка наложений --- */
  useEffect(() => {
    if (!nodes.length || !nodes.every(n => n.measured?.height)) return;
    if (!fitted.current) {
      fitted.current = true;
      // Если карту открыли с фокусом на экран («Открыть на карте»), его центрирует эффект ниже, а не fitView.
      const pending = focus?.id && focus.t !== focusDone.current && screens[focus.id];
      if (!pending) requestAnimationFrame(() => rf.fitView({ padding: 0.15, maxZoom: 1 }));
    }
    const box = n => ({ x: n.position.x, y: n.position.y, w: n.measured.width, h: n.measured.height });
    let hit = false;
    for (let i = 0; i < nodes.length && !hit; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = box(nodes[i]), b = box(nodes[j]);
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) { hit = true; break; }
    }
    setOverlap(hit);
  }, [nodes]);

  // Фокус применяется, когда экран уже загружен и узел измерен (карта грузится асинхронно).
  useEffect(() => {
    if (!focus?.id || focus.t === focusDone.current || !screens[focus.id]) return;
    const n = rf.getNode(focus.id);
    if (!n?.measured?.height) return;
    focusDone.current = focus.t;
    setSel(focus.id);
    // Панель правки экрана открывается следом и сужает холст: центрируем после её появления.
    setTimeout(() => {
      const m = rf.getNode(focus.id) || n;
      rf.setCenter(m.position.x + NODE_W / 2, m.position.y + (m.measured?.height || n.measured.height) / 2, { zoom: 1, duration: 400 });
    }, 120);
  }, [focus, data, nodes]);

  const onNodesChange = useCallback(ch => setNodes(ns => applyNodeChanges(ch, ns)), []);
  const onNodeDragStop = useCallback((_, node, dragged) => {
    const list = dragged?.length ? dragged : [node];
    apply(doc => list.forEach(n => setPos(doc, n.id, n.position.x, n.position.y)));
  }, [apply]);

  const autoLayout = () => {
    const ns = rf.getNodes();
    const h = id => ns.find(n => n.id === id)?.measured?.height || 300;
    const depth = new Map();
    const order = [];
    const walk = roots => {
      const q = roots.filter(r => !depth.has(r)).map(r => [r, 0]);
      q.forEach(([r]) => depth.set(r, 0));
      while (q.length) {
        const [id, d] = q.shift();
        order.push(id);
        const s = screens[id] || {};
        const outs = [s.next, ...resolveButtons(data, id).rows.flat().map(b => b?.goto || b?.next)].filter(t => t && screens[t]);
        outs.forEach(t => { if (!depth.has(t)) { depth.set(t, d + 1); q.push([t, d + 1]); } });
      }
    };
    walk([data.start].filter(Boolean));
    Object.keys(screens).forEach(id => !depth.has(id) && walk([id]));
    const colY = new Map();
    const placed = order.map(id => {
      const d = depth.get(id), y = colY.get(d) || 0;
      colY.set(d, y + h(id) + 48);
      return [id, d * (NODE_W + 110), y];
    });
    apply(doc => placed.forEach(([id, x, y]) => setPos(doc, id, x, y)));
    setNodes(ns2 => ns2.map(n => { const p = placed.find(x => x[0] === n.id); return p ? { ...n, position: { x: p[1], y: p[2] } } : n; }));
    requestAnimationFrame(() => rf.fitView({ padding: 0.15, maxZoom: 1, duration: 300 }));
    toast('Экраны разложены. Положение сохранится в flow.yaml вместе с остальными правками.');
  };

  const newScreen = () => {
    let id = prompt('Id нового экрана (латиница, цифры и _, например promo_winter):', '');
    if (!id) return;
    id = id.trim();
    if (!ID_RE.test(id)) return toast('Id: латиница в нижнем регистре, цифры и _; начинается с буквы', { err: true });
    if (screens[id]) return toast('Экран с таким id уже есть', { err: true });
    const vp = rf.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    apply(doc => addScreen(doc, id, { title: 'Новый экран', x: vp.x - NODE_W / 2, y: vp.y - 100 }));
    setSel(id);
  };

  if (flow.status === 'loading') return <div className="muted" style={{ padding: 16 }}>Загрузка карты…</div>;
  if (flow.status === 'error') {
    return <div style={{ padding: 16 }}><div className="hint err">Не удалось прочитать {path}: {flow.error}. Откройте файл во вкладке «Тексты», чтобы исправить.</div></div>;
  }

  const ctx = { data, screens, apply, platform, path, ws, imgs, toast, errBy, select: setSel };

  return (
    <div className="flow">
      <div className="flow-bar">
        <span className={'badge plat-' + platform}>{platform === 'vk' ? 'ВКонтакте' : 'Telegram'}</span>
        <span className="muted small">{Object.keys(screens).length} экранов · <span className="mono">{path}</span></span>
        <span className="grow" />
        {errors.length > 0 && (
          <button className="err-chip" onClick={() => setShowErrors(v => !v)}>⚠ Ошибок: {errors.length}</button>
        )}
        <button onClick={() => setSel(TEXTS)} className={sel === TEXTS ? 'on' : ''}>💬 Служебные тексты{errBy.get(TEXTS) ? ' ⚠' : ''}</button>
        <button onClick={autoLayout} title="Расставить экраны по шагам сценария слева направо">⇶ Разложить</button>
        <button onClick={newScreen}>＋ Экран</button>
      </div>
      {overlap && (
        <div className="hint flow-hint">Экраны на карте накладываются друг на друга. <button className="ghost" onClick={autoLayout}>Разложить автоматически</button></div>
      )}
      {showErrors && errors.length > 0 && (
        <div className="flow-errors">
          {errors.map((e, i) => (
            <div key={i} className="flow-err" onClick={() => setSel(e.screen || TEXTS)}>
              <span className="mono">{e.where}</span> — {e.msg}
            </div>
          ))}
          <div className="muted small">Пока есть ошибки, сохранить нельзя: бот с таким файлом не запустится.</div>
        </div>
      )}
      <div className="flow-body">
        <div className="flow-canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onNodeDragStop={onNodeDragStop}
            onNodeClick={(_, n) => setSel(n.id)}
            onPaneClick={() => setSel(null)}
            nodesConnectable={false}
            edgesFocusable={false}
            minZoom={0.2}
            maxZoom={1.5}
            colorMode="system"
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={20} size={1} />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable nodeColor={n => (n.data?.errors?.length ? 'var(--danger)' : n.id === sel ? 'var(--accent)' : 'var(--line)')} />
          </ReactFlow>
          <div className="flow-legend small">
            <span><i className="lg goto" /> кнопка ведёт на экран</span>
            <span><i className="lg action" /> после действия обычно</span>
            <span><i className="lg next" /> затем, без кнопки</span>
          </div>
        </div>
        {sel && (sel === TEXTS ? <TextsPanel ctx={ctx} baseData={flow.baseData} onClose={() => setSel(null)} />
          : screens[sel] ? <ScreenPanel key={sel} sid={sel} ctx={ctx} onClose={() => setSel(null)} /> : null)}
      </div>
    </div>
  );
}

/* ===================== узел-экран ===================== */

const ScreenNode = memo(({ data, selected }) => {
  const { sid, s, rows, from, platform, isStart, img, errors, title } = data;
  const kind = keyboardOf(s);
  const items = s.options?.items;
  const optRows = s.options?.rows || (items ? Object.keys(items).map(k => [k]) : []);
  return (
    <div className={'fnode' + (selected ? ' sel' : '') + (errors.length ? ' bad' : '')} style={{ width: NODE_W }}>
      <Handle type="target" position={Position.Left} id="in" className="h-in" />
      {(isStart || s.on) && (
        <div className="fnode-entry">
          {isStart && <span className="entry start">▶ старт /start</span>}
          {s.on && <span className="entry ev">⚡ событие: {s.on}</span>}
        </div>
      )}
      <div className="fnode-head">
        <span className="t">{s.title || sid}</span>
        <span className="mono id">{sid}</span>
      </div>
      {s.image && <div className="fnode-img">{img ? <img src={img} alt="" /> : <span className="muted small">{s.image}</span>}</div>}
      <div className={'fnode-text' + (s.text ? '' : ' muted')}>
        {s.text || (s.handler ? 'Текст подставляет код' : s.on === 'notice' ? 'Текст приходит из рассылки' : 'Нет текста')}
      </div>
      {(s.handler || s.dev) && (
        <div className="fnode-tags">
          {s.handler && <span className="tag code" title="Экран дорисовывает код бота">⚙ код: {s.handler}</span>}
          {s.dev && <span className="tag">dev</span>}
        </div>
      )}
      {items && (
        <div className={'fkb ' + kind}>
          <div className="fkb-cap">варианты (кнопки рисует код)</div>
          {optRows.map((row, r) => (
            <div className="fkb-row" key={r}>{row.map(k => <span key={k} className="fbtn opt">{items[k] ?? k}</span>)}</div>
          ))}
        </div>
      )}
      {rows.length > 0 && (
        <div className={'fkb ' + kind + (from ? ' from' : '')}>
          <div className="fkb-cap">{kind === 'reply' ? '⌨ клавиатура' : 'кнопки под сообщением'}{from && <> · как у «{title(from)}»</>}</div>
          {rows.map((row, r) => (
            <div className="fkb-row" key={r}>
              {(row || []).map((b, c) => (
                <span key={c} className={'fbtn st-' + (b?.style || 'none') + ' p-' + platform}>
                  <span className="lbl">{b?.text}</span>
                  <span className="sub">
                    {b?.action ? <>⚙ {b.action}</> : b?.url ? <>↗ ссылка</> : b?.goto ? <>→ {title(b.goto)}</> : null}
                  </span>
                  {!from && (b?.goto || b?.next) && <Handle type="source" position={Position.Right} id={`b:${r}:${c}`} className="h-out" />}
                </span>
              ))}
            </div>
          ))}
        </div>
      )}
      {s.next && (
        <div className="fnode-next">
          затем → {title(s.next)}
          <Handle type="source" position={Position.Right} id="next" className="h-out" />
        </div>
      )}
      {errors.length > 0 && <div className="fnode-err">⚠ {errors[0].msg}{errors.length > 1 ? ` (+${errors.length - 1})` : ''}</div>}
    </div>
  );
});
const nodeTypes = { screen: ScreenNode };

/* ===================== панель экрана ===================== */

function Counter({ value, max }) {
  const n = value?.length || 0;
  return <span className={'counter' + (n > max ? ' over' : '')}>{n} / {max}</span>;
}

function ScreenPanel({ sid, ctx, onClose }) {
  const { data, screens, apply, platform, path, ws, imgs, toast, errBy, select } = ctx;
  const s = screens[sid];
  const lim = LIMITS[platform];
  const { rows, from } = resolveButtons(data, sid);
  const kind = keyboardOf(s);
  const ids = Object.keys(screens);
  const refs = referencesTo(data, sid);
  const pickRef = useRef();
  const P = ['screens', sid];

  const pickImage = () => { pickRef.current.value = ''; pickRef.current.click(); };
  const onImage = async f => {
    if (!f) return;
    if (f.size > MAX_UPLOAD) return toast('Файл больше 3 МБ — сожмите его перед загрузкой', { err: true });
    let e = ext(f.name) === 'jpeg' ? 'jpg' : ext(f.name);
    if (!['jpg', 'png'].includes(e)) return toast('Бот принимает картинки .jpg и .png', { err: true });
    // Заменяем тот же файл, если формат совпадает; иначе новый файл images/<экран>.<ext>.
    let rel = s.image && ext(s.image) === e ? s.image : `images/${sid}.${e}`;
    const repoPath = imageRepoPath(path, rel);
    ws.setChange(repoPath, { type: 'binary', base64: await fileToB64(f), mime: f.type || MIME[e] });
    if (s.image !== rel) apply(doc => setString(doc, [...P, 'image'], rel));
    toast(`Картинка ${rel} будет сохранена вместе с остальными правками`);
  };

  const btn = (r, c) => ['screens', sid, 'buttons', r, c];
  const ownCopy = () => apply(doc => {
    doc.deleteIn([...P, 'buttons_from']);
    doc.setIn([...P, 'buttons'], doc.createNode(JSON.parse(JSON.stringify(rows))));
  });

  return (
    <aside className="fpanel">
      <input type="file" hidden ref={pickRef} accept="image/png,image/jpeg" onChange={e => onImage(e.target.files[0])} />
      <div className="fpanel-head">
        <div className="grow">
          <div className="muted small">Экран <span className="mono">{sid}</span></div>
        </div>
        <button className="ghost" onClick={onClose} title="Закрыть">✕</button>
      </div>
      <div className="fpanel-body">
        {(errBy.get(sid) || []).map((e, i) => <div key={i} className="hint err small">{e.where.replace(`screens.${sid}.`, '')}: {e.msg}</div>)}

        <label className="fld"><span>Название на карте</span>
          <input value={s.title || ''} onChange={e => apply(doc => setString(doc, [...P, 'title'], e.target.value))} />
        </label>

        <div className="fld-tags">
          {data.start === sid
            ? <span className="tag start">▶ стартовый экран (/start)</span>
            : <button className="ghost small" onClick={() => apply(doc => setValue(doc, ['start'], sid))}>Сделать стартовым</button>}
          {s.on && <span className="tag ev" title="Событие вызывает код бота">⚡ событие: {s.on}</span>}
          {s.handler && <span className="tag code" title="Функция в коде бота дорисовывает экран">⚙ код: {s.handler}</span>}
        </div>

        <label className="fld">
          <span>Текст сообщения <Counter value={s.text} max={s.image ? lim.caption : lim.text} /></span>
          <textarea rows={Math.min(14, Math.max(4, String(s.text || '').split('\n').length + 1))} value={s.text || ''}
            placeholder={s.handler ? 'Текст подставляет код — можно оставить пустым' : 'Текст сообщения'}
            onChange={e => apply(doc => setOptString(doc, [...P, 'text'], e.target.value))} />
          {fieldsOf(s.text).length > 0 && <small className="muted">{fieldsOf(s.text).map(f => `{${f}}`).join(', ')} подставляет бот — не удаляйте.</small>}
        </label>

        <div className="fld"><span>Картинка</span>
          <div className="row">
            {s.image && <div className="fp-thumb">{imgs[imageRepoPath(path, s.image)] ? <img src={imgs[imageRepoPath(path, s.image)]} alt="" /> : null}</div>}
            <div className="stack-xs">
              {s.image && <span className="mono small">{s.image}</span>}
              <div className="row">
                <button onClick={pickImage}>{s.image ? 'Заменить' : 'Добавить'}</button>
                {s.image && <button className="danger" onClick={() => apply(doc => doc.deleteIn([...P, 'image']))}>Убрать</button>}
              </div>
            </div>
          </div>
        </div>

        <div className="row">
          <label className="fld grow"><span>Клавиатура</span>
            <select value={kind} onChange={e => apply(doc => setValue(doc, [...P, 'keyboard'], e.target.value))}>
              <option value="reply">reply — вместо клавиатуры телефона</option>
              <option value="inline">inline — кнопки под сообщением</option>
            </select>
          </label>
          <label className="fld grow"><span>Затем сразу</span>
            <select value={s.next || ''} onChange={e => apply(doc => setOptString(doc, [...P, 'next'], e.target.value))}>
              <option value="">— ничего —</option>
              {ids.filter(i => i !== sid).map(i => <option key={i} value={i}>{screens[i]?.title || i}</option>)}
            </select>
          </label>
        </div>

        <div className="fld"><span>Кнопки</span>
          {from ? (
            <div className="hint small">
              Кнопки берутся с экрана «{screens[from]?.title || from}».{' '}
              <button className="ghost small" onClick={() => select(from)}>Открыть его</button>
              <button className="ghost small" onClick={ownCopy}>Сделать свои кнопки</button>
            </div>
          ) : (
            <>
              {rows.map((row, r) => (
                <div key={r} className="fp-row">
                  <div className="muted small">Ряд {r + 1}</div>
                  {(row || []).map((b, c) => (
                    <ButtonEditor key={c} b={b || {}} path={btn(r, c)} ctx={ctx} sid={sid} kind={kind}
                      onDelete={() => apply(doc => removeButton(doc, sid, r, c))} />
                  ))}
                  <button className="ghost small" onClick={() => apply(doc => addButton(doc, sid, r))}>＋ кнопка в этот ряд</button>
                </div>
              ))}
              {!(s.options && !rows.length) && <button onClick={() => apply(doc => addButton(doc, sid, null))}>＋ Новый ряд кнопок</button>}
            </>
          )}
        </div>

        {s.options?.items && (
          <div className="fld"><span>Варианты: кнопки рисует код</span>
            {Object.entries(s.options.items).map(([k, v]) => (
              <label key={k} className="row opt-row">
                <span className="mono small" style={{ width: 70 }}>{k}</span>
                <input className="grow" value={v} onChange={e => apply(doc => setString(doc, [...P, 'options', 'items', k], e.target.value))} />
                <Counter value={v} max={lim.label} />
              </label>
            ))}
            <small className="muted">Ключи и порядок рядов задаёт код, здесь меняются только подписи.</small>
          </div>
        )}

        <div className="fpanel-foot">
          <button className="danger" disabled={refs.length > 0}
            title={refs.length ? 'На экран ссылаются: ' + refs.join('; ') : ''}
            onClick={() => { if (confirm(`Удалить экран «${s.title || sid}»?`)) { apply(doc => doc.deleteIn(P)); onClose(); } }}>
            Удалить экран
          </button>
          {refs.length > 0 && <small className="muted">Сначала уберите ссылки: {refs.join('; ')}</small>}
        </div>
      </div>
    </aside>
  );
}

function ButtonEditor({ b, path, ctx, sid, kind, onDelete }) {
  const { apply, screens, platform } = ctx;
  const lim = LIMITS[platform];
  const ids = Object.keys(screens);
  const target = b.action ? 'action' : b.url != null ? 'url' : 'goto';
  const aliases = (b.aliases || []).join(', ');
  return (
    <div className={'fp-btn' + (b.action ? ' is-action' : '')}>
      <div className="row">
        <input className="grow" value={b.text || ''} onChange={e => apply(doc => setString(doc, [...path, 'text'], e.target.value))} />
        <Counter value={b.text} max={lim.label} />
        <button className="ghost" title={b.action ? 'Кнопку с действием удаляют в коде бота' : 'Удалить кнопку'} disabled={!!b.action}
          onClick={() => confirm(`Удалить кнопку «${b.text}»?`) && onDelete()}>✕</button>
      </div>
      {b.action ? (
        <div className="small">
          <span className="tag code" title="Что делает кнопка, задаёт код бота">⚙ действие: {b.action}</span>
          <label className="row" style={{ marginTop: 6 }}>
            <span className="muted">После нажатия обычно:</span>
            <select className="grow" value={b.next || ''} onChange={e => apply(doc => setOptString(doc, [...path, 'next'], e.target.value))}>
              <option value="">— не показывать стрелку —</option>
              {ids.map(i => <option key={i} value={i}>{screens[i]?.title || i}</option>)}
            </select>
          </label>
        </div>
      ) : (
        <div className="row">
          <select value={target} onChange={e => {
            const k = e.target.value;
            if (k === 'url' && kind === 'reply') return ctx.toast('В reply-клавиатуре нельзя делать кнопки-ссылки. Переключите клавиатуру на inline.', { err: true, ms: 7000 });
            apply(doc => setButtonTarget(doc, sid, path[3], path[4], k, k === 'url' ? 'https://' : ids.find(i => i !== sid) || sid));
          }}>
            <option value="goto">→ экран</option>
            <option value="url">↗ ссылка</option>
          </select>
          {target === 'goto' ? (
            <select className="grow" value={b.goto || ''} onChange={e => apply(doc => setValue(doc, [...path, 'goto'], e.target.value))}>
              {ids.map(i => <option key={i} value={i}>{screens[i]?.title || i}</option>)}
            </select>
          ) : (
            <input className="grow mono" value={b.url || ''} onChange={e => apply(doc => setString(doc, [...path, 'url'], e.target.value))} />
          )}
        </div>
      )}
      <div className="row">
        <select value={b.style || ''} title="Цвет кнопки" onChange={e => apply(doc => setOptString(doc, [...path, 'style'], e.target.value))}>
          {STYLES[platform].map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <input className="grow small" placeholder="Другие подписи через запятую (старые тексты кнопки)" value={aliases}
          onChange={e => apply(doc => setFlowList(doc, [...path, 'aliases'], e.target.value.split(',').map(x => x.trim()).filter(Boolean)))} />
      </div>
      {b.plan && <div className="muted small">Тариф в ссылке: <span className="mono">{b.plan}</span></div>}
    </div>
  );
}

/* ===================== служебные тексты ===================== */

function TextsPanel({ ctx, baseData, onClose }) {
  const { data, apply, errBy } = ctx;
  const texts = data.texts || {};
  const [q, setQ] = useState('');
  const ql = q.trim().toLowerCase();
  const keys = Object.keys(texts).filter(k => !ql || k.includes(ql) || textOf(texts[k]).toLowerCase().includes(ql));
  return (
    <aside className="fpanel">
      <div className="fpanel-head">
        <div className="grow"><b>Служебные тексты</b><div className="muted small">Сообщения, которые бот шлёт не с экрана: тосты, ошибки, шаблоны.</div></div>
        <button className="ghost" onClick={onClose} title="Закрыть">✕</button>
      </div>
      <div className="fpanel-body">
        <input placeholder="Поиск…" value={q} onChange={e => setQ(e.target.value)} />
        {keys.map(k => {
          const v = texts[k], isObjV = v && typeof v === 'object';
          const p = isObjV ? ['texts', k, 'text'] : ['texts', k];
          const errs = (errBy.get(TEXTS) || []).filter(e => e.where === `texts.${k}`);
          const need = fieldsOf(textOf(baseData?.texts?.[k]));
          return (
            <label key={k} className="fld">
              <span className="mono">{k}{isObjV && v.dev && <span className="tag">dev</span>}</span>
              <textarea rows={Math.min(8, textOf(v).split('\n').length + 1)} value={textOf(v)}
                onChange={e => apply(doc => setString(doc, p, e.target.value))} />
              {need.length > 0 && <small className={errs.length ? 'err-text' : 'muted'}>Должны остаться: {need.map(f => `{${f}}`).join(', ')}</small>}
            </label>
          );
        })}
        {!keys.length && <div className="muted">Ничего не найдено</div>}
      </div>
    </aside>
  );
}
