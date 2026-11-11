import { useState } from 'react';
import { commitChanges } from '../github.js';
import { Modal, useUi } from '../ui.jsx';

export default function CommitDialog({ ws, branch, headSha, canPush, onClose, onDone, onUndo }) {
  const { busy, toast } = useUi();
  const [message, setMessage] = useState('Обновление текстов и картинок бота');
  const [mode, setMode] = useState(canPush ? 'direct' : 'pr');
  const [newBranch, setNewBranch] = useState('content/' + new Date().toISOString().slice(0, 16).replace(/[-:T]/g, ''));

  const label = (p, d) => d.type === 'delete' ? <span className="badge warn">удалён</span>
    : ws.tree.has(p) ? <span className="badge">изменён</span> : <span className="badge ok">новый</span>;

  const save = () => {
    if (mode === 'pr' && !newBranch.trim()) return toast('Укажите имя ветки', { err: true });
    busy(async () => {
      const count = ws.dirty.size;
      const nb = mode === 'pr' ? newBranch.trim() : null;
      const r = await commitChanges({
        full: ws.full, branch, baseHead: headSha, tree: ws.tree, dirty: ws.dirty,
        message: message.trim() || 'Обновление контента бота', newBranch: nb,
        onConflict: files => confirm(`Пока вы редактировали, в ветке изменились файлы:\n${files.join('\n')}\n\nПерезаписать их вашей версией?`),
      });
      await onDone({ ...r, newBranch: nb, count });
    });
  };

  return (
    <Modal onClose={onClose}>
      <h2>Сохранить изменения в GitHub</h2>
      <div>
        {[...ws.dirty].map(([p, d]) => (
          <div className="chg" key={p}>
            {label(p, d)}<span className="mono grow">{p}</span>
            <button className="ghost" title="Отменить изменение" onClick={() => { onUndo(p); if (ws.dirty.size <= 1) onClose(); }}>↺ отменить</button>
          </div>
        ))}
      </div>
      <div className="stack" style={{ marginTop: 14 }}>
        <label>Описание изменений<br /><input style={{ width: '100%' }} value={message} onChange={e => setMessage(e.target.value)} /></label>
        <label className="row"><input type="radio" checked={mode === 'direct'} disabled={!canPush} onChange={() => setMode('direct')} /> Сразу в ветку <b className="mono">{branch}</b></label>
        <label className="row"><input type="radio" checked={mode === 'pr'} onChange={() => setMode('pr')} /> В новую ветку + Pull Request
          <input className="mono" style={{ width: 210 }} value={newBranch} onChange={e => setNewBranch(e.target.value)} onFocus={() => setMode('pr')} />
        </label>
        <div className="row"><span className="grow" /><button onClick={onClose}>Отмена</button><button className="primary" onClick={save}>Сохранить</button></div>
      </div>
    </Modal>
  );
}
