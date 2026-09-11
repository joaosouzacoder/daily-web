'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import {
  Bold,
  Code,
  Eye,
  Heading2,
  Italic,
  Link,
  List,
  ListChecks,
  ListOrdered,
  Maximize2,
  Minimize2,
  Pencil,
  Plus,
  Quote,
  SquareCode,
  Strikethrough,
} from 'lucide-react';
import { IconAction } from '@/components/data/IconAction';
import { Trash } from 'iconoir-react';
import type { Note } from '@/lib/types';
import { PanelError } from '@/components/data/PanelError';
import { useConfirm } from '@/components/data/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/data/EmptyState';
import { focusRing } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { Section } from './ui/Section';
import { MarkdownView } from './MarkdownView';
import {
  applyEdit,
  continueList,
  formatMarkdown,
  type MarkdownAction,
  type TextEdit,
} from '@/lib/markdown/editing';
import type { NotesSyncStatus } from '@/lib/notesSync';

/** Quanto o texto fica parado antes de subir. Curto o bastante para não se
 *  perder ao fechar a aba, longo o bastante para não gravar a cada tecla. */
const AUTOSAVE_MS = 700;

type Estado = 'salvo' | 'salvando' | 'erro';

/** Com o Drive conectado, a situação da cópia é relida de tempos em tempos:
 *  o envio acontece depois da gravação, fora da requisição que a tela vê. */
const SYNC_POLL_MS = 10_000;

interface Ferramenta {
  action: MarkdownAction;
  label: string;
  icon: ReactNode;
}

const FERRAMENTAS: Ferramenta[] = [
  { action: 'heading', label: 'Título', icon: <Heading2 className="size-4" /> },
  { action: 'bold', label: 'Negrito (Ctrl+B)', icon: <Bold className="size-4" /> },
  { action: 'italic', label: 'Itálico (Ctrl+I)', icon: <Italic className="size-4" /> },
  { action: 'strike', label: 'Riscado (Ctrl+Shift+X)', icon: <Strikethrough className="size-4" /> },
  { action: 'code', label: 'Código (Ctrl+E)', icon: <Code className="size-4" /> },
  { action: 'link', label: 'Link (Ctrl+K)', icon: <Link className="size-4" /> },
  { action: 'bullet', label: 'Lista', icon: <List className="size-4" /> },
  { action: 'ordered', label: 'Lista numerada', icon: <ListOrdered className="size-4" /> },
  { action: 'task', label: 'Lista de tarefas', icon: <ListChecks className="size-4" /> },
  { action: 'quote', label: 'Citação', icon: <Quote className="size-4" /> },
  { action: 'codeBlock', label: 'Bloco de código', icon: <SquareCode className="size-4" /> },
];

/** Atalho de teclado → ação. Ctrl no Windows e Linux, Cmd no Mac. */
function atalho(e: KeyboardEvent<HTMLTextAreaElement>): MarkdownAction | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
  const key = e.key.toLowerCase();
  if (e.shiftKey) return key === 'x' ? 'strike' : null;
  if (key === 'b') return 'bold';
  if (key === 'i') return 'italic';
  if (key === 'k') return 'link';
  if (key === 'e') return 'code';
  return null;
}

function descreverSync(sync: NotesSyncStatus): string {
  if (sync.lastError) return `Drive: ${sync.lastError}`;
  if (sync.pending > 0) return 'enviando ao Drive…';
  return 'no Google Drive';
}

export function NotesPanel() {
  const { confirm, dialog } = useConfirm();
  const [notes, setNotes] = useState<Note[]>([]);
  const [ativa, setAtiva] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [estado, setEstado] = useState<Estado>('salvo');
  const [erro, setErro] = useState<string | null>(null);
  const [renomeando, setRenomeando] = useState<string | null>(null);
  const [lendo, setLendo] = useState(false);
  const [maximizada, setMaximizada] = useState(false);
  const campoAtual = () => (maximizada ? campoTelaCheia.current : campoPainel.current);
  const [sync, setSync] = useState<NotesSyncStatus | null>(null);
  // Um campo no painel e outro no diálogo, cada um com a sua ref. Uma ref só
  // para os dois se perde: o diálogo continua montado durante a animação de
  // saída e, ao desmontar, zeraria a ref que o campo do painel já assumiu.
  const campoPainel = useRef<HTMLTextAreaElement>(null);
  const campoTelaCheia = useRef<HTMLTextAreaElement>(null);
  // Seleção a restaurar depois que o React escrever o texto novo no campo.
  const selecaoPendente = useRef<{ start: number; end: number } | null>(null);

  // O texto em edição vive aqui, não em `notes`: o textarea precisa responder
  // à tecla na hora, sem esperar a gravação.
  const [rascunho, setRascunho] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Qual nota o rascunho pendente pertence. Trocar de aba com uma gravação no
  // ar gravaria o texto na aba errada sem isto.
  const pendente = useRef<{ id: string; body: string } | null>(null);

  const gravar = useCallback(async (id: string, patch: { title?: string; body?: string }) => {
    setEstado('salvando');
    const res = await fetch(`/api/notes/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErro(data.error ?? 'Falha ao salvar a nota');
      setEstado('erro');
      return;
    }

    const { note } = (await res.json()) as { note: Note };
    setErro(null);
    setEstado('salvo');
    setNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, ...note } : n)));
  }, []);

  /** Sobe o que estiver pendente agora, cancelando a espera. */
  const gravarPendente = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const alvo = pendente.current;
    pendente.current = null;
    if (alvo) await gravar(alvo.id, { body: alvo.body });
  }, [gravar]);

  useEffect(() => {
    let cancelado = false;
    void fetch('/api/notes')
      .then((r) => r.json())
      .then((data: { notes?: Note[]; sync?: NotesSyncStatus; error?: string }) => {
        if (cancelado) return;
        const lista = data.notes ?? [];
        setSync(data.sync ?? null);
        setNotes(lista);
        setAtiva(lista[0]?.id ?? null);
        setRascunho(lista[0]?.body ?? '');
        setErro(data.error ?? null);
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  // Sair da página com o texto ainda esperando o autosave perderia o que foi
  // digitado nos últimos instantes.
  useEffect(() => {
    const aoSair = () => {
      const alvo = pendente.current;
      if (!alvo) return;
      // `fetch` normal é cancelado quando a página fecha; o sendBeacon não.
      navigator.sendBeacon?.(
        `/api/notes/${encodeURIComponent(alvo.id)}`,
        new Blob([JSON.stringify({ body: alvo.body })], { type: 'application/json' }),
      );
    };
    window.addEventListener('pagehide', aoSair);
    return () => window.removeEventListener('pagehide', aoSair);
  }, []);

  const digitar = (texto: string) => {
    if (!ativa) return;
    setRascunho(texto);
    setEstado('salvando');
    pendente.current = { id: ativa, body: texto };

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const alvo = pendente.current;
      pendente.current = null;
      timer.current = null;
      if (alvo) void gravar(alvo.id, { body: alvo.body });
    }, AUTOSAVE_MS);
  };

  const conectado = sync?.connected === true;
  useEffect(() => {
    if (!conectado) return;
    const id = setInterval(() => {
      void fetch('/api/notes/sync')
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { sync?: NotesSyncStatus } | null) => {
          if (data?.sync) setSync(data.sync);
        })
        .catch(() => {
          // Falha de rede numa leitura de status: a próxima volta tenta de novo.
        });
    }, SYNC_POLL_MS);
    return () => clearInterval(id);
  }, [conectado]);

  useLayoutEffect(() => {
    const alvo = selecaoPendente.current;
    const el = campoAtual();
    if (!alvo || !el) return;
    selecaoPendente.current = null;
    el.setSelectionRange(alvo.start, alvo.end);
  }, [rascunho]);

  /**
   * Aplica uma troca de formatação. O caminho preferido é o `insertText` do
   * navegador: ele passa pelo desfazer nativo, então Ctrl+Z tira o negrito
   * em vez de apagar o que foi digitado antes. Onde ele não existe, o texto é
   * trocado pelo estado e a seleção volta depois da renderização.
   */
  const editar = (edit: TextEdit) => {
    const el = campoAtual();
    if (!el) return;
    el.focus();
    el.setSelectionRange(edit.from, edit.to);
    const nativo =
      edit.insert === ''
        ? edit.from !== edit.to && document.execCommand?.('delete', false)
        : document.execCommand?.('insertText', false, edit.insert);
    if (nativo) {
      el.setSelectionRange(edit.selection.start, edit.selection.end);
      return;
    }
    selecaoPendente.current = edit.selection;
    digitar(applyEdit(el.value, edit));
  };

  const formatar = (action: MarkdownAction) => {
    const el = campoAtual();
    if (!el) return;
    editar(formatMarkdown(el.value, { start: el.selectionStart, end: el.selectionEnd }, action));
  };

  const teclar = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    const action = atalho(e);
    if (action) {
      e.preventDefault();
      formatar(action);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const el = e.currentTarget;
      const edit = continueList(el.value, { start: el.selectionStart, end: el.selectionEnd });
      if (edit) {
        e.preventDefault();
        editar(edit);
      }
    }
  };

  const trocarAba = async (id: string) => {
    if (id === ativa) return;
    // O que estava pendente é gravado antes de o rascunho virar outro texto.
    await gravarPendente();
    setAtiva(id);
    setRascunho(notes.find((n) => n.id === id)?.body ?? '');
  };

  const criar = async () => {
    await gravarPendente();
    const res = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: `Nota ${notes.length + 1}` }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErro(data.error ?? 'Falha ao criar a nota');
      return;
    }
    setErro(null);
    setNotes((prev) => [...prev, data.note as Note]);
    setAtiva((data.note as Note).id);
    setRascunho('');
  };

  const apagar = async (note: Note) => {
    const ok = await confirm({
      title: 'Apagar a nota?',
      description: `"${note.title || 'sem título'}" será removida. Isso não tem volta.`,
      confirmLabel: 'Apagar',
      destructive: true,
    });
    if (!ok) return;
    if (pendente.current?.id === note.id) {
      pendente.current = null;
      if (timer.current) clearTimeout(timer.current);
    }

    const res = await fetch(`/api/notes/${encodeURIComponent(note.id)}`, { method: 'DELETE' });
    if (!res.ok) {
      setErro('Falha ao apagar a nota');
      return;
    }

    setErro(null);
    setNotes((prev) => {
      const restantes = prev.filter((n) => n.id !== note.id);
      if (note.id === ativa) {
        const proxima = restantes[0] ?? null;
        setAtiva(proxima?.id ?? null);
        setRascunho(proxima?.body ?? '');
      }
      return restantes;
    });
  };

  const comecarRenomear = (id: string) => setRenomeando(id);

  /** Título vazio não apaga o nome: volta ao que era. Sem nome a aba vira
   *  "sem título" e o arquivo no Drive também — raramente é o que se quis. */
  const renomear = async (note: Note, titulo: string) => {
    setRenomeando(null);
    const limpo = titulo.trim();
    if (!limpo || limpo === note.title) return;
    await gravar(note.id, { title: limpo });
  };

  const alternarMaximizada = (valor: boolean) => {
    // O texto pendente sobe antes da troca: o campo muda de lugar e o
    // rascunho não pode depender de qual dos dois estava aberto.
    void gravarPendente();
    setMaximizada(valor);
  };

  const notaAtiva = notes.find((n) => n.id === ativa) ?? null;

  /** A barra de formatação. `emTelaCheia` diz em qual das duas ela está: a do
   *  painel fica inerte enquanto o diálogo está aberto, porque o campo de
   *  texto que ela formataria é o do diálogo. */
  const barra = (emTelaCheia: boolean) => (
    <div className="flex items-start gap-2" role="toolbar" aria-label="formatação Markdown">
      {/* A formatação quebra linha quando o painel é estreito; ler e
          maximizar ficam sempre no canto superior direito. */}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-0.5">
        {FERRAMENTAS.map((f) => (
          <IconAction
            key={f.action}
            label={f.label}
            icon={f.icon}
            disabled={lendo || (maximizada && !emTelaCheia)}
            // Sem isto o clique tira o foco do texto e a seleção se perde
            // antes de a formatação saber onde aplicar.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => formatar(f.action)}
          />
        ))}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <IconAction
          label={lendo ? 'Editar' : 'Visualizar'}
          aria-pressed={lendo}
          disabled={maximizada && !emTelaCheia}
          icon={lendo ? <Pencil className="size-4" /> : <Eye className="size-4" />}
          onClick={() => {
            void gravarPendente();
            setLendo((v) => !v);
          }}
        />
        <IconAction
          label={emTelaCheia ? 'Restaurar' : 'Maximizar'}
          icon={emTelaCheia ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          onClick={() => alternarMaximizada(!emTelaCheia)}
        />
      </div>
    </div>
  );

  const corpo = (emTelaCheia: boolean) =>
    lendo ? (
      <div
        className="min-h-40 flex-1 overflow-y-auto rounded-md border border-line-soft px-3 py-2 text-sm"
        aria-label={`visualização de ${notaAtiva?.title || 'sem título'}`}
        role="region"
      >
        {rascunho.trim() ? (
          <MarkdownView source={rascunho} />
        ) : (
          <p className="text-ink-dim">Nada escrito ainda.</p>
        )}
      </div>
    ) : (
      <Textarea
        ref={emTelaCheia ? campoTelaCheia : campoPainel}
        className="min-h-40 flex-1 resize-none font-mono leading-relaxed [field-sizing:fixed]"
        aria-label={`texto de ${notaAtiva?.title || 'sem título'}`}
        placeholder="Escreva aqui, em Markdown. O que você digita é salvo sozinho."
        value={rascunho}
        onChange={(e) => digitar(e.target.value)}
        onKeyDown={teclar}
        onBlur={() => void gravarPendente()}
      />
    );

  const situacao = (
    <p className="type-caption text-right text-ink-dim" role="status">
      {estado === 'salvando' ? 'salvando…' : estado === 'erro' ? 'não salvo' : 'salvo'}
      {sync?.connected && estado !== 'erro' && (
        <span className={cn(sync.lastError && 'text-warning')}>
          {' · '}
          {descreverSync(sync)}
        </span>
      )}
    </p>
  );

  return (
    <Section
      className="min-h-0"
      eyebrow="Notas rápidas"
      count={notes.length > 0 ? String(notes.length) : undefined}
      actions={
        <IconAction
          variant="outline"
          label="Nova nota"
          onClick={() => void criar()}
          icon={<Plus className="size-4" />}
        />
      }
    >
      {erro && <PanelError>{erro}</PanelError>}

      {!carregando && notes.length === 0 && (
        <EmptyState title="Nenhuma nota ainda." description="Crie a primeira." />
      )}

      {notes.length > 0 && (
        <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[minmax(140px,26%)_1fr]">
          {/* As abas ficam na vertical e rolam sozinhas: com muitas notas, é a
              coluna que rola, não o painel inteiro. */}
          <ul
            className="max-h-[40vh] min-h-0 overflow-y-auto pr-2 md:max-h-full md:border-r md:border-line-soft"
            aria-label="notas"
          >
            {notes.map((note) => (
              <li
                key={note.id}
                className={cn(
                  // A aba ativa é a mesma faixa do item ativo da barra lateral:
                  // tinta da marca que se dissolve e uma barra de 3px. Uma
                  // superfície sólida aqui virava um bloco preto no tema escuro.
                  'group relative flex items-center gap-1 pr-1 transition-colors duration-100 ease-brand motion-reduce:transition-none',
                  note.id === ativa
                    ? [
                        'bg-[linear-gradient(to_right,var(--brand-tint),transparent_85%)]',
                        "before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-brand before:content-['']",
                        'dark:before:shadow-[0_0_8px_0_var(--brand)]',
                      ]
                    : 'hover:bg-glass-line',
                )}
              >
                {renomeando === note.id ? (
                  <Input
                    className="h-8 min-w-0 flex-1 px-2 text-sm"
                    aria-label={`renomear ${note.title || 'sem título'}`}
                    defaultValue={note.title}
                    autoFocus
                    onBlur={(e) => void renomear(note, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur();
                      if (e.key === 'Escape') setRenomeando(null);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className={cn(
                      'min-w-0 flex-1 truncate py-2 pr-2 pl-4 text-left text-sm transition-colors',
                      note.id === ativa ? 'text-ink' : 'text-ink-mid hover:text-ink',
                      focusRing,
                    )}
                    aria-current={note.id === ativa}
                    onClick={() => void trocarAba(note.id)}
                    onDoubleClick={() => comecarRenomear(note.id)}
                    title="Clique duplo para renomear"
                  >
                    {note.title || 'sem título'}
                  </button>
                )}
                {renomeando !== note.id && (
                  <button
                    type="button"
                    className={cn(
                      'flex size-6 shrink-0 items-center justify-center rounded-md border border-transparent text-ink-dim opacity-0 transition-[opacity,color,border-color] hover:border-line-strong hover:text-ink focus-visible:opacity-100 group-hover:opacity-100',
                      note.id === ativa && 'opacity-100',
                      focusRing,
                    )}
                    aria-label={`mudar o título de ${note.title || 'sem título'}`}
                    title="Renomear"
                    onClick={() => comecarRenomear(note.id)}
                  >
                    <Pencil className="size-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  className={cn(
                    'flex size-6 shrink-0 items-center justify-center rounded-md border border-transparent text-ink-dim opacity-0 transition-[opacity,color,border-color] hover:border-danger/40 hover:text-danger focus-visible:opacity-100 group-hover:opacity-100',
                    note.id === ativa && 'opacity-100',
                    focusRing,
                  )}
                  aria-label={`apagar ${note.title || 'sem título'}`}
                  onClick={() => void apagar(note)}
                >
                  <Trash width={14} height={14} />
                </button>
              </li>
            ))}
          </ul>

          <div className="flex min-h-0 flex-col gap-2">
            {barra(false)}
            {maximizada ? (
              <p className="type-caption flex min-h-40 flex-1 items-center justify-center rounded-md border border-dashed border-line-strong text-ink-dim">
                Aberta em tela cheia.
              </p>
            ) : (
              corpo(false)
            )}
            {situacao}
          </div>
        </div>
      )}

      {/* A nota em tela cheia é o mesmo editor, no diálogo da app: Esc e o
          botão de restaurar voltam ao painel com o foco onde estava. */}
      <Dialog open={maximizada && notaAtiva !== null} onOpenChange={alternarMaximizada}>
        <DialogContent
          className="flex h-[calc(100dvh-2rem)] w-full flex-col gap-3 sm:max-w-[min(72rem,calc(100%-2rem))]"
          // Maximizar é para escrever: o foco vai ao texto, não ao primeiro
          // botão da barra (que ainda abriria a dica dele por cima).
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (campoTelaCheia.current ?? (e.currentTarget as HTMLElement)).focus();
          }}
          // Na volta, o foco vai ao texto do painel — o botão que abriu o
          // diálogo pode nem estar mais visível, e escrever é o que se fazia.
          onCloseAutoFocus={(e) => {
            if (!campoPainel.current) return;
            e.preventDefault();
            campoPainel.current.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle className="truncate">{notaAtiva?.title || 'sem título'}</DialogTitle>
            <DialogDescription className="sr-only">
              Nota em tela cheia. Esc volta ao painel.
            </DialogDescription>
          </DialogHeader>
          {barra(true)}
          {corpo(true)}
          {situacao}
        </DialogContent>
      </Dialog>
      {dialog}
    </Section>
  );
}
