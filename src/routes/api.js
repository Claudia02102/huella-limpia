'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

const store = require('../data/store');
const { zonesWithCriticality } = require('../services/criticalityService');
const { priorityQueue, districtStats } = require('../services/priorityService');
const { nearestCleanPoints } = require('../services/geoService');
const { requireAuth, requireRole, jwtSecret } = require('../middleware/auth');
const { validateReport, validateTransition, validatePet, validateCredentials } = require('../middleware/validate');

const router = express.Router();
// Express 4 no captura errores de funciones async: los envía al manejador de errores.
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });

// Los reportes públicos nunca exponen quién los hizo.
const publicReport = ({ reportedBy, ...r }) => r; // eslint-disable-line no-unused-vars
const publicPet = ({ ownerId, ...p }) => p; // eslint-disable-line no-unused-vars

router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'huella-limpia', version: '1.1.0', storage: store.persistent() ? 'postgresql' : 'memoria' });
});

// Con base de datos, cada petición trabaja sobre el estado actual guardado en PostgreSQL.
router.use(async (req, res, next) => {
  try {
    await store.sync();
    next();
  } catch (err) {
    next(err);
  }
});

router.get('/districts', (req, res) => res.json(store.districts()));

// Épica 1: mapa de puntos críticos
router.get('/zones', (req, res) => {
  let data = zonesWithCriticality();
  if (req.query.district) data = data.filter((z) => z.district === req.query.district);
  if (req.query.level) data = data.filter((z) => z.level === req.query.level);
  res.json(data);
});

// Épica 2: reportes vecinales
router.get('/reports', (req, res) => {
  let data = store.reports();
  if (req.query.zoneId) data = data.filter((r) => r.zoneId === req.query.zoneId);
  if (req.query.status) data = data.filter((r) => r.status === req.query.status);
  res.json(data.map(publicReport));
});

router.post('/reports', requireAuth, h(async (req, res) => {
  const { errors, value } = validateReport(req.body || {}, store.zones().map((z) => z.id));
  if (errors.length) return res.status(400).json({ errors });
  const report = await store.addReport({ ...value, reportedBy: req.user.sub });
  return res.status(201).json(publicReport(report));
}));

// Épica 4: fiscalización municipal (lectura pública, cambios solo inspectores)
router.get('/inspection/queue', (req, res) => res.json(priorityQueue().map(publicReport)));
router.get('/inspection/stats', (req, res) => res.json(districtStats()));

router.patch('/reports/:id/status', requireAuth, requireRole('inspector'), h(async (req, res) => {
  const report = store.reports().find((r) => r.id === req.params.id);
  if (!report) return res.status(404).json({ error: 'Reporte no encontrado' });
  const next = String(req.body?.status ?? '');
  if (!validateTransition(report.status, next)) {
    return res.status(409).json({ error: `No se puede pasar de ${report.status} a ${next || '(vacío)'}` });
  }
  const updated = await store.updateReport(report.id, { status: next, reviewedBy: req.user.sub });
  return res.json(publicReport(updated));
}));

// Épica 3: registro de mascotas
router.get('/pets/lookup/:code', (req, res) => {
  const pet = store.pets().find((p) => p.code === String(req.params.code).toUpperCase());
  if (!pet) return res.status(404).json({ error: 'Código no registrado' });
  return res.json(publicPet(pet));
});

router.get('/pets/mine', requireAuth, (req, res) => {
  res.json(store.pets().filter((p) => p.ownerId === req.user.sub));
});

router.post('/pets', requireAuth, h(async (req, res) => {
  const { errors, value } = validatePet(req.body || {}, store.districts().map((d) => d.id));
  if (errors.length) return res.status(400).json({ errors });
  const pet = await store.addPet({ ...value, ownerId: req.user.sub });
  return res.status(201).json(pet);
}));

// Épica 5: puntos limpios
router.get('/clean-points', (req, res) => {
  let data = store.cleanPoints();
  if (req.query.kind) data = data.filter((p) => p.kind === req.query.kind);
  res.json(data);
});

router.get('/clean-points/nearest', (req, res, next) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    return res.json(nearestCleanPoints(lat, lng, { kind: req.query.kind, limit: Number(req.query.limit) || 3 }));
  } catch (err) {
    return next(err);
  }
});

// Épica 6: cuentas y roles
router.post('/auth/register', authLimiter, h(async (req, res) => {
  const { errors, value } = validateCredentials(req.body || {});
  if (errors.length) return res.status(400).json({ errors });
  if (store.users().some((u) => u.email === value.email)) {
    return res.status(409).json({ error: 'El correo ya está registrado' });
  }
  const passwordHash = await bcrypt.hash(value.password, 10);
  // El registro público siempre crea vecinos: el rol inspector no se puede autoasignar.
  const user = await store.addUser({ email: value.email, passwordHash, role: 'vecino' });
  return res.status(201).json({ id: user.id, email: user.email, role: user.role });
}));

router.post('/auth/login', authLimiter, h(async (req, res) => {
  const email = String(req.body?.email ?? '').toLowerCase().trim();
  const user = store.users().find((u) => u.email === email);
  const ok = user && (await bcrypt.compare(String(req.body?.password ?? ''), user.passwordHash));
  if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });
  const token = jwt.sign({ sub: user.id, role: user.role }, jwtSecret(), { algorithm: 'HS256', expiresIn: '2h' });
  return res.json({ token, role: user.role });
}));

router.get('/auth/me', requireAuth, (req, res) => {
  const user = store.users().find((u) => u.id === req.user.sub);
  if (!user) return res.status(401).json({ error: 'Sesión no válida' });
  return res.json({ id: user.id, email: user.email, role: user.role });
});

module.exports = router;
