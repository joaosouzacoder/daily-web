import { describe, expect, it } from 'vitest';
import { isValidTaskId } from '@/lib/api/validation';

// O id da tarefa vem do provedor, não de nós. O charset antigo era
// `[A-Za-z0-9_-]`, e os ids do Microsoft Graph são base64 com `=` de
// preenchimento — na prática isso reprovava todos e deixava concluir, editar
// e apagar quebrados para quem usa Microsoft To Do.
const ID_REAL_DO_GRAPH =
  'AQMkADAwATNiZmYAZC1jYTc2LTZlYmMtMDACLTAwCgBGAAADHqZmYAZC1jYTc2LTZlYmMtMDACLTAwCgBGAAAD_A1234567890abcDEF==';

describe('isValidTaskId', () => {
  it('aceita o id real de uma tarefa do Microsoft To Do', () => {
    expect(isValidTaskId(ID_REAL_DO_GRAPH)).toBe(true);
  });

  it('aceita o `=` de preenchimento do base64', () => {
    expect(isValidTaskId('abc=')).toBe(true);
    expect(isValidTaskId('abc==')).toBe(true);
  });

  it('aceita base64 padrão, com + e /', () => {
    expect(isValidTaskId('a+b/c=')).toBe(true);
  });

  it('aceita o UUID do provedor local', () => {
    expect(isValidTaskId('a7b6ded3-5948-4020-9d42-717aee1ab06e')).toBe(true);
  });

  // O guard que a validação existe para dar: o id vira argumento posicional
  // de uma CLI via execFile, e um id começando com "-" seria lido como flag.
  it('continua recusando id começando com hífen', () => {
    expect(isValidTaskId('-rf')).toBe(false);
    expect(isValidTaskId('--force')).toBe(false);
  });

  it('recusa caractere fora do conjunto', () => {
    for (const ruim of ['a b', 'a;b', 'a|b', 'a$b', 'a`b', 'a\nb', "a'b", 'a"b', 'a\\b']) {
      expect(isValidTaskId(ruim), `deveria recusar ${JSON.stringify(ruim)}`).toBe(false);
    }
  });

  it('recusa vazio, não-string e comprimento absurdo', () => {
    expect(isValidTaskId('')).toBe(false);
    expect(isValidTaskId(null)).toBe(false);
    expect(isValidTaskId(42)).toBe(false);
    expect(isValidTaskId('a'.repeat(513))).toBe(false);
    expect(isValidTaskId('a'.repeat(512))).toBe(true);
  });
});
