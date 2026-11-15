import type { TourMetadata, TourStop } from '../types/tour';

const VALID_NARRATION_MIN_SECONDS = 60;
const VALID_NARRATION_MAX_SECONDS = 120;
const MIN_SOURCES = 1;

export function calculateNarrationSeconds(narration: string): number {
  const words = narration.split(/\s+/).filter((w) => w.length > 0).length;
  const wpm = 150;
  const seconds = (words / wpm) * 60;
  return Math.round(seconds * 10) / 10;
}

export function validateStop(stop: TourStop): string[] {
  const errors: string[] = [];

  if (!stop.id || stop.id.length < 3) {
    errors.push(`${stop.id}: id must be at least 3 characters`);
  }

  if (!stop.name || stop.name.length < 5) {
    errors.push(`${stop.id}: name must be at least 5 characters`);
  }

  if (stop.lat < -90 || stop.lat > 90) {
    errors.push(`${stop.id}: lat must be between -90 and 90`);
  }

  if (stop.lon < -180 || stop.lon > 180) {
    errors.push(`${stop.id}: lon must be between -180 and 180`);
  }

  const narrationSeconds = calculateNarrationSeconds(stop.narration);
  if (narrationSeconds < VALID_NARRATION_MIN_SECONDS || narrationSeconds > VALID_NARRATION_MAX_SECONDS) {
    errors.push(
      `${stop.id}: narration must be ${VALID_NARRATION_MIN_SECONDS}-${VALID_NARRATION_MAX_SECONDS} seconds (got ${narrationSeconds})`
    );
  }

  if (stop.sources.length < MIN_SOURCES) {
    errors.push(`${stop.id}: must have at least ${MIN_SOURCES} source(s)`);
  }

  return errors;
}

export function validateTour(tour: TourMetadata): string[] {
  const errors: string[] = [];
  const stopIds = new Set<string>();

  tour.stops.forEach((stop, index) => {
    const stopErrors = validateStop(stop);
    if (stopErrors.length > 0) {
      stopErrors.forEach((err) => errors.push(`Stop ${index} (${stop.id}): ${err}`));
    }
    stopIds.add(stop.id);
  });

  if (stopIds.size !== new Set(tour.stops.map((s) => s.id)).size) {
    errors.push('Duplicate stop IDs detected');
  }

  if (tour.stops.length < 2) {
    errors.push('Tour must have at least 2 stops');
  }

  return errors;
}
