(() => {
  const $ = (id) => document.getElementById(id);
  const slug = decodeURIComponent(location.pathname.split('/')[2] || '');

  let shop = null;
  let selected = []; // serviços escolhidos (pode ser mais de um)
  const total = () => ({
    price: selected.reduce((t, s) => t + Number(s.price), 0),
    duration: selected.reduce((t, s) => t + s.duration, 0),
    name: selected.map((s) => s.name).join(' + '),
    ids: selected.map((s) => s.id),
  });
  let time = null;
  let client = null;
  let pendingBook = false;

  // ---------- Início ----------

  async function init() {
    try {
      shop = await api('/public/barbershops/' + encodeURIComponent(slug));
    } catch (err) {
      $('loading').classList.add('hidden');
      $('notFound').classList.remove('hidden');
      return;
    }

    document.title = shop.name + ' - Agende seu horário';
    $('shopName').textContent = shop.name;
    $('shopWhats').href = waLink(shop.whatsapp, 'Olá! Vim pelo link de agendamento da ' + shop.name + '.');

    let hours = `Atendemos das ${shop.open_time} às ${shop.close_time}`;
    if (shop.break_start && shop.break_end) hours += `, com intervalo das ${shop.break_start} às ${shop.break_end}`;
    $('shopHours').textContent = hours + '.';

    $('date').min = todayISO();
    $('date').value = todayISO();
    renderDays();
    setupTabs('modal');
    bindEvents();

    await loadClient();
    renderServices();
    updateSummary();
    $('loading').classList.add('hidden');
    $('page').classList.remove('hidden');
  }

  async function loadClient() {
    client = null;
    if (Auth.get('client')) {
      try {
        const r = await api('/client/me', { role: 'client' });
        client = r.client;
        if (r.token) Auth.set('client', r.token);
      } catch (err) {
        if (err.status === 401 || err.status === 403) Auth.clear('client');
      }
    }
    renderUser();
  }

  function renderUser() {
    $('userBar').innerHTML = client
      ? `<span class="muted hide-sm" style="font-size:.9rem">Olá, ${esc(client.name.split(' ')[0])}</span>
         <a class="btn btn-ghost btn-sm" href="/cliente">Meus agendamentos</a>
         <button class="btn btn-ghost btn-sm" id="logoutBtn" type="button">Sair</button>`
      : '<button class="btn btn-ghost btn-sm" id="loginBtn" type="button">Entrar</button>';

    if ($('logoutBtn')) {
      $('logoutBtn').onclick = () => {
        Auth.clear('client');
        client = null;
        renderUser();
        toast('Você saiu da sua conta.');
      };
    }
    if ($('loginBtn')) $('loginBtn').onclick = () => openModal(false);

    $('loginHint').textContent = client ? '' : 'Você será pedido para entrar ou criar uma conta rápida.';
  }

  // ---------- Serviços, data e horários ----------

  function renderServices() {
    if (!shop.services.length) {
      $('services').innerHTML = '<div class="empty"><strong>Nenhum serviço disponível</strong>Esta barbearia ainda não cadastrou serviços. Volte em breve ou fale pelo WhatsApp.</div>';
      return;
    }
    $('services').innerHTML = shop.services.map((s) => {
      const on = selected.some((x) => x.id === s.id);
      return `
      <button type="button" class="choice ${on ? 'active' : ''}" data-id="${s.id}" aria-pressed="${on}">
        <span>
          <b>${esc(s.name)}</b>
          <small>${s.duration} minutos</small>
        </span>
        <span class="price">${on ? '✓ ' : ''}${money(s.price)}</span>
      </button>`;
    }).join('');
  }

  // Faixa com os próximos 14 dias; o campo de data guarda o valor escolhido.
  function renderDays() {
    const start = todayISO();
    const selected = $('date').value;
    let html = '';
    for (let i = 0; i < 14; i++) {
      const d = shiftDate(start, i);
      html += `<button type="button" class="day ${d === selected ? 'active' : ''}" data-date="${d}" role="option" aria-selected="${d === selected}">
        <small>${i === 0 ? 'hoje' : weekdayShort(d)}</small><strong>${d.slice(8)}</strong></button>`;
    }
    $('dayStrip').innerHTML = html;
  }

  const PERIODS = [
    ['Manhã', (m) => m < 12 * 60],
    ['Tarde', (m) => m >= 12 * 60 && m < 18 * 60],
    ['Noite', (m) => m >= 18 * 60],
  ];

  function renderSlots(slots) {
    const mins = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
    $('slots').innerHTML = PERIODS.map(([name, test]) => {
      const list = slots.filter((t) => test(mins(t)));
      if (!list.length) return '';
      return `<div class="period"><h3>${name}</h3><div class="slot-grid">${
        list.map((t) => `<button type="button" class="slot" data-time="${t}">${t}</button>`).join('')
      }</div></div>`;
    }).join('');
  }

  async function loadSlots() {
    time = null;
    updateSummary();
    const date = $('date').value;

    if (!selected.length) {
      $('slots').innerHTML = '<p class="muted">Escolha um ou mais serviços para ver os horários livres.</p>';
      return;
    }
    if (!date) {
      $('slots').innerHTML = '<p class="muted">Escolha um dia para ver os horários livres.</p>';
      return;
    }

    $('slots').innerHTML = '<div class="skeleton" style="margin:0"></div>';
    try {
      const { slots } = await api(`/public/barbershops/${encodeURIComponent(slug)}/slots?date=${date}&service_ids=${total().ids.join(',')}`);
      if (!slots.length) {
        $('slots').innerHTML = '<div class="empty"><strong>Sem horários livres neste dia</strong>Tente outra data.</div>';
        return;
      }
      renderSlots(slots);
    } catch (err) {
      $('slots').innerHTML = `<p style="color:var(--danger)">${esc(err.message)}</p>`;
    }
  }


  function updateSummary() {
    const date = $('date').value;
    const t = total();
    const ready = !!(selected.length && time && date);
    if (selected.length) { $('sumService').textContent = t.name; $('sumService').classList.remove('placeholder'); }
    else { $('sumService').textContent = 'Escolha um ou mais serviços'; $('sumService').classList.add('placeholder'); }
    if (date) { $('sumDate').textContent = fmtDate(date); $('sumDate').classList.remove('placeholder'); }
    if (time) { $('sumTime').textContent = time + (selected.length ? ' às ' + toEnd(time, t.duration) : ''); $('sumTime').classList.remove('placeholder'); }
    else { $('sumTime').textContent = 'Escolha um horário'; $('sumTime').classList.add('placeholder'); }
    $('sumTotal').textContent = money(t.price);
    $('confirmBtn').disabled = !ready;
  }

  function toEnd(start, duration) {
    const m = Number(start.slice(0, 2)) * 60 + Number(start.slice(3)) + duration;
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  }

  // ---------- Login e confirmação ----------

  function openModal(thenBook) {
    pendingBook = thenBook;
    $('authModal').classList.remove('hidden');
    $('mLoginEmail').focus();
  }

  function closeModal() {
    pendingBook = false;
    $('authModal').classList.add('hidden');
  }

  function submitAuth(formId, path) {
    $(formId).addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button[type=submit]');
      await withBusy(btn, async () => {
        try {
          const r = await api(path, { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
          Auth.set('client', r.token);
          client = r.client;
          e.target.reset();
          renderUser();
          const book = pendingBook;
          $('authModal').classList.add('hidden');
          pendingBook = false;
          if (book) confirmBooking();
          else toast('Bem-vindo, ' + client.name.split(' ')[0] + '!');
        } catch (err) {
          toast(err.message, 'err');
        }
      });
    });
  }

  async function confirmBooking() {
    if (!selected.length || !time) return;
    if (!client) return openModal(true);

    const date = $('date').value;
    await withBusy($('confirmBtn'), async () => {
      try {
        const { appointment } = await api(`/public/barbershops/${encodeURIComponent(slug)}/appointments`, {
          method: 'POST',
          role: 'client',
          body: { service_ids: total().ids, date, start_time: time },
        });
        showSuccess(appointment);
      } catch (err) {
        if (err.status === 401) {
          Auth.clear('client');
          client = null;
          renderUser();
          openModal(true);
        } else {
          toast(err.message, 'err');
          loadSlots();
        }
      }
    });
    updateSummary();
  }

  function showSuccess(a) {
    $('booking').classList.add('hidden');
    $('success').classList.remove('hidden');
    $('successText').textContent =
      `${a.service_name} em ${fmtDate(a.date)} das ${a.start_time} às ${a.end_time}, na ${shop.name}.`;
    $('successWhats').href = waLink(
      shop.whatsapp,
      `Olá! Agendei ${a.service_name} para ${fmtDate(a.date)} às ${a.start_time} pelo link de agendamento.`
    );
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---------- Eventos ----------

  function bindEvents() {
    $('services').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-id]');
      if (!btn) return;
      const svc = shop.services.find((s) => s.id === Number(btn.dataset.id));
      selected = selected.some((x) => x.id === svc.id) ? selected.filter((x) => x.id !== svc.id) : [...selected, svc];
      renderServices();
      loadSlots();
    });

    $('dayStrip').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-date]');
      if (!btn) return;
      $('date').value = btn.dataset.date;
      renderDays();
      loadSlots();
    });

    $('date').addEventListener('change', () => { renderDays(); loadSlots(); });

    $('slots').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-time]');
      if (!btn) return;
      time = btn.dataset.time;
      document.querySelectorAll('#slots .slot').forEach((b) => b.classList.toggle('active', b === btn));
      updateSummary();
      if (window.innerWidth < 900) $('summary').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    $('confirmBtn').addEventListener('click', confirmBooking);
    $('closeModal').addEventListener('click', closeModal);
    $('authModal').addEventListener('click', (e) => { if (e.target === $('authModal')) closeModal(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

    $('againBtn').addEventListener('click', () => {
      selected = [];
      time = null;
      updateSummary();
      $('success').classList.add('hidden');
      $('booking').classList.remove('hidden');
      renderServices();
      loadSlots();
    });

    submitAuth('mLogin', '/client/login');
    submitAuth('mRegister', '/client/register');
    loadSlots();
  }

  init();
})();
