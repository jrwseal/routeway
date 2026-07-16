import { useEffect, useState } from 'react';
import type { Coordinates } from '../lib/geofence';

export interface GeoReading extends Coordinates {
  accuracy: number;
}

export function useGeolocation(): { coords: GeoReading | null; error: string | null } {
  const [coords, setCoords] = useState<GeoReading | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('อุปกรณ์นี้ไม่รองรับ Geolocation');
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      pos => {
        setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy });
        setError(null);
      },
      err => setError(err.message),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  return { coords, error };
}
