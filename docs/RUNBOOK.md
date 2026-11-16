# Runbook

Operating manual for the deployed pilot. The app supports any city listed in
`public/tours/index.json`; today only the New Orleans French Quarter is
shipped. Facts here were verified against main at `85997e5` (PRs #9, #10, #11 merged).

Live site: <https://fat-git.github.io/haunted-walk/>

The invariants this runbook protects:

- **No runtime API calls and no API keys.** Routing is computed at build time
  and committed (`public/tours/<city>/route.geojson`). The app only ever talks
  to its own origin and OpenStreetMap tile servers.
- **The build gates deploy.** `npm run build` runs `routes:check` (the
  committed route must byte-match a fresh computation over the committed OSM
  snapshot), `validate:tours`, `tsc`, and Vite; CI adds lint, format, tests,
  and a required `gitleaks` scan. Nothing reaches Pages that skipped these.

## Deploy

Merging (or pushing) to `main` is the deploy. `.github/workflows/deploy.yml`:

1. `npm ci` → `npm run build` → `npm run check:dist` (CSP, base path, manifest,
   no key-shaped strings).
2. Uploads `dist/` as a Pages artifact and deploys it (`deploy-pages@v4`,
   environment `github-pages`). The workflow sets `cancel-in-progress: false`,
   so an in-flight deploy is never cut in half; new deploys queue.
3. The deploy's URL is the site: `https://fat-git.github.io/haunted-walk/`.

To deploy the current `main` again without a merge: **Actions → Deploy to
GitHub Pages → Run workflow** (`workflow_dispatch`).

GitHub Pages caches responses for ~10 minutes, including `sw.js`, so allow a
few minutes before judging a fresh deploy broken — and compare the served JS
asset hash with a local `npm run build` from the same commit before concluding
anything.

## Roll back

Rollback is **revert + redeploy**. Pages has no instant server-side rollback.

```sh
git checkout main && git pull
git revert <bad-commit>   # squash-merged PRs: revert the squash commit
git push origin main
```

- Pushing to `main` re-runs the deploy workflow automatically; verify with the
  post-deploy checks below.
- Several bad commits: revert newest-first.
- A revert that touches `tour.json` or `data/osm/` must reproduce the route
  (or be followed by `npm run routes:compute`), or `routes:check` fails the
  build and the rollback cannot deploy.
- Client-side lag: an installed PWA keeps its old service-worker precache until
  the new `sw.js` is fetched on a later visit (up to ~10 min of Pages cache on
  `sw.js` itself). A user mid-tour is never yanked mid-narration, but they also
  do not get the fix until they reopen the app.

## Rebuild the route

The route is data, not a runtime service. Recompute it whenever stop order,
viewpoints, or the OSM snapshot change.

```sh
npm run routes:compute   # rewrites public/tours/new-orleans-fq/route.geojson
npm run routes:check     # proves the committed file reproduces byte-for-byte
```

The routing input is the committed Overpass snapshot
`data/osm/new-orleans-fq.json` (query `way["highway"](bbox); out body geom;`,
164 ways, base timestamp `2026-11-15T17:09:04Z`), so recomputation is offline
and deterministic. The route's `generatedAt` is pinned to the snapshot's
`osm3s.timestamp_osm_base`.

**Refreshing the OSM snapshot** — only deliberately, because a refresh can
change the committed route bytes:

1. Query Overpass with the same query over a bbox that covers every stop with
   margin; save the raw response to `data/osm/<city-id>.json`.
2. `npm run routes:compute && npm run routes:check`.
3. Read the `maneuvers` diff — a new snapshot can legitimately change street
   names or leg lengths.
4. Commit `data/osm/<city-id>.json` and `route.geojson` together, or
   `routes:check` fails the build.

A leg that cannot be routed over public walkable ways fails `routes:compute`
with the leg named — it is never silently routed through private property.

**Known open gap (T3.2/F1):** the router appends each viewpoint connector
without checking that the connector itself stays on public ground. At
`pirates-alley` and `rising-sun-hotel-site` the last ~20 m of the drawn line
cuts across block interiors. Connector-corridor validation and/or viewpoint
relocation is owned by the geo/data engineer; until it lands, expect field
testers to walk a few meters off the drawn line at those two stops.

## Check after every deploy

All URLs must be HTTP 200. The required set is the app shell, `sw.js`, the
manifest, and — for **every city listed in `tours/index.json`** — that city's
`tour.json` and `route.geojson`. Iterate the registry rather than hard-coding
a city id; the manifest is an additional check. The New Orleans French Quarter
rows below are a worked example.

| URL (under `https://fat-git.github.io`)            | Expect                                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `/haunted-walk/`                                   | App shell loads; no blank page; CSP `<meta>` present in the page source                    |
| `/haunted-walk/tours/index.json`                   | Registry JSON listing every city                                                           |
| `/haunted-walk/tours/<id>/tour.json`               | HTTP 200 tour JSON for each city id `<id>` in the registry                                 |
| `/haunted-walk/tours/<id>/route.geojson`           | HTTP 200; `metadata.status` is `computed`; maneuvers; stops in tour order, for each `<id>` |
| `/haunted-walk/tours/new-orleans-fq/tour.json`     | Tour JSON, 10 stops (worked example: New Orleans French Quarter)                           |
| `/haunted-walk/tours/new-orleans-fq/route.geojson` | `metadata.status` is `computed`; 9 maneuvers; stops in tour order (worked example)         |
| `/haunted-walk/sw.js`                              | Service-worker JS (never a 404 or the HTML fallback)                                       |
| `/haunted-walk/manifest.webmanifest`               | `id` / `start_url` / `scope` all under `/haunted-walk/`                                    |

Then in a browser: DevTools → Application shows the service worker registered
at scope `/haunted-walk/`, and the map draws the route with OSM tiles (the CSP
allows only `tile.openstreetmap.org`).

Verified 2026-11-15 against the live site: all required URLs 200;
`route.geojson` `metadata.status` = `computed`.

## Known limits

- **No rerouting if the walker leaves the route.** Directions are the
  committed maneuvers; the distance readout is straight-line (haversine)
  distance to the next stop. If someone strays, they rejoin the drawn line or
  use the Google Maps / Apple Maps deep-link buttons.
- **Web Speech voice differences (iOS vs Android).** Narration is browser
  `speechSynthesis`, chunked by sentence to survive iOS Safari. Available
  voices, the default voice, and speaking rate differ by OS and device; iOS
  requires a user gesture before audio starts (the Start Tour tap provides
  it). The same script sounds different on the two platforms.
- **GPS multipath in narrow streets.** The Quarter's narrow lanes and tall
  buildings bounce GPS; fixes can jump tens of meters. The geofence softens
  the audible effect (enter at 30 m, exit at 45 m, two consecutive fixes to
  confirm entry), but arrival can still lag a moment in "canyon" spots.
- **The screen must stay on.** A wake lock is held while the tour is active
  and re-acquired when the app returns to the foreground. Locking the phone or
  switching apps drops it until you come back. Browsers without the Wake Lock
  API show a notice asking the user to keep the screen awake manually.

### Open defects from T3.1 (QA) and T3.2 (Security) — not yet fixed

- Narration text is silently dropped when a sentence ends before a comma or
  closing quote (`splitIntoSentences`): the last line of
  `french-opera-house-site` and a ~40-word passage of `old-absinthe-house` are
  never spoken or shown in the transcript. (T3.1 D1)
- 3 of 9 maneuver instructions say "service lane"; the ways are public, but
  the wording is rough for pedestrians. (T3.1 D2)
- Two contrast pairs fail WCAG AA (transcript "past" lines and small footer
  text). (T3.1 D3) Narration does not pause when the walker exits the 45 m
  radius. (T3.1 D5, product decision pending)
- 4–5 of the 10 viewpoint markers are not on public-sidewalk positions: the
  cemetery stop sits on the Basin St roadway side, the opera site in the
  Bourbon roadway, `pirates-alley` mid-block, `rising-sun-hotel-site` inside
  the block, `napoleon-house` borderline. Data fix owned by the geo/data
  engineer. (T3.2/F2, plus the connector gap above)
- Dev-only dependency vulns (`minimatch`, `deepmerge`) never reach the browser
  bundle; no lockfile-only fix exists, so a manifest-level bump is tracked as
  follow-up work. (T3.2 checks 5a–5d)

**What has NOT been device-tested** (T3.1's stated sandbox limits): no real
device pass, no iOS Safari / Android Chrome in the field, no live TTS audio,
no browser-level offline reload. The checklist below is how the board covers
that gap — do not report the pilot as device-tested until someone has walked
it.

## Field-test checklist (one personal walk)

For the board's single walk of the pilot. Bring a charged phone; a second
person on the other OS is ideal but optional.

Before leaving:

- [ ] Open <https://fat-git.github.io/haunted-walk/> (install to home screen
      optional) — the page loads under `/haunted-walk/`, no blank screen.
- [ ] **Audio check (FAT-43):** on the start screen, tap **Test audio** and
      confirm you hear "Audio check. If you can hear this, narration will
      work." The result line shows the voice count, chosen voice name, and
      started/ended/error. If it fails, fix volume/silent mode here — do not
      start the walk with unverified audio.
- [ ] Accept the safety notice; tap Start Tour; allow location when asked (the
      GPS explainer appears before the permission prompt).
- [ ] Headphones optional; volume follows media volume.

During the walk (St. Louis Cemetery No. 1 → Old Absinthe House, 10 stops, ~4.1
km, ~53 min):

- [ ] Each stop's narration starts automatically within ~30 m of its marker
      and plays once (not again on every re-entry).
- [ ] Transcript highlights the current line; pause / resume / replay / skip
      work while walking.
- [ ] Maneuver text and the next-stop distance readout stay sane between
      stops; the final stop shows the end-of-tour state.
- [ ] The screen stays awake for the whole tour (wake lock).
- [ ] Put the phone in your pocket for one stretch; audio and GPS resume
      normally when you take it back out.

Known rough spots (expect these, from T3.2):

- [ ] `pirates-alley` and `rising-sun-hotel-site`: the drawn line's last ~20 m
      crosses block interiors — walk with judgment; the marker is the cue, not the
      line.
- [ ] Cemetery stop: the marker sits on the Basin St roadway side across from
      the wall; stand on the sidewalk and expect a few meters of offset.
- [ ] Narrow "canyon" streets: if narration fires early or late by a few
      meters, note where.

After:

- [ ] Note anything that did not fire, fired twice, or sounded wrong (voice,
      rate, cutoff), with the stop name.
- [ ] Rough battery use and any GPS weirdness.
- [ ] Report findings on FAT-36 (or the follow-up issue). Real-device results
      are the one piece QA could not produce.

## Who owns what

| Area                                                         | Owner                                                                       |
| ------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Tour/route data, viewpoints, OSM snapshots, `routes:compute` | Geo & Data Engineer                                                         |
| App code (geofence, narration, UI)                           | App engineer                                                                |
| Content (scripts, legends, sources)                          | Chief of Staff review gate                                                  |
| Merges                                                       | Chief of Staff (QA + Security sign-off; docs-only PRs exempt from sign-off) |

See also [ADD_A_CITY.md](ADD_A_CITY.md) for the data-only path to a second
city.
