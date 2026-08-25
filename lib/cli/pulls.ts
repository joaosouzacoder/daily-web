import { runCli, stripAnsi } from './run';
import { parsePulls } from '@/lib/parsers/pulls';
import type { PullsDigest } from '@/lib/types';

export async function fetchPulls(): Promise<PullsDigest> {
  const { stdout } = await runCli('ghpending', []);
  return { lines: parsePulls(stripAnsi(stdout)) };
}
