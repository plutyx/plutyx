from __future__ import annotations

import asyncio
from typing import Any

from axe_playwright_python.async_playwright import Axe

from convrank_worker import snapshot_axe_app as base

AXE_RULES = [
    "color-contrast",
    "button-name",
    "link-name",
    "image-alt",
    "input-button-name",
    "input-image-alt",
    "label",
    "select-name",
    "html-has-lang",
    "html-lang-valid",
    "aria-roles",
    "aria-valid-attr",
    "aria-valid-attr-value",
    "aria-required-attr",
    "aria-required-children",
    "aria-required-parent",
    "autocomplete-valid",
    "video-caption",
    "audio-caption",
    "meta-viewport",
    "nested-interactive",
]


# This collector runs against the current signed HTML snapshot. Page JavaScript remains
# disabled. These are deterministic DOM/CSS/viewport measurements, not RUM or eye-tracking.
base.METRICS_JS = r"""
() => {
  const visible = el => {
    if (!(el instanceof Element)) return false;
    const s=getComputedStyle(el),r=el.getBoundingClientRect();
    return s.display!=='none'&&s.visibility!=='hidden'&&parseFloat(s.opacity||'1')>0&&r.width>0&&r.height>0;
  };
  const text = el => ((el?.innerText||el?.textContent||el?.getAttribute?.('aria-label')||'')+'').replace(/\s+/g,' ').trim();
  const rect = el => { const r=el.getBoundingClientRect(); return {x:+r.x.toFixed(1),y:+r.y.toFixed(1),width:+r.width.toFixed(1),height:+r.height.toFixed(1),right:+r.right.toFixed(1),bottom:+r.bottom.toFixed(1)}; };
  const rgb = value => { const m=(value||'').match(/rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)/i); return m?[+m[1],+m[2],+m[3]]:null; };
  const lum = c => { if(!c)return null; const a=c.map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)}); return .2126*a[0]+.7152*a[1]+.0722*a[2]; };
  const contrast=(a,b)=>{const x=lum(rgb(a)),y=lum(rgb(b));if(x==null||y==null)return null;return +((Math.max(x,y)+.05)/(Math.min(x,y)+.05)).toFixed(2)};
  const centerDist=(a,b)=>{const ar=a.getBoundingClientRect(),br=b.getBoundingClientRect();return Math.round(Math.hypot(ar.x+ar.width/2-(br.x+br.width/2),ar.y+ar.height/2-(br.y+br.height/2)))};

  const controls=[...document.querySelectorAll('input:not([type=hidden]),select,textarea')].filter(visible);
  const missingLabels=controls.filter(el=>{
    if(el.getAttribute('aria-label')||el.getAttribute('aria-labelledby'))return false;
    if(el.id&&document.querySelector(`label[for="${CSS.escape(el.id)}"]`))return false;
    return !el.closest('label');
  }).length;
  const buttons=[...document.querySelectorAll('button,[role=button],input[type=submit],input[type=button]')].filter(visible);
  const links=[...document.querySelectorAll('a[href]')].filter(visible);
  const interactive=[...document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,[role=button],[tabindex]')].filter(visible);
  const target=interactive.map(el=>el.getBoundingClientRect());
  const targetUnder24=target.filter(r=>r.width<24||r.height<24).length;
  const targetUnder44=target.filter(r=>r.width<44||r.height<44).length;
  const invalidAnchors=[...document.querySelectorAll('a')].filter(visible).filter(a=>{const h=(a.getAttribute('href')||'').trim().toLowerCase();return !h||h==='#'||h.startsWith('javascript:')}).length;

  const headings=[...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(visible);
  let badHeadingJumps=0,last=0;
  for(const h of headings){const level=Number(h.tagName.substring(1));if(last&&level>last+1)badHeadingJumps++;last=level;}
  const positiveTabIndex=interactive.filter(el=>Number(el.getAttribute('tabindex')||0)>0).length;

  const fixedSticky=[...document.querySelectorAll('body *')].filter(el=>{if(!visible(el))return false;const p=getComputedStyle(el).position;return p==='fixed'||p==='sticky'});
  let maxOverlayPct=0;
  for(const el of fixedSticky.slice(0,80)){const r=el.getBoundingClientRect();const area=Math.max(0,Math.min(r.right,innerWidth)-Math.max(r.left,0))*Math.max(0,Math.min(r.bottom,innerHeight)-Math.max(r.top,0));maxOverlayPct=Math.max(maxOverlayPct,area/(innerWidth*innerHeight));}

  const sample=[...document.querySelectorAll('body *')].filter(visible).slice(0,900);
  const fontFamilies=new Set(),fontSizes=new Set(),colors=new Set(),backgrounds=new Set();
  for(const el of sample){const s=getComputedStyle(el);if(s.fontFamily)fontFamilies.add(s.fontFamily);if(s.fontSize)fontSizes.add(s.fontSize);if(s.color)colors.add(s.color);if(s.backgroundColor&&s.backgroundColor!=='rgba(0, 0, 0, 0)')backgrounds.add(s.backgroundColor);}
  const buttonSigs=buttons.map(el=>{const s=getComputedStyle(el);return [s.backgroundColor,s.color,s.borderRadius,s.fontSize,s.fontWeight,s.paddingTop,s.paddingRight,s.paddingBottom,s.paddingLeft].join('|')});
  const cards=sample.filter(el=>/(^|\s)(card|tile|panel|box)(\s|$)/i.test(el.className||'')||el.getAttribute('data-card')!==null);
  const cardSigs=cards.map(el=>{const s=getComputedStyle(el);return [s.backgroundColor,s.borderRadius,s.boxShadow,s.borderWidth,s.paddingTop,s.paddingRight,s.paddingBottom,s.paddingLeft].join('|')});
  const paragraphs=[...document.querySelectorAll('p')].filter(visible), paragraphWidths=paragraphs.map(el=>el.getBoundingClientRect().width).filter(Boolean);
  const h1=[...document.querySelectorAll('h1')].find(visible)||null,bodyStyle=getComputedStyle(document.body),h1Style=h1?getComputedStyle(h1):null;

  const ctaRe=/(comprar|assinar|começar|comecar|quero|garantir|inscrever|cadastrar|contratar|agendar|solicitar|testar|experimentar|download|baixar|falar|whatsapp|checkout|adquirir|ver planos|start|get started|buy|subscribe|book|demo|trial|sign up)/i;
  const ctas=[...document.querySelectorAll('a[href],button,[role=button],input[type=submit]')].filter(visible).filter(el=>ctaRe.test(text(el)||el.getAttribute('value')||''));
  const primaryCta=ctas.sort((a,b)=>{const ar=a.getBoundingClientRect(),br=b.getBoundingClientRect();const as=(ar.top<innerHeight?100000:0)+(ar.width*ar.height)-Math.max(0,ar.top);const bs=(br.top<innerHeight?100000:0)+(br.width*br.height)-Math.max(0,br.top);return bs-as})[0]||null;
  let primary=null;
  if(primaryCta){const cs=getComputedStyle(primaryCta),parent=primaryCta.parentElement?getComputedStyle(primaryCta.parentElement):getComputedStyle(document.body);primary={text:(text(primaryCta)||primaryCta.getAttribute('value')||'').slice(0,180),tag:primaryCta.tagName.toLowerCase(),rect:rect(primaryCta),above_fold:primaryCta.getBoundingClientRect().top<innerHeight,contrast_to_parent:contrast(cs.backgroundColor,parent.backgroundColor),text_contrast:contrast(cs.color,cs.backgroundColor),background:cs.backgroundColor,color:cs.color};}

  const trustRe=/(avalia|review|estrel|★★★★★|garantia|reembolso|devolu|troca grátis|compra segura|site seguro|cnpj|privacidade|termos|clientes|depoiment|trustpilot|reclame aqui|verified|seguro|ssl|money.?back|free return)/i;
  const trustMarkers=sample.filter(el=>{const t=text(el);if(!t||t.length>220||!trustRe.test(t))return false;return ![...el.children].some(c=>visible(c)&&trustRe.test(text(c)))}).slice(0,80);
  const trustDistances=primaryCta?trustMarkers.map(el=>centerDist(primaryCta,el)).filter(Number.isFinite):[];
  const bodyText=(document.body?.innerText||'').replace(/\s+/g,' ');
  const priceRe=/(R\$\s?\d|US\$\s?\d|\$\s?\d|€\s?\d|£\s?\d)/;
  const priceAboveFold=sample.some(el=>{const t=text(el);return !!t&&t.length<=120&&priceRe.test(t)&&el.getBoundingClientRect().top<innerHeight});
  const privacyLinks=links.filter(a=>/(privacidade|privacy)/i.test(text(a))).length;
  const termsLinks=links.filter(a=>/(termos|terms|condiç)/i.test(text(a))).length;

  const sensitiveTypes=new Set(['email','tel','password']);
  const missingAutocomplete=controls.filter(el=>sensitiveTypes.has((el.getAttribute('type')||'').toLowerCase())&&!el.getAttribute('autocomplete')).length;
  const formsDetail=[...document.forms].filter(visible).map(f=>{const cs=[...f.querySelectorAll('input:not([type=hidden]),select,textarea')].filter(visible);return {fields:cs.length,required:cs.filter(x=>x.required).length,action:(f.getAttribute('action')||'').slice(0,300),method:(f.getAttribute('method')||'get').toLowerCase(),has_email:cs.some(x=>(x.type||'').toLowerCase()==='email'),has_tel:cs.some(x=>(x.type||'').toLowerCase()==='tel'),has_password:cs.some(x=>(x.type||'').toLowerCase()==='password'),missing_autocomplete:cs.filter(x=>sensitiveTypes.has((x.type||'').toLowerCase())&&!x.getAttribute('autocomplete')).length}});

  return {
    title:document.title||null,
    h1_count:document.querySelectorAll('h1').length,
    heading_count:headings.length,
    heading_order_jumps:badHeadingJumps,
    images:document.images.length,
    images_missing_alt:[...document.images].filter(i=>!i.hasAttribute('alt')).length,
    form_controls:controls.length,
    form_controls_missing_label:missingLabels,
    sensitive_controls_missing_autocomplete:missingAutocomplete,
    forms_detail:formsDetail,
    buttons:buttons.length,
    unnamed_buttons:buttons.filter(el=>!((el.innerText||el.value||el.getAttribute('aria-label')||el.getAttribute('aria-labelledby')||'').trim())).length,
    links:links.length,
    unnamed_links:links.filter(el=>!((el.innerText||el.getAttribute('aria-label')||el.getAttribute('aria-labelledby')||el.querySelector('img[alt]')?.getAttribute('alt')||'').trim())).length,
    invalid_anchor_affordances:invalidAnchors,
    interactive_count:interactive.length,
    interactive_above_fold:interactive.filter(el=>el.getBoundingClientRect().top<innerHeight).length,
    target_under_24:targetUnder24,
    target_under_44:targetUnder44,
    positive_tabindex:positiveTabIndex,
    horizontal_overflow_px:Math.max(0,document.documentElement.scrollWidth-innerWidth),
    document_scroll_width:document.documentElement.scrollWidth,
    document_scroll_height:document.documentElement.scrollHeight,
    viewport_width:innerWidth,
    viewport_height:innerHeight,
    landmarks:{main:document.querySelectorAll('main,[role=main]').length,nav:document.querySelectorAll('nav,[role=navigation]').length,header:document.querySelectorAll('header,[role=banner]').length,footer:document.querySelectorAll('footer,[role=contentinfo]').length,aside:document.querySelectorAll('aside,[role=complementary]').length},
    dialogs:document.querySelectorAll('dialog,[role=dialog],[aria-modal=true]').length,
    live_regions:document.querySelectorAll('[aria-live],[role=status],[role=alert]').length,
    fixed_sticky_count:fixedSticky.length,
    max_fixed_overlay_pct:Number(maxOverlayPct.toFixed(4)),
    hero:{h1_text:h1?text(h1).slice(0,240):null,h1_rect:h1?rect(h1):null,h1_above_fold:h1?h1.getBoundingClientRect().top<innerHeight:false},
    cta:{count:ctas.length,above_fold_count:ctas.filter(el=>el.getBoundingClientRect().top<innerHeight).length,primary},
    trust:{marker_count:trustMarkers.length,nearest_to_primary_cta_px:trustDistances.length?Math.min(...trustDistances):null,privacy_links:privacyLinks,terms_links:termsLinks,price_visible_above_fold:priceAboveFold,guarantee_text:/(garantia|reembolso|money.?back)/i.test(bodyText),social_proof_text:/(avalia|review|estrel|depoiment|clientes|casos de sucesso|trustpilot)/i.test(bodyText)},
    css:{font_family_variants:fontFamilies.size,font_size_variants:fontSizes.size,text_color_variants:colors.size,background_color_variants:backgrounds.size,button_style_variants:new Set(buttonSigs).size,card_count:cards.length,card_style_variants:new Set(cardSigs).size,body_font_px:parseFloat(bodyStyle.fontSize||'0'),h1_font_px:h1Style?parseFloat(h1Style.fontSize||'0'):0,h1_body_ratio:h1Style&&parseFloat(bodyStyle.fontSize||'0')?Number((parseFloat(h1Style.fontSize)/parseFloat(bodyStyle.fontSize)).toFixed(2)):null,paragraph_width_avg:paragraphWidths.length?Math.round(paragraphWidths.reduce((a,b)=>a+b,0)/paragraphWidths.length):null,paragraph_width_max:paragraphWidths.length?Math.round(Math.max(...paragraphWidths)):null},
    text_chars:bodyText.trim().length
  };
}
"""


async def _axe_fast(page) -> dict[str, Any]:
    try:
        result = await asyncio.wait_for(
            Axe().run(
                page=page,
                options={
                    "runOnly": {"type": "rule", "values": AXE_RULES},
                    "resultTypes": ["violations"],
                },
            ),
            timeout=18.0,
        )
        raw = result.response
        violations = []
        for item in raw.get("violations", []):
            violations.append(
                {
                    "id": item.get("id"),
                    "impact": item.get("impact"),
                    "help": item.get("help"),
                    "description": item.get("description"),
                    "help_url": item.get("helpUrl"),
                    "tags": item.get("tags", []),
                    "nodes_count": len(item.get("nodes", [])),
                    "targets": [n.get("target", []) for n in item.get("nodes", [])[:8]],
                }
            )
        return {
            "available": True,
            "mode": "atomic_wcag_rules_18s",
            "rules_requested": AXE_RULES,
            "version": (raw.get("testEngine") or {}).get("version"),
            "violations_count": len(raw.get("violations", [])),
            "violations": violations,
            "disclosure": "Targeted axe-core automated checks only; absence of a violation is interpreted only for explicitly requested rules and manual WCAG evaluation is not implied.",
        }
    except asyncio.TimeoutError:
        return {"available": False, "mode": "atomic_wcag_rules_18s", "error": "axe_atomic_timeout_18s", "rules_requested": AXE_RULES}
    except Exception as exc:
        return {"available": False, "mode": "atomic_wcag_rules_18s", "error": str(exc)[:1000], "rules_requested": AXE_RULES}


base._axe = _axe_fast
base.APP_VERSION = "0.2.0-fast-axe-cro"
app = base.app
