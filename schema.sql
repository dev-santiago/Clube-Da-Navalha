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
UPDATE appointments a SET services_label = s.name, total_price = s.price
  FROM services s WHERE s.id = a.service_id AND a.total_price IS NULL;
CREATE INDEX IF NOT EXISTS idx_appt_shop_status_date ON appointments(barbershop_id, status, date);

CREATE INDEX IF NOT EXISTS idx_services_shop ON services(barbershop_id);
CREATE INDEX IF NOT EXISTS idx_appt_shop_date ON appointments(barbershop_id, date);
CREATE INDEX IF NOT EXISTS idx_appt_client ON appointments(client_id);
