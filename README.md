# Haunted Walk

A mobile-first progressive web app that replaces a guided walking ghost tour. You open it
on your phone, it shows the route, walks you to the next stop, and when you get within
~30 m of that stop it starts reading the stop's history and reported sightings aloud.

**Pilot city:** New Orleans French Quarter.

**Live site:** https://fat-git.github.io/haunted-walk/

> Status: the repository is being set up. The application scaffold lands in the Vite +
> React + TypeScript task; until then this repo holds the working rules only.

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

| Concern | Choice | Why |
| --- | --- | --- |
| Hosting | GitHub Pages from a public repo | Free; Pages only serves from public repos on the Free plan |
| Map | Leaflet + OpenStreetMap tiles | No key, no account; attribution required and included |
| Walking directions | GeoJSON precomputed at build time and committed | No live routing API, so no key and no per-request cost |
| Narration | Browser `speechSynthesis` | No TTS vendor; chunked by sentence to survive iOS Safari |
| Screen | Screen Wake Lock API | The phone must not sleep mid-tour |
| Build | React + TypeScript + Vite → static `dist/` | Static output is all Pages can serve |

Because the app has no keys by design, **any key-shaped string in the bundle is a bug**,
and that is something CI can test for.

Pages serves a project repo from a subpath, so Vite's `base`, the service-worker scope,
and the manifest `start_url` must all be `/haunted-walk/`. If they don't match, the
installed PWA 404s the first time someone reloads it on the street.

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
