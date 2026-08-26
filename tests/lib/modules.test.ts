import { describe, expect, it } from 'vitest';
import {
  applyMailPreset,
  defaultsFor,
  isModuleId,
  validateValues,
  visibleFields,
} from '@/lib/modules';

describe('applyMailPreset', () => {
  it('preenche host e porta a partir do provedor', () => {
    const values = applyMailPreset({ preset: 'gmail', user: 'a@b.com' });
    expect(values.imapHost).toBe('imap.gmail.com');
    expect(values.smtpPort).toBe('465');
  });

  it('não sobrescreve o que a pessoa digitou à mão', () => {
    const values = applyMailPreset({ preset: 'gmail', imapHost: 'imap.meu.com' });
    expect(values.imapHost).toBe('imap.meu.com');
  });

  it('devolve os valores intactos quando o provedor é manual', () => {
    const values = applyMailPreset({ preset: 'custom', imapHost: 'imap.meu.com' });
    expect(values).toEqual({ preset: 'custom', imapHost: 'imap.meu.com' });
  });
});

describe('visibleFields', () => {
  it('esconde host e porta quando o provedor é conhecido', () => {
    const names = visibleFields('email', { preset: 'gmail' }).map((f) => f.name);
    expect(names).toContain('user');
    expect(names).not.toContain('imapHost');
  });

  it('mostra host e porta no provedor manual', () => {
    const names = visibleFields('email', { preset: 'custom' }).map((f) => f.name);
    expect(names).toContain('imapHost');
    expect(names).toContain('smtpPort');
  });

  it('esconde os campos do Microsoft To Do quando as tarefas são locais', () => {
    const names = visibleFields('tasks', { provider: 'local' }).map((f) => f.name);
    expect(names).toEqual(['provider']);
  });

  it('usa o default do campo quando o valor ainda não foi escolhido', () => {
    const names = visibleFields('tasks', {}).map((f) => f.name);
    expect(names).toEqual(['provider']);
  });
});

describe('validateValues', () => {
  it('cobra os campos obrigatórios visíveis', () => {
    expect(validateValues('jira', {})).toEqual([
      'Domínio Jira Cloud é obrigatório',
      'E-mail da conta Atlassian é obrigatório',
      'API token é obrigatório',
    ]);
  });

  it('não cobra campo escondido pelo preset', () => {
    const errors = validateValues('email', {
      preset: 'gmail',
      user: 'a@b.com',
      password: 'x',
    });
    expect(errors).toEqual([]);
  });

  it('cobra o host quando o provedor é manual', () => {
    const errors = validateValues('email', {
      preset: 'custom',
      user: 'a@b.com',
      password: 'x',
    });
    expect(errors).toEqual(['Servidor IMAP é obrigatório']);
  });

  it('trata espaço em branco como vazio', () => {
    expect(validateValues('agenda', { icsUrl: '   ' })).toEqual(['URL do iCal (.ics) é obrigatório']);
  });
});

describe('defaultsFor', () => {
  it('devolve os valores iniciais do formulário', () => {
    expect(defaultsFor('tasks')).toEqual({ provider: 'local' });
  });
});

describe('isModuleId', () => {
  it('aceita módulo conhecido e recusa o resto', () => {
    expect(isModuleId('email')).toBe(true);
    expect(isModuleId('pomodoro')).toBe(false);
    expect(isModuleId(null)).toBe(false);
  });
});
