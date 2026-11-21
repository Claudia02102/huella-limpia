'use strict';

const store = require('../data/store');

// Peso sanitario de cada tipo de reporte.
const TYPE_WEIGHT = { foco_infeccioso: 1.0, heces: 0.6, orina: 0.4, mascota_suelta: 0.3 };
const HALF_LIFE_DAYS = 14;

/** Factor de recencia: 1 hoy, 0.5 a los 14 días, ~0.25 a los 28 días. */
function recency(createdAt, now = Date.now()) {
  const days = Math.max(0, (now - new Date(createdAt).getTime()) / store.DAY);
  return Math.pow(0.5, days / HALF_LIFE_DAYS);
}

/**
 * Índice de criticidad de una zona entre 0 y 1.
 * Suma los reportes validados (los atendidos y los pendientes no cuentan),
 * ponderados por tipo y recencia, y satura en 1.
 */
function zoneCriticality(zoneId, reports = store.reports(), now = Date.now()) {
  let score = 0;
  for (const r of reports) {
    if (r.zoneId === zoneId && r.status === 'validado') {
      score += (TYPE_WEIGHT[r.type] ?? 0.2) * recency(r.createdAt, now);
    }
  }
  return Math.min(1, Number((score / 2).toFixed(2)));
}

function level(value) {
  if (value < 0.2) return 'bajo';
  if (value < 0.45) return 'medio';
  return 'alto';
}

function zonesWithCriticality(now = Date.now()) {
  const reports = store.reports();
  return store.zones().map((z) => {
    const criticality = zoneCriticality(z.id, reports, now);
    const active = reports.filter((r) => r.zoneId === z.id && r.status === 'validado').length;
    return { ...z, criticality, level: level(criticality), activeReports: active };
  });
}

module.exports = { TYPE_WEIGHT, HALF_LIFE_DAYS, recency, zoneCriticality, level, zonesWithCriticality };
