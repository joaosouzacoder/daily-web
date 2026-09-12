'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import {
  Bold,
  Code,
  Eye,
  FolderPlus,
  Heading2,
  Italic,
  Link,
  List,
  ListChecks,
  ListOrdered,
  Maximize2,
  Minimize2,
  PanelLeft,
  Pencil,
  Plus,
  Quote,
  SquareCode,
  Strikethrough,
} from 'lucide-react';
import { IconAction } from '@/components/data/IconAction';
import type { Note, NoteFolder } from '@/lib/types';
import { PanelError } from '@/components/data/PanelError';
import { useConfirm } from '@/components/data/ConfirmDialog';
import { SearchInput } from '@/components/ui/SearchInput';
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
import { NoteTree, ALL_KEY, NONE_KEY, type Scope } from './notes/NoteTree';
import { NoteSearchResults } from './notes/NoteSearchResults';
import { searchNotes } from '@/lib/notesSearch';
import { descendantIds } from '@/lib/notesTree';
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

/** Espera da busca. A consulta corre sobre o texto inteiro de cada nota;
 *  refazer isso a cada tecla pisca a lista sem necessidade. */
const SEARCH_DEBOUNCE_MS = 250;

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
  const [folders, setFolders] = useState<NoteFolder[]>([]);
  const [ativa, setAtiva] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [estado, setEstado] = useState<Estado>('salvo');
  const [erro, setErro] = useState<string | null>(null);
  const [renomeando, setRenomeando] = useState<string | null>(null);
  const [lendo, setLendo] = useState(false);
  const [maximizada, setMaximizada] = useState(false);
  const [sync, setSync] = useState<NotesSyncStatus | null>(null);

  // A navegação: o que está selecionado na árvore, o que está aberto e se a
  // barra lateral cabe na tela. Fica aqui, e não dentro da árvore, porque a
  // mesma navegação serve ao painel e ao diálogo — maximizar não pode perder
  // a nota escolhida nem as pastas abertas.
  const [escopo, setEscopo] = useState<Scope>({ kind: 'all' });
  const [abertas, setAbertas] = useState<Set<string>>(() => new Set([NONE_KEY]));
  const [barraAberta, setBarraAberta] = useState(true);

  const [busca, setBusca] = useState('');
  const [consulta, setConsulta] = useState('');
  const [soNaPasta, setSoNaPasta] = useState(false);

  const campoAtual = () => (maximizada ? campoTelaCheia.current : campoPainel.current);
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
      .then(
        (data: {
          notes?: Note[];
          folders?: NoteFolder[];
          sync?: NotesSyncStatus;
          error?: string;
        }) => {
          if (cancelado) return;
          const lista = data.notes ?? [];
          setSync(data.sync ?? null);
          setNotes(lista);
          setFolders(data.folders ?? []);
          setAtiva(lista[0]?.id ?? null);
          setRascunho(lista[0]?.body ?? '');
          setErro(data.error ?? null);
        },
      )
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

  // A consulta só vira busca depois de uma pausa na digitação.
  useEffect(() => {
    const id = setTimeout(() => setConsulta(busca), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [busca]);

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

  /** Trocar de nota grava o que estava pendente antes de o rascunho virar
   *  outro texto — sem isto, o que foi digitado por último se perderia. */
  const abrirNota = async (id: string) => {
    if (id === ativa) return;
    await gravarPendente();
    setAtiva(id);
    setRascunho(notes.find((n) => n.id === id)?.body ?? '');
  };

  const pastaDoEscopo = escopo.kind === 'folder' ? escopo.id : null;

  const criar = async () => {
    await gravarPendente();
    const res = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: `Nota ${notes.length + 1}`, folderId: pastaDoEscopo }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErro(data.error ?? 'Falha ao criar a nota');
      return;
    }
    const nota = data.note as Note;
    setErro(null);
    setNotes((prev) => [...prev, nota]);
    setAtiva(nota.id);
    setRascunho('');
    // A nota nova precisa estar à vista para ser renomeada.
    abrir(nota.folderId ?? NONE_KEY);
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

  /** Título vazio não apaga o nome: volta ao que era. Sem nome a aba vira
   *  "sem título" e o arquivo no Drive também — raramente é o que se quis. */
  const renomear = async (id: string, titulo: string) => {
    const note = notes.find((n) => n.id === id);
    const limpo = titulo.trim();
    if (!note || !limpo || limpo === note.title) return;
    await gravar(note.id, { title: limpo });
  };

  const abrir = (key: string) => setAbertas((prev) => new Set(prev).add(key));

  const alternarAberta = (key: string) =>
    setAbertas((prev) => {
      const proximo = new Set(prev);
      if (!proximo.delete(key)) proximo.add(key);
      return proximo;
    });

  // --- Pastas -----------------------------------------------------------------

  const moverNota = async (noteId: string, folderId: string | null) => {
    const note = notes.find((n) => n.id === noteId);
    if (!note || note.folderId === folderId) return;
    // O texto pendente sobe primeiro: a resposta do move traz a nota inteira
    // e sobrescreveria o que ainda não foi gravado.
    await gravarPendente();

    const res = await fetch(`/api/notes/${encodeURIComponent(noteId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErro(data.error ?? 'Falha ao mover a nota');
      return;
    }
    setErro(null);
    setNotes((prev) => prev.map((n) => (n.id === noteId ? (data.note as Note) : n)));
    abrir(folderId ?? NONE_KEY);
  };

  const criarPasta = async (parentId: string | null) => {
    const res = await fetch('/api/notes/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Nova pasta', parentId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErro(data.error ?? 'Falha ao criar a pasta');
      return;
    }
    const pasta = data.folder as NoteFolder;
    setErro(null);
    setFolders((prev) => [...prev, pasta]);
    if (parentId) abrir(parentId);
    // Nasce com o nome em edição: ninguém quer ficar com "Nova pasta".
    setRenomeando(pasta.id);
  };

  const renomearPasta = async (id: string, nome: string) => {
    const pasta = folders.find((f) => f.id === id);
    const limpo = nome.trim();
    if (!pasta || !limpo || limpo === pasta.name) return;
    const res = await fetch(`/api/notes/folders/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: limpo }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErro(data.error ?? 'Falha ao renomear a pasta');
      return;
    }
    setErro(null);
    setFolders((prev) => prev.map((f) => (f.id === id ? (data.folder as NoteFolder) : f)));
  };

  const moverPasta = async (id: string, parentId: string | null) => {
    const pasta = folders.find((f) => f.id === id);
    if (!pasta || pasta.parentId === parentId) return;
    const res = await fetch(`/api/notes/folders/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErro(data.error ?? 'Falha ao mover a pasta');
      return;
    }
    setErro(null);
    setFolders((prev) => prev.map((f) => (f.id === id ? (data.folder as NoteFolder) : f)));
    if (parentId) abrir(parentId);
  };

  const apagarPasta = async (folder: NoteFolder) => {
    const dentro = descendantIds(folders, folder.id);
    const subpastas = dentro.length - 1;
    const notasDentro = notes.filter((n) => n.folderId && dentro.includes(n.folderId)).length;

    const efeito = [
      subpastas > 0 && `${subpastas} ${subpastas === 1 ? 'subpasta' : 'subpastas'}`,
      notasDentro > 0 && `${notasDentro} ${notasDentro === 1 ? 'nota' : 'notas'}`,
    ].filter(Boolean);

    const ok = await confirm({
      title: `Apagar a pasta "${folder.name}"?`,
      description:
        efeito.length === 0
          ? 'A pasta está vazia e será removida.'
          : `A pasta tem ${efeito.join(' e ')}. ${
              notasDentro > 0
                ? 'Nenhuma nota é apagada: todas vão para "Sem pasta". '
                : ''
            }${subpastas > 0 ? 'As subpastas são removidas junto.' : ''}`,
      confirmLabel: notasDentro > 0 ? 'Apagar e mover para Sem pasta' : 'Apagar',
      destructive: true,
    });
    if (!ok) return;

    const res = await fetch(`/api/notes/folders/${encodeURIComponent(folder.id)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      setErro('Falha ao apagar a pasta');
      return;
    }
    setErro(null);
    setFolders((prev) => prev.filter((f) => !dentro.includes(f.id)));
    setNotes((prev) =>
      prev.map((n) => (n.folderId && dentro.includes(n.folderId) ? { ...n, folderId: null } : n)),
    );
    if (escopo.kind === 'folder' && dentro.includes(escopo.id)) setEscopo({ kind: 'all' });
  };

  // --- Busca ------------------------------------------------------------------

  const escopoDaBusca = useMemo(() => {
    if (!soNaPasta) return null;
    if (escopo.kind === 'folder') return descendantIds(folders, escopo.id);
    if (escopo.kind === 'none') return [null];
    return null;
  }, [soNaPasta, escopo, folders]);

  const resultados = useMemo(
    () => searchNotes(notes, folders, consulta, { scopeIds: escopoDaBusca }),
    [notes, folders, consulta, escopoDaBusca],
  );

  const buscando = consulta.trim().length > 0;

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
    <div className="flex shrink-0 items-start gap-2" role="toolbar" aria-label="formatação Markdown">
      <IconAction
        label={barraAberta ? 'Esconder a lista' : 'Mostrar a lista'}
        aria-pressed={barraAberta}
        icon={<PanelLeft className="size-4" />}
        onClick={() => setBarraAberta((v) => !v)}
      />
      {/* A formatação quebra linha quando o painel é estreito; ler e
          maximizar ficam sempre no canto superior direito. */}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-0.5">
        {FERRAMENTAS.map((f) => (
          <IconAction
            key={f.action}
            label={f.label}
            icon={f.icon}
            disabled={lendo || !notaAtiva || (maximizada && !emTelaCheia)}
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

  /** O texto da nota. Rola dentro da própria caixa — a barra de formatação
   *  fica fora da área que rola, e por isso continua alcançável por mais
   *  longa que a nota seja. */
  const corpo = (emTelaCheia: boolean) => {
    if (!notaAtiva) {
      return (
        <div className="flex min-h-40 flex-1 items-center justify-center rounded-md border border-dashed border-line-strong">
          <p className="type-caption text-ink-dim">Escolha uma nota na lista.</p>
        </div>
      );
    }
    return lendo ? (
      <div
        className="min-h-0 flex-1 overflow-y-auto rounded-md border border-line-soft px-3 py-2 text-sm [scrollbar-gutter:stable]"
        aria-label={`visualização de ${notaAtiva.title || 'sem título'}`}
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
        className="h-full min-h-0 flex-1 resize-none overflow-y-auto font-mono leading-relaxed [field-sizing:fixed] [scrollbar-gutter:stable]"
        aria-label={`texto de ${notaAtiva.title || 'sem título'}`}
        placeholder="Escreva aqui, em Markdown. O que você digita é salvo sozinho."
        value={rascunho}
        onChange={(e) => digitar(e.target.value)}
        onKeyDown={teclar}
        onBlur={() => void gravarPendente()}
      />
    );
  };

  const situacao = (
    <p className="type-caption shrink-0 text-right text-ink-dim" role="status">
      {estado === 'salvando' ? 'salvando…' : estado === 'erro' ? 'não salvo' : 'salvo'}
      {sync?.connected && estado !== 'erro' && (
        <span className={cn(sync.lastError && 'text-warning')}>
          {' · '}
          {descreverSync(sync)}
        </span>
      )}
    </p>
  );

  /** A barra lateral: busca em cima, e embaixo a árvore ou os resultados.
   *  Só ela rola — o painel inteiro fica parado. */
  const lateral = (
    <aside className="flex max-h-[45vh] min-h-0 flex-col gap-2 overflow-hidden md:max-h-full md:border-r md:border-line-soft md:pr-2">
      <div className="flex shrink-0 flex-col gap-1">
        {/* O campo é feito para uma barra horizontal: a base dele é largura,
            e numa coluna viraria altura. */}
        <div className="flex">
          <SearchInput
            value={busca}
            onChange={setBusca}
            label="Buscar notas"
            placeholder="Buscar no título ou conteúdo"
          />
        </div>
        {buscando && (escopo.kind === 'folder' || escopo.kind === 'none') && (
          <label className="flex items-center gap-1.5 type-caption text-ink-dim">
            <input
              type="checkbox"
              className={cn('size-3.5 accent-[var(--brand)]', focusRing)}
              checked={soNaPasta}
              onChange={(e) => setSoNaPasta(e.target.checked)}
            />
            Só nesta pasta e subpastas
          </label>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-gutter:stable]">
        {buscando ? (
          <NoteSearchResults
            results={resultados}
            activeNoteId={ativa}
            onOpen={(id) => void abrirNota(id)}
          />
        ) : (
          <NoteTree
            folders={folders}
            notes={notes}
            activeNoteId={ativa}
            scope={escopo}
            expanded={abertas}
            renaming={renomeando}
            onRenaming={setRenomeando}
            onToggle={alternarAberta}
            onSelectScope={setEscopo}
            onSelectNote={(id) => void abrirNota(id)}
            onMoveNote={(noteId, folderId) => void moverNota(noteId, folderId)}
            onMoveFolder={(id, parentId) => void moverPasta(id, parentId)}
            onRenameFolder={(id, name) => void renomearPasta(id, name)}
            onCreateFolder={(parentId) => void criarPasta(parentId)}
            onDeleteFolder={(folder) => void apagarPasta(folder)}
            onRenameNote={(id, title) => void renomear(id, title)}
            onDeleteNote={(note) => void apagar(note)}
          />
        )}
      </div>
    </aside>
  );

  const acoes = (
    <div className="flex items-center gap-1">
      <IconAction
        variant="outline"
        label="Nova pasta"
        onClick={() => void criarPasta(pastaDoEscopo)}
        icon={<FolderPlus className="size-4" />}
      />
      <IconAction
        variant="outline"
        label="Nova nota"
        onClick={() => void criar()}
        icon={<Plus className="size-4" />}
      />
    </div>
  );

  const vazio = !carregando && notes.length === 0 && folders.length === 0;

  return (
    <Section
      className="min-h-0"
      eyebrow="Notas rápidas"
      count={notes.length > 0 ? String(notes.length) : undefined}
      actions={acoes}
    >
      {erro && <PanelError>{erro}</PanelError>}

      {vazio && <EmptyState title="Nenhuma nota ainda." description="Crie a primeira." />}

      {!vazio && (
        <div
          className={cn(
            // `h-full` é o que dá altura de verdade ao editor: o corpo do
            // painel é um container que rola, e num container assim `flex-1`
            // não limita nada — a nota longa empurrava a barra de formatação
            // para fora do cartão em vez de rolar dentro dele.
            'grid h-full min-h-0 gap-4 overflow-hidden',
            barraAberta && !maximizada && 'md:grid-cols-[minmax(180px,28%)_1fr]',
          )}
        >
          {/* Em tela cheia a lista é a do diálogo: duas iguais na mesma
              página seriam dois alvos para a mesma ação. */}
          {barraAberta && !maximizada && lateral}

          <div className="flex min-h-0 flex-col gap-2 overflow-hidden">
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
          botão de restaurar voltam ao painel com o foco onde estava. A
          navegação é a mesma da barra lateral, então trocar de nota aqui não
          fecha nada. */}
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
          <div
            className={cn(
              'grid min-h-0 flex-1 gap-4 overflow-hidden',
              barraAberta && 'md:grid-cols-[minmax(220px,20rem)_1fr]',
            )}
          >
            {barraAberta && lateral}
            <div className="flex min-h-0 flex-col gap-2 overflow-hidden">
              {barra(true)}
              {corpo(true)}
              {situacao}
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {dialog}
    </Section>
  );
}
