import { describe, expect, it } from 'vitest';
import { sequenceSets } from '@/lib/integrations/imap';

describe('sequenceSets', () => {
  it('junta os uids num conjunto só', () => {
    expect(sequenceSets(['2599', '2600', '2601'])).toEqual(['2599,2600,2601']);
  });

  it('aceita um uid sozinho', () => {
    expect(sequenceSets(['42'])).toEqual(['42']);
  });

  // Na gramática do IMAP `-` e `:` formam intervalo. Um valor desses viraria
  // "apague de 2599 até 2700" e atingiria mensagens que ninguém escolheu.
  it('recusa o que não é dígito', () => {
    for (const ruim of [['2599-2700'], ['1:100'], ['*'], ['1', 'abc'], [''], ['1 2']]) {
      expect(() => sequenceSets(ruim), JSON.stringify(ruim)).toThrow(/inválido/);
    }
  });

  it('recusa lista vazia em vez de mandar comando sem alvo', () => {
    expect(() => sequenceSets([])).toThrow(/nenhuma mensagem/);
  });

  // A linha de protocolo tem limite de tamanho; 500 uids numa linha só é
  // pedir para o servidor cortar.
  it('quebra em blocos de 200', () => {
    const uids = Array.from({ length: 450 }, (_, i) => String(i + 1));
    const blocos = sequenceSets(uids);

    expect(blocos).toHaveLength(3);
    expect(blocos[0].split(',')).toHaveLength(200);
    expect(blocos[1].split(',')).toHaveLength(200);
    expect(blocos[2].split(',')).toHaveLength(50);
    // Nenhum uid pode se perder na divisão.
    expect(blocos.join(',').split(',')).toEqual(uids);
  });

  it('não quebra o que cabe num bloco', () => {
    expect(sequenceSets(Array.from({ length: 200 }, (_, i) => String(i + 1)))).toHaveLength(1);
  });
});
