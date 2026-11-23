(() => {
  const $ = (id) => document.getElementById(id);

  let me = null;
  let services = [];

  function show(view) {
    $('authView').classList.toggle('hidden', view !== 'auth');
    $('dashView').classList.toggle('hidden', view !== 'dash');
  }

  function logout(message) {
    Auth.clear('admin');
    me = null;
    show('auth');
    if (message) toast(message, 'err');
  }

  // Trata erros; se a sessão expirou, volta para o login.
  function fail(err) {
    if (err.status === 401) return logout('Sessão expirada. Entre novamente.');
    toast(err.message, 'err');
  }

  // ---------- Início ----------

  async function boot() {
    setupTabs('auth');
    setupTabs('dash', (panel) => { if (panel === 'agendaPanel') loadAgenda(); if (panel === 'revenuePanel') loadRevenue(); });
    $('prevDay').onclick = () => { $('agendaDate').value = shiftDate($('agendaDate').value, -7); loadAgenda(); };
    $('nextDay').onclick = () => { $('agendaDate').value = shiftDate($('agendaDate').value, 7); loadAgenda(); };
    $('todayBtn').onclick = () => { $('agendaDate').value = todayISO(); loadAgenda(); };
    $('agendaDate').onchange = loadAgenda;
    $('logoutBtn').onclick = () => logout();

    if (!Auth.get('admin')) return show('auth');
    try {
      const r = await api('/admin/me', { role: 'admin' });
      me = r.barbershop;
      if (r.token) Auth.set('admin', r.token);
      enter();
    } catch (err) {
      if (err.status === 401 || err.status === 403) { Auth.clear('admin'); show('auth'); }
      else { toast('Sem conexão. Tente de novo.', 'err'); show('auth'); }
    }
  }

  function enter() {
    show('dash');
    $('shopName').textContent = me.name;
    $('helloTitle').textContent = 'Olá, ' + me.name;
    const link = `${location.origin}/b/${me.slug}`;
    $('publicLink').value = link;
    $('openLink').href = link;
    $('agendaDate').value = todayISO();
    fillSettings();
    loadServices();
    loadAgenda();
  }

  // ---------- Login e cadastro ----------

  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    await withBusy(btn, async () => {
      try {
        const r = await api('/admin/login', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
        Auth.set('admin', r.token);
        me = r.barbershop;
        e.target.reset();
        enter();
      } catch (err) {
        toast(err.message, 'err');
      }
    });
  });

  let slugEdited = false;
  $('regSlug').addEventListener('input', () => { slugEdited = true; });
  $('regName').addEventListener('input', (e) => {
    if (!slugEdited) $('regSlug').value = slugify(e.target.value);
  });

  $('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    await withBusy(btn, async () => {
      try {
        const body = Object.fromEntries(new FormData(e.target));
        body.slug = slugify(body.slug);
        const r = await api('/admin/register', { method: 'POST', body });
        Auth.set('admin', r.token);
        me = r.barbershop;
        e.target.reset();
        slugEdited = false;
        enter();
        toast('Barbearia criada! Cadastre seus serviços na aba Serviços.');
      } catch (err) {
        toast(err.message, 'err');
      }
    });
  });

  $('copyBtn').onclick = async () => {
    await copyText($('publicLink').value, $('publicLink'));
    toast('Link copiado!');
  };

  // ---------- Detalhe do agendamento ----------

  let today = [];
  let current = null;
  let pay = null;
  const PAY = { dinheiro: 'Dinheiro', pix: 'Pix', cartao: 'Cartão', nao_informado: 'Não informado' };

  function openAppt(id) {
    current = today.find((a) => a.id === id);
    if (!current) return;
    const a = current;
    pay = null;
    $('apptTitle').textContent = a.service_name;
    $('apptWhen').textContent = `${fmtLongDate(a.date)}, ${a.start_time} às ${a.end_time}`;
    $('apptClient').textContent = a.client_name;
    $('apptWhats').textContent = 'WhatsApp ' + fmtPhone(a.client_phone);
    $('apptWhats').href = waLink(a.client_phone, 'Olá, ' + a.client_name + '! Aqui é da ' + me.name + ' sobre seu horário de ' + fmtDate(a.date) + ' às ' + a.start_time + '.');
    $('apptChips').innerHTML = a.service_name.split(' + ').map((n) => `<span class="chip">${esc(n)}</span>`).join('');
    $('apptTotal').innerHTML = esc(money(a.price)) + (a.payment_method ? ` <small>${PAY[a.payment_method]}</small>` : '');
    const open = a.status === 'agendado';
    $('apptPayBox').classList.toggle('hidden', !open);
    $('apptActions').classList.toggle('hidden', !open);
    document.querySelectorAll('#payChoices button').forEach((b) => b.classList.remove('active'));
    $('apptModal').classList.remove('hidden');
  }

  function closeAppt() { $('apptModal').classList.add('hidden'); current = null; }

  async function setStatus(id, status, extra) {
    await api('/admin/appointments/' + id, { method: 'PATCH', role: 'admin', body: { status, ...extra } });
    toast(status === 'concluido' ? 'Atendimento concluído.' : 'Agendamento cancelado.');
    closeAppt();
    loadAgenda();
  }

  $('apptClose').onclick = closeAppt;
  $('apptModal').addEventListener('click', (e) => { if (e.target === $('apptModal')) closeAppt(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAppt(); });
  $('payChoices').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pay]');
    if (!b) return;
    pay = b.dataset.pay;
    document.querySelectorAll('#payChoices button').forEach((x) => x.classList.toggle('active', x === b));
  });
  $('apptDone').onclick = () => withBusy($('apptDone'), async () => {
    try { await setStatus(current.id, 'concluido', { payment_method: pay }); } catch (err) { fail(err); }
  });
  $('apptCancel').onclick = () => {
    if (!confirm('Cancelar este agendamento? O horário volta a ficar livre.')) return;
    withBusy($('apptCancel'), async () => { try { await setStatus(current.id, 'cancelado'); } catch (err) { fail(err); } });
  };

  // ---------- Faturamento ----------

  let revMonth = todayISO().slice(0, 7);

  function monthLabel(ym) {
    const d = new Date(ym + '-15T12:00:00');
    return d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase() + ' ' + String(d.getFullYear()).slice(2);
  }

  function renderMonthChips() {
    const cur = todayISO().slice(0, 7);
    let [y, m] = cur.split('-').map(Number);
    const list = [];
    for (let i = 0; i < 6; i++) {
      list.unshift(y + '-' + String(m).padStart(2, '0'));
      m -= 1;
      if (m === 0) { m = 12; y -= 1; }
    }
    $('monthChips').innerHTML = list.map((ym) => `<button type="button" class="mchip${ym === revMonth ? ' active' : ''}" data-month="${ym}">${monthLabel(ym)}</button>`).join('');
    $('monthChips').scrollLeft = $('monthChips').scrollWidth;
  }

  $('monthChips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-month]');
    if (!b) return;
    revMonth = b.dataset.month;
    loadRevenue();
  });

  async function loadRevenue() {
    renderMonthChips();
    try {
      renderRevenue(await api('/admin/revenue?month=' + revMonth, { role: 'admin' }));
    } catch (err) {
      fail(err);
    }
  }

  function renderRevenue(r) {
    $('revTotal').textContent = money(r.total);
    $('revMeta').textContent = `${r.count} atendimento${r.count === 1 ? '' : 's'} | ticket médio ${money(r.average)}`;
    const [y, m] = r.month.split('-').map(Number);
    const n = new Date(y, m, 0).getDate();
    const byDay = {};
    r.days.forEach((d) => { byDay[Number(d.date.slice(8))] = d; });
    const max = Math.max(1, ...r.days.map((d) => d.total));
    $('revChart').innerHTML = Array.from({ length: n }, (_, i) => {
      const d = byDay[i + 1];
      const h = d ? Math.max(8, Math.round((d.total / max) * 100)) : 4;
      return `<button type="button" class="bar${d ? ' has' : ''}" data-day="${i + 1}" aria-label="Dia ${i + 1}"><i style="height:${h}%"></i><span>${i + 1}</span></button>`;
    }).join('');
    $('revReadout').textContent = r.count ? 'Toque em uma barra para ver o dia.' : 'Nenhum atendimento concluído neste mês.';
    $('revChart').onclick = (e) => {
      const b = e.target.closest('[data-day]');
      if (!b) return;
      const d = byDay[Number(b.dataset.day)];
      document.querySelectorAll('#revChart .bar').forEach((x) => x.classList.toggle('on', x === b));
      $('revReadout').innerHTML = d
        ? `<b>Dia ${b.dataset.day}</b>: ${d.count} atendimento${d.count === 1 ? '' : 's'}, ${esc(money(d.total))}`
        : `<b>Dia ${b.dataset.day}</b>: sem atendimentos`;
    };
    $('revServices').innerHTML = r.services.length
      ? r.services.map((s) => `<div class="rcard"><strong>${s.count}</strong><span>${esc(s.name)}</span></div>`).join('')
      : '<div class="empty">Os serviços concluídos aparecem aqui.</div>';
    $('revPayments').innerHTML = r.payments.length
      ? r.payments.map((p) => `<div class="rcard"><strong>${esc(money(p.total))}</strong><span>${PAY[p.method] || esc(p.method)}</span></div>`).join('')
      : '<div class="empty">Sem pagamentos neste mês.</div>';
  }

  // ---------- Agenda ----------

  // Faixa seg-dom da semana do dia escolhido (como num app de agenda)
  function renderWeek(date) {
    const dow = (new Date(date + 'T12:00:00').getDay() + 6) % 7;
    const start = shiftDate(date, -dow);
    const today = todayISO();
    $('weekStrip').innerHTML = Array.from({ length: 7 }, (_, i) => {
      const d = shiftDate(start, i);
      return `<button type="button" class="wk${d === date ? ' active' : ''}${d === today ? ' today' : ''}" data-date="${d}" role="option" aria-selected="${d === date}"><small>${weekdayShort(d)}</small><strong>${d.slice(8)}</strong></button>`;
    }).join('');
  }
  $('weekStrip').addEventListener('click', (e) => {
    const b = e.target.closest('[data-date]');
    if (!b) return;
    $('agendaDate').value = b.dataset.date;
    loadAgenda();
  });

  async function loadAgenda() {
    const date = $('agendaDate').value || todayISO();
    try {
      const { appointments } = await api('/admin/appointments?date=' + date, { role: 'admin' });
      renderAgenda(appointments, date);
    } catch (err) {
      fail(err);
    }
  }

  function renderAgenda(list, date) {
    today = list;
    const scheduled = list.filter((a) => a.status === 'agendado').length;
    const done = list.filter((a) => a.status === 'concluido');
    const revenue = done.reduce((sum, a) => sum + a.price, 0);

    renderWeek(date);
    $('dayTitle').textContent = fmtLongDate(date);
    const ws = shiftDate(date, -((new Date(date + 'T12:00:00').getDay() + 6) % 7));
    const we = shiftDate(ws, 6);
    $('weekLabel').textContent = `${Number(ws.slice(8))} ${monthShort(ws)} a ${Number(we.slice(8))} ${monthShort(we)}`;
    $('statScheduled').textContent = scheduled;
    $('statDone').textContent = done.length;
    $('statRevenue').textContent = money(revenue);

    if (!list.length) {
      $('agendaList').innerHTML = `<div class="empty"><strong>Nenhum agendamento em ${fmtDate(date)}</strong>Quando um cliente marcar horário, ele aparece aqui.</div>`;
      return;
    }

    const cls = { concluido: ' done', cancelado: ' cancelled' };
    $('agendaList').innerHTML = list.map((a) => {
      return `
      <article class="appt${cls[a.status] || ''}" data-appt="${a.id}" tabindex="0">
        <div class="appt-time"><strong>${esc(a.start_time)}</strong><span>${esc(a.end_time)}</span></div>
        <div class="appt-info">
          <p>${esc(a.client_name)}</p>
          <p class="sub">${esc(a.service_name)}</p>
        </div>
        <div class="appt-side"><b>${esc(money(a.price))}</b>${statusBadge(a.status)}</div>
      </article>`;
    }).join('');
  }

  $('agendaList').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-status]');
    if (!btn) {
      const card = e.target.closest('[data-appt]');
      if (card && !e.target.closest('a')) openAppt(Number(card.dataset.appt));
      return;
    }
    const status = btn.dataset.status;
    if (status === 'cancelado' && !confirm('Cancelar este agendamento? O horário volta a ficar livre.')) return;
    await withBusy(btn, async () => {
      try {
        await api('/admin/appointments/' + btn.dataset.id, { method: 'PATCH', role: 'admin', body: { status } });
        toast(status === 'concluido' ? 'Atendimento concluído.' : 'Agendamento cancelado.');
        loadAgenda();
      } catch (err) {
        fail(err);
      }
    });
  });

  // ---------- Serviços ----------

  async function loadServices() {
    try {
      services = (await api('/admin/services', { role: 'admin' })).services;
      renderServices();
    } catch (err) {
      fail(err);
    }
  }

  function renderServices() {
    if (!services.length) {
      $('servicesList').innerHTML = '<div class="empty"><strong>Nenhum serviço ainda</strong>Adicione o primeiro acima para liberar agendamentos na sua página.</div>';
      return;
    }
    $('servicesList').innerHTML = services.map((s) => `
      <article class="svc-row">
        <div class="min-w-0">
          <h3>${esc(s.name)}</h3>
          <small>${s.duration} minutos</small>
        </div>
        <div class="svc-actions">
          <span class="svc-price">${money(s.price)}</span>
          <button class="btn btn-ghost btn-sm" data-edit="${s.id}">Editar</button>
          <button class="btn btn-danger btn-sm" data-del="${s.id}">Excluir</button>
        </div>
      </article>`).join('');
  }

  function resetServiceForm() {
    $('serviceForm').reset();
    $('serviceId').value = '';
    $('serviceSubmit').textContent = 'Adicionar serviço';
    $('serviceCancel').classList.add('hidden');
  }

  $('serviceCancel').onclick = resetServiceForm;

  $('serviceForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('serviceId').value;
    const body = {
      name: $('serviceName').value,
      price: $('servicePrice').value,
      duration: $('serviceDuration').value,
    };
    await withBusy($('serviceSubmit'), async () => {
      try {
        if (id) await api('/admin/services/' + id, { method: 'PUT', role: 'admin', body });
        else await api('/admin/services', { method: 'POST', role: 'admin', body });
        toast(id ? 'Serviço atualizado.' : 'Serviço adicionado.');
        resetServiceForm();
        loadServices();
      } catch (err) {
        fail(err);
      }
    });
  });

  $('servicesList').addEventListener('click', async (e) => {
    const edit = e.target.closest('[data-edit]');
    const del = e.target.closest('[data-del]');

    if (edit) {
      const s = services.find((x) => x.id === Number(edit.dataset.edit));
      if (!s) return;
      $('serviceId').value = s.id;
      $('serviceName').value = s.name;
      $('servicePrice').value = s.price;
      $('serviceDuration').value = s.duration;
      $('serviceSubmit').textContent = 'Salvar alterações';
      $('serviceCancel').classList.remove('hidden');
      $('serviceName').focus();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    if (del) {
      const s = services.find((x) => x.id === Number(del.dataset.del));
      if (!s || !confirm(`Excluir o serviço "${s.name}"?`)) return;
      await withBusy(del, async () => {
        try {
          await api('/admin/services/' + s.id, { method: 'DELETE', role: 'admin' });
          toast('Serviço excluído.');
          if ($('serviceId').value === String(s.id)) resetServiceForm();
          loadServices();
        } catch (err) {
          fail(err);
        }
      });
    }
  });

  // ---------- Horários de funcionamento ----------

  function fillSettings() {
    $('openTime').value = me.open_time || '';
    $('closeTime').value = me.close_time || '';
    $('breakStart').value = me.break_start || '';
    $('breakEnd').value = me.break_end || '';
  }

  $('settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    await withBusy(btn, async () => {
      try {
        const r = await api('/admin/settings', {
          method: 'PUT',
          role: 'admin',
          body: {
            open_time: $('openTime').value,
            close_time: $('closeTime').value,
            break_start: $('breakStart').value,
            break_end: $('breakEnd').value,
          },
        });
        me = r.barbershop;
        toast('Horários salvos.');
      } catch (err) {
        fail(err);
      }
    });
  });

  boot();
})();
