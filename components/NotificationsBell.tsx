'use client';

import { useEffect, useState } from 'react';
import type { NotificationItem, PanelResult } from '@/lib/types';

interface Props {
  notifications: PanelResult<NotificationItem[]>;
  onChanged: () => void;
}

export function NotificationsBell({ notifications, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const items = notifications.data ?? [];
  const unreadCount = items.filter((n) => !n.read).length;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const markRead = async (item: NotificationItem) => {
    const res = await fetch(`/api/notifications/${item.id}/read`, { method: 'POST' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'falha ao marcar como lida');
      return;
    }
    setError(null);
    onChanged();
  };

  return (
    <div className="bell">
      <button
        type="button"
        className="btn"
        aria-label={`notificações (${unreadCount} não lidas)`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        notificações
        {unreadCount > 0 && <span className="bell-badge">{unreadCount}</span>}
      </button>

      {open && (
        <>
          <div className="bell-scrim" onClick={() => setOpen(false)} />
          <div className="bell-popover" role="dialog" aria-label="central de notificações">
            {notifications.error && (
              <p role="alert" className="panel-error">
                {notifications.error}
              </p>
            )}
            {error && (
              <p role="alert" className="panel-error">
                {error}
              </p>
            )}

            {items.length === 0 && <p className="empty">Nada por aqui.</p>}

            <ul>
              {items.map((item) => (
                <li key={item.id} className={`bell-item${item.read ? ' is-read' : ''}`}>
                  <a href={item.url} target="_blank" rel="noreferrer">
                    {item.title}
                  </a>
                  <div className="bell-item-foot">
                    <span className="bell-source mono">JIRA</span>
                    {!item.read && (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        aria-label={`marcar ${item.title} como lida`}
                        onClick={() => void markRead(item)}
                      >
                        marcar como lida
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
