'use client';

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
    <div className="tabs" role="tablist" aria-label={label}>
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
            className={`tab${selecionada ? ' is-active' : ''}`}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') mover(indice, 1);
              if (e.key === 'ArrowLeft') mover(indice, -1);
            }}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className="section-count mono"> {tab.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
