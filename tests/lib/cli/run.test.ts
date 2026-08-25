import { describe, expect, it } from 'vitest';
import { runCli, stripAnsi, stderrSummary, CliError } from '@/lib/cli/run';

describe('stripAnsi', () => {
  it('remove sequências de escape ANSI mantendo o texto', () => {
    expect(stripAnsi('\x1b[36mrepo\x1b[39m')).toBe('repo');
  });

  it('não altera texto sem escapes', () => {
    expect(stripAnsi('texto normal')).toBe('texto normal');
  });
});

describe('stderrSummary', () => {
  it('pega a causa mais funda da cadeia numerada do himalaya', () => {
    const raw = 'Error:\n0: cannot list envelopes\n1: cannot refresh access token\nNote: Run with --trace';
    expect(stderrSummary(raw)).toBe('cannot refresh access token');
  });

  it('pega a última linha de um traceback Python', () => {
    const raw = 'Traceback (most recent call last):\n  File "x.py", line 1\nConnectionError: falha de rede';
    expect(stderrSummary(raw)).toBe('ConnectionError: falha de rede');
  });

  it('pega a primeira linha significativa quando não há padrão conhecido', () => {
    expect(stderrSummary('defina JIRA_TOKEN')).toBe('defina JIRA_TOKEN');
  });

  it('devolve mensagem padrão quando o stderr está vazio', () => {
    expect(stderrSummary('')).toBe('sem detalhes no stderr');
    expect(stderrSummary('   \n  \n')).toBe('sem detalhes no stderr');
  });
});

describe('runCli', () => {
  it('resolve com stdout quando o comando termina com sucesso', async () => {
    const result = await runCli(process.execPath, ['-e', "process.stdout.write('ok')"]);
    expect(result.stdout).toBe('ok');
  });

  it('rejeita com CliError quando o comando sai com código diferente de zero', async () => {
    await expect(
      runCli(process.execPath, ['-e', "process.stderr.write('deu ruim'); process.exit(1)"]),
    ).rejects.toThrow(CliError);
  });

  it('a mensagem do CliError usa o resumo do stderr', async () => {
    await expect(
      runCli(process.execPath, ['-e', "process.stderr.write('deu ruim'); process.exit(1)"]),
    ).rejects.toThrow(/deu ruim/);
  });

  it('rejeita com CliError quando o comando não existe', async () => {
    await expect(runCli('comando-que-nao-existe-daily-web', [])).rejects.toThrow(CliError);
  });

  it('rejeita quando o comando estoura o timeout', async () => {
    await expect(
      runCli(process.execPath, ['-e', 'setTimeout(() => {}, 5000)'], { timeoutMs: 100 }),
    ).rejects.toThrow();
  });

  it('passa env extra para o subprocesso', async () => {
    const result = await runCli(
      process.execPath,
      ['-e', 'process.stdout.write(process.env.MEU_VALOR ?? "")'],
      { env: { MEU_VALOR: 'abc123' } },
    );
    expect(result.stdout).toBe('abc123');
  });
});
