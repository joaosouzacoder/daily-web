# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Only `main` is maintained; there are no release branches.

## [Unreleased]

### Added
- The repository name in the pull requests panel links to the repository on
  GitHub. Pull requests and issues already linked to their own pages; the
  repository heading was the only name on the panel that was not clickable. A
  name that is not in `owner/name` form stays plain text instead of becoming a
  broken link.
- The notification bell now covers three sources instead of one. An open pull
  request and an unread email raise a notification alongside the Jira
  mentions, both derived from what the refresh already loaded — no extra call
  to GitHub or IMAP. Each source contributes at most 20 of its most recent
  items, so a full inbox cannot bury the rest. Dismissing an email
  notification does not mark the email as read on the server: they are
  separate actions.
- The dashboard arrangement is saved per screen size. **Salvar para esta tela**
  records the exact window width and height alongside the arrangement, and on
  load the closest saved size wins — so opening the DevTools or a bookmarks bar
  does not drop you back to the default, while a different monitor keeps its
  own arrangement. Up to 20 sizes per user; saving again at the same size
  replaces it.
- **Notas rápidas**, a new module: a notepad with tabs, kept on the server so
  the notes follow you between machines. Tabs run down the left side and the
  column scrolls on its own when there are many, so the panel stays inside its
  cell on the grid. Text saves itself as you stop typing, on leaving the
  field, on switching tabs, and on closing the page. Double-click a tab to
  rename it. It needs no credential, so it is on from the first login; the
  settings screen only offers the on/off switch.
- The Jira hierarchy expands and collapses, with the same disclosure arrow the
  tasks use. Branches start closed, so the panel opens on the top of each tree
  and you descend where you care; an issue with nothing under it gets a spacer
  instead of an arrow, not a control that does nothing.
- A conversation includes the messages you sent. The Sent folder is read
  alongside the inbox and merged into the thread, so a reply-to-a-reply reads
  as a dialogue instead of a monologue. Sent messages take part in
  conversations but never become inbox rows of their own, and they stay out of
  select/tag/delete: those act on the inbox, and deleting a conversation
  should not destroy your own copy of what you wrote.
- The inbox groups a conversation into one row. The subject loses its stack of
  "Re:"/"Fwd:" prefixes, the row shows who took part and how many messages
  there are, and opening it lists them in the order they happened. A
  conversation of one message opens straight into the body, as before.
  Messages are linked by their References/In-Reply-To headers, and — within a
  single account, where it cannot cross-match — by normalized subject, which
  rescues the threads whose headers a client dropped.
- The quoted history inside a message body folds behind a "···" button, so a
  reply to a reply shows what the person actually wrote. The attribution line
  is recognized in Portuguese, English, Spanish, French and German, since one
  thread commonly passes through clients in different languages.
- Jira issues you do not own can be watched by key. Add `ABC-123` under
  **Acompanhando** and it is fetched alongside your own; the `×` next to it
  stops watching. Keys are validated before reaching JQL, and the row leaves
  the list immediately rather than waiting for the next Jira fetch.
- Shift+click selects a range of messages, as in Gmail: click one, hold Shift
  and click another, and everything between them takes the state of the
  message you clicked.
- Pull requests are grouped by repository, with issues and pull requests as
  separate lists inside each. The `/repos/{repo}/issues` endpoint returns both
  in one list, so a flat list mixed them.
- Scrollbars are styled to match the app instead of falling back to the
  browser default, which the resizable grid made visible everywhere.
- The dashboard is rearrangeable: **Organizar** enters a mode where panels move
  by dragging and resize by the corner, and **Concluir** leaves it. The
  arrangement is stored per user.
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
- The arrangement is saved when you ask, not while you drag. **Organizar** now
  leads to **Salvar para esta tela** and **Descartar**, and nothing reaches the
  server until you pick one — so a layout you messed up costs nothing.
- Rearranging is entered only through the **Organizar** button. Holding Ctrl
  used to enter it as well, which meant a modifier key silently changed what a
  click did anywhere on the dashboard.
- **Restaurar disposição** moved from the dashboard to the settings screen,
  where the rest of the per-user configuration lives.
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
- Dependencies brought up to date again: bcryptjs 3, TypeScript 7, jsdom 30,
  and the `@types` for node and better-sqlite3. bcryptjs is the only one that
  reaches production; hashes written by version 2 still verify, which was
  checked against hashes generated before the upgrade, so stored passwords
  keep working. New hashes are written as `$2b$` instead of `$2a$`.

### Fixed
- Marking a notification as read works for pull requests and emails. The
  notification id was going into the URL path, and a pull request id carries
  both `/` and `#` — the `#` opened a fragment, so the browser dropped the
  `/read` and the request never reached the route. The id now travels in the
  request body, which also covers the email ids, since a Message-Id is free
  text and does not belong in a path.
- The bell is ordered by when things happened, newest first. The sources were
  concatenated one after another, so a message that had just arrived landed at
  the bottom of the list, behind pull requests from weeks earlier.
- Marking a notification as read now records the source it actually came
  from. The route had `jira_mention` hard-coded, which was invisible while
  Jira was the only source; with three, a dismissed pull request or email was
  written under the wrong key and came back on the next cycle. The bell also
  labelled every notification `JIRA` for the same reason.
- Email tags now survive a reload, and tags applied in Gmail itself show up in
  the daily. The panel only ever kept tags in component state, filled in when
  you clicked — so a refresh emptied it and a tag created anywhere else never
  arrived. The envelope now carries the labels the server reports
  (`X-GM-LABELS`), and the row reads from those; the click stays optimistic
  until the next refresh confirms it. Accounts without the Gmail extension
  report no labels and behave as before.
- Saving the layout no longer fails for a tab opened before the deploy. The
  previous client saved on every drag and sent no window size, and the new
  route rejected that with "tamanho de tela inválido" — in the middle of the
  drag. A request without a size now falls back to the single arrangement,
  which is what that client always wrote; only a size that is present and
  nonsensical is still refused.
- A module with no fields no longer offers a **Conectar** button that opens an
  empty form.
- An IMAP uid is per mailbox, so the same number means different messages in
  the inbox and in Sent. The mailbox now travels with the id through the body
  route, the body cache (whose primary key gained a `mailbox` column) and the
  state patches — without it, opening a sent message would have returned an
  unrelated inbox message's body.
- Acting on several messages at once no longer fails. Each target opened its
  own IMAP connection, so a batch of 27 deletions asked for 27 simultaneous
  connections and the server refused 24 of them with "Too many simultaneous
  connections". Targets are now grouped per account and sent as a single IMAP
  command over one connection — which is what the protocol is for, and much
  faster besides. Message ids are checked to be digits before they are joined
  into a sequence set, where `-` and `:` would otherwise form a range and
  reach messages nobody selected.
- A second Google calendar can now be connected. The connection is identified
  by the account that authorized it, so reconnecting the same one renews its
  access while authorizing another adds a calendar. Previously any Google
  connection was overwritten, so the second account erased the first.
- Shift+click selected only the message clicked. The anchor was read inside
  the state updater, which React runs after the anchor has already moved to
  the item just clicked — making every range one item long.

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
- Completing, editing and deleting a task worked again for Microsoft To Do.
  The id validation rejected `=`, which every Graph id carries, so every one
  of them failed with "id inválido".
- The task form's save button locks while the request is in flight; a second
  click used to create a duplicate task.
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
