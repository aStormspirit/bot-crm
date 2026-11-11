import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const UiCtx = createContext(null);
export const useUi = () => useContext(UiCtx);

export function UiProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [loading, setLoading] = useState(0);
  const id = useRef(0);

  const toast = useCallback((content, { err = false, ms = 4500 } = {}) => {
    const t = { id: ++id.current, content, err };
    setToasts(x => [...x, t]);
    setTimeout(() => setToasts(x => x.filter(y => y.id !== t.id)), ms);
  }, []);

  const busy = useCallback(async fn => {
    setLoading(n => n + 1);
    try { return await fn(); }
    catch (e) { console.error(e); toast(e.message || String(e), { err: true, ms: 8000 }); }
    finally { setLoading(n => n - 1); }
  }, [toast]);

  return (
    <UiCtx.Provider value={{ toast, busy }}>
      {children}
      <div className="toasts">
        {toasts.map(t => <div key={t.id} className={'toast' + (t.err ? ' err' : '')}>{t.content}</div>)}
      </div>
      {loading > 0 && <div className="loading"><div className="spin" /></div>}
    </UiCtx.Provider>
  );
}

export function Modal({ onClose, wide, children }) {
  useEffect(() => {
    const onKey = e => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-bg" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className={'modal' + (wide ? ' wide' : '')}>{children}</div>
    </div>
  );
}
