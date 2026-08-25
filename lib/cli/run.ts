import { execFile } from 'node:child_process';

export interface CliResult {
  stdout: string;
  stderr: string;
}

export class CliError extends Error {
  constructor(
    public readonly command: string,
    message: string,
  ) {
    super(message);
    this.name = 'CliError';
  }
}

const PY_TRACEBACK = 'Traceback (most recent call last):';

export function stripAnsi(input: string): string {
  return input.replace(/\x1b\[[0-9;]*m/g, '');
}

export function stderrSummary(raw: string): string {
  const clean = stripAnsi(raw);
  const meaningful = clean
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('Note:') && l !== 'Error:');

  if (meaningful.length === 0) {
    return 'sem detalhes no stderr';
  }

  if (meaningful[0] === PY_TRACEBACK) {
    return meaningful[meaningful.length - 1] ?? PY_TRACEBACK;
  }

  const deepestCause = [...meaningful].reverse().find((l) => {
    const idx = l.indexOf(': ');
    if (idx === -1) return false;
    return /^\d+$/.test(l.slice(0, idx));
  });
  if (deepestCause) {
    return deepestCause.slice(deepestCause.indexOf(': ') + 2);
  }

  return meaningful[0];
}

export function runCli(
  command: string,
  args: string[],
  options: { env?: Record<string, string>; timeoutMs?: number } = {},
): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', ...options.env },
        timeout: options.timeoutMs ?? 30_000,
        maxBuffer: 10 * 1024 * 1024,
      },
      (err, stdout, stderr) => {
        if (err) {
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
            reject(new CliError(command, `falha ao executar ${command}: comando não encontrado`));
            return;
          }
          reject(new CliError(command, `${command} falhou: ${stderrSummary(stderr)}`));
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
}
