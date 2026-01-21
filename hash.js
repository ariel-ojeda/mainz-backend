const bcrypt = require('bcrypt');

async function generarHash() {
  const hash = await bcrypt.hash('password123', 10);
  console.log('Hash generado:', hash);
}

generarHash();