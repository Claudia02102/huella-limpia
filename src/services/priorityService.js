'use strict';

const store = require('../data/store');
const { TYPE_WEIGHT, recency } = require('./criticalityService');

/**
 * Cola de fiscalización: ordena los reportes abiertos (reportado o validado)
 * por prioridad = severidad × (1 + reincidencia) × (0.5 + recencia).
 * La reincidencia es el número de otros reportes abiertos en la misma zona.
 */
function priorityQueue(now = Date.now()) {
  const open = store.reports().filter((r) => r.status !== 'atendido');
  const perZone = open.reduce((acc, r) => ({ ...acc, [r.zoneId]: (acc[r.zoneId] || 0) + 1 }), {});
  const zones = new Map(store.zones().map((z) => [z.id, z]));
  return open
    .map((r) => {
      const severity = TYPE_WEIGHT[r.type] ?? 0.2;
      const recurrence = perZone[r.zoneId] - 1;
      const priority = Number((severity * (1 + recurrence) * (0.5 + recency(r.createdAt, now))).toFixed(2));
      const zone = zones.get(r.zoneId);
      return { ...r, priority, recurrence, zoneName: zone?.name, district: zone?.district };
    })
    .sort((a, b) => b.priority - a.priority);
}

/** Estadísticas por distrito para el panel municipal. */
function districtStats() {
  const zones = new Map(store.zones().map((z) => [z.id, z.district]));
  return store.districts().map((d) => {
    const rs = store.reports().filter((r) => zones.get(r.zoneId) === d.id);
    return {
      id: d.id,
      name: d.name,
      total: rs.length,
      reportado: rs.filter((r) => r.status === 'reportado').length,
      validado: rs.filter((r) => r.status === 'validado').length,
      atendido: rs.filter((r) => r.status === 'atendido').length,
      pets: store.pets().filter((p) => p.district === d.id).length
    };
  });
}

module.exports = { priorityQueue, districtStats };
