const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../lib/db');
const { sign, auth } = require('../lib/auth');
const { emailRe, toId } = require('../lib/utils');

const router = express.Router();

const str = (v) => (typeof v === 'string' ? v.trim() : '');
const digits = (v) => str(v).replace(/\D/g, '');

const clientData = (c) => ({ id: c.id, name: c.name, email: c.email, phone: c.phone });

router.post('/register', async (req, res) => {
  const name = str(req.body.name);
  const email = str(req.body.email).toLowerCase();
  const phone = digits(req.body.phone);
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  if (name.length < 2 || name.length > 60) return res.status(400).json({ error: 'Informe seu nome.' });
  if (!emailRe.test(email)) return res.status(400).json({ error: 'E-mail inválido.' });
  if (phone.length < 10 || phone.length > 13) return res.status(400).json({ error: 'Telefone inválido. Use DDD + número.' });
  if (password.length < 6) return res.status(400).json({ error: 'A senha precisa ter pelo menos 6 caracteres.' });

  const hash = bcrypt.hashSync(password, 10);
  let client;
  try {
    client = await db.one(
      'INSERT INTO clients (name, email, phone, password_hash) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, email, phone, hash]
    );
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Já existe uma conta com esse e-mail. Faça login.' });
    }
    throw err;
  }

  res.status(201).json({ token: sign({ id: client.id, role: 'client' }), client: clientData(client) });
});

router.post('/login', async (req, res) => {
  const email = str(req.body.email).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const client = await db.one('SELECT * FROM clients WHERE email = $1', [email]);

  if (!client || !bcrypt.compareSync(password, client.password_hash)) {
    return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
  }
  res.json({ token: sign({ id: client.id, role: 'client' }), client: clientData(client) });
});

router.get('/me', auth('client'), async (req, res) => {
  const client = await db.one('SELECT * FROM clients WHERE id = $1', [req.user.id]);
  if (!client) return res.status(401).json({ error: 'Conta não encontrada.' });
  res.json({ client: clientData(client), token: sign({ id: client.id, role: 'client' }) });
});

router.get('/appointments', auth('client'), async (req, res) => {
  const appointments = await db.many(
    `SELECT a.id, a.date, a.start_time, a.end_time, a.status,
            COALESCE(a.services_label, s.name) AS service_name, COALESCE(a.total_price, s.price) AS price,
            b.name AS shop_name, b.slug, b.whatsapp
     FROM appointments a
     JOIN services s ON s.id = a.service_id
     JOIN barbershops b ON b.id = a.barbershop_id
     WHERE a.client_id = $1
     ORDER BY a.date DESC, a.start_time DESC`,
    [req.user.id]
  );
  res.json({ appointments });
});

router.patch('/appointments/:id/cancel', auth('client'), async (req, res) => {
  const id = toId(req.params.id);
  const result = id && await db.query(
    `UPDATE appointments SET status = 'cancelado'
     WHERE id = $1 AND client_id = $2 AND status = 'agendado'`,
    [id, req.user.id]
  );
  if (!result || !result.rowCount) return res.status(404).json({ error: 'Agendamento não encontrado ou já finalizado.' });
  res.json({ ok: true });
});

module.exports = router;
