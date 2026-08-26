# daily-web

Dashboard pessoal para deixar aberto num segundo monitor: e-mail, agenda, pull
requests, Jira, tarefas e pomodoro numa página só, atrás de login.

Cada pessoa conecta as próprias contas pela tela de configuração. Nada é
compartilhado entre usuários e nenhum módulo é obrigatório — quem não usa Jira
simplesmente não liga o Jira.

Next.js 16 · React 19 · SQLite · sem framework de UI, CSS na mão.

## O que dá para conectar

| Módulo | Como autentica | Custo |
|---|---|---|
| E-mail | IMAP/SMTP com senha de app | grátis |
| Agenda | OAuth do Google, ou URL iCal (.ics) | grátis |
| Jira | API token do Atlassian | grátis |
| Pull requests | Personal access token do GitHub | grátis |
| Tarefas | guardadas neste servidor (padrão) | — |

O e-mail não exige aplicativo OAuth nenhum: senha de app sobre IMAP funciona em
qualquer provedor e cada pessoa gera a sua em um minuto.

A agenda tem dois caminhos. O link iCal não exige nada de quem hospeda, mas é
frágil: é fácil copiar o link errado (o Google mostra três na mesma tela) e
administradores de contas corporativas costumam bloquear o compartilhamento
externo, o que derruba o link de vez. Por isso existe a conexão pelo Google, que
é a recomendada para contas Google.

Criar o client OAuth é **gratuito** — a verificação paga do Google só é exigida
para publicar um app que acessa contas de terceiros em escala, e um app não
verificado atende até 100 contas. Quem hospeda cria o client uma vez (passo a
passo em `.env.example`, em `GOOGLE_CLIENT_ID`); quem usa só clica em
"Conectar com Google".

**Tarefas** ficam no banco da própria app, então o painel funciona no primeiro
login sem configurar nada. Quem tem a CLI [mstodo] instalada pode apontar para
o Microsoft To Do e manter a sincronia com o celular.

[mstodo]: https://github.com/joaosouzacoder/daily-tui

## Subindo

Precisa de Node.js 22+.

```sh
npm install
cp .env.example .env.local
```

Preencha no mínimo `SESSION_SECRET` e `DAILY_WEB_SECRET_KEY`:

```sh
openssl rand -hex 32      # SESSION_SECRET
openssl rand -base64 32   # DAILY_WEB_SECRET_KEY
```

Crie o primeiro usuário e suba:

```sh
npm run users -- add <username> <senha> --admin
npm run dev                    # http://localhost:8010
```

Também existem `list`, `password <username> <nova-senha>` e `remove <username>`.

Depois de entrar, vá em **Configuração** e conecte o que você usa. Cada módulo
traz o passo a passo de onde tirar a credencial, e um botão **Testar** que diz
na hora se funcionou.

### Onde conseguir cada credencial

**E-mail** — precisa de senha de app, não da senha da conta:

- Gmail: ative a verificação em duas etapas e gere em
  [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
- Outlook / Microsoft 365: em account.microsoft.com/security, nas opções de
  segurança avançadas
- iCloud: em account.apple.com, seção Segurança
- Qualquer outro provedor IMAP: escolha "Outro" e preencha host e porta

**Agenda** — em conta Google, clique em "Conectar com Google" e escolha quais
agendas mostrar. Para os demais provedores, use o endereço iCal:

- Google Agenda: Configurações → clique na agenda à esquerda → "Integrar
  agenda" → "Endereço secreto no formato iCal" (termina em `.ics` — não é o
  endereço da barra do navegador)
- Outlook: Configurações → Agenda → Agendas compartilhadas → Publicar
- Apple, Fastmail, Nextcloud: qualquer URL `.ics` serve

É somente leitura: o painel mostra os compromissos, não cria nem edita. Quantos
dias aparecem — de hoje até 14 dias — é escolha de cada usuário, nos botões do
próprio painel, e vale também para o que o servidor busca.

**Jira** — API token em
[id.atlassian.com](https://id.atlassian.com/manage-profile/security/api-tokens).
O domínio é o começo da URL: em `acme.atlassian.net`, é `acme`.

**GitHub** — personal access token em
[github.com/settings/tokens](https://github.com/settings/tokens). Escopo `repo`
para repositórios privados; para só públicos, nenhum escopo basta.

## Instalar como app

A página traz manifest e service worker, então o Chrome oferece "Instalar" e
ela abre em janela própria, sem barra de endereço. Funciona em desktop e
Android; no iOS, "Adicionar à Tela de Início" pelo Safari.

O service worker hoje não guarda nada em cache — o painel mostra dados de
agora, e servir uma cópia velha seria pior do que mostrar erro de rede. É a
base para um PWA com estratégia offline por rota.

## Testes

```sh
npm test           # suíte inteira, uma vez
npm run test:watch
```

## Deploy

O diretório `deploy/` traz **um exemplo** do setup que este projeto usa:
processo host via systemd escutando em `127.0.0.1:8010`, com Traefik na frente
terminando TLS. Os arquivos contêm caminhos e domínio específicos daquela
máquina — trate como referência, não como configuração pronta.

Em resumo:

1. Crie `/etc/daily-web/env` (fora do git, `chmod 600`) a partir de
   `.env.example`.
2. Ajuste `deploy/daily-web.service` para o seu usuário, diretório e caminho do
   `npm` (`which npm`), e instale com `systemctl enable --now`.
3. Mescle `deploy/traefik-*-snippet.yml` no `dynamic.yml` do seu Traefik, ou
   use o proxy que preferir.
4. Aponte o DNS para a máquina.

`scripts/deploy.sh` faz o ciclo seguinte (pull, build, restart) e também assume
esse layout.

## Segurança

Leia [SECURITY.md](SECURITY.md) antes de expor isto em qualquer lugar. Resumo:
credenciais são cifradas em repouso com `DAILY_WEB_SECRET_KEY` e cada conexão
é resolvida pelo dono da sessão, então uma pessoa não alcança a conta de outra.
Ainda assim isto **não é multi-tenant**: não há isolamento de processo nem
auditoria, e o operador da máquina tem acesso ao banco. Foi feito para rodar na
sua máquina, para você e para pessoas em quem você confia.

## Licença

[PolyForm Noncommercial 1.0.0](LICENSE) — livre para uso pessoal, estudo,
pesquisa, ONGs e instituições públicas; uso comercial não é permitido.

Isto **não é uma licença open source** no sentido da OSI, que não admite
restrição de campo de uso. É source-available.
