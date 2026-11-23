const db = require('./db');

const SLOT_STEP = 30; // intervalo entre horários oferecidos, em minutos
const TIMEZONE = process.env.APP_TIMEZONE || 'America/Sao_Paulo';

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Converte o parâmetro de rota em id inteiro válido (ou null).
function toId(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 && n < 2147483647 ? n : null;
}

function isDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}

function isTime(s) {
  return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

function toMin(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function toTime(n) {
  return String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
}

// A Vercel roda em UTC; por isso "hoje" e "agora" são calculados no fuso da barbearia.
function nowParts() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const o = {};
  parts.forEach((p) => { o[p.type] = p.value; });
  return o;
}

function todayISO() {
  const o = nowParts();
  return `${o.year}-${o.month}-${o.day}`;
}

function nowMinutes() {
  const o = nowParts();
  return Number(o.hour) * 60 + Number(o.minute);
}

// Horários livres de uma barbearia para um serviço em uma data.
// Bloqueia: fora do expediente, intervalo, horários que já passaram
// e qualquer sobreposição com agendamentos existentes (não cancelados).
// "runner" permite rodar dentro de uma transação (cliente do pool).
async function getSlots(shop, service, date, runner) {
  const run = runner || { query: db.query };

  const open = toMin(shop.open_time);
  const close = toMin(shop.close_time);
  const hasBreak = !!(shop.break_start && shop.break_end);
  const bs = hasBreak ? toMin(shop.break_start) : null;
  const be = hasBreak ? toMin(shop.break_end) : null;
  const dur = service.duration;

  const { rows } = await run.query(
    `SELECT start_time, end_time FROM appointments
     WHERE barbershop_id = $1 AND date = $2 AND status <> 'cancelado'`,
    [shop.id, date]
  );
  const busy = rows.map((a) => [toMin(a.start_time), toMin(a.end_time)]);

  const isToday = date === todayISO();
  const now = nowMinutes();
  const slots = [];

  for (let t = open; t + dur <= close; t += SLOT_STEP) {
    if (isToday && t <= now) continue;
    if (hasBreak && t < be && t + dur > bs) continue;
    if (busy.some(([s, e]) => t < e && t + dur > s)) continue;
    slots.push(toTime(t));
  }
  return slots;
}

module.exports = { emailRe, toId, isDate, isTime, toMin, toTime, todayISO, getSlots };
