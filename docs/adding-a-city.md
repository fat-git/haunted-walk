# Adding a New City

Haunted Walk is designed so that adding a new city requires **only data changes** — no code modifications.

## Data Layout

Each city lives in its own folder under `public/tours/`:

```
public/tours/
├── index.json              # City registry
├── new-orleans-fq/         # City folder (kebab-case city ID)
│   ├── tour.json           # Tour metadata + ordered stops
│   └── route.geojson       # Precomputed walking route (generated at build time)
```

## Step 1: Create City Folder

Create a new folder under `public/tours/` using a kebab-case city ID (e.g., `savannah-ga`, `charleston-sc`).

## Step 2: Add `tour.json`

Create `tour.json` in the new folder with this structure:

```json
{
  "id": "city-tour-name",
  "city": "city-id",
  "name": "Display Name",
  "description": "Tour description for the start screen",
  "stops": [
    {
      "id": "stop-id",
      "name": "Stop Name",
      "lat": 0.0,
      "lon": 0.0,
      "address": "Full street address",
      "viewpoint": { "lat": 0.0, "lon": 0.0 },
      "geofenceRadiusM": 30,
      "narration": "60-120 second script...",
      "legendLabel": "Legend",
      "sources": ["https://example.com/source1", "https://example.com/source2"]
    }
  ]
}
```

### Required Stop Fields

| Field | Type | Requirements |
|-------|------|--------------|
| `id` | string | Unique, ≥3 chars, kebab-case |
| `name` | string | ≥5 chars |
| `lat` | number | -90 to 90 |
| `lon` | number | -180 to 180 |
| `address` | string | Human-readable address |
| `viewpoint` | GeoPoint | Public sidewalk coordinates (lat/lon) |
| `geofenceRadiusM` | number | Positive integer (typically 20-50) |
| `narration` | string | 60-120 seconds spoken (~150-300 words) |
| `legendLabel` | string | Must be "Legend" for ghost stories |
| `sources` | string[] | ≥1 verifiable URL |

### Hard Rules

- **Viewpoints must be public sidewalk positions** — never private property, never inside a closed site
- **Sources are required** — every stop must cite at least one verifiable source
- **Legend labels are "Legend"** — never present folklore as fact
- **Narration duration** — validator enforces 60-120 seconds at 150 WPM

## Step 3: Register the City

Add the city to `public/tours/index.json`:

```json
{
  "cities": [
    {
      "id": "new-orleans-fq",
      "name": "New Orleans French Quarter",
      "defaultTour": "french-quarter-ghosts",
      "description": "A self-guided walking ghost tour through the historic French Quarter"
    },
    {
      "id": "your-new-city",
      "name": "Your City Name",
      "defaultTour": "your-tour-id",
      "description": "Tour description"
    }
  ]
}
```

## Step 4: Build & Validate

Run the build to validate and generate the route:

```bash
npm run build
```

This will:
1. Run the schema validator (fails build on invalid data)
2. Type-check TypeScript
3. Build the Vite production bundle
4. Generate `route.geojson` via `scripts/build-routes.js`

If validation passes, `route.geojson` is created with a walking LineString and maneuver list.

## No Code Changes Required

The app loads cities dynamically from `index.json` at runtime. The map, geofencing, narration, and routing all work automatically for any city that follows the schema.

## Testing Locally

```bash
npm run validate   # Schema check only
npm run dev        # Start dev server
```

## Troubleshooting

| Error | Fix |
|-------|-----|
| `narration must be 60-120 seconds` | Expand or trim narration text (~150-300 words) |
| `must have at least 1 source(s)` | Add verifiable URL to `sources[]` |
| `viewpoint with lat/lon is required` | Add `viewpoint: { lat, lon }` to stop |
| `duplicate stop IDs` | Ensure each stop `id` is unique within the tour |
| `Tour must have at least 2 stops` | Add more stops |

---

**That's it.** Commit the new folder and the `index.json` update, open a PR, and the city is live after CI passes.