import type { ReactNode } from 'react';

interface Props {
  eyebrow: string;
  count?: string;
  actions?: ReactNode;
  /** Para o painel que precisa impor altura ao próprio conteúdo — sem uma
   *  classe aqui, o conteúdo não tem ancestral com altura definida. */
  className?: string;
  children: ReactNode;
}

// Seções são delimitadas por rótulo + linha fina, nunca por caixa.
export function Section({ eyebrow, count, actions, className, children }: Props) {
  return (
    <section className={className}>
      <header className="section-head">
        <div className="section-title">
          <h2 className="eyebrow">{eyebrow}</h2>
          {count && <span className="section-count mono">{count}</span>}
        </div>
        {actions && <div className="section-actions">{actions}</div>}
      </header>
      {children}
    </section>
  );
}
