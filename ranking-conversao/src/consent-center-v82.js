import { setTrackingConsent } from './acquisition-attribution-v81.js';

const CONSENT_KEY = 'gcl_consent_v82';
const CONSENT_EVENT = 'gcl:consent-updated';
const POLICY_VERSION = 'GCL-CONSENT-1.0';

const DEFAULT_CONSENT = Object.freeze({
  necessary: true,
  analytics: false,
  ads: false,
  decided_at: null,
  version: POLICY_VERSION,
});

function normalizeDecision(raw) {
  return {
    necessary: true,
    analytics: raw?.analytics === true,
    ads: raw?.ads === true,
    decided_at: typeof raw?.decided_at === 'string' ? raw.decided_at : null,
    version: POLICY_VERSION,
  };
}

export function getConsentDecision() {
  if (typeof window === 'undefined') return { ...DEFAULT_CONSENT };
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return { ...DEFAULT_CONSENT };
    return normalizeDecision(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_CONSENT };
  }
}

export function hasConsentDecision() {
  if (typeof window === 'undefined') return false;
  try { return Boolean(localStorage.getItem(CONSENT_KEY)); } catch { return false; }
}

export function saveConsentDecision(next) {
  const decision = normalizeDecision({
    ...next,
    decided_at: new Date().toISOString(),
  });
  try { localStorage.setItem(CONSENT_KEY, JSON.stringify(decision)); } catch {}
  setTrackingConsent(decision.ads);
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: decision }));
  return decision;
}

function styleConsentCenter() {
  if (document.getElementById('gcl-consent-v82-css')) return;
  const style = document.createElement('style');
  style.id = 'gcl-consent-v82-css';
  style.textContent = `
#gcl-consent-v82{position:fixed;left:18px;right:18px;bottom:18px;z-index:90000;display:flex;justify-content:center;pointer-events:none;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.gcl-consent82-card{width:min(880px,100%);pointer-events:none;background:rgba(10,10,10,.96);border:1px solid rgba(255,255,255,.13);box-shadow:0 24px 80px rgba(0,0,0,.48);backdrop-filter:blur(18px);border-radius:24px;padding:22px;color:#f6f5f2}
.gcl-consent82-card a,.gcl-consent82-card button,.gcl-consent82-card input,.gcl-consent82-card label{pointer-events:auto}
.gcl-consent82-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px}.gcl-consent82-head strong{display:block;font-size:17px;margin-bottom:7px}.gcl-consent82-head p{margin:0;color:rgba(255,255,255,.62);font-size:13px;line-height:1.55;max-width:650px}.gcl-consent82-links{display:flex;gap:12px;margin-top:12px}.gcl-consent82-links a,.gcl-consent82-manage{color:#ff7777;font-size:12px;text-decoration:none;background:none;border:0;padding:0;cursor:pointer}.gcl-consent82-actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:18px}.gcl-consent82-actions button{border:1px solid rgba(255,255,255,.14);border-radius:999px;padding:10px 14px;background:rgba(255,255,255,.04);color:white;font-weight:700;font-size:12px;cursor:pointer}.gcl-consent82-actions button.primary{background:#f4f0ea;color:#12110f}.gcl-consent82-panel{display:none;margin-top:18px;border-top:1px solid rgba(255,255,255,.08);padding-top:16px;gap:10px}.gcl-consent82-panel.open{display:grid}.gcl-consent82-choice{display:flex;justify-content:space-between;gap:18px;align-items:center;padding:12px 0}.gcl-consent82-choice span{display:grid;gap:4px}.gcl-consent82-choice small{color:rgba(255,255,255,.48);line-height:1.4}.gcl-consent82-choice input{width:20px;height:20px;accent-color:#ef4444}.gcl-consent82-choice input:disabled{opacity:.5}.gcl-consent82-fab{position:fixed;right:18px;bottom:18px;z-index:89999;border:1px solid rgba(255,255,255,.12);background:#111;color:#fff;border-radius:999px;padding:9px 12px;font:700 11px/1 Inter,system-ui;cursor:pointer;box-shadow:0 10px 32px rgba(0,0,0,.35)}
@media(max-width:680px){#gcl-consent-v82{left:10px;right:10px;bottom:10px}.gcl-consent82-card{border-radius:20px;padding:18px}.gcl-consent82-head{display:block}.gcl-consent82-actions button{flex:1 1 46%}.gcl-consent82-fab{right:10px;bottom:10px}}
`;
  document.head.appendChild(style);
}

function ensureManageButton(open) {
  let button = document.getElementById('gcl-consent-v82-manage');
  if (!button) {
    button = document.createElement('button');
    button.id = 'gcl-consent-v82-manage';
    button.className = 'gcl-consent82-fab';
    button.type = 'button';
    button.textContent = 'Privacidade';
    document.body.appendChild(button);
  }
  button.onclick = open;
}

function renderConsentCenter(forceOpen = false) {
  styleConsentCenter();
  const decided = hasConsentDecision();
  if (decided && !forceOpen) {
    ensureManageButton(() => renderConsentCenter(true));
    return;
  }

  document.getElementById('gcl-consent-v82')?.remove();
  document.getElementById('gcl-consent-v82-manage')?.remove();
  const current = getConsentDecision();
  const host = document.createElement('div');
  host.id = 'gcl-consent-v82';
  host.innerHTML = `
    <section class="gcl-consent82-card" role="dialog" aria-modal="false" aria-labelledby="gcl-consent82-title">
      <div class="gcl-consent82-head">
        <div>
          <strong id="gcl-consent82-title">Sua privacidade, sem atalhos.</strong>
          <p>Usamos armazenamento necessário para segurança e funcionamento. Medição first-party e identificadores de anúncios só são ativados com a sua escolha.</p>
          <div class="gcl-consent82-links"><a href="/ranking-site/privacy/">Privacidade</a><a href="/ranking-site/cookies/">Cookies & storage</a></div>
        </div>
        <button class="gcl-consent82-manage" type="button" data-customize>Personalizar</button>
      </div>
      <div class="gcl-consent82-panel" data-panel>
        <label class="gcl-consent82-choice"><span><b>Necessários</b><small>Sessão, segurança e continuidade da experiência.</small></span><input type="checkbox" checked disabled /></label>
        <label class="gcl-consent82-choice"><span><b>Medição first-party</b><small>Ajuda a entender páginas vistas e início do diagnóstico sem carregar plataformas de anúncios.</small></span><input type="checkbox" data-analytics ${current.analytics ? 'checked' : ''} /></label>
        <label class="gcl-consent82-choice"><span><b>Mensuração de anúncios</b><small>Permite associar identificadores de clique ao funil quando existirem.</small></span><input type="checkbox" data-ads ${current.ads ? 'checked' : ''} /></label>
      </div>
      <div class="gcl-consent82-actions">
        <button type="button" data-necessary>Somente necessários</button>
        <button type="button" data-measure>Aceitar medição</button>
        <button type="button" class="primary" data-all>Aceitar todos</button>
        <button type="button" data-save style="display:none">Salvar preferências</button>
      </div>
    </section>`;
  document.body.appendChild(host);

  const close = () => {
    host.remove();
    ensureManageButton(() => renderConsentCenter(true));
  };
  const save = (decision) => { saveConsentDecision(decision); close(); };
  host.querySelector('[data-necessary]').onclick = () => save({ analytics: false, ads: false });
  host.querySelector('[data-measure]').onclick = () => save({ analytics: true, ads: false });
  host.querySelector('[data-all]').onclick = () => save({ analytics: true, ads: true });
  host.querySelector('[data-customize]').onclick = () => {
    host.querySelector('[data-panel]').classList.add('open');
    host.querySelector('[data-save]').style.display = '';
  };
  host.querySelector('[data-save]').onclick = () => save({
    analytics: host.querySelector('[data-analytics]').checked,
    ads: host.querySelector('[data-ads]').checked,
  });
}

export function installConsentCenterV82() {
  if (typeof window === 'undefined' || typeof document === 'undefined' || window.__GCL_CONSENT_V82_INSTALLED__) return;
  const current = getConsentDecision();
  setTrackingConsent(current.ads);
  const start = () => renderConsentCenter(false);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
  window.__GCL_CONSENT_V82_INSTALLED__ = true;
}

export { CONSENT_EVENT };
installConsentCenterV82();
