import { useEffect, useMemo, useState } from 'react';
import { blobB64 } from '../github.js';
import { MIME, ext } from '../lib.js';
import { imageRepoPath, resolveButtons } from '../flow.js';

export const PROMO_ID = '__promo';
export const PROMO_SCREENS = [
  { sid: 'partner_left_promo', label: 'Тому, кого бросили' },
  { sid: 'stopped_promo', label: 'Тому, кто нажал «Остановить»' },
];
export const promoScreens = data => PROMO_SCREENS.filter(p => data?.screens?.[p.sid]);

/** data: URL картинок экранов из ветки или из несохранённых правок (как на карте). */
function useScreenImages(ws, keys) {
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

/** Системная рассылка «Промо премиума»: только просмотр, правится на карте. */
export default function PromoCard({ data, flowPath, ws, onOpenScreen }) {
  const items = promoScreens(data);
  const keys = useMemo(() => items.map(p => imageRepoPath(flowPath, data.screens[p.sid].image)).filter(Boolean), [data, flowPath]);
  const imgs = useScreenImages(ws, keys);
  const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="bc-sysview">
      <div className="row">
        <h2 className="grow" style={{ margin: 0 }}>💎 Промо премиума</h2>
        <span className="st">Системная · только просмотр</span>
      </div>
      <div className="bc-rule">
        <b>Правило</b>
        Показывается автоматически на 5-м, 15-м, 25-м… завершённом диалоге, если у человека нет премиума. Только VK и Telegram. Приходит сразу вместо экрана конца диалога, не по расписанию.
      </div>
      <div className="bc-previews">
        {items.map(({ sid, label }) => {
          const s = data.screens[sid];
          const rows = resolveButtons(data, sid).rows;
          const imgPath = imageRepoPath(flowPath, s.image);
          return (
            <div key={sid} className="bc-preview">
              <div className="muted small">{label} — экран {sid}</div>
              <div className="bubble-wrap">
                <div className="bubble">
                  {imgPath && (
                    <div className="bubble-img">
                      {imgs[imgPath] ? <img src={imgs[imgPath]} alt="" /> : <div className="muted small" style={{ padding: 30, textAlign: 'center' }}>фото</div>}
                    </div>
                  )}
                  <div className="bubble-text">{s.text || <span className="muted">Нет текста</span>}</div>
                  <span className="bubble-time">{time}</span>
                </div>
              </div>
              <div className="bc-kb">
                {rows.flat().filter(b => b?.text).map((b, i) => <span key={i}>{b.text}</span>)}
              </div>
              <button onClick={() => onOpenScreen(sid)}>🗺 Открыть на карте</button>
            </div>
          );
        })}
      </div>
      <div className="bc-foot">
        Текст, картинка и кнопки редактируются на карте (экраны partner_left_promo и stopped_promo). Пороги задаются в Chat API. Поставить на паузу или удалить нельзя.
      </div>
    </div>
  );
}
