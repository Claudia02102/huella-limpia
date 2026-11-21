'use strict';

const seed = require('./seed');

// Persistencia en PostgreSQL (Supabase en producción).
// Se activa solo si existe DATABASE_URL; sin ella la app usa el repositorio en memoria
// (desarrollo local rápido y pruebas). Todas las consultas son parametrizadas.

const DAY = 24 * 60 * 60 * 1000;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS districts (
  id text PRIMARY KEY, name text NOT NULL, lat double precision NOT NULL, lng double precision NOT NULL
);
CREATE TABLE IF NOT EXISTS zones (
  id text PRIMARY KEY, district text NOT NULL REFERENCES districts(id), name text NOT NULL,
  lat double precision NOT NULL, lng double precision NOT NULL
);
CREATE TABLE IF NOT EXISTS clean_points (
  id text PRIMARY KEY, zone_id text REFERENCES zones(id), kind text NOT NULL, name text NOT NULL,
  lat double precision NOT NULL, lng double precision NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY, email text NOT NULL UNIQUE, password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('vecino', 'inspector')), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS report_seq START 100;
CREATE SEQUENCE IF NOT EXISTS pet_seq START 100;
CREATE SEQUENCE IF NOT EXISTS user_seq START 1;
CREATE TABLE IF NOT EXISTS reports (
  id text PRIMARY KEY DEFAULT ('R' || nextval('report_seq')),
  zone_id text NOT NULL REFERENCES zones(id),
  type text NOT NULL CHECK (type IN ('heces', 'orina', 'mascota_suelta', 'foco_infeccioso')),
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'reportado' CHECK (status IN ('reportado', 'validado', 'atendido')),
  reported_by text, reviewed_by text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz
);
CREATE TABLE IF NOT EXISTS pets (
  id text PRIMARY KEY DEFAULT ('M' || nextval('pet_seq')),
  code text NOT NULL UNIQUE, name text NOT NULL, species text NOT NULL CHECK (species IN ('perro', 'gato')),
  breed text NOT NULL DEFAULT '', vaccinated boolean NOT NULL DEFAULT false,
  district text NOT NULL REFERENCES districts(id), owner_id text
);
CREATE INDEX IF NOT EXISTS reports_zone_status_idx ON reports (zone_id, status);
CREATE INDEX IF NOT EXISTS pets_owner_idx ON pets (owner_id);
`;

let client = null;
let initialized = null;

/** Cliente con interfaz query(text, params) → { rows } (pg.Pool en producción). */
function getClient() {
  if (client) return client;
  if (!process.env.DATABASE_URL) return null;
  const { Pool } = require('pg');
  client = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3,
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }
  });
  return client;
}

/** Permite inyectar otro cliente compatible (p. ej. PGlite en las pruebas). */
function useClient(c) {
  client = c;
  initialized = null;
}

const enabled = () => Boolean(getClient());
const q = (text, params = []) => getClient().query(text, params);

async function seedIfEmpty(now = Date.now()) {
  const { rows } = await q('SELECT count(*)::int AS n FROM districts');
  if (rows[0].n > 0) return false;
  for (const d of seed.districts) {
    await q('INSERT INTO districts (id, name, lat, lng) VALUES ($1, $2, $3, $4)', [d.id, d.name, d.lat, d.lng]);
  }
  for (const z of seed.zones) {
    await q('INSERT INTO zones (id, district, name, lat, lng) VALUES ($1, $2, $3, $4, $5)', [z.id, z.district, z.name, z.lat, z.lng]);
  }
  for (const p of seed.cleanPoints) {
    await q('INSERT INTO clean_points (id, zone_id, kind, name, lat, lng) VALUES ($1, $2, $3, $4, $5, $6)',
      [p.id, p.zoneId, p.kind, p.name, p.lat, p.lng]);
  }
  for (const r of seed.reports) {
    await q('INSERT INTO reports (id, zone_id, type, description, status, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
      [r.id, r.zoneId, r.type, r.description, r.status, new Date(now - r.daysAgo * DAY).toISOString()]);
  }
  for (const p of seed.pets) {
    await q('INSERT INTO pets (id, code, name, species, breed, vaccinated, district, owner_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [p.id, p.code, p.name, p.species, p.breed, p.vaccinated, p.district, p.ownerId]);
  }
  return true;
}

/** Crea el esquema, carga la semilla si la base está vacía y asegura la cuenta de inspector. */
function init() {
  if (!initialized) {
    initialized = (async () => {
      const c = getClient();
      await (typeof c.exec === 'function' ? c.exec(SCHEMA) : c.query(SCHEMA));
      await seedIfEmpty();
      const { inspectorCredentials } = require('./inspector');
      const cred = inspectorCredentials();
      if (cred) {
        const bcrypt = require('bcryptjs');
        await q(
          `INSERT INTO users (id, email, password_hash, role) VALUES ('U' || nextval('user_seq'), $1, $2, 'inspector')
           ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'inspector'`,
          [cred.email, bcrypt.hashSync(cred.password, 10)]
        );
      }
    })().catch((err) => {
      initialized = null;
      throw err;
    });
  }
  return initialized;
}

const iso = (v) => (v ? new Date(v).toISOString() : undefined);
const toReport = (r) => ({
  id: r.id, zoneId: r.zone_id, type: r.type, description: r.description, status: r.status,
  reportedBy: r.reported_by ?? undefined, reviewedBy: r.reviewed_by ?? undefined,
  createdAt: iso(r.created_at), updatedAt: iso(r.updated_at)
});
const toPet = (p) => ({
  id: p.id, code: p.code, name: p.name, species: p.species, breed: p.breed,
  vaccinated: p.vaccinated, district: p.district, ownerId: p.owner_id ?? undefined
});

/** Lee todo el estado (volumen pequeño: decenas de filas por tabla). */
async function loadAll() {
  await init();
  const [d, z, c, r, p, u] = await Promise.all([
    q('SELECT id, name, lat, lng FROM districts ORDER BY id'),
    q('SELECT id, district, name, lat, lng FROM zones ORDER BY length(id), id'),
    q('SELECT id, zone_id, kind, name, lat, lng FROM clean_points ORDER BY length(id), id'),
    q('SELECT * FROM reports ORDER BY created_at, id'),
    q('SELECT * FROM pets ORDER BY length(id), id'),
    q('SELECT id, email, password_hash, role FROM users ORDER BY created_at, id')
  ]);
  return {
    districts: d.rows,
    zones: z.rows,
    cleanPoints: c.rows.map(({ zone_id: zoneId, ...x }) => ({ ...x, zoneId })),
    reports: r.rows.map(toReport),
    pets: p.rows.map(toPet),
    users: u.rows.map(({ password_hash: passwordHash, ...x }) => ({ ...x, passwordHash }))
  };
}

async function insertReport({ zoneId, type, description, reportedBy }) {
  const { rows } = await q(
    'INSERT INTO reports (zone_id, type, description, reported_by) VALUES ($1, $2, $3, $4) RETURNING *',
    [zoneId, type, description, reportedBy]
  );
  return toReport(rows[0]);
}

async function updateReport(id, { status, reviewedBy }) {
  const { rows } = await q(
    'UPDATE reports SET status = $2, reviewed_by = $3, updated_at = now() WHERE id = $1 RETURNING *',
    [id, status, reviewedBy]
  );
  return rows[0] ? toReport(rows[0]) : null;
}

async function insertPet({ name, breed, species, district, vaccinated, ownerId }) {
  const { rows } = await q(
    `INSERT INTO pets (code, name, species, breed, vaccinated, district, owner_id)
     VALUES ('LN-' || $5::text || '-' || lpad(((SELECT count(*) FROM pets WHERE district = $5) + 1)::text, 4, '0'),
             $1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [name, species, breed, Boolean(vaccinated), district, ownerId]
  );
  return toPet(rows[0]);
}

async function insertUser({ email, passwordHash, role }) {
  const { rows } = await q(
    "INSERT INTO users (id, email, password_hash, role) VALUES ('U' || nextval('user_seq'), $1, $2, $3) RETURNING id, email, role",
    [email, passwordHash, role]
  );
  return { ...rows[0], passwordHash };
}

module.exports = { SCHEMA, enabled, useClient, init, seedIfEmpty, loadAll, insertReport, updateReport, insertPet, insertUser };
