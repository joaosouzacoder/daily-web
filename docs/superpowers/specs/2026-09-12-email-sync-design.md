# Sincronização do módulo de e-mail — desenho

Data: 2026-09-12
Estado: proposto, aguardando aprovação

## Problema

Ação local feita na tela é desfeita pelo estado que vem do servidor:

- excluir uma mensagem e ela reaparecer;
- abrir a mensagem (que marca como lida) e em seguida excluir, e ela reaparecer.

## Causa raiz

São três defeitos somados, e o primeiro é o que produz os dois sintomas relatados.

### 1. Nenhuma serialização de IMAP por conta

`withClient` (`lib/integrations/imap.ts:36`) abre uma conexão nova a cada
operação. Nada coordena essas conexões:

- o ciclo do refresher chama `listEnvelopes` para todas as conexões em paralelo
  (`lib/refresher.ts:166`), e cada chamada segura uma conexão durante a leitura
  de INBOX **e** de enviados — segundos;
- abrir uma mensagem dispara `POST /api/email/mark` sem `await`
  (`components/EmailPanel.tsx:775-792`);
- clicar em excluir logo depois dispara `POST /api/email/batch`, que abre mais
  uma conexão na mesma conta.

O provedor recusa os logins excedentes. O repositório já documenta exatamente
esse modo de falha em `app/api/email/batch/route.ts:41-44`: *"o servidor recusava
o lote com 'too many simultaneous connections' — foi assim que 24 de 27 exclusões
falharam"*.

Quando o lote falha, `removeThread` chama `onChanged()` para recarregar, com o
comentário *"Recarrega para o e-mail voltar: ele não foi apagado de verdade"*
(`components/EmailPanel.tsx`). É literalmente a ressurreição relatada — e marcar
como lido antes de excluir é o que garante a segunda conexão concorrente, o que
explica por que a sequência "abrir, marcar lido, excluir" falha com mais
frequência do que excluir sozinho.

### 2. A intenção local não é durável

`patchCachedState` (`lib/refresher.ts:242-254`) só corrige um cache em memória:

- se ainda não existe cache para o usuário, o patch é descartado em silêncio
  (`if (!cache) return`);
- o patch é reaplicado em **um** ciclo de refresh (`emVoo`) e depois some. Se a
  escrita no IMAP não pegou, o ciclo seguinte ressuscita a mensagem para sempre;
- tudo vive no processo. O deploy reinicia o serviço a cada push para `main`, e
  qualquer intenção não confirmada morre ali.

Não há confirmação ("o servidor concordou com o que eu pedi?") nem nova tentativa.

### 3. Identidade de mensagem incompleta

A mensagem é identificada por `account + uid + mailbox`. O UID só tem significado
junto do `UIDVALIDITY` da pasta. Sem guardá-lo, uma revalidação do servidor faz o
mesmo UID passar a apontar para outra mensagem — e uma ação pendente acertaria a
mensagem errada.

## Modelo proposto

### Invariante

> A intenção local é gravada de forma durável **antes** da ida ao IMAP e vence
> qualquer snapshot do servidor até ser confirmada ou falhar em definitivo.

O snapshot do servidor nunca sobrescreve o estado local: ele é **reconciliado**.

### Componentes

**`email_pending_actions` (SQLite)** — log de ações por mensagem:
`id, user_id, account, mailbox_path, uidvalidity, uid, action, payload,
created_at, attempts, next_attempt_at, state, last_error`.
`action` ∈ `delete | seen | unseen | move`. `state` ∈ `pending | failed`.
Chave única por `(user_id, account, mailbox_path, uidvalidity, uid, action)` para
o replay ser idempotente.

**Reconciliação (`lib/email/reconcile.ts`, pura)** — recebe os envelopes do
servidor e as ações pendentes e devolve a lista que a tela deve ver: mensagem com
`delete` pendente não aparece; com `seen` pendente aparece como lida. Roda em
todo ciclo, não uma única vez.

**Fila por conta (`lib/email/queue.ts`)** — serializa toda operação IMAP de uma
mesma conta (listagem, marcação, exclusão, corpo), com tamanho de fila máximo e
timeout explícito por operação. Sem isto, o defeito nº 1 volta por outro caminho.

**Worker de replay** — drena o log por conta, com tentativas limitadas, backoff
exponencial com jitter e timeout. A ação sai do log quando o snapshot do servidor
concorda com ela (mensagem ausente da INBOX, flag `\Seen` presente). Esgotadas as
tentativas, vira `failed` e aparece na tela como erro — nunca como ressurreição
silenciosa.

**UIDVALIDITY** — guardado por pasta. Se mudar, as pendências daquela pasta são
invalidadas (marcadas `failed`, visíveis) em vez de aplicadas a outra mensagem, e
a pasta é ressincronizada do zero.

### Fluxo de uma exclusão

1. Rota grava `pending(delete, uid)` e responde — a tela já não mostra a mensagem.
2. Worker pega a ação na fila da conta, executa o `messageMove` para a lixeira.
3. Próximo ciclo lista a INBOX; a mensagem não está lá → ação confirmada e removida do log.
4. Se o passo 2 falhar, a ação continua pendente: a reconciliação segue escondendo
   a mensagem e o worker tenta de novo com backoff. Se esgotar, erro na tela.

## Fora de escopo

- Outros provedores além de Gmail via IMAP (`imapflow`, usuário + senha de app).
- Migração para Postgres — decisão separada, ver relatório.

## Testes

- `delete` seguido de ciclo de refresh com snapshot velho → mensagem não volta.
- `seen` + `delete` concorrentes com um refresh em voo → mensagem não volta.
- Ação gravada, processo reiniciado (cache limpo) → intenção sobrevive.
- Falha do IMAP no replay → mensagem segue escondida e a ação é repetida.
- Tentativas esgotadas → estado `failed` e erro visível, não ressurreição.
- Mudança de UIDVALIDITY → pendência invalidada, nenhuma ação em UID alheio.
