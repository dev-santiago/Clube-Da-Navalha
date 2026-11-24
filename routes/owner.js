const crypto = require('crypto');
const express = require('express');
const db = require('../lib/db');
const { sign, auth } = require('../lib/auth');
const { isDate, toId } = require('../lib/utils');

const router = express.Router();
const str = (value) => (typeof value === 'string' ? value.trim() : '');
const monthRe = /^\d{4}-(0[1-9]|1[0-2])$/;

function safeEqual(left, right) {
  const a = crypto.createHash('sha256').update(String(left)).digest();
  const b = crypto.createHash('sha256').update(String(right)).digest();
  return crypto.timingSafeEqual(a, b);
}

router.post('/login', (req, res) => {
  const ownerEmail = str(process.env.OWNER_EMAIL).toLowerCase();
  const ownerPassword = process.env.OWNER_PASSWORD || '';
  if (!ownerEmail || ownerPassword.length < 12) {
    return res.status(503).json({ error: 'Configure OWNER_EMAIL e uma OWNER_PASSWORD com pelo menos 12 caracteres no servidor.' });
  }

  const email = str(req.body.email).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!safeEqual(email, ownerEmail) || !safeEqual(password, ownerPassword)) {
    return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
  }

  res.json({ token: sign({ role: 'owner' }, { expiresIn: '12h' }) });
});

router.use(auth('owner'));

router.get('/barbershops', async (req, res) => {
  const month = str(req.query.month);
  if (!monthRe.test(month)) return res.status(400).json({ error: 'Informe o mês da cobrança.' });

  const barbershops = await db.many(
    `SELECT b.id, b.name, b.email, b.whatsapp, b.slug, b.created_at,
            c.id AS charge_id, c.amount, c.status AS charge_status,
            c.due_date, c.paid_at, c.notes
     FROM barbershops b
     LEFT JOIN platform_charges c
       ON c.barbershop_id = b.id AND c.billing_month = $1
     ORDER BY b.created_at DESC, b.name`,
    [month]
  );

  res.json({ month, barbershops });
});

router.put('/barbershops/:id/charges/:month', async (req, res) => {
  const barbershopId = toId(req.params.id);
  const month = str(req.params.month);
  const rawAmount = String(req.body.amount ?? '').trim().replace(',', '.');
  const amount = Number(rawAmount);
  const dueDate = str(req.body.due_date) || null;
  const notes = str(req.body.notes);

  if (!barbershopId) return res.status(400).json({ error: 'Barbearia inválida.' });
  if (!monthRe.test(month)) return res.status(400).json({ error: 'Mês de cobrança inválido.' });
  if (!rawAmount || !Number.isFinite(amount) || amount < 0 || amount > 99999999.99) {
    return res.status(400).json({ error: 'Informe um valor de cobrança válido.' });
  }
  if (dueDate && !isDate(dueDate)) return res.status(400).json({ error: 'Data de vencimento inválida.' });
  if (notes.length > 500) return res.status(400).json({ error: 'A observação deve ter até 500 caracteres.' });

  const shop = await db.one('SELECT id FROM barbershops WHERE id = $1', [barbershopId]);
  if (!shop) return res.status(404).json({ error: 'Barbearia não encontrada.' });

  const charge = await db.one(
    `INSERT INTO platform_charges (barbershop_id, billing_month, amount, due_date, notes)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (barbershop_id, billing_month) DO UPDATE
       SET amount = EXCLUDED.amount, due_date = EXCLUDED.due_date,
           notes = EXCLUDED.notes, updated_at = now()
     RETURNING id, amount, status, due_date, paid_at, notes`,
    [barbershopId, month, Math.round(amount * 100) / 100, dueDate, notes || null]
  );

  if (!charge) return res.status(404).json({ error: 'Barbearia não encontrada.' });
  res.json({ charge });
});

router.patch('/barbershops/:id/charges/:month', async (req, res) => {
  const barbershopId = toId(req.params.id);
  const month = str(req.params.month);
  const status = req.body.status;

  if (!barbershopId || !monthRe.test(month)) return res.status(400).json({ error: 'Cobrança inválida.' });
  if (!['pendente', 'pago'].includes(status)) return res.status(400).json({ error: 'Status de pagamento inválido.' });

  const charge = await db.one(
    `UPDATE platform_charges
     SET status = $1, paid_at = CASE WHEN $1 = 'pago' THEN now() ELSE NULL END, updated_at = now()
     WHERE barbershop_id = $2 AND billing_month = $3
     RETURNING id, amount, status, due_date, paid_at, notes`,
    [status, barbershopId, month]
  );

  if (!charge) return res.status(404).json({ error: 'Salve a cobrança antes de alterar o pagamento.' });
  res.json({ charge });
});

module.exports = router;
