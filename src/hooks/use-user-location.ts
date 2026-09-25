import { useCallback, useRef, useState } from "react";

export type UserLocation = {
  lat: number;
  lng: number;
  accuracy: number;
};

export type UserLocationStatus = "idle" | "loading" | "ready" | "error" | "unsupported";

export function useUserLocation() {
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [status, setStatus] = useState<UserLocationStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const requestLocation = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unsupported");
      setError("Browser ini belum mendukung lokasi. Gunakan browser terbaru untuk memfilter jarak.");
      return;
    }

    const currentRequest = ++requestId.current;
    setStatus("loading");
    setError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (currentRequest !== requestId.current) return;
        setLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
        setStatus("ready");
      },
      (locationError) => {
        if (currentRequest !== requestId.current) return;
        setStatus("error");
        if (locationError.code === locationError.PERMISSION_DENIED) {
          setError("Izin lokasi ditolak. Izinkan lokasi dari browser lalu coba lagi.");
        } else if (locationError.code === locationError.POSITION_UNAVAILABLE) {
          setError("Lokasi belum dapat ditemukan. Coba lagi saat perangkat memiliki sinyal GPS.");
        } else if (locationError.code === locationError.TIMEOUT) {
          setError("Pencarian lokasi terlalu lama. Coba lagi.");
        } else {
          setError("Lokasi belum dapat dibaca. Coba lagi.");
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10_000,
        maximumAge: 60_000,
      },
    );
  }, []);

  const clearLocation = useCallback(() => {
    requestId.current += 1;
    setLocation(null);
    setStatus("idle");
    setError(null);
  }, []);

  return { location, status, error, requestLocation, clearLocation };
}
