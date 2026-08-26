import { describe, expect, it } from 'vitest';
import { readable, sortFolders } from '@/lib/parsers/mail';

describe('readable', () => {
  it('devolve texto puro sem alteração além de colapsar linhas em branco', () => {
    expect(readable('linha 1\n\n\n\nlinha 2')).toBe('linha 1\n\nlinha 2');
  });

  it('converte HTML simples em texto legível', () => {
    const html = '<html><body><p>Olá</p><p>Segunda linha</p></body></html>';
    expect(readable(html)).toBe('Olá\n\nSegunda linha');
  });

  it('remove conteúdo de <script> e <style>', () => {
    const html = '<html><head><style>.a{color:red}</style></head><body><p>Texto</p><script>alert(1)</script></body></html>';
    expect(readable(html)).toBe('Texto');
  });

  it('decodifica entidades HTML acentuadas', () => {
    const html = '<p>Escritório &amp; equipe</p>';
    expect(readable(html)).toBe('Escritório & equipe');
  });

  it('remove conteúdo oculto com display:none', () => {
    const html = '<div style="display:none">preheader text aqui</div><p>Conteúdo real</p>';
    expect(readable(html)).toBe('Conteúdo real');
  });

  it('separa células de tabela com quebras de linha', () => {
    const html = '<table><tr><td>Total</td><td>$50.00</td></tr></table>';
    expect(readable(html)).toBe('Total\n\n$50.00');
  });

  it('remove comentários HTML MSO', () => {
    const html = '<p>Início</p><!--[if mso]><style>table{}</style><![endif]--><p>Fim</p>';
    expect(readable(html)).toBe('Início\n\nFim');
  });

  it('remove bloco display:none mesmo com tag aninhada do mesmo nome dentro', () => {
    const html = '<div style="display:none">preview <div>nested</div> more hidden text should not leak</div><p>Real content</p>';
    expect(readable(html)).toBe('Real content');
  });
});

describe('sortFolders', () => {
  it('põe as pastas conhecidas na ordem de uso, não em ordem alfabética', () => {
    expect(sortFolders(['Trabalho', 'Sent', 'INBOX', 'Trash'])).toEqual([
      'INBOX',
      'Sent',
      'Trash',
      'Trabalho',
    ]);
  });

  it('ordena o resto alfabeticamente, sem diferenciar maiúsculas', () => {
    expect(sortFolders(['zeta', 'Alfa', 'beta'])).toEqual(['Alfa', 'beta', 'zeta']);
  });
});
