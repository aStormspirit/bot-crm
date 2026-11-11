/**
 * Карта бота: flow/flow.yaml (схема flow/flow.schema.json, version 1) из репозитория бота.
 *
 * Файл правится через yaml Document: меняются только тронутые узлы, комментарии и порядок ключей
 * остаются на месте, поэтому коммит из CRM содержит только реальные правки.
 * Проверки повторяют app/flow.py ботов: схема + ссылки между экранами + лимиты площадок.
 */
import { Document, isMap, isScalar, isSeq, parseDocument } from 'yaml';
import Ajv2020 from 'ajv/dist/2020.js';
import { dirOf } from './lib.js';
export { FLOW_RE, findFlowPath } from './flowPath.js';

export const ID_RE = /^[a-z][a-z0-9_]*$/;
export const IMAGE_RE = /^images\/[\w.-]+\.(jpg|png)$/;

export const LIMITS = {
  tg: { text: 4096, caption: 1024, label: 64, callback: 64 },
  vk: { text: 4096, caption: 4096, label: 40, callback: 255 },
};
export const STYLES = {
  tg: [{ id: '', label: 'Обычная' }, { id: 'primary', label: 'Синяя' }, { id: 'success', label: 'Зелёная' }, { id: 'danger', label: 'Красная' }],
  vk: [{ id: '', label: 'Белая' }, { id: 'secondary', label: 'Серая' }, { id: 'primary', label: 'Синяя' }, { id: 'success', label: 'Зелёная' }, { id: 'danger', label: 'Красная' }],
};

export const schemaPathOf = flowPath => dirOf(flowPath) + '/flow.schema.json';
export const imageRepoPath = (flowPath, image) => (image ? dirOf(flowPath) + '/' + image : null);

/* ---------- чтение ---------- */

export function parseFlow(text) {
  const doc = parseDocument(text, { keepSourceTokens: false });
  if (doc.errors.length) throw new Error('Неверный YAML: ' + doc.errors[0].message);
  const data = doc.toJS() || {};
  return { doc, data };
}

export const platformOf = data => (data?.bot === 'vk' ? 'vk' : 'tg');
export const keyboardOf = screen => screen?.keyboard || 'reply'; // как Screen.kind в app/flow.py

/** Кнопки экрана с учётом buttons_from. */
export function resolveButtons(data, sid, seen = []) {
  const s = data.screens?.[sid];
  if (!s) return { rows: [], from: null };
  if (s.buttons_from) {
    if (seen.includes(s.buttons_from) || !data.screens?.[s.buttons_from]) return { rows: [], from: s.buttons_from };
    return { rows: resolveButtons(data, s.buttons_from, [...seen, sid]).rows, from: s.buttons_from };
  }
  return { rows: Array.isArray(s.buttons) ? s.buttons : [], from: null };
}

export const fieldsOf = s => [...String(s ?? '').matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
export const textOf = v => (v && typeof v === 'object' ? v.text : v) ?? '';

/* ---------- проверки ---------- */

let ajvCache = { src: null, validate: null };
function schemaValidator(schemaText) {
  if (ajvCache.src === schemaText) return ajvCache.validate;
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(JSON.parse(schemaText));
  ajvCache = { src: schemaText, validate };
  return validate;
}

const ptr = p => p.split('/').filter(Boolean).map(s => s.replace(/~1/g, '/').replace(/~0/g, '~'));
const pathLabel = parts => parts.map(x => (/^\d+$/.test(x) ? `[${x}]` : '.' + x)).join('').replace(/^\./, '');

/**
 * Все ошибки карты: [{screen, where, msg}]. screen — id экрана или null (ошибка в общем блоке).
 * baseData — файл как он лежит в ветке: в texts нельзя терять или добавлять {поля}.
 */
export function checkFlow(data, { schemaText, paths, flowPath, baseData } = {}) {
  const out = [];
  const add = (screen, where, msg) => out.push({ screen, where, msg });
  const lim = LIMITS[platformOf(data)];

  if (schemaText) {
    try {
      const validate = schemaValidator(schemaText);
      if (!validate(data)) {
        for (const e of validate.errors) {
          const parts = ptr(e.instancePath);
          const screen = parts[0] === 'screens' ? parts[1] : null;
          if (['oneOf', 'not', 'if'].includes(e.keyword) && validate.errors.length > 1) continue;
          let msg = e.message;
          if (e.keyword === 'additionalProperties') msg = `лишнее поле «${e.params.additionalProperty}»`;
          if (e.keyword === 'required') msg = `нет поля «${e.params.missingProperty}»`;
          if (e.keyword === 'maxLength') msg = `длиннее ${e.params.limit} символов`;
          if (e.keyword === 'pattern' && parts.at(-1) === 'image') msg = 'картинка должна быть images/<имя>.jpg или .png';
          if (e.keyword === 'pattern' && ['goto', 'next', 'buttons_from', 'start'].includes(parts.at(-1))) msg = 'id экрана: латиница в нижнем регистре, цифры и _';
          add(screen, pathLabel(parts) || 'файл', msg);
        }
      }
    } catch (e) {
      add(null, 'flow.schema.json', 'не прочитать схему: ' + e.message);
    }
  }

  const screens = data.screens && typeof data.screens === 'object' ? data.screens : {};
  if (data.start && !screens[data.start]) add(null, 'start', `нет экрана «${data.start}»`);
  const events = new Map();

  for (const [sid, s] of Object.entries(screens)) {
    if (!s || typeof s !== 'object') continue;
    const w = `screens.${sid}`;
    for (const f of ['next', 'buttons_from']) {
      if (s[f] && !screens[s[f]]) add(sid, `${w}.${f}`, `нет экрана «${s[f]}»`);
    }
    if (s.buttons_from) {
      const seen = [sid];
      let cur = s.buttons_from;
      while (cur && screens[cur]) {
        if (seen.includes(cur)) { add(sid, `${w}.buttons_from`, `цикл через «${cur}»`); break; }
        seen.push(cur);
        cur = screens[cur].buttons_from;
      }
    }
    if (s.on) {
      if (events.has(s.on)) add(sid, `${w}.on`, `событие «${s.on}» уже открывает экран «${events.get(s.on)}»`);
      else events.set(s.on, sid);
    }
    if (s.image && paths && flowPath && !paths.includes(imageRepoPath(flowPath, s.image))) {
      add(sid, `${w}.image`, `нет файла ${s.image}`);
    }
    if (s.image && typeof s.text === 'string' && s.text.length > lim.caption) {
      add(sid, `${w}.text`, `подпись к картинке длиннее ${lim.caption} символов (${s.text.length})`);
    }
    if (typeof s.text === 'string' && s.text.length > lim.text) {
      add(sid, `${w}.text`, `текст длиннее ${lim.text} символов (${s.text.length})`);
    }
    if (s.options && !s.handler) add(sid, `${w}.options`, 'экран с вариантами рисует код, нужен handler');
    const kind = keyboardOf(s);
    (Array.isArray(s.buttons) ? s.buttons : []).forEach((row, r) => (Array.isArray(row) ? row : []).forEach((b, c) => {
      if (!b || typeof b !== 'object') return;
      const spot = `${w}.buttons[${r}][${c}]`;
      for (const f of ['goto', 'next']) if (b[f] && !screens[b[f]]) add(sid, `${spot}.${f}`, `нет экрана «${b[f]}»`);
      if (kind === 'reply' && b.url) add(sid, `${spot}.url`, 'в reply-клавиатуре нет кнопок-ссылок');
      if (typeof b.text === 'string' && b.text.length > lim.label) add(sid, `${spot}.text`, `подпись длиннее ${lim.label} символов`);
      if (!String(b.text ?? '').trim()) add(sid, `${spot}.text`, 'пустая подпись');
    }));
    if (s.options?.items) {
      for (const [k, v] of Object.entries(s.options.items)) {
        if (typeof v === 'string' && v.length > lim.label) add(sid, `${w}.options.items.${k}`, `подпись длиннее ${lim.label} символов`);
      }
    }
  }

  if (baseData?.texts && data.texts) {
    for (const [k, v] of Object.entries(data.texts)) {
      if (!(k in baseData.texts)) continue;
      const before = fieldsOf(textOf(baseData.texts[k])).join(','), now = fieldsOf(textOf(v)).join(',');
      if (before !== now) add(null, `texts.${k}`, `поля в фигурных скобках должны остаться: {${fieldsOf(textOf(baseData.texts[k])).join('}, {') || '—'}}`);
    }
  }
  return out;
}

/* ---------- правки ---------- */

/** Записать строку, сохранив стиль узла; многострочный текст — блоком |. */
export function setString(doc, path, value) {
  const node = doc.getIn(path, true);
  const multi = value.includes('\n');
  if (isScalar(node)) {
    node.value = value;
    if (multi && !String(node.type).startsWith('BLOCK')) node.type = 'BLOCK_LITERAL';
    if (!multi && String(node.type).startsWith('BLOCK')) node.type = 'QUOTE_DOUBLE';
    return;
  }
  const n = doc.createNode(value);
  n.type = multi ? 'BLOCK_LITERAL' : 'QUOTE_DOUBLE';
  doc.setIn(path, n);
}

/** Строка; пустое значение удаляет необязательное поле. */
export function setOptString(doc, path, value) {
  if (value === '' || value == null) { if (doc.hasIn(path)) doc.deleteIn(path); return; }
  setString(doc, path, value);
}

export function setValue(doc, path, value) {
  const node = doc.getIn(path, true);
  if (isScalar(node) && (typeof value !== 'object' || value === null)) node.value = value;
  else doc.setIn(path, value);
}

/** Строка-список в стиле [a, b] (как aliases в ботах). */
export function setFlowList(doc, path, items) {
  if (!items.length) { if (doc.hasIn(path)) doc.deleteIn(path); return; }
  const node = doc.createNode(items);
  node.flow = true;
  node.items.forEach(i => { i.type = 'QUOTE_DOUBLE'; });
  doc.setIn(path, node);
}

export function setPos(doc, sid, x, y) {
  const p = ['screens', sid, 'pos'];
  if (isMap(doc.getIn(p, true))) {
    setValue(doc, [...p, 'x'], Math.round(x));
    setValue(doc, [...p, 'y'], Math.round(y));
  } else {
    doc.setIn(p, doc.createNode({ x: Math.round(x), y: Math.round(y) }));
  }
}

const btnNode = (doc, btn) => {
  const n = doc.createNode(btn);
  const t = n.get('text', true);
  if (t) t.type = 'QUOTE_DOUBLE';
  return n;
};

export function addButton(doc, sid, row) {
  const btn = { text: 'Новая кнопка', goto: Object.keys(doc.toJS().screens || {})[0] };
  const rows = doc.getIn(['screens', sid, 'buttons'], true);
  if (!isSeq(rows)) {
    doc.setIn(['screens', sid, 'buttons'], doc.createNode([]));
    return addButton(doc, sid, row);
  }
  if (row == null || row >= rows.items.length) {
    const r = doc.createNode([]);
    r.items.push(btnNode(doc, btn));
    rows.items.push(r);
  } else {
    rows.items[row].items.push(btnNode(doc, btn));
  }
}

export function removeButton(doc, sid, r, c) {
  const rows = doc.getIn(['screens', sid, 'buttons'], true);
  const row = rows?.items?.[r];
  if (!row) return;
  row.items.splice(c, 1);
  if (!row.items.length) rows.items.splice(r, 1);
  if (!rows.items.length) doc.deleteIn(['screens', sid, 'buttons']);
}

/** Сделать кнопку переходом goto, ссылкой url (action не трогаем — он из кода). */
export function setButtonTarget(doc, sid, r, c, kind, value) {
  const p = ['screens', sid, 'buttons', r, c];
  for (const f of ['goto', 'url']) if (f !== kind && doc.hasIn([...p, f])) doc.deleteIn([...p, f]);
  if (kind === 'goto') setValue(doc, [...p, 'goto'], value);
  if (kind === 'url') setString(doc, [...p, 'url'], value);
}

export function addScreen(doc, sid, { title, x, y }) {
  const screens = doc.getIn(['screens'], true);
  const n = doc.createNode({ title, text: '', keyboard: 'inline', pos: { x: Math.round(x), y: Math.round(y) } });
  n.get('title', true).type = 'QUOTE_DOUBLE';
  n.get('text', true).type = 'QUOTE_DOUBLE';
  screens.set(doc.createNode(sid), n);
  const pair = screens.items.at(-1);
  pair.key.spaceBefore = true;
}

/** Ссылки на экран из других мест — экран с ними удалять нельзя. */
export function referencesTo(data, sid) {
  const refs = [];
  if (data.start === sid) refs.push('start');
  for (const [id, s] of Object.entries(data.screens || {})) {
    if (id === sid || !s) continue;
    if (s.next === sid) refs.push(`${id}.next`);
    if (s.buttons_from === sid) refs.push(`${id}.buttons_from`);
    (s.buttons || []).forEach(row => (row || []).forEach(b => {
      if (b?.goto === sid) refs.push(`${id}: кнопка «${b.text}»`);
      if (b?.next === sid) refs.push(`${id}: после «${b.text}»`);
    }));
  }
  return refs;
}

export const stringify = doc => doc.toString({ lineWidth: 0, flowCollectionPadding: false });
export { Document };
