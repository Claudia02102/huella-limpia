'use strict';

const request = require('supertest');
const app = require('../src/app');
const store = require('../src/data/store');
const { seedInspector, DEV_INSPECTOR } = require('../src/data/inspector');

beforeEach(() => {
  store.reset();
  seedInspector();
});

async function tokenFor(email, password, register = true) {
  if (register) await request(app).post('/api/auth/register').send({ email, password }).expect(201);
  const res = await request(app).post('/api/auth/login').send({ email, password }).expect(200);
  return res.body.token;
}
const vecino = () => tokenFor('vecina@test.pe', 'Huella2026x');
const inspector = () => tokenFor(DEV_INSPECTOR.email, DEV_INSPECTOR.password, false);

describe('API pública (integración)', () => {
  test('GET /api/health responde ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.service).toBe('huella-limpia');
  });

  test('cabeceras de seguridad presentes y sin x-powered-by', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  test('GET /api/zones devuelve criticidad y filtra por distrito y nivel', async () => {
    const all = await request(app).get('/api/zones');
    expect(all.body).toHaveLength(12);
    expect(all.body[0]).toHaveProperty('level');
    const lol = await request(app).get('/api/zones?district=LOL');
    expect(lol.body.every((z) => z.district === 'LOL')).toBe(true);
    const altos = await request(app).get('/api/zones?level=alto');
    expect(altos.body.every((z) => z.level === 'alto')).toBe(true);
  });

  test('GET /api/reports no expone quién reportó', async () => {
    const res = await request(app).get('/api/reports?zoneId=Z1');
    expect(res.body.length).toBe(3);
    expect(res.body.every((r) => !('reportedBy' in r))).toBe(true);
  });

  test('GET /api/clean-points/nearest valida coordenadas', async () => {
    const ok = await request(app).get('/api/clean-points/nearest?lat=-11.99&lng=-77.07&limit=2');
    expect(ok.status).toBe(200);
    expect(ok.body).toHaveLength(2);
    const bad = await request(app).get('/api/clean-points/nearest?lat=abc&lng=-77');
    expect(bad.status).toBe(400);
  });

  test('GET /api/inspection/queue y /stats responden', async () => {
    const q = await request(app).get('/api/inspection/queue');
    expect(q.body[0]).toHaveProperty('priority');
    const s = await request(app).get('/api/inspection/stats');
    expect(s.body).toHaveLength(4);
  });

  test('GET /api/pets/lookup/:code muestra la placa sin el dueño', async () => {
    const res = await request(app).get('/api/pets/lookup/ln-lol-0001');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Rocky');
    expect(res.body.ownerId).toBeUndefined();
    expect((await request(app).get('/api/pets/lookup/LN-XXX-9999')).status).toBe(404);
  });
});

describe('Autenticación y roles (integración)', () => {
  test('POST /api/reports sin token responde 401', async () => {
    const res = await request(app).post('/api/reports').send({ zoneId: 'Z1', type: 'heces', description: 'prueba' });
    expect(res.status).toBe(401);
  });

  test('vecino reporta un punto crítico y queda como reportado, sanitizado', async () => {
    const t = await vecino();
    const res = await request(app).post('/api/reports').set('Authorization', `Bearer ${t}`)
      .send({ zoneId: 'Z4', type: 'heces', description: '<script>x</script> heces en la vereda' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('reportado');
    expect(res.body.description).not.toMatch(/[<>]/);
  });

  test('reporte con datos inválidos responde 400', async () => {
    const t = await vecino();
    const res = await request(app).post('/api/reports').set('Authorization', `Bearer ${t}`).send({ zoneId: 'Z99', type: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveLength(3);
  });

  test('un vecino NO puede validar reportes (403)', async () => {
    const t = await vecino();
    const res = await request(app).patch('/api/reports/R14/status').set('Authorization', `Bearer ${t}`).send({ status: 'validado' });
    expect(res.status).toBe(403);
  });

  test('el registro público no permite autoasignarse rol inspector', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'hacker@test.pe', password: 'Clave12345', role: 'inspector' });
    expect(res.body.role).toBe('vecino');
  });

  test('el inspector valida y luego marca atendido; transiciones inválidas dan 409', async () => {
    const t = await inspector();
    const v = await request(app).patch('/api/reports/R14/status').set('Authorization', `Bearer ${t}`).send({ status: 'validado' });
    expect(v.status).toBe(200);
    expect(v.body.status).toBe('validado');
    const a = await request(app).patch('/api/reports/R14/status').set('Authorization', `Bearer ${t}`).send({ status: 'atendido' });
    expect(a.body.status).toBe('atendido');
    const back = await request(app).patch('/api/reports/R14/status').set('Authorization', `Bearer ${t}`).send({ status: 'validado' });
    expect(back.status).toBe(409);
    const missing = await request(app).patch('/api/reports/R999/status').set('Authorization', `Bearer ${t}`).send({ status: 'validado' });
    expect(missing.status).toBe(404);
  });

  test('registro de mascota genera código por distrito y aparece en /pets/mine', async () => {
    const t = await vecino();
    const res = await request(app).post('/api/pets').set('Authorization', `Bearer ${t}`)
      .send({ name: 'Toby', species: 'perro', breed: 'Mestizo', vaccinated: true, district: 'IND' });
    expect(res.status).toBe(201);
    expect(res.body.code).toBe('LN-IND-0001');
    const mine = await request(app).get('/api/pets/mine').set('Authorization', `Bearer ${t}`);
    expect(mine.body).toHaveLength(1);
    const bad = await request(app).post('/api/pets').set('Authorization', `Bearer ${t}`).send({ name: 'X', species: 'loro' });
    expect(bad.status).toBe(400);
  });

  test('GET /api/auth/me devuelve el rol; token falso responde 401', async () => {
    const t = await inspector();
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${t}`);
    expect(me.body.role).toBe('inspector');
    const fake = await request(app).get('/api/auth/me').set('Authorization', 'Bearer a.b.c');
    expect(fake.status).toBe(401);
  });

  test('registro duplicado 409, login incorrecto 401, payload >10KB 413 y ruta inexistente 404', async () => {
    const creds = { email: 'dup@test.pe', password: 'Huella2026x' };
    await request(app).post('/api/auth/register').send(creds).expect(201);
    expect((await request(app).post('/api/auth/register').send(creds)).status).toBe(409);
    expect((await request(app).post('/api/auth/login').send({ email: 'no@test.pe', password: 'x' })).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ email: 'a'.repeat(20000) })).status).toBe(413);
    expect((await request(app).get('/api/nada')).status).toBe(404);
  });
});
