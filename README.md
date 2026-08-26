# daily-web

Dashboard pessoal para deixar aberto num segundo monitor: e-mail, agenda, pull
requests, Jira, tarefas e pomodoro numa página só, atrás de login.

É a versão web do [daily-tui](https://github.com/joaosouzacoder/daily-tui), com
as mesmas features. Como o TUI, ele **não fala direto com Gmail, Google, Jira
ou GitHub** — ele executa CLIs já instaladas e autenticadas na máquina e
formata a saída. Isso é o que torna o setup barato e o que cria o principal
pré-requisito, abaixo.

Next.js 16 · React 19 · SQLite · sem framework de UI, CSS na mão (Catppuccin
Mocha).

## Pré-requisitos

Este é o degrau mais alto: os painéis só mostram dados se as CLIs
correspondentes estiverem **instaladas e autenticadas na máquina que roda a
app**. Cada uma é independente — sem o `jira` configurado, só o painel do Jira
mostra erro; o resto do dashboard continua funcionando.

| Painel | CLI | Projeto |
|---|---|---|
| E-mail | `himalaya` | <https://github.com/pimalaya/himalaya> |
| Agenda | `gcalcli` | <https://github.com/insanum/gcalcli> |
| Pull requests | `ghpending` | CLI própria |
| Jira | `jira` | CLI própria |
| Tarefas | `mstodo` | CLI própria |

Além disso: Node.js 22+ e, para o rascunho de resposta com IA,
uma `ANTHROPIC_API_KEY`.

## Rodando local

```sh
npm install
cp .env.example .env.local     # preencha o que for testar
npm run dev                    # http://localhost:8010
```

Crie o primeiro usuário:

```sh
npm run users -- add <username> <senha> --admin
```

Também existem `list`, `password <username> <nova-senha>` e
`remove <username>`.

Alternativa: preencher `DASHBOARD_USER` e `DASHBOARD_PASSWORD_HASH` no env —
na primeira subida com a tabela vazia eles semeiam o primeiro admin. Gere o
hash com:

```sh
node -e "require('bcryptjs').hash(process.argv[1], 10).then(console.log)" 'sua-senha'
```

## Testes

```sh
npm test           # suíte inteira, uma vez
npm run test:watch
```

## Configuração

Tudo vem de variáveis de ambiente; veja `.env.example` para a lista comentada.
As que não têm default e você provavelmente precisa:

- `SESSION_SECRET` — obrigatório. Sem ele nenhum login é aceito, de propósito.
  Gere com `openssl rand -hex 32`.
- `PUBLIC_ORIGIN` — origem pública HTTPS, usada para montar o redirect de login
  sem confiar no `Host` enviado pelo cliente.
- `DAILY_WEB_DB_PATH` — default `./data/daily-web.db`.

## Deploy

O diretório `deploy/` traz **um exemplo** do setup que este projeto usa:
processo host via systemd escutando em `127.0.0.1:8010`, com Traefik na frente
terminando TLS. Os arquivos contêm caminhos e domínio específicos daquela
máquina (usuário do SO, shims do asdf, host do roteador) — trate como
referência, não como configuração pronta.

Os passos, em resumo:

1. Crie `/etc/daily-web/env` (fora do git, `chmod 600`) a partir de
   `.env.example`.
2. Ajuste `deploy/daily-web.service` para o seu usuário, diretório e caminho do
   `npm` (`which npm`), e instale com `systemctl enable --now`.
3. Mescle `deploy/traefik-*-snippet.yml` no `dynamic.yml` do seu Traefik, ou
   use o proxy que preferir.
4. Aponte o DNS para a máquina.

`scripts/deploy.sh` faz o ciclo seguinte (pull, build, restart) e também
assume esse layout.

## Segurança

Leia [SECURITY.md](SECURITY.md) antes de expor isto em qualquer lugar. Resumo:
a app executa CLIs do sistema com dados vindos da requisição, então quem tem
sessão tem, por construção, bastante alcance. Foi feita para rodar na sua
máquina, para você e para pessoas em quem você confia — não é multi-tenant.

## Roadmap

Suporte a múltiplos usuários com credenciais próprias está em andamento, em
quatro estágios. O primeiro (usuários no banco) está pronto; o desenho completo
e o raciocínio estão em
[`docs/superpowers/specs/2026-08-26-multiusuario-design.md`](docs/superpowers/specs/2026-08-26-multiusuario-design.md).

## Licença

[PolyForm Noncommercial 1.0.0](LICENSE) — livre para uso pessoal, estudo,
pesquisa, ONGs e instituições públicas; uso comercial não é permitido.

Isto **não é uma licença open source** no sentido da OSI, que não admite
restrição de campo de uso. É source-available.
