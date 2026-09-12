# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Only `main` is maintained; there are no release branches.

## [Unreleased]

### Changed
- The refresh cycle no longer re-reads a whole mailbox to find out that
  nothing changed. Messages already read from the server are kept, and each
  cycle asks for two things over one connection: what arrived after the last
  uid it knows, and the flags of a recent window of uids — which is how a
  message read, labelled or deleted in another client catches up here. Nothing
  is concluded about what lies outside that window, because nothing outside it
  was asked. A folder's stored copy is capped, and a folder the server
  reindexes is dropped and read again.

### Added
- Mailboxes other than the inbox can now be read. `GET /api/email/mailboxes`
  returns the account's folder tree with the total and unread count of each
  folder, and `GET /api/email/messages` lists one folder at a time under an
  explicit cap. The tree is stored and reused for ten minutes, because
  counting a folder costs one round trip to the server per folder, and a
  server that fails to answer leaves the stored tree standing rather than
  emptying the panel.
- Mailbox actions carry the folder they act on. A message is identified by the
  folder it lives in and the numbering that folder announced, so an action
  recorded before the server reindexed a folder now fails in the open instead
  of landing on whichever message inherited the uid.

### Fixed
- A deleted e-mail no longer comes back, and neither does one that was marked
  as read before being deleted. Every mailbox action is now written to a
  durable log before it reaches the server, and each snapshot the server
  returns is reconciled against that log instead of overwriting it: the
  message stays out of the list until the server agrees, survives a restart of
  the service, and is retried with bounded attempts and exponential backoff
  when the write fails. An action that runs out of attempts brings the message
  back with the error on its row, because it really is still in the mailbox.
- Every IMAP operation for one account now waits its turn in that account's
  queue. Listing holds a connection for seconds, and an action fired meanwhile
  opened a second login that the provider refused — which is how a delete
  failed and the message returned to the screen.

### Changed
- The active note tab is the same band as the sidebar's active item — a brand
  tint fading out with a 3px bar — instead of a solid surface that read as a
  black block in the dark theme, with a brand bar that curved around the tab's
  rounded corner.
- The front end is rebuilt on Tailwind v4 and shadcn/ui. The hand-written
  stylesheet is gone, replaced by a token layer in `oklch()`: a six-level
  surface ramp, five elevations that each open with a large inset highlight,
  fixed signal colours independent of the accent, and an iridescent mesh the
  whole page floats on. Panels, dialogs and popovers are translucent surfaces;
  buttons, chips and status pills are round; containers follow a radius ladder.
- Type is seven roles, each carrying family, size, leading, weight and tracking
  together, so a size is never chosen alone at a call site. Every stray size
  below the 13px caption floor was routed to the role it wanted, uppercase
  micro-labels with wide tracking are gone, and numbers use the text face with
  tabular figures rather than the mono face.
- Status is never hue alone: each state carries a glyph and a label beside the
  colour, so the reading survives a grayscale print. No status follows the
  accent, since a status that did would change colour when the accent changed
  with nothing about the status having changed.
- The screens gain an app shell: a recessed sidebar whose active item is a band
  with a 3px bar rather than a pill, a command palette on Cmd+K over routes and
  settings, and an account block. The frame is pinned to the viewport, so the
  mesh stays still while only the content column scrolls.
- The hour-driven ambient background is removed along with its module and test.
  The system paints a fixed mesh instead, on the ground that the accent stays
  the colour of action while the background is atmosphere.

### Added
- The Jira panel has a "Problemas" tab listing your stories and epics
  (assignee or reporter, open or updated in the last 30 days) with
  data-quality problems, each with every problem it has and a link to the
  issue: a story in progress without a start date, a done story without a
  start or resolution date, a story without an epic, an epic without stories,
  and an epic in progress with no story in progress. The start date is found
  by field name ("Start date" / "Data de início"); if the instance has no such
  field the tab says so instead of flagging every story. Epic children come in
  one paginated `parent in (...)` search, not one request per epic.
- The active Jira tab lives in the URL (`?jira=…`), so reloading, going back
  and sharing the link land on the same tab.
- A note can be renamed from a pencil beside its tab, not only by
  double-clicking it. Enter saves, Escape cancels, and an empty title keeps the
  old name. The Drive copy follows: the next sync renames the same file rather
  than creating a new one.
- A note opens full screen from a maximize button at the top right of the
  editor, in the app dialog, with the toolbar, the preview and the save status.
  Focus lands in the text; Escape or the restore button brings it back to the
  panel with focus in the panel's text, and whatever was typed is saved before
  the switch.
- Quick notes can keep a durable copy in the user's own Google Drive, so they
  no longer depend on the machine that serves the app. **Guardar no Google
  Drive** in the settings screen connects one Google account per user with the
  `drive.file` scope, which only reaches files the app created. Each note is a
  `.md` file in a *daily-web — notas* folder, uploaded a few seconds after each
  change; failures leave the note pending and it is retried on the next change
  or the next time the notes are opened. Deleting a note moves its file to the
  Drive trash. On a fresh install, connecting the same account restores the
  notes. The copy is one-way, and notes that existed before this change are
  not bulk-uploaded — each goes up the next time it is edited. The OAuth flow
  reuses the calendar's client and redirect URI; the signed `state` now carries
  what the authorization is for.
- Notes are Markdown. The editor gets a formatting toolbar, keyboard shortcuts
  (bold, italic, strikethrough, inline code, link) and list continuation on
  Enter for bullet, numbered and task lists; **Visualizar** renders the note
  with GitHub-flavoured Markdown — tables, task lists, fenced code with syntax
  highlighting, links opening in a new tab. Rendering is sanitized: raw HTML
  is dropped, the tree goes through GitHub's allowlist, and `javascript:`-style
  URLs are stripped. New dependencies: `react-markdown`, `remark-gfm`,
  `rehype-sanitize` and `rehype-highlight`.
- Theme is three states — system, light and dark — where system is the absence
  of both a class and a cookie. Both legs of the dark palette are written out,
  so an explicit light choice wins on a dark machine and an explicit dark choice
  wins on a light one. The choice is stamped during server render, so there is
  no wrong-theme flash on first paint.
- A display density setting beside it, comfortable or compact, changing vertical
  rhythm only: a dense screen needs more visible lines, not smaller type.
- Screens use the full width of the display. The content column was capped at
  1280px, which on a wide monitor was empty margin on both sides of a panel
  that is dense on purpose. Frame padding and vertical rhythm tighten with it.
- Controls whose glyph says it all drop their label: the bell with its count in
  a round badge, refresh as a spinner that actually spins while it works, the
  pomodoro's play and pause, a broom to reset it, the mail batch bar's mark,
  move and delete, a plus for every add (note, task, subtask, repository,
  watched issue), a pencil and a bin on a connection, a key to change a
  password, checks to mark notifications read, and the grid's arrange and
  discard. Dropping a label is a space decision and must not become a
  meaning one, so every one of them keeps its words in a tooltip and in its
  accessible name — a shared component makes that the only way to build one.
- The header counts down to the next background refresh ("próxima em 9:41"),
  so a screen that has not changed in a while reads as "waiting for the next
  cycle" rather than "stuck". The server announces the time of its next tick
  in the dashboard state; the page only ticks the local clock down.
- The sidebar collapses to a 56px icon rail on Cmd+B or from its own control,
  which gives a vertical monitor back 184px of width. The choice rides a cookie
  the server reads during render, so a collapsed rail never expands for a frame
  on reload, and each item keeps its label in a tooltip and for screen readers.

### Fixed
- The Jira "Problemas" tab no longer reports every closed story. The rule
  "concluída sem data de conclusão" flagged a done story whose `resolutiondate`
  was empty, but in this Jira instance most workflows never apply a resolution
  on the transitions that finish a card, so that field stays null on issues
  that are legitimately closed — 93 issues were reported for a field the
  operation does not feed. Taking "done" from the status category instead makes
  the rule say only "a done story is done", so it was removed along with its
  label and the `resolutiondate` fetch, which nothing else used. The other five
  rules are unchanged.
- Panels can be resized again in "Organizar" mode. The rule that stops panel
  content from catching the pointer while arranging was widened to every child
  of the grid item in the Tailwind rebuild, which also caught the resize handle
  the grid injects there: pulling the corner moved the panel instead of
  resizing it. The handle is now excluded from that rule.
- The background refresh now reaches the screen. The production build bundles
  the refresher once for the startup hook that runs the loop and again for the
  API routes, and each copy kept its own cache: the loop refreshed a cache no
  route read, so the dashboard only changed when someone clicked refresh, and
  the next-refresh countdown never appeared because the routes never saw the
  loop's schedule. The refresher's state now lives on the process, shared by
  every copy.
- The background refresh runs every ten minutes by default instead of every
  minute, and `REFRESH_SECONDS` is validated: an empty or non-numeric value
  used to reach `setInterval` as `NaN`, which fires every millisecond. Any
  invalid value now falls back to the default. A tick that arrives while the
  previous cycle is still running is still dropped, not queued.
- The pointer cursor is back on everything clickable. Tailwind v4's preflight
  leaves buttons on the arrow, unlike v3, and on a dashboard where nearly every
  control is a button that reads as "not clickable" on almost everything. It is
  set once in the base layer rather than per component, so a control added
  tomorrow cannot forget it, and a disabled control now shows `not-allowed`
  instead of giving no reason for the click that did nothing.
- Deleting anything asks in an app dialog instead of the browser's own. The
  native one cannot be styled, cannot be reached from the keyboard beyond its
  two buttons, blocks the whole tab, and on some platforms is suppressed
  outright — a destructive action that silently never asks is worse than one
  that asks badly. Escape cancels, Enter confirms, focus lands on the confirm
  button, and cancel comes first so the destructive button is never the one a
  hand lands on by habit.
- A focused control on a panel's first row no longer has its ring sliced off.
  The ring reaches 4px past its control and that row sat flush against the
  scroll container's clipping edge.
- A panel's frame no longer scrolls away with its rows. The card sat inside the
  scroll container, so scrolling a long list carried the border and the rounded
  corners off the top and the module stopped reading as a box. The card is now
  the grid item itself, pinned to the module bounds, with the header fixed and
  only the content moving under it.
- The notification menu no longer paints under the page. It was positioned
  inside `<main>`, which scrolls and sits among panels that carry a
  backdrop-filter, and a backdrop-filter creates a stacking context no z-index
  can climb out of. The panel is portalled to the body and positioned against
  the trigger.
- The Jira "Em aberto" tab stops breaking in a narrow module. Its meta line
  wrapped mid-phrase, splitting "Em andamento" across two lines and stranding
  the status glyph on its own. Each meta item is now indivisible and the row
  wraps between them.
- `.gitignore` anchors its SQLite pattern to `/data/`. Unanchored, `data/`
  matched any directory of that name at any depth, which silently kept
  `components/data/` out of both git and the CSS content scan — its utilities
  never reached the stylesheet and its files were in no commit.
- The systemd unit restarts on any exit, not only on failure. An external
  SIGTERM exits cleanly, and a clean exit is not a failure, so the service
  stayed down until somebody noticed rather than coming back on its own. A
  deliberate `systemctl stop` still stops it for good, and the
  `systemctl restart` in `deploy/publish.sh` is unaffected.

### Added
- A third tab, **Aprovados**, listing what you approved. There is no JQL
  function for it: `myApproved()` and `myDecided()` do not exist,
  `approvedBy(currentUser())` is rejected because the `approvals` field takes no
  function with an argument, and `approved()` on its own answers "approved by
  anyone" — it returns other people's decisions. What narrows it to you is the
  transition out of the approval status having been yours, the same trick
  **Entregues** already uses. Unlike every other query in the module, this one
  names a status: without `FROM "Aprovação"`, an issue approved by someone else
  joins the list the moment you touch its status, which was measured against the
  Service Desk approval API — 8 of 9 correct without it, 7 of 7 with it. The
  cost is known and deliberate: if the workflow renames that status, the tab
  goes quiet.
- **Entregues** and **Aprovados** can be read by day or by week. Both default to
  today, as before, and a **7 dias** chip widens them. Both lists arrive already
  covering the week with a mark on what falls in today, so switching the period
  is a cut over what is already in memory rather than another round trip — and
  the day boundary stays the one Jira uses (`startOfDay()`, in your profile's
  timezone), not a date computed in the browser. The period belongs to both tabs
  at once: the two lists answer the same question about two different events.
- **Em aberto** also lists what is waiting for your approval. Until now the tab
  answered "what is assigned to or reported by me", which left out the requests
  that only need a decision from you — they belong to someone else and never
  showed up. The query asks Jira for `approvals = myPending()`, the one thing
  that separates an approval waiting on *you* from an issue merely parked in a
  status called "Aprovação", which may be waiting on somebody else. An approval
  carries an `APROV` badge, joins the same hierarchy and project grouping as the
  rest, and an issue that is both yours and pending your approval stays a single
  row. Approving is not one of the roles, so these issues also survive the
  Responsável/Relator filter: narrowing by role no longer hides what is asking
  you for a decision.
- **Marcar todas como lidas**, in the notification bell. The bell holds up to
  20 items per source across three sources, so emptying it one row at a time
  cost up to 60 clicks. The button sits above the list with the unread count
  beside it, and appears only when there is something to dismiss. It sends the
  ids that were on screen when you clicked, in one request, and the badge drops
  before the server answers, as the single row already did. A malformed id
  fails the whole batch instead of writing part of it, which would leave the
  screen claiming everything was read while the rest came back on the next
  cycle. Dismissing an email notification still does not mark the email as
  read on the server.
- The Jira panel is split into two tabs. **Em aberto** holds what the panel
  always showed, the issues where you are the assignee or the reporter, and
  **Entregues** lists the ones you closed today, in the same shape: the
  hierarchy, grouped by project, so a service request in PDS does not sit
  next to a story in DAD. A delivered issue reads its status in green,
  the only situation that asks nothing more of you. The query names no
  status: it asks for issues currently in the Done category whose status you
  changed today, or that were resolved today under your name, so a workflow
  that closes in "Resolvido" and one that closes in "Done" both work.
  Something you closed and someone reopened is not delivered, and does not
  appear.
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
- Each refresh cycle logs one line, `refresh.cycle`, with its duration and the
  panels that came back with an error. A degrading cycle used to be visible
  only as a panel that stopped moving.
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
- The email panel no longer goes stale until you press refresh several times.
  Three sources of IMAP contention were making the automatic cycle fail: body
  warming opened one connection per message, so a cycle with thirty new emails
  attempted thirty logins per mailbox and the server started rejecting them
  with an authentication failure; a cycle that ran past the interval had the
  next one start on top of it; and the refresh button opened a second read
  alongside the running cycle, so clicking again made the contention worse
  instead of better. Body warming now fetches through a single connection per
  account, capped per cycle; a tick is skipped while the previous cycle is
  still running; and a refresh requested while one is in flight — from the
  button or from the loop — receives the result of the one already running.
- A mailbox whose socket dropped outside a command no longer takes the whole
  process down. The IMAP client had no `error` listener, so the failure
  surfaced as an uncaught exception, and the connection teardown could reject
  on its own and mask the real error.
- Deleting an email no longer brings it back a few seconds later. A refresh
  cycle reads the mailboxes at the start and only writes the cached dashboard
  state at the end, so an action taken in between was overwritten by a
  snapshot that predated it — the message reappeared on the panel until a
  later cycle read the mailbox again. Actions applied while a refresh is in
  flight are now replayed on top of its snapshot before it becomes the cache,
  which covers marking as read, unread and moving as well.
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
