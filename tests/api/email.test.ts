import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/cli/himalaya', () => ({
  setSeen: vi.fn(),
  moveTo: vi.fn(),
  deleteEmail: vi.fn(),
  listFolders: vi.fn(),
  fetchBody: vi.fn(),
  gmailUrl: vi.fn(),
}));

import { setSeen, moveTo, deleteEmail, listFolders } from '@/lib/cli/himalaya';
import { POST as markRoute } from '@/app/api/email/mark/route';
import { POST as batchRoute } from '@/app/api/email/batch/route';
import { GET as foldersRoute } from '@/app/api/email/folders/route';

beforeEach(() => vi.clearAllMocks());

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/email/mark', () => {
  it('chama setSeen com os dados do corpo', async () => {
    await markRoute(jsonRequest({ account: 'work', id: '1', seen: true }));
    expect(setSeen).toHaveBeenCalledWith('work', '1', true);
  });
});

describe('POST /api/email/batch', () => {
  it('marca lido em lote', async () => {
    await batchRoute(jsonRequest({ targets: [{ account: 'work', id: '1' }, { account: 'personal', id: '2' }], action: 'read' }));
    expect(setSeen).toHaveBeenCalledWith('work', '1', true);
    expect(setSeen).toHaveBeenCalledWith('personal', '2', true);
  });

  it('exclui em lote', async () => {
    await batchRoute(jsonRequest({ targets: [{ account: 'work', id: '1' }], action: 'delete' }));
    expect(deleteEmail).toHaveBeenCalledWith('work', '1');
  });

  it('mover sem pasta devolve 400', async () => {
    const res = await batchRoute(jsonRequest({ targets: [{ account: 'work', id: '1' }], action: 'move' }));
    expect(res.status).toBe(400);
    expect(moveTo).not.toHaveBeenCalled();
  });

  it('mover com pasta chama moveTo', async () => {
    await batchRoute(jsonRequest({ targets: [{ account: 'work', id: '1' }], action: 'move', folder: 'Arquivo' }));
    expect(moveTo).toHaveBeenCalledWith('work', '1', 'Arquivo');
  });

  it('pasta inválida ao mover devolve 400', async () => {
    const res = await batchRoute(jsonRequest({ targets: [{ account: 'work', id: '1' }], action: 'move', folder: '-rf' }));
    expect(res.status).toBe(400);
    expect(moveTo).not.toHaveBeenCalled();
  });

  it('falha em um alvo não impede os demais e reporta resultado por item', async () => {
    vi.mocked(setSeen).mockImplementation(async (_account, id) => {
      if (id === 'fail') throw new Error('cli error');
    });
    const res = await batchRoute(jsonRequest({
      targets: [{ account: 'work', id: '1' }, { account: 'work', id: 'fail' }, { account: 'personal', id: '2' }],
      action: 'read',
    }));
    const data = await res.json();
    expect(setSeen).toHaveBeenCalledWith('work', '1', true);
    expect(setSeen).toHaveBeenCalledWith('work', 'fail', true);
    expect(setSeen).toHaveBeenCalledWith('personal', '2', true);
    expect(data.results).toEqual([
      { account: 'work', id: '1', ok: true },
      { account: 'work', id: 'fail', ok: false, error: 'cli error' },
      { account: 'personal', id: '2', ok: true },
    ]);
  });
});

describe('validação de entrada', () => {
  it('conta inválida no /mark devolve 400', async () => {
    const res = await markRoute(jsonRequest({ account: 'invalida', id: '1', seen: true }));
    expect(res.status).toBe(400);
    expect(setSeen).not.toHaveBeenCalled();
  });

  it('id com traço inicial no /mark devolve 400', async () => {
    const res = await markRoute(jsonRequest({ account: 'work', id: '-rf', seen: true }));
    expect(res.status).toBe(400);
    expect(setSeen).not.toHaveBeenCalled();
  });
});

describe('GET /api/email/folders', () => {
  it('conta inválida devolve 400', async () => {
    const res = await foldersRoute(new Request('http://localhost/api/email/folders?account=invalida'));
    expect(res.status).toBe(400);
    expect(listFolders).not.toHaveBeenCalled();
  });

  it('conta válida devolve as pastas', async () => {
    vi.mocked(listFolders).mockResolvedValue(['INBOX', 'Trash']);
    const res = await foldersRoute(new Request('http://localhost/api/email/folders?account=work'));
    const data = await res.json();
    expect(data.folders).toEqual(['INBOX', 'Trash']);
  });
});
