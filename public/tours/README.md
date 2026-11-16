Tour data lives here, one directory per city: `public/tours/<city>/tour.json` plus its
committed `route.geojson`. The registry in `index.json` is the only list of cities.

The build validator (`npm run validate:tours`, run first by `npm run build`) rejects a
malformed, uncited, or incomplete stop. `npm run routes:check` (also run by the build)
proves the committed route still matches a fresh computation over the committed OSM way
snapshot in `data/osm/`. See [docs/ADD_A_CITY.md](../../docs/ADD_A_CITY.md) for the
data-only path and the content rules.

### Legend labels

`legendLabel` is optional on a stop. Absent means this stop tells history only — no
legend is told at this stop.

- `"Legend"` — a widely retold story attached to this specific place.
- `"Local legend"` — a story told locally or by tour guides without wide documentation.
- omit the field — no legend is told at this stop.

A stop that narrates a legend MUST carry a label, and the narration must frame it
as a story ("legend says", "local lore holds", "tour guides claim"), keeping
documented history and folklore visibly separate. A stop that tells no legend
must omit the field — never label history as a legend.
