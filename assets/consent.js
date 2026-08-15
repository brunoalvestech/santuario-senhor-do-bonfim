(() => {
  const STORAGE_KEY = 'bonfimConsentV1';
  const readConsent = () => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); }
    catch { return null; }
  };
  let consent = readConsent();

  const allows = category => Boolean(consent && (consent.all || consent[category]));
  window.bonfimConsentAllows = allows;

  function activateEmbeds() {
    document.querySelectorAll('[data-consent][data-src]').forEach(element => {
      if (!allows(element.dataset.consent)) return;
      element.src = element.dataset.src;
      element.hidden = false;
      element.closest('.video')?.querySelector('.consent-placeholder')?.remove();
    });
  }

  function prepareBlockedEmbeds() {
    document.querySelectorAll('[data-consent][data-src]').forEach(element => {
      const category = element.dataset.consent;
      if (allows(category) || element.closest('.video')?.querySelector('.consent-placeholder')) return;
      element.hidden = true;
      const placeholder = document.createElement('div');
      placeholder.className = 'consent-placeholder';
      const isMedia = category === 'media';
      placeholder.innerHTML = `<strong>${isMedia ? 'Vídeo externo bloqueado' : 'Mapa externo bloqueado'}</strong><p>${isMedia ? 'Autorize a mídia externa para assistir à transmissão do YouTube.' : 'Autorize as funcionalidades externas para visualizar o Google Maps.'}</p><button class="cookie-btn cookie-btn-primary" type="button" data-enable-consent="${category}">Autorizar e carregar</button>`;
      element.after(placeholder);
    });
  }

  function save(next) {
    consent = { necessary: true, media: false, functional: false, ...next, updatedAt: new Date().toISOString() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
    activateEmbeds();
    document.querySelector('.cookie-banner')?.classList.remove('is-visible');
    const preferences = document.querySelector('.cookie-preferences');
    if (preferences) { preferences.hidden = true; preferences.classList.remove('is-open'); }
  }

  const banner = document.createElement('section');
  banner.className = 'cookie-banner';
  banner.setAttribute('aria-label', 'Preferências de privacidade');
  banner.innerHTML = '<div class="cookie-banner-inner"><div class="cookie-copy"><strong>Sua privacidade é importante</strong><p>Usamos armazenamento essencial para o funcionamento do portal. Com sua autorização, também carregamos vídeos do YouTube e o mapa do Google.</p></div><div class="cookie-actions"><button class="cookie-btn cookie-btn-secondary" type="button" data-cookie-reject>Recusar opcionais</button><button class="cookie-btn cookie-btn-secondary" type="button" data-cookie-manage>Gerenciar</button><button class="cookie-btn cookie-btn-primary" type="button" data-cookie-accept>Aceitar todos</button></div></div>';

  const modal = document.createElement('div');
  modal.className = 'cookie-preferences';
  modal.hidden = true;
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'cookiePreferencesTitle');
  modal.innerHTML = '<form class="cookie-modal"><div class="cookie-modal-head"><div><span class="cookie-eyebrow">Privacidade e LGPD</span><h2 id="cookiePreferencesTitle">Gerenciar preferências</h2></div><button class="cookie-close" type="button" data-cookie-close aria-label="Fechar preferências">×</button></div><p>Escolha quais recursos externos podem ser carregados. Você pode alterar esta decisão quando desejar.</p><div class="cookie-option"><div><strong>Necessários</strong><span>Preferências de acessibilidade, segurança e funcionamento do portal.</span></div><span class="cookie-required">Sempre ativos</span></div><label class="cookie-option"><div><strong>Mídia externa</strong><span>Permite exibir as transmissões oficiais hospedadas no YouTube.</span></div><input type="checkbox" name="media"></label><label class="cookie-option"><div><strong>Funcionalidades externas</strong><span>Permite exibir o mapa incorporado do Google Maps.</span></div><input type="checkbox" name="functional"></label><div class="cookie-modal-actions"><button class="cookie-btn cookie-btn-secondary" type="button" data-cookie-modal-reject>Recusar opcionais</button><button class="cookie-btn cookie-btn-primary" type="button" data-cookie-save>Salvar preferências</button></div></form>';

  document.body.append(banner, modal);

  function openPreferences() {
    const form = modal.querySelector('form');
    form.elements.media.checked = allows('media');
    form.elements.functional.checked = allows('functional');
    modal.hidden = false;
    modal.classList.add('is-open');
    modal.querySelector('[data-cookie-close]').focus();
  }

  banner.querySelector('[data-cookie-accept]').addEventListener('click', () => save({ all: true, media: true, functional: true }));
  banner.querySelector('[data-cookie-reject]').addEventListener('click', () => save({ all: false, media: false, functional: false }));
  banner.querySelector('[data-cookie-manage]').addEventListener('click', openPreferences);
  modal.querySelector('[data-cookie-modal-reject]').addEventListener('click', () => save({ all: false, media: false, functional: false }));
  modal.querySelector('[data-cookie-close]').addEventListener('click', () => { modal.hidden = true; modal.classList.remove('is-open'); });
  modal.querySelector('[data-cookie-save]').addEventListener('click', () => { const form = modal.querySelector('form'); save({ all: false, media: form.elements.media.checked, functional: form.elements.functional.checked }); });

  document.addEventListener('click', event => {
    if (event.target.closest('[data-cookie-settings]')) openPreferences();
    const enable = event.target.closest('[data-enable-consent]');
    if (enable) {
      const category = enable.dataset.enableConsent;
      save({ all: false, media: allows('media') || category === 'media', functional: allows('functional') || category === 'functional' });
    }
  });

  document.querySelectorAll('.footer .fine').forEach(fine => {
    if (fine.querySelector('[data-cookie-settings]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cookie-settings-link';
    button.dataset.cookieSettings = '';
    button.textContent = 'Preferências de cookies';
    const credit = fine.querySelector('.developer-credit');
    credit ? credit.before(button) : fine.append(button);
  });

  prepareBlockedEmbeds();
  if (!consent) requestAnimationFrame(() => banner.classList.add('is-visible'));
  activateEmbeds();
})();
