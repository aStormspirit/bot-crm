import { GitHubIcon } from './Navbar.jsx';

const FEATURES = [
  ['📝', 'Тексты бота', 'JSON и YAML — удобной таблицей «ключ → текст», остальные файлы — редактором.'],
  ['🌍', 'Переводы', 'Сравнение языков бок о бок, подсветка пустых строк и расхождений в переменных.'],
  ['🖼', 'Картинки', 'Галерея с загрузкой, заменой, переименованием и удалением.'],
  ['🔀', 'Сохранение в Git', 'Один коммит со всеми правками — прямо в ветку или через Pull Request.'],
];

export default function Welcome({ auth, repos, onOpen }) {
  const connected = auth?.authenticated;
  return (
    <div className="welcome">
      <h1>{connected ? `Привет, ${auth.user.name || auth.user.login}!` : 'Bot Content CRM'}</h1>
      <p className="muted">
        {connected
          ? 'Выберите проект слева, чтобы редактировать тексты и картинки бота.'
          : 'Управляйте текстами и картинками ботов прямо в GitHub‑репозиториях — без кода и ручных коммитов.'}
      </p>

      {!connected && auth && (
        <a className="btn primary big-inline" href="/api/auth/login"><GitHubIcon /> Подключить GitHub</a>
      )}

      {connected && repos && repos.length > 0 && (
        <div className="quick">
          <div className="section-title">Недавно обновлённые</div>
          <div className="quick-grid">
            {repos.slice(0, 6).map(r => (
              <button key={r.id} className="quick-card" onClick={() => onOpen(r.full_name)}>
                <b>{r.name}</b>
                <span className="muted small">{r.owner?.login}{r.private ? ' · приватный' : ''}</span>
                {r.description && <span className="small quick-desc">{r.description}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="features">
        {FEATURES.map(([ico, title, text]) => (
          <div className="feature" key={title}>
            <div className="feature-ico">{ico}</div>
            <b>{title}</b>
            <div className="muted small">{text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
