(() => {
  const $ = (id) => document.getElementById(id);

  function show(view) {
    $('authView').classList.toggle('hidden', view !== 'auth');
    $('listView').classList.toggle('hidden', view !== 'list');
  }

  function logout(message) {
    Auth.clear('client');
    show('auth');
    if (message) toast(message, 'err');
  }

  function fail(err) {
    if (err.status === 401) return logout('Sessão expirada. Entre novamente.');
    toast(err.message, 'err');
  }

  async function boot() {
    setupTabs('auth');
    $('logoutBtn').onclick = () => logout();

    if (!Auth.get('client')) return show('auth');
    try {
      const { client, token } = await api('/client/me', { role: 'client' });
      if (token) Auth.set('client', token);
      enter(client);
    } catch (err) {
      if (err.status === 401 || err.status === 403) { Auth.clear('client'); show('auth'); }
      else { toast('Sem conexão. Tente de novo.', 'err'); show('auth'); }
    }
  }

  function enter(client) {
    $('clientName').textContent = client.name;
    show('list');
    loadAppointments();
  }

  function submitAuth(formId, path) {
    $(formId).addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button[type=submit]');
      await withBusy(btn, async () => {
        try {
          const r = await api(path, { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
          Auth.set('client', r.token);
          e.target.reset();
          enter(r.client);
        } catch (err) {
          toast(err.message, 'err');
        }
      });
    });
  }

  submitAuth('loginForm', '/client/login');
  submitAuth('registerForm', '/client/register');

  async function loadAppointments() {
    try {
      const { appointments } = await api('/client/appointments', { role: 'client' });
      render(appointments);
    } catch (err) {
      fail(err);
    }
  }

  function card(a, upcoming, isNext) {
    const past = a.status === 'agendado' && !upcoming;
    const badge = past ? '<span class="badge badge-passado">Passado</span>' : statusBadge(a.status);
    const faded = upcoming ? '' : ' faded';
    return `
      <article class="ticket${isNext ? ' next' : ''}${faded}">
        <div class="ticket-date">
          <strong>${a.date.slice(8)}</strong>
          <small>${weekdayShort(a.date)}, ${monthShort(a.date)}</small>
        </div>
        <div class="ticket-body">
          <div>
            <h3>${esc(a.service_name)}, ${esc(a.shop_name)}</h3>
            <p class="sub">${esc(a.start_time)} às ${esc(a.end_time)}, ${money(a.price)}</p>
          </div>
          <div class="ticket-foot">
            ${badge}
            ${upcoming ? `<button class="btn btn-danger btn-sm" data-cancel="${a.id}">Cancelar horário</button>` : `<a class="btn btn-ghost btn-sm" href="/b/${esc(a.slug)}">Agendar de novo</a>`}
          </div>
        </div>
      </article>`;
  }

  function render(list) {
    const today = todayISO();
    const isUpcoming = (a) => a.status === 'agendado' && a.date >= today;
    const upcoming = list.filter(isUpcoming).reverse();
    const history = list.filter((a) => !isUpcoming(a));

    $('upcomingList').innerHTML = upcoming.length
      ? upcoming.map((a, i) => card(a, true, i === 0)).join('')
      : '<div class="empty"><strong>Nenhum horário marcado</strong>Abra o link de uma barbearia para agendar.</div>';

    $('pastList').innerHTML = history.length
      ? history.map((a) => card(a, false, false)).join('')
      : '<div class="empty">Seus atendimentos anteriores vão aparecer aqui.</div>';
  }

  $('upcomingList').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-cancel]');
    if (!btn || !confirm('Cancelar este horário?')) return;
    await withBusy(btn, async () => {
      try {
        await api('/client/appointments/' + btn.dataset.cancel + '/cancel', { method: 'PATCH', role: 'client' });
        toast('Horário cancelado.');
        loadAppointments();
      } catch (err) {
        fail(err);
      }
    });
  });

  boot();
})();
