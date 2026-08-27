# daily-web

[![CI](https://github.com/joaosouzacoder/daily-web/actions/workflows/ci.yml/badge.svg)](https://github.com/joaosouzacoder/daily-web/actions/workflows/ci.yml)
[![License: PolyForm Noncommercial 1.0.0](https://img.shields.io/badge/license-PolyForm%20Noncommercial%201.0.0-blue)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A522-brightgreen)](.nvmrc)

A personal dashboard meant to sit open on a second monitor: email, calendar,
pull requests, Jira, tasks and a pomodoro timer on one page, behind a login.

Everyone connects their own accounts from the settings screen. Nothing is
shared between users and no module is mandatory — if you do not use Jira, you
do not turn Jira on.

Next.js 16 · React 19 · SQLite · no UI framework, CSS written by hand.

> The interface is in Brazilian Portuguese. Code, comments and documentation
> are in English. There is no translation layer yet.

---

## Contents

- [What you can connect](#what-you-can-connect)
- [Why no OAuth for email](#why-no-oauth-for-email)
- [Getting started](#getting-started)
- [Where to get each credential](#where-to-get-each-credential)
- [Installing as an app](#installing-as-an-app)
- [How it is put together](#how-it-is-put-together)
- [Tests](#tests)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

---

## What you can connect

| Module | How it authenticates | Cost |
|---|---|---|
| Email | IMAP/SMTP with an app password | free |
| Calendar | Google OAuth, or an iCal (.ics) URL | free |
| Jira | Atlassian API token | free |
| Pull requests | GitHub personal access token | free |
| Tasks | stored on this server (default) | — |
| Quick notes | stored on this server | — |

Each module is independent. A module with no connection does not render an
empty panel — it does not render at all.

**Tasks** live in the app's own database, so the panel works on first login
with nothing configured. If you have the `mstodo` CLI installed you can point
it at Microsoft To Do instead and keep phone sync.

## Why no OAuth for email

Email needs no OAuth application at all: an app password over IMAP works with
any provider, and each person generates their own in a minute.

Calendar has two paths. The iCal link requires nothing from whoever hosts the
app, but it is fragile: it is easy to copy the wrong link (Google shows three
on the same screen) and corporate Workspace administrators commonly disable
external sharing, which kills the secret address permanently. That is why the
Google connection exists, and it is the recommended path for Google accounts.

Creating the OAuth client is **free**. Google's paid CASA review is only
required to publish an app that reaches other people's accounts at scale; an
unverified app serves up to 100 accounts. Whoever hosts creates the client
once (step by step in `.env.example`, under `GOOGLE_CLIENT_ID`); everyone else
just clicks **Conectar com Google**.

## Getting started

Node.js 22 or newer. Production runs 24, which is what `.nvmrc` pins for CI.

```sh
git clone https://github.com/joaosouzacoder/daily-web.git
cd daily-web
npm install
cp .env.example .env.local
```

Fill in at least `SESSION_SECRET` and `DAILY_WEB_SECRET_KEY`:

```sh
openssl rand -hex 32      # SESSION_SECRET
openssl rand -base64 32   # DAILY_WEB_SECRET_KEY
```

Create the first user and start:

```sh
npm run users -- add <username> <password> --admin
npm run dev                    # http://localhost:8010
```

`users` also takes `list`, `password <username> <new-password>` and
`remove <username>`.

Once you are in, open **Configuração** and connect what you use. Each module
carries a walkthrough of where to find the credential, and a **Testar** button
that tells you right away whether it worked.

## Where to get each credential

The inbox groups messages into conversations: one row per thread, with the
count and who took part, expanding to the messages in order. Inside a message,
the quoted history folds behind a button.

**Email** — needs an app password, not your account password:

- Gmail: turn on two-step verification, then generate one at
  [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
- Outlook / Microsoft 365: at account.microsoft.com/security, under advanced
  security options
- iCloud: at account.apple.com, Security section
- Any other IMAP provider: choose "Outro" and fill in host and port

**Calendar** — on a Google account, click **Conectar com Google** and pick
which calendars to show. For other providers, use the iCal address:

- Google Calendar: Settings → click the calendar on the left → "Integrate
  calendar" → "Secret address in iCal format" (ends in `.ics` — it is not the
  address in your browser's bar)
- Outlook: Settings → Calendar → Shared calendars → Publish
- Apple, Fastmail, Nextcloud: any `.ics` URL works

It is read-only: the panel shows appointments, it does not create or edit them.
How many days appear — from today up to 14 — is each user's choice, in the
panel's own buttons, and it governs what the server fetches too.

**Jira** — API token at
[id.atlassian.com](https://id.atlassian.com/manage-profile/security/api-tokens).
The domain is the start of the URL: in `acme.atlassian.net`, it is `acme`.

**GitHub** — personal access token at
[github.com/settings/tokens](https://github.com/settings/tokens). Scope `repo`
for private repositories; for public ones, no scope is needed.

## Rearranging the dashboard

Click **Organizar** to move panels by dragging and resize them by the
bottom-right corner; **Concluir** leaves the mode. Outside it the panels are
ordinary content, so clicking a message, ticking a task and selecting text
keep working.

The arrangement is stored per user on the server, so it follows you between
screens. **Restaurar disposição** appears once you have changed something.

Panels have a fixed height on the grid and scroll internally, which is what
makes resizing mean anything. Below 1024px the grid gives way to a single
column in the order the panels are arranged.

## Installing as an app

The page ships a manifest and a service worker, so Chrome offers **Install**
and it opens in its own window without an address bar. Works on desktop and
Android; on iOS, use "Add to Home Screen" from Safari.

The service worker caches nothing today — the panel shows data as it is right
now, and serving a stale copy would be worse than showing a network error. It
is the starting point for a PWA with a real per-route strategy.

## How it is put together

```
app/            Next.js App Router: pages and API routes
  api/          one route per action; each resolves the user from the cookie
components/     panels and UI primitives; no UI framework
lib/
  auth/         users, password hashing, session tokens
  vault/        AES-256-GCM encryption and per-user connections
  integrations/ IMAP, iCal, Google Calendar, Jira REST, GitHub REST
  tasks/        local SQLite provider and the optional mstodo adapter
  db.ts         schema and numbered migrations
  refresher.ts  background fetch loop and the per-user state cache
deploy/         systemd unit, Traefik snippets, publish and healthcheck
docs/           design documents
```

Two ideas explain most of the structure:

**Connections, not credentials.** A user can have several mailboxes and
several calendars. Each connection is a row with its own label, encrypted at
rest, resolved through the session's owner.

**I/O separated from logic.** Anything that talks to a network lives beside a
pure function that can be tested without one. `expandEvents` parses a calendar;
`fetchIcs` downloads it. That is why the suite runs in seconds with no fixture
server.

## Tests

```sh
npm test           # the whole suite, once
npm run test:watch
npm run build      # runs TypeScript
```

Tests never touch a real database: `tests/setup.ts` points every file at a
throwaway one. They never touch the network either.

## Deployment

`deploy/` holds **an example** of the setup this project uses: a host process
under systemd listening on `127.0.0.1:8010`, with Traefik in front terminating
TLS. The files contain paths and a domain specific to that machine — treat
them as a reference, not a ready-made configuration.

In short:

1. Create `/etc/daily-web/env` (outside git, `chmod 600`) from `.env.example`.
2. Adjust `deploy/daily-web.service` for your user, directory and `npm` path
   (`which npm`), then `systemctl enable --now`.
3. Merge `deploy/traefik-*-snippet.yml` into your Traefik `dynamic.yml`, or use
   whatever proxy you prefer.
4. Point DNS at the machine.

Pushes to `main` deploy automatically through a self-hosted GitHub Actions
runner: `deploy/publish.sh` copies the tested build into place and
`deploy/healthcheck.sh` confirms the service answers before the run goes
green. Read the security note at the top of `.github/workflows/deploy.yml`
before changing anything there.

## Contributing

Pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first — it
says what tends to be accepted, what tends to be turned down, and how the
tests are written here.

The [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) applies.

## Security

Read [SECURITY.md](SECURITY.md) before exposing this anywhere. In short:
credentials are encrypted at rest with `DAILY_WEB_SECRET_KEY` and every
connection is resolved through the session's owner, so one person cannot reach
another's account. Even so this is **not multi-tenant**: there is no process
isolation and no audit log, and the machine's operator has the database. It is
built to run on your machine, for you and people you trust.

Report vulnerabilities privately through
[Security Advisories](https://github.com/joaosouzacoder/daily-web/security/advisories/new),
never in a public issue.

## License

[PolyForm Noncommercial 1.0.0](LICENSE) — free for personal use, study,
research, nonprofits and public institutions; commercial use is not permitted.

This is **not an open source license** in the OSI sense, which does not allow
field-of-use restrictions. It is source-available.
