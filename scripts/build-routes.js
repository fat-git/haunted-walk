const fs = require('fs');
const path = require('path');
const turf = require('@turf/turf');

const ROOT = path.resolve(__dirname, '..');
const CITY = 'new-orleans-fq';
const TOUR_ID = 'french-quarter-ghosts';
const TOUR_JSON = path.join(ROOT, 'public', 'tours', CITY, 'tour.json');
const ROUTE_JSON = path.join(ROOT, 'public', 'tours', CITY, 'route.geojson');
const BUILD_DIR = path.join(ROOT, 'dist');

function haversineMeters([lng1, lat1], [lng2, lat2]) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function buildRoute() {
  const tour = JSON.parse(fs.readFileSync(TOUR_JSON, 'utf8'));
  const stops = tour.stops.map((s) => [s.lon, s.lat]); // [lng, lat] for GeoJSON

  // Build a simple LineString through all stops
  const coordinates = stops;
  const featureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates,
        },
        properties: {
          name: `${tour.name} walking route`,
          mode: 'walking',
        },
      },
    ],
    metadata: {
      city: CITY,
      tour: TOUR_ID,
      generatedAt: new Date().toISOString(),
      stops: tour.stops.map((s) => s.id),
      maneuvers: tour.stops.slice(1).map((to, i) => {
        const from = tour.stops[i];
        const dist = haversineMeters(
          [from.lon, from.lat],
          [to.lon, to.lat]
        );
        const durationSec = Math.round(dist / 1.4); // walking speed ~1.4 m/s
        return {
          from: from.id,
          to: to.id,
          instruction: `Head toward ${to.name}`,
          distanceM: Math.round(dist),
          durationS: durationSec,
        };
      }),
    },
  };

  // Ensure output directory exists
  const routeDir = path.dirname(ROUTE_JSON);
  if (!fs.existsSync(routeDir)) {
    fs.mkdirSync(routeDir, { recursive: true });
  }

  fs.writeFileSync(ROUTE_JSON, JSON.stringify(featureCollection, null, 2));
  console.log(`Route written to ${ROUTE_JSON}`);
}

buildRoute();