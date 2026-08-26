# Multiusuário com autenticações próprias

Data: 2026-08-26
Status: implementado

## Problema

O daily-web era single-user por construção. O login vinha de duas variáveis de
ambiente e a app não guardava credencial nenhuma: ela executava CLIs que liam a
configuração da máquina, como o usuário do SO.

| Integração | Onde estava a credencial |
|---|---|
| himalaya (e-mail) | `~/.config/himalaya/config.toml`, OAuth2 via `ortie` |
| gcalcli (agenda) | `~/.local/share/gcalcli-accounts/`, OAuth2 Google |
| jira | env `JIRA_CLOUD` / `JIRA_EMAIL` / `JIRA_TOKEN` |
| ghpending | `~/.config/ghpending/config.toml` + env `GITHUB_TOKEN` |
| mstodo | env `DAILY_TUI_TODO_*`, OAuth2 Microsoft |

Isso funciona para uma pessoa e não funciona para nenhuma outra. Uma segunda
pessoa não instala nem autentica as ferramentas de terceiros na máquina alheia,
e o dono da máquina não quer emprestar as próprias credenciais.

## Restrição que moldou o desenho

Gmail por IMAP (`https://mail.google.com/`) e a API do Google Agenda são escopos
*restricted*. Um app externo que os use precisa de verificação mais CASA Tier 2:
auditoria por laboratório aprovado, custo na casa dos milhares de reais por ano
e semanas de espera. Em "Testing", o Google revoga o refresh token em 7 dias e
limita a 100 usuários. Apps *Internal* escapam disso, mas só atendem contas do
mesmo Workspace — e contas pessoais `@gmail.com` forçam External.

**Decisão: a app não vira cliente OAuth de ninguém.** Cada integração usa a
credencial mais simples que o provedor já oferece de graça:

| Módulo | Credencial | Por quê |
|---|---|---|
| E-mail | senha de app, IMAP/SMTP | universal, sem cadastro de app, funciona em qualquer provedor |
| Agenda | URL secreta em formato iCal | grátis, somente leitura, e o painel só lê |
| Jira | API token do Atlassian | já era grátis |
| Pull requests | personal access token do GitHub | já era grátis |
| Tarefas | banco da própria app | funciona no primeiro login, sem credencial |

A consequência é que as CLIs saem do caminho crítico. `himalaya`, `gcalcli`,
`jira` e `ghpending` foram substituídos por clientes dentro da app. Só o
`mstodo` continua, como provedor **opcional** de tarefas, para quem já usa
Microsoft To Do e quer manter a sincronia com o celular — o Microsoft também só
fala OAuth, e ali a CLI já resolvida é melhor do que reimplementar o fluxo.

## Modelo de dados

**`connections (id, user_id, module, label, ciphertext, created_at, updated_at)`**
— N conexões por módulo. Uma credencial por provedor não comportava duas caixas
de e-mail nem três agendas. O rótulo é da pessoa: "Trabalho", "Pessoal".

**`module_settings (user_id, module, enabled, updated_at)`** — cada módulo é
opcional. Sem registro, vale a existência de conexão; tarefas é a exceção, e vem
ligado porque funciona sem credencial.

`Account` deixou de ser `'work' | 'personal'` e passou a ser o id de uma
conexão. Com contas por usuário isso é dado, não tipo.

## Invariantes

1. **Identidade é `userId`, não `username`.** Username é rótulo — renomear
   alguém não migra dado.
2. **O usuário é resolvido no handler, não repassado pelo middleware.** Um
   header injetado (`x-user-id`) é superfície de spoof e basta um caminho
   público esquecido para virar bypass. `getSessionUser()` relê o cookie e
   reverifica o HMAC dentro do handler.
3. **Credencial nunca volta em texto claro para o cliente.** As rotas respondem
   estado (`configurado`, `campos secretos que existem`), nunca o segredo. Campo
   secreto em branco numa edição significa "não mexe".
4. **Conexão é resolvida pelo dono da sessão.** `requireConnection` filtra por
   `user_id`, então o id de outra pessoa não é proibido — é inexistente, e a
   resposta é a mesma de um id inventado.

## O que a tela precisa entregar

Configurar tem de ser possível para quem não sabe o host IMAP do próprio
provedor. Daí três coisas na tela de integrações:

- **Presets** de Gmail, Outlook, iCloud, Yahoo e Fastmail preenchem host e
  porta; host e porta só aparecem no modo manual.
- **Instruções por módulo**, dizendo em que página do provedor a credencial é
  gerada.
- **Botão Testar**, que abre a conexão e responde na hora. Sem isso, configurar
  uma caixa é preencher um formulário e esperar o próximo ciclo do refresher
  para descobrir que a senha estava errada.

Erro de IMAP cru ("Invalid credentials (Failure)") não diz o que fazer, então
`lib/integrations/mailErrors.ts` traduz os casos comuns para a instrução
correspondente.

## Migração

As migrações numeradas em `lib/db.ts` levam as credenciais antigas para
`connections` **sem abri-las** — a migração roda na subida, quando
`DAILY_WEB_SECRET_KEY` pode nem estar no ambiente, então o ciphertext é copiado
verbatim. O cache de corpos de e-mail é descartado: as chaves referenciavam
`work`/`personal`, que não correspondem a conexão nenhuma, e o cache se
reconstrói sozinho.

`scripts/import-machine-config.ts` importa o que estava em variáveis de
ambiente e arquivos da máquina para as conexões de um usuário, para quem já
rodava a versão anterior não redigitar token. E-mail e agenda ficam de fora de
propósito: eles autenticavam por OAuth e agora pedem senha de app e link iCal,
que só a pessoa consegue gerar.

## Limites assumidos

Não é multi-tenant. Não há isolamento de processo por usuário nem auditoria, e
quem opera a máquina lê o banco e a chave. O isolamento implementado protege um
usuário do outro, não protege ninguém do operador.
