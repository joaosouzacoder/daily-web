import { randomBytes } from 'node:crypto';

// Cliente mínimo da Drive API v3, só com o que a cópia das notas usa. Cada
// nota é um arquivo Markdown numa pasta própria; o que identifica o arquivo
// é o `appProperties`, não o nome — a pessoa pode renomear lá sem quebrar nada.

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const TIMEOUT_MS = 20_000;
const FOLDER_MIME = 'application/vnd.google-apps.folder';
export const FOLDER_NAME = 'daily-web — notas';

/** Marca que separa o que é desta app de qualquer outro arquivo. */
const APP_KEY = 'dailyWeb';

export interface DriveNoteFile {
  fileId: string;
  noteId: string;
  name: string;
  position: number;
  untitled: boolean;
  modifiedTime: string;
  /** Em bytes. Serve para recusar baixar o que não caberia numa nota. */
  size: number;
}

export interface DriveNoteContent {
  noteId: string;
  title: string;
  body: string;
  position: number;
}

export class DriveError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'DriveError';
  }
}

async function request(token: string, url: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(url, {
    ...init,
    headers: { ...init.headers, authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (response.ok) return response;

  const body = await response.text().catch(() => '');
  if (response.status === 401) {
    throw new DriveError('o Google recusou o acesso ao Drive — conecte de novo', 401);
  }
  if (response.status === 403 && body.includes('accessNotConfigured')) {
    throw new DriveError(
      'a Google Drive API não está ativada no projeto do Google Cloud deste servidor',
      403,
    );
  }
  throw new DriveError(`o Google Drive respondeu ${response.status}`, response.status);
}

/** Arquivo que a app pôs no Drive e depois virou lixo — da lixeira, apagado
 *  pela pessoa, ou de outra conta. Para quem sincroniza, é "não existe". */
export function isGone(err: unknown): boolean {
  return err instanceof DriveError && err.status === 404;
}

/** Nome do arquivo: o título, e um nome de reserva quando não há título. */
export function fileNameFor(title: string): string {
  return `${title.trim() || 'Sem título'}.md`;
}

/** O caminho de volta: o título sai do nome, sem a extensão. */
export function titleFrom(file: Pick<DriveNoteFile, 'name' | 'untitled'>): string {
  if (file.untitled) return '';
  return file.name.replace(/\.md$/i, '');
}

interface RawFile {
  id?: string;
  name?: string;
  modifiedTime?: string;
  size?: string;
  appProperties?: Record<string, string>;
}

interface RawList {
  files?: RawFile[];
  nextPageToken?: string;
}

/** Limite de páginas. As notas são no máximo cem por pessoa; mais que isto é
 *  a API devolvendo lixo, e não um motivo para iterar sem fim. */
const MAX_PAGES = 10;

async function listFiles(token: string, q: string): Promise<RawFile[]> {
  const files: RawFile[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const params = new URLSearchParams({
      q,
      spaces: 'drive',
      pageSize: '1000',
      fields: 'nextPageToken, files(id, name, modifiedTime, size, appProperties)',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const data = (await (await request(token, `${API}/files?${params}`)).json()) as RawList;
    files.push(...(data.files ?? []));
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return files;
}

/** Os arquivos de nota que esta app criou e que não estão na lixeira. */
export async function listNoteFiles(token: string): Promise<DriveNoteFile[]> {
  const files = await listFiles(
    token,
    `appProperties has { key='${APP_KEY}' and value='note' } and trashed = false`,
  );
  return files.flatMap((file) => {
    const noteId = file.appProperties?.noteId;
    if (!file.id || !noteId) return [];
    const position = Number(file.appProperties?.position);
    return [
      {
        fileId: file.id,
        noteId,
        name: file.name ?? '',
        position: Number.isFinite(position) ? position : 0,
        untitled: file.appProperties?.untitled === '1',
        modifiedTime: file.modifiedTime ?? new Date().toISOString(),
        size: Number(file.size ?? 0),
      },
    ];
  });
}

/** A pasta das notas, criada na primeira vez. É achada pela marca, então
 *  renomeá-la no Drive não faz a app criar uma segunda. */
export async function ensureFolder(token: string): Promise<string> {
  const existing = await listFiles(
    token,
    `mimeType = '${FOLDER_MIME}' and appProperties has { key='${APP_KEY}' and value='folder' } and trashed = false`,
  );
  if (existing[0]?.id) return existing[0].id;

  const response = await request(token, `${API}/files?fields=id`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: FOLDER_NAME,
      mimeType: FOLDER_MIME,
      appProperties: { [APP_KEY]: 'folder' },
    }),
  });
  const data = (await response.json()) as RawFile;
  if (!data.id) throw new DriveError('o Google Drive não devolveu o id da pasta', 502);
  return data.id;
}

function metadataFor(note: DriveNoteContent): Record<string, unknown> {
  return {
    name: fileNameFor(note.title),
    mimeType: 'text/markdown',
    appProperties: {
      [APP_KEY]: 'note',
      noteId: note.noteId,
      position: String(note.position),
      untitled: note.title.trim() ? '0' : '1',
    },
  };
}

/** Corpo multipart/related: metadados e conteúdo numa requisição só. A
 *  fronteira é aleatória para não aparecer dentro do texto da nota. */
function multipart(metadata: Record<string, unknown>, body: string): { type: string; body: string } {
  const boundary = `daily-web-${randomBytes(16).toString('hex')}`;
  return {
    type: `multipart/related; boundary=${boundary}`,
    body: [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify(metadata),
      `--${boundary}`,
      'Content-Type: text/markdown; charset=UTF-8',
      '',
      body,
      `--${boundary}--`,
      '',
    ].join('\r\n'),
  };
}

export async function createNoteFile(
  token: string,
  folderId: string,
  note: DriveNoteContent,
): Promise<string> {
  const payload = multipart({ ...metadataFor(note), parents: [folderId] }, note.body);
  const response = await request(token, `${UPLOAD}/files?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: { 'content-type': payload.type },
    body: payload.body,
  });
  const data = (await response.json()) as RawFile;
  if (!data.id) throw new DriveError('o Google Drive não devolveu o id do arquivo', 502);
  return data.id;
}

export async function updateNoteFile(
  token: string,
  fileId: string,
  note: DriveNoteContent,
): Promise<void> {
  const payload = multipart(metadataFor(note), note.body);
  await request(
    token,
    `${UPLOAD}/files/${encodeURIComponent(fileId)}?uploadType=multipart&fields=id`,
    { method: 'PATCH', headers: { 'content-type': payload.type }, body: payload.body },
  );
}

/** Lixeira, não exclusão: um engano aqui ainda se desfaz pelo próprio Drive. */
export async function trashFile(token: string, fileId: string): Promise<void> {
  await request(token, `${API}/files/${encodeURIComponent(fileId)}?fields=id`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ trashed: true }),
  });
}

export async function downloadFile(token: string, fileId: string): Promise<string> {
  const response = await request(token, `${API}/files/${encodeURIComponent(fileId)}?alt=media`);
  return response.text();
}
