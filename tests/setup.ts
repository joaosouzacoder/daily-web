import '@testing-library/jest-dom/vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Sem isto, um teste que esqueça de apontar DAILY_WEB_DB_PATH escreve no banco
// de verdade — `resolveDbPath` cai em `./data/daily-web.db`, que é o do
// servidor rodando. Já aconteceu: um mock incompleto deixou a rota chamar o
// provedor real e duas tarefas de teste foram parar na conta do operador.
// Cada arquivo de teste ganha um banco descartável; quem precisa de controle
// sobrescreve a variável no próprio beforeEach.
process.env.DAILY_WEB_DB_PATH = path.join(
  mkdtempSync(path.join(tmpdir(), 'daily-web-test-')),
  'test.db',
);
