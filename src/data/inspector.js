'use strict';

const bcrypt = require('bcryptjs');
const store = require('./store');

// Cuenta de inspector municipal. En producción solo existe si se definen
// INSPECTOR_EMAIL e INSPECTOR_PASSWORD como variables de entorno (nunca en el código).
// En desarrollo y pruebas se usa una cuenta de prueba documentada en el README.
const DEV_INSPECTOR = { email: 'inspector@huellalimpia.test', password: 'Inspector2026' };

function inspectorCredentials() {
  const prod = process.env.NODE_ENV === 'production';
  const email = (process.env.INSPECTOR_EMAIL || (prod ? '' : DEV_INSPECTOR.email)).toLowerCase().trim();
  const password = process.env.INSPECTOR_PASSWORD || (prod ? '' : DEV_INSPECTOR.password);
  return email && password ? { email, password } : null;
}

/** Modo en memoria: crea la cuenta en el repositorio (con base de datos lo hace db.init()). */
function seedInspector() {
  const cred = inspectorCredentials();
  if (store.persistent() || !cred || store.users().some((u) => u.email === cred.email)) return;
  // En memoria addUser no espera nada: la cuenta queda creada de inmediato.
  store.addUser({ email: cred.email, passwordHash: bcrypt.hashSync(cred.password, 10), role: 'inspector' });
}

module.exports = { seedInspector, inspectorCredentials, DEV_INSPECTOR };
