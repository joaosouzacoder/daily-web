# daily-web

Dashboard pessoal (Catppuccin Mocha) com paridade de features com o
[daily-tui](https://github.com/joaosouzacoder/daily-tui): e-mail, agenda, PRs,
Jira, tarefas e pomodoro, atrás de login/senha, pensado para ficar aberto num
segundo monitor. Roda em `dashboard.joaosouzacoder.com.br`.

Arquitetura completa em
[`docs/superpowers/specs/2026-08-25-daily-web-design.md`](docs/superpowers/specs/2026-08-25-daily-web-design.md).

## Desenvolvimento

```sh
npm install
npm run dev      # http://localhost:8010
npm test         # roda a suíte inteira uma vez
npm run test:watch
```

Copie `.env.example` para `.env.local` e preencha o que for testar localmente.

## Deploy nesta VPS (primeira vez)

1. **Gerar o hash da senha** (usa o bcryptjs já instalado como dependência):

   ```sh
   node -e "require('bcryptjs').hash(process.argv[1], 10).then(console.log)" 'sua-senha-aqui'
   ```

2. **Criar `/etc/daily-web/env`** (fora do git) com base em `.env.example`,
   preenchendo `DASHBOARD_USER`, o hash gerado acima em
   `DASHBOARD_PASSWORD_HASH`, um `SESSION_SECRET` aleatório
   (`openssl rand -hex 32`), e `PUBLIC_ORIGIN` com a origem pública HTTPS do
   dashboard (`https://dashboard.joaosouzacoder.com.br`):

   ```sh
   sudo mkdir -p /etc/daily-web
   sudo cp .env.example /etc/daily-web/env
   sudo chmod 600 /etc/daily-web/env
   sudo nano /etc/daily-web/env
   ```

3. **Instalar o serviço systemd:**

   ```sh
   sudo cp deploy/daily-web.service /etc/systemd/system/daily-web.service
   sudo systemctl daemon-reload
   sudo systemctl enable --now daily-web
   ```

   O `ExecStart` do unit aponta para o `npm` do asdf
   (`/home/jgabr/.asdf/shims/npm`), que é como Node.js está instalado nesta
   VPS — o PATH padrão do systemd não inclui os shims do asdf. Se o alvo do
   deploy instalar Node.js de outra forma (nvm, pacote do sistema, etc.),
   ajuste `Environment=PATH=...` e `ExecStart=` em
   `deploy/daily-web.service` para o caminho real do `npm` (`which npm`)
   antes de copiar o arquivo.

4. **Mesclar o Traefik**: adicionar o conteúdo de
   `deploy/traefik-router-snippet.yml` dentro de `http.routers` e de
   `deploy/traefik-service-snippet.yml` dentro de `http.services` em
   `/docker/traefik/dynamic.yml` (o Traefik já observa esse arquivo — não
   precisa reiniciar o container).

5. **Cloudflare**: criar o registro `A` (ou `CNAME`) de `dashboard` apontando
   para o IP desta VPS, no mesmo modo (proxied) usado pelos outros
   subdomínios.

6. **Conferir**: `curl -I https://dashboard.joaosouzacoder.com.br` deve
   redirecionar para `/login`.

## Deploys seguintes

```sh
./scripts/deploy.sh
```

## Autenticação das CLIs de dados

`himalaya`, `gcalcli`, `jira`, `mstodo` e `ghpending` precisam estar
instaladas e autenticadas **nesta VPS** (contas próprias, separadas do
notebook) antes que os painéis correspondentes mostrem dados — enquanto isso,
o painel mostra o erro da CLI no lugar dos dados, sem derrubar o resto do
dashboard. Ver a seção "Autenticação headless das CLIs" da spec para o
raciocínio; o passo a passo de cada CLI é o mesmo do
[README do daily-tui](https://github.com/joaosouzacoder/daily-tui#configuração-das-contas),
adaptado para rodar sem navegador local quando aplicável.
