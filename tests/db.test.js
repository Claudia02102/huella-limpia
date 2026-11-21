'use strict';

// Persistencia con PostgreSQL real (PGlite: PostgreSQL compilado a WebAssembly, en memoria).
// Verifica el esquema, la semilla y que los datos sobreviven a un "reinicio" de la instancia,
// que es lo que ocurre en Vercel entre peticiones.
const request = require('supertest');
const { PGlite } = require('@electric-sql/pglite');
const db = require('../src/data/db');
const store = require('../src/data/store');
const app = require('../src/app');
const { DEV_INSPECTOR } = require('../src/data/inspector');

let pg;

beforeAll(async () => {
  pg = new PGlite();
  await pg.waitReady;
  db.useClient(pg);
});

afterAll(async () => {
  db.useClient(null);
  await pg.close();
});

const login = async (email, password) =>
  (await request(app).post('/api/auth/login').send({ email, password }).expect(200)).body.token;

describe('Persistencia en PostgreSQL', () => {
  test('crea el esquema y carga la semilla una sola vez', async () => {
    await db.init();
    expect(await db.seedIfEmpty()).toBe(false);
    const { rows } = await pg.query('SELECT count(*)::int AS n FROM zones');
    expect(rows[0].n).toBe(12);
    const res = await request(app).get('/api/zones');
    expect(res.body).toHaveLength(12);
    expect((await request(app).get('/api/health')).body.storage).toBe('postgresql');
  });

  test('el inspector se crea en la base con la contraseña cifrada', async () => {
    const { rows } = await pg.query('SELECT role, password_hash FROM users WHERE email = $1', [DEV_INSPECTOR.email]);
    expect(rows[0].role).toBe('inspector');
    expect(rows[0].password_hash).not.toBe(DEV_INSPECTOR.password);
  });

  test('reportes, validaciones, mascotas y cuentas sobreviven a un reinicio', async () => {
    await request(app).post('/api/auth/register').send({ email: 'vecino@db.pe', password: 'Huella2026x' }).expect(201);
    const vecino = await login('vecino@db.pe', 'Huella2026x');
    const rep = await request(app).post('/api/reports').set('Authorization', `Bearer ${vecino}`)
      .send({ zoneId: 'Z7', type: 'foco_infeccioso', description: 'Prueba <b>persistente</b>' }).expect(201);
    expect(rep.body.description).toBe('Prueba bpersistente/b');
    const pet = await request(app).post('/api/pets').set('Authorization', `Bearer ${vecino}`)
      .send({ name: 'Toby', breed: 'Mestizo', species: 'perro', district: 'IND', vaccinated: true }).expect(201);
    expect(pet.body.code).toBe('LN-IND-0001');

    const inspector = await login(DEV_INSPECTOR.email, DEV_INSPECTOR.password);
    await request(app).patch(`/api/reports/${rep.body.id}/status`).set('Authorization', `Bearer ${inspector}`)
      .send({ status: 'validado' }).expect(200);

    // Simula una instancia nueva: se borra la memoria y todo se lee otra vez de la base.
    store.reset();
    const fresh = await login('vecino@db.pe', 'Huella2026x');
    const mine = await request(app).get('/api/pets/mine').set('Authorization', `Bearer ${fresh}`);
    expect(mine.body.map((p) => p.code)).toEqual(['LN-IND-0001']);
    const reports = await request(app).get('/api/reports?zoneId=Z7');
    expect(reports.body).toEqual([expect.objectContaining({ id: rep.body.id, status: 'validado' })]);
    expect(reports.body[0]).not.toHaveProperty('reportedBy');
    const zone = (await request(app).get('/api/zones')).body.find((z) => z.id === 'Z7');
    expect(zone.activeReports).toBe(1);
  });

  test('las restricciones de la base rechazan datos inválidos', async () => {
    await expect(pg.query("INSERT INTO reports (zone_id, type) VALUES ('Z1', 'basura')")).rejects.toThrow();
    await expect(pg.query("INSERT INTO reports (zone_id, type) VALUES ('Z99', 'heces')")).rejects.toThrow();
  });
});
