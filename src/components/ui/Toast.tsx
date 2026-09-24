import { createContext, useContext, useState, useCallback, useRef } from 'react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  exiting?: boolean;
}

interface ToastContextValue {
  toast: (type: ToastType, title: string, message?: string) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

const ICONS: Record<ToastType, string> = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
  warning: '⚠',
};

const COLORS: Record<ToastType, { border: string; icon: string; bg: string; text: string }> = {
  success: { border: '#b6e0ca', icon: '#2d7a4f', bg: '#ecf7f1', text: '#1c1917' },
  error:   { border: '#f0c4c0', icon: '#c0392b', bg: '#fdf0ef', text: '#1c1917' },
  info:    { border: '#bddcf0', icon: '#1d6fa4', bg: '#edf5fc', text: '#1c1917' },
  warning: { border: '#f0d9b0', icon: '#c07a18', bg: '#fef7ec', text: '#1c1917' },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.map((t) => t.id === id ? { ...t, exiting: true } : t));
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 280);
  }, []);

  const toast = useCallback((type: ToastType, title: string, message?: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev.slice(-4), { id, type, title, message }]);
    const timer = setTimeout(() => dismiss(id), 4000);
    timers.current.set(id, timer);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        style={{
          position: 'fixed', bottom: '24px', right: '24px',
          zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '10px',
          pointerEvents: 'none',
        }}
      >
        {toasts.map((t) => {
          const c = COLORS[t.type];
          return (
            <div
              key={t.id}
              className={t.exiting ? 'toast-out' : 'toast-in'}
              style={{
                pointerEvents: 'all',
                background: c.bg,
                border: `1px solid ${c.border}`,
                borderLeft: `3px solid ${c.icon}`,
                borderRadius: '10px',
                padding: '12px 16px',
                minWidth: '280px',
                maxWidth: '340px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.10)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                cursor: 'pointer',
              }}
              onClick={() => dismiss(t.id)}
            >
              <span style={{
                width: '20px', height: '20px', borderRadius: '50%',
                background: c.bg, border: `1px solid ${c.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '11px', fontWeight: 700, color: c.icon, flexShrink: 0,
                marginTop: '1px',
              }}>
                {ICONS[t.type]}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#1c1917', marginBottom: t.message ? '2px' : 0 }}>
                  {t.title}
                </p>
                {t.message && (
                  <p style={{ fontSize: '0.75rem', color: '#57534e', lineHeight: '1.4' }}>
                    {t.message}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
