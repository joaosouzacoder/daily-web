import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { runCli, stripAnsi } from './run';
import { providerEnv } from '@/lib/vault/env';
import { parsePulls, parseGhpendingConfig, serializeGhpendingConfig } from '@/lib/parsers/pulls';
import type { PullsDigest } from '@/lib/types';

export async function fetchPulls(userId: string): Promise<PullsDigest> {
  // O token vem do cofre; a lista de repositórios ainda é do arquivo da
  // máquina — ela passa a ser por usuário no estágio 3, junto com os demais
  // arquivos de config gerados por usuário.
  const { stdout } = await runCli('ghpending', [], { env: providerEnv(userId, 'github') });
  return { lines: parsePulls(stripAnsi(stdout)) };
}

const CONFIG_PATH = path.join(os.homedir(), '.config', 'ghpending', 'config.toml');

async function readConfig(): Promise<{ user?: string; repos: string[] }> {
  try {
    const text = await readFile(CONFIG_PATH, 'utf8');
    return parseGhpendingConfig(text);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { repos: [] };
    throw err;
  }
}

async function writeConfig(cfg: { user?: string; repos: string[] }): Promise<void> {
  await mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  await writeFile(CONFIG_PATH, serializeGhpendingConfig(cfg), 'utf8');
}

export async function listTrackedRepos(): Promise<string[]> {
  const cfg = await readConfig();
  return cfg.repos;
}

export async function addTrackedRepo(repo: string): Promise<string[]> {
  const cfg = await readConfig();
  if (!cfg.repos.includes(repo)) cfg.repos.push(repo);
  await writeConfig(cfg);
  return cfg.repos;
}

export async function removeTrackedRepo(repo: string): Promise<string[]> {
  const cfg = await readConfig();
  cfg.repos = cfg.repos.filter((r) => r !== repo);
  await writeConfig(cfg);
  return cfg.repos;
}
