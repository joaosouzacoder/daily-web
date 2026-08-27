'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Trash } from 'iconoir-react';
import type { Note } from '@/lib/types';
import { Section } from './ui/Section';
import { EmptyState } from './ui/EmptyState';

/** Quanto o texto fica parado antes de subir. Curto o bastante para não se
 *  perder ao fechar a aba, longo o bastante para não gravar a cada tecla. */
const AUTOSAVE_MS = 700;

type Estado = 'salvo' | 'salvando' | 'erro';

export function NotesPanel() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [ativa, setAtiva] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [estado, setEstado] = useState<Estado>('salvo');
  const [erro, setErro] = useState<string | null>(null);
  const [renomeando, setRenomeando] = useState<string | null>(null);

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
      .then((data: { notes?: Note[]; error?: string }) => {
        if (cancelado) return;
        const lista = data.notes ?? [];
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
    if (!window.confirm(`Apagar a nota "${note.title || 'sem título'}"?`)) return;
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

  const renomear = async (note: Note, titulo: string) => {
    setRenomeando(null);
    const limpo = titulo.trim();
    if (!limpo || limpo === note.title) return;
    await gravar(note.id, { title: limpo });
  };

  const notaAtiva = notes.find((n) => n.id === ativa) ?? null;

  return (
    <Section
      className="notes-section"
      eyebrow="Notas rápidas"
      count={notes.length > 0 ? String(notes.length) : undefined}
      actions={
        <button type="button" className="btn" onClick={() => void criar()}>
          Nova nota
        </button>
      }
    >
      {erro && (
        <p role="alert" className="panel-error">
          {erro}
        </p>
      )}

      {!carregando && notes.length === 0 && (
        <EmptyState message="Nenhuma nota ainda. Crie a primeira." />
      )}

      {notes.length > 0 && (
        <div className="notes">
          {/* As abas ficam na vertical e rolam sozinhas: com muitas notas, é a
              coluna que rola, não o painel inteiro. */}
          <ul className="notes-tabs" aria-label="notas">
            {notes.map((note) => (
              <li key={note.id} className={`notes-tab${note.id === ativa ? ' is-active' : ''}`}>
                {renomeando === note.id ? (
                  <input
                    className="field notes-tab-input"
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
                    className="notes-tab-name"
                    aria-current={note.id === ativa}
                    onClick={() => void trocarAba(note.id)}
                    onDoubleClick={() => setRenomeando(note.id)}
                    title="Clique duplo para renomear"
                  >
                    {note.title || 'sem título'}
                  </button>
                )}
                <button
                  type="button"
                  className="icon-btn icon-btn-danger notes-tab-remove"
                  aria-label={`apagar ${note.title || 'sem título'}`}
                  onClick={() => void apagar(note)}
                >
                  <Trash width={14} height={14} />
                </button>
              </li>
            ))}
          </ul>

          <div className="notes-editor">
            <textarea
              className="field notes-text"
              aria-label={`texto de ${notaAtiva?.title || 'sem título'}`}
              placeholder="Escreva aqui. O que você digita é salvo sozinho."
              value={rascunho}
              onChange={(e) => digitar(e.target.value)}
              onBlur={() => void gravarPendente()}
            />
            <p className="notes-status" role="status">
              {estado === 'salvando' ? 'salvando…' : estado === 'erro' ? 'não salvo' : 'salvo'}
            </p>
          </div>
        </div>
      )}
    </Section>
  );
}
