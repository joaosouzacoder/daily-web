'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { PanelError } from '@/components/data/PanelError';
import { Section } from './ui/Section';

/**
 * Restaurar a disposição dos painéis. Vive aqui, e não no próprio painel,
 * porque é uma ação rara: no dashboard ela ocupava espaço permanente na faixa
 * do topo por causa de algo que se faz uma vez a cada muitos meses.
 */
export function LayoutPanel() {
  const [padrao, setPadrao] = useState<boolean | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [restaurando, setRestaurando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    void fetch('/api/state')
      .then((r) => (r.ok ? r.json() : null))
      .then((estado) => {
        if (cancelado || !estado) return;
        // Comparar contra o padrão exige o padrão; pedi-lo ao servidor
        // evitaria duplicar a definição, mas ele já vem no próprio estado
        // quando ninguém mexeu — a diferença é o que interessa aqui.
        return fetch('/api/preferences/layout-default')
          .then((r) => (r.ok ? r.json() : null))
          .then((padraoDoServidor) => {
            if (cancelado || !padraoDoServidor) return;
            setPadrao(JSON.stringify(estado.layout) === JSON.stringify(padraoDoServidor.layout));
          });
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, []);

  const restaurar = async () => {
    setRestaurando(true);
    setErro(null);
    const res = await fetch('/api/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ layout: null }),
    });
    setRestaurando(false);
    if (!res.ok) {
      setErro('Falha ao restaurar a disposição');
      return;
    }
    setPadrao(true);
  };

  return (
    <Section eyebrow="Disposição dos painéis">
      <p className="max-w-[60ch] text-sm text-ink-mid">
        No painel, clique em <strong>Organizar</strong> para mover os painéis arrastando e
        redimensioná-los pelo canto. Clique em <strong>Concluir</strong> quando terminar.
      </p>

      {erro && <PanelError>{erro}</PanelError>}

      {padrao === true && (
        <p className="type-caption py-6 text-ink-dim">Os painéis estão na disposição padrão.</p>
      )}

      {padrao === false && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          disabled={restaurando}
          onClick={() => void restaurar()}
        >
          {restaurando ? 'Restaurando…' : 'Restaurar disposição padrão'}
        </Button>
      )}
    </Section>
  );
}
