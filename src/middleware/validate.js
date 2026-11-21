'use strict';

const REPORT_TYPES = ['heces', 'orina', 'mascota_suelta', 'foco_infeccioso'];
const STATUS_FLOW = { reportado: ['validado', 'atendido'], validado: ['atendido'], atendido: [] };
const SPECIES = ['perro', 'gato'];
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i;

function sanitizeText(value, max) {
  return String(value ?? '')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, max);
}

function validateReport(body, zoneIds) {
  const errors = [];
  if (!zoneIds.includes(body.zoneId)) errors.push('zoneId inválido');
  if (!REPORT_TYPES.includes(body.type)) errors.push(`type debe ser uno de: ${REPORT_TYPES.join(', ')}`);
  const description = sanitizeText(body.description, 280);
  if (description.length < 5) errors.push('description debe tener al menos 5 caracteres');
  return { errors, value: { zoneId: body.zoneId, type: body.type, description } };
}

/** Valida la transición de estado de un reporte (reportado → validado → atendido). */
function validateTransition(current, next) {
  return (STATUS_FLOW[current] || []).includes(next);
}

function validatePet(body, districtIds) {
  const errors = [];
  const name = sanitizeText(body.name, 40);
  const breed = sanitizeText(body.breed || 'Mestizo', 40);
  if (name.length < 2) errors.push('name debe tener al menos 2 caracteres');
  if (!SPECIES.includes(body.species)) errors.push('species debe ser perro o gato');
  if (!districtIds.includes(body.district)) errors.push('district inválido');
  if (typeof body.vaccinated !== 'boolean') errors.push('vaccinated debe ser true o false');
  return { errors, value: { name, breed, species: body.species, district: body.district, vaccinated: body.vaccinated } };
}

function validateCredentials(body) {
  const errors = [];
  const email = String(body.email ?? '').toLowerCase().trim();
  const password = String(body.password ?? '');
  if (!EMAIL_RE.test(email)) errors.push('email inválido');
  if (password.length < 8 || !/\d/.test(password) || !/[A-Za-z]/.test(password)) {
    errors.push('password debe tener mínimo 8 caracteres, letras y números');
  }
  return { errors, value: { email, password } };
}

module.exports = { REPORT_TYPES, SPECIES, sanitizeText, validateReport, validateTransition, validatePet, validateCredentials };
