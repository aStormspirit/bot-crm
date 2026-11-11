import { PLATFORMS } from '../store.js';
import { GitHubIcon } from './Navbar.jsx';

const FEATURES = [
  ['📁', 'Проекты и боты', 'Группируйте ботов по проектам. Каждый бот привязан к своему репозиторию и папкам.'],
  ['📝', 'Тексты', 'JSON и YAML — таблицей «ключ → текст», переводы бок о бок с подсветкой пропусков.'],
  ['🖼', 'Картинки', 'Галерея с загрузкой, заменой, переименованием и удалением.'],
  ['🔀', 'Сохранение в Git', 'Один коммит со всеми правками — прямо в ветку или через Pull Request.'],
];

export default function Welcome({ auth, store, repos, onOpenBot, onOpenRepo, onNewProject, onNewBot }) {
  const connected = auth?.authenticated;
  const projects = store.data?.projects || [];
  const botsCount = projects.reduce((n, p) => n + p.bots.length, 0);

  return (
    <div className="welcome">
      <h1>{connected ? `Привет, ${auth.user.name || auth.user.login}!` : 'Bot Content CRM'}</h1>
      <p className="muted">
        {!connected
          ? 'Управляйте текстами и картинками ботов прямо в GitHub‑репозиториях — без кода и ручных коммитов.'
          : botsCount ? 'Выберите бота, чтобы редактировать его тексты и картинки.'
          : projects.length ? 'Добавьте в проект бота — укажите репозиторий, в котором он работает.'
          : 'Создайте проект и добавьте в него ботов, которые в нём работают.'}
      </p>

      {!connected && auth && <a className="btn primary big-inline" href="/api/auth/login"><GitHubIcon /> Подключить GitHub</a>}

      {connected && store.data && projects.length === 0 && (
        <div className="steps">
          <div className="step"><span className="step-n">1</span><div><b>Создайте проект</b><div className="muted small">Например, «Интернет‑магазин» или «Школа английского»</div></div></div>
          <div className="step"><span className="step-n">2</span><div><b>Добавьте бота</b><div className="muted small">Выберите репозиторий GitHub, где лежит код бота — папки с текстами и картинками найдутся автоматически</div></div></div>
          <div className="step"><span className="step-n">3</span><div><b>Редактируйте</b><div className="muted small">Меняйте тексты и картинки и сохраняйте одной кнопкой</div></div></div>
          <button className="primary big-inline" onClick={onNewProject}>＋ Создать проект</button>
        </div>
      )}

      {connected && projects.map(p => (
        <div className="quick" key={p.id}>
          <div className="section-title">{p.emoji} {p.name}</div>
          <div className="quick-grid">
            {p.bots.map(b => (
              <button key={b.id} className="quick-card" onClick={() => onOpenBot(b.id)}>
                <b>{PLATFORMS[b.platform]?.icon || '🤖'} {b.name}</b>
                <span className="muted small mono">{b.repo}{b.folder ? '/' + b.folder : ''}</span>
                <span className="muted small">{PLATFORMS[b.platform]?.label}</span>
              </button>
            ))}
            <button className="quick-card add-card" onClick={() => onNewBot(p.id)}>＋ Добавить бота</button>
          </div>
        </div>
      ))}

      {connected && projects.length === 0 && repos && repos.length > 0 && (
        <div className="quick">
          <div className="section-title">Или откройте репозиторий напрямую</div>
          <div className="quick-grid">
            {repos.slice(0, 6).map(r => (
              <button key={r.id} className="quick-card" onClick={() => onOpenRepo(r.full_name)}>
                <b>{r.name}</b>
                <span className="muted small">{r.owner?.login}{r.private ? ' · приватный' : ''}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {(!connected || !projects.length) && (
        <div className="features">
          {FEATURES.map(([ico, title, text]) => (
            <div className="feature" key={title}>
              <div className="feature-ico">{ico}</div>
              <b>{title}</b>
              <div className="muted small">{text}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
