import { describe, expect, it, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { MarkdownView } from '@/components/MarkdownView';

afterEach(cleanup);

function html(source: string): HTMLElement {
  const { container } = render(<MarkdownView source={source} />);
  return container;
}

/** Nenhum atributo `on*` e nenhum endereço executável em toda a árvore. */
function expectInert(root: HTMLElement) {
  for (const el of root.querySelectorAll('*')) {
    for (const attr of el.attributes) {
      expect(attr.name.startsWith('on'), `${el.tagName} ${attr.name}`).toBe(false);
      if (['href', 'src', 'action', 'formaction', 'xlink:href'].includes(attr.name)) {
        expect(attr.value.trim().toLowerCase()).not.toMatch(/^(javascript|vbscript|data):/);
      }
    }
  }
  for (const tag of ['script', 'iframe', 'object', 'embed', 'style', 'form', 'svg', 'math']) {
    expect(root.querySelector(tag), tag).toBeNull();
  }
}

describe('MarkdownView — GFM', () => {
  it('tabela', () => {
    const root = html('| a | b |\n|---|---|\n| 1 | 2 |');
    expect([...root.querySelectorAll('th')].map((th) => th.textContent)).toEqual(['a', 'b']);
    expect([...root.querySelectorAll('td')].map((td) => td.textContent)).toEqual(['1', '2']);
  });

  it('lista de tarefas com caixa marcada e desmarcada, só leitura', () => {
    const root = html('- [x] feito\n- [ ] falta');
    const boxes = [...root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    expect(boxes.map((b) => b.checked)).toEqual([true, false]);
    expect(boxes.every((b) => b.disabled)).toBe(true);
  });

  it('riscado e link automático', () => {
    const root = html('~~velho~~ em https://exemplo.com');
    expect(root.querySelector('del')?.textContent).toBe('velho');
    expect(root.querySelector('a')?.getAttribute('href')).toBe('https://exemplo.com');
  });

  it('bloco de código com a linguagem declarada sai realçado', () => {
    const root = html('```ts\nconst total = 1;\n```');
    const code = root.querySelector('pre > code');
    expect(code?.className).toContain('language-ts');
    expect(code?.querySelector('.hljs-keyword')?.textContent).toBe('const');
    expect(code?.textContent).toBe('const total = 1;\n');
  });

  it('link abre em outra aba sem dar acesso à página de origem', () => {
    const a = html('[doc](https://exemplo.com/doc)').querySelector('a');
    expect(a?.getAttribute('href')).toBe('https://exemplo.com/doc');
    expect(a?.getAttribute('target')).toBe('_blank');
    expect(a?.getAttribute('rel')).toContain('noopener');
  });

  it('cabeçalhos, citação e código em linha', () => {
    const root = html('# Um\n\n> citado\n\nuse `npm ci`');
    expect(root.querySelector('h1')?.textContent).toBe('Um');
    expect(root.querySelector('blockquote')?.textContent?.trim()).toBe('citado');
    expect(root.querySelector('p > code')?.textContent).toBe('npm ci');
  });
});

describe('MarkdownView — sanitização', () => {
  it('HTML cru não vira elemento', () => {
    const root = html('<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n\n<iframe src="https://mal.example"></iframe>');
    expectInert(root);
    expect(root.querySelector('img')).toBeNull();
  });

  it('HTML em linha no meio do texto também não', () => {
    const root = html('oi <b onclick="alert(1)">x</b> <a href="javascript:alert(1)">y</a>');
    expectInert(root);
    expect(root.querySelector('b')).toBeNull();
  });

  it('link com javascript: perde o destino', () => {
    for (const source of [
      '[clique](javascript:alert(1))',
      '[clique](JaVaScRiPt:alert(1))',
      '[clique](  javascript:alert(1))',
      '[clique](vbscript:msgbox(1))',
      '[clique](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)',
      '<javascript:alert(1)>',
    ]) {
      expectInert(html(source));
    }
  });

  it('imagem com endereço executável perde o endereço', () => {
    expectInert(html('![x](javascript:alert(1))'));
  });

  it('referência de link com javascript: perde o destino', () => {
    expectInert(html('[a][r]\n\n[r]: javascript:alert(1)'));
  });

  it('a linguagem do bloco de código não injeta classe arbitrária', () => {
    const root = html('```x" onmouseover="alert(1)\ncódigo\n```');
    expectInert(root);
  });

  it('id de nota de rodapé não colide com os da página', () => {
    const root = html('texto[^1]\n\n[^1]: nota');
    for (const el of root.querySelectorAll('[id]')) {
      expect(el.id.startsWith('user-content-')).toBe(true);
    }
  });
});
