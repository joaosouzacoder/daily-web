'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useEmailView } from '@/lib/hooks/useEmailView';
import { FolderTree } from '@/components/email/FolderTree';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Maximize2, Minimize2 } from 'lucide-react';
import type { MailboxNode } from '@/lib/types';
import { FolderInput, Mail, MailOpen, Trash2 } from 'lucide-react';
import { IconAction } from '@/components/data/IconAction';
import { Label, Trash } from 'iconoir-react';
import type { Account, EmailEnvelope, EmailThread, MailboxRef, PanelResult } from '@/lib/types';
import { PanelError } from '@/components/data/PanelError';
import { useConfirm } from '@/components/data/ConfirmDialog';
import type { ActiveFilter } from '@/lib/filters';
import { matchesQuery, relativeTime } from '@/lib/filters';
import { groupIntoThreads } from '@/lib/parsers/threads';
import { Section } from './ui/Section';
import { FilterBar } from './ui/FilterBar';
import { SearchInput } from './ui/SearchInput';
import { Chip } from './ui/Chip';
import { ActiveFilters } from './ui/ActiveFilters';
import { EmptyState } from '@/components/data/EmptyState';
import { SkeletonRows } from './ui/legacy-skeleton';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { cn } from '@/lib/utils';
import { EM_DASH } from '@/lib/format';
import { focusRing, tabular } from '@/lib/theme';

/** A single-line native control kept native: the batch actions read its change event. */
const selectClass =
  'h-8 shrink-0 rounded-full border bg-glass px-3 text-sm text-ink shadow-e1 outline-none transition-colors duration-100 ease-brand motion-reduce:transition-none';

interface Props {
  email: PanelResult<EmailEnvelope[]>;
  /** Caixas cadastradas pelo usuário: são elas que viram os chips de filtro. */
  mailboxes: MailboxRef[];
  onChanged: () => void;
  /** Aplica a mudança na tela antes de o servidor responder. */
  onSeenChanged: (targets: { account: string; id: string }[], seen: boolean) => void;
  onRemoved: (targets: { account: string; id: string }[]) => void;
  loading?: boolean;
}

interface BatchTargetResult {
  account: string;
  id: string;
  ok: boolean;
  error?: string;
}

type Sort = 'recent' | 'oldest';
// Era 'work' | 'personal'. Agora é o id de uma caixa cadastrada — quantas a
// pessoa quiser, com o nome que ela deu.
/** O caminho da entrada no servidor. Na URL ela é o caminho vazio: é o
 *  padrão, e o padrão não vai para o link. */
const INBOX_PATH = 'INBOX';

type AccountFilter = 'all' | string;

function key(m: EmailEnvelope): string {
  return `${m.account}:${m.id}`;
}

/**
 * As etiquetas da conversa: as que o servidor reporta em cada mensagem, mais
 * as que acabaram de ser aplicadas nesta tela. A aplicação é otimista e o
 * servidor só confirma no refresh seguinte — sem a união, a etiqueta recém
 * escolhida sumiria da linha até lá.
 */
function threadTags(thread: EmailThread, optimistic: string[]): string[] {
  const todas = new Set(optimistic);
  for (const m of thread.messages) for (const label of m.labels) todas.add(label);
  return [...todas].sort();
}

async function postJson(url: string, body: unknown) {
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// POST /api/email/batch sempre responde 200 com { results: [...] }, um
// resultado por alvo (ok/error individuais) — cada alvo pode falhar
// independente dos demais, então lemos o array em vez de assumir
// sucesso ou falha geral da chamada.
async function postBatch(
  targets: { account: string; id: string }[],
  action: 'read' | 'unread' | 'delete' | 'move',
  folder: string | undefined,
  // A pasta em que as mensagens estão. O uid só identifica dentro de uma.
  folderPath: string,
): Promise<BatchTargetResult[]> {
  const res = await fetch('/api/email/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      targets,
      action,
      folderPath,
      ...(folder !== undefined ? { folder } : {}),
    }),
  });
  const data = await res.json();
  return (data.results ?? []) as BatchTargetResult[];
}

export function EmailPanel({
  email,
  mailboxes,
  onChanged,
  onSeenChanged,
  onRemoved,
  loading = false,
}: Props) {
  const { confirm, dialog } = useConfirm();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Pasta, busca, filtro, ordenação, mensagem aberta e tela cheia vivem na
  // URL: recarregar, voltar e mandar o link para si mesmo caem no mesmo lugar.
  const [view, setView] = useEmailView();
  const openKey = view.open || null;
  const setOpenKey = (next: string | null | ((prev: string | null) => string | null)) => {
    const valor = typeof next === 'function' ? next(view.open || null) : next;
    setView({ open: valor ?? '' });
  };
  // Conversas abertas na lista. Uma de uma mensagem não expande: abre direto.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [tagMenuKey, setTagMenuKey] = useState<string | null>(null);
  const [appliedTags, setAppliedTags] = useState<Record<string, string[]>>({});
  const [batchError, setBatchError] = useState<string | null>(null);
  const [folders, setFolders] = useState<string[]>([]);
  const [targetFolder, setTargetFolder] = useState('');

  const query = view.query;
  const setQuery = (valor: string) => setView({ query: valor });
  const onlyUnread = view.onlyUnread;
  const setOnlyUnread = (next: boolean | ((prev: boolean) => boolean)) =>
    setView({ onlyUnread: typeof next === 'function' ? next(view.onlyUnread) : next });
  // A ausência de conta na URL é "todas": o padrão não vai para o link.
  const account: AccountFilter = view.account === '' ? 'all' : view.account;
  const setAccount = (valor: AccountFilter) =>
    setView({ account: valor === 'all' ? '' : valor });
  const sort = view.sort;
  const setSort = (valor: Sort) => setView({ sort: valor });
  // Listar pastas é uma ida ao IMAP: faz uma vez por conta e reaproveita,
  // para o seletor de etiqueta já abrir pronto.
  const [tagFolders, setTagFolders] = useState<Record<string, string[]>>({});

  // A árvore de pastas e a listagem de uma pasta que não é a entrada. A
  // entrada vem pronta do ciclo do painel e não custa uma ida ao servidor.
  const [mailboxNodes, setMailboxNodes] = useState<MailboxNode[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [foldersError, setFoldersError] = useState<string | null>(null);
  const [remote, setRemote] = useState<EmailEnvelope[] | null>(null);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);

  // A pasta que a tela está mostrando, no caminho que o servidor usa.
  const pastaDasMensagens = view.folder || INBOX_PATH;

  const loadTagFolders = async (acc: Account) => {
    if (tagFolders[acc]) return;
    const res = await fetch(`/api/email/folders?account=${acc}`);
    if (!res.ok) return;
    const data = await res.json();
    setTagFolders((prev) => ({ ...prev, [acc]: (data.folders ?? []) as string[] }));
  };

  useEffect(() => {
    if (tagMenuKey === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTagMenuKey(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tagMenuKey]);

  // Etiquetar e excluir valem para a conversa inteira, como no Gmail — e vão
  // pelo lote, que é uma conexão IMAP só para todas as mensagens dela.
  const applyTagToThread = async (thread: EmailThread, tag: string) => {
    const alvos = recebidas(thread).map((m) => ({ account: m.account, id: m.id }));
    // Copiar para a pasta marca como lida no servidor; a tela acompanha.
    onSeenChanged(alvos, true);
    setTagMenuKey(null);

    const failed = (await postBatch(alvos, 'move', tag, pastaDasMensagens)).filter((r) => !r.ok);
    if (failed.length > 0) {
      setBatchError(failed[0].error ?? 'Falha ao aplicar etiqueta');
      onChanged();
      return;
    }
    setBatchError(null);
    setAppliedTags((prev) => {
      const atuais = prev[thread.id] ?? [];
      if (atuais.includes(tag)) return prev;
      return { ...prev, [thread.id]: [...atuais, tag] };
    });
    onChanged();
  };

  const removeThread = async (thread: EmailThread) => {
    // A pergunta conta o que será apagado de verdade. Os enviados ficam: a
    // sua cópia do que escreveu não é lixo da caixa de entrada.
    const alvo = recebidas(thread);
    const pergunta =
      alvo.length === 1
        ? 'Excluir este e-mail?'
        : `Excluir esta conversa (${alvo.length} mensagens recebidas)?`;
    const ok = await confirm({
      title: pergunta,
      description: 'Os enviados ficam: sua cópia do que escreveu não é lixo da caixa.',
      confirmLabel: 'Excluir',
      destructive: true,
    });
    if (!ok) return;

    const alvos = alvo.map((m) => ({ account: m.account, id: m.id }));
    const chaves = new Set(alvo.map(key));

    // Some da lista agora. Esperar a ida ao IMAP deixaria a linha parada por
    // um segundo depois do clique, como se nada tivesse acontecido.
    setBatchError(null);
    setOpenKey((prev) => (prev !== null && chaves.has(prev) ? null : prev));
    onRemoved(alvos);

    const failed = (await postBatch(alvos, 'delete', undefined, pastaDasMensagens)).filter(
      (r) => !r.ok,
    );
    if (failed.length > 0) {
      setBatchError(failed[0].error ?? 'Falha ao excluir');
      // Recarrega para o e-mail voltar: ele não foi apagado de verdade.
      onChanged();
    }
  };

  // A conta cuja árvore é mostrada: a escolhida no filtro, ou a primeira.
  const treeAccount = view.account || mailboxes[0]?.id || '';
  const pastaAtual = view.folder;

  const tituloDaPasta = pastaAtual
    ? (mailboxNodes.find((m) => m.path === pastaAtual)?.name ?? pastaAtual)
    : 'Inbox';

  const abrirPasta = (path: string) => {
    // A entrada tem o caminho vazio na URL: ela é o padrão e o link fica limpo.
    setView({ folder: path === INBOX_PATH ? '' : path, open: '' });
  };

  useEffect(() => {
    if (!view.maximized || !treeAccount) return;
    let cancelado = false;
    setFoldersLoading(true);
    setFoldersError(null);
    void fetch(`/api/email/mailboxes?account=${encodeURIComponent(treeAccount)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelado) return;
        if (data.error) setFoldersError(String(data.error));
        else setMailboxNodes((data.mailboxes ?? []) as MailboxNode[]);
      })
      .catch(() => {
        if (!cancelado) setFoldersError('Não deu para listar as pastas');
      })
      .finally(() => {
        if (!cancelado) setFoldersLoading(false);
      });
    return () => {
      cancelado = true;
    };
  }, [view.maximized, treeAccount]);

  useEffect(() => {
    if (!pastaAtual || !treeAccount) {
      setRemote(null);
      setRemoteError(null);
      return;
    }
    let cancelado = false;
    setRemoteLoading(true);
    setRemoteError(null);
    void fetch(
      `/api/email/messages?account=${encodeURIComponent(treeAccount)}&folder=${encodeURIComponent(pastaAtual)}`,
    )
      .then((r) => r.json())
      .then((data) => {
        if (cancelado) return;
        if (data.error) {
          setRemoteError(String(data.error));
          setRemote([]);
        } else {
          setRemote((data.messages ?? []) as EmailEnvelope[]);
        }
      })
      .catch(() => {
        if (cancelado) return;
        setRemoteError('Não deu para abrir a pasta');
        setRemote([]);
      })
      .finally(() => {
        if (!cancelado) setRemoteLoading(false);
      });
    return () => {
      cancelado = true;
    };
  }, [pastaAtual, treeAccount]);

  const all = useMemo(
    () => (pastaAtual ? (remote ?? []) : (email.data ?? [])),
    [pastaAtual, remote, email.data],
  );

  const visible = useMemo(() => {
    const filtered = all.filter(
      (m) =>
        matchesQuery([m.subject, m.from], query) &&
        (!onlyUnread || m.unread) &&
        (account === 'all' || m.account === account),
    );
    return [...filtered].sort((a, b) =>
      sort === 'recent' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date),
    );
  }, [all, query, onlyUnread, account, sort]);

  // As conversas são montadas depois dos filtros: buscar por "Luan" precisa
  // trazer o que casa, não o fio inteiro em volta.
  const threads = useMemo(() => {
    // Os enviados entram para compor conversa, não para virar linha na caixa:
    // um e-mail que você mandou e ninguém respondeu não é da caixa de entrada.
    const agrupadas = groupIntoThreads(visible).filter((t) =>
      t.messages.some((m) => m.mailbox === 'inbox'),
    );
    return agrupadas.sort((a, b) =>
      sort === 'recent'
        ? b.lastDate.localeCompare(a.lastDate)
        : a.lastDate.localeCompare(b.lastDate),
    );
  }, [visible, sort]);

  const activeFilters: ActiveFilter[] = [
    ...(query.trim() ? [{ id: 'query', label: `Busca: ${query.trim()}` }] : []),
    ...(onlyUnread ? [{ id: 'unread', label: 'Não lidos' }] : []),
    ...(account !== 'all'
      ? [{ id: 'account', label: mailboxes.find((b) => b.id === account)?.label ?? account }]
      : []),
  ];

  const clearFilter = (id: string) => {
    if (id === 'query') setQuery('');
    if (id === 'unread') setOnlyUnread(false);
    if (id === 'account') setAccount('all');
  };

  const clearAll = () => {
    setQuery('');
    setOnlyUnread(false);
    setAccount('all');
  };

  // Âncora do intervalo: no Gmail, Shift+clique marca do último clicado até
  // aqui. Sem guardar qual foi o último, não há de onde partir.
  const ancora = useRef<string | null>(null);

  // Marcar uma conversa marca as mensagens dela: a seleção continua sendo de
  // mensagens, que é o que as ações do lote recebem.
  //
  // Só as recebidas. As ações do lote falam com a INBOX, e o uid dos enviados
  // aponta para outra mensagem lá dentro — além de que apagar a conversa não
  // deve apagar a sua própria cópia do que você escreveu.
  const recebidas = (t: EmailThread) => t.messages.filter((m) => m.mailbox === 'inbox');
  const threadKeys = (t: EmailThread) => recebidas(t).map(key);

  const toggleSelect = (thread: EmailThread, shift: boolean) => {
    const indice = threads.findIndex((t) => t.id === thread.id);
    // A âncora é lida agora, e não dentro do updater: o React chama o updater
    // depois, quando `ancora.current` já é o item recém-clicado — e aí o
    // intervalo teria só um item.
    const inicio = ancora.current === null ? -1 : threads.findIndex((t) => t.id === ancora.current);

    setSelected((prev) => {
      const next = new Set(prev);
      const marcar = !threadKeys(thread).every((k) => next.has(k));
      const aplicar = (t: EmailThread) => {
        for (const k of threadKeys(t)) {
          if (marcar) next.add(k);
          else next.delete(k);
        }
      };

      if (shift && inicio !== -1 && indice !== -1) {
        // O intervalo assume o estado do alvo, como no Gmail: marcar um não
        // marcado marca a faixa toda, desmarcar desmarca a faixa toda.
        const [de, ate] = inicio <= indice ? [inicio, indice] : [indice, inicio];
        for (let i = de; i <= ate; i += 1) aplicar(threads[i]);
        return next;
      }

      aplicar(thread);
      return next;
    });

    // A âncora anda mesmo com Shift, para intervalos encadeados funcionarem.
    ancora.current = thread.id;
  };

  useEffect(() => {
    if (selected.size === 0) {
      setFolders([]);
      setTargetFolder('');
      return;
    }
    const accounts = Array.from(
      new Set(all.filter((m) => selected.has(key(m))).map((m) => m.account)),
    );
    let cancelled = false;
    Promise.all(
      accounts.map((acc) =>
        fetch(`/api/email/folders?account=${acc}`)
          .then((r) => r.json())
          .then((data) => (data.folders ?? []) as string[]),
      ),
    )
      .then((lists) => {
        if (cancelled) return;
        const merged = Array.from(new Set(lists.flat()));
        setFolders(merged);
        setTargetFolder((prev) => (merged.includes(prev) ? prev : (merged[0] ?? '')));
      })
      .catch(() => {
        if (cancelled) return;
        setFolders([]);
        setTargetFolder('');
      });
    return () => {
      cancelled = true;
    };
  }, [selected, all]);

  const runBatch = async (action: 'read' | 'unread' | 'delete' | 'move', folder?: string) => {
    const targets = all
      .filter((m) => selected.has(key(m)))
      .map((m) => ({ account: m.account, id: m.id }));
    if (targets.length === 0) return;

    // A seleção reage na hora; o que falhar volta na correção abaixo.
    if (action === 'read') onSeenChanged(targets, true);
    else if (action === 'unread') onSeenChanged(targets, false);
    else if (action === 'delete') onRemoved(targets);
    else onSeenChanged(targets, true);

    const results = await postBatch(targets, action, folder, pastaDasMensagens);
    const failed = results.filter((r) => !r.ok);
    if (failed.length > 0) {
      setBatchError(
        `${failed.length} de ${results.length} ação(ões) falharam: ${failed
          .map((f) => `${f.account}:${f.id}${f.error ? ` (${f.error})` : ''}`)
          .join(', ')}`,
      );
      setSelected(new Set(failed.map((f) => `${f.account}:${f.id}`)));
      // Alguma coisa não foi feita: o servidor é quem sabe o estado real.
      onChanged();
      return;
    }
    setBatchError(null);
    setSelected(new Set());
  };

  const openMessageData = all.find((m) => key(m) === openKey) ?? null;

  const acoesEmLote =
    selected.size > 0 ? (
      <>
        <span className={cn('text-sm text-ink-dim', tabular)}>{selected.size} selecionados</span>
        <IconAction
          variant="outline"
          label="Marcar lido"
          onClick={() => void runBatch('read')}
          icon={<MailOpen className="size-4" />}
        />
        <IconAction
          variant="outline"
          label="Marcar não lido"
          onClick={() => void runBatch('unread')}
          icon={<Mail className="size-4" />}
        />
        {folders.length > 0 && (
          <>
            <select
              className={cn(selectClass, focusRing)}
              aria-label="pasta de destino"
              value={targetFolder}
              onChange={(e) => setTargetFolder(e.target.value)}
            >
              {folders.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <IconAction
              variant="outline"
              label="Mover"
              onClick={() => void runBatch('move', targetFolder)}
              icon={<FolderInput className="size-4" />}
            />
          </>
        )}
        <IconAction
          variant="destructive"
          label="Excluir"
          onClick={() => void runBatch('delete')}
          icon={<Trash2 className="size-4" />}
        />
      </>
    ) : null;

  const actions = (
    <>
      {acoesEmLote}
      <IconAction
        variant="ghost"
        label={view.maximized ? 'Restaurar' : 'Abrir em tela cheia'}
        onClick={() => setView({ maximized: !view.maximized })}
        icon={view.maximized ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
      />
    </>
  );

  // O mesmo conteúdo serve ao painel e à tela cheia: ali ele ganha a árvore
  // de pastas ao lado, e nada mais muda.
  const conteudo = (
    <>
        <FilterBar label="Filtrar e-mails">
          <SearchInput
            value={query}
            onChange={setQuery}
            label="buscar e-mails"
            placeholder="assunto ou remetente"
          />
          <Chip active={onlyUnread} onClick={() => setOnlyUnread((v) => !v)}>
            Não lidos
          </Chip>
          {/* Uma caixa só não precisa de filtro por caixa. */}
          {mailboxes.length > 1 &&
            mailboxes.map((box) => (
              <Chip
                key={box.id}
                active={account === box.id}
                onClick={() => setAccount(account === box.id ? 'all' : box.id)}
              >
                {box.label}
              </Chip>
            ))}
          <select
            className={cn(selectClass, focusRing)}
            aria-label="ordenar e-mails"
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
          >
            <option value="recent">Mais recentes</option>
            <option value="oldest">Mais antigos</option>
          </select>
        </FilterBar>

        <ActiveFilters filters={activeFilters} onRemove={clearFilter} onClearAll={clearAll} />

        {!pastaAtual && email.error && <PanelError>{email.error}</PanelError>}
        {remoteError && <PanelError>{remoteError}</PanelError>}
        {batchError && <PanelError>{batchError}</PanelError>}

        {(loading || remoteLoading) && all.length === 0 && <SkeletonRows count={6} />}

        {!loading && all.length === 0 && !email.error && (
          <EmptyState title="Caixa de entrada limpa." />
        )}

        {all.length > 0 && visible.length === 0 && (
          <EmptyState title="Nenhum e-mail com esses filtros." />
        )}

        {threads.length > 0 && (
          <ul className="text-sm">
            {threads.map((thread) => {
              // Uma conversa de uma mensagem abre direto no corpo: expandir para
              // clicar de novo seria um passo a mais para o caso mais comum.
              const sozinha = thread.messages.length === 1 ? thread.messages[0] : null;
              const enviadas = thread.messages.length - recebidas(thread).length;
              const isOpen = sozinha ? key(sozinha) === openKey : expanded.has(thread.id);
              const marcada = threadKeys(thread).every((k) => selected.has(k));
              const titulo = thread.subject || '(sem assunto)';
              const tags = threadTags(thread, appliedTags[thread.id] ?? []);
              // A ação que esgotou as tentativas não some em silêncio: a mensagem
              // continua na caixa do servidor e o erro é o que explica por quê.
              const acaoComErro = thread.messages.find((m) => m.actionError)?.actionError ?? null;
              return (
                <li key={thread.id} className={cn('rounded-lg', isOpen && 'bg-brand-tint')}>
                  <div
                    className={cn(
                      // `row` and `row-unread` stay as behavioural markers: the suite
                      // reads the unread state of a conversation off this element.
                      'row flex items-center gap-3 border-b border-line-soft px-2 py-3 transition-colors duration-100 ease-brand even:bg-muted/25 motion-reduce:transition-none',
                      isOpen ? 'bg-brand-tint' : 'hover:bg-brand-tint',
                      thread.unreadCount > 0 && 'row-unread',
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'size-1.5 shrink-0 rounded-full',
                        thread.unreadCount > 0 ? 'bg-brand' : 'bg-transparent',
                      )}
                    />
                    <input
                      type="checkbox"
                      className={cn('size-4 shrink-0 accent-brand', focusRing)}
                      checked={marcada}
                      onChange={() => {}}
                      // O checkbox nativo não conta se o Shift estava
                      // pressionado no `change`; o clique, sim.
                      onClick={(e) => toggleSelect(thread, e.shiftKey)}
                      aria-label={`selecionar ${titulo}`}
                    />
                    <button
                      type="button"
                      className={cn(
                        'flex min-w-0 flex-1 cursor-pointer flex-col items-start gap-0.5 rounded-sm text-left',
                        focusRing,
                      )}
                      aria-expanded={isOpen}
                      onClick={() => {
                        if (sozinha) {
                          setOpenKey(isOpen ? null : key(sozinha));
                          if (!isOpen) void loadTagFolders(sozinha.account);
                          return;
                        }
                        setExpanded((prev) => {
                          const next = new Set(prev);
                          if (next.has(thread.id)) next.delete(thread.id);
                          else next.add(thread.id);
                          return next;
                        });
                        void loadTagFolders(thread.messages[0].account);
                      }}
                    >
                      <span
                        className={cn(
                          'w-full truncate',
                          thread.unreadCount > 0 ? 'font-medium text-ink' : 'text-ink-mid',
                        )}
                      >
                        {titulo}
                      </span>
                      <span className="w-full truncate type-caption text-ink-dim">
                        {thread.participants.join(', ') || EM_DASH}
                      </span>
                      {acaoComErro && (
                        <span role="alert" className="w-full truncate type-caption text-danger">
                          {acaoComErro}
                        </span>
                      )}
                    </button>
                    {thread.messages.length > 1 && (
                      <span
                        className={cn(
                          'shrink-0 rounded-full border px-1.5 type-caption leading-relaxed',
                          tabular,
                          thread.unreadCount > 0
                            ? 'border-brand-edge bg-brand-tint text-brand'
                            : 'border-line-strong bg-neutral-tint text-ink-dim',
                        )}
                        aria-label={
                          enviadas > 0
                            ? `${thread.messages.length} mensagens, ${enviadas} enviadas por você`
                            : `${thread.messages.length} mensagens`
                        }
                      >
                        {thread.messages.length}
                      </span>
                    )}
                    <span
                      className={cn(
                        'min-w-[3.5ch] shrink-0 text-right type-caption text-ink-dim',
                        tabular,
                      )}
                    >
                      {relativeTime(thread.lastDate) || EM_DASH}
                    </span>
                    {mailboxes.length > 1 && (
                      <Badge variant="secondary" className="shrink-0">
                        {thread.messages[0].accountLabel ?? EM_DASH}
                      </Badge>
                    )}
                    <div className="flex shrink-0 items-center gap-0.5">
                      <div className="relative flex">
                        <button
                          type="button"
                          // `is-tagged` stays as a behavioural marker: the suite reads
                          // whether a conversation already carries a label off it.
                          className={cn(iconButtonClass, tags.length > 0 && 'is-tagged text-brand')}
                          aria-label={`etiquetar ${titulo}`}
                          aria-expanded={tagMenuKey === thread.id}
                          onClick={() => {
                            const next = tagMenuKey === thread.id ? null : thread.id;
                            setTagMenuKey(next);
                            if (next) void loadTagFolders(thread.messages[0].account);
                          }}
                        >
                          <Label width={16} height={16} />
                        </button>
                        {tagMenuKey === thread.id && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setTagMenuKey(null)} />
                            <div
                              className="absolute top-full right-0 z-50 mt-2 flex max-h-80 min-w-45 flex-col overflow-y-auto rounded-xl border border-line-strong bg-surface-4 p-2 shadow-e4"
                              role="menu"
                              aria-label="etiquetas"
                            >
                              {(tagFolders[thread.messages[0].account] ?? []).length === 0 ? (
                                <p className="px-3 py-2 text-sm text-ink-dim">
                                  Carregando etiquetas…
                                </p>
                              ) : (
                                (tagFolders[thread.messages[0].account] ?? []).map((f) => (
                                  <button
                                    key={f}
                                    type="button"
                                    role="menuitem"
                                    className={cn(
                                      'rounded-md px-3 py-2 text-left text-sm text-ink-mid transition-colors duration-100 ease-brand hover:bg-brand-tint hover:text-ink motion-reduce:transition-none',
                                      focusRing,
                                    )}
                                    onClick={() => void applyTagToThread(thread, f)}
                                  >
                                    {f}
                                  </button>
                                ))
                              )}
                            </div>
                          </>
                        )}
                      </div>
                      <button
                        type="button"
                        className={cn(iconButtonClass, 'hover:border-danger/40 hover:text-danger')}
                        aria-label={`excluir ${titulo}`}
                        onClick={() => void removeThread(thread)}
                      >
                        <Trash width={16} height={16} />
                      </button>
                    </div>
                  </div>

                  {sozinha && isOpen && (
                    <EmailDetail
                      email={sozinha}
                      onClose={() => setOpenKey(null)}
                      onChanged={onChanged}
                      onSeenChanged={onSeenChanged}
                      appliedTags={tags}
                    />
                  )}

                  {/* A conversa aberta mostra as mensagens na ordem em que
                      aconteceram; clicar numa delas abre o corpo. */}
                  {!sozinha && isOpen && (
                    <ul className="ml-9 border-l border-line-soft">
                      {thread.messages.map((m) => {
                        const aberta = key(m) === openKey;
                        return (
                          <li key={key(m)} className={cn(aberta && 'bg-brand-tint')}>
                            <button
                              type="button"
                              // `thread-row` and `row-unread` stay as behavioural
                              // markers: the suite finds the messages of a conversation
                              // and their unread state through them.
                              className={cn(
                                'thread-row flex w-full cursor-pointer items-baseline gap-3 px-3 py-2 text-left transition-colors duration-100 ease-brand motion-reduce:transition-none',
                                aberta ? 'bg-brand-tint text-ink' : 'hover:bg-brand-tint',
                                m.unread && 'row-unread',
                                focusRing,
                              )}
                              aria-expanded={aberta}
                              onClick={() => setOpenKey(aberta ? null : key(m))}
                            >
                              <span
                                className={cn(
                                  'min-w-0 flex-1 truncate',
                                  m.mailbox === 'sent'
                                    ? 'text-ink-dim'
                                    : m.unread
                                      ? 'font-medium text-ink'
                                      : 'text-ink-mid',
                                )}
                              >
                                {m.from || EM_DASH}
                              </span>
                              {m.mailbox === 'sent' && (
                                <Badge variant="secondary" className="shrink-0">
                                  enviada
                                </Badge>
                              )}
                              <span className={cn('shrink-0 type-caption text-ink-dim', tabular)}>
                                {relativeTime(m.date) || EM_DASH}
                              </span>
                            </button>
                            {aberta && (
                              <EmailDetail
                                email={m}
                                onClose={() => setOpenKey(null)}
                                onChanged={onChanged}
                                onSeenChanged={onSeenChanged}
                                appliedTags={tags}
                              />
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
    </>
  );

  const arvore = (
    <FolderTree
      mailboxes={mailboxNodes}
      selected={view.folder || INBOX_PATH}
      onSelect={abrirPasta}
      loading={foldersLoading}
      error={foldersError}
    />
  );

  return (
    <Section
      eyebrow={tituloDaPasta}
      count={activeFilters.length > 0 ? `${visible.length} de ${all.length}` : undefined}
      actions={actions}
    >
      {conteudo}
      {dialog}

      {/* Em tela cheia o painel vira o aplicativo inteiro: as pastas de um
          lado, a lista do outro, e a mensagem abre dentro dela. */}
      <Dialog open={view.maximized} onOpenChange={(aberto) => setView({ maximized: aberto })}>
        <DialogContent className="flex h-[calc(100dvh-2rem)] w-full flex-col gap-3 sm:max-w-[min(84rem,calc(100%-2rem))]">
          <DialogHeader>
            <DialogTitle className="truncate">{tituloDaPasta}</DialogTitle>
            <DialogDescription className="sr-only">
              E-mail em tela cheia. Esc volta ao painel.
            </DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[16rem_minmax(0,1fr)]">
            <div className="min-h-0 overflow-y-auto border-line-soft md:border-r md:pr-2">
              {arvore}
            </div>
            <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">{conteudo}</div>
          </div>
        </DialogContent>
      </Dialog>
    </Section>
  );
}

function EmailDetail({
  email,
  onClose,
  onChanged,
  onSeenChanged,
  appliedTags,
}: {
  email: EmailEnvelope;
  onClose: () => void;
  onChanged: () => void;
  onSeenChanged: (targets: { account: string; id: string }[], seen: boolean) => void;
  appliedTags: string[];
}) {
  const [body, setBody] = useState<string | null>(null);
  const [quoted, setQuoted] = useState('');
  const [showQuoted, setShowQuoted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // O que já estiver escrito na caixa vira instrução para o rascunho ("diz que
  // eu confirmo terça"); vazia, a IA escreve a resposta do zero.
  const draftWithAi = async () => {
    setDrafting(true);
    const res = await fetch('/api/email/reply/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        account: email.account,
        id: email.id,
        from: email.from,
        subject: email.subject,
        instruction: reply,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setDrafting(false);
    if (!res.ok) {
      setError(data.error ?? 'Falha ao gerar a resposta');
      return;
    }
    setError(null);
    setSent(false);
    setReply(data.text ?? '');
  };

  const sendReply = async () => {
    if (!reply.trim()) return;
    setSending(true);
    const res = await fetch('/api/email/reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account: email.account, id: email.id, body: reply }),
    });
    const data = await res.json().catch(() => ({}));
    setSending(false);
    if (!res.ok) {
      setError(data.error ?? 'Falha ao enviar a resposta');
      return;
    }
    setError(null);
    setSent(true);
    setReply('');
    onChanged();
  };

  useEffect(() => {
    let cancelled = false;
    // A caixa vai junto: o mesmo uid existe na entrada e nos enviados.
    void fetch(`/api/email/${email.account}/${email.id}/body?box=${email.mailbox}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setBody(data.text ?? data.error ?? '');
        setQuoted(data.quoted ?? '');
        setShowQuoted(false);
        // Só marca como lido depois que o corpo carregou — evita marcar
        // um e-mail que o usuário nem chegou a ver por causa de erro.
        if (email.unread) {
          // O ponto de não lido some junto com a abertura, sem esperar o IMAP.
          onSeenChanged([{ account: email.account, id: email.id }], true);
          return postJson('/api/email/mark', {
            account: email.account,
            id: email.id,
            seen: true,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [email.account, email.id, email.unread, onSeenChanged]);

  // Abre logo abaixo da linha clicada, não no meio da tela: o e-mail fica
  // no lugar onde o olho já estava.
  return (
    <div
      className="flex flex-col gap-3 border-b border-line-soft py-4 pr-4 pl-9"
      aria-label="corpo do e-mail"
    >
      <div className={bodyClass}>{body ?? 'Carregando…'}</div>

      {/* O histórico citado fica dobrado: numa resposta de resposta ele é a
          maior parte do texto, e é justamente a parte que já foi lida. */}
      {quoted && (
        <>
          <button
            type="button"
            className={cn(
              'self-start rounded-md border bg-surface-2 px-3 text-sm leading-tight tracking-[0.1em] text-ink-dim transition-colors duration-100 ease-brand hover:border-line-strong hover:text-ink-mid motion-reduce:transition-none',
              focusRing,
            )}
            aria-expanded={showQuoted}
            aria-label={showQuoted ? 'esconder histórico' : 'mostrar histórico'}
            onClick={() => setShowQuoted((v) => !v)}
          >
            ···
          </button>
          {showQuoted && (
            <div className={cn(bodyClass, 'border-l-2 border-line pl-3 text-ink-dim')}>
              {quoted}
            </div>
          )}
        </>
      )}

      {appliedTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {appliedTags.map((t) => (
            <Badge key={t} variant="secondary">
              {t}
            </Badge>
          ))}
        </div>
      )}

      {error && <PanelError>{error}</PanelError>}

      {/* Não se responde ao próprio e-mail enviado. E, no plano prático, as
          rotas de resposta buscam a mensagem na entrada: o uid de uma enviada
          apontaria para outra coisa lá dentro. */}
      {email.mailbox === 'inbox' && (
        <div className="flex flex-col gap-2">
          <Textarea
            className="min-h-22 resize-y p-3 text-sm leading-relaxed"
            aria-label="resposta"
            rows={4}
            placeholder="Escreva sua resposta — ou descreva o que dizer e peça o rascunho para a IA."
            value={reply}
            onChange={(e) => {
              setReply(e.target.value);
              setSent(false);
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={drafting}
              onClick={() => void draftWithAi()}
            >
              {drafting ? 'Gerando…' : 'Responder com IA'}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={sending || reply.trim().length === 0}
              onClick={() => void sendReply()}
            >
              {sending ? 'Enviando…' : 'Enviar resposta'}
            </Button>
            {sent && <span className="text-sm text-ink-mid">Resposta enviada.</span>}
          </div>
        </div>
      )}
    </div>
  );
}

/** A 26px square affordance that only gains a rim once it is hovered or open. */
const iconButtonClass =
  'grid size-7 place-items-center rounded-md border border-transparent text-ink-dim transition-colors duration-100 ease-brand hover:border-line hover:bg-surface-3 hover:text-ink aria-expanded:border-line aria-expanded:bg-surface-3 aria-expanded:text-ink motion-reduce:transition-none';

/** The message body scrolls inside the row rather than pushing the list down. */
const bodyClass =
  'max-h-[340px] overflow-y-auto pr-3 text-sm leading-relaxed break-words whitespace-pre-wrap text-ink-mid';

/**
 * A panel that cannot load is information, not an alarm: a contained block with a
 * warning rule, never loose red text competing with the sections that did load.
 */
