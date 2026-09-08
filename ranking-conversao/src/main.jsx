import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Accessibility, Activity, ArrowDown, ArrowRight, Award, BadgeCheck, BarChart3,
  BookOpen, Boxes, BrainCircuit, Building2, Check, ChevronDown, CircleAlert,
  CircleCheck, Clock3, Code2, Community, Crown, Database, Eye, FileDown, Gauge,
  Globe2, Image, Layers3, LineChart, Link2, LockKeyhole, Medal, Menu, MessageCircle,
  MonitorSmartphone, MousePointerClick, Network, Radar, Search, ShieldCheck,
  ShoppingBag, Sparkles, Target, Trophy, Users, Video, WandSparkles, X, Zap
} from 'lucide-react';
import './styles.css';

const FUNCTION_URL = 'https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/sac-public-api';
const PUBLIC_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wZ2hldXpwbmt3dHhvcHN3cHF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgzNDk5NDYsImV4cCI6MjEwMzkyNTk0Nn0.MpohChGR95Ymi6sbMED_sWBot9jNLm_kW-Rz_PJ6mMA';

async function api(action, payload = {}) {
  const response = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: PUBLIC_KEY,
      Authorization: `Bearer ${PUBLIC_KEY}`,
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error || 'request_failed');
    error.status = response.status;
    throw error;
  }
  return body;
}

const severityRank = { critical: 0, important: 1, warning: 2, opportunity: 3, info: 4 };

function technicalIndex(findings = []) {
  let possible = 0;
  let earned = 0;
  for (const item of findings) {
    const points = Number(item.points_available || 0);
    if (!points || ['not_verifiable', 'not_applicable'].includes(item.status)) continue;
    possible += points;
    earned += points * (item.status === 'pass' ? 1 : item.status === 'warning' ? 0.52 : 0);
  }
  return possible ? Math.round((earned / possible) * 100) : null;
}

function humanError(code) {
  const errors = {
    invalid_url: 'Digite um domínio ou URL válido.',
    daily_preview_limit: 'O limite de previews deste dispositivo foi atingido hoje.',
    scanner_busy: 'A fila está cheia neste instante. Tente novamente em alguns minutos.',
    origin_not_allowed: 'Este ambiente ainda não estava autorizado pela API. A configuração foi corrigida; recarregue a página.',
    request_failed: 'Não foi possível iniciar a análise.',
    internal_error: 'A API encontrou um erro interno. A ocorrência foi registrada.',
  };
  return errors[code] || 'Não foi possível iniciar a análise. Tente novamente.';
}

function serviceForFinding(finding) {
  const code = finding.criterion_code || '';
  if (code.includes('TRK')) return { key: 'tracking', title: 'Tracking & Dados', icon: Radar, promise: 'Acenda as câmeras da sua operação.' };
  if (code.includes('SEO') || code.includes('SCH')) return { key: 'seo', title: 'SEO & Conteúdo', icon: Search, promise: 'Coloque a loja no mapa e organize o conteúdo.' };
  if (code.includes('MOB') || code.includes('A11Y') || code.includes('REN')) return { key: 'cro', title: 'Experiência & CRO', icon: MousePointerClick, promise: 'Remova atrito antes do clique.' };
  if (code.includes('STR') || code.includes('HTTP')) return { key: 'trust', title: 'Confiança & Segurança', icon: ShieldCheck, promise: 'Reforce a fundação e os sinais de confiança.' };
  return { key: 'conversion', title: 'Arquitetura de Conversão', icon: Target, promise: 'Organize a vitrine e o caminho até a ação.' };
}

function Metric({ label, value, suffix = '', hint }) {
  return <div className="rounded-2xl border border-white/8 bg-black/15 p-4">
    <div className="text-[10px] uppercase tracking-[.18em] text-white/36">{label}</div>
    <div className="mt-2 text-xl font-semibold text-white">{value ?? '—'}{value != null && suffix}</div>
    {hint && <div className="mt-1 text-[11px] text-white/28">{hint}</div>}
  </div>;
}

function StatusDot({ ok }) {
  return <span className={`inline-block size-2 rounded-full ${ok ? 'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,.8)]' : 'bg-white/25'}`} />;
}

function Pill({ children, tone = 'default' }) {
  const tones = {
    default: 'border-white/8 bg-white/[.035] text-white/52',
    green: 'border-emerald-300/16 bg-emerald-300/[.06] text-emerald-100/72',
    amber: 'border-amber-300/16 bg-amber-300/[.06] text-amber-100/72',
    violet: 'border-violet-300/16 bg-violet-300/[.06] text-violet-100/72',
  };
  return <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs ${tones[tone]}`}>{children}</span>;
}

function LogoMark() {
  return <div className="flex items-center gap-3">
    <div className="relative grid size-10 place-items-center rounded-[14px] border border-emerald-300/20 bg-emerald-300/[.08] text-emerald-300">
      <Gauge size={19}/><span className="absolute -right-1 -top-1 size-2 rounded-full bg-lime-300 shadow-[0_0_12px_rgba(190,242,100,.8)]" />
    </div>
    <div><div className="text-xs font-semibold tracking-[.2em] text-white">SITES DE ALTA CONVERSÃO</div><div className="mt-0.5 text-[9px] uppercase tracking-[.22em] text-white/30">by Plutyx · índice em calibração</div></div>
  </div>;
}

function BenchmarkProof({ snapshot }) {
  const b = snapshot?.benchmark || {};
  const processed = Number(b.audited_count || 0);
  const valid = Number(b.successful_count || 0);
  const target = Number(b.target_count || 10000);
  return <div className="proof-card relative overflow-hidden rounded-[34px] border border-white/9 p-6 md:p-7">
    <div className="absolute -right-16 -top-20 size-56 rounded-full bg-emerald-300/8 blur-3xl"/>
    <div className="relative">
      <div className="flex items-center justify-between gap-5">
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[.2em] text-emerald-200/62"><Database size={13}/> Benchmark independente</div>
          <div className="mt-3 text-4xl font-semibold tracking-[-.045em]">{processed.toLocaleString('pt-BR')}</div>
          <div className="mt-1 text-sm text-white/40">domínios processados</div>
        </div>
        <div className="relative grid size-20 place-items-center rounded-full border border-white/8 bg-black/15">
          <div className="absolute inset-2 rounded-full border border-dashed border-emerald-300/25 animate-[spin_14s_linear_infinite]"/>
          <BarChart3 size={25} className="text-emerald-300"/>
        </div>
      </div>
      <div className="mt-7 grid grid-cols-2 gap-3">
        <Metric label="Análises válidas" value={valid.toLocaleString('pt-BR')} hint="base atual de calibração"/>
        <Metric label="Alvo inicial" value={target.toLocaleString('pt-BR')} hint="claim só ativa quando validado"/>
      </div>
      <div className="mt-5 rounded-2xl border border-white/7 bg-black/15 p-4 text-xs leading-5 text-white/42">
        Processar um domínio não é o mesmo que obter uma auditoria válida. Sites que bloqueiam robôs, falham ou não entregam HTML são separados da amostra — não viram nota zero e não inflam o número.
      </div>
    </div>
  </div>;
}

const analysisLayers = [
  [Code2, 'Estrutura & código', 'HTML, DOM renderizado, redirects, headers, canonicals, sitemap e scripts.'],
  [Gauge, 'Performance', 'Navegação, Core Web Vitals/lab, recursos, peso e gargalos técnicos.'],
  [Search, 'SEO & descoberta', 'Titles, headings, indexabilidade, schema, links, blog e arquitetura.'],
  [Eye, 'UX & design', 'Hierarquia, clareza, densidade, layout, CTA, responsividade e atrito visual.'],
  [BrainCircuit, 'Copy & oferta', 'Headline, promessa, benefícios, objeções, prova, preço e mecanismo.'],
  [Image, 'Imagens & ícones', 'ALT, formato, peso, repetição, relevância, qualidade e função visual.'],
  [Video, 'Vídeo', 'Embed, poster, captions, transcript disponível, contexto, schema e impacto.'],
  [Accessibility, 'Acessibilidade', 'axe-core, WCAG automatizável, labels, contraste, roles e foco.'],
  [Radar, 'Tracking', 'GA4, GTM, pixels, eventos detectáveis, consentimento e sinais de mensuração.'],
  [ShieldCheck, 'Confiança & segurança', 'HTTPS, headers, privacidade, políticas, prova e transparência.'],
  [Network, 'Funil & integrações', 'Forms, WhatsApp, checkout, thank-you, CRM e automações observáveis.'],
  [BookOpen, 'Conteúdo & autoridade', 'Blog, topical clusters, autoria, atualidade, fontes e interlinking.'],
];

const storeMetaphors = [
  [Building2, 'Terreno & fundação', 'Domínio, hospedagem, performance e segurança.', 'A estrutura que sustenta tudo.'],
  [ShoppingBag, 'Vitrine & balcão', 'Landing page, oferta, copy, CTA e experiência.', 'O visitante entende o que você vende?'],
  [Radar, 'Câmeras & detetive', 'Pixel, GTM, analytics e eventos.', 'Você enxerga o que acontece depois do clique?'],
  [Globe2, 'Mapa da cidade', 'SEO, indexação, schema e arquitetura.', 'O Google e outros sistemas conseguem encontrar você?'],
  [BookOpen, 'Livro de dúvidas', 'Conteúdo, blog, respostas e autoridade.', 'Seu site educa antes de vender?'],
  [Boxes, 'Caderno & telefone sem fio', 'CRM, APIs e automações.', 'Os leads chegam ao lugar certo sem se perder?'],
];

const flowSteps = [
  ['01', 'Prévia automática', 'Cole a URL. O sistema coleta sinais públicos reais sem questionário.', 'Agora'],
  ['02', 'Full Scan completo', 'Auditoria paga, análise profunda de páginas e PDF com evidências, score e melhorias.', 'Pagamento único'],
  ['03', 'Posição simulada', 'Seu resultado é comparado com o ranking atual antes de você decidir participar.', 'Pós-auditoria'],
  ['04', 'Ranking + comunidade', 'Assinatura ativa posição pública, histórico, awards, desafios e comunidade de empreendedores.', 'Mensal'],
  ['05', 'Evolução & serviços', 'A plataforma mostra lacunas. Você aprende, corrige sozinho ou contrata implementação.', 'Opcional'],
];

function DashboardPreview({ snapshot }) {
  const official = snapshot?.official_score_live === true;
  const ranking = snapshot?.ranking_live === true;
  return <div className="dashboard-mock overflow-hidden rounded-[34px] border border-white/10">
    <div className="flex items-center justify-between border-b border-white/7 bg-black/18 px-5 py-4">
      <div className="flex items-center gap-2"><span className="size-2 rounded-full bg-red-400/70"/><span className="size-2 rounded-full bg-amber-300/70"/><span className="size-2 rounded-full bg-emerald-300/70"/></div>
      <div className="text-[10px] uppercase tracking-[.2em] text-white/28">Dashboard · visual do produto</div>
      <div className="w-10"/>
    </div>
    <div className="grid gap-4 p-5 md:p-6 lg:grid-cols-[.9fr_1.1fr]">
      <div className="rounded-[28px] border border-white/8 bg-black/18 p-5">
        <div className="text-[10px] uppercase tracking-[.2em] text-white/34">SAC Score</div>
        <div className="mt-5 flex items-end gap-3"><div className="text-7xl font-semibold tracking-[-.07em]">—</div><div className="pb-2 text-sm text-white/32">/ 1.000</div></div>
        <div className="mt-4 flex items-center gap-2 text-xs text-amber-100/62"><LockKeyhole size={14}/>{official ? 'Score oficial ativo' : 'Score oficial em calibração'}</div>
        <div className="mt-7 grid grid-cols-2 gap-3"><Metric label="Ranking Brasil" value={ranking ? 'ativo' : '—'}/><Metric label="Liga" value="—"/></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          ['Performance', 'laboratório + campo quando disponível', 78],
          ['SEO', 'estrutura + descoberta', 72],
          ['Conversão', 'copy + oferta + CTA', 66],
          ['Tracking', 'mensuração detectável', 54],
        ].map(([name, desc, width]) => <div key={name} className="rounded-[24px] border border-white/7 bg-white/[.025] p-4">
          <div className="flex items-center justify-between"><span className="text-sm font-medium text-white/72">{name}</span><span className="text-[10px] uppercase tracking-wider text-white/25">atributo</span></div>
          <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/6"><div className="h-full rounded-full bg-gradient-to-r from-emerald-400/85 to-lime-300/85" style={{width:`${width}%`}}/></div>
          <div className="mt-3 text-xs leading-5 text-white/35">{desc}</div>
        </div>)}
      </div>
    </div>
    <div className="border-t border-white/7 bg-emerald-300/[.025] px-5 py-4 text-xs text-white/42">Os números desta ilustração são apenas composição visual. O produto não publica score ou posição sem auditoria oficial validada.</div>
  </div>;
}

function AwardPreview() {
  const awards = [
    ['GOLD', Crown, 'Site de Alta Conversão'],
    ['TOP 100', Trophy, 'Ranking Brasil'],
    ['SEO', Search, 'SEO Excellence'],
    ['MOBILE', MonitorSmartphone, 'Mobile Excellence'],
  ];
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
    {awards.map(([code, Icon, label], index) => <div key={code} className={`award-card award-${index} relative overflow-hidden rounded-[26px] border border-white/9 p-5 text-center`}>
      <div className="award-shine absolute inset-0"/>
      <div className="relative mx-auto grid size-12 place-items-center rounded-full border border-white/15 bg-black/16"><Icon size={21}/></div>
      <div className="relative mt-5 text-[10px] font-semibold tracking-[.24em] text-white/48">{code}</div>
      <div className="relative mt-2 text-sm font-semibold text-white/82">{label}</div>
      <div className="relative mt-3 text-[10px] uppercase tracking-[.16em] text-white/28">verificável</div>
    </div>)}
  </div>;
}

function Hero({ snapshot, url, setUrl, onStart, error }) {
  const b = snapshot?.benchmark || {};
  const valid = Number(b.successful_count || 0);
  const processed = Number(b.audited_count || 0);
  return <>
    <section className="relative mx-auto grid max-w-7xl gap-12 px-5 pb-24 pt-14 md:px-8 md:pt-20 lg:grid-cols-[1.08fr_.92fr] lg:items-center">
      <div className="relative z-10">
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/15 bg-emerald-300/[.055] px-3 py-2 text-xs text-emerald-100/72">
          <Radar size={14}/> Ranking Sites de Alta Conversão · metodologia em calibração pública
        </div>
        <h1 className="mt-7 max-w-4xl text-balance text-[3.35rem] font-semibold leading-[.93] tracking-[-.065em] md:text-[5rem]">
          Seu site já está <span className="text-gradient">competindo.</span><br/>Descubra onde ele ficaria.
        </h1>
        <p className="mt-7 max-w-2xl text-balance text-base leading-7 text-white/52 md:text-lg">
          Uma plataforma independente de inteligência para websites que transforma <strong className="font-medium text-white/76">estrutura, SEO, performance, design, copy, conteúdo, tracking e conversão</strong> em evidências comparáveis — e, depois da validação metodológica, em um score e ranking vivo.
        </p>

        <form onSubmit={onStart} className="input-shell mt-8 flex max-w-2xl flex-col gap-3 rounded-[28px] border border-white/10 p-3 sm:flex-row">
          <div className="flex flex-1 items-center gap-3 px-3"><Globe2 size={18} className="shrink-0 text-emerald-200/55"/><input value={url} onChange={e=>setUrl(e.target.value)} placeholder="cole seu site — ex.: empresa.com.br" className="min-w-0 flex-1 bg-transparent py-3.5 text-white outline-none placeholder:text-white/24"/></div>
          <button className="group flex items-center justify-center gap-2 rounded-2xl bg-emerald-300 px-6 py-4 font-semibold text-[#06100d] transition hover:bg-emerald-200">Analisar meu site <ArrowRight size={17} className="transition-transform group-hover:translate-x-1"/></button>
        </form>
        {error && <div className="mt-3 flex items-center gap-2 text-sm text-amber-100/75"><CircleAlert size={15}/>{error}</div>}

        <div className="mt-5 flex flex-wrap gap-2">
          <Pill tone="green"><Database size={13}/>{processed.toLocaleString('pt-BR')} domínios processados</Pill>
          <Pill><CircleCheck size={13}/>{valid.toLocaleString('pt-BR')} análises válidas</Pill>
          <Pill><LockKeyhole size={13}/>sem score fabricado</Pill>
        </div>
      </div>

      <div className="relative">
        <div className="absolute -inset-10 rounded-full bg-emerald-400/7 blur-3xl"/>
        <div className="machine-card relative overflow-hidden rounded-[36px] border border-white/10 p-5 md:p-6">
          <div className="flex items-center justify-between gap-4">
            <div><div className="text-[10px] uppercase tracking-[.22em] text-white/32">Website intelligence engine</div><div className="mt-2 text-xl font-semibold">Uma URL entra. O site inteiro vira sinais.</div></div>
            <div className="grid size-11 place-items-center rounded-2xl bg-emerald-300/10 text-emerald-300"><BrainCircuit size={21}/></div>
          </div>
          <div className="relative mt-7 rounded-[28px] border border-white/8 bg-[#07110e]/78 p-5">
            <div className="scanline pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-transparent via-emerald-300/9 to-transparent"/>
            <div className="flex items-center gap-3 rounded-2xl border border-white/7 bg-black/15 px-4 py-3"><Globe2 size={15} className="text-emerald-300"/><span className="text-sm text-white/55">seusite.com.br</span><span className="ml-auto size-2 rounded-full bg-emerald-300 animate-pulse"/></div>
            <div className="mt-5 grid grid-cols-2 gap-2.5">
              {['DOM + JS','SEO','Performance','Copy','Design','Tracking','Acessibilidade','Funil'].map((label,i)=><div key={label} className="flex items-center gap-2 rounded-xl border border-white/6 bg-white/[.025] px-3 py-2.5 text-xs text-white/46"><span className={`size-1.5 rounded-full ${i<5?'bg-emerald-300':'bg-lime-200/55'}`}/>{label}</div>)}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3"><Metric label="SAC Score" value="—" hint="0–1.000"/><Metric label="Ranking" value="—" hint="geral + nicho"/><Metric label="Award" value="—" hint="conquistado"/></div>
        </div>
      </div>
    </section>
  </>;
}

function Home({ snapshot, url, setUrl, onStart, error }) {
  return <main className="relative z-10">
    <Hero snapshot={snapshot} url={url} setUrl={setUrl} onStart={onStart} error={error}/>

    <section id="metodologia" className="border-y border-white/6 bg-black/10">
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-20 md:px-8 lg:grid-cols-[.9fr_1.1fr] lg:items-center">
        <BenchmarkProof snapshot={snapshot}/>
        <div className="lg:pl-8">
          <div className="eyebrow">Por que essa metodologia existe</div>
          <h2 className="section-title mt-4">Não começamos por um quiz.<br/><span className="text-white/38">Começamos pela web real.</span></h2>
          <p className="mt-6 max-w-2xl text-base leading-7 text-white/48">Processamos um benchmark público de milhares de domínios e cruzamos o que observamos com referências técnicas, pesquisa de UX/CRO, padrões de acessibilidade, segurança, SEO, performance e estudos de caso. Cada família de regra guarda evidência, aplicabilidade, confiança e limitação.</p>
          <div className="mt-7 flex flex-wrap gap-2">
            {['Core Web Vitals','WCAG 2.2','OWASP','Schema.org','SEO técnico','UX/CRO research','casos de campo'].map(x=><Pill key={x}>{x}</Pill>)}
          </div>
          <div className="mt-7 rounded-2xl border border-amber-300/12 bg-amber-300/[.035] p-4 text-xs leading-5 text-amber-50/55"><strong className="font-semibold text-amber-100/75">Importante:</strong> referência técnica não significa endosso, e correlação não vira promessa de vendas. O SAC mede maturidade e prontidão observável; conversão real exige dados do próprio negócio.</div>
        </div>
      </div>
    </section>

    <section id="analise" className="mx-auto max-w-7xl px-5 py-24 md:px-8">
      <div className="max-w-3xl"><div className="eyebrow">A máquina por dentro</div><h2 className="section-title mt-4">Não olhamos apenas código.<br/><span className="text-white/38">Nós desmontamos a experiência.</span></h2><p className="mt-5 text-base leading-7 text-white/46">O objetivo final é analisar o website como sistema: o que ele diz, mostra, mede, carrega, conecta, prova e pede para o visitante fazer.</p></div>
      <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {analysisLayers.map(([Icon,title,desc],i)=><div key={title} className="feature-card group rounded-[26px] border border-white/7 p-5 transition hover:-translate-y-1 hover:border-emerald-300/16">
          <div className="flex items-center justify-between"><div className="grid size-10 place-items-center rounded-2xl bg-white/[.045] text-emerald-200/75"><Icon size={19}/></div><span className="text-[10px] font-semibold tracking-[.2em] text-white/18">{String(i+1).padStart(2,'0')}</span></div>
          <h3 className="mt-5 font-semibold text-white/82">{title}</h3><p className="mt-2 text-sm leading-6 text-white/38">{desc}</p>
        </div>)}
      </div>
    </section>

    <section className="relative overflow-hidden border-y border-white/6 bg-[#07120f]">
      <div className="absolute inset-0 opacity-40 [background:radial-gradient(circle_at_50%_50%,rgba(52,211,153,.12),transparent_48%)]"/>
      <div className="relative mx-auto max-w-7xl px-5 py-24 md:px-8">
        <div className="grid gap-10 lg:grid-cols-[.86fr_1.14fr] lg:items-center">
          <div>
            <div className="eyebrow">A analogia vira interface</div>
            <h2 className="section-title mt-4">Sua empresa como uma loja.<br/><span className="text-white/38">Só que sem responder perguntas.</span></h2>
            <p className="mt-5 text-base leading-7 text-white/46">A antiga ideia do quiz foi automatizada. O software descobre sozinho o que consegue observar e desenha a sua “loja digital”: fundação, vitrine, câmeras, mapa, livro de dúvidas e caderno de clientes. O que não puder ser verificado publicamente aparece como <strong className="font-medium text-white/70">“precisa de conexão”</strong>, nunca como erro inventado.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {storeMetaphors.map(([Icon,title,tech,simple],i)=><div key={title} className="store-card rounded-[26px] border border-white/8 p-5">
              <div className="flex items-center gap-3"><div className={`grid size-10 place-items-center rounded-2xl ${i%3===0?'bg-emerald-300/9 text-emerald-200':i%3===1?'bg-amber-300/8 text-amber-200':'bg-sky-300/8 text-sky-200'}`}><Icon size={19}/></div><div><div className="font-semibold text-white/80">{title}</div><div className="mt-0.5 text-[11px] text-white/28">{tech}</div></div></div>
              <p className="mt-4 text-sm leading-6 text-white/42">{simple}</p>
              <div className="mt-4 flex items-center gap-2 text-[10px] uppercase tracking-[.16em] text-white/26"><span className="size-1.5 rounded-full bg-emerald-300/65"/>estado calculado por evidência</div>
            </div>)}
          </div>
        </div>
      </div>
    </section>

    <section id="resultado" className="mx-auto max-w-7xl px-5 py-24 md:px-8">
      <div className="grid gap-10 lg:grid-cols-[.82fr_1.18fr] lg:items-center">
        <div>
          <div className="eyebrow">O resultado precisa ensinar</div>
          <h2 className="section-title mt-4">Um dashboard para entender.<br/><span className="text-white/38">Não uma planilha de erros.</span></h2>
          <p className="mt-5 text-base leading-7 text-white/46">O usuário vê atributos, evidências, prioridades, score potencial, missões e o rival logo acima. Cada ponto abre para “o que é”, “por que importa”, “o que encontramos” e “como melhorar”.</p>
          <div className="mt-7 space-y-3">
            {[
              ['Score atual + potencial','o que existe hoje e onde há espaço mensurável'],
              ['Ranking geral + por nicho','posição comparável com metodologia padronizada'],
              ['Missões e Road to 800','melhorias organizadas por impacto, não jargão'],
              ['Evidência visual','screenshot/elemento/métrica em vez de opinião genérica'],
            ].map(([title,desc])=><div key={title} className="flex gap-3 rounded-2xl border border-white/7 bg-white/[.02] p-4"><CircleCheck size={17} className="mt-0.5 shrink-0 text-emerald-300"/><div><div className="text-sm font-medium text-white/72">{title}</div><div className="mt-1 text-xs leading-5 text-white/34">{desc}</div></div></div>)}
          </div>
        </div>
        <DashboardPreview snapshot={snapshot}/>
      </div>
    </section>

    <section id="como-funciona" className="border-y border-white/6 bg-black/12">
      <div className="mx-auto max-w-7xl px-5 py-24 md:px-8">
        <div className="max-w-3xl"><div className="eyebrow">O modelo de negócio completo</div><h2 className="section-title mt-4">A auditoria é o começo.<br/><span className="text-white/38">O produto é a evolução.</span></h2></div>
        <div className="mt-10 grid gap-3 lg:grid-cols-5">
          {flowSteps.map(([n,title,desc,label])=><div key={n} className="relative rounded-[26px] border border-white/7 bg-white/[.024] p-5">
            <div className="flex items-center justify-between"><span className="text-3xl font-semibold tracking-[-.05em] text-white/16">{n}</span><span className="rounded-full border border-white/7 px-2.5 py-1 text-[9px] uppercase tracking-[.16em] text-white/30">{label}</span></div>
            <h3 className="mt-7 font-semibold text-white/82">{title}</h3><p className="mt-2 text-sm leading-6 text-white/38">{desc}</p>
          </div>)}
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="product-card rounded-[30px] border border-white/8 p-6"><FileDown className="text-emerald-300"/><div className="mt-5 text-[10px] uppercase tracking-[.2em] text-white/30">Produto 1</div><h3 className="mt-2 text-xl font-semibold">Full Scan + PDF</h3><p className="mt-3 text-sm leading-6 text-white/40">Pagamento único para auditoria completa, evidências, SAC Score quando validado, roadmap e posição simulada.</p></div>
          <div className="product-card rounded-[30px] border border-emerald-300/14 bg-emerald-300/[.025] p-6"><Trophy className="text-lime-300"/><div className="mt-5 text-[10px] uppercase tracking-[.2em] text-emerald-200/46">Produto 2</div><h3 className="mt-2 text-xl font-semibold">Ranking + Comunidade</h3><p className="mt-3 text-sm leading-6 text-white/40">Assinatura para posição oficial, perfil público, histórico, alerts, awards, desafios e networking.</p></div>
          <div className="product-card rounded-[30px] border border-white/8 p-6"><WandSparkles className="text-violet-300"/><div className="mt-5 text-[10px] uppercase tracking-[.2em] text-white/30">Expansão</div><h3 className="mt-2 text-xl font-semibold">Implementação opcional</h3><p className="mt-3 text-sm leading-6 text-white/40">A plataforma mostra o problema primeiro. Depois você decide se aprende, corrige sozinho ou contrata a execução.</p></div>
        </div>
      </div>
    </section>

    <section id="awards" className="mx-auto max-w-7xl px-5 py-24 md:px-8">
      <div className="grid gap-10 lg:grid-cols-[.85fr_1.15fr] lg:items-center">
        <div>
          <div className="eyebrow">Reputação conquistada</div>
          <h2 className="section-title mt-4">Pagar permite participar.<br/><span className="text-white/38">Não permite ganhar.</span></h2>
          <p className="mt-5 text-base leading-7 text-white/46">Awards e badges só são emitidos quando a auditoria confirma o threshold. O selo dinâmico aponta para uma página de verificação com domínio, score, posição, data e metodologia.</p>
          <div className="mt-6 rounded-2xl border border-emerald-300/12 bg-emerald-300/[.035] p-4 text-sm leading-6 text-white/50"><strong className="text-white/74">Regra pública:</strong> nenhum plano, anúncio ou serviço comprado altera diretamente o SAC Score.</div>
        </div>
        <AwardPreview/>
      </div>
    </section>

    <section id="comunidade" className="border-y border-white/6 bg-[#08130f]">
      <div className="mx-auto max-w-7xl px-5 py-24 md:px-8">
        <div className="grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-center">
          <div>
            <div className="eyebrow">Ranking vira rede</div>
            <h2 className="section-title mt-4">Empresas não entram só para aparecer.<br/><span className="text-white/38">Elas entram para evoluir juntas.</span></h2>
            <p className="mt-5 max-w-2xl text-base leading-7 text-white/46">A membership conecta quem está no ranking: conquistas, feedback de site, growth, SEO, parcerias, fornecedores, oportunidades e desafios. Community Reputation e XP são separados do SAC Score.</p>
          </div>
          <div className="community-card rounded-[32px] border border-white/8 p-5 md:p-6">
            <div className="flex items-center justify-between"><div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-2xl bg-violet-300/9 text-violet-200"><Users size={19}/></div><div><div className="font-semibold">High Conversion Network</div><div className="text-xs text-white/30">acesso com membership ativa</div></div></div><Pill tone="violet">community</Pill></div>
            <div className="mt-6 space-y-3">
              {[
                [Trophy,'Empresa subiu no ranking','A evolução validada vira acontecimento da comunidade.'],
                [MessageCircle,'Feedback My Site','Membros podem trocar feedback sem alterar o score da máquina.'],
                [Link2,'Matchmaking','Conexões por segmento, cidade, stack e necessidade complementar.'],
              ].map(([Icon,title,desc])=><div key={title} className="flex gap-4 rounded-2xl border border-white/7 bg-black/14 p-4"><div className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/[.045] text-white/52"><Icon size={16}/></div><div><div className="text-sm font-medium text-white/72">{title}</div><div className="mt-1 text-xs leading-5 text-white/34">{desc}</div></div></div>)}
            </div>
          </div>
        </div>
      </div>
    </section>

    <section className="mx-auto max-w-5xl px-5 py-28 text-center md:px-8">
      <div className="mx-auto grid size-14 place-items-center rounded-[20px] border border-emerald-300/18 bg-emerald-300/[.07] text-emerald-300"><Radar size={25}/></div>
      <div className="eyebrow mt-6">A única pergunta necessária agora</div>
      <h2 className="mx-auto mt-4 max-w-4xl text-balance text-4xl font-semibold tracking-[-.055em] md:text-6xl">Em qual posição o seu site estaria se a competição começasse hoje?</h2>
      <button onClick={()=>document.querySelector('input')?.focus()} className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-emerald-300 px-7 py-4 font-semibold text-[#06100d] hover:bg-emerald-200">Colar meu site <ArrowRight size={17}/></button>
      <div className="mt-4 text-xs text-white/28">Prévia técnica agora · Score/ranking oficial somente depois dos gates de validação</div>
    </section>
  </main>;
}

function ScanStage({ label, state = 'waiting', detail }) {
  const done = state === 'done';
  const active = state === 'active';
  return <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3.5 transition ${done ? 'border-emerald-300/18 bg-emerald-300/[.045]' : active ? 'border-white/14 bg-white/[.045]' : 'border-white/5 bg-white/[.018]'}`}>
    <div className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl ${done ? 'bg-emerald-300/12 text-emerald-300' : active ? 'bg-white/8 text-white' : 'bg-white/4 text-white/26'}`}>{done ? <Check size={16}/> : active ? <Activity size={15} className="animate-pulse"/> : <span className="size-1.5 rounded-full bg-current"/>}</div>
    <div><div className={done || active ? 'text-sm text-white/76' : 'text-sm text-white/30'}>{label}</div>{detail && <div className="mt-1 text-xs text-white/27">{detail}</div>}</div>
  </div>;
}

function Scanner({ url, status, elapsed }) {
  const processing = status === 'processing';
  const queued = status === 'queued';
  return <section className="mx-auto max-w-5xl px-5 pb-24 pt-14 md:px-8 md:pt-20">
    <div className="text-center"><Pill tone="green"><Radar size={13}/>scan real em andamento</Pill><h2 className="mx-auto mt-6 max-w-4xl text-balance text-4xl font-semibold tracking-[-.055em] md:text-6xl">Estamos desmontando o site em evidências.</h2><p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-white/45">Sites grandes podem levar mais tempo. O preview agora degrada graciosamente: se uma camada pesada exceder o budget, preservamos o que foi verificado em vez de perder toda a análise.</p></div>
    <div className="machine-card relative mt-10 overflow-hidden rounded-[34px] border border-white/10 p-5 md:p-7">
      <div className="scanline pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-transparent via-emerald-300/9 to-transparent"/>
      <div className="flex items-center gap-3 rounded-2xl border border-white/8 bg-black/18 px-4 py-3 text-sm text-white/55"><Globe2 size={16} className="text-emerald-300"/><span className="truncate">{url}</span><span className="ml-auto text-xs text-white/26">{elapsed}s</span></div>
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        <ScanStage label="URL + segurança" detail="protocolo, redirect e proteção contra redes privadas" state={processing ? 'done' : queued ? 'active' : 'waiting'}/>
        <ScanStage label="HTML público + robots" detail="coleta determinística antes da renderização" state={processing ? 'done' : 'waiting'}/>
        <ScanStage label="DOM em Chromium" detail="mobile renderizado com budget controlado" state={processing ? 'active' : 'waiting'}/>
        <ScanStage label="Acessibilidade automatizada" detail="axe-core quando o budget permite" state={processing ? 'active' : 'waiting'}/>
        <ScanStage label="Normalização das evidências" detail="cada finding é ligado a um critério SAC" state="waiting"/>
        <ScanStage label="Resultado visual" detail="sem inventar score oficial" state="waiting"/>
      </div>
      <div className="mt-6 flex items-center justify-center gap-2 text-[10px] uppercase tracking-[.18em] text-white/26"><Clock3 size={13}/>{queued ? 'aguardando worker' : 'análise assíncrona · você pode manter esta aba aberta'}</div>
    </div>
  </section>;
}

function FindingCard({ finding }) {
  const [open, setOpen] = useState(false);
  const warning = finding.status !== 'pass';
  return <div className={`rounded-[22px] border p-4.5 transition ${warning ? 'border-amber-300/14 bg-amber-300/[.03]' : 'border-emerald-300/12 bg-emerald-300/[.028]'}`}>
    <button className="flex w-full items-start gap-3 text-left" onClick={()=>setOpen(v=>!v)}>
      <div className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl ${warning?'bg-amber-300/9 text-amber-200':'bg-emerald-300/9 text-emerald-300'}`}>{warning?<CircleAlert size={17}/>:<Check size={17}/>}</div>
      <div className="min-w-0 flex-1"><div className="font-medium text-white/82">{finding.explanation || finding.criterion_code}</div><div className="mt-1 flex flex-wrap gap-2"><span className="text-xs text-white/30">{warning?'oportunidade detectada':'sinal atendido'}</span><span className="text-[10px] uppercase tracking-wider text-white/22">{finding.criterion_code}</span></div></div>
      <ChevronDown size={16} className={`mt-2 text-white/28 transition-transform ${open?'rotate-180':''}`}/>
    </button>
    {open && <div className="mt-4 border-t border-white/7 pt-4 text-sm leading-6 text-white/45"><div><span className="text-white/68">Por que isso importa: </span>este sinal participa da maturidade observável da experiência digital.</div>{finding.recommendation && <div className="mt-2"><span className="text-white/68">Próxima ação: </span>{finding.recommendation}</div>}</div>}
  </div>;
}

function buildStoreModules(findings) {
  const by = code => findings.filter(f => (f.criterion_code || '').includes(code));
  const statusOf = list => {
    if (!list.length) return 'unknown';
    if (list.some(f=>f.status==='warning' || f.status==='fail')) return 'attention';
    if (list.every(f=>f.status==='pass')) return 'healthy';
    return 'unknown';
  };
  return [
    {title:'Fundação', icon:Building2, status:statusOf([...by('HTTP'),...by('STR'),...by('MOB')]), tech:'HTTPS · segurança · mobile'},
    {title:'Vitrine', icon:ShoppingBag, status:statusOf([...by('SEO-001'),...by('SEO-002'),...by('SEO-003')]), tech:'título · headline · estrutura'},
    {title:'Câmeras', icon:Radar, status:statusOf(by('TRK')), tech:'analytics · tag manager'},
    {title:'Mapa', icon:Globe2, status:statusOf([...by('SEO'),...by('SCH')]), tech:'SEO · schema · descoberta'},
    {title:'Porta', icon:Accessibility, status:statusOf([...by('A11Y'),...by('REN')]), tech:'acessibilidade · overflow'},
    {title:'Caderno', icon:Boxes, status:'connection', tech:'CRM · APIs · automação'},
  ];
}

function Result({ result, token }) {
  const health = technicalIndex(result.findings || []);
  const findings = [...(result.findings || [])].sort((a,b)=>(severityRank[a.severity]??9)-(severityRank[b.severity]??9));
  const gaps = findings.filter(f=>f.status!=='pass').slice(0,10);
  const recommendations = useMemo(()=>{
    const map = new Map();
    for (const finding of gaps) { const service=serviceForFinding(finding); if(!map.has(service.key)) map.set(service.key,service); }
    return [...map.values()];
  },[result]);
  const modules = buildStoreModules(findings);
  const timing = result?.rendered?.timing || {};
  const [selected,setSelected] = useState(()=>recommendations.map(r=>r.key));
  const [briefOpen,setBriefOpen] = useState(false);
  const [saving,setSaving] = useState(false);
  const [saved,setSaved] = useState(false);
  const [form,setForm] = useState({email:'',phone:'',company_name:'',segment:'',goal:'Mais vendas',ticket_band:'',marketing_consent:false});

  async function saveLead(e){e.preventDefault();setSaving(true);try{await api('save-lead',{preview_token:token,...form,selected_modules:selected});setSaved(true);}catch(err){alert(err.message==='invalid_email'?'Digite um e-mail válido.':'Não foi possível salvar agora.');}finally{setSaving(false);}}

  return <main className="relative z-10 mx-auto max-w-7xl px-5 pb-24 pt-10 md:px-8">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div><div className="eyebrow">Prévia concluída</div><h1 className="mt-2 text-3xl font-semibold tracking-[-.04em] md:text-4xl">Seu site como sistema, não como página.</h1></div><Pill tone="green"><BadgeCheck size={13}/>evidências persistidas</Pill></div>

    <div className="grid gap-4 lg:grid-cols-[.76fr_1.24fr]">
      <div className="score-card rounded-[32px] border border-white/9 p-6 md:p-7">
        <div className="flex items-center justify-between"><div className="text-[10px] uppercase tracking-[.2em] text-white/32">Índice técnico preliminar</div><Gauge size={19} className="text-emerald-300"/></div>
        <div className="mt-6 flex items-end gap-3"><div className="text-7xl font-semibold tracking-[-.075em]">{health ?? '—'}</div>{health!=null&&<div className="pb-2 text-white/30">/100</div>}</div>
        <p className="mt-4 text-sm leading-6 text-white/42">É apenas um resumo dos checks disponíveis nesta prévia. <strong className="font-medium text-white/68">Não é SAC Score, award ou ranking.</strong></p>
        <div className="mt-6 grid grid-cols-3 gap-2"><Metric label="TTFB" value={timing.ttfb_ms} suffix="ms"/><Metric label="DOM" value={timing.dom_content_loaded_ms} suffix="ms"/><Metric label="Load" value={timing.load_ms} suffix="ms"/></div>
        <div className="mt-5 flex flex-wrap gap-2"><Pill><StatusDot ok={result.coverage?.javascript_rendering}/>Chromium</Pill><Pill><StatusDot ok={result.axe?.available}/>axe {result.axe?.version||''}</Pill><Pill><StatusDot ok={!result.coverage?.degraded}/>scan completo</Pill></div>
      </div>

      <div className="rounded-[32px] border border-white/9 bg-white/[.025] p-5 md:p-6">
        <div className="flex items-center justify-between"><div><div className="text-[10px] uppercase tracking-[.2em] text-white/30">Sua loja digital</div><h2 className="mt-2 text-xl font-semibold">Mapa visual do diagnóstico</h2></div><Building2 className="text-white/30"/></div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {modules.map(m=>{const Icon=m.icon;const tone=m.status==='healthy'?'emerald':m.status==='attention'?'amber':m.status==='connection'?'violet':'slate';return <div key={m.title} className={`store-module store-${tone} rounded-[22px] border p-4`}><div className="flex items-center justify-between"><div className="grid size-9 place-items-center rounded-xl bg-black/14"><Icon size={17}/></div><span className={`size-2 rounded-full ${m.status==='healthy'?'bg-emerald-300':m.status==='attention'?'bg-amber-300':m.status==='connection'?'bg-violet-300':'bg-white/20'}`}/></div><div className="mt-4 text-sm font-semibold text-white/76">{m.title}</div><div className="mt-1 text-[11px] leading-4 text-white/30">{m.tech}</div><div className="mt-3 text-[9px] uppercase tracking-[.15em] text-white/25">{m.status==='healthy'?'estrutura saudável':m.status==='attention'?'precisa de atenção':m.status==='connection'?'precisa de conexão':'não avaliado'}</div></div>})}
        </div>
      </div>
    </div>

    <div className="mt-8 grid gap-6 lg:grid-cols-[1.12fr_.88fr]">
      <section><div className="mb-4 flex items-end justify-between"><div><div className="eyebrow">Evidências encontradas</div><h2 className="mt-2 text-2xl font-semibold">O que a máquina conseguiu provar</h2></div><span className="text-xs text-white/28">{findings.length} findings</span></div><div className="space-y-3">{gaps.length?gaps.map((f,i)=><FindingCard key={`${f.criterion_code}-${i}`} finding={f}/>):<div className="rounded-3xl border border-white/7 bg-white/[.02] p-6 text-white/40">Nenhuma lacuna material nesta camada limitada.</div>}</div></section>

      <aside className="space-y-4 lg:sticky lg:top-5 lg:self-start">
        <div className="rounded-[30px] border border-emerald-300/14 bg-emerald-300/[.028] p-6">
          <div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-2xl bg-emerald-300/10 text-emerald-300"><FileDown size={19}/></div><div><div className="text-[10px] uppercase tracking-[.18em] text-emerald-100/42">Próxima camada</div><h3 className="font-semibold">Full Scan + PDF</h3></div></div>
          <p className="mt-4 text-sm leading-6 text-white/42">O produto pago aprofunda páginas, performance/Lighthouse, conteúdo, conversão, mídia, estrutura e gera relatório persistente. Depois vem a posição simulada no ranking.</p>
          <div className="mt-5 space-y-2">{['auditoria profunda','PDF com evidências','roadmap priorizado','posição simulada'].map(x=><div key={x} className="flex items-center gap-2 text-xs text-white/48"><Check size={13} className="text-emerald-300"/>{x}</div>)}</div>
        </div>

        <div className="rounded-[30px] border border-white/8 bg-white/[.022] p-6">
          <div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-2xl bg-violet-300/8 text-violet-200"><WandSparkles size={19}/></div><div><div className="text-[10px] uppercase tracking-[.18em] text-white/30">Missões sugeridas</div><h3 className="font-semibold">Monte sua correção</h3></div></div>
          <p className="mt-3 text-xs leading-5 text-white/36">Selecionar um módulo não compra pontos. Uma futura reauditoria precisa confirmar a melhora.</p>
          <div className="mt-4 space-y-2">{recommendations.map(item=>{const Icon=item.icon;const on=selected.includes(item.key);return <button key={item.key} onClick={()=>setSelected(s=>on?s.filter(x=>x!==item.key):[...s,item.key])} className={`flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition ${on?'border-emerald-300/22 bg-emerald-300/[.055]':'border-white/7 bg-black/10'}`}><div className="grid size-8 place-items-center rounded-xl bg-white/[.04]"><Icon size={15}/></div><div className="flex-1"><div className="text-sm text-white/70">{item.title}</div><div className="text-[11px] text-white/28">{item.promise}</div></div>{on&&<Check size={14} className="text-emerald-300"/>}</button>})}</div>
          <button disabled={!selected.length} onClick={()=>setBriefOpen(true)} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-300 px-5 py-4 font-semibold text-[#06100d] disabled:opacity-40">Quero meu plano <ArrowRight size={16}/></button>
        </div>
      </aside>
    </div>

    {briefOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-black/76 p-4 backdrop-blur-md"><div className="modal-enter max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[32px] border border-white/10 bg-[#09140f] p-6 shadow-2xl md:p-8"><div className="flex items-start justify-between gap-4"><div><div className="eyebrow">Briefing progressivo</div><h3 className="mt-2 text-2xl font-semibold">O sistema já sabe o que encontrou.</h3><p className="mt-2 text-sm text-white/40">Só pedimos o contexto que não pode ser descoberto publicamente. Nenhuma senha aqui.</p></div><button onClick={()=>setBriefOpen(false)} className="grid size-9 place-items-center rounded-xl border border-white/8 text-white/42"><X size={17}/></button></div>
          {saved?<div className="mt-8 rounded-3xl border border-emerald-300/18 bg-emerald-300/[.055] p-7 text-center"><div className="mx-auto grid size-12 place-items-center rounded-2xl bg-emerald-300 text-[#06100d]"><Check size={22}/></div><h4 className="mt-4 text-xl font-semibold">Plano registrado.</h4><p className="mt-2 text-sm text-white/42">Suas escolhas ficaram ligadas ao mesmo diagnóstico.</p></div>:<form onSubmit={saveLead} className="mt-7 space-y-4"><div className="grid gap-4 md:grid-cols-2"><label className="form-label">Empresa<input value={form.company_name} onChange={e=>setForm({...form,company_name:e.target.value})} className="form-input" placeholder="Nome da empresa"/></label><label className="form-label">Segmento<input value={form.segment} onChange={e=>setForm({...form,segment:e.target.value})} className="form-input" placeholder="Ex.: SaaS, clínica, restaurante"/></label></div><div className="grid gap-4 md:grid-cols-2"><label className="form-label">E-mail para receber o plano *<input required type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} className="form-input" placeholder="voce@empresa.com"/></label><label className="form-label">WhatsApp opcional<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} className="form-input" placeholder="+55 ..."/></label></div><div className="grid gap-4 md:grid-cols-2"><label className="form-label">Objetivo<select value={form.goal} onChange={e=>setForm({...form,goal:e.target.value})} className="form-input bg-[#0b1712]"><option>Mais vendas</option><option>Mais leads</option><option>Melhorar conversão</option><option>Ganhar tráfego orgânico</option><option>Automatizar follow-up</option></select></label><label className="form-label">Ticket médio<select value={form.ticket_band} onChange={e=>setForm({...form,ticket_band:e.target.value})} className="form-input bg-[#0b1712]"><option value="">Prefiro não informar</option><option>Até R$100</option><option>R$100–500</option><option>R$500–2.000</option><option>R$2.000–10.000</option><option>Acima de R$10.000</option></select></label></div><label className="flex items-start gap-3 rounded-2xl border border-white/7 bg-black/14 p-4 text-sm text-white/40"><input type="checkbox" checked={form.marketing_consent} onChange={e=>setForm({...form,marketing_consent:e.target.checked})} className="mt-1"/><span>Quero receber benchmarks e oportunidades da Plutyx. <strong className="font-medium text-white/62">Opcional:</strong> isso não condiciona o plano solicitado.</span></label><button disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-300 px-5 py-4 font-semibold text-[#06100d] disabled:opacity-50">{saving?'Salvando...':'Receber meu plano'} <ArrowRight size={16}/></button></form>}
        </div></div>}
  </main>;
}

function App(){
  const [snapshot,setSnapshot]=useState(null);
  const [url,setUrl]=useState('');
  const [phase,setPhase]=useState('home');
  const [token,setToken]=useState(()=>localStorage.getItem('sac_preview_token')||'');
  const [status,setStatus]=useState('');
  const [result,setResult]=useState(null);
  const [error,setError]=useState('');
  const [menuOpen,setMenuOpen]=useState(false);
  const [elapsed,setElapsed]=useState(0);

  useEffect(()=>{api('snapshot').then(setSnapshot).catch(()=>{});},[]);
  useEffect(()=>{if(phase!=='scan')return;const timer=setInterval(()=>setElapsed(v=>v+1),1000);return()=>clearInterval(timer);},[phase]);
  useEffect(()=>{
    if(!token||phase!=='scan')return;
    let cancelled=false;
    const poll=async()=>{
      try{
        const data=await api('preview-status',{token});
        if(cancelled)return;
        if(!data?.found){setError('O scan não foi encontrado.');setPhase('home');return;}
        setStatus(data.status);
        if(data.status==='completed'){setResult(data);setPhase('result');return;}
        if(data.status==='failed'){setError('O site respondeu, mas uma camada da análise falhou. O worker está configurado para degradar graciosamente nos próximos scans.');setPhase('home');return;}
        setTimeout(poll,2600);
      }catch{if(!cancelled)setTimeout(poll,3500);}
    };
    poll();
    return()=>{cancelled=true};
  },[token,phase]);

  async function start(e){
    e?.preventDefault?.();
    setError('');setElapsed(0);
    let candidate=url.trim();
    if(candidate&&!/^https?:\/\//i.test(candidate))candidate=`https://${candidate}`;
    try{new URL(candidate);}catch{setError('Digite um domínio ou URL válido.');return;}
    setUrl(candidate);setPhase('scan');setStatus('queued');
    try{
      const data=await api('request-preview',{url:candidate});
      localStorage.setItem('sac_preview_token',data.token);setToken(data.token);setStatus(data.status);
    }catch(err){setPhase('home');setError(humanError(err.message));}
  }

  return <div className="sac-shell relative min-h-screen overflow-hidden">
    <div className="sac-grid pointer-events-none absolute inset-0"/>
    <div className="ambient ambient-a"/><div className="ambient ambient-b"/>
    <header className="relative z-30 border-b border-white/5 bg-[#06100d]/72 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 md:px-8">
        <button onClick={()=>{setPhase('home');window.scrollTo({top:0,behavior:'smooth'})}}><LogoMark/></button>
        <nav className="hidden items-center gap-6 lg:flex">{[['Metodologia','#metodologia'],['O que analisa','#analise'],['Dashboard','#resultado'],['Como funciona','#como-funciona'],['Awards','#awards'],['Comunidade','#comunidade']].map(([label,href])=><a key={label} href={href} className="text-xs text-white/38 transition hover:text-white/75">{label}</a>)}</nav>
        <div className="hidden items-center gap-3 sm:flex"><Pill tone="green"><StatusDot ok/>preview online</Pill><button onClick={()=>{setPhase('home');setTimeout(()=>document.querySelector('input')?.focus(),50)}} className="rounded-xl border border-white/10 bg-white/[.04] px-4 py-2.5 text-xs font-medium text-white/65 hover:bg-white/[.07]">Analisar site</button></div>
        <button onClick={()=>setMenuOpen(v=>!v)} className="grid size-10 place-items-center rounded-xl border border-white/8 text-white/55 lg:hidden">{menuOpen?<X size={18}/>:<Menu size={18}/>}</button>
      </div>
      {menuOpen&&<div className="border-t border-white/6 px-5 py-4 lg:hidden"><div className="grid gap-2">{[['Metodologia','#metodologia'],['O que analisa','#analise'],['Dashboard','#resultado'],['Como funciona','#como-funciona'],['Awards','#awards'],['Comunidade','#comunidade']].map(([label,href])=><a key={label} href={href} onClick={()=>setMenuOpen(false)} className="rounded-xl px-3 py-2 text-sm text-white/55 hover:bg-white/[.04]">{label}</a>)}</div></div>}
    </header>

    {phase==='home'&&<Home snapshot={snapshot} url={url} setUrl={setUrl} onStart={start} error={error}/>} 
    {phase==='scan'&&<Scanner url={url} status={status} elapsed={elapsed}/>} 
    {phase==='result'&&result&&<Result result={result} token={token}/>} 

    <footer className="relative z-10 border-t border-white/6 px-5 py-8"><div className="mx-auto flex max-w-7xl flex-col gap-4 text-xs text-white/28 md:flex-row md:items-center md:justify-between"><div>Sites de Alta Conversão · by Plutyx</div><div className="max-w-2xl text-right">A prévia automatizada não representa taxa real de conversão, não substitui avaliação manual de acessibilidade e não publica SAC Score oficial enquanto a metodologia estiver em calibração.</div></div></footer>
  </div>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);
