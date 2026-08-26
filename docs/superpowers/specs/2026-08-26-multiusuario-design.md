# Multiusuário com autenticações próprias

Data: 2026-08-26
Status: aprovado, estágio 1 em implementação

## Problema

O daily-web é single-user por construção. O login vem de duas variáveis de
ambiente (`DASHBOARD_USER`, `DASHBOARD_PASSWORD_HASH`) e a app não guarda
nenhuma credencial: ela executa CLIs que leem a configuração da máquina, como
o usuário do SO.

| Integração | Onde está a credencial hoje |
|---|---|
| himalaya (e-mail) | `~/.config/himalaya/config.toml`, contas `work`/`personal`, OAuth2 via `ortie` |
| gcalcli (agenda) | `~/.local/share/gcalcli-accounts/{work,personal}`, OAuth2 Google |
| jira | env `JIRA_CLOUD` / `JIRA_EMAIL` / `JIRA_TOKEN` |
| ghpending | `~/.config/ghpending/config.toml` + env `GITHUB_TOKEN` |
| mstodo | env `DAILY_TUI_TODO_*`, OAuth2 Microsoft |

Além disso, três coisas assumem um único usuário:

- `lib/refresher.ts` é singleton de processo: um `cache` e um `setInterval`,
  iniciados em `instrumentation.ts`.
- As tabelas do SQLite (`notifications_read`, `email_bodies`) não têm coluna de
  usuário, e o pomodoro é `let state` em memória de módulo.
- `Account` é `'work' | 'personal'` em `lib/types.ts`, propagado por toda a
  stack. Com contas por usuário isso vira dado, não tipo.

## Modelo de confiança

2 a 5 pessoas de confiança, na máquina do operador. Credenciais cifradas em
repouso no SQLite com chave no env do serviço. Não é multi-tenant: não há
isolamento de processo por usuário nem auditoria.

## Restrição externa que moldou o desenho

As contas de e-mail e agenda autenticam por OAuth2, não por senha. O himalaya
obtém o token por comando externo:

```
imap.sasl.xoauth2.token.command = ["ortie", "-a", "gmail-work", ..., "token", "show"]
```

Gmail via IMAP (`https://mail.google.com/`) é escopo *restricted* no Google. Um
app externo que o use precisa de verificação mais CASA Tier 2: auditoria por
laboratório aprovado, US$ 540–1.000, 4–12+ semanas, recertificação anual. Em
"Testing", o Google revoga o refresh token em 7 dias e limita a 100 usuários.
Apps *Internal* escapam disso, mas só atendem contas do mesmo Workspace — e o
escopo inclui contas pessoais `@gmail.com`, que forçam External.

**Decisão:** a app não vira cliente OAuth do Google. O consentimento continua
em um broker externo (`ortie`), com um perfil por usuário. A app é dona de todo
o resto.

A costura para mudar de ideia já existe no formato de config do himalaya:
`token.command` é uma lista de strings. Apontar para `ortie` hoje e para um
helper próprio amanhã é trocar uma string, não reescrever. Nenhuma abstração
extra é necessária para preservar essa opção.

## Invariantes das quatro fases

1. **Identidade é `userId`, não `username`.** O payload da sessão carrega
   `userId`; é ele que vira coluna nas tabelas e nome de diretório no runner.
   Username é rótulo — renomear alguém não migra dado.
2. **O usuário é resolvido no handler, não repassado pelo middleware.** Um
   header injetado pelo middleware (`x-user-id`) é superfície de spoof e basta
   um caminho público esquecido para virar bypass. `getSessionUser()` lê o
   cookie e reverifica o HMAC dentro do handler; o middleware continua sendo só
   o portão de redirect/401.
3. **Credencial nunca volta em texto claro para o cliente.** As rotas de
   configuração respondem estado (`configurado`, `atualizado em`), nunca o
   segredo.

## Estágios

### Estágio 1 — Usuários e sessão

Objetivo verificável: duas pessoas com senhas diferentes logam e recebem
sessões distintas; a senha do operador continua funcionando sem intervenção.

- Tabela `users (id TEXT PK, username TEXT UNIQUE, password_hash TEXT,
  is_admin INTEGER, created_at TEXT)`. `id` é UUID. Entra como mais um
  `CREATE TABLE IF NOT EXISTS` em `getDb()`, seguindo o padrão existente.
- Bootstrap: na subida, se a tabela estiver vazia e `DASHBOARD_USER` /
  `DASHBOARD_PASSWORD_HASH` estiverem no env, insere o operador como primeiro
  admin com o hash que já existe. As duas variáveis passam a ser só semente.
- Login busca no banco. Quando o usuário não existe, a senha é comparada
  contra um hash bcrypt descartável mesmo assim: sem isso, "não existe"
  responde mais rápido que "senha errada" e vaza quais contas existem.
- Sessões antigas caem: cookie sem `userId` é recusado. Preferido a um caminho
  de compatibilidade para um único usuário existente.
- `scripts/users.ts` com `add`, `list`, `remove`, `password`. Sem tela nesta
  fase: uma página de configuração aqui mostraria uma lista de usuários e mais
  nada, porque ainda não existe dado por usuário.

Fora de escopo: rate limit continua por IP como hoje; nenhuma credencial de
integração é tocada. Até o fim deste estágio, quem logar continua vendo os
dados da máquina.

### Estágio 2 — Cofre e estado por usuário

- Tabela `credentials (user_id, provider, ciphertext, updated_at)`, AES-256-GCM
  com chave em `DAILY_WEB_SECRET_KEY`.
- `ALTER TABLE` em `email_bodies` e `notifications_read` para `user_id`. É aqui
  que entra um mecanismo de migração de verdade, com versão de schema.
- `refresher` deixa de ser singleton: cache por usuário e um loop que percorre
  quem tem sessão recente. Pomodoro vira `Map<userId, state>`.
- Jira, GitHub e To Do passam a ser por usuário — são segredos simples.

### Estágio 3 — Runner por usuário

- `runCli` ganha contexto de usuário e materializa
  `<estado>/users/<userId>/` com `himalaya/config.toml`, o dir do gcalcli e
  `ghpending/config.toml`, injetando `HIMALAYA_CONFIG`, `XDG_DATA_HOME` e as
  env vars do usuário.
- `Account` deixa de ser `'work' | 'personal'` e passa a ser conta cadastrada.
- E-mail e agenda viram por usuário.

### Estágio 4 — Menu de configuração

Cada estágio acima entrega a fatia de tela que usa. O 4 é o acabamento: gestão
de usuários, estado de cada integração, reconectar.

## Testes

Cada estágio entra por TDD. No estágio 1: dois usuários recebem sessões
diferentes; o bootstrap preserva o login antigo; cookie sem `userId` é
recusado; usuário inexistente não é distinguível por tempo de resposta.
