#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const TOURS_DIR = path.join(ROOT, 'public', 'tours');

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function validateNarrationDuration(narration) {
  const words = narration.split(/\s+/).filter((w) => w.length > 0).length;
  const wpm = 150;
  const seconds = (words / wpm) * 60;
  return Math.round(seconds * 10) / 10;
}

function validateStop(stop, index) {
  const errors = [];

  if (!stop.id || stop.id.length < 3) {
    errors.push(`Stop ${index} (${stop.id || 'missing'}): id must be at least 3 characters`);
  }

  if (!stop.name || stop.name.length < 5) {
    errors.push(`Stop ${index} (${stop.id}): name must be at least 5 characters`);
  }

  if (stop.lat < -90 || stop.lat > 90) {
    errors.push(`Stop ${index} (${stop.id}): lat must be between -90 and 90`);
  }

  if (stop.lon < -180 || stop.lon > 180) {
    errors.push(`Stop ${index} (${stop.id}): lon must be between -180 and 180`);
  }

  const narrationSeconds = validateNarrationDuration(stop.narration);
  if (narrationSeconds < 60 || narrationSeconds > 120) {
    errors.push(
      `Stop ${index} (${stop.id}): narration must be 60-120 seconds (got ${narrationSeconds})`
    );
  }

  if (!stop.sources || stop.sources.length < 1) {
    errors.push(`Stop ${index} (${stop.id}): must have at least 1 source(s)`);
  }

  if (!stop.viewpoint || stop.viewpoint.lat === undefined || stop.viewpoint.lon === undefined) {
    errors.push(`Stop ${index} (${stop.id}): viewpoint with lat/lon is required`);
  }

  if (typeof stop.geofenceRadiusM !== 'number' || stop.geofenceRadiusM <= 0) {
    errors.push(`Stop ${index} (${stop.id}): geofenceRadiusM must be a positive number`);
  }

  if (!stop.legendLabel) {
    errors.push(`Stop ${index} (${stop.id}): legendLabel is required`);
  }

  if (!stop.address || stop.address.length < 5) {
    errors.push(`Stop ${index} (${stop.id}): address must be at least 5 characters`);
  }

  return errors;
}

function validateTour(tour, cityId) {
  const errors = [];

  if (!tour.id || tour.id.length < 3) {
    errors.push(`Tour ${cityId}: id must be at least 3 characters`);
  }

  if (!tour.name || tour.name.length < 5) {
    errors.push(`Tour ${cityId}: name must be at least 5 characters`);
  }

  if (!tour.city || tour.city !== cityId) {
    errors.push(`Tour ${cityId}: city must match directory name`);
  }

  if (!tour.stops || !Array.isArray(tour.stops) || tour.stops.length < 2) {
    errors.push(`Tour ${cityId}: must have at least 2 stops`);
  }

  const stopIds = new Set();
  if (tour.stops) {
    tour.stops.forEach((stop, index) => {
      const stopErrors = validateStop(stop, index);
      if (stopErrors.length > 0) {
        stopErrors.forEach((err) => errors.push(err));
      }
      if (stop.id) {
        if (stopIds.has(stop.id)) {
          errors.push(`Tour ${cityId}: duplicate stop ID ${stop.id}`);
        }
        stopIds.add(stop.id);
      }
    });
  }

  return errors;
}

function validateCityRegistry(registry) {
  const errors = [];

  if (!registry.cities || !Array.isArray(registry.cities) || registry.cities.length === 0) {
    errors.push('City registry must have at least one city');
  }

  registry.cities?.forEach((city, index) => {
    if (!city.id || city.id.length < 3) {
      errors.push(`City ${index}: id must be at least 3 characters`);
    }
    if (!city.name || city.name.length < 3) {
      errors.push(`City ${index}: name must be at least 3 characters`);
    }
    if (!city.defaultTour || city.defaultTour.length < 3) {
      errors.push(`City ${index}: defaultTour must be at least 3 characters`);
    }
  });

  return errors;
}

function main() {
  let allErrors = [];
  let hasErrors = false;

  // Validate city registry
  const indexPath = path.join(TOURS_DIR, 'index.json');
  if (!fs.existsSync(indexPath)) {
    console.error('ERROR: City registry not found at', indexPath);
    process.exit(1);
  }

  const registry = loadJson(indexPath);
  const registryErrors = validateCityRegistry(registry);
  if (registryErrors.length > 0) {
    console.error('City registry validation failed:');
    registryErrors.forEach((e) => console.error('  -', e));
    allErrors = allErrors.concat(registryErrors);
    hasErrors = true;
  }

  // Validate each city's tour
  for (const city of registry.cities) {
    const tourPath = path.join(TOURS_DIR, city.id, 'tour.json');
    if (!fs.existsSync(tourPath)) {
      console.error(`ERROR: Tour not found for city ${city.id} at ${tourPath}`);
      hasErrors = true;
      continue;
    }

    const tour = loadJson(tourPath);
    const tourErrors = validateTour(tour, city.id);
    if (tourErrors.length > 0) {
      console.error(`Tour validation failed for ${city.id}:`);
      tourErrors.forEach((e) => console.error('  -', e));
      allErrors = allErrors.concat(tourErrors);
      hasErrors = true;
    } else {
      console.log(`✓ Tour ${city.id} (${tour.name}) validated successfully`);
    }
  }

  if (hasErrors) {
    console.error('\nValidation failed with', allErrors.length, 'error(s).');
    process.exit(1);
  }

  console.log('\nAll tours validated successfully!');
}

main();