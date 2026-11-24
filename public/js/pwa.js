(() => {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js').catch((error) => {
        console.warn('Não foi possível preparar o modo aplicativo:', error);
      });
    }, { once: true });
  }

  if (standalone) return;

  let installPrompt = null;
  const style = document.createElement('style');
  style.textContent = `
    .pwa-install{position:fixed;right:1rem;bottom:calc(5.4rem + env(safe-area-inset-bottom,0px));z-index:70;display:flex;align-items:center;gap:.55rem;min-height:46px;padding:.65rem 1rem;border:1px solid rgba(255,255,255,.12);border-radius:999px;background:#91b9a6;color:#10201b;box-shadow:0 12px 35px rgba(0,0,0,.32);font:700 .9rem/1 system-ui,sans-serif;cursor:pointer;transition:transform .2s,box-shadow .2s}
    .pwa-install:hover{transform:translateY(-2px);box-shadow:0 16px 38px rgba(0,0,0,.38)}
    .pwa-install svg{width:18px;height:18px;flex:none}
    .pwa-help-backdrop{position:fixed;inset:0;z-index:100;display:grid;place-items:center;padding:1.2rem;background:rgba(4,9,10,.72);backdrop-filter:blur(8px)}
    .pwa-help-backdrop[hidden]{display:none}
    .pwa-help{width:min(420px,100%);padding:1.5rem;border:1px solid #344245;border-radius:24px;background:#172124;color:#d7dfdc;font:400 1rem/1.55 system-ui,sans-serif;box-shadow:0 28px 90px rgba(0,0,0,.45)}
    .pwa-help h2{margin:0 2rem .55rem 0;color:#f4f3ed;font-size:1.3rem;line-height:1.2}
    .pwa-help p{margin:.65rem 0;color:#a9b7b1}
    .pwa-help ol{display:grid;gap:.55rem;margin:1rem 0 1.25rem;padding-left:1.35rem}
    .pwa-help li{padding-left:.15rem}
    .pwa-help-close{float:right;width:36px;height:36px;border:1px solid #344245;border-radius:50%;background:transparent;color:#f4f3ed;font-size:1.2rem;cursor:pointer}
    .pwa-help-ok{width:100%;min-height:46px;border:0;border-radius:999px;background:#91b9a6;color:#10201b;font:700 .95rem system-ui,sans-serif;cursor:pointer}
    @media(min-width:900px){.pwa-install{bottom:1.2rem}}
    @media(prefers-reduced-motion:reduce){.pwa-install{transition:none}}
  `;
  document.head.appendChild(style);

  const button = document.createElement('button');
  button.className = 'pwa-install';
  button.type = 'button';
  button.setAttribute('aria-label', 'Instalar Clube da Navalha como aplicativo');
  button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/></svg><span>Instalar app</span>';

  const backdrop = document.createElement('div');
  backdrop.className = 'pwa-help-backdrop';
  backdrop.hidden = true;
  backdrop.innerHTML = '<section class="pwa-help" role="dialog" aria-modal="true" aria-labelledby="pwaHelpTitle"><button class="pwa-help-close" type="button" aria-label="Fechar">×</button><h2 id="pwaHelpTitle">Leve o Clube da Navalha para a tela inicial</h2><p id="pwaHelpIntro">Depois de adicionar, o app abre em uma janela própria, sem a barra do navegador.</p><ol id="pwaHelpSteps"></ol><button class="pwa-help-ok" type="button">Entendi</button></section>';

  const closeHelp = () => { backdrop.hidden = true; };
  const showHelp = () => {
    const ios = /iPad|iPhone|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const steps = backdrop.querySelector('#pwaHelpSteps');
    steps.innerHTML = ios
      ? '<li>Abra esta página no Safari.</li><li>Toque em <strong>Compartilhar</strong>.</li><li>Escolha <strong>Adicionar à Tela de Início</strong> e confirme.</li>'
      : '<li>Abra o menu do navegador (⋮).</li><li>Toque em <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.</li><li>Confirme a instalação. O ícone abrirá o app em tela própria.</li>';
    backdrop.hidden = false;
    backdrop.querySelector('.pwa-help-close').focus();
  };

  button.addEventListener('click', async () => {
    if (!installPrompt) return showHelp();
    installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    installPrompt = null;
    if (choice.outcome === 'accepted') button.remove();
  });
  backdrop.addEventListener('click', (event) => { if (event.target === backdrop) closeHelp(); });
  backdrop.querySelector('.pwa-help-close').addEventListener('click', closeHelp);
  backdrop.querySelector('.pwa-help-ok').addEventListener('click', closeHelp);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeHelp(); });
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
  });
  window.addEventListener('appinstalled', () => button.remove());

  document.body.append(button, backdrop);
})();
