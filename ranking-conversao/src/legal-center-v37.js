const BASE='/ranking-site';
const routes=new Set(['legal','terms','privacy','cookies','refunds','awards-rules']);

const sections={
  terms:{
    eyebrow:'TERMOS DE USO',
    title:'Regras claras para competir, analisar e evoluir.',
    summary:'Estes termos descrevem o funcionamento operacional da Global Conversion League e os limites do serviço.',
    blocks:[
      ['1. Produto e escopo','A Global Conversion League oferece inteligência de conversão, auditorias de sites, ranking, Awards, comunidade e um marketplace de soluções. A plataforma não promete receita, taxa de conversão ou posição específica.'],
      ['2. Conta e responsabilidade','Você é responsável pela precisão das informações fornecidas, pela segurança da sua conta e por ter autorização para cadastrar, reivindicar ou conectar os domínios e dados que enviar à plataforma.'],
      ['3. Auditorias e evidência','Resultados dependem das evidências que puderem ser coletadas no momento da análise. Ausência de coleta não é tratada automaticamente como ausência no site. Métricas que exigem fonte first-party permanecem identificadas como não verificáveis ou dependentes de conexão quando essa fonte não existe.'],
      ['4. Ranking e competição','Pagamento pode liberar participação, visibilidade e benefícios de membership, mas não compra pontos nem posição. O ranking oficial considera somente participantes elegíveis e utiliza as regras metodológicas vigentes para score, cobertura e confiança.'],
      ['5. Serviços e reauditoria','Comprar uma implementação no GCL Market não adiciona pontos ao score. Qualquer melhoria só aparece no score quando uma nova auditoria encontra evidência melhor.'],
      ['6. Uso aceitável','Não é permitido abusar de APIs, contornar limites, automatizar spam, publicar conteúdo ilegal, assediar membros, manipular votos, tentar acessar dados de terceiros ou usar a plataforma para atacar sistemas.'],
      ['7. Disponibilidade e evolução','A metodologia, os coletores e os recursos podem evoluir. Mudanças relevantes de score, elegibilidade ou governança devem ser versionadas e comunicadas nas superfícies institucionais do produto.']
    ]
  },
  privacy:{
    eyebrow:'PRIVACIDADE',
    title:'Dados mínimos, finalidade explícita e evidência rastreável.',
    summary:'A GCL separa dados públicos observados, dados de conta e dados first-party conectados pelo próprio usuário.',
    blocks:[
      ['1. O que tratamos','Podemos tratar dados de conta, domínio, compras e memberships; conteúdo publicado na Community; eventos operacionais; evidências públicas coletadas de URLs; e dados de integrações que você conectar de forma explícita.'],
      ['2. Para que usamos','Usamos esses dados para autenticação, execução e histórico de auditorias, ranking e Awards, recursos sociais, billing, prevenção a abuso, suporte, segurança e melhoria do produto.'],
      ['3. Evidência pública x first-party','Sinais observados em URLs públicas permanecem separados de dados privados de analytics, commerce ou experimentação. Integrações first-party devem usar escopos mínimos e revogáveis.'],
      ['4. Compartilhamento operacional','Prestadores de infraestrutura, hospedagem, pagamentos, e-mail e processamento podem receber somente os dados necessários para prestar suas funções. A GCL não deve expor chaves privadas, service-role ou credenciais de usuários no frontend.'],
      ['5. Retenção e controle','Dados devem ser mantidos apenas pelo tempo necessário às finalidades operacionais, de segurança, faturamento e obrigações aplicáveis. Solicitações de acesso, correção, exportação ou exclusão devem ser tratadas pelos canais oficiais da plataforma.'],
      ['6. Segurança','A plataforma aplica autenticação, controle de acesso por linha, segregação de segredos, validação de origem, rate limits, proteção contra SSRF e trilhas idempotentes para eventos financeiros. Nenhum sistema é imune a risco, e incidentes relevantes devem seguir runbook próprio.']
    ]
  },
  cookies:{
    eyebrow:'COOKIES & STORAGE',
    title:'Preferências e sessão sem esconder o que está acontecendo.',
    summary:'A versão atual prioriza armazenamento necessário à sessão e ao funcionamento da experiência.',
    blocks:[
      ['Essenciais','Sessão, autenticação, segurança, preferências de interface e continuidade de jornada podem exigir cookies ou armazenamento local. Sem eles, partes da conta e do checkout podem não funcionar.'],
      ['Medição','Quando analytics ou ferramentas não essenciais forem habilitados pela própria GCL, devem ser identificados e submetidos ao mecanismo de consentimento aplicável antes do uso quando necessário.'],
      ['Integrações do membro','Conectar GA4, Clarity, Search Console, commerce ou ferramentas de experimentação é uma ação distinta do uso básico da plataforma. Esses conectores devem explicar escopo, finalidade e opção de revogação.'],
      ['Controle','Você pode limpar cookies e armazenamento pelo navegador. Isso pode encerrar a sessão ou apagar preferências locais.']
    ]
  },
  refunds:{
    eyebrow:'CANCELAMENTO & REEMBOLSO',
    title:'Cobrança compreensível antes, durante e depois da compra.',
    summary:'Produtos recorrentes e pagamentos únicos têm ciclos diferentes e devem aparecer separadamente no checkout.',
    blocks:[
      ['Assinaturas','Ranking e Community são recorrentes. Um cancelamento confirmado deve impedir novas renovações futuras conforme o ciclo contratado, sem apagar automaticamente o histórico técnico já produzido.'],
      ['Pagamentos únicos','Auditoria completa e inscrição nos Awards são cobranças por evento/temporada. Solicitações de reembolso devem seguir as regras apresentadas no checkout e a legislação aplicável ao consumidor e ao contrato.'],
      ['Falha de pagamento','Estados como past_due, pagamento recusado ou renovação falha não devem ser tratados como compra concluída. O entitlement acompanha o estado financeiro registrado pelo provedor.'],
      ['Como solicitar','Use os canais oficiais exibidos na área da conta para solicitar cancelamento, correção de cobrança ou reembolso. A plataforma deve preservar o identificador da transação para reconciliação e auditoria.']
    ]
  },
  'awards-rules':{
    eyebrow:'GLOBAL CONVERSION AWARDS · REGRAS',
    title:'Prestígio precisa ser conquistado — e verificável.',
    summary:'A inscrição habilita uma candidatura; não garante nomination, posição ou prêmio.',
    blocks:[
      ['1. Elegibilidade','A candidatura exige compra válida da temporada, domínio verificado e auditoria elegível conforme cobertura, confiança e regras publicadas.'],
      ['2. Camadas independentes','Score técnico, voto da Community e avaliação do júri permanecem separados e identificados. Eles não são fundidos em um número opaco.'],
      ['3. Júri','As dimensões de avaliação incluem Conversion Clarity, User Experience, Technical Execution, Trust & Persuasion e Originality. Regras de composição e janela de avaliação podem variar por temporada e devem ser publicadas.'],
      ['4. Votação','Auto-voto é proibido. Tentativas de manipulação, contas coordenadas, automação abusiva ou troca artificial de votos podem invalidar votos e levar a revisão de elegibilidade.'],
      ['5. Badges e Awards','Selos são emitidos somente quando os critérios correspondentes forem satisfeitos. O selo deve apontar para uma página verificável da GCL quando essa superfície estiver disponível.'],
      ['6. Reavaliação','Correções no site não alteram retroativamente a evidência de uma auditoria antiga; uma nova auditoria é necessária para registrar melhoria e eventual mudança de score.']
    ]
  }
};

function nav(){return `<nav class="gcl-legal37-nav" aria-label="Políticas"><a href="${BASE}/terms/">Termos</a><a href="${BASE}/privacy/">Privacidade</a><a href="${BASE}/cookies/">Cookies</a><a href="${BASE}/refunds/">Cancelamento</a><a href="${BASE}/awards-rules/">Awards</a></nav>`}
function page(key){const d=sections[key];return `<main class="gcl-legal37"><header><a class="gcl-legal37-brand" href="${BASE}/"><span>GCL</span><b>GLOBAL CONVERSION LEAGUE</b></a>${nav()}</header><section class="gcl-legal37-hero"><span>${d.eyebrow}</span><h1>${d.title}</h1><p>${d.summary}</p><small>Versão operacional · 10/09/2026 · sujeito a atualização e revisão jurídica</small></section><section class="gcl-legal37-grid">${d.blocks.map(([h,p])=>`<article><h2>${h}</h2><p>${p}</p></article>`).join('')}</section><footer><a href="${BASE}/">Voltar para a liga</a><p>Global Conversion League · políticas operacionais da plataforma.</p></footer></main>`}
function hub(){return `<main class="gcl-legal37"><header><a class="gcl-legal37-brand" href="${BASE}/"><span>GCL</span><b>GLOBAL CONVERSION LEAGUE</b></a>${nav()}</header><section class="gcl-legal37-hero"><span>TRUST CENTER</span><h1>Regras visíveis antes de qualquer competição.</h1><p>Termos, privacidade, cookies, cancelamento e governança dos Global Conversion Awards em um único lugar.</p><small>Versão operacional · 10/09/2026 · sujeito a atualização e revisão jurídica</small></section><section class="gcl-legal37-cards">${Object.entries(sections).map(([k,d])=>`<a href="${BASE}/${k}/"><span>${d.eyebrow}</span><h2>${d.title}</h2><p>${d.summary}</p><b>Abrir política →</b></a>`).join('')}</section><footer><a href="${BASE}/">Voltar para a liga</a><p>Global Conversion League · Trust Center.</p></footer></main>`}

function css(){const s=document.createElement('style');s.id='gcl-legal37-css';s.textContent=`
body.gcl-legal37-open{margin:0;background:#070605;color:#f5f2ed;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.gcl-legal37{min-height:100vh;background:radial-gradient(circle at 70% -10%,rgba(222,35,35,.16),transparent 34%),#070605}.gcl-legal37>header,.gcl-legal37-hero,.gcl-legal37-grid,.gcl-legal37-cards,.gcl-legal37>footer{width:min(1180px,calc(100% - 40px));margin:auto}.gcl-legal37>header{min-height:84px;display:flex;align-items:center;justify-content:space-between;gap:24px;border-bottom:1px solid rgba(255,255,255,.08)}.gcl-legal37-brand{display:flex;align-items:center;gap:11px;color:inherit;text-decoration:none}.gcl-legal37-brand span{display:grid;place-items:center;width:40px;height:40px;border:1px solid rgba(255,75,75,.3);border-radius:14px;background:rgba(213,31,31,.12);font-weight:900;color:#ff4b4b}.gcl-legal37-brand b{font-size:11px;letter-spacing:.18em}.gcl-legal37-nav{display:flex;flex-wrap:wrap;gap:18px}.gcl-legal37-nav a{color:rgba(255,255,255,.56);font-size:12px;text-decoration:none}.gcl-legal37-nav a:hover{color:#fff}.gcl-legal37-hero{padding:96px 0 62px;max-width:940px}.gcl-legal37-hero>span,.gcl-legal37-cards>a>span{font-size:11px;letter-spacing:.22em;color:#ff6666}.gcl-legal37-hero h1{font-size:clamp(42px,7vw,82px);line-height:.98;letter-spacing:-.055em;margin:18px 0 22px;max-width:900px}.gcl-legal37-hero p{max-width:730px;font-size:18px;line-height:1.65;color:rgba(255,255,255,.6)}.gcl-legal37-hero small{display:block;margin-top:24px;color:rgba(255,255,255,.3)}.gcl-legal37-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;padding-bottom:80px}.gcl-legal37-grid article,.gcl-legal37-cards>a{border:1px solid rgba(255,255,255,.08);background:linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,.018));border-radius:24px;padding:28px}.gcl-legal37-grid h2,.gcl-legal37-cards h2{font-size:18px;margin:0 0 12px}.gcl-legal37-grid p,.gcl-legal37-cards p{margin:0;color:rgba(255,255,255,.52);line-height:1.7;font-size:14px}.gcl-legal37-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;padding-bottom:80px}.gcl-legal37-cards>a{text-decoration:none;color:inherit;transition:transform .2s ease,border-color .2s ease}.gcl-legal37-cards>a:hover{transform:translateY(-2px);border-color:rgba(255,75,75,.34)}.gcl-legal37-cards h2{margin-top:12px}.gcl-legal37-cards b{display:block;margin-top:24px;font-size:12px;color:#ff6b6b}.gcl-legal37>footer{display:flex;justify-content:space-between;gap:24px;padding:30px 0 48px;border-top:1px solid rgba(255,255,255,.08);font-size:12px;color:rgba(255,255,255,.35)}.gcl-legal37>footer a{color:#fff;text-decoration:none}@media(max-width:760px){.gcl-legal37>header{align-items:flex-start;flex-direction:column;padding:22px 0}.gcl-legal37-nav{gap:12px}.gcl-legal37-hero{padding:62px 0 42px}.gcl-legal37-grid,.gcl-legal37-cards{grid-template-columns:1fr}.gcl-legal37>footer{flex-direction:column}}@media(prefers-reduced-motion:reduce){.gcl-legal37-cards>a{transition:none}}
`;document.head.appendChild(s)}

function injectFooterLinks(){document.querySelectorAll('.gcl-footer').forEach(f=>{if(f.querySelector('[data-gcl-legal37]'))return;const x=document.createElement('div');x.dataset.gclLegal37='1';x.style.cssText='display:flex;gap:14px;flex-wrap:wrap;margin-top:12px;font-size:12px';x.innerHTML=`<a href="${BASE}/legal/">Trust Center</a><a href="${BASE}/terms/">Termos</a><a href="${BASE}/privacy/">Privacidade</a><a href="${BASE}/refunds/">Cancelamento</a>`;f.appendChild(x)})}

// The router calls this before creating a React root. A policy page owns its
// container for the entire document lifetime; it must never race a 404 commit.
export function renderLegalRoute(route){
  if(!routes.has(route))return false;
  const root=document.getElementById('root');
  if(!root)return false;
  css();
  document.body.classList.add('gcl-legal37-open');
  root.innerHTML=route==='legal'?hub():page(route);
  return true;
}

export function enhanceLegalFooter(){
  const obs=new MutationObserver(injectFooterLinks);obs.observe(document.documentElement,{subtree:true,childList:true});injectFooterLinks();setTimeout(()=>obs.disconnect(),15000);
}
