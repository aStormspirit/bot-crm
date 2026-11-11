import { useState } from 'react';
import { PROJECT_EMOJI } from '../store.js';
import { Modal } from '../ui.jsx';

export default function ProjectDialog({ project, onClose, onSave, onDelete }) {
  const [name, setName] = useState(project?.name || '');
  const [emoji, setEmoji] = useState(project?.emoji || '📁');
  const save = () => name.trim() && onSave({ name: name.trim(), emoji });

  return (
    <Modal onClose={onClose}>
      <h2>{project ? 'Настройки проекта' : 'Новый проект'}</h2>
      <div className="stack">
        <label>Название проекта<br />
          <input autoFocus className="w100" placeholder="Например: Интернет‑магазин" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && save()} />
        </label>
        <div>
          <div style={{ marginBottom: 6 }}>Иконка</div>
          <div className="emoji-grid">
            {PROJECT_EMOJI.map(e => <button key={e} className={'emoji' + (e === emoji ? ' on' : '')} onClick={() => setEmoji(e)}>{e}</button>)}
          </div>
        </div>
        <div className="row">
          {project && <button className="danger ghost" onClick={() => confirm(`Удалить проект «${project.name}» вместе со списком ботов? Файлы в GitHub не будут затронуты.`) && onDelete()}>Удалить проект</button>}
          <span className="grow" />
          <button onClick={onClose}>Отмена</button>
          <button className="primary" disabled={!name.trim()} onClick={save}>{project ? 'Сохранить' : 'Создать проект'}</button>
        </div>
      </div>
    </Modal>
  );
}
