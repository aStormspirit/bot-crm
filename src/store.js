import { gh } from './github.js';
import { LS } from './lib.js';

/**
 * Проекты и боты хранятся в приватном Gist пользователя (файл bot-crm.json),
 * чтобы они были доступны с любого устройства. Локальная копия — в localStorage.
 */
const FILE = 'bot-crm.json';
const LOCAL = 'botcrm:projects';
const GIST_ID = 'botcrm:gistId';

export const PLATFORMS = {
  telegram: { icon: '✈️', label: 'Telegram' },
  whatsapp: { icon: '💬', label: 'WhatsApp' },
  vk: { icon: '🔵', label: 'VK' },
  max: { icon: '🟣', label: 'MAX' },
  discord: { icon: '🎮', label: 'Discord' },
  web: { icon: '🌐', label: 'Сайт / виджет' },
  other: { icon: '🤖', label: 'Другое' },
};
export const PROJECT_EMOJI = ['📁', '🛒', '📚', '🏥', '🍕', '💼', '🎮', '🏠', '🚗', '💄', '💰', '🎓', '✈️', '⚽', '🎵', '🤖'];

export const uid = () => Math.random().toString(36).slice(2, 10);
export const emptyData = () => ({ version: 1, projects: [] });

const normalize = d => (d && Array.isArray(d.projects) ? d : emptyData());

async function findGist() {
  const cached = LS.get(GIST_ID, null);
  if (cached) {
    try { const g = await gh(`/gists/${cached}`); if (g.files?.[FILE]) return g; } catch { /* удалён — ищем заново */ }
  }
  for (let page = 1; page <= 5; page++) {
    const list = await gh(`/gists?per_page=100&page=${page}`);
    const g = list.find(x => x.files && x.files[FILE]);
    if (g) { LS.set(GIST_ID, g.id); return gh(`/gists/${g.id}`); }
    if (list.length < 100) break;
  }
  return null;
}

/** -> { data, mode: 'gist'|'local', gistId, error? } */
export async function loadProjects(canSync) {
  const local = LS.get(LOCAL, null);
  if (!canSync) return { data: normalize(local), mode: 'local', gistId: null };
  try {
    const g = await findGist();
    if (g) return { data: normalize(JSON.parse(g.files[FILE].content || '{}')), mode: 'gist', gistId: g.id };
    return { data: normalize(local), mode: 'gist', gistId: null, migrate: !!local?.projects?.length };
  } catch (e) {
    return { data: normalize(local), mode: 'local', gistId: null, error: e.message };
  }
}

/** Сохраняет данные; возвращает gistId (создаёт гист при первом сохранении). */
export async function saveProjects({ mode, gistId }, data) {
  LS.set(LOCAL, data);
  if (mode !== 'gist') return gistId;
  const files = { [FILE]: { content: JSON.stringify(data, null, 2) } };
  if (gistId) {
    await gh(`/gists/${gistId}`, { method: 'PATCH', body: { files } });
    return gistId;
  }
  const g = await gh('/gists', {
    method: 'POST',
    body: { description: 'Bot CRM — проекты и боты (создано автоматически, не удаляйте)', public: false, files },
  });
  LS.set(GIST_ID, g.id);
  return g.id;
}

export const findBot = (data, botId) => {
  for (const p of data?.projects || []) {
    const b = p.bots.find(x => x.id === botId);
    if (b) return { project: p, bot: b };
  }
  return null;
};
