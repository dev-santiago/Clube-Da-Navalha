const { Pool, types } = require('pg');

// NUMERIC (preço) chega como número, não como texto.
types.setTypeParser(1700, (v) => parseFloat(v));

// As tabelas são criadas automaticamente (CREATE TABLE IF NOT EXISTS).
// Datas e horários ficam como texto ('2026-12-05' e '09:30') para não depender de fuso.
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS barbershops (
    id            SERIAL PRIMARY KEY,
    name          TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    whatsapp      TEXT NOT NULL,
    slug          TEXT NOT NULL UNIQUE,
    open_time     TEXT NOT NULL DEFAULT '09:00',
    close_time    TEXT NOT NULL DEFAULT '19:00',
    break_start   TEXT DEFAULT '12:00',
    break_end     TEXT DEFAULT '13:00',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS services (
    id            SERIAL PRIMARY KEY,
    barbershop_id INTEGER NOT NULL REFERENCES barbershops(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    price         NUMERIC(10,2) NOT NULL CHECK (price >= 0),
    duration      INTEGER NOT NULL CHECK (duration > 0),
    active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS clients (
    id            SERIAL PRIMARY KEY,
    name          TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE,
    phone         TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS appointments (
    id            SERIAL PRIMARY KEY,
    barbershop_id INTEGER NOT NULL REFERENCES barbershops(id) ON DELETE CASCADE,
    service_id    INTEGER NOT NULL REFERENCES services(id),
    client_id     INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    date          TEXT NOT NULL,
    start_time    TEXT NOT NULL,
    end_time      TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'agendado'
                  CHECK (status IN ('agendado', 'concluido', 'cancelado')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  ALTER TABLE appointments ADD COLUMN IF NOT EXISTS services_label TEXT;
  ALTER TABLE appointments ADD COLUMN IF NOT EXISTS total_price NUMERIC(10,2);

  ALTER TABLE appointments ADD COLUMN IF NOT EXISTS payment_method TEXT;
  -- agendamentos antigos passam a ter nome e valor próprios (idempotente)
  CREATE TABLE IF NOT EXISTS platform_charges (
    id            SERIAL PRIMARY KEY,
    barbershop_id INTEGER NOT NULL REFERENCES barbershops(id) ON DELETE CASCADE,
    billing_month TEXT NOT NULL CHECK (billing_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    amount        NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
    status        TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'pago')),
    due_date      TEXT,
    paid_at       TIMESTAMPTZ,
    notes         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (barbershop_id, billing_month)
  );
  CREATE INDEX IF NOT EXISTS idx_platform_charges_month_status ON platform_charges(billing_month, status);

  CREATE INDEX IF NOT EXISTS idx_appt_shop_status_date ON appointments(barbershop_id, status, date);

  CREATE INDEX IF NOT EXISTS idx_services_shop ON services(barbershop_id);
  CREATE INDEX IF NOT EXISTS idx_appt_shop_date ON appointments(barbershop_id, date);
  CREATE INDEX IF NOT EXISTS idx_appt_client ON appointments(client_id);
`;

let pool = null;

// A integração Neon da Vercel cadastra DATABASE_URL sozinha. As outras são
// aceitas como alternativa caso o banco tenha sido conectado com outro prefixo.
const URL_VARS = ['DATABASE_URL', 'POSTGRES_URL', 'POSTGRES_PRISMA_URL'];

function connectionInfo() {
  for (const name of URL_VARS) {
    if (process.env[name]) return { name, url: process.env[name] };
  }
  return null;
}

function getPool() {
  if (pool) return pool;
  const info = connectionInfo();
  if (!info) {
    const err = new Error('DATABASE_URL não configurada.');
    err.code = 'NO_DATABASE_URL';
    throw err;
  }
  pool = new Pool({
    connectionString: info.url,
    // Neon exige SSL; só força aqui se a string não trouxer sslmode.
    ssl: /neon\.tech/.test(info.url) && !/sslmode=/.test(info.url) ? true : undefined,
    max: 3, // cada instância serverless usa poucas conexões; o pooler do Neon cuida do resto
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 8000,
  });
  pool.on('error', (e) => console.error('Erro no pool do Postgres:', e.message));
  return pool;
}

const query = (text, params) => getPool().query(text, params);

async function one(text, params) {
  const r = await query(text, params);
  return r.rows[0] || null;
}

async function many(text, params) {
  const r = await query(text, params);
  return r.rows;
}

// Executa várias consultas na mesma transação.
async function tx(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) { /* conexão já caiu */ }
    throw err;
  } finally {
    client.release();
  }
}

// Cria as tabelas uma vez por instância do servidor.
// O lock evita corrida quando várias instâncias sobem ao mesmo tempo.
let schemaPromise = null;
function ready() {
  if (!schemaPromise) {
    schemaPromise = tx(async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(727001)');
      await c.query(SCHEMA);
    }).catch((err) => {
      schemaPromise = null;
      throw err;
    });
  }
  return schemaPromise;
}

module.exports = { query, one, many, tx, ready, SCHEMA, connectionInfo };
