import * as Location from 'expo-location';
import { BACKEND_URL } from '../config';

let _locationInterval: any = null;

export async function requestAndSendLocation(token: string | null): Promise<void> {
  if (!token) return;

  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      console.log('Location permission denied');
      return;
    }

    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    const lat = location.coords.latitude;
    const lon = location.coords.longitude;

    await fetch(`${BACKEND_URL}/me/location`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        latitude: lat,
        longitude: lon,
      }),
    });
  } catch (err) {
    console.log('Location update error:', err);
  }
}

export function startLocationReporting(token: string | null): void {
  if (_locationInterval) clearInterval(_locationInterval);

  requestAndSendLocation(token);
  _locationInterval = setInterval(() => {
    requestAndSendLocation(token);
  }, 30000); // 30 seconds interval
}

export function stopLocationReporting(): void {
  if (_locationInterval) {
    clearInterval(_locationInterval);
    _locationInterval = null;
  }
}
