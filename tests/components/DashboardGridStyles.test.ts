import { describe, expect, it, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// As regras da grade miram classes que a react-grid-layout gera, então só dá
// para verificá-las contra a folha de estilo de verdade. A árvore abaixo é a
// que a biblioteca monta no modo de organizar: o painel e, como irmão do
// conteúdo, a alça de redimensionar que ela injeta dentro do item.
beforeAll(() => {
  const css = readFileSync(path.resolve(__dirname, '../../app/globals.css'), 'utf8')
    // Os @import resolvem pacotes que o jsdom não sabe buscar.
    .replace(/^@import .*$/gm, '');
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  document.body.innerHTML = `
    <div class="dashboard-grid is-arranging">
      <div class="react-grid-item" data-slot="grid-panel">
        <section id="conteudo">painel</section>
        <span class="react-resizable-handle react-resizable-handle-se"></span>
      </div>
    </div>`;
});

describe('estilos da grade no modo de organizar', () => {
  it('a alça de redimensionar continua recebendo o ponteiro', () => {
    const alça = document.querySelector('.react-resizable-handle')!;
    expect(getComputedStyle(alça).pointerEvents).not.toBe('none');
  });

  it('o conteúdo do painel não captura o ponteiro', () => {
    const conteúdo = document.getElementById('conteudo')!;
    expect(getComputedStyle(conteúdo).pointerEvents).toBe('none');
  });
});
