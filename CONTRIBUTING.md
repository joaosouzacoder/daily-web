# Contributing to daily-web

Thanks for looking. This is a small project maintained by one person, so it is
worth saying up front what tends to be accepted and what does not — so you do
not spend an afternoon on something I will not merge.

## Before writing code

**Open an issue first** for anything larger than an obvious fix. A large,
unagreed pull request is the fastest way to lose work.

Small fixes — a typo, a confusing message, a missing test — can come straight
in as a pull request.

## What this project is

A dashboard you host yourself, for you and a handful of people you trust. It
is not multi-tenant, it is not SaaS, and it does not try to be.

**Usually accepted:**

- New integrations that follow the existing model: a credential the person can
  generate themselves, for free, and enter on the settings screen
- Bug fixes with a test that reproduces the problem
- Accessibility improvements and better error messages
- Support for more email and calendar providers

**Usually turned down:**

- A heavy new dependency to solve something small. The project deliberately
  uses no UI framework and no state library
- An integration that requires the user to pay, or to get approval from a
  third party, in order to use it
- Features that only make sense in a hosted product (billing, teams,
  fine-grained permissions)
- Visual changes without a concrete problem behind them

## Environment

Node.js 22 or newer. Production runs 24, which is what `.nvmrc` pins for CI.

```sh
npm install
cp .env.example .env.local
```

Fill in `SESSION_SECRET` and `DAILY_WEB_SECRET_KEY`:

```sh
openssl rand -hex 32      # SESSION_SECRET
openssl rand -base64 32   # DAILY_WEB_SECRET_KEY
```

```sh
npm run users -- add you a-password-of-8-or-more --admin
npm run dev     # http://localhost:8010
```

You do not need any integration configured to develop: the tasks module works
on its own, storing in local SQLite.

## Running the tests

```sh
npm test              # the whole suite, once
npm run test:watch    # while developing
npm run build         # runs TypeScript; CI fails if this does not pass
```

All three must pass before the pull request. CI runs the same commands.

## How tests are written here

Tests exist to describe behaviour, not to cover lines.

- **Test what the user perceives.** In components, query by role and
  accessible name (`getByRole`, `getByLabelText`), not by CSS class.
- **One test, one claim about behaviour.** The test name should say what the
  system does, from the point of view of someone using it.
- **No real database.** Each test file points `DAILY_WEB_DB_PATH` at a
  temporary directory. `tests/setup.ts` does this by default, but a test that
  needs control should declare its own.
- **No network.** Functions that talk to IMAP, Google, Jira or GitHub are kept
  separate from pure logic precisely so the logic is testable without it. See
  `lib/integrations/ics.ts`: `expandEvents` is pure, `fetchIcs` is the I/O.
- **Comment the why when a test carries a scar.** If it exists because
  something broke in a particular way, say which way.

## Style

There is no linter configured. What is expected:

- **Comments explain why, not what.** The code already says what it does. A
  good comment records the decision, the edge case, what went wrong before.
- **Justify by what is verifiable in this code**, not by quoting a spec or
  making an absolute claim.
- **English** in code, comments, documentation and commit messages.
  **Portuguese** in the user interface strings — the app's own language.
  Some older comments are still in Portuguese; they are being migrated as
  files are touched, and new ones should be English.
- **Error messages state the next step.** "Failed" helps nobody; see
  `lib/integrations/mailErrors.ts` for the pattern.
- Follow the style of the file you are editing, even if you would do it
  differently. Do not reformat neighbouring code in the same pull request.

## Commits

`type(scope): summary in the imperative`:

```
fix(agenda): connecting Google turns the module back on
feat(email): reply inline with an AI-drafted body
```

The body matters more than the summary. Explain the problem that existed
before and why this is the solution. A `git log` that tells the story of the
project is worth more than one that lists changed files.

## Opening the pull request

1. Fork and branch from `main`
2. Run `npm test` and `npm run build`
3. Add an entry to `CHANGELOG.md` under `## [Unreleased]`
4. Open the pull request and fill in the template

CI runs on every pull request. Deploy only runs on `main`, after merge.

## Security

**Do not open a public issue for a vulnerability.** See
[SECURITY.md](SECURITY.md) for the private channel.

If your pull request touches authentication, sessions, the credential vault or
middleware, say so in the title and describe what changes in the threat model.
That area is reviewed more strictly and takes longer.

## Code of conduct

The [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) applies.

## License

Contributions are made under the [PolyForm Noncommercial 1.0.0](LICENSE), the
same license as the project. By opening a pull request you confirm you have the
right to submit that code under it.
