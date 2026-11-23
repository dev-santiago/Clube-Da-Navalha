// Testa a conexão com o Neon e cria as tabelas: npm run db:check
require('dotenv').config();
const db = require('../lib/db');

(async () => {
  const info = db.connectionInfo();
  if (!info) {
    console.error('Nenhuma string de conexão encontrada. Preencha DATABASE_URL no arquivo .env.');
    process.exit(1);
  }
  try {
    await db.ready();
    const { rows } = await db.query(
      "SELECT current_database() AS banco, (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public') AS tabelas"
    );
    console.log(`Conectado usando ${info.name}. Banco: ${rows[0].banco}, tabelas: ${rows[0].tabelas}.`);
    process.exit(0);
  } catch (err) {
    console.error('Falha ao conectar:', err.message);
    process.exit(1);
  }
})();
