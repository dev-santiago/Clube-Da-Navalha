// Ponto de entrada da API. Na Vercel roda como função; localmente é usado pelo local.js.
const express = require('express');
const db = require('../lib/db');

const app = express();

// Diagnóstico: abra /api/health depois do deploy para conferir banco e variáveis.
app.get('/api/health', async (req, res) => {
  const info = db.connectionInfo();
  const status = { DATABASE_URL: !!info, fonte: info ? info.name : null, JWT_SECRET: !!process.env.JWT_SECRET };
  try {
    await db.ready();
    await db.query('SELECT 1');
    status.banco = 'conectado';
    res.json(status);
  } catch (err) {
    status.banco = err.code === 'NO_DATABASE_URL'
      ? 'DATABASE_URL não configurada'
      : 'falha ao conectar, confira a DATABASE_URL';
    console.error(err);
    res.status(500).json(status);
  }
});

app.use('/api', express.json({ limit: '100kb' }));
app.use('/api', (req, res, next) => {
  if (!req.body) req.body = {};
  next();
});
app.use('/api', async (req, res, next) => {
  try {
    await db.ready(); // garante que as tabelas existem
    next();
  } catch (err) {
    next(err);
  }
});

app.use('/api/admin', require('../routes/admin'));
app.use('/api/client', require('../routes/client'));
app.use('/api/public', require('../routes/public'));
app.use('/api/owner', require('../routes/owner'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Requisição inválida.' });
  console.error(err);
  if (err.code === 'NO_DATABASE_URL') return res.status(500).json({ error: 'Banco de dados não configurado (DATABASE_URL).' });
  if (err.code === 'NO_JWT_SECRET') return res.status(500).json({ error: 'Servidor sem JWT_SECRET configurada.' });
  res.status(500).json({ error: 'Erro interno do servidor.' });
});

module.exports = app;
