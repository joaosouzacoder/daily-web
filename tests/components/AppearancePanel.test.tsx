import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AppearancePanel } from '@/components/AppearancePanel';
import { SKINS } from '@/lib/skins';

beforeEach(() => {
  delete document.documentElement.dataset.skin;
  document.cookie = 'skin=; path=/; max-age=0';
});

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.skin;
  document.cookie = 'skin=; path=/; max-age=0';
});

describe('AppearancePanel', () => {
  // A lista vem do registro: um skin novo aparece aqui sem tocar nesta tela.
  it('oferece um botão por skin declarado, com a explicação', () => {
    render(<AppearancePanel />);

    for (const skin of SKINS) {
      const opcao = screen.getByRole('radio', { name: new RegExp(skin.label) });
      expect(opcao, skin.id).toBeInTheDocument();
      expect(opcao.textContent).toContain(skin.description);
    }
    expect(screen.getAllByRole('radio')).toHaveLength(SKINS.length);
  });

  it('marca o padrão quando a raiz não diz nada', () => {
    render(<AppearancePanel />);
    expect(screen.getByRole('radio', { name: /Vidro/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Relevo/ })).not.toBeChecked();
  });

  // A raiz é a verdade: um cookie apagado em outra aba deixaria esta tela
  // mostrando uma escolha que não vale mais.
  it('mostra o que a raiz já está estampando', () => {
    document.documentElement.dataset.skin = 'relief';
    render(<AppearancePanel />);
    expect(screen.getByRole('radio', { name: /Relevo/ })).toBeChecked();
  });

  it('escolher aplica na raiz e guarda a escolha', () => {
    render(<AppearancePanel />);

    fireEvent.click(screen.getByRole('radio', { name: /Relevo/ }));

    expect(document.documentElement.dataset.skin).toBe('relief');
    expect(document.cookie).toContain('skin=relief');
    expect(screen.getByRole('radio', { name: /Relevo/ })).toBeChecked();
  });

  it('voltar ao padrão limpa a raiz', () => {
    document.documentElement.dataset.skin = 'relief';
    render(<AppearancePanel />);

    fireEvent.click(screen.getByRole('radio', { name: /Vidro/ }));

    expect(document.documentElement.dataset.skin).toBeUndefined();
    expect(screen.getByRole('radio', { name: /Vidro/ })).toBeChecked();
  });
});
