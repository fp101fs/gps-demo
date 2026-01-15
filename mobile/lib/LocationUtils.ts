import * as turf from '@turf/turf';

interface Point {
  lat: number;
  lng: number;
}

/**
 * Calculates the distance between two points in meters.
 */
export const calculateDistance = (from: Point, to: Point): number => {
  const fromPoint = turf.point([from.lng, from.lat]);
  const toPoint = turf.point([to.lng, to.lat]);
  const options = { units: 'kilometers' as const };
  
  const distanceKm = turf.distance(fromPoint, toPoint, options);
  return distanceKm * 1000; // Convert to meters
};

/**
 * Calculates the bearing between two points in degrees.
 */
export const calculateBearing = (from: Point, to: Point): number => {
  const fromPoint = turf.point([from.lng, from.lat]);
  const toPoint = turf.point([to.lng, to.lat]);
  
  return turf.bearing(fromPoint, toPoint);
};

/**
 * Formats distance for display (e.g., "500m", "2.5km")
 */
export const formatDistance = (meters: number): string => {
    if (meters < 1000) {
        return `${Math.round(meters)}m`;
    }
    return `${(meters / 1000).toFixed(1)}km`;
};
