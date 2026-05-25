import { db } from "./db";
import { settings } from "@shared/schema";
import { eq } from "drizzle-orm";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface GeocodeResult extends LatLng {
  displayName: string;
}

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "CallCatch/1.0 (support@callcatch.com)";

const cache = new Map<string, GeocodeResult | null>();

function normalizeQuery(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function geocodeAddress(query: string, near?: LatLng | null): Promise<GeocodeResult | null> {
  const trimmed = (query || "").trim();
  if (!trimmed) return null;

  // Cache key includes the bias point so two tradies with different bases
  // don't share a cached "Stafford" that's miles away from one of them.
  const key = near
    ? `${normalizeQuery(trimmed)}|${near.lat.toFixed(2)},${near.lng.toFixed(2)}`
    : normalizeQuery(trimmed);
  if (cache.has(key)) return cache.get(key)!;

  // When we know the tradie's base, ask Nominatim to PREFER results inside
  // a ~220km box around them (bounded=0 means "prefer, don't restrict").
  // This stops "123 street street Stafford" matching a Stafford Street in
  // Sydney when the tradie is in Brisbane.
  let viewboxParam = "";
  if (near) {
    const dLat = 2; // ~220km
    const dLng = 2;
    const left = near.lng - dLng;
    const right = near.lng + dLng;
    const top = near.lat + dLat;
    const bottom = near.lat - dLat;
    viewboxParam = `&viewbox=${left},${top},${right},${bottom}&bounded=0`;
  }

  const url = `${NOMINATIM_URL}?format=json&limit=5&countrycodes=au${viewboxParam}&q=${encodeURIComponent(trimmed)}`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      console.warn(`Nominatim ${res.status} for "${trimmed}"`);
      cache.set(key, null);
      return null;
    }
    const arr = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
    if (!Array.isArray(arr) || arr.length === 0) {
      cache.set(key, null);
      return null;
    }
    // If we have a base, pick the candidate physically closest to it.
    // Nominatim sorts by importance, which can rank a famous "Stafford Street, Sydney"
    // above the local Stafford suburb in Brisbane.
    let chosen = arr[0];
    if (near) {
      let best = Infinity;
      for (const cand of arr) {
        const d = haversineKm(near, { lat: parseFloat(cand.lat), lng: parseFloat(cand.lon) });
        if (d < best) {
          best = d;
          chosen = cand;
        }
      }
    }
    const result: GeocodeResult = {
      lat: parseFloat(chosen.lat),
      lng: parseFloat(chosen.lon),
      displayName: chosen.display_name,
    };
    cache.set(key, result);
    return result;
  } catch (err) {
    console.error("Geocode error:", err);
    return null;
  }
}

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface ServiceAreaCheck {
  configured: boolean;
  geocoded: boolean;
  within: boolean;
  distanceKm: number | null;
  radiusKm: number | null;
  customer: GeocodeResult | null;
  base: LatLng | null;
}

export async function checkServiceArea(userId: string, customerAddress: string): Promise<ServiceAreaCheck> {
  const [s] = await db.select().from(settings).where(eq(settings.userId, userId));

  const baseLat = s?.baseLat ?? null;
  const baseLng = s?.baseLng ?? null;
  const radiusKm = s?.serviceRadiusKm ?? null;

  if (baseLat == null || baseLng == null || !radiusKm || radiusKm <= 0) {
    return { configured: false, geocoded: false, within: true, distanceKm: null, radiusKm: null, customer: null, base: null };
  }

  const base: LatLng = { lat: baseLat, lng: baseLng };
  const customer = await geocodeAddress(customerAddress, base);

  if (!customer) {
    return { configured: true, geocoded: false, within: true, distanceKm: null, radiusKm, customer: null, base };
  }

  const distanceKm = haversineKm(base, customer);
  return {
    configured: true,
    geocoded: true,
    within: distanceKm <= radiusKm,
    distanceKm,
    radiusKm,
    customer,
    base,
  };
}
