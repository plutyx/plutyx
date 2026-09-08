import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity, ArrowRight, BadgeCheck, BarChart3, Check, ChevronDown, CircleAlert,
  Gauge, Globe2, LockKeyhole, Medal, MousePointerClick, Radar, Search, ShieldCheck,
  Sparkles, Target, Trophy, WandSparkles, X, Zap
} from 'lucide-react';
import './styles.css';

const SUPABASE_FUNCTION_URL = 'https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/sac-public-api';
const SUPABASE_ANON_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wZ2hldXpwbmt3dHhvcHN3cHF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgzNDk5NDYsImV4cCI6MjEwMzkyNTk0Nn0.MpohChGR95Ymi6sbMED_sWBot9jNLm_kW-Rz_PJ6mMA';

async function api(action, payload = {}) {
  const response = await fetch(SUPABASE_FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_JWT,
      Authorization: `Bearer ${SUPABASE_ANON_JWT}`,
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(body?.error || 'request_failed');
    err.status = response.status;
    throw err;
  }
  return body;
}

const severityRank = { critical: 0, important: 1, warning: 2, opportunity: 3, info: 4 };

function techHealth(findings = []) {
  let possible = 0;
  let earned = 0;
  for (const f of findings) {
    const pts = Number(f.points_available || 0);
    if (!pts || f.status === 'not_verifiable' || f.status === 'not_applicable') continue;
    possible += pts;
    earned += pts * (f.status === 'pass' ? 1 : f.status === 'warning' ? .52 : 0);
  }
  return possible ? Math.round((earned / possible) * 100) : null;
}

function serviceForFinding(f) {
  const code = f.criterion_code || '';
  if (code.includes('TRK')) return { key: 'tracking', title: 'Tracking & Dados', icon: Radar, promise: 'Deixe de operar no escuro.', tone: 'emerald' };
  if (code.includes('SEO') || code.includes('SCH')) return { key: 'seo', title: 'SEO & Conteúdo', icon: Search, promise: 'Melhore descoberta e estrutura técnica.', tone: 'lime' };
  if (code.includes('MOB') || code.includes('A11Y') || code.includes('REN')) return { key: 'cro', title: 'Experiência & CRO', icon: MousePointerClick, promise: 'Reduza atrito antes do clique.', tone: 'sky' };
  if (code.includes('STR') || code.includes('HTTP')) return { key: 'trust', title: 'Confiança & Segurança', icon: ShieldCheck, promise: 'Reforce sinais de segurança e confiança.', tone: 'violet' };
  return { key: 'conversion', title: 'Arquitetura de Conversão', icon: Target, promise: 'Organize o caminho até a ação.', tone: 'amber' };
}

function Metric({ label, value, suffix = '' }) {
  return <div className="rounded-2xl border border-white/8 bg-black/15 p-4"><div className="text-[11px] uppercase tracking-[.18em] text-white/40">{label}</div><div className="mt-2 text-xl font-semibold text-white">{value ?? '—'}{value != null && suffix}</div></div>;
}

function StatusDot({ ok }) {
  return <span className={`inline-block size-2 rounded-full ${ok ? 'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,.8)]' : 'bg-white/25'}`} />;
}

function BenchmarkCard({ snapshot }) {
  const b = snapshot?.benchmark;
  const successful = Number(b?.successful_count || 0);
  const target = Number(b?.target_count || 10000);
  const pct = Math.min(100, target ? Math.round(successful / target * 100) : 0);
  return (
    <div className="glass glow-ring relative overflow-hidden rounded-[30px] p-6 md:p-7">
      <div className="absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-emerald-300/40 to-transparent" />
      <div className="flex items-center justify-between gap-4">
        <div><div className="text-xs uppercase tracking-[.18em] text-emerald-200/60">Benchmark vivo</div><div className="mt-1 text-2xl font-semibold">{successful.toLocaleString('pt-BR')} <span className="text-sm font-normal text-white/40">análises válidas</span></div></div>
        <div className="grid size-12 place-items-center rounded-2xl bg-emerald-300/10 text-emerald-300"><BarChart3 size={22}/></div>
      </div>
      <div className="mt-7 h-2 overflow-hidden rounded-full bg-white/6"><motion.div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-lime-300" initial={{width:0}} animate={{width:`${pct}%`}} transition={{duration:1.1}} /></div>
      <div className="mt-3 flex justify-between text-xs text-white/40"><span>{pct}% do alvo inicial</span><span>{target.toLocaleString('pt-BR')} sites</span></div>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <Metric label="Processados" value={Number(b?.audited_count || 0).toLocaleString('pt-BR')} />
        <Metric label="Metodologia" value={snapshot?.methodology_version || 'SAC'} />
      </div>
      <div className="mt-4 flex items-start gap-2 text-xs leading-5 text-white/45"><LockKeyhole size={14} className="mt-0.5 shrink-0"/><span>O ranking oficial permanece bloqueado até a metodologia e o benchmark passarem pelos gates de validação.</span></div>
    </div>
  );
}

function ScanStage({ label, active, done }) {
  return <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 transition ${done ? 'border-emerald-300/20 bg-emerald-300/5' : active ? 'border-white/15 bg-white/5' : 'border-white/5 bg-white/[.02]'}`}>
    <div className={`grid size-8 place-items-center rounded-xl ${done ? 'bg-emerald-300/12 text-emerald-300' : active ? 'bg-white/8 text-white' : 'bg-white/4 text-white/30'}`}>{done ? <Check size={16}/> : active ? <Activity size={15} className="animate-pulse"/> : <span className="size-1.5 rounded-full bg-current"/>}</div>
    <span className={done || active ? 'text-white/80' : 'text-white/30'}>{label}</span>
  </div>;
}

function Scanner({ url, status }) {
  const done = status === 'completed';
  return <section className="mx-auto max-w-4xl px-5 pb-24 pt-16 md:px-8">
    <div className="text-center"><div className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl bg-emerald-300/10 text-emerald-300"><Radar size={26}/></div><h2 className="text-balance text-3xl font-semibold md:text-5xl">Estamos desmontando sua página em sinais.</h2><p className="mx-auto mt-4 max-w-2xl text-white/50">Nada de nota inventada. Primeiro coletamos evidências; o Score oficial só existe quando o motor metodológico estiver liberado.</p></div>
    <div className="glass relative mt-10 overflow-hidden rounded-[32px] p-5 md:p-8">
      <div className="scanline pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-transparent via-emerald-300/8 to-transparent"/>
      <div className="mb-6 flex items-center gap-3 rounded-2xl border border-white/8 bg-black/20 px-4 py-3 text-sm text-white/55"><Globe2 size={16} className="text-emerald-300"/><span className="truncate">{url}</span></div>
      <div className="grid gap-3 md:grid-cols-2">
        <ScanStage label="URL validada e protegida" active={!done} done={done || status === 'processing'} />
        <ScanStage label="DOM real em Chromium" active={status === 'processing'} done={done} />
        <ScanStage label="Acessibilidade automatizada" active={status === 'processing'} done={done} />
        <ScanStage label="Normalização das evidências" active={status === 'processing'} done={done} />
      </div>
      <div className="mt-6 text-center text-xs uppercase tracking-[.18em] text-white/30">{status === 'queued' ? 'Na fila segura' : status === 'processing' ? 'Análise em execução' : 'Concluindo'}</div>
    </div>
  </section>;
}

function FindingCard({ finding }) {
  const [open, setOpen] = useState(false);
  const warn = finding.status !== 'pass';
  return <motion.div layout className={`rounded-[24px] border p-5 ${warn ? 'border-amber-300/15 bg-amber-300/[.035]' : 'border-emerald-300/12 bg-emerald-300/[.03]'}`}>
    <button className="flex w-full items-start gap-4 text-left" onClick={() => setOpen(v => !v)}>
      <div className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl ${warn ? 'bg-amber-300/10 text-amber-200' : 'bg-emerald-300/10 text-emerald-300'}`}>{warn ? <CircleAlert size={17}/> : <Check size={17}/>}</div>
      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="font-medium text-white/90">{finding.explanation || finding.criterion_code}</span><span className="rounded-full border border-white/8 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white/35">{finding.criterion_code}</span></div><div className="mt-1 text-sm text-white/40">{warn ? 'Há espaço de melhoria detectado.' : 'Sinal atendido na prévia.'}</div></div>
      <ChevronDown size={17} className={`mt-2 shrink-0 text-white/30 transition ${open ? 'rotate-180' : ''}`}/>
    </button>
    <AnimatePresence>{open && <motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} className="overflow-hidden"><div className="mt-4 border-t border-white/7 pt-4 text-sm leading-6 text-white/55"><div><span className="text-white/75">Por que isso importa: </span>esse requisito participa da qualidade técnica e da experiência observável da página.</div>{finding.recommendation && <div className="mt-2"><span className="text-white/75">Próxima ação: </span>{finding.recommendation}</div>}</div></motion.div>}</AnimatePresence>
  </motion.div>;
}

function Result({ result, token, onLeadSaved }) {
  const health = techHealth(result.findings);
  const findings = [...(result.findings || [])].sort((a,b) => (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9));
  const gaps = findings.filter(f => f.status !== 'pass').slice(0, 8);
  const recommendations = useMemo(() => {
    const map = new Map();
    for (const f of gaps) { const s = serviceForFinding(f); if (!map.has(s.key)) map.set(s.key, s); }
    return [...map.values()];
  }, [result]);
  const [selected, setSelected] = useState(() => recommendations.map(r => r.key));
  const [briefOpen, setBriefOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({email:'',phone:'',company_name:'',segment:'',goal:'Mais vendas',ticket_band:'',marketing_consent:false});
  const timing = result?.rendered?.timing || {};

  async function saveLead(e) {
    e.preventDefault(); setSaving(true);
    try {
      await api('save-lead', { preview_token: token, ...form, selected_modules: selected });
      setSaved(true); onLeadSaved?.();
    } catch (e) { alert(e.message === 'invalid_email' ? 'Digite um e-mail válido.' : 'Não foi possível salvar agora. Tente novamente.'); }
    finally { setSaving(false); }
  }

  return <section className="mx-auto max-w-7xl px-5 pb-24 pt-12 md:px-8">
    <div className="grid gap-5 lg:grid-cols-[.92fr_1.08fr]">
      <div className="glass rounded-[32px] p-6 md:p-8">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[.18em] text-emerald-200/60"><BadgeCheck size={15}/> Prévia técnica concluída</div>
        <div className="mt-7 flex items-end gap-3"><div className="text-7xl font-semibold tracking-[-.07em]">{health ?? '—'}</div>{health != null && <div className="pb-2 text-white/35">/100<br/><span className="text-xs">índice preliminar</span></div>}</div>
        <p className="mt-5 max-w-xl text-sm leading-6 text-white/50">Este número resume apenas sinais básicos desta prévia. <strong className="font-medium text-white/70">Não é o SAC Score oficial e não vale posição no ranking.</strong></p>
        <div className="mt-7 grid grid-cols-3 gap-3"><Metric label="TTFB" value={timing.ttfb_ms} suffix=" ms"/><Metric label="DOM" value={timing.dom_content_loaded_ms} suffix=" ms"/><Metric label="Load" value={timing.load_ms} suffix=" ms"/></div>
        <div className="mt-6 flex flex-wrap gap-2 text-xs">
          <span className="flex items-center gap-2 rounded-full border border-white/8 px-3 py-2 text-white/55"><StatusDot ok={result.coverage?.javascript_rendering}/> Chromium real</span>
          <span className="flex items-center gap-2 rounded-full border border-white/8 px-3 py-2 text-white/55"><StatusDot ok={result.axe?.available}/> axe-core {result.axe?.version || ''}</span>
          <span className="flex items-center gap-2 rounded-full border border-white/8 px-3 py-2 text-white/55"><StatusDot ok={result.rendered?.horizontal_overflow_px === 0}/> Mobile overflow</span>
        </div>
      </div>

      <div className="glass rounded-[32px] p-6 md:p-8">
        <div className="flex items-center justify-between"><div><div className="text-xs uppercase tracking-[.18em] text-white/35">Sua próxima fase</div><h3 className="mt-2 text-2xl font-semibold">Suba por missões, não por promessas.</h3></div><Trophy className="text-lime-300"/></div>
        <div className="mt-7 space-y-3">
          {[['Base técnica','Estrutura, mobile e segurança',findings.some(f=>f.criterion_code.includes('MOB')||f.criterion_code.includes('STR'))],['Medição','Tracking e evidências',findings.some(f=>f.criterion_code.includes('TRK') && f.status==='pass')],['Conversão','Experiência e caminho até ação',health != null && health>=75],['Ranking oficial','Bloqueado até Score validado',false]].map(([a,b,ok],i)=><div key={a} className="flex items-center gap-4 rounded-2xl border border-white/7 bg-black/15 p-4"><div className={`grid size-9 place-items-center rounded-xl ${ok?'bg-emerald-300/10 text-emerald-300':'bg-white/5 text-white/30'}`}>{ok?<Check size={16}/>:<span className="text-xs font-semibold">{i+1}</span>}</div><div className="flex-1"><div className="font-medium text-white/80">{a}</div><div className="text-xs text-white/35">{b}</div></div>{i===3 && <LockKeyhole size={15} className="text-white/25"/>}</div>)}
        </div>
      </div>
    </div>

    <div className="mt-10 grid gap-8 lg:grid-cols-[1.15fr_.85fr]">
      <div><div className="mb-5 flex items-end justify-between"><div><div className="text-xs uppercase tracking-[.18em] text-amber-200/55">Evidências</div><h3 className="mt-2 text-2xl font-semibold">Onde sua página está deixando força na mesa</h3></div><span className="text-sm text-white/35">{gaps.length} prioridades</span></div><div className="space-y-3">{gaps.length ? gaps.map(f=><FindingCard key={`${f.criterion_code}-${f.explanation}`} finding={f}/>) : <div className="glass rounded-3xl p-6 text-white/50">Nenhuma lacuna material foi encontrada nesta prévia limitada.</div>}</div></div>

      <div className="lg:sticky lg:top-5 lg:self-start"><div className="glass rounded-[30px] p-6"><div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-lime-300/10 text-lime-300"><WandSparkles size={19}/></div><div><div className="text-xs uppercase tracking-[.18em] text-white/35">Loja visual</div><h3 className="font-semibold">Monte a correção</h3></div></div><p className="mt-4 text-sm leading-6 text-white/45">Selecione apenas o que faz sentido. Comprar não dá pontos; somente uma nova auditoria pode validar melhoria real.</p><div className="mt-5 space-y-2">{recommendations.map(item=>{const Icon=item.icon;const on=selected.includes(item.key);return <button key={item.key} onClick={()=>setSelected(s=>on?s.filter(x=>x!==item.key):[...s,item.key])} className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition ${on?'border-emerald-300/25 bg-emerald-300/7':'border-white/7 bg-black/10 hover:bg-white/[.035]'}`}><div className={`grid size-9 place-items-center rounded-xl ${on?'bg-emerald-300/10 text-emerald-300':'bg-white/5 text-white/35'}`}><Icon size={17}/></div><div className="flex-1"><div className="text-sm font-medium text-white/80">{item.title}</div><div className="mt-0.5 text-xs text-white/35">{item.promise}</div></div><div className={`grid size-5 place-items-center rounded-full border ${on?'border-emerald-300/40 bg-emerald-300 text-[#06100d]':'border-white/15'}`}>{on&&<Check size={12}/>}</div></button>})}</div><button disabled={!selected.length} onClick={()=>setBriefOpen(true)} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-300 px-5 py-4 font-semibold text-[#06100d] transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-40">Montar meu plano <ArrowRight size={17}/></button></div></div>
    </div>

    <AnimatePresence>{briefOpen && <motion.div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}><motion.div initial={{y:24,opacity:0,scale:.98}} animate={{y:0,opacity:1,scale:1}} exit={{y:20,opacity:0}} className="glass max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[30px] p-6 md:p-8"><div className="flex items-start justify-between gap-4"><div><div className="text-xs uppercase tracking-[.18em] text-emerald-200/60">Briefing progressivo</div><h3 className="mt-2 text-2xl font-semibold">Seu plano já sabe o que foi detectado.</h3><p className="mt-2 text-sm text-white/45">Agora só precisamos do contexto comercial. Nenhuma senha ou acesso de conta é pedido aqui.</p></div><button onClick={()=>setBriefOpen(false)} className="grid size-9 place-items-center rounded-xl border border-white/8 text-white/40 hover:text-white"><X size={17}/></button></div>{saved?<div className="mt-8 rounded-3xl border border-emerald-300/20 bg-emerald-300/7 p-7 text-center"><div className="mx-auto grid size-12 place-items-center rounded-2xl bg-emerald-300 text-[#06100d]"><Check size={22}/></div><h4 className="mt-4 text-xl font-semibold">Plano registrado.</h4><p className="mt-2 text-sm text-white/50">O diagnóstico e suas escolhas ficaram vinculados ao mesmo token. O próximo passo comercial poderá ser automatizado sem você preencher tudo de novo.</p></div>:<form onSubmit={saveLead} className="mt-7 space-y-4"><div className="grid gap-4 md:grid-cols-2"><label className="text-sm text-white/55">Empresa<input value={form.company_name} onChange={e=>setForm({...form,company_name:e.target.value})} className="mt-2 w-full rounded-2xl border border-white/9 bg-black/20 px-4 py-3 text-white outline-none focus:border-emerald-300/35" placeholder="Nome da empresa"/></label><label className="text-sm text-white/55">Segmento<input value={form.segment} onChange={e=>setForm({...form,segment:e.target.value})} className="mt-2 w-full rounded-2xl border border-white/9 bg-black/20 px-4 py-3 text-white outline-none focus:border-emerald-300/35" placeholder="Ex.: clínica, SaaS, restaurante"/></label></div><div className="grid gap-4 md:grid-cols-2"><label className="text-sm text-white/55">E-mail para receber o plano *<input required type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} className="mt-2 w-full rounded-2xl border border-white/9 bg-black/20 px-4 py-3 text-white outline-none focus:border-emerald-300/35" placeholder="voce@empresa.com"/></label><label className="text-sm text-white/55">WhatsApp opcional<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} className="mt-2 w-full rounded-2xl border border-white/9 bg-black/20 px-4 py-3 text-white outline-none focus:border-emerald-300/35" placeholder="+55 ..."/></label></div><div className="grid gap-4 md:grid-cols-2"><label className="text-sm text-white/55">Objetivo<select value={form.goal} onChange={e=>setForm({...form,goal:e.target.value})} className="mt-2 w-full rounded-2xl border border-white/9 bg-[#0b1512] px-4 py-3 text-white outline-none"><option>Mais vendas</option><option>Mais leads</option><option>Melhorar conversão</option><option>Ganhar tráfego orgânico</option><option>Automatizar follow-up</option></select></label><label className="text-sm text-white/55">Ticket médio<select value={form.ticket_band} onChange={e=>setForm({...form,ticket_band:e.target.value})} className="mt-2 w-full rounded-2xl border border-white/9 bg-[#0b1512] px-4 py-3 text-white outline-none"><option value="">Prefiro não informar</option><option>Até R$100</option><option>R$100–500</option><option>R$500–2.000</option><option>R$2.000–10.000</option><option>Acima de R$10.000</option></select></label></div><label className="flex items-start gap-3 rounded-2xl border border-white/7 bg-black/15 p-4 text-sm text-white/45"><input type="checkbox" checked={form.marketing_consent} onChange={e=>setForm({...form,marketing_consent:e.target.checked})} className="mt-1"/><span>Quero receber conteúdos, benchmarks e oportunidades da Plutyx. <strong className="font-medium text-white/60">Opcional:</strong> não marcar esta caixa não impede o recebimento do plano solicitado.</span></label><button disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-300 px-5 py-4 font-semibold text-[#06100d] disabled:opacity-50">{saving?'Salvando...':'Receber meu plano'} <ArrowRight size={17}/></button></form>}</motion.div></motion.div>}</AnimatePresence>
  </section>;
}

function App() {
  const [snapshot, setSnapshot] = useState(null);
  const [url, setUrl] = useState('');
  const [phase, setPhase] = useState('home');
  const [token, setToken] = useState(() => localStorage.getItem('sac_preview_token') || '');
  const [status, setStatus] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(()=>{ api('snapshot').then(setSnapshot).catch(()=>{}); },[]);
  useEffect(()=>{
    if (!token || phase !== 'scan') return;
    let cancelled=false;
    const poll=async()=>{ try{ const data=await api('preview-status',{token}); if(cancelled)return; if(!data?.found){setError('Scan não encontrado.');setPhase('home');return;} setStatus(data.status); if(data.status==='completed'){setResult(data);setPhase('result');return;} if(data.status==='failed'){setError('A análise não concluiu desta vez. Tente novamente.');setPhase('home');return;} setTimeout(poll,2600);}catch{if(!cancelled)setTimeout(poll,3500);} };
    poll(); return()=>{cancelled=true};
  },[token,phase]);

  async function start(e){e.preventDefault();setError('');let candidate=url.trim();if(candidate && !/^https?:\/\//i.test(candidate))candidate=`https://${candidate}`;try{new URL(candidate)}catch{setError('Digite um domínio ou URL válido.');return;}setUrl(candidate);setPhase('scan');setStatus('queued');try{const data=await api('request-preview',{url:candidate});localStorage.setItem('sac_preview_token',data.token);setToken(data.token);setStatus(data.status);}catch(err){setPhase('home');setError(err.message==='daily_preview_limit'?'Limite diário de previews atingido neste dispositivo.':err.message==='scanner_busy'?'O scanner está cheio agora. Tente novamente em alguns minutos.':'Não foi possível iniciar a análise.');}}

  return <div className="sac-shell relative overflow-hidden"><div className="sac-grid pointer-events-none absolute inset-0"/><header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-5 py-5 md:px-8"><button onClick={()=>setPhase('home')} className="flex items-center gap-3"><div className="grid size-9 place-items-center rounded-xl border border-emerald-300/20 bg-emerald-300/8 text-emerald-300"><Gauge size={18}/></div><div className="text-left"><div className="text-xs font-semibold tracking-[.16em] text-white">PLUTYX</div><div className="text-[10px] uppercase tracking-[.18em] text-white/35">Ranking Conversão</div></div></button><div className="hidden items-center gap-2 rounded-full border border-white/8 bg-black/15 px-3 py-2 text-xs text-white/40 sm:flex"><StatusDot ok={true}/> Motor de preview online</div></header>

    {phase==='home' && <main className="relative z-10"><section className="mx-auto grid max-w-7xl gap-10 px-5 pb-24 pt-12 md:px-8 md:pt-20 lg:grid-cols-[1.08fr_.92fr] lg:items-center"><div><motion.div initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} className="inline-flex items-center gap-2 rounded-full border border-emerald-300/15 bg-emerald-300/6 px-3 py-2 text-xs text-emerald-100/70"><Sparkles size={14}/> Uma prova técnica antes da promessa comercial</motion.div><h1 className="text-balance mt-7 text-5xl font-semibold leading-[.96] tracking-[-.055em] md:text-7xl">Seu site venderia mais se soubesse <span className="text-emerald-300">onde está perdendo força.</span></h1><p className="mt-7 max-w-2xl text-balance text-base leading-7 text-white/50 md:text-lg">Cole a URL. Nós renderizamos a página de verdade, verificamos sinais técnicos e acessibilidade automatizada e transformamos as lacunas em uma trilha visual de melhoria.</p><form onSubmit={start} className="glass mt-8 flex max-w-2xl flex-col gap-3 rounded-[26px] p-3 sm:flex-row"><div className="flex flex-1 items-center gap-3 px-3"><Globe2 size={18} className="shrink-0 text-white/30"/><input value={url} onChange={e=>setUrl(e.target.value)} placeholder="seusite.com.br" className="min-w-0 flex-1 bg-transparent py-3 text-white outline-none placeholder:text-white/25"/></div><button className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-300 px-6 py-4 font-semibold text-[#06100d] transition hover:bg-emerald-200">Descobrir minha prévia <ArrowRight size={17}/></button></form>{error&&<div className="mt-3 flex items-center gap-2 text-sm text-amber-200/75"><CircleAlert size={15}/>{error}</div>}<div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-white/35"><span className="flex items-center gap-2"><ShieldCheck size={14}/> Proteção contra URLs privadas</span><span className="flex items-center gap-2"><Zap size={14}/> Chromium + axe-core</span><span className="flex items-center gap-2"><LockKeyhole size={14}/> Sem Score oficial fabricado</span></div></div><BenchmarkCard snapshot={snapshot}/></section>

      <section className="mx-auto max-w-7xl px-5 pb-28 md:px-8"><div className="mb-8 max-w-2xl"><div className="text-xs uppercase tracking-[.18em] text-white/35">O jogo muda de direção</div><h2 className="text-balance mt-3 text-3xl font-semibold md:text-5xl">Você não compra pontos. Você corrige evidências.</h2></div><div className="grid gap-4 md:grid-cols-3">{[[Radar,'1 · Descubra','O scanner encontra sinais observáveis e separa o que sabe do que não pode verificar.'],[Medal,'2 · Complete missões','Cada lacuna vira uma explicação curta e uma ação concreta — sem formulário gigante.'],[Trophy,'3 · Valide e suba','Depois da implementação, uma nova auditoria pode validar melhoria. Ranking oficial continua gated.']].map(([Icon,t,d])=><div key={t} className="glass rounded-[28px] p-6"><div className="grid size-11 place-items-center rounded-2xl bg-white/5 text-emerald-200"><Icon size={20}/></div><h3 className="mt-5 text-lg font-semibold">{t}</h3><p className="mt-2 text-sm leading-6 text-white/45">{d}</p></div>)}</div></section>
    </main>}
    {phase==='scan' && <Scanner url={url} status={status}/>} 
    {phase==='result' && result && <Result result={result} token={token}/>} 

    <footer className="relative z-10 border-t border-white/6 px-5 py-7 text-center text-xs text-white/30">Plutyx · Ranking Conversão · A prévia automatizada não substitui avaliação manual de acessibilidade nem representa SAC Score oficial.</footer>
  </div>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);
