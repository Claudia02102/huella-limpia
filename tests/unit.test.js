'use strict';

const store = require('../src/data/store');
const { recency, zoneCriticality, level, zonesWithCriticality } = require('../src/services/criticalityService');
const { priorityQueue, districtStats } = require('../src/services/priorityService');
const { haversineKm, nearestCleanPoints } = require('../src/services/geoService');
const { validateReport, validateTransition, validatePet, validateCredentials, sanitizeText } = require('../src/middleware/validate');

const NOW = Date.parse('2026-06-01T12:00:00Z');
const daysAgo = (d) => new Date(NOW - d * store.DAY).toISOString();

beforeEach(() => store.reset(NOW));

describe('criticalityService (unitarias)', () => {
  test('la recencia vale 1 hoy y 0.5 a los 14 días', () => {
    expect(recency(daysAgo(0), NOW)).toBeCloseTo(1);
    expect(recency(daysAgo(14), NOW)).toBeCloseTo(0.5);
  });

  test('solo los reportes validados suman criticidad', () => {
    const reports = [
      { zoneId: 'X', type: 'foco_infeccioso', status: 'validado', createdAt: daysAgo(0) },
      { zoneId: 'X', type: 'foco_infeccioso', status: 'reportado', createdAt: daysAgo(0) },
      { zoneId: 'X', type: 'foco_infeccioso', status: 'atendido', createdAt: daysAgo(0) }
    ];
    expect(zoneCriticality('X', reports, NOW)).toBe(0.5);
  });

  test('un reporte antiguo pesa menos que uno reciente', () => {
    const fresh = zoneCriticality('X', [{ zoneId: 'X', type: 'heces', status: 'validado', createdAt: daysAgo(1) }], NOW);
    const old = zoneCriticality('X', [{ zoneId: 'X', type: 'heces', status: 'validado', createdAt: daysAgo(40) }], NOW);
    expect(fresh).toBeGreaterThan(old);
  });

  test('la criticidad satura en 1', () => {
    const many = Array.from({ length: 20 }, () => ({ zoneId: 'X', type: 'foco_infeccioso', status: 'validado', createdAt: daysAgo(0) }));
    expect(zoneCriticality('X', many, NOW)).toBe(1);
  });

  test('level clasifica bajo/medio/alto', () => {
    expect(level(0.1)).toBe('bajo');
    expect(level(0.3)).toBe('medio');
    expect(level(0.8)).toBe('alto');
  });

  test('el Parque Central de Los Olivos es la zona más crítica de la semilla', () => {
    const zones = zonesWithCriticality(NOW).sort((a, b) => b.criticality - a.criticality);
    expect(zones[0].id).toBe('Z1');
    expect(zones[0].level).toBe('alto');
    expect(zones.find((z) => z.id === 'Z9').criticality).toBe(0); // su único reporte ya fue atendido
  });
});

describe('priorityService (unitarias)', () => {
  test('la cola excluye atendidos y ordena por prioridad descendente', () => {
    const q = priorityQueue(NOW);
    expect(q.some((r) => r.status === 'atendido')).toBe(false);
    for (let i = 1; i < q.length; i += 1) expect(q[i - 1].priority).toBeGreaterThanOrEqual(q[i].priority);
  });

  test('la reincidencia en la misma zona eleva la prioridad', () => {
    const q = priorityQueue(NOW);
    const z1 = q.find((r) => r.id === 'R1');
    expect(z1.recurrence).toBe(2);
    expect(q[0].zoneId).toBe('Z1');
  });

  test('las estadísticas por distrito suman todos los reportes', () => {
    const stats = districtStats();
    expect(stats).toHaveLength(4);
    expect(stats.reduce((a, d) => a + d.total, 0)).toBe(store.reports().length);
  });
});

describe('geoService (unitarias)', () => {
  test('haversine: 0 km para el mismo punto y ~1.11 km por 0.01° de latitud', () => {
    const p = { lat: -12, lng: -77 };
    expect(haversineKm(p, p)).toBe(0);
    expect(haversineKm(p, { lat: -12.01, lng: -77 })).toBeCloseTo(1.11, 1);
  });

  test('nearestCleanPoints devuelve el más cercano primero y respeta el filtro', () => {
    const near = nearestCleanPoints(-11.9900, -77.0705);
    expect(near[0].zoneId).toBe('Z1');
    expect(near[0].distanceKm).toBeLessThanOrEqual(near[1].distanceKm);
    expect(nearestCleanPoints(-11.99, -77.07, { kind: 'pipican' }).every((p) => p.kind === 'pipican')).toBe(true);
  });

  test('coordenadas inválidas lanzan error 400', () => {
    expect(() => nearestCleanPoints(NaN, -77)).toThrow('Coordenadas inválidas');
    expect(() => nearestCleanPoints(200, -77)).toThrow();
  });
});

describe('validación (unitarias)', () => {
  test('sanitizeText elimina < > y recorta', () => {
    expect(sanitizeText('<img src=x>hola', 100)).toBe('img src=xhola');
    expect(sanitizeText('a'.repeat(500), 280)).toHaveLength(280);
  });

  test('validateReport rechaza zona, tipo y descripción inválidos', () => {
    expect(validateReport({ zoneId: 'Z99', type: 'basura', description: '' }, ['Z1']).errors).toHaveLength(3);
  });

  test('validateTransition solo permite avanzar en el flujo', () => {
    expect(validateTransition('reportado', 'validado')).toBe(true);
    expect(validateTransition('validado', 'atendido')).toBe(true);
    expect(validateTransition('atendido', 'validado')).toBe(false);
    expect(validateTransition('validado', 'reportado')).toBe(false);
  });

  test('validatePet exige especie, distrito y vacunación booleana', () => {
    expect(validatePet({ name: 'X', species: 'loro', district: 'ZZ', vaccinated: 'si' }, ['LOL']).errors).toHaveLength(4);
    expect(validatePet({ name: 'Toby', species: 'perro', district: 'LOL', vaccinated: true }, ['LOL']).errors).toHaveLength(0);
  });

  test('validateCredentials exige contraseña robusta', () => {
    expect(validateCredentials({ email: 'a@b.pe', password: 'corta' }).errors).toHaveLength(1);
    expect(validateCredentials({ email: 'Ana@Mail.pe', password: 'Segura123' }).value.email).toBe('ana@mail.pe');
  });
});
