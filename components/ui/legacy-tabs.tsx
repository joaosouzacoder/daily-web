'use client';

import { cn } from '@/lib/utils';
import { tabular } from '@/lib/theme';

export interface TabItem {
  id: string;
  label: string;
  /** Quantidade ao lado do rótulo. Omitida quando não há o que contar. */
  count?: number;
}

interface Props {
  /** Rótulo acessível da faixa inteira, para quem navega por leitor de tela. */
  label: string;
  /** Prefixo dos ids gerados: duas faixas na mesma página não podem colidir. */
  id: string;
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
}

// Abas de verdade, com `role="tab"`: um chip diz "filtro ligado", uma aba diz
// "outro conteúdo". As duas listas do Jira não são recortes da mesma lista,
// então o controle precisa dizer isso.
export function Tabs({ label, id, tabs, active, onChange }: Props) {
  const mover = (indice: number, passo: number) => {
    const destino = (indice + passo + tabs.length) % tabs.length;
    onChange(tabs[destino].id);
    document.getElementById(`${id}-tab-${tabs[destino].id}`)?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      className="group/tabs-list mb-4 inline-flex w-fit max-w-full items-center justify-start gap-1 overflow-x-auto rounded-full border bg-muted/70 p-[3px] shadow-e1"
    >
      {tabs.map((tab, indice) => {
        const selecionada = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`${id}-tab-${tab.id}`}
            aria-selected={selecionada}
            aria-controls={`${id}-panel-${tab.id}`}
            // O contador é um elemento à parte, e o cálculo do nome
            // acessível cola os dois sem espaço ("Entregues2"). A vírgula
            // devolve a pausa que a vista já tem pelo espaçamento.
            aria-label={tab.count ? `${tab.label}, ${tab.count}` : undefined}
            // Só a aba ativa entra na ordem do Tab; entre as abas, o
            // deslocamento é pelas setas, como manda o padrão.
            tabIndex={selecionada ? 0 : -1}
            className={cn(
              'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-transparent px-3.5 text-sm font-medium whitespace-nowrap transition-colors duration-100 ease-brand motion-reduce:transition-none',
              'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
              selecionada
                // Aro NEUTRO: uma aba acesa é um controle, não uma ação — o aro
                // do acento tingiria a peça inteira.
                ? 'bg-glass-strong text-ink shadow-control'
                : 'text-ink-mid hover:text-foreground',
            )}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') mover(indice, 1);
              if (e.key === 'ArrowLeft') mover(indice, -1);
            }}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className={`text-ink-dim ${tabular}`}>{tab.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
