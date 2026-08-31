'use client';

import { useEffect, useState } from 'react';
import type { NotificationItem, NotificationSource, PanelResult } from '@/lib/types';

/** De onde o aviso veio, em uma palavra. O rótulo era fixo em "JIRA", que
 *  passou a mentir quando o sino ganhou pull request e e-mail. */
const SOURCE_LABEL: Record<NotificationSource, string> = {
  jira_mention: 'JIRA',
  pull_request: 'PR',
  email: 'E-MAIL',
};

interface Props {
  notifications: PanelResult<NotificationItem[]>;
  onChanged: () => void;
  /** Marca como lida na tela antes de o servidor responder. */
  onMarkedRead: (id: string) => void;
}

export function NotificationsBell({ notifications, onChanged, onMarkedRead }: Props) {
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
    // O badge cai agora, não quando o servidor responder: a ação é local e
    // não há motivo para a tela esperar uma ida ao banco.
    onMarkedRead(item.id);
    setError(null);

    const res = await fetch(`/api/notifications/${item.id}/read`, { method: 'POST' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'Falha ao marcar como lida');
      // Desfaz recarregando do servidor, que é a fonte da verdade.
      onChanged();
      return;
    }
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
        Notificações
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
                  {/* O aviso de e-mail não tem página para abrir: vira texto,
                      porque um href vazio recarregaria o dashboard. */}
                  {item.url ? (
                    <a href={item.url} target="_blank" rel="noreferrer">
                      {item.title}
                    </a>
                  ) : (
                    <span className="bell-item-title">{item.title}</span>
                  )}
                  <div className="bell-item-foot">
                    <span className="bell-source mono">{SOURCE_LABEL[item.source]}</span>
                    {!item.read && (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        aria-label={`marcar ${item.title} como lida`}
                        onClick={() => void markRead(item)}
                      >
                        Marcar como lida
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
