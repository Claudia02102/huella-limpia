'use strict';

const store = require('../data/store');

const EARTH_KM = 6371;
const rad = (d) => (d * Math.PI) / 180;

/** Distancia en km entre dos coordenadas (fórmula del semiverseno / haversine). */
function haversineKm(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(h));
}

/** Puntos limpios más cercanos a una ubicación, opcionalmente filtrados por tipo. */
function nearestCleanPoints(lat, lng, { kind, limit = 3 } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    const err = new Error('Coordenadas inválidas');
    err.status = 400;
    throw err;
  }
  return store.cleanPoints()
    .filter((p) => !kind || p.kind === kind)
    .map((p) => ({ ...p, distanceKm: Number(haversineKm({ lat, lng }, p).toFixed(2)) }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, Math.min(Math.max(1, limit), 10));
}

module.exports = { haversineKm, nearestCleanPoints };
