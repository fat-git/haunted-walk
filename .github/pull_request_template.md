<!--
  CONTRIBUTING.md section 3 is the rule; this template is just the shape of it.
  Delete these comments and fill in every section. A PR missing the task link or
  real test evidence gets sent back unread.
-->

## Paperclip task

<!-- One PR, one task. Link it, don't just name it. e.g. FAT-3 — https://.../FAT/issues/FAT-3 -->

## What changed

<!-- Two or three sentences. What a reviewer needs before reading the diff. -->

## What I tested, and how

<!--
  The actual commands and the actual results. Not "tested locally".
  Good:  `npm run build` succeeds, dist/ produced (index.html + 2 assets)
         `npm test` passes 24/24
         geofence entry verified with a simulated track through the 30 m radius at Royal & St Ann
  If something is untested, say which part and why.
-->

## Decisions a reviewer would otherwise have to guess

<!--
  Anything the task didn't specify that you decided, a constraint you hit,
  a file that looks odd for a reason. "None" is a valid answer.
-->

## Checks

- [ ] Branch is named `feature/<issue-id>-short-name` or `fix/<issue-id>-short-name`
- [ ] This PR is one task's worth of change, with no unrelated drive-by edits
- [ ] **No credential, token, key or `.env` content is in this diff** — I checked the diff, not just my intent
- [ ] No new network call to a keyed or paid service; the `$0`-cost and no-keys-in-the-browser constraints still hold
- [ ] Any new dependency is justified above
- [ ] CI is green

## Sign-off

QA and Security sign off in Paperclip before the Chief of Staff merges. Do not merge your own PR.
