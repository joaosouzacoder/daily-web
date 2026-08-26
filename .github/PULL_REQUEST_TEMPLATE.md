## What changes

<!-- A sentence or two. What can a user now see or do that they could not before? -->

## Why

<!-- The problem this solves. For a bug fix, describe the wrong behaviour:
     what you did, what you expected, what happened instead. -->

Closes #

## How to test

<!-- Steps to reproduce the result on a local instance. If it depends on an
     integration (email, calendar, Jira, GitHub), say which one. -->

1.
2.

## Checklist

- [ ] `npm test` passes
- [ ] `npm run build` passes (the build runs TypeScript)
- [ ] Added or adjusted tests covering the change
- [ ] Updated `CHANGELOG.md`
- [ ] Updated affected docs (README, SECURITY.md, `.env.example`)

## If this touches auth, sessions, the vault, or middleware

- [ ] I described below what changes in the threat model
- [ ] No secret started travelling back to the client
- [ ] Connections are still resolved through the session's owner

<!-- Delete this section if it does not apply. -->

## If this touches the database

- [ ] The migration is idempotent and runs exactly once
- [ ] I tested against a database that already had data, not only an empty one
