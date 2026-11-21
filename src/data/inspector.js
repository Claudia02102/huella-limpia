'use strict';

const bcrypt = require('bcryptjs');
const store = require('./store');

// Cuenta de inspector municipal. En producción solo existe si se definen
// INSPECTOR_EMAIL e INSPECTOR_PASSWORD como variables de entorno (nunca en el código).
// En desarrollo y pruebas se usa una cuenta de prueba documentada en el README.
const DEV_INSPECTOR = { email: 'inspector@huellalimpia.test', password: 'Inspector2026' };

function seedInspector() {
  const prod = process.env.NODE_ENV === 'production';
  const email = (process.env.INSPECTOR_EMAIL || (prod ? '' : DEV_INSPECTOR.email)).toLowerCase();
  const password = process.env.INSPECTOR_PASSWORD || (prod ? '' : DEV_INSPECTOR.password);
  if (!email || !password || store.users().some((u) => u.email === email)) return null;
  return store.addUser({ email, passwordHash: bcrypt.hashSync(password, 10), role: 'inspector' });
}

module.exports = { seedInspector, DEV_INSPECTOR };
