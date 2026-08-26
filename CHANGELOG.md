# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Only `main` is maintained; there are no release branches.

## [Unreleased]

### Added
- The dashboard is rearrangeable: hold Ctrl and drag a panel to move it, drag
  its corner to resize. The arrangement is stored per user. A button pins the
  same mode for touch screens.
- The Jira panel now shows status, staleness and due date on each row.
  Six issues turned out to be past due, which the panel had no way of
  showing before.
- Contribution infrastructure: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`,
  `CODEOWNERS`, pull request and issue templates, Dependabot.
- CI on GitHub-hosted runners (tests, build, audit of production dependencies)
  and deployment on a self-hosted runner, triggered only by pushes to `main`.
- `LICENSE`. The README had linked to it since the first release, but the file
  did not exist, so GitHub reported the project as "Other".

### Changed
- Production now runs from `/srv/daily-web` instead of the development
  checkout, so a deploy cannot overwrite uncommitted work.
- Documentation is in English. The interface stays in Portuguese.
- The Jira row no longer shows the assignee/reporter badge by default. It read
  the same on 15 of 19 issues, so it occupied the only visual slot on the line
  without carrying information; status, which has five distinct values, took
  its place. Reporter is still marked, because it is the exception.
- Outside the hierarchy view, issues group by situation rather than project.
  Grouping by project barely grouped anything when 16 of 19 belong to one.
- Dependencies brought up to date: React 19.2.8, Vitest 4, Vite 8,
  `@vitejs/plugin-react` 6, better-sqlite3 13, and the checkout and setup-node
  actions to v7.
- `vite-node` is now a direct dev dependency. It used to arrive through
  Vitest 2, which no longer ships it, and `npm run users` depends on it.

## [0.2.0] - 2026-08-26

### Added
- Per-user integrations. Each person registers their own credentials from the
  settings screen; nothing is shared between users.
- Google Calendar over OAuth, as the reliable path for Google accounts.
- Selectable calendar range, from today up to 14 days, per user.
- Web manifest, icons and a service worker, so the page can be installed as
  an app.
- Local task provider backed by SQLite, so the panel works on first login with
  nothing configured.

### Changed
- Integrations run inside the app instead of shelling out to CLIs installed on
  the host: IMAP/SMTP for email, iCal for calendars, REST for Jira and GitHub.
- Actions take effect immediately. They used to appear to do nothing until the
  next refresh cycle, which could be five minutes away.
- The session cookie moved from `SameSite=strict` to `lax`, without which the
  OAuth callback arrived with no session.
- Refresh interval dropped from 300 to 60 seconds.
- Subtasks are collapsed behind a disclosure arrow.

### Fixed
- Next.js upgraded to 16.3.3 for a critical advisory that included a
  middleware bypass — and middleware is this app's auth gate.
- Every open pull request in a tracked repository is listed. A filter was
  hiding the most common case in one's own repository: the dependabot PR.
- Removing a user now deletes their data as well; it used to leave encrypted
  credentials behind.
- Tests can no longer reach the real database.
- The notification popover no longer renders behind the next column.

## [0.1.0] - 2026-08-25

### Added
- First working version: email, calendar, pull requests, Jira, tasks,
  pomodoro and notifications on one page, behind a login.

[Unreleased]: https://github.com/joaosouzacoder/daily-web/compare/main...HEAD
