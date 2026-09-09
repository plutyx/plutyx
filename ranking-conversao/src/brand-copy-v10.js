const MEMBER='https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/gcl-member-api';
const SESSION_KEY='gcl_session_v1';

const COPY=new Map([
  ['O produto usa status, comparação, progresso, pertencimento e ambição comercial sem falsificar escassez ou resultado.','Meça, compare e acompanhe a evolução do seu site ao longo da temporada.'],
  ['A camada humana cria pertencimento e reputação sem contaminar a nota técnica.','Troque experiências, acompanhe casos reais e construa conexões com empresas e profissionais da liga.'],
  ['Reconhecimento que precisa ser conquistado','Global Conversion Awards 2026'],
  ['A análise é a porta de entrada. Ranking, Comunidade e Awards são produtos diferentes porque entregam valores diferentes.','Escolha como sua empresa quer participar da Global Conversion League em 2026.'],
  ['Não é um concurso de site bonito. É uma competição por maturidade de conversão.','O padrão por trás dos sites que lideram a experiência digital.'],
  ['O motor observa sinais técnicos que qualquer crawler pode provar e separa aquilo que exige telemetria real. A camada metodológica agrega performance, UX, acessibilidade, SEO, segurança, confiança, estrutura de oferta, copy, fricção, comportamento, dados e experimentação.','Compare desempenho, experiência, clareza, confiança, descoberta e arquitetura comercial em uma visão única do seu site.'],
  ['A Global Conversion League usa competição como interface, mas a metodologia precisa continuar auditável, versionada e conservadora.','Benchmarks, pesquisas e inteligência aplicada para acompanhar a evolução dos sites que competem na Global Conversion League.'],
  ['Uma temporada inteira para conquistar reconhecimento','Global Conversion Awards 2026'],
  ['A assinatura compra presença; a posição continua determinada pela evidência do SAC.','Acompanhe os participantes oficiais, suas posições e a evolução ao longo da temporada.'],
  ['O ranking oficial começa vazio por design: benchmark não é participante. O primeiro site pagante e elegível inaugura o placar.','A Founding Season 2026 está recebendo seus primeiros participantes.'],
  ['O sistema premia contribuição útil e melhoria comprovada — não volume de posts.','Compartilhe resultados, peça feedback e acompanhe o que outros membros estão melhorando.'],
  ['O marketplace não compra pontos. Cada solução ataca critérios específicos e a reauditoria decide se houve melhoria.','Serviços, implementações e ferramentas recomendadas a partir das necessidades do seu site.'],
  ['Posição é conquistada. Compra não altera score. Dados observados, estimados e first-party permanecem identificados separadamente.','Global Conversion League · Ranking · Awards · Community · Labs · Market'],
  ['Posição é conquistada. Compra não altera score.','© 2026 Global Conversion League · Plutyx'],
  ['A posição não é comprada. A assinatura mantém o perfil no ecossistema; o lugar no placar depende da evidência técnica e da cobertura do scan.','Compare sua empresa com os participantes da temporada e acompanhe cada nova posição conquistada.'],
  ['ranking por evidência, não por popularidade','ranking global atualizado por auditorias'],
  ['POR QUE ESTE RANKING EXISTE','CONVERSION INTELLIGENCE'],
  ['ENTRE NO JOGO','PARTICIPE DA GCL'],
  ['AQUI ESTÁ O PRINCIPAL NEGÓCIO','GCL PERFORMANCE MARKET'],
  ['Depois do diagnóstico, o SAC reorganiza soluções pelas lacunas do seu site. Cada projeto mostra os critérios que pode resolver; pontos só entram depois da reauditoria.','Encontre serviços e implementações priorizados para os pontos de melhoria identificados no seu site.'],
  ['JORNADA COMPLETA','SUA JORNADA NA GCL'],
  ['Curiosidade → competição → evolução','Do primeiro diagnóstico à evolução contínua'],
  ['A inscrição coloca o site na temporada; não garante prêmio. Awards são emitidos por score, cobertura, ranking e critérios específicos.','Inscreva seu site na Founding Season 2026 e acompanhe nominees, categorias e vencedores ao longo da temporada.'],
  ['A inscrição habilita o site para a temporada; não garante prêmio. Score, cobertura, posição e regras específicas continuam decidindo os vencedores.','Conheça os sites participantes, nominees e vencedores da Founding Season 2026.'],
  ['O score técnico não é concurso de popularidade.','Community Choice'],
  ['A comunidade avalia Design, Usabilidade, Criatividade e Conteúdo em uma camada separada. Opinião humana enriquece o perfil — mas nunca altera silenciosamente a evidência técnica.','Descubra os sites favoritos da comunidade em Design, Usabilidade, Criatividade e Conteúdo.'],
  ['O instituto de pesquisa por trás da competição','GCL Labs · Conversion Intelligence'],
  ['Observed ≠ Estimated','Conversion Benchmark'],
  ['O que o crawler mede é separado de estimativas competitivas e de dados first-party.','Benchmarks comparativos para acompanhar desempenho e evolução entre sites e categorias.'],
  ['Score ≠ Conversion Rate','Experience Intelligence'],
  ['O score mede prontidão e maturidade observável. Conversão real exige dados do negócio.','UX, acessibilidade, clareza, confiança e experiência comercial reunidas em uma leitura comparável.'],
  ['Metodologia versionada','Search & AI Visibility'],
  ['Mudanças de critérios, thresholds e fontes ficam identificadas para preservar comparabilidade.','SEO técnico, dados estruturados, rastreabilidade e acesso por mecanismos de busca e agentes de IA.'],
  ['Competition without pay-to-win','Performance Signals'],
  ['Pagamento libera participação, visibilidade e serviços. Nunca compra posição ou Award.','Velocidade, estabilidade, Core Web Vitals, frontend, rede e infraestrutura observados em cada auditoria.'],
  ['Arquitetura da instituição','Ecossistema Global Conversion League'],
  ['marca guarda-chuva e competição contínua','ranking global e temporada competitiva'],
  ['programa anual de reconhecimento','premiação anual da Global Conversion League'],
  ['implementação, networking e evolução dos membros','comunidade privada, Hot Seats, projetos e networking'],
  ['benchmark, metodologia e pesquisa','benchmarks, estudos e inteligência de mercado'],
  ['execução das melhorias ligadas aos gaps','serviços e implementações para evolução do site'],
  ['A inscrição no Awards não garante prêmio. A assinatura do Ranking não compra posição. Serviços não compram pontos: qualquer mudança de score precisa ser comprovada por uma nova auditoria.','Consulte os detalhes de cada modalidade e participe da Founding Season 2026.'],
  ['Potencial de pontos só é calculado por simulação e confirmado após reauditoria.','Veja o potencial de evolução relacionado a esta solução.'],
  ['Pontuação só muda após nova auditoria','Acompanhe o impacto após a próxima auditoria'],
  ['PRODUCTION ONBOARDING','MINHA OPERAÇÃO'],
  ['seguro por evidência','GCL MEMBER'],
  ['Pagamento não prova propriedade. Ranking e Awards exigem uma prova externa antes de tornar o site participante.','Verifique o domínio para habilitar os recursos vinculados ao seu site.'],
  ['Checkout real permanece bloqueado até a ativação Stripe live.','Pagamento online temporariamente indisponível para novas inscrições.'],
  ['Checkout sandbox validado, mas oculto de leads reais. Conecte Stripe live para abrir cobrança real.','Pagamento online temporariamente indisponível para novas inscrições. Sua conta e domínio já estão preparados.'],
  ['Infraestrutura pronta para abertura.','Inscrições online em abertura'],
  ['O checkout real será habilitado somente quando a conta Stripe live estiver conectada. Nenhum cartão real é cobrado nesta fase.','Crie sua conta para deixar o site preparado e acompanhar a abertura das próximas inscrições.'],
  ['Criar minha conta e acompanhar a abertura →','Entrar na Global Conversion League →'],
  ['Pagamentos em homologação','Solicitar análise'],
]);

let scheduled=false;
function replaceTextNodes(){
  if(!document.body)return;
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  const nodes=[];let node;while((node=walker.nextNode()))nodes.push(node);
  for(const n of nodes){let v=n.nodeValue||'';let next=v;for(const [from,to] of COPY)if(next.includes(from))next=next.split(from).join(to);if(next!==v)n.nodeValue=next;}
}
function setText(selector,value){const e=document.querySelector(selector);if(e&&e.textContent!==value)e.textContent=value;}
function patchHome(){
  if(!location.pathname.match(/^\/ranking-site\/?$/))return;
  setText('.s4-origin > div:first-child > span','CONVERSION INTELLIGENCE');
  setText('.s4-origin > div:first-child > h2','O padrão por trás dos sites que lideram a experiência digital.');
  setText('.s4-origin > div:first-child > p','Compare desempenho, experiência, clareza, confiança, descoberta e arquitetura comercial em uma visão única do seu site.');
  const community=document.querySelector('.s4-community > div:first-child p');if(community)community.textContent='Hot Seats, benchmarks, projetos, casos, missões e conexões com empresas e profissionais focados em elevar a performance de seus sites.';
  const complete=document.querySelector('.s4-complete');if(complete){const small=complete.querySelector('small');if(small)small.textContent='Raio-X SAC + Awards 2026 + Ranking + Community em uma única experiência.';const btn=complete.querySelector('button');if(btn){btn.disabled=false;btn.dataset.gclPlan='sac_complete_bundle_2026';btn.textContent='Escolher Complete Pass';btn.onclick=()=>location.href='/ranking-site/account/?plan=sac_complete_bundle_2026';}}
  const pricingNote=document.querySelector('.s4-pricing-note');if(pricingNote)pricingNote.textContent='Escolha a modalidade ideal para o seu site e acompanhe tudo pela sua área GCL.';
  document.querySelectorAll('.s4-point-rule,.gcl-score-rule').forEach(e=>e.textContent='Recomendado para os pontos de melhoria identificados neste diagnóstico.');
}
function patchRoute(){
  const path=location.pathname;
  if(path.match(/\/ranking-site\/ranking\/?$/)){
    setText('.gcl-page-head h1','Ranking Global de Conversão');
    setText('.gcl-page-head p','Acompanhe os sites participantes da Founding Season 2026 e compare score, posição, cobertura e evolução.');
  }
  if(path.match(/\/ranking-site\/awards\/?$/)){
    setText('.gcl-page-head h1','Global Conversion Awards 2026');
    setText('.gcl-page-head p','Conheça os nominees, categorias e destaques da Founding Season 2026.');
  }
  if(path.match(/\/ranking-site\/community\/?$/)){
    const p=document.querySelector('.gcl-page-head p');if(p&&(p.textContent||'').includes('premia contribuição'))p.textContent='Hot Seats, feedback, projetos, benchmarks, casos e networking para evoluir ao lado de outros membros da liga.';
  }
  if(path.match(/\/ranking-site\/(services|market)\/?$/)){
    setText('.gcl-page-head h1','Soluções para elevar a performance do seu site');
    setText('.gcl-page-head p','Serviços, implementações e ferramentas recomendadas a partir das necessidades identificadas no seu diagnóstico.');
    document.querySelectorAll('.gcl-score-rule').forEach(e=>e.textContent='Compatível com os pontos de melhoria deste diagnóstico.');
  }
  if(path.match(/\/ranking-site\/(about|labs)\/?$/)){
    setText('.gcl-page-head h1','GCL Labs · Conversion Intelligence');
    setText('.gcl-page-head p','Benchmarks, pesquisas e inteligência aplicada para acompanhar a evolução dos sites que competem na Global Conversion League.');
  }
  if(path.match(/\/ranking-site\/(account|dashboard)\/?$/)){
    const plan=new URLSearchParams(location.search).get('plan');
    if(plan==='sac_complete_bundle_2026'){
      const h=document.querySelector('.gcl-prod-plan h3');if(h)h.textContent='Complete Pass 2026';
      const msg=document.querySelector('#gcl-plan-msg');if(msg&&!(msg.textContent||'').includes('Verifique'))msg.textContent='Selecione um domínio verificado para continuar com o Complete Pass.';
    }
  }
}
function apply(){scheduled=false;replaceTextNodes();patchHome();patchRoute();}
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(apply);}

function session(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch{return null}}
async function member(body){const s=session();if(!s?.access_token)throw new Error('authentication_required');const r=await fetch(MEMBER,{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${s.access_token}`},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);return d.result??d}

document.addEventListener('click',async e=>{
  const btn=e.target.closest?.('#gcl-plan-action');if(!btn)return;
  const plan=new URLSearchParams(location.search).get('plan');if(plan!=='sac_complete_bundle_2026')return;
  e.preventDefault();e.stopImmediatePropagation();
  const msg=document.querySelector('#gcl-plan-msg');btn.disabled=true;
  try{
    const dash=await member({action:'dashboard'});const domain=(dash?.domains||[]).find(d=>d.verified);
    if(!domain){if(msg)msg.textContent='Verifique um domínio para continuar.';document.querySelector('#gcl-begin-claim')?.click();return;}
    const co=await member({action:'checkout',product_code:plan,domain_id:domain.id});
    if(co.provider_environment==='test'){if(msg)msg.textContent='Pagamento online temporariamente indisponível para novas inscrições. Sua conta e domínio já estão preparados.';return;}
    if(co.url){location.href=co.url;return;}
    if(msg)msg.textContent='Pagamento online indisponível no momento.';
  }catch(err){if(msg)msg.textContent=err.message==='checkout_unavailable'?'Pagamento online indisponível no momento.':`Não foi possível continuar: ${err.message}`;}
  finally{btn.disabled=false;}
},true);

const obs=new MutationObserver(schedule);obs.observe(document.documentElement,{childList:true,subtree:true,characterData:true});schedule();
