import { describe, expect, it } from 'vitest';
import { readable, sortFolders, splitQuoted } from '@/lib/parsers/mail';

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

describe('splitQuoted', () => {
  // O caso real que motivou isto.
  it('separa a resposta da atribuição em português', () => {
    const { text, quoted } = splitQuoted(
      [
        'resposta à resposta',
        '',
        'Em qui., 27 de ago. de 2026 às 12:11, <joao.souza@exemplo.com>',
        'escreveu:',
        '',
        '> Teste',
        '>',
      ].join('\n'),
    );
    expect(text).toBe('resposta à resposta');
    expect(quoted).toContain('> Teste');
    expect(quoted).toContain('Em qui., 27 de ago.');
  });

  it('separa a atribuição em inglês', () => {
    const { text, quoted } = splitQuoted(
      ['thanks, will do', '', 'On Thu, Aug 27, 2026 at 12:11 PM <a@b.com> wrote:', '> hi'].join(
        '\n',
      ),
    );
    expect(text).toBe('thanks, will do');
    expect(quoted).toContain('> hi');
  });

  it('separa no marcador de mensagem original', () => {
    const { text, quoted } = splitQuoted(
      ['segue abaixo', '', '-----Mensagem original-----', 'De: alguém'].join('\n'),
    );
    expect(text).toBe('segue abaixo');
    expect(quoted).toContain('Mensagem original');
  });

  it('separa o bloco citado sem atribuição nenhuma', () => {
    const { text, quoted } = splitQuoted(['ok, combinado', '', '> pergunta anterior'].join('\n'));
    expect(text).toBe('ok, combinado');
    expect(quoted).toBe('> pergunta anterior');
  });

  // Um `>` no meio do texto é citação de uma frase, não o começo do histórico:
  // cortar ali comeria o que a pessoa escreveu depois.
  it('não corta na citação que fica no meio da mensagem', () => {
    const corpo = ['você disse:', '> não dá', '', 'mas dá sim, veja o anexo'].join('\n');
    const { text, quoted } = splitQuoted(corpo);
    expect(text).toBe(corpo);
    expect(quoted).toBe('');
  });

  it('devolve o corpo inteiro quando não há histórico', () => {
    const { text, quoted } = splitQuoted('mensagem simples, sem resposta a nada');
    expect(text).toBe('mensagem simples, sem resposta a nada');
    expect(quoted).toBe('');
  });

  it('aguenta corpo vazio', () => {
    expect(splitQuoted('')).toEqual({ text: '', quoted: '' });
  });

  // A mensagem pode ser só o encaminhamento, sem uma palavra escrita em cima.
  it('aceita resposta vazia com histórico', () => {
    const { text, quoted } = splitQuoted('> só o histórico');
    expect(text).toBe('');
    expect(quoted).toBe('> só o histórico');
  });

  it('não confunde uma linha que só menciona "escreveu"', () => {
    const corpo = 'o cliente escreveu: preciso do relatório até sexta';
    expect(splitQuoted(corpo).quoted).toBe('');
  });

  it('corta na primeira atribuição, não na última', () => {
    const { quoted } = splitQuoted(
      [
        'terceira resposta',
        '',
        'Em qui., 27 de ago. de 2026 às 15:00, <b@x> escreveu:',
        '> segunda resposta',
        '>',
        '> Em qui., 27 de ago. de 2026 às 12:11, <a@x> escreveu:',
        '> > primeira',
      ].join('\n'),
    );
    expect(quoted).toContain('segunda resposta');
    expect(quoted).toContain('primeira');
  });
});
