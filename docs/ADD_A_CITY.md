# Adding a city

A new city is **data only**: create one directory, add one line to the registry,
and run the build. The app reads `public/tours/index.json` and offers a city
picker whenever the registry lists more than one city, so no application code
changes are needed or expected.

The build validates every city before it compiles the app. A malformed stop, a
missing source, missing coordinates, or a viewpoint that is not marked as a
public sidewalk fails `npm run build`.

## 1. Create the city directory

```
public/tours/<city-id>/
  tour.json
  route.geojson
data/osm/<city-id>.json
```

`<city-id>` is kebab-case and must match the registry id, for example
`new-orleans-fq`. The folder name and the registry id are the same value. The
`data/osm/` snapshot is described in step 4.

## 2. Add one registry line

`public/tours/index.json` is the list of cities the app knows about:

```json
{
  "schemaVersion": 1,
  "cities": [
    {
      "id": "new-orleans-fq",
      "name": "New Orleans French Quarter",
      "defaultTour": "french-quarter-ghosts",
      "description": "A self-guided walking ghost tour through the historic French Quarter"
    }
  ]
}
```

- `id` is the directory name under `public/tours/`.
- `defaultTour` is the `id` of the tour in that directory's `tour.json`.
- Adding a city is exactly one new object in this array. Do not add a code path.

A directory with no registry line fails the validator, and a registry line with
no directory fails the validator. That keeps the two in step.

## 3. Write `tour.json`

```json
{
  "schemaVersion": 1,
  "id": "french-quarter-ghosts",
  "city": "new-orleans-fq",
  "name": "French Quarter Ghosts",
  "description": "A self-guided walk through the legends of the French Quarter.",
  "stops": [
    {
      "id": "st-louis-cemetery-no-1",
      "name": "St. Louis Cemetery No. 1",
      "lat": 29.9594151,
      "lon": -90.0715037,
      "address": "425 Basin St, New Orleans, LA 70112",
      "viewpoint": {
        "lat": 29.95898,
        "lon": -90.07065,
        "access": "public-sidewalk",
        "description": "Public sidewalk on Basin Street beside the cemetery wall."
      },
      "geofenceRadiusM": 30,
      "narration": "The 60-120 second script goes here...",
      "legendLabel": "Legend",
      "sources": ["https://example.org/a-real-source"]
    }
  ]
}
```

Stops are ordered: the first stop is the start of the tour, and the array order
is the walking order.

### Stop fields

| Field             | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`              | Kebab-case, unique within the tour.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `name`            | Non-empty, at least 3 characters.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `lat`, `lon`      | The stop's mapped location, named `lat`/`lon` (not GeoJSON order).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `address`         | A real street address. Do not invent one.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `viewpoint`       | Object with `lat`, `lon`, `access`, and `description`. See below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `geofenceRadiusM` | Number greater than 0 and at most 500. The pilot uses ~30 m.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `narration`       | 60-120 seconds at 150 words per minute, i.e. roughly 150-300 words.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `legendLabel`     | Optional. `"Legend"` or `"Local legend"`; omit the field when no legend is told at this stop. A stop that narrates a legend MUST carry a label, and the narration must frame it as a story. |
| `sources`         | At least one absolute `http(s)` URL. Every historical claim and reported sighting needs a source.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `images`          | Optional array of stop pictures. Each item needs `src` (a path relative to the tour folder, e.g. `images/<stop-id>-1.jpg`, must exist), `alt` (non-empty, max 160 chars), `credit` (non-empty), `license` (one of CC0, PD, CC-BY-2.0, CC-BY-3.0, CC-BY-4.0, CC-BY-SA-2.0, CC-BY-SA-3.0, CC-BY-SA-4.0), `sourceUrl` (an https URL of the file page on commons.wikimedia.org, attribution link only, never fetched at runtime), and an optional `caption`. A stop with no images is valid. The app renders all images as a phone-friendly gallery with per-image credit/licence links. |
| `lookFor`         | Optional non-empty string (max 280 chars). Short prompt of what to notice from the public sidewalk.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `discuss`         | Optional non-empty string (max 280 chars). Short discussion prompt for visitors.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `funFact`         | Optional object `{ text, kind, sourceUrl }`. `text` non-empty (max 280 chars), `kind` is `"fact"` or `"legend"` (legend content must be labelled as legend in UI), and `sourceUrl` is a required absolute `http(s)` URL.                                                                                                                                                                                                                                                                                                                                                             |
| `quiz`            | Optional object `{ question, options, answerIndex, explanation }`. `question`/`explanation` non-empty (max 280 chars), `options` is 2-4 non-empty strings (max 120 chars each), `answerIndex` is a 0-based index into `options`. Quizzes are tap-to-reveal client-side only (no backend).                                                                                                                                                                                                                                                                                            |
| `funFacts`        | Optional array of up to 6 `{ text, kind, sourceUrl }` fact/legend cards (`kind` `"fact"` or `"legend"`; `sourceUrl` required). Rendered as a tap-through card deck (“Next fact”). Supersedes singular `funFact`; use one or the other, not both.                                                                                                                                                                                                                                                                                                                                     |
| `quizzes`         | Optional array of up to 3 `{ question, options, answerIndex, explanation }` quizzes (`options` 2-4, `answerIndex` 0-based). Rendered as separate tap-to-reveal cards. Supersedes singular `quiz`; use one or the other, not both.                                                                                                                                                                                                                                                                                                                                                    |
| `extraStory`      | Optional object `{ text }` (80-160 words, plain text). Shown as a “Hear more” button that speaks it through the same speechSynthesis engine as narration. Stops on stop-change or geofence trigger; does not interrupt main narration.                                                                                                                                                                                                                                                                                                                                               |
| `challenge`       | Optional non-empty string (max ~160 chars). Shown as a distinct card with a “Done” tap that records completion in localStorage-only visit progress.                                                                                                                                                                                                                                                                                                                                                                                                                                  |

Engagement fields (`lookFor`, `discuss`, `funFact`, `quiz`, `funFacts`, `quizzes`, `extraStory`, `challenge`) are additive: old tours without them remain valid and render unchanged. Any new visitor-facing engagement text is additive and must follow the same legend/fact and sourcing rules as narration/content review. Do not change existing narration wording when adding engagement content.

## 4a. Optional progress and ranks

The tour may override the default playful rank curve via a top-level `progress`
object in `tour.json`:

```json
{
  "progress": {
    "rankLabels": [
      "Fledgling ghost hunter",
      "Ghost seeker",
      "Spirit walker",
      "Haunt master"
    ],
    "rankThresholds": [0, 3, 6, 10]
  }
}
```

- `rankLabels` is an optional array of label strings from lowest to highest rank.
- `rankThresholds` is an optional array of score cutoffs (ascending) matching
  `rankLabels`. Scores are `stopsVisited + quizzesCorrect * 2 + challengesDone * 3`.
- Omit both fields to use the built-in defaults; only supply overrides when a
  new city warrants a different curve.

### Images

Stop pictures are **optional** and **data only**: add an `images` array to stops in `tour.json`, then commit the image files under the tour folder (for example `public/tours/<city>/images/`). The build validator rejects any stop whose image breaks the rules below, so a missing or oversized image fails `npm run build` before the app compiles.

#### Free licenses only

`license` must be one of `CC0`, `PD`, `CC-BY-2.0`, `CC-BY-3.0`, `CC-BY-4.0`, `CC-BY-SA-2.0`, `CC-BY-SA-3.0`, or `CC-BY-SA-4.0`. No other license is accepted. This keeps every picture freely reusable with attribution.

#### Wikimedia Commons for the source

`sourceUrl` must be an `https` URL of a file page on `commons.wikimedia.org`. It is used only for the attribution link ("Photo: <credit>, <license>"); the app never fetches it at runtime. Do not hotlink the image file itself — images are same-origin static files shipped with the tour.

#### Exterior views from public places

Pictures must show exteriors visible from a public sidewalk or public way. Do not photograph inside a paid or closed site, over a private fence, or from private property. The same placement rules that apply to viewpoints apply to pictures: public right-of-way only.

#### Size limits

Each image must be at most 150 KB and use one of `.jpg`, `.jpeg`, `.png`, `.webp`. Images wider than 1200 px should be downscaled before committing; the validator cannot cheaply check dimensions, so keep them modest by convention. Large images bust the walker's data plan and the modest precache budget.

#### Credit required

`credit` (author or photographer) and `alt` (what is visible, max 160 characters) are both required on every image. The credit is rendered on the stop view as "Photo: <credit>, <license>" linking to `sourceUrl`.

### Viewpoints are public sidewalks

`viewpoint` is where the app routes the walker and where the geofence is
centred. It must be a **public sidewalk position outside the site**: never
private property, never a doorway or lobby, and never inside a closed cemetery,
museum, courtyard, or building.

The validator requires:

```json
"viewpoint": {
  "lat": 29.95898,
  "lon": -90.07065,
  "access": "public-sidewalk",
  "description": "Public sidewalk on Basin Street beside the cemetery wall."
}
```

`access` must be exactly `public-sidewalk`. `description` has to say which
public sidewalk the walker should stand on. The viewpoint must also be within
250 m of the stop's `lat`/`lon`.

If the only way to see something is from inside a paid or closed site, do not
make it a stop. Write the narration so the story works from the public
sidewalk, and say so in the script when access is restricted.

### Placement rules reviewers enforce

The T3.2 security review measured every pilot viewpoint against the committed
OSM snapshot. Lessons that now count as review criteria:

- **On the sidewalk, not in the roadway.** A marker that lands in the street
  (the Basin St roadway beside the cemetery, the Bourbon roadway at the opera
  site) satisfies "outside the site" but not "public sidewalk". Place the
  marker on the paved sidewalk itself.
- **Not mid-block.** A marker beyond the sidewalk edge or inside a block
  (the pilot's `pirates-alley` and `rising-sun-hotel-site` markers sit 9–16 m
  from any public way) walks people across private lots. Rule of thumb: keep
  the viewpoint within the public right-of-way, within ~10 m of a public way.
- **The connector counts too.** The route's short connector from the nearest
  public way to the viewpoint must stay inside the right-of-way. Tooling does
  not yet validate connector corridors (known gap, T3.2/F1), so verify by eye
  against `data/osm/<city-id>.json` before committing.
- **Wording must match placement.** Don't write "from this public sidewalk"
  when the viewpoint is in a roadway, and don't place a mid-block marker while
  the script says "between X and Y". Narration and marker must agree.

### Legends stay legends

The label definitions live here, in one place, so every city uses them the same
way:

- `"Legend"` — a widely retold story attached to this specific place.
- `"Local legend"` — a story told locally or by tour guides without wide
  documentation.
- omit the field — no legend is told at this stop (a history-only stop).

The narration may retell ghost stories, but it must frame them as stories. Use
language such as "legend says", "local lore holds", or "tour guides claim", and
label the stop `"Legend"` or `"Local legend"`. Keep documented history and
folklore visibly separate. Do not state a haunting as fact.

A stop that narrates a legend MUST carry a `legendLabel`, and the narration must
frame it as a story. A stop that tells no legend must omit the field — never
label history as a legend, and never leave a narrated legend unlabeled. The
build-time validator enforces: a present label must be `"Legend"` or
`"Local legend"`, and an absent label means history only.

### Leg spacing

Aim for legs under about 600 m between consecutive stops' viewpoints. The New
Orleans leg between `marie-laveau-house-site` and `lalaurie-mansion` is 838 m
(about 11 minutes walking) and is the ceiling — treat any longer leg as a reason
to add a stop or move a viewpoint.

Check leg length after computing the route: each entry in
`route.geojson.metadata.maneuvers` is one leg, and its `distanceM` is the leg
length in metres. Run `npm run routes:check` to prove the committed route still
matches a fresh computation over the committed OSM way snapshot.

### Sources

Every stop needs at least one source URL that supports its historical claims.
Prefer primary or institutional sources: a city agency, a state or national
park service, a historical society, a university, or a reputable local archive.
A source URL is not decoration; a reviewer will check that it supports the
script.

## 4. Commit an OSM way snapshot and compute `route.geojson`

Routing happens at build time and its output is committed. The app never calls
a routing API at runtime and never needs a key.

The routing input is a **committed OSM way snapshot** at `data/osm/<city-id>.json`
— the raw Overpass API response (`way["highway"](bbox); out body geom;`) for a
bounding box that covers every stop with margin. The snapshot is the routing
source of record: recomputing the route is offline, keyless, and deterministic.
Refresh it only deliberately, since a new snapshot can change the committed
route bytes.

Then compute the route:

```sh
npm run routes:compute          # writes public/tours/<city>/route.geojson
npm run routes:check            # proves the committed file matches a fresh computation
```

`scripts/compute-routes.mjs` walks each leg between consecutive stops' viewpoints
over public walkable ways only (sidewalks, footways, pedestrian ways, steps, and
public streets; ways tagged `access=private`, `foot=no`, indoor corridors, and
motorway-class roads are dropped before routing). A leg that cannot be routed on
public ways **fails the command with a message naming the leg** — it is never
silently routed through private property. If that happens, fix the stop order or
move the viewpoint to a public sidewalk.

Each leg becomes one maneuver (`from`, `to`, an instruction composed from the
streets the path actually follows, `distanceM`, `durationS` at ~4.7 km/h). The
committed document looks like:

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "LineString",
        "coordinates": [["…longitude…", "…latitude…"]]
      },
      "properties": { "name": "Walking route", "mode": "walking" }
    }
  ],
  "metadata": {
    "schemaVersion": 1,
    "city": "new-orleans-fq",
    "tour": "french-quarter-ghosts",
    "status": "computed",
    "note": "Walking route computed at build time from the committed OSM way snapshot…",
    "generatedAt": "…snapshot base timestamp…",
    "stops": ["…stop ids in tour order…"],
    "maneuvers": ["…one per leg…"]
  }
}
```

Rules the validator enforces:

- `type` is `FeatureCollection`; at least one `LineString` feature exists.
- Coordinates are `[longitude, latitude]` pairs, as GeoJSON requires.
- `metadata.stops` lists the tour's stop ids **in order**.
- There is one maneuver per leg, with matching consecutive `from`/`to` ids.
- `metadata.status` is `placeholder` or `computed`. A placeholder must include a
  `note` saying what will replace it.

`npm run build` runs `routes:check` first, so a stale or hand-edited route file
fails the build until it is recomputed and committed. Do not commit a live API
key or a client-side routing call. If a routing source needs a key, the key
belongs in the build environment or local tooling, never in the repo or the
bundle.

## 5. Validate and build

```sh
npm run validate:tours   # same check the build runs first
npm run build            # validator, typecheck, then vite build
```

The validator prints every problem with its file and JSON path, for example:

```
Tour data validation failed with 1 problem(s):
  - public/tours/new-orleans-fq/tour.json: tour.stops[0].sources: must cite at least 1 source
```

To prove a failure locally, temporarily delete a stop's `sources` or its `lat`
and `lon`, run `npm run build`, and confirm it stops before Vite builds. Restore
the data afterwards.

## 6. Deploy and verify

Merge through the normal PR gate. After the Pages deploy, run the post-deploy
checks in [RUNBOOK.md](RUNBOOK.md): for every city in the registry,
`/haunted-walk/tours/<id>/tour.json` and `/haunted-walk/tours/<id>/route.geojson`
must be HTTP 200 and each `route.geojson` must report `metadata.status: "computed"`,
plus `sw.js` and the manifest must be HTTP 200.
