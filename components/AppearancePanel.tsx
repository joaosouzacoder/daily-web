'use client';

import { useEffect, useState } from 'react';

import { SKINS, applySkin, readSkin, type Skin } from '@/lib/skins';
import { focusRing } from '@/lib/theme';
import { Section } from './ui/Section';

/**
 * Escolher o skin. Vive na configuração, e não no menu da conta, porque é uma
 * decisão sobre a aparência inteira da app, tomada uma vez, e não um ajuste que
 * se faz várias vezes ao dia como o tema claro e escuro.
 *
 * A lista vem de `SKINS`: um skin novo aparece aqui sem tocar nesta tela.
 */
export function AppearancePanel() {
  const [skin, setSkin] = useState<Skin>('default');

  // O elemento raiz é a verdade: o servidor já o estampou, e um cookie apagado
  // em outra aba deixaria esta tela mostrando uma escolha que não vale mais.
  useEffect(() => setSkin(readSkin()), []);

  const escolher = (id: Skin) => {
    applySkin(id);
    setSkin(id);
  };

  return (
    <Section eyebrow="Aparência">
      <p className="max-w-[60ch] text-sm text-ink-mid">
        Como as superfícies da app são desenhadas. Vale para todas as telas e para os módulos
        que vierem depois.
      </p>

      <div role="radiogroup" aria-label="Estilo visual" className="flex flex-col gap-2">
        {SKINS.map((opcao) => {
          const ativo = opcao.id === skin;
          return (
            <button
              key={opcao.id}
              type="button"
              role="radio"
              aria-checked={ativo}
              onClick={() => escolher(opcao.id)}
              className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-colors ${focusRing} ${
                ativo ? 'border-border-primary bg-sidebar-accent' : 'hover:bg-accent'
              }`}
            >
              {/* Um círculo em toda opção, cheio na escolhida. Só a marca na
                  ativa fazia as duas linhas lerem como texto informativo, e
                  quem olhava não percebia que havia o que clicar. */}
              <span
                aria-hidden="true"
                className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2 ${
                  ativo ? 'border-brand' : 'border-outline'
                }`}
              >
                {ativo && <span className="size-2 rounded-full bg-brand" />}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-medium">{opcao.label}</span>
                <span className="text-sm text-ink-mid">{opcao.description}</span>
              </span>
            </button>
          );
        })}
      </div>
    </Section>
  );
}
