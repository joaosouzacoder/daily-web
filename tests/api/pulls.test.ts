import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/cli/pulls', () => ({
  listTrackedRepos: vi.fn(),
  addTrackedRepo: vi.fn(),
  removeTrackedRepo: vi.fn(),
}));

import { listTrackedRepos, addTrackedRepo, removeTrackedRepo } from '@/lib/cli/pulls';
import { GET, POST, DELETE } from '@/app/api/pulls/repos/route';

beforeEach(() => vi.clearAllMocks());

function jsonRequest(method: string, body: unknown): NextRequest {
  return new NextRequest('http://localhost/api', { method, body: JSON.stringify(body) });
}

describe('GET /api/pulls/repos', () => {
  it('devolve a lista de repos rastreados', async () => {
    vi.mocked(listTrackedRepos).mockResolvedValue(['a/b']);
    const res = await GET();
    const data = await res.json();
    expect(data.repos).toEqual(['a/b']);
  });
});

describe('POST /api/pulls/repos', () => {
  it('adiciona um repo válido', async () => {
    vi.mocked(addTrackedRepo).mockResolvedValue(['a/b']);
    const res = await POST(jsonRequest('POST', { repo: 'a/b' }));
    expect(res.status).toBe(200);
    expect(addTrackedRepo).toHaveBeenCalledWith('a/b');
  });

  it('rejeita repo inválido com 400 e não chama addTrackedRepo', async () => {
    const res = await POST(jsonRequest('POST', { repo: '-rf' }));
    expect(res.status).toBe(400);
    expect(addTrackedRepo).not.toHaveBeenCalled();
  });

  it('rejeita repo sem a barra owner/nome', async () => {
    const res = await POST(jsonRequest('POST', { repo: 'semrepositorio' }));
    expect(res.status).toBe(400);
    expect(addTrackedRepo).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/pulls/repos', () => {
  it('remove um repo válido', async () => {
    vi.mocked(removeTrackedRepo).mockResolvedValue([]);
    const res = await DELETE(jsonRequest('DELETE', { repo: 'a/b' }));
    expect(res.status).toBe(200);
    expect(removeTrackedRepo).toHaveBeenCalledWith('a/b');
  });

  it('rejeita repo inválido com 400', async () => {
    const res = await DELETE(jsonRequest('DELETE', { repo: '-x' }));
    expect(res.status).toBe(400);
    expect(removeTrackedRepo).not.toHaveBeenCalled();
  });
});
