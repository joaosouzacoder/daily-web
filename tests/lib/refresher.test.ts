import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/cli/himalaya', () => ({ listEnvelopes: vi.fn() }));
vi.mock('@/lib/cli/gcalcli', () => ({ fetchAgenda: vi.fn() }));
vi.mock('@/lib/cli/pulls', () => ({ fetchPulls: vi.fn() }));
vi.mock('@/lib/cli/jira', () => ({ fetchIssues: vi.fn() }));
vi.mock('@/lib/cli/mstodo', () => ({ fetchTasks: vi.fn() }));
vi.mock('@/lib/notifications', () => ({ getNotifications: vi.fn() }));
vi.mock('@/lib/auth/users', () => ({ listUsers: vi.fn(() => [{ id: 'u-1' }]) }));
vi.mock('@/lib/pomodoro', () => ({
  getPomodoroState: vi.fn(() => ({
    enabled: true, phase: 'focus', running: false, remainingSeconds: 1500,
    focusMinutes: 25, restMinutes: 5, completedFocusCount: 0,
  })),
}));

import { listEnvelopes } from '@/lib/cli/himalaya';
import { fetchAgenda } from '@/lib/cli/gcalcli';
import { fetchPulls } from '@/lib/cli/pulls';
import { fetchIssues } from '@/lib/cli/jira';
import { fetchTasks } from '@/lib/cli/mstodo';
import { getNotifications } from '@/lib/notifications';
import { refreshAll, getCachedState } from '@/lib/refresher';

beforeEach(() => {
  vi.mocked(listEnvelopes).mockResolvedValue([]);
  vi.mocked(fetchAgenda).mockResolvedValue([]);
  vi.mocked(fetchPulls).mockResolvedValue({ lines: [] });
  vi.mocked(fetchIssues).mockResolvedValue([]);
  vi.mocked(fetchTasks).mockResolvedValue([]);
  vi.mocked(getNotifications).mockResolvedValue([]);
});

describe('refreshAll', () => {
  // Este teste precisa rodar antes de qualquer refreshAll('u-1') no arquivo: `cache` é um
  // singleton em nível de módulo que não é resetado entre `it`s (o vitest isola módulos
  // por arquivo, não por teste), então "null antes do primeiro refresh" só é verificável
  // se for de fato o primeiro refresh do arquivo.
  it('getCachedState devolve null antes do primeiro refresh e o estado depois', async () => {
    expect(getCachedState('u-1')).toBeNull();
    await refreshAll('u-1');
    expect(getCachedState('u-1')).not.toBeNull();
  });

  it('preenche o estado quando todas as fontes respondem', async () => {
    const state = await refreshAll('u-1');
    expect(state.email.error).toBeNull();
    expect(state.jira.data).toEqual([]);
    expect(state.pomodoro.phase).toBe('focus');
  });

  it('isola o erro de um painel sem derrubar os outros', async () => {
    vi.mocked(fetchIssues).mockRejectedValue(new Error('JIRA_TOKEN ausente'));
    const state = await refreshAll('u-1');
    expect(state.jira.error).toBe('JIRA_TOKEN ausente');
    // PanelResult<T>.data é T | null; no erro, o panel() da brief zera data para null
    // (não `[]`) — é o comportamento tipo-correto e consistente com os demais painéis.
    expect(state.jira.data).toBeNull();
    expect(state.email.error).toBeNull();
  });

  it('busca e-mail e agenda das duas contas', async () => {
    await refreshAll('u-1');
    expect(listEnvelopes).toHaveBeenCalledWith('work', 30);
    expect(listEnvelopes).toHaveBeenCalledWith('personal', 30);
    expect(fetchAgenda).toHaveBeenCalledWith('work');
    expect(fetchAgenda).toHaveBeenCalledWith('personal');
  });

  it('mantém os dados da conta que funcionou quando a outra conta falha', async () => {
    vi.mocked(listEnvelopes).mockImplementation(async (account) => {
      if (account === 'work') throw new Error('work OAuth expirado');
      return [{ id: '1', account: 'personal', from: 'a@b.com', subject: 'x', unread: false, date: '2026-08-25' }];
    });
    const state = await refreshAll('u-1');
    expect(state.email.data).toHaveLength(1);
    expect(state.email.data?.[0].account).toBe('personal');
    expect(state.email.error).toContain('work OAuth expirado');
  });
});
