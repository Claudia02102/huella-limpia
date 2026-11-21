'use strict';

const seed = require('./seed');
const db = require('./db');

const DAY = 24 * 60 * 60 * 1000;

// Repositorio (capa de datos). Los servicios leen siempre de este estado en memoria.
// - Sin DATABASE_URL: el estado vive en memoria (desarrollo local y pruebas).
// - Con DATABASE_URL (Supabase/PostgreSQL): sync() recarga el estado desde la base al
//   inicio de cada petición y las escrituras se guardan primero en la base.
let state;

function clone(o) {
  return JSON.parse(JSON.stringify(o));
}

function reset(now = Date.now()) {
  state = {
    districts: clone(seed.districts),
    zones: clone(seed.zones),
    cleanPoints: clone(seed.cleanPoints),
    pets: clone(seed.pets),
    reports: seed.reports.map(({ daysAgo, ...r }) => ({
      ...r,
      createdAt: new Date(now - daysAgo * DAY).toISOString()
    })),
    users: [],
    seq: { report: seed.reports.length, user: 0, pet: seed.pets.length }
  };
}

reset();

/** Con base de datos, trae el estado actual; sin ella no hace nada. */
async function sync() {
  if (!db.enabled()) return;
  const data = await db.loadAll();
  state = { ...state, ...data };
}

module.exports = {
  DAY,
  reset,
  sync,
  persistent: () => db.enabled(),
  districts: () => state.districts,
  zones: () => state.zones,
  cleanPoints: () => state.cleanPoints,
  reports: () => state.reports,
  pets: () => state.pets,
  users: () => state.users,
  async addReport(data) {
    if (db.enabled()) {
      const saved = await db.insertReport(data);
      state.reports.push(saved);
      return saved;
    }
    state.seq.report += 1;
    const report = { id: `R${state.seq.report}`, status: 'reportado', createdAt: new Date().toISOString(), ...data };
    state.reports.push(report);
    return report;
  },
  async updateReport(id, changes) {
    const report = state.reports.find((r) => r.id === id);
    if (!report) return null;
    if (db.enabled()) {
      const saved = await db.updateReport(id, changes);
      if (saved) Object.assign(report, saved);
      return saved;
    }
    Object.assign(report, changes, { updatedAt: new Date().toISOString() });
    return report;
  },
  async addPet(data) {
    if (db.enabled()) {
      const saved = await db.insertPet(data);
      state.pets.push(saved);
      return saved;
    }
    state.seq.pet += 1;
    const n = state.pets.filter((p) => p.district === data.district).length + 1;
    const pet = { id: `M${state.seq.pet}`, code: `LN-${data.district}-${String(n).padStart(4, '0')}`, ...data };
    state.pets.push(pet);
    return pet;
  },
  async addUser(data) {
    if (db.enabled()) {
      const saved = await db.insertUser(data);
      state.users.push(saved);
      return saved;
    }
    state.seq.user += 1;
    const user = { id: `U${state.seq.user}`, ...data };
    state.users.push(user);
    return user;
  }
};
