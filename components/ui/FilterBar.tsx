'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { Sheet } from './Sheet';

// No desktop os controles ficam inline. Em telas pequenas colapsam num
// botão que abre a mesma coleção de controles numa folha de tela cheia,
// com ação explícita para aplicar.
export function FilterBar({ label, children }: { label: string; children: ReactNode }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  return (
    <>
      <div className="filter-bar">{children}</div>
      <button type="button" className="btn filter-trigger" onClick={() => setSheetOpen(true)}>
        Filtrar
      </button>
      <Sheet open={sheetOpen} title={label} onClose={() => setSheetOpen(false)}>
        <div className="filter-sheet-body">{children}</div>
      </Sheet>
    </>
  );
}
