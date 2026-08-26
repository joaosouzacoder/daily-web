# Security

## Reporting a vulnerability

**Do not open a public issue.** Use
[GitHub Security Advisories](https://github.com/joaosouzacoder/daily-web/security/advisories/new),
which is private and visible only to the maintainer.

Include what you can: the affected version or commit, steps to reproduce, and
what an attacker gains. A proof of concept helps but is not required.

This is a one-person project, so expect a first reply within about a week. It
runs no bug bounty and offers no reward beyond credit in the advisory, if you
want it.

## Supported versions

Only `main` receives fixes. There are no maintained release branches: if you
run this, run the latest commit.

| Version | Supported |
|---|---|
| `main` | yes |
| anything older | no |

## Threat model

daily-web is built to run **on your own machine, behind a login**, serving you
and at most a handful of people you trust. It is **not multi-tenant**: there is
no per-user process isolation and no audit log, and whoever operates the
machine can read the database and the key that encrypts everyone's
credentials.

**Do not expose this on the open internet** assuming the login makes it a
public service. Put it behind a TLS proxy, use strong passwords, and only give
accounts to people you would trust with access to the machine.

## Credentials

Each person registers their own email, calendar, Jira and GitHub credentials.
They are stored encrypted with AES-256-GCM, keyed by `DAILY_WEB_SECRET_KEY`,
which lives in the service environment — never in the database, never in git.
Without the key, the settings screen says so and blocks the form rather than
accepting input and failing later.

A stored secret **never travels back to the client**. The screen receives only
the names of the secret fields that exist, and leaving a field blank on edit
means "leave it alone".

Every connection is resolved through the session's owner (`requireConnection`).
Another person's connection id is not "forbidden": it does not exist for that
session, and the answer is identical to that of an invented id, so nothing
reveals that it exists in another account.

This protects one user from another. It **does not protect anyone from the
machine's operator**, who can read the key and the database.

## What is already in place

- Passwords stored as bcrypt hashes, never in the clear.
- Session in an `httpOnly`, `secure`, `sameSite=lax` cookie, signed with HMAC.
- Middleware fails closed: with no `SESSION_SECRET`, no token is accepted.
- The user is resolved inside the handler by re-reading the cookie — the
  middleware injects no identity header, which would be a spoofing surface.
- Login rate limiting per IP, using the last entry of `X-Forwarded-For` (the
  earlier ones are forgeable by the client).
- Login does not distinguish "no such user" from "wrong password" by response
  time.
- The OAuth `state` is HMAC-signed with `SESSION_SECRET` and carries the user
  id; the callback requires both a valid signature and a session belonging to
  the same user.
- The iCal URL is restricted to `http`/`https`, and the file has a size limit.
- Only fields declared by a module can be written to a connection, and fields
  marked hidden cannot be written by the client at all.

## Public files without a session

`/manifest.webmanifest`, `/sw.js`, `/icon.svg` and `/icons/*` answer without a
login: Chrome fetches the manifest without credentials and registers the
service worker before any session exists, and behind the login they would
receive the redirect HTML instead. None of them carries user data.

`/api/integrations/agenda/google/callback` is also reachable without the
middleware's check, because it performs its own: a valid signed `state` plus a
session belonging to the same user. Letting it through means a failure renders
as a readable message instead of raw JSON in the browser.

## CI and deployment

The deploy workflow runs on a **self-hosted runner** on the machine that serves
the app. In a public repository that is only safe under a specific
configuration, documented at the top of `.github/workflows/deploy.yml`:

- It triggers only on `push` to `main`, which requires write access.
- It contains no `pull_request` or `pull_request_target` trigger. Adding either
  would let a stranger's code execute on that machine.
- Pull request CI runs on GitHub-hosted runners, which is where untrusted code
  belongs.

The runner account has passwordless `sudo` on that machine, so anything merged
to `main` can run as root there. That is equivalent to the maintainer's own
access, and it is the reason the branch must stay protected.

## Known limitations

- The optional task provider still runs the `mstodo` CLI on the machine via
  `execFile` (never through a shell), with arguments validated in
  `lib/api/validation.ts`. Enabling that provider accepts that surface; the
  default local provider runs no process at all.
- There is no CSRF token; protection comes from `sameSite=lax` on the cookie.
  `lax` does not send the cookie on cross-site POST, PUT, PATCH or DELETE, and
  every mutation in this app uses one of those methods.
- There is no audit log of who did what.
- The AI reply draft sends the message body to Anthropic's API. Without
  `ANTHROPIC_API_KEY` the feature is off.
