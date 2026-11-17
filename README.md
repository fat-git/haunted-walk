# Haunted Walk

A mobile-first progressive web app that replaces a guided walking ghost tour. You open it
on your phone, it shows the route, walks you to the next stop, and when you get within
~30 m of that stop it starts reading the stop's history and reported sightings aloud.

**Pilot city:** New Orleans French Quarter.

**Live site:** https://fat-git.github.io/haunted-walk/

> Status (2026-11-15): the pilot is live. The French Quarter tour has 10
> narrated stops with a computed, committed walking route (4.1 km, ~53 min),
> deployed from `main`. QA (T3.1) verdict: PASS WITH NOTES — but no real-device
> testing was possible in the sandbox, so the board owes the pilot one personal
> walk ([docs/RUNBOOK.md](docs/RUNBOOK.md) has the checklist). Security (T3.2)
> confirmed no secrets, no runtime egress beyond OSM tiles, strict CSP, and
> tap-gated permissions; FAT-38 (PR #15) fixed viewpoint placement — every
> French Quarter viewpoint now sits on a public sidewalk within ~10 m of a
> public way — and connector corridors are still checked by eye against the
> committed OSM snapshot because build-time tooling does not validate them yet.
> The board owes the pilot one real-device walk. Operations:
> [docs/RUNBOOK.md](docs/RUNBOOK.md).
> Adding a city: [docs/ADD_A_CITY.md](docs/ADD_A_CITY.md).

## What it does

1. Asks for GPS permission and shows the user's location on a map with the tour route.
2. Gives turn-by-turn walking directions to the next stop.
3. Starts narration automatically on entering a stop's geofence (~30 m, with enter/exit
   hysteresis and GPS-accuracy filtering so it doesn't fire on a bad fix).
4. Controls: play / pause, skip, replay, next stop, and an on-screen transcript.
5. New cities are added as data files under `public/tours/<city>/` plus one registry
   line — no code changes.

## Architecture and the constraints behind it

The hard constraint is **$0 recurring cost and no API keys in the browser**. Every
technology choice below follows from it:

| Concern            | Choice                                          | Why                                                        |
| ------------------ | ----------------------------------------------- | ---------------------------------------------------------- |
| Hosting            | GitHub Pages from a public repo                 | Free; Pages only serves from public repos on the Free plan |
| Map                | Leaflet + OpenStreetMap tiles                   | No key, no account; attribution required and included      |
| Walking directions | GeoJSON precomputed at build time and committed | No live routing API, so no key and no per-request cost     |
| Narration          | Browser `speechSynthesis`                       | No TTS vendor; chunked by sentence to survive iOS Safari   |
| Screen             | Screen Wake Lock API                            | The phone must not sleep mid-tour                          |
| Build              | React + TypeScript + Vite → static `dist/`      | Static output is all Pages can serve                       |

Because the app has no keys by design, **any key-shaped string in the bundle is a bug**,
and that is something CI can test for.

**Privacy, precisely:** your position is processed on your device and never uploaded or
shared. The one network traffic pattern to know about: every map tile is fetched from
OpenStreetMap, which means OSM sees the area you are viewing. That is inherent to
third-party tiles, not to the app's data handling.

Pages serves a project repo from a subpath, so Vite's `base`, the service-worker scope,
and the manifest `start_url` must all be `/haunted-walk/`. If they don't match, the
installed PWA 404s the first time someone reloads it on the street.

## Local development

Requires Node 22.12 or newer (see `.nvmrc`).

| Command                | What it does                                                      |
| ---------------------- | ----------------------------------------------------------------- |
| `npm ci`               | Install from the lockfile                                         |
| `npm run dev`          | Vite dev server (CSP is injected only into production builds)     |
| `npm run build`        | Typecheck and build the static site into `dist/`                  |
| `npm run preview`      | Serve the built `dist/` locally, under `/haunted-walk/`           |
| `npm run typecheck`    | TypeScript project build, no emit                                 |
| `npm run lint`         | ESLint, zero warnings allowed                                     |
| `npm run format:check` | Prettier check                                                    |
| `npm test`             | Vitest unit tests                                                 |
| `npm run check:dist`   | Post-build guard: CSP, base path, manifest, no key-shaped strings |

CI (`.github/workflows/ci.yml`) runs all of these plus a `gitleaks` secret scan on every
PR. The secret scan is a required check: a finding fails the build and blocks the merge.
`.github/workflows/deploy.yml` publishes `dist/` to GitHub Pages from `main`.

## Working rules

Every contributor — human or agent — follows [CONTRIBUTING.md](CONTRIBUTING.md). The
short version:

- Branch `feature/<issue-id>-short-name` or `fix/<issue-id>-short-name`.
- One PR per task into protected `main`; no direct pushes.
- The PR description links its Paperclip task and lists what was tested.
- QA and Security sign off before the Chief of Staff merges.
- **No credential is ever committed, or pasted into a commit message, PR, or task
  comment.**

## Attribution

Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, used
under the Open Database License. Attribution is displayed in the app as the ODbL
requires.
