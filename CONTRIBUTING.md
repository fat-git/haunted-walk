# Contributing to Haunted Walk

## Branch & PR workflow

- All work happens on branches: `feature/<issue-id>-short-name` or `fix/<issue-id>-short-name`
- PRs target the protected `main` branch
- PR descriptions must link the Paperclip issue and list what was tested
- QA (and Security, if hired) must sign off before merge

## No secrets in code

- Never commit API keys, tokens, or passwords
- `.env`, `.env.*`, `*.pem`, `*.key` are covered by `.gitignore`
- `gitleaks` runs on every PR — a hit blocks the merge
- GitHub push protection rejects credential pushes server-side

## Code quality gate

- Every PR must pass: `typecheck`, `lint`, `build`, unit tests, schema validation, and secret scan
- Models: all hires run `opencode/deepseek-v4.1-flash-free` via `opencode_local`
- No OpenRouter keys go into prompts