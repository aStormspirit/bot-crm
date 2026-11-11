import { useState } from 'react';
import { DEFAULT_CFG } from '../lib.js';
import { Modal } from '../ui.jsx';

export default function SettingsDialog({ cfg, title, onClose, onSave }) {
  const [c, setC] = useState(cfg);
  const f = k => ({ value: c[k], onChange: e => setC({ ...c, [k]: e.target.value }) });
  return (
    <Modal onClose={onClose}>
      <h2>{title}</h2>
      <div className="stack">
        <label>Папки с текстами <span className="muted">(через запятую, пусто = весь репозиторий)</span><br /><input className="mono" style={{ width: '100%' }} placeholder="locales, bot/texts" {...f('textDirs')} /></label>
        <label>Расширения текстовых файлов<br /><input className="mono" style={{ width: '100%' }} {...f('textExt')} /></label>
        <label>Папки с картинками <span className="muted">(пусто = весь репозиторий)</span><br /><input className="mono" style={{ width: '100%' }} placeholder="assets/images" {...f('imageDirs')} /></label>
        <label>Исключить папки и файлы<br /><textarea className="mono" style={{ width: '100%' }} rows={3} {...f('exclude')} /></label>
        <div className="muted small">Если тексты бота лежат в коде (например <span className="mono">texts.py</span>), добавьте <span className="mono">py</span> в расширения — файл откроется как текст.</div>
        <div className="row">
          <button className="ghost" onClick={() => onSave(DEFAULT_CFG)}>Сбросить</button>
          <span className="grow" />
          <button onClick={onClose}>Отмена</button>
          <button className="primary" onClick={() => onSave(c)}>Сохранить</button>
        </div>
      </div>
    </Modal>
  );
}
