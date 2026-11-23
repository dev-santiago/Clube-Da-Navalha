const express = require('express');
const db = require('../lib/db');
const { auth } = require('../lib/auth');
const { toId, isDate, toMin, toTime, todayISO, getSlots } = require('../lib/utils');

const router = express.Router();

function findShop(slug) {
  return db.one('SELECT * FROM barbershops WHERE slug = $1', [String(slug).toLowerCase()]);
}

async function findService(shopId, serviceId) {
  const id = toId(serviceId);
  if (!id) return null;
  return db.one('SELECT * FROM services WHERE id = $1 AND barbershop_id = $2 AND active = TRUE', [id, shopId]);
}

// Aceita service_ids (lista) ou service_id (um só) e junta tudo em um serviço combinado.
async function findServices(shopId, raw) {
  const list = Array.isArray(raw) ? raw : String(raw || '').split(',');
  const ids = [...new Set(list.map(toId).filter(Boolean))].slice(0, 10);
  if (!ids.length) return null;
  const rows = await db.many(
    'SELECT * FROM services WHERE id = ANY($1::int[]) AND barbershop_id = $2 AND active = TRUE',
    [ids, shopId]
  );
  if (rows.length !== ids.length) return null;
  rows.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  return {
    id: rows[0].id,
    name: rows.map((s) => s.name).join(' + '),
    price: rows.reduce((t, s) => t + Number(s.price), 0),
    duration: rows.reduce((t, s) => t + s.duration, 0),
  };
}

// Dados públicos da barbearia + serviços
router.get('/barbershops/:slug', async (req, res) => {
  const shop = await findShop(req.params.slug);
  if (!shop) return res.status(404).json({ error: 'Barbearia não encontrada.' });

  const services = await db.many(
    'SELECT id, name, price, duration FROM services WHERE barbershop_id = $1 AND active = TRUE ORDER BY name',
    [shop.id]
  );

  res.json({
    name: shop.name,
    slug: shop.slug,
    whatsapp: shop.whatsapp,
    open_time: shop.open_time,
    close_time: shop.close_time,
    break_start: shop.break_start,
    break_end: shop.break_end,
    services,
  });
});

// Horários livres para um serviço em uma data
router.get('/barbershops/:slug/slots', async (req, res) => {
  const shop = await findShop(req.params.slug);
  if (!shop) return res.status(404).json({ error: 'Barbearia não encontrada.' });

  const { date } = req.query;
  if (!isDate(date) || date < todayISO()) return res.status(400).json({ error: 'Escolha uma data de hoje em diante.' });

  const service = await findServices(shop.id, req.query.service_ids || req.query.service_id);
  if (!service) return res.status(404).json({ error: 'Serviço não encontrado.' });

  res.json({ slots: await getSlots(shop, service, date) });
});

// Criar agendamento (exige cliente logado)
router.post('/barbershops/:slug/appointments', auth('client'), async (req, res) => {
  const shop = await findShop(req.params.slug);
  if (!shop) return res.status(404).json({ error: 'Barbearia não encontrada.' });

  const { date, start_time } = req.body;
  if (!isDate(date) || date < todayISO()) return res.status(400).json({ error: 'Escolha uma data de hoje em diante.' });

  const service = await findServices(shop.id, req.body.service_ids || req.body.service_id);
  if (!service) return res.status(404).json({ error: 'Serviço não encontrado.' });

  const client = await db.one('SELECT id FROM clients WHERE id = $1', [req.user.id]);
  if (!client) return res.status(401).json({ error: 'Conta não encontrada. Entre novamente.' });

  const appointment = await db.tx(async (c) => {
    // Trava a barbearia: agendamentos simultâneos dela passam um de cada vez,
    // então dois clientes nunca ficam com o mesmo horário.
    await c.query('SELECT id FROM barbershops WHERE id = $1 FOR UPDATE', [shop.id]);

    const free = await getSlots(shop, service, date, c);
    if (typeof start_time !== 'string' || !free.includes(start_time)) return null;

    const end = toTime(toMin(start_time) + service.duration);
    const { rows } = await c.query(
      `INSERT INTO appointments (barbershop_id, service_id, client_id, date, start_time, end_time, services_label, total_price)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [shop.id, service.id, client.id, date, start_time, end, service.name, service.price]
    );
    return { id: rows[0].id, date, start_time, end_time: end };
  });

  if (!appointment) return res.status(409).json({ error: 'Esse horário acabou de ser ocupado. Escolha outro.' });

  res.status(201).json({ appointment: { ...appointment, service_name: service.name, price: service.price } });
});

module.exports = router;
