/**
 * Формат контента бота «bot-crm/1» (app/content/content.json):
 * texts, buttons, button_aliases, lists, keyboards, images, screens.
 * Бот читает файл при запуске; CRM меняет его как обычный JSON-файл репозитория.
 */
import { dirOf } from './lib.js';

export const CONTENT_FORMAT = 'bot-crm/1';
export const CONTENT_RE = /(^|\/)content\/content\.json$/;

export const COLORS = {
  telegram: [
    { id: null, label: 'Обычная' },
    { id: 'primary', label: 'Синяя' },
    { id: 'success', label: 'Зелёная' },
    { id: 'danger', label: 'Красная' },
  ],
  vk: [
    { id: 'secondary', label: 'Серая' },
    { id: 'primary', label: 'Синяя' },
    { id: 'success', label: 'Зелёная' },
    { id: 'danger', label: 'Красная' },
  ],
};

/** Лимит длины подписи кнопки на платформе (ВК — 40 символов). */
export const labelLimit = (platform, cell) => (platform === 'vk' ? (cell?.list ? 38 : 40) : 64);

export const isContentDoc = doc => doc?.kind === 'json' && doc.data?.format === CONTENT_FORMAT;

/** Найти content.json бота: в папке бота, ближайший к корню. */
export function findContentPath(paths, folder) {
  const list = paths.filter(p => CONTENT_RE.test(p) && (!folder || p.startsWith(folder.replace(/\/+$/, '') + '/')));
  return list.sort((a, b) => a.split('/').length - b.split('/').length)[0] || null;
}

export const imagePath = (contentPath, data, name) => {
  const file = data.images?.[name]?.file;
  if (!file) return null;
  const base = dirOf(contentPath);
  return (base ? base + '/' : '') + file.replace(/^\.\//, '');
};

export function cellLabel(data, cell) {
  if (cell.button) return data.buttons?.[cell.button] ?? `⚠ ${cell.button}`;
  if (cell.list) return data.lists?.[cell.list]?.items?.[cell.item] ?? `⚠ ${cell.list}.${cell.item}`;
  return '⚠';
}

/** Ключ ячейки для поиска мест использования. */
export const cellRef = cell => (cell.button ? `button:${cell.button}` : `list:${cell.list}:${cell.item}`);

/** Экраны, на которых встречается кнопка/текст. */
export function screensUsing(data, ref) {
  return (data.screens || []).filter(s => {
    if (ref === `text:${s.text}`) return true;
    const kb = data.keyboards?.[s.keyboard];
    return kb?.rows?.some(row => row.some(c => cellRef(c) === ref));
  });
}

export const placeholdersOf = s => [...new Set(String(s || '').match(/\{[a-z_]+\}/gi) || [])];

/** Плейсхолдеры, которые были в старом тексте и пропали в новом. */
export const lostPlaceholders = (oldValue, newValue) => placeholdersOf(oldValue).filter(p => !String(newValue).includes(p));

/* ---- изменения (мутируют data) ---- */

export function setText(data, key, value) {
  data.texts[key] = value;
}

/** Переименование кнопки: прежняя подпись уходит в button_aliases, чтобы старые клавиатуры работали. */
export function setButton(data, key, value) {
  const old = data.buttons[key];
  if (old === value) return;
  data.buttons[key] = value;
  if (old && old.trim()) {
    data.button_aliases = data.button_aliases || {};
    const list = data.button_aliases[key] || [];
    const norm = s => s.trim().toLowerCase();
    if (norm(old) !== norm(value) && !list.some(a => norm(a) === norm(old))) list.push(old);
    const cleaned = list.filter(a => norm(a) !== norm(value));
    if (cleaned.length) data.button_aliases[key] = cleaned;
    else delete data.button_aliases[key];
  }
}

export function setListItem(data, list, item, value) {
  data.lists[list].items[item] = value;
}

export function setCellLabel(data, cell, value) {
  if (cell.button) setButton(data, cell.button, value);
  else setListItem(data, cell.list, cell.item, value);
}

export function setCellColor(data, kbName, r, c, color) {
  const cell = data.keyboards[kbName].rows[r][c];
  if (color) cell.color = color;
  else delete cell.color;
}

/** Переставить кнопку внутри клавиатуры: dir = 'left'|'right'|'up'|'down'. */
export function moveCell(data, kbName, r, c, dir) {
  const rows = data.keyboards[kbName].rows;
  const row = rows[r];
  const [cell] = row.splice(c, 1);
  if (dir === 'left' || dir === 'right') {
    row.splice(Math.max(0, Math.min(row.length, c + (dir === 'left' ? -1 : 1))), 0, cell);
  } else if (dir === 'up') {
    if (r === 0) rows.unshift([cell]);
    else rows[r - 1].push(cell);
  } else {
    if (r === rows.length - 1) rows.push([cell]);
    else rows[r + 1].push(cell);
  }
  data.keyboards[kbName].rows = rows.filter(x => x.length);
}
