'use client';

import { useState } from 'react';
import type { NotificationItem, PanelResult } from '@/lib/types';

export function NotificationsBell({
  notifications,
  onChanged,
}: {
  notifications: PanelResult<NotificationItem[]>;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const items = notifications.data ?? [];
  const unreadCount = items.filter((n) => !n.read).length;

  const markRead = async (item: NotificationItem) => {
    await fetch(`/api/notifications/${item.id}/read`, { method: 'POST' });
    onChanged();
  };

  return (
    <div>
      <button onClick={() => setOpen((o) => !o)} aria-label="notificações">
        🔔{unreadCount > 0 && <span> {unreadCount}</span>}
      </button>
      {open && (
        <div role="dialog" aria-label="central de notificações" className="card">
          {notifications.error && <p role="alert">{notifications.error}</p>}
          <ul>
            {items.map((item) => (
              <li key={item.id} style={{ opacity: item.read ? 0.6 : 1 }}>
                <span>[JIRA]</span>{' '}
                <a href={item.url} target="_blank" rel="noreferrer">
                  {item.title}
                </a>
                {!item.read && <button onClick={() => void markRead(item)}>marcar como lida</button>}
              </li>
            ))}
            {items.length === 0 && <li>nada por aqui</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
