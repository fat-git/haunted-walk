# Contributing to Haunted Walk

These rules apply to everyone with write access, human or agent. They exist so that work
from several agents lands in one coherent `main` without anyone having to untangle it
afterwards. Read this before your first branch.

## 1. One task, one branch, one PR

Every change starts from a Paperclip task and lands as exactly one pull request.

Branch naming is mandatory:

```
feature/<issue-id>-short-name     e.g. feature/FAT-3-vite-scaffold
fix/<issue-id>-short-name         e.g. fix/FAT-12-geofence-hysteresis
```

`<issue-id>` is the Paperclip identifier (`FAT-3`), not a description. `short-name` is
two to four hyphenated words. Branch from the current `main`.

Do not bundle unrelated work into one PR. If you discover a second problem while working,
say so on your task and let it be scheduled — a drive-by fix in an unrelated PR is
invisible to the reviewer who owns that area.

## 2. `main` is protected

- **No direct pushes to `main`, by anyone, including the Chief of Staff.** Branch
  protection rejects them server-side.
- All changes arrive by pull request.
- Only the **Chief of Staff merges**, and only after the sign-offs in section 4.
- Do not force-push a branch that someone has already reviewed; push a follow-up commit
  so the reviewer can see what changed.

## 3. What a pull request must contain

A PR with none of this gets sent back unread, which wastes a round-trip for everyone.
Every PR description must have:

1. **A link to its Paperclip task.** One PR, one task, stated explicitly.
2. **What you tested, and how.** Not "tested locally" — the actual commands and the
   actual result. For example: `npm run build` succeeds and `dist/` is produced;
   `npm test` passes 24/24; geofence entry verified with a simulated track through the
   30 m radius at Royal & St Ann. If something is untested, say which part and why.
3. **Anything a reviewer would otherwise have to guess**: a decision you made that the
   task didn't specify, a constraint you hit, a file that looks odd for a reason.

Keep the PR itself reviewable. Generated or vendored files, formatting-only churn mixed
with logic changes, and a 2,000-line diff for a one-sentence task all make review slower
and worse.

## 4. Review and sign-off

Before the Chief of Staff merges, a PR needs:

- **QA sign-off** — the change does what the task asked, and the evidence in the PR
  description is real and reproducible.
- **Security sign-off** — no credential or key-shaped string anywhere in the diff, no new
  network call to a keyed or paid service, no new third-party dependency without a reason
  stated in the PR, and nothing that would break the `$0`-cost or no-keys-in-the-browser
  constraints.

The Chief of Staff then reviews and merges. Address review comments on the branch; don't
open a replacement PR.

## 5. Credentials: the one rule with no exceptions

**No credential is ever committed to this repository, or pasted into a commit message, a
pull request, or a Paperclip task comment.** That covers API keys, tokens, passwords,
private keys, certificates, connection strings, and `.env` files.

This app is designed to need no keys at all: OpenStreetMap tiles need none, narration runs
in the browser, and routing happens at build time. So a key-shaped string in the bundle is
not just a leak — it is a bug, and CI treats it as one.

Three layers back this up, and you should not rely on any one of them:

- `.gitignore` excludes `.env`, `.env.*`, `*.pem`, `*.key` and friends from the first
  commit.
- A **gitleaks scan blocks every PR** that contains a secret.
- **GitHub secret scanning with push protection** rejects a recognized credential
  server-side, before it can ever become public.

The keys this project genuinely has — the GitHub token, the OpenRouter key — live in the
Paperclip connection store and never enter the repo, a prompt, or a task comment. Several
agents here run on third-party model endpoints that may retain what is sent to them, so a
key in a prompt is a key disclosed.

**If you believe a credential has been exposed, stop and report it on your Paperclip task
immediately — without quoting the credential.** Treat it as live and compromised; it has
to be rotated, and deleting the commit is not enough.

## 6. Code and content

- TypeScript, with the project's lint and format config. CI must be green before review,
  not after.
- Match the surrounding code. This is a small codebase; consistency beats personal
  preference.
- Tour data goes in `public/tours/<city>/` and conforms to the documented schema. The
  validator runs in CI — adding a city must not require a code change.
- **Narration content must be verifiable.** Every historical claim and reported sighting
  needs a source recorded with the stop data. Do not invent history, do not invent a
  street address, and do not pad a stop to reach a word count. Fabricated local history
  in a product sold as a tour of a real city is the most expensive mistake available here,
  and the one least likely to be caught by a test.
- Keep accessibility and the mobile-first target in mind: this is used one-handed, on a
  phone, outdoors, in the dark.
