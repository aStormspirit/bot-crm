import { useEffect, useRef, useState } from 'react';
import { blobB64 } from '../github.js';
import { IMG_EXT, MAX_UPLOAD, MIME, baseName, dirOf, ext, fileToB64, matches } from '../lib.js';
import { Modal, useUi } from '../ui.jsx';

export default function Images({ ws, files, imgDir, setImgDir }) {
  const { toast, busy } = useUi();
  const all = ws.filesOf('images');
  const [dir, setDir] = useState(imgDir || ws.cfg.imageDirs.split(',')[0]?.trim() || (all[0] ? dirOf(all[0]) : 'images'));
  const [preview, setPreview] = useState(null);
  const pickRef = useRef();
  const pickCb = useRef();

  useEffect(() => { if (imgDir) setDir(imgDir); }, [imgDir]);

  const pick = (cb, multiple = true) => { pickCb.current = cb; pickRef.current.multiple = multiple; pickRef.current.value = ''; pickRef.current.click(); };

  const tooBig = f => { if (f.size > MAX_UPLOAD) { toast(`${f.name}: файл больше 3 МБ — сожмите его перед загрузкой`, { err: true, ms: 7000 }); return true; } return false; };

  const addImages = async fs => {
    const d = dir.trim().replace(/^\/+|\/+$/g, '');
    let n = 0;
    for (const f of fs) {
      if (tooBig(f)) continue;
      ws.setChange((d ? d + '/' : '') + f.name.replace(/\s+/g, '_'), { type: 'binary', base64: await fileToB64(f), mime: f.type });
      n++;
    }
    if (!n) return;
    if (d && !matches(d + '/x.png', 'images', ws.cfg)) toast('Папка не входит в фильтр картинок из настроек', { err: true });
    toast(`Добавлено файлов: ${n}. Не забудьте сохранить в GitHub.`);
    setImgDir(d);
  };

  const replace = p => pick(async ([f]) => {
    if (!f || tooBig(f)) return;
    ws.setChange(p, { type: 'binary', base64: await fileToB64(f), mime: f.type });
    if (ext(f.name) !== ext(p)) toast('Формат нового файла отличается от исходного — путь остался прежним', { err: true });
  }, false);

  const rename = p => {
    let np = prompt('Новый путь:', p);
    if (!np || np === p) return;
    np = np.trim().replace(/^\/+/, '');
    if (ws.paths.includes(np)) return toast('Такой файл уже есть', { err: true });
    busy(async () => {
      const d = ws.dirty.get(p);
      const base64 = d?.type === 'binary' ? d.base64 : await blobB64(ws.full, ws.tree.get(p).sha);
      ws.setChange(np, { type: 'binary', base64, mime: d?.mime || MIME[ext(np)] });
      ws.setChange(p, { type: 'delete' });
    });
  };

  return (
    <div onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); addImages([...e.dataTransfer.files].filter(f => IMG_EXT.includes(ext(f.name)))); }}>
      <input type="file" hidden ref={pickRef} accept="image/*" onChange={e => pickCb.current?.([...e.target.files])} />
      <div className="toolbar">
        <h2 className="grow" style={{ margin: 0 }}>Картинки <span className="muted">({files.length})</span></h2>
        <span className="muted">Папка:</span>
        <input className="mono" style={{ width: 220 }} value={dir} onChange={e => setDir(e.target.value)} />
        <button className="primary" onClick={() => pick(addImages)}>⬆ Загрузить</button>
      </div>
      <div className="muted small" style={{ margin: '-4px 0 12px' }}>Файлы можно перетащить прямо сюда. Загрузка файла с уже существующим именем заменит картинку.</div>
      {files.length ? (
        <div className="grid">
          {files.map(p => {
            const d = ws.dirty.get(p), t = ws.tree.get(p);
            return (
              <div key={p} className={'img' + (d ? ' dirty' : '')}>
                <Thumb ws={ws} path={p} onOpen={src => setPreview({ src, path: p })} />
                <div className="meta">
                  <div className="mono">{baseName(p)}</div>
                  <div className="muted">
                    {t?.size && !d ? `${Math.max(1, Math.round(t.size / 1024))} КБ` : ''}{' '}
                    {d && <span className="badge warn">{t ? 'заменена' : 'новая'}</span>}
                  </div>
                </div>
                <div className="acts">
                  <button onClick={() => replace(p)}>Заменить</button>
                  <button title="Скопировать путь" onClick={() => { navigator.clipboard?.writeText(p); toast('Путь скопирован: ' + p, { ms: 2000 }); }}>Путь</button>
                  <button onClick={() => rename(p)}>Переим.</button>
                  <button className="danger" onClick={() => confirm('Удалить ' + p + '?') && ws.setChange(p, { type: 'delete' })}>Удалить</button>
                </div>
              </div>
            );
          })}
        </div>
      ) : <div className="empty"><div className="big-ico">🖼</div>Картинок пока нет. Загрузите первую.</div>}
      {preview && (
        <Modal wide onClose={() => setPreview(null)}>
          <img src={preview.src} alt="" style={{ maxWidth: '100%', maxHeight: '75vh', display: 'block', margin: 'auto' }} />
          <div className="mono" style={{ textAlign: 'center', marginTop: 8 }}>{preview.path}</div>
        </Modal>
      )}
    </div>
  );
}

function Thumb({ ws, path, onOpen }) {
  const ref = useRef();
  const [src, setSrc] = useState('');
  const [dim, setDim] = useState('');
  const d = ws.dirty.get(path);
  const sha = ws.tree.get(path)?.sha;
  const mime = MIME[ext(path)] || 'application/octet-stream';

  useEffect(() => {
    if (d?.type === 'binary') { setSrc(`data:${d.mime || mime};base64,${d.base64}`); return; }
    if (!sha) return;
    let alive = true;
    const io = new IntersectionObserver(([en]) => {
      if (!en.isIntersecting) return;
      io.disconnect();
      blobB64(ws.full, sha).then(b => alive && setSrc(`data:${mime};base64,${b}`)).catch(() => {});
    }, { rootMargin: '200px' });
    io.observe(ref.current);
    return () => { alive = false; io.disconnect(); };
  }, [d, sha]);

  return (
    <div className="thumb" ref={ref}>
      {src && <img src={src} alt="" onClick={() => onOpen(src)} onLoad={e => setDim(`${e.target.naturalWidth}×${e.target.naturalHeight}`)} />}
      {dim && <span className="dim">{dim}</span>}
    </div>
  );
}
