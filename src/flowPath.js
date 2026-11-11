/** Путь к карте бота отдельно от flow.js: Workspace не тянет yaml и ajv в основной бандл. */
export const FLOW_RE = /(^|\/)flow\/flow\.ya?ml$/;

/** Найти flow.yaml бота: в папке бота, ближайший к корню. */
export function findFlowPath(paths, folder) {
  const pre = folder ? folder.replace(/\/+$/, '') + '/' : '';
  const list = paths.filter(p => FLOW_RE.test(p) && (!pre || p.startsWith(pre)));
  return list.sort((a, b) => a.split('/').length - b.split('/').length)[0] || null;
}
