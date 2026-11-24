// Servidor para rodar no seu computador (npm start). Na Vercel este arquivo não é usado.
require('dotenv').config();
const express = require('express');
const path = require('path');
const api = require('./api/index.js');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(api);
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h', etag: true }));

const page = (file) => (req, res) => res.sendFile(path.join(__dirname, 'public', file));
app.get('/admin', page('admin.html'));
app.get('/cliente', page('cliente.html'));
app.get('/b/:slug', page('barbearia.html'));

app.use((req, res) => res.status(404).send('Página não encontrada.'));

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
