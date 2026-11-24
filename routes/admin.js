const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../lib/db');
const { sign, auth } = require('../lib/auth');
const { emailRe, toId, isDate, isTime, toMin, todayISO } = require('../lib/utils');

const router = express.Router();

const RESERVED_SLUGS = ['admin', 'api', 'cliente', 'b', 'css', 'js', 'assets'];
const slugRe = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const str = (v) => (typeof v === 'string' ? v.trim() : '');
const digits = (v) => str(v).replace(/\D/g, '');

function shopData(s) {
  return {
    id: s.id,
    name: s.name,
    email: s.email,
    whatsapp: s.whatsapp,
    slug: s.slug,
    open_time: s.open_time,
    close_time: s.close_time,
    break_start: s.break_start,
    break_end: s.break_end,
  };
}

// ---------- Cadastro e login da barbearia ----------

router.post('/register', async (req, res) => {
  const name = str(req.body.name);
  const email = str(req.body.email).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const whatsapp = digits(req.body.whatsapp);
  const slug = str(req.body.slug).toLowerCase();

  if (name.length < 2 || name.length > 60) return res.status(400).json({ error: 'Informe o nome da barbearia.' });
  if (!emailRe.test(email)) return res.status(400).json({ error: 'E-mail inválido.' });
  if (password.length < 6) return res.status(400).json({ error: 'A senha precisa ter pelo menos 6 caracteres.' });
  if (whatsapp.length < 10 || whatsapp.length > 13) return res.status(400).json({ error: 'WhatsApp inválido. Use DDD + número.' });
  if (slug.length < 3 || slug.length > 40 || !slugRe.test(slug)) {
    return res.status(400).json({ error: 'O link deve ter de 3 a 40 caracteres, só com letras minúsculas, números e hífen.' });
  }
  if (RESERVED_SLUGS.includes(slug)) return res.status(400).json({ error: 'Esse link é reservado. Escolha outro.' });

  const hash = await bcrypt.hash(password, 10);
  let shop;
  try {
    shop = await db.one(
      `INSERT INTO barbershops (name, email, password_hash, whatsapp, slug)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name, email, hash, whatsapp, slug]
    );
  } catch (err) {
    if (err.code === '23505') {
      const msg = String(err.constraint || '').includes('slug')
        ? 'Esse link já está em uso. Escolha outro.'
        : 'Já existe uma barbearia com esse e-mail.';
      return res.status(409).json({ error: msg });
    }
    throw err;
  }

  res.status(201).json({ token: sign({ id: shop.id, role: 'barbershop' }), barbershop: shopData(shop) });
});

router.post('/login', async (req, res) => {
  const email = str(req.body.email).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const shop = await db.one('SELECT * FROM barbershops WHERE email = $1', [email]);

  if (!shop || !(await bcrypt.compare(password, shop.password_hash))) {
    return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
  }
  res.json({ token: sign({ id: shop.id, role: 'barbershop' }), barbershop: shopData(shop) });
});

// Tudo abaixo exige login da barbearia.
router.use(auth('barbershop'));

router.get('/me', async (req, res) => {
  const shop = await db.one('SELECT * FROM barbershops WHERE id = $1', [req.user.id]);
  if (!shop) return res.status(401).json({ error: 'Conta não encontrada.' });
  res.json({ barbershop: shopData(shop), token: sign({ id: shop.id, role: 'barbershop' }) });
});

// ---------- Horários de funcionamento ----------

router.put('/settings', async (req, res) => {
  const open = str(req.body.open_time);
  const close = str(req.body.close_time);
  const bs = str(req.body.break_start) || null;
  const be = str(req.body.break_end) || null;

  if (!isTime(open) || !isTime(close)) return res.status(400).json({ error: 'Informe abertura e fechamento.' });
  if (toMin(open) >= toMin(close)) return res.status(400).json({ error: 'O fechamento deve ser depois da abertura.' });

  if (bs || be) {
    if (!bs || !be || !isTime(bs) || !isTime(be)) {
      return res.status(400).json({ error: 'Para definir intervalo, preencha início e fim.' });
    }
    if (toMin(bs) >= toMin(be)) return res.status(400).json({ error: 'O fim do intervalo deve ser depois do início.' });
    if (toMin(bs) < toMin(open) || toMin(be) > toMin(close)) {
      return res.status(400).json({ error: 'O intervalo precisa estar dentro do horário de funcionamento.' });
    }
  }

  const shop = await db.one(
    `UPDATE barbershops SET open_time = $1, close_time = $2, break_start = $3, break_end = $4
     WHERE id = $5 RETURNING *`,
    [open, close, bs, be, req.user.id]
  );
  res.json({ barbershop: shopData(shop) });
});

// ---------- CRUD de serviços ----------

function parseService(body) {
  const name = str(body.name);
  const price = Number(String(body.price).replace(',', '.'));
  const duration = Number(body.duration);
  if (name.length < 2 || name.length > 60) return { error: 'Informe o nome do serviço.' };
  if (!isFinite(price) || price < 0 || price > 100000) return { error: 'Preço inválido.' };
  if (!Number.isInteger(duration) || duration < 5 || duration > 480) {
    return { error: 'A duração deve ser de 5 a 480 minutos.' };
  }
  return { name, price: Math.round(price * 100) / 100, duration };
}

router.get('/services', async (req, res) => {
  const services = await db.many(
    'SELECT id, name, price, duration FROM services WHERE barbershop_id = $1 AND active = TRUE ORDER BY name',
    [req.user.id]
  );
  res.json({ services });
});

router.post('/services', async (req, res) => {
  const s = parseService(req.body);
  if (s.error) return res.status(400).json({ error: s.error });
  const service = await db.one(
    `INSERT INTO services (barbershop_id, name, price, duration)
     VALUES ($1, $2, $3, $4) RETURNING id, name, price, duration`,
    [req.user.id, s.name, s.price, s.duration]
  );
  res.status(201).json({ service });
});

router.put('/services/:id', async (req, res) => {
  const id = toId(req.params.id);
  const s = parseService(req.body);
  if (s.error) return res.status(400).json({ error: s.error });
  const service = id && await db.one(
    `UPDATE services SET name = $1, price = $2, duration = $3
     WHERE id = $4 AND barbershop_id = $5 AND active = TRUE
     RETURNING id, name, price, duration`,
    [s.name, s.price, s.duration, id, req.user.id]
  );
  if (!service) return res.status(404).json({ error: 'Serviço não encontrado.' });
  res.json({ service });
});

router.delete('/services/:id', async (req, res) => {
  const id = toId(req.params.id);
  const service = id && await db.one(
    'SELECT id FROM services WHERE id = $1 AND barbershop_id = $2 AND active = TRUE',
    [id, req.user.id]
  );
  if (!service) return res.status(404).json({ error: 'Serviço não encontrado.' });

  // Se já existem agendamentos, o serviço é só desativado para preservar o histórico.
  const used = await db.one('SELECT 1 FROM appointments WHERE service_id = $1 LIMIT 1', [service.id]);
  if (used) await db.query('UPDATE services SET active = FALSE WHERE id = $1', [service.id]);
  else await db.query('DELETE FROM services WHERE id = $1', [service.id]);
  res.json({ ok: true });
});

// ---------- Agenda ----------

router.get('/appointments', async (req, res) => {
  const date = isDate(req.query.date) ? req.query.date : todayISO();
  const appointments = await db.many(
    `SELECT a.id, a.date, a.start_time, a.end_time, a.status,
            c.name AS client_name, c.phone AS client_phone,
            COALESCE(a.services_label, s.name) AS service_name, COALESCE(a.total_price, s.price) AS price, a.payment_method
     FROM appointments a
     JOIN clients c ON c.id = a.client_id
     JOIN services s ON s.id = a.service_id
     WHERE a.barbershop_id = $1 AND a.date = $2
     ORDER BY a.start_time`,
    [req.user.id, date]
  );
  res.json({ date, appointments });
});

router.patch('/appointments/:id', async (req, res) => {
  const status = req.body.status;
  if (!['concluido', 'cancelado'].includes(status)) return res.status(400).json({ error: 'Status inválido.' });
  const pay = ['dinheiro', 'pix', 'cartao'].includes(req.body.payment_method) ? req.body.payment_method : null;
  const id = toId(req.params.id);
  const result = id && await db.query(
    `UPDATE appointments SET status = $1, payment_method = $4
     WHERE id = $2 AND barbershop_id = $3 AND status = 'agendado'`,
    [status, id, req.user.id, status === 'concluido' ? pay : null]
  );
  if (!result || !result.rowCount) return res.status(404).json({ error: 'Agendamento não encontrado ou já finalizado.' });
  res.json({ ok: true });
});

// ---------- Faturamento ----------

router.get('/revenue', async (req, res) => {
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(req.query.month) ? req.query.month : todayISO().slice(0, 7);
  const params = [req.user.id, month + '-01', month + '-31'];
  const base = `FROM appointments a JOIN services s ON s.id = a.service_id
     WHERE a.barbershop_id = $1 AND a.status = 'concluido' AND a.date BETWEEN $2 AND $3`;

  const days = await db.many(
    `SELECT a.date, COUNT(*)::int AS count, COALESCE(SUM(COALESCE(a.total_price, s.price)), 0) AS total ${base} GROUP BY a.date ORDER BY a.date`, params);
  const services = await db.many(
    `SELECT TRIM(n) AS name, COUNT(*)::int AS count
     FROM appointments a JOIN services s ON s.id = a.service_id,
          unnest(string_to_array(COALESCE(a.services_label, s.name), ' + ')) AS n
     WHERE a.barbershop_id = $1 AND a.status = 'concluido' AND a.date BETWEEN $2 AND $3
     GROUP BY TRIM(n) ORDER BY count DESC, name LIMIT 12`, params);
  const payments = await db.many(
    `SELECT COALESCE(a.payment_method, 'nao_informado') AS method, COALESCE(SUM(COALESCE(a.total_price, s.price)), 0) AS total ${base} GROUP BY 1`, params);

  const total = days.reduce((t, d) => t + d.total, 0);
  const count = days.reduce((t, d) => t + d.count, 0);
  res.json({ month, total, count, average: count ? total / count : 0, days, services, payments });
});

module.exports = router;
