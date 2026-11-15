# Adding a city

A new city is **data only**: create one directory, add one line to the registry,
and run the build. No application code changes are needed or expected.

The build validates every city before it compiles the app. A malformed stop, a
missing source, missing coordinates, or a viewpoint that is not marked as a
public sidewalk fails `npm run build`.

## 1. Create the city directory

```
public/tours/<city-id>/
  tour.json
  route.geojson
```

`<city-id>` is kebab-case and must match the registry id, for example
`new-orleans-fq`. The folder name and the registry id are the same value.

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

| Field             | Rule                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| `id`              | Kebab-case, unique within the tour.                                                               |
| `name`            | Non-empty, at least 3 characters.                                                                 |
| `lat`, `lon`      | The stop's mapped location, named `lat`/`lon` (not GeoJSON order).                                |
| `address`         | A real street address. Do not invent one.                                                         |
| `viewpoint`       | Object with `lat`, `lon`, `access`, and `description`. See below.                                 |
| `geofenceRadiusM` | Number greater than 0 and at most 500. The pilot uses ~30 m.                                      |
| `narration`       | 60-120 seconds at 150 words per minute, i.e. roughly 150-300 words.                               |
| `legendLabel`     | `"Legend"` or `"Local legend"`. The schema rejects anything that presents a legend as fact.       |
| `sources`         | At least one absolute `http(s)` URL. Every historical claim and reported sighting needs a source. |

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

### Legends stay legends

The narration may retell ghost stories, but it must frame them as stories. Use
language such as "legend says", "local lore holds", or "tour guides claim", and
label the stop `"Legend"` or `"Local legend"`. Keep documented history and
folklore visibly separate. Do not state a haunting as fact.

### Sources

Every stop needs at least one source URL that supports its historical claims.
Prefer primary or institutional sources: a city agency, a state or national
park service, a historical society, a university, or a reputable local archive.
A source URL is not decoration; a reviewer will check that it supports the
script.

## 4. Write `route.geojson`

Routing happens at build time and its output is committed. The app never calls
a routing API at runtime and never needs a key. Until T2.2 computes real routes,
the pilot file is explicitly a placeholder:

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "LineString",
        "coordinates": [
          [-90.07065, 29.95898],
          [-90.0663, 29.95784]
        ]
      },
      "properties": { "name": "Walking route", "mode": "walking" }
    }
  ],
  "metadata": {
    "schemaVersion": 1,
    "city": "new-orleans-fq",
    "tour": "french-quarter-ghosts",
    "status": "placeholder",
    "note": "Hand-authored scaffolding; replaced by build-time routing in T2.2.",
    "generatedAt": "2026-11-15T00:00:00Z",
    "stops": ["st-louis-cemetery-no-1", "french-opera-house-site"],
    "maneuvers": [
      {
        "from": "st-louis-cemetery-no-1",
        "to": "french-opera-house-site",
        "instruction": "Walk east on St. Louis Street to Bourbon Street.",
        "distanceM": 480,
        "durationS": 350
      }
    ]
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

Do not commit a live API key or a client-side routing call. If a routing source
needs a key, the key belongs in the build environment or local tooling, never in
the repo or the bundle.

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
