(() => {
  const $ = (id) => document.getElementById(id);
  let barbershops = [];

  const showAuth = () => {
    $('ownerAuth').classList.remove('hidden');
    $('ownerDashboard').classList.add('hidden');
  };

  const showDashboard = () => {
    $('ownerAuth').classList.add('hidden');
    $('ownerDashboard').classList.remove('hidden');
  };

  function authExpired(error) {
    if (error.status === 401 || error.status === 403) {
      Auth.clear('owner');
      showAuth();
      return true;
    }
    toast(error.message, 'err');
    return false;
  }

  function updateSummary() {
    const withCharge = barbershops.filter((shop) => shop.charge_id);
    const total = withCharge.reduce((sum, shop) => sum + Number(shop.amount || 0), 0);
    const paid = withCharge.filter((shop) => shop.charge_status === 'pago')
      .reduce((sum, shop) => sum + Number(shop.amount || 0), 0);

    $('shopCount').textContent = String(barbershops.length);
    $('chargeTotal').textContent = money(total);
    $('paidTotal').textContent = money(paid);
    $('pendingTotal').textContent = money(total - paid);
    $('listCaption').textContent = `${barbershops.length} ${barbershops.length === 1 ? 'barbearia cadastrada' : 'barbearias cadastradas'} neste sistema.`;
  }

  function shopCard(shop) {
    const chargeExists = Boolean(shop.charge_id);
    const status = shop.charge_status === 'pago' ? 'paid' : chargeExists ? 'pending' : '';
    const statusText = shop.charge_status === 'pago' ? 'Pago' : chargeExists ? 'Pendente' : 'Sem cobrança';
    const phone = String(shop.whatsapp || '').replace(/\D/g, '');
    const chargeAmount = Number(shop.amount || 0);
    const message = `Olá, ${shop.name}! Passando para lembrar da cobrança do Clube da Navalha referente a ${$('billingMonth').value}, no valor de ${money(chargeAmount)}.${shop.due_date ? ` Vencimento: ${fmtDate(shop.due_date)}.` : ''}`;
    const whatsapp = chargeExists && phone ? waLink(phone, message) : '';

    return `
      <article class="owner-shop-card" data-shop-id="${shop.id}">
        <div class="owner-shop-head">
          <div class="owner-shop-title">
            <h3>${esc(shop.name)}</h3>
            <p>Cadastrada em ${fmtDate(String(shop.created_at).slice(0, 10))}</p>
          </div>
          <span class="owner-charge-status ${status}">${statusText}</span>
        </div>
        <div class="owner-shop-meta">
          <span>${esc(shop.email)}</span>
          <span>${esc(shop.whatsapp)}</span>
          <a href="/b/${encodeURIComponent(shop.slug)}" target="_blank" rel="noopener">Abrir página pública ↗</a>
        </div>
        <form class="owner-charge-form" data-charge-form>
          <label class="owner-field">Valor do mês (R$)
            <input class="input" name="amount" type="number" min="0" max="99999999.99" step="0.01" inputmode="decimal" required value="${chargeExists ? Number(shop.amount).toFixed(2) : ''}" placeholder="0,00">
          </label>
          <label class="owner-field">Vencimento
            <input class="input" name="due_date" type="date" value="${esc(shop.due_date || '')}">
          </label>
          <label class="owner-field owner-field-notes">Observação
            <input class="input" name="notes" maxlength="500" value="${esc(shop.notes || '')}" placeholder="Opcional">
          </label>
          <div class="owner-charge-actions">
            <button class="btn btn-primary" type="submit">Salvar cobrança</button>
            ${chargeExists ? `<button class="btn btn-ghost" type="button" data-toggle-status="${shop.charge_status === 'pago' ? 'pendente' : 'pago'}">${shop.charge_status === 'pago' ? 'Reabrir' : 'Marcar paga'}</button>` : ''}
            ${whatsapp ? `<a class="btn btn-ghost" href="${esc(whatsapp)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
          </div>
        </form>
      </article>`;
  }

  function render() {
    const search = $('shopSearch').value.trim().toLocaleLowerCase('pt-BR');
    const visible = barbershops.filter((shop) => `${shop.name} ${shop.email}`.toLocaleLowerCase('pt-BR').includes(search));
    $('barbershopList').innerHTML = visible.length
      ? visible.map(shopCard).join('')
      : '<div class="owner-empty">Nenhuma barbearia encontrada.</div>';
  }

  async function loadBarbershops() {
    const month = $('billingMonth').value;
    $('barbershopList').innerHTML = '<div class="owner-empty">Carregando barbearias…</div>';
    try {
      const result = await api(`/owner/barbershops?month=${encodeURIComponent(month)}`, { role: 'owner' });
      barbershops = result.barbershops;
      updateSummary();
      render();
    } catch (error) {
      if (!authExpired(error)) $('barbershopList').innerHTML = '<div class="owner-empty">Não foi possível carregar a lista. Tente novamente.</div>';
    }
  }

  $('ownerLoginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    await withBusy(button, async () => {
      try {
        const result = await api('/owner/login', { method: 'POST', body: Object.fromEntries(new FormData(event.currentTarget)) });
        Auth.set('owner', result.token);
        event.currentTarget.reset();
        showDashboard();
        await loadBarbershops();
      } catch (error) {
        toast(error.message, 'err');
      }
    });
  });

  $('billingMonth').value = todayISO().slice(0, 7);
  $('billingMonth').addEventListener('change', loadBarbershops);
  $('shopSearch').addEventListener('input', render);
  $('ownerLogout').addEventListener('click', () => {
    Auth.clear('owner');
    barbershops = [];
    showAuth();
  });

  $('barbershopList').addEventListener('submit', async (event) => {
    const form = event.target.closest('[data-charge-form]');
    if (!form) return;
    event.preventDefault();
    const card = form.closest('[data-shop-id]');
    const button = form.querySelector('button[type="submit"]');
    const fields = Object.fromEntries(new FormData(form));
    await withBusy(button, async () => {
      try {
        await api(`/owner/barbershops/${card.dataset.shopId}/charges/${$('billingMonth').value}`, {
          method: 'PUT', body: fields, role: 'owner',
        });
        toast('Cobrança salva.');
        await loadBarbershops();
      } catch (error) { authExpired(error); }
    });
  });

  $('barbershopList').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-toggle-status]');
    if (!button) return;
    const card = button.closest('[data-shop-id]');
    await withBusy(button, async () => {
      try {
        await api(`/owner/barbershops/${card.dataset.shopId}/charges/${$('billingMonth').value}`, {
          method: 'PATCH', body: { status: button.dataset.toggleStatus }, role: 'owner',
        });
        toast(button.dataset.toggleStatus === 'pago' ? 'Pagamento marcado como recebido.' : 'Cobrança reaberta.');
        await loadBarbershops();
      } catch (error) { authExpired(error); }
    });
  });

  if (Auth.get('owner')) {
    showDashboard();
    loadBarbershops();
  } else {
    showAuth();
  }
})();
