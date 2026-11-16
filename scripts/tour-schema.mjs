/**
 * Validation rules for the tour data contract.
 *
 * The rules live here, in one place, so the build-time CLI and the unit tests
 * use the same implementation. Nothing in this module reads the filesystem, so
 * it is safe to import from tests.
 *
 * The contract is deliberately strict: unknown fields are rejected so a typo
 * cannot silently ship uncited or misplaced content.
 */

export const SCHEMA_VERSION = 1
export const NARRATION_WORDS_PER_MINUTE = 150
export const NARRATION_MIN_SECONDS = 60
export const NARRATION_MAX_SECONDS = 120
export const MIN_STOPS = 2
export const MIN_SOURCES = 1
export const MAX_GEOFENCE_RADIUS_M = 500
export const MAX_VIEWPOINT_DISTANCE_M = 250
export const LEGEND_LABELS = ['Legend', 'Local legend']
export const VIEWPOINT_ACCESS = 'public-sidewalk'
export const ROUTE_STATUSES = ['placeholder', 'computed']

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const CITY_KEYS = ['id', 'name', 'defaultTour', 'description']
const REGISTRY_KEYS = ['schemaVersion', 'cities']
const TOUR_KEYS = ['schemaVersion', 'id', 'city', 'name', 'description', 'stops']
const STOP_KEYS = [
  'id',
  'name',
  'lat',
  'lon',
  'address',
  'viewpoint',
  'geofenceRadiusM',
  'narration',
  'legendLabel',
  'sources',
]
const VIEWPOINT_KEYS = ['lat', 'lon', 'access', 'description']
const ROUTE_KEYS = ['type', 'features', 'metadata']
const FEATURE_KEYS = ['type', 'geometry', 'properties']
const GEOMETRY_KEYS = ['type', 'coordinates']
const ROUTE_METADATA_KEYS = [
  'schemaVersion',
  'city',
  'tour',
  'status',
  'note',
  'generatedAt',
  'stops',
  'maneuvers',
]
const MANEUVER_KEYS = ['from', 'to', 'instruction', 'distanceM', 'durationS']

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function isLatitude(value) {
  return isFiniteNumber(value) && value >= -90 && value <= 90
}

function isLongitude(value) {
  return isFiniteNumber(value) && value >= -180 && value <= 180
}

function isHttpUrl(value) {
  if (!isNonEmptyString(value)) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function checkAllowedKeys(value, allowed, path, errors) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      errors.push(`${path}: unknown field "${key}"`)
    }
  }
}

function equalStringArrays(left, right) {
  return (
    Array.isArray(left) &&
    Array.isArray(right) &&
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  )
}

export function countWords(text) {
  if (typeof text !== 'string') return 0
  const words = text.trim().split(/\s+/).filter(Boolean)
  return words.length
}

export function calculateNarrationSeconds(narration) {
  const seconds = (countWords(narration) / NARRATION_WORDS_PER_MINUTE) * 60
  return Math.round(seconds * 10) / 10
}

export function pointDistanceMeters(from, to) {
  const earthRadiusM = 6_371_000
  const toRadians = (degrees) => (degrees * Math.PI) / 180
  const lat1 = toRadians(from.lat)
  const lat2 = toRadians(to.lat)
  const deltaLat = toRadians(to.lat - from.lat)
  const deltaLon = toRadians(to.lon - from.lon)
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2
  return earthRadiusM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function validateSources(sources, path) {
  const errors = []

  if (sources === undefined) {
    errors.push(`${path}.sources: is required (at least one source URL)`)
    return errors
  }
  if (!Array.isArray(sources)) {
    errors.push(`${path}.sources: must be an array of source URLs`)
    return errors
  }

  if (sources.length < MIN_SOURCES) {
    errors.push(`${path}: must cite at least ${MIN_SOURCES} source`)
  }

  const seen = new Set()
  sources.forEach((source, index) => {
    const sourcePath = `${path}.sources[${index}]`
    if (!isHttpUrl(source)) {
      errors.push(`${sourcePath}: must be an absolute http(s) URL`)
      return
    }
    if (seen.has(source)) {
      errors.push(`${sourcePath}: duplicate source URL`)
    }
    seen.add(source)
  })

  return errors
}

export function validateViewpoint(viewpoint, path, stop) {
  const errors = []

  if (!isPlainObject(viewpoint)) {
    errors.push(`${path}: viewpoint must be an object`)
    return errors
  }

  checkAllowedKeys(viewpoint, VIEWPOINT_KEYS, path, errors)

  if (!isLatitude(viewpoint.lat)) {
    errors.push(`${path}.lat: must be a number between -90 and 90`)
  }
  if (!isLongitude(viewpoint.lon)) {
    errors.push(`${path}.lon: must be a number between -180 and 180`)
  }
  if (viewpoint.access !== VIEWPOINT_ACCESS) {
    errors.push(
      `${path}.access: must be "${VIEWPOINT_ACCESS}" (viewpoints may only be public sidewalks)`,
    )
  }
  if (!isNonEmptyString(viewpoint.description)) {
    errors.push(`${path}.description: must describe the public sidewalk position`)
  }

  if (
    isLatitude(viewpoint.lat) &&
    isLongitude(viewpoint.lon) &&
    isLatitude(stop.lat) &&
    isLongitude(stop.lon)
  ) {
    const distance = pointDistanceMeters(stop, viewpoint)
    if (distance > MAX_VIEWPOINT_DISTANCE_M) {
      errors.push(
        `${path}: is ${Math.round(distance)} m from the stop, which is more than the ${MAX_VIEWPOINT_DISTANCE_M} m limit`,
      )
    }
  }

  return errors
}

export function validateStop(stop, path = 'stop') {
  const errors = []

  if (!isPlainObject(stop)) {
    return [`${path}: must be an object`]
  }

  checkAllowedKeys(stop, STOP_KEYS, path, errors)

  if (typeof stop.id !== 'string' || !ID_PATTERN.test(stop.id)) {
    errors.push(`${path}.id: must be kebab-case, e.g. "royal-street-ghosts"`)
  }
  if (!isNonEmptyString(stop.name) || stop.name.trim().length < 3) {
    errors.push(`${path}.name: must be at least 3 characters`)
  }
  if (!isLatitude(stop.lat)) {
    errors.push(`${path}.lat: must be a number between -90 and 90`)
  }
  if (!isLongitude(stop.lon)) {
    errors.push(`${path}.lon: must be a number between -180 and 180`)
  }
  if (!isNonEmptyString(stop.address)) {
    errors.push(`${path}.address: must be a non-empty street address`)
  }
  if (!isFiniteNumber(stop.geofenceRadiusM)) {
    errors.push(`${path}.geofenceRadiusM: must be a number`)
  } else if (stop.geofenceRadiusM <= 0 || stop.geofenceRadiusM > MAX_GEOFENCE_RADIUS_M) {
    errors.push(
      `${path}.geofenceRadiusM: must be greater than 0 and at most ${MAX_GEOFENCE_RADIUS_M}`,
    )
  }
  if (!isNonEmptyString(stop.narration)) {
    errors.push(`${path}.narration: must be a non-empty script`)
  } else {
    const seconds = calculateNarrationSeconds(stop.narration)
    if (seconds < NARRATION_MIN_SECONDS || seconds > NARRATION_MAX_SECONDS) {
      errors.push(
        `${path}.narration: must be ${NARRATION_MIN_SECONDS}-${NARRATION_MAX_SECONDS} seconds at ${NARRATION_WORDS_PER_MINUTE} wpm; got ${seconds}s (${countWords(stop.narration)} words)`,
      )
    }
  }
  if (stop.legendLabel !== undefined && !LEGEND_LABELS.includes(stop.legendLabel)) {
    errors.push(
      `${path}.legendLabel: must be one of ${LEGEND_LABELS.map((label) => `"${label}"`).join(', ')} so legend is never presented as fact`,
    )
  }
  errors.push(...validateSources(stop.sources, path))
  errors.push(...validateViewpoint(stop.viewpoint, `${path}.viewpoint`, stop))

  return errors
}

export function validateTour(tour, options = {}) {
  const errors = []
  const { expectedCityId, expectedTourId } = options

  if (!isPlainObject(tour)) {
    return ['tour: must be an object']
  }

  checkAllowedKeys(tour, TOUR_KEYS, 'tour', errors)

  if (tour.schemaVersion !== SCHEMA_VERSION) {
    errors.push(`tour.schemaVersion: must be ${SCHEMA_VERSION}`)
  }
  if (typeof tour.id !== 'string' || !ID_PATTERN.test(tour.id)) {
    errors.push('tour.id: must be kebab-case')
  }
  if (!isNonEmptyString(tour.city)) {
    errors.push('tour.city: must be a non-empty city id')
  }
  if (expectedCityId !== undefined && tour.city !== expectedCityId) {
    errors.push(`tour.city: must match registry city "${expectedCityId}"`)
  }
  if (expectedTourId !== undefined && tour.id !== expectedTourId) {
    errors.push(`tour.id: must match registry defaultTour "${expectedTourId}"`)
  }
  if (!isNonEmptyString(tour.name)) {
    errors.push('tour.name: must be a non-empty name')
  }
  if (!isNonEmptyString(tour.description)) {
    errors.push('tour.description: must be a non-empty description')
  }

  if (!Array.isArray(tour.stops)) {
    errors.push('tour.stops: must be an array')
    return errors
  }
  if (tour.stops.length < MIN_STOPS) {
    errors.push(`tour.stops: must contain at least ${MIN_STOPS} stops`)
  }

  const seenIds = new Set()
  tour.stops.forEach((stop, index) => {
    const path = `tour.stops[${index}]`
    errors.push(...validateStop(stop, path))

    if (isPlainObject(stop) && typeof stop.id === 'string') {
      if (seenIds.has(stop.id)) {
        errors.push(`${path}.id: duplicate stop id "${stop.id}"`)
      }
      seenIds.add(stop.id)
    }
  })

  return errors
}

export function validateCityRegistry(registry) {
  const errors = []

  if (!isPlainObject(registry)) {
    return ['index.json: must be an object']
  }

  checkAllowedKeys(registry, REGISTRY_KEYS, 'index.json', errors)

  if (registry.schemaVersion !== SCHEMA_VERSION) {
    errors.push(`index.json.schemaVersion: must be ${SCHEMA_VERSION}`)
  }
  if (!Array.isArray(registry.cities)) {
    errors.push('index.json.cities: must be an array')
    return errors
  }
  if (registry.cities.length === 0) {
    errors.push('index.json.cities: must contain at least one city')
  }

  const seenIds = new Set()
  registry.cities.forEach((city, index) => {
    const path = `index.json.cities[${index}]`
    if (!isPlainObject(city)) {
      errors.push(`${path}: must be an object`)
      return
    }

    checkAllowedKeys(city, CITY_KEYS, path, errors)

    if (typeof city.id !== 'string' || !ID_PATTERN.test(city.id)) {
      errors.push(`${path}.id: must be kebab-case`)
    } else {
      if (seenIds.has(city.id)) {
        errors.push(`${path}.id: duplicate city id "${city.id}"`)
      }
      seenIds.add(city.id)
    }
    if (!isNonEmptyString(city.name)) {
      errors.push(`${path}.name: must be a non-empty name`)
    }
    if (typeof city.defaultTour !== 'string' || !ID_PATTERN.test(city.defaultTour)) {
      errors.push(`${path}.defaultTour: must be a kebab-case tour id`)
    }
    if (!isNonEmptyString(city.description)) {
      errors.push(`${path}.description: must be a non-empty description`)
    }
  })

  return errors
}

export function validateRoute(route, options = {}) {
  const errors = []
  const { cityId, tour } = options
  const expectedStops = Array.isArray(tour?.stops)
    ? tour.stops.map((stop) => (isPlainObject(stop) ? stop.id : undefined))
    : []

  if (!isPlainObject(route)) {
    return ['route.geojson: must be an object']
  }

  checkAllowedKeys(route, ROUTE_KEYS, 'route.geojson', errors)

  if (route.type !== 'FeatureCollection') {
    errors.push('route.geojson.type: must be "FeatureCollection"')
  }
  if (!Array.isArray(route.features) || route.features.length === 0) {
    errors.push('route.geojson.features: must contain at least one LineString feature')
  } else {
    route.features.forEach((feature, index) => {
      const path = `route.geojson.features[${index}]`
      if (!isPlainObject(feature)) {
        errors.push(`${path}: must be an object`)
        return
      }

      checkAllowedKeys(feature, FEATURE_KEYS, path, errors)

      if (feature.type !== 'Feature') {
        errors.push(`${path}.type: must be "Feature"`)
      }
      if (!isPlainObject(feature.properties)) {
        errors.push(`${path}.properties: must be an object`)
      }

      if (!isPlainObject(feature.geometry)) {
        errors.push(`${path}.geometry: must be an object`)
        return
      }

      checkAllowedKeys(feature.geometry, GEOMETRY_KEYS, `${path}.geometry`, errors)

      if (feature.geometry.type !== 'LineString') {
        errors.push(`${path}.geometry.type: must be "LineString"`)
        return
      }
      if (
        !Array.isArray(feature.geometry.coordinates) ||
        feature.geometry.coordinates.length < 2
      ) {
        errors.push(`${path}.geometry.coordinates: must have at least two positions`)
        return
      }

      feature.geometry.coordinates.forEach((coordinate, coordinateIndex) => {
        const coordinatePath = `${path}.geometry.coordinates[${coordinateIndex}]`
        if (
          !Array.isArray(coordinate) ||
          coordinate.length !== 2 ||
          !isLongitude(coordinate[0]) ||
          !isLatitude(coordinate[1])
        ) {
          errors.push(`${coordinatePath}: must be [longitude, latitude]`)
        }
      })
    })
  }

  if (!isPlainObject(route.metadata)) {
    errors.push('route.geojson.metadata: must be an object')
    return errors
  }

  const metadata = route.metadata
  checkAllowedKeys(metadata, ROUTE_METADATA_KEYS, 'route.geojson.metadata', errors)

  if (metadata.schemaVersion !== SCHEMA_VERSION) {
    errors.push(`route.geojson.metadata.schemaVersion: must be ${SCHEMA_VERSION}`)
  }
  if (metadata.city !== cityId) {
    errors.push(`route.geojson.metadata.city: must be "${cityId}"`)
  }
  if (metadata.tour !== tour?.id) {
    errors.push(`route.geojson.metadata.tour: must be "${tour?.id}"`)
  }
  if (!ROUTE_STATUSES.includes(metadata.status)) {
    errors.push(
      `route.geojson.metadata.status: must be one of ${ROUTE_STATUSES.map((status) => `"${status}"`).join(', ')}`,
    )
  }
  if (metadata.status === 'placeholder' && !isNonEmptyString(metadata.note)) {
    errors.push(
      'route.geojson.metadata.note: a placeholder route must explain what replaces it',
    )
  }
  if (
    !isNonEmptyString(metadata.generatedAt) ||
    Number.isNaN(Date.parse(metadata.generatedAt))
  ) {
    errors.push('route.geojson.metadata.generatedAt: must be an ISO-8601 timestamp')
  }
  if (!equalStringArrays(metadata.stops, expectedStops)) {
    errors.push('route.geojson.metadata.stops: must list the tour stop ids in tour order')
  }

  if (!Array.isArray(metadata.maneuvers)) {
    errors.push('route.geojson.metadata.maneuvers: must be an array')
    return errors
  }
  if (metadata.maneuvers.length !== Math.max(expectedStops.length - 1, 0)) {
    errors.push(
      `route.geojson.metadata.maneuvers: must contain one maneuver per leg (expected ${Math.max(expectedStops.length - 1, 0)})`,
    )
  }

  metadata.maneuvers.forEach((maneuver, index) => {
    const path = `route.geojson.metadata.maneuvers[${index}]`
    if (!isPlainObject(maneuver)) {
      errors.push(`${path}: must be an object`)
      return
    }

    checkAllowedKeys(maneuver, MANEUVER_KEYS, path, errors)

    const from = expectedStops[index]
    const to = expectedStops[index + 1]
    if (maneuver.from !== from) {
      errors.push(`${path}.from: must be "${from}"`)
    }
    if (maneuver.to !== to) {
      errors.push(`${path}.to: must be "${to}"`)
    }
    if (!isNonEmptyString(maneuver.instruction)) {
      errors.push(`${path}.instruction: must be a non-empty walking instruction`)
    }
    if (!isFiniteNumber(maneuver.distanceM) || maneuver.distanceM < 0) {
      errors.push(`${path}.distanceM: must be a non-negative number`)
    }
    if (!isFiniteNumber(maneuver.durationS) || maneuver.durationS < 0) {
      errors.push(`${path}.durationS: must be a non-negative number`)
    }
  })

  return errors
}
