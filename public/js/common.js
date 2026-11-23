const API = '/api';
const TOKEN_KEYS = { admin: 'bs_admin_token', client: 'bs_client_token' };

const Auth = {
  get: (role) => localStorage.getItem(TOKEN_KEYS[role]),
  set: (role, token) => localStorage.setItem(TOKEN_KEYS[role], token),
  clear: (role) => localStorage.removeItem(TOKEN_KEYS[role]),
};

// Chamada à API. Use role: 'admin' ou 'client' para enviar o token correspondente.
async function api(path, { method = 'GET', body, role } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = role ? Auth.get(role) : null;
  if (token) headers.Authorization = 'Bearer ' + token;

  const res = await fetch(API + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data = {};
  try { data = await res.json(); } catch (e) { /* resposta sem corpo */ }

  if (!res.ok) {
    const err = new Error(data.error || 'Algo deu errado. Tente novamente.');
    err.status = res.status;
    throw err;
  }
  return data;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const money = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function fmtDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function todayISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function shiftDate(iso, days) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

// "ter", "qua"... (sem o ponto final que o navegador coloca)
function weekdayShort(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
}

// "terça-feira, 24 de novembro"
function fmtLongDate(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function monthShort(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
}

const onlyDigits = (s) => String(s || '').replace(/\D/g, '');

function fmtPhone(p) {
  let d = onlyDigits(p);
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return p;
}

function waLink(phone, message) {
  let n = onlyDigits(phone);
  if (n.length <= 11) n = '55' + n;
  return 'https://wa.me/' + n + (message ? '?text=' + encodeURIComponent(message) : '');
}

function slugify(s) {
  return String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function toast(message, type = 'ok') {
  let box = document.getElementById('toasts');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toasts';
    document.body.appendChild(box);
  }
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.setAttribute('role', type === 'err' ? 'alert' : 'status');
  el.textContent = message;
  box.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

const STATUS_LABEL = { agendado: 'Agendado', concluido: 'Concluído', cancelado: 'Cancelado' };

function statusBadge(status) {
  return `<span class="badge badge-${status}">${STATUS_LABEL[status] || esc(status)}</span>`;
}

// Abas: botões com data-tabgroup="grupo" e data-panel="idDoPainel".
function setupTabs(group, onChange) {
  const buttons = [...document.querySelectorAll(`[data-tabgroup="${group}"]`)];
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      buttons.forEach((b) => {
        const active = b === btn;
        b.classList.toggle('active', active);
        document.getElementById(b.dataset.panel).classList.toggle('hidden', !active);
      });
      if (onChange) onChange(btn.dataset.panel);
    });
  });
}

async function copyText(text, inputEl) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    if (inputEl) { inputEl.select(); document.execCommand('copy'); }
  }
}

// Desativa o botão enquanto a ação roda.
async function withBusy(btn, fn) {
  if (btn) btn.disabled = true;
  try { return await fn(); } finally { if (btn) btn.disabled = false; }
}

// Número que sobe de 0 até o valor (animação curta). Respeita "reduzir movimento".
function countUp(el, to, format) {
  const fmt = format || ((n) => String(Math.round(n)));
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !to) { el.textContent = fmt(to); return; }
  const start = performance.now();
  const dur = 700;
  const step = (now) => {
    const t = Math.min(1, (now - start) / dur);
    el.textContent = fmt(to * (1 - Math.pow(1 - t, 3)));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
