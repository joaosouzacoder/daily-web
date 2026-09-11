import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Um Drive de mentira, em memória, que fala o mesmo HTTP que o cliente usa:
// token, listagem com `appProperties`, upload multipart, lixeira e download.
// O teste passa pelo cliente de verdade — nada do lib/integrations/google é
// substituído.

interface FakeFile {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
  appProperties: Record<string, string>;
  content: string;
  trashed: boolean;
  modifiedTime: string;
}

class FakeDrive {
  files = new Map<string, FakeFile>();
  requests: { method: string; url: string }[] = [];
  /** Próximas respostas forçadas, por método (para simular falha). */
  failNext: { method: string; status: number }[] = [];
  private seq = 0;

  add(file: Partial<FakeFile>): FakeFile {
    const full: FakeFile = {
      id: `f${(this.seq += 1)}`,
      name: 'x.md',
      mimeType: 'text/markdown',
      parents: [],
      content: '',
      trashed: false,
      modifiedTime: '2026-09-01T10:00:00.000Z',
      appProperties: {},
      ...file,
    };
    this.files.set(full.id, full);
    return full;
  }

  notes(): FakeFile[] {
    return [...this.files.values()].filter((f) => f.appProperties.dailyWeb === 'note');
  }

  live(): FakeFile[] {
    return this.notes().filter((f) => !f.trashed);
  }

  fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(String(input));
    const method = init.method ?? 'GET';
    this.requests.push({ method, url: url.pathname + url.search });

    const forced = this.failNext.findIndex((f) => f.method === method);
    if (forced !== -1 && url.hostname !== 'oauth2.googleapis.com') {
      const [{ status }] = this.failNext.splice(forced, 1);
      return new Response('{}', { status });
    }

    if (url.hostname === 'oauth2.googleapis.com') {
      return Response.json({ access_token: 'access-token', expires_in: 3600 });
    }

    const auth = new Headers(init.headers).get('authorization');
    if (auth !== 'Bearer access-token') return new Response('{}', { status: 401 });

    const idMatch = /\/files\/([^/?]+)/.exec(url.pathname);
    const file = idMatch ? this.files.get(decodeURIComponent(idMatch[1])) : undefined;

    if (method === 'GET' && !idMatch) return Response.json({ files: this.query(url.searchParams.get('q') ?? '') });
    if (method === 'GET' && file && url.searchParams.get('alt') === 'media') return new Response(file.content);
    if (method === 'POST' && url.pathname === '/drive/v3/files') {
      const meta = JSON.parse(String(init.body));
      return Response.json({ id: this.add({ ...meta, content: '' }).id });
    }
    if (method === 'POST' && url.pathname === '/upload/drive/v3/files') {
      const { meta, content } = parseMultipart(init);
      return Response.json({ id: this.add({ ...meta, content }).id });
    }
    if (method === 'PATCH') {
      if (!file) return new Response('{}', { status: 404 });
      if (url.pathname.startsWith('/upload/')) {
        const { meta, content } = parseMultipart(init);
        Object.assign(file, meta, { content });
      } else {
        Object.assign(file, JSON.parse(String(init.body)));
      }
      return Response.json({ id: file.id });
    }
    return new Response('{}', { status: 404 });
  };

  /** Só o que o cliente pergunta: arquivos com uma marca, fora da lixeira. */
  private query(q: string): object[] {
    const value = /value='(\w+)'/.exec(q)?.[1];
    return [...this.files.values()]
      .filter((f) => !f.trashed && f.appProperties.dailyWeb === value)
      .map((f) => ({
        id: f.id,
        name: f.name,
        modifiedTime: f.modifiedTime,
        size: String(Buffer.byteLength(f.content)),
        appProperties: f.appProperties,
      }));
  }
}

function parseMultipart(init: RequestInit): { meta: Partial<FakeFile>; content: string } {
  const type = new Headers(init.headers).get('content-type') ?? '';
  const boundary = /boundary=(.+)$/.exec(type)?.[1];
  if (!boundary || !type.startsWith('multipart/related')) throw new Error(`not multipart: ${type}`);
  const parts = String(init.body).split(`--${boundary}`).slice(1, -1);
  const body = (part: string) => part.slice(part.indexOf('\r\n\r\n') + 4).replace(/\r\n$/, '');
  return { meta: JSON.parse(body(parts[0])), content: body(parts[1]) };
}

let dir: string;
let fake: FakeDrive;
const USER = 'u-1';

async function connectDrive(userId = USER) {
  const { saveConnection } = await import('@/lib/vault/connections');
  saveConnection(userId, 'notes', 'a@b.com', {
    provider: 'google',
    refreshToken: 'refresh-token',
    account: 'a@b.com',
  });
}

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'daily-web-notes-sync-'));
  process.env.DAILY_WEB_DB_PATH = path.join(dir, 'test.db');
  process.env.DAILY_WEB_SECRET_KEY = Buffer.alloc(32, 7).toString('base64');
  process.env.GOOGLE_CLIENT_ID = 'client';
  process.env.GOOGLE_CLIENT_SECRET = 'client-secret';
  fake = new FakeDrive();
  vi.stubGlobal('fetch', vi.fn(fake.fetch));
  const { getDb } = await import('@/lib/db');
  getDb();
});

afterEach(() => {
  vi.unstubAllGlobals();
  rmSync(dir, { recursive: true, force: true });
});

describe('syncNotes', () => {
  it('sem Drive conectado, não fala com o Google', async () => {
    const { createNote } = await import('@/lib/notes');
    const { syncNotes } = await import('@/lib/notesSync');
    createNote(USER, 'Ideias');

    expect(await syncNotes(USER)).toEqual({ uploaded: 0, trashed: 0, restored: 0 });
    expect(fake.requests).toEqual([]);
  });

  it('sobe a nota nova como arquivo Markdown na pasta da app', async () => {
    const { createNote, updateNote, countPendingSync } = await import('@/lib/notes');
    const { syncNotes } = await import('@/lib/notesSync');
    await connectDrive();
    const nota = createNote(USER, 'Ideias');
    updateNote(USER, nota.id, { body: '# Título\n\n- [ ] tarefa' });

    const result = await syncNotes(USER);

    expect(result.uploaded).toBe(1);
    const [file] = fake.live();
    expect(file.name).toBe('Ideias.md');
    expect(file.content).toBe('# Título\n\n- [ ] tarefa');
    expect(file.appProperties).toMatchObject({ dailyWeb: 'note', noteId: nota.id, position: '0' });
    const folder = [...fake.files.values()].find((f) => f.appProperties.dailyWeb === 'folder');
    expect(file.parents).toEqual([folder?.id]);
    expect(countPendingSync(USER)).toBe(0);
  });

  it('rodar de novo não duplica nada', async () => {
    const { createNote } = await import('@/lib/notes');
    const { syncNotes } = await import('@/lib/notesSync');
    await connectDrive();
    createNote(USER, 'Ideias');

    await syncNotes(USER);
    const second = await syncNotes(USER);

    expect(second.uploaded).toBe(0);
    expect(fake.live()).toHaveLength(1);
  });

  it('editar atualiza o mesmo arquivo', async () => {
    const { createNote, updateNote } = await import('@/lib/notes');
    const { syncNotes } = await import('@/lib/notesSync');
    await connectDrive();
    const nota = createNote(USER, 'Ideias');
    await syncNotes(USER);

    updateNote(USER, nota.id, { title: 'Planos', body: 'novo texto' });
    await syncNotes(USER);

    expect(fake.live()).toHaveLength(1);
    expect(fake.live()[0]).toMatchObject({ name: 'Planos.md', content: 'novo texto' });
  });

  // O envio foi feito com a revisão lida antes. Uma edição que chega no meio
  // não pode ser dada como enviada.
  it('edição feita durante o envio continua pendente', async () => {
    const { createNote, updateNote, pendingNotes, markNoteSynced } = await import('@/lib/notes');
    const nota = createNote(USER, 'Ideias');
    const [lida] = pendingNotes(USER);

    updateNote(USER, nota.id, { body: 'digitado durante o envio' });
    markNoteSynced(USER, nota.id, lida.revision);

    expect(pendingNotes(USER).map((n) => n.id)).toEqual([nota.id]);
  });

  it('apagar manda o arquivo para a lixeira do Drive, não para o nada', async () => {
    const { createNote, deleteNote, countPendingSync } = await import('@/lib/notes');
    const { syncNotes } = await import('@/lib/notesSync');
    await connectDrive();
    const nota = createNote(USER, 'Ideias');
    createNote(USER, 'Fica');
    await syncNotes(USER);

    deleteNote(USER, nota.id);
    const result = await syncNotes(USER);

    expect(result.trashed).toBe(1);
    const trashed = fake.notes().find((f) => f.appProperties.noteId === nota.id);
    expect(trashed?.trashed).toBe(true);
    expect(fake.live().map((f) => f.name)).toEqual(['Fica.md']);
    expect(countPendingSync(USER)).toBe(0);
  });

  it('apagar a última nota não a traz de volta do Drive', async () => {
    const { createNote, deleteNote, listNotes } = await import('@/lib/notes');
    const { syncNotes } = await import('@/lib/notesSync');
    await connectDrive();
    const nota = createNote(USER, 'Única');
    await syncNotes(USER);

    deleteNote(USER, nota.id);
    await syncNotes(USER);

    expect(listNotes(USER)).toEqual([]);
    expect(fake.live()).toEqual([]);
  });

  it('nota que nunca subiu some sem deixar pendência', async () => {
    const { createNote, deleteNote, pendingDeletions } = await import('@/lib/notes');
    const nota = createNote(USER, 'Rascunho');
    deleteNote(USER, nota.id);
    expect(pendingDeletions(USER)).toEqual([]);
  });

  it('com o banco vazio, restaura as notas do Drive', async () => {
    const { listNotes, countPendingSync } = await import('@/lib/notes');
    const { syncNotes } = await import('@/lib/notesSync');
    await connectDrive();
    fake.add({ name: 'Segunda.md', content: 'b', appProperties: { dailyWeb: 'note', noteId: 'n-2', position: '1', untitled: '0' } });
    fake.add({ name: 'Primeira.md', content: '**a**', appProperties: { dailyWeb: 'note', noteId: 'n-1', position: '0', untitled: '0' } });
    fake.add({ name: 'Sem título.md', content: 'c', appProperties: { dailyWeb: 'note', noteId: 'n-3', position: '2', untitled: '1' } });

    const result = await syncNotes(USER);

    expect(result.restored).toBe(3);
    expect(listNotes(USER).map((n) => [n.id, n.title, n.body])).toEqual([
      ['n-1', 'Primeira', '**a**'],
      ['n-2', 'Segunda', 'b'],
      ['n-3', '', 'c'],
    ]);
    // O que acabou de vir do Drive não volta para lá.
    expect(countPendingSync(USER)).toBe(0);
    expect(fake.requests.some((r) => r.method === 'PATCH' || r.url.startsWith('/upload/'))).toBe(false);
  });

  it('com notas locais, não mistura as do Drive', async () => {
    const { createNote, listNotes } = await import('@/lib/notes');
    const { syncNotes } = await import('@/lib/notesSync');
    await connectDrive();
    createNote(USER, 'Local');
    fake.add({ name: 'Remota.md', content: 'x', appProperties: { dailyWeb: 'note', noteId: 'r-1', position: '0', untitled: '0' } });

    const result = await syncNotes(USER);

    expect(result.restored).toBe(0);
    expect(listNotes(USER).map((n) => n.title)).toEqual(['Local']);
  });

  it('arquivo maior que o teto de uma nota fica no Drive e não entra', async () => {
    const { listNotes, MAX_BODY_LENGTH } = await import('@/lib/notes');
    const { syncNotes } = await import('@/lib/notesSync');
    await connectDrive();
    fake.add({ name: 'Enorme.md', content: 'a'.repeat(MAX_BODY_LENGTH + 1), appProperties: { dailyWeb: 'note', noteId: 'g-1', position: '0', untitled: '0' } });
    fake.add({ name: 'Normal.md', content: 'ok', appProperties: { dailyWeb: 'note', noteId: 'g-2', position: '1', untitled: '0' } });

    await syncNotes(USER);

    expect(listNotes(USER).map((n) => n.title)).toEqual(['Normal']);
    expect(fake.live()).toHaveLength(2);
  });

  it('falha do Drive deixa a nota pendente para a próxima rodada', async () => {
    const { createNote, countPendingSync } = await import('@/lib/notes');
    const { syncNotes } = await import('@/lib/notesSync');
    await connectDrive();
    createNote(USER, 'Ideias');
    await syncNotes(USER); // cria a pasta e o arquivo
    const { updateNote, listNotes } = await import('@/lib/notes');
    updateNote(USER, listNotes(USER)[0].id, { body: 'mudou' });

    fake.failNext.push({ method: 'PATCH', status: 503 });
    await expect(syncNotes(USER)).rejects.toThrow('503');
    expect(countPendingSync(USER)).toBe(1);

    await syncNotes(USER);
    expect(countPendingSync(USER)).toBe(0);
    expect(fake.live()[0].content).toBe('mudou');
  });

  it('arquivo apagado lá fora é recriado na próxima edição', async () => {
    const { createNote, updateNote } = await import('@/lib/notes');
    const { syncNotes } = await import('@/lib/notesSync');
    await connectDrive();
    const nota = createNote(USER, 'Ideias');
    await syncNotes(USER);
    const [original] = fake.live();
    // Some entre a listagem e a atualização: a atualização volta 404.
    updateNote(USER, nota.id, { body: 'de novo' });
    fake.failNext.push({ method: 'PATCH', status: 404 });

    await syncNotes(USER);

    const recreated = fake.live().filter((f) => f.id !== original.id);
    expect(recreated).toHaveLength(1);
    expect(recreated[0].content).toBe('de novo');
  });

  it('reordenar reenvia só as notas que mudaram de lugar', async () => {
    const { createNote, reorderNotes, pendingNotes } = await import('@/lib/notes');
    const { syncNotes } = await import('@/lib/notesSync');
    await connectDrive();
    const a = createNote(USER, 'A');
    const b = createNote(USER, 'B');
    const c = createNote(USER, 'C');
    await syncNotes(USER);

    reorderNotes(USER, [b.id, a.id, c.id]);

    expect(pendingNotes(USER).map((n) => n.title).sort()).toEqual(['A', 'B']);
    await syncNotes(USER);
    const positions = Object.fromEntries(fake.live().map((f) => [f.name, f.appProperties.position]));
    expect(positions).toEqual({ 'A.md': '1', 'B.md': '0', 'C.md': '2' });
  });

  it('token recusado vira mensagem de reconexão', async () => {
    const { createNote } = await import('@/lib/notes');
    const { syncNotes } = await import('@/lib/notesSync');
    await connectDrive();
    createNote(USER, 'Ideias');
    fake.failNext.push({ method: 'GET', status: 401 });

    await expect(syncNotes(USER)).rejects.toThrow('conecte de novo');
  });
});

describe('notesSyncStatus', () => {
  it('sem conexão, diz que não está conectado e não conta pendência', async () => {
    const { createNote } = await import('@/lib/notes');
    const { notesSyncStatus } = await import('@/lib/notesSync');
    createNote(USER, 'Ideias');
    expect(notesSyncStatus(USER)).toMatchObject({ connected: false, pending: 0 });
  });

  it('conectado, conta o que falta subir e mostra a conta', async () => {
    const { createNote } = await import('@/lib/notes');
    const { notesSyncStatus } = await import('@/lib/notesSync');
    await connectDrive();
    createNote(USER, 'Ideias');
    expect(notesSyncStatus(USER)).toMatchObject({ connected: true, account: 'a@b.com', pending: 1 });
  });

  it('nunca expõe o token', async () => {
    const { notesSyncStatus } = await import('@/lib/notesSync');
    await connectDrive();
    expect(JSON.stringify(notesSyncStatus(USER))).not.toContain('refresh-token');
  });
});

// O build carrega este módulo mais de uma vez. O que uma cópia registra —
// a falha de uma rodada — precisa aparecer para a rota que lê pela outra.
describe('estado compartilhado entre cópias do módulo', () => {
  it('a situação gravada por uma cópia é lida pela outra', async () => {
    const { createNote } = await import('@/lib/notes');
    const first = await import('@/lib/notesSync');
    await connectDrive();
    createNote(USER, 'Ideias');
    fake.failNext.push({ method: 'GET', status: 500 });
    await first.syncNotesNow(USER);
    expect(first.notesSyncStatus(USER).lastError).toContain('500');

    vi.resetModules();
    const second = await import('@/lib/notesSync');
    expect(second).not.toBe(first);
    expect(second.notesSyncStatus(USER).lastError).toContain('500');
  });
});
