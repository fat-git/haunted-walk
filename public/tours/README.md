Tour data lives here, one directory per city: `public/tours/<city>/tour.json` plus its
committed `route.geojson`. The registry in `index.json` is the only list of cities.

The build validator (`npm run validate:tours`, run first by `npm run build`) rejects a
malformed, uncited, or incomplete stop. See [docs/adding-a-city.md](../../docs/adding-a-city.md)
for the data-only path and the content rules.
