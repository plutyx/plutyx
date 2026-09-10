import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';

const BASE=process.env.GCL_E2E_BASE||'http://127.0.0.1:4173/ranking-site';
const routes=['/','/ranking/','/awards/','/community/','/services/','/blog/','/about/','/account/'];

const article={slug:'a11y-gcl',title:'Como a GCL mede experiências de conversão',excerpt:'Pesquisa e metodologia da Founding Season.',body_markdown:'Evidência observável antes de pontuação.',category_name:'GCL Research',category_slug:'research',published_at:'2026-09-10T12:00:00Z'};
const award={award_code:'CONVERSION_EXCELLENCE',label:'Conversion Excellence',award_family:'conversion',description:'Reconhecimento para experiências digitais de alta conversão.',threshold:80,minimum_coverage:.6};
const home={ranking:[],awards_catalog:[award],offers:{awards:{price:297},community:{price:39},ranking:{price:59},club:{price:79}},market:{listings:[{slug:'cro-sprint',title:'CRO Sprint',summary:'Implementação orientada pelos gaps observados.',category:'Conversion',platforms:['Web'],pricing_model:'project',featured:true}]},stats:{active_public_metrics:684,metric_catalog_total:779,validated_metrics:500,benchmark_http_successful:11668,community_posts:9,market_listings:10},benchmark_story:{http_successful_audits:11668,successful_audits:13823},latest_articles:[article],community_preview:{headline:'Entre no vestiário antes de entrar em campo.',description:'Uma amostra editorial da Founding Season.',published_official_posts:9,spaces:11,posts:[{space_name:'Liga',post_type:'announcement',title:'Founding Season 2026',body:'Descubra seu score e volte para medir a evolução.',author_name:'GCL Intelligence',author_role:'Oficial'}]}};

async function mockPublic(page){
  await page.route('**/functions/v1/sac-ranking-site-api',async route=>{
    let body={};try{body=JSON.parse(route.request().postData()||'{}')}catch{}
    const action=String(body.action||'');let result={};
    if(action==='home')result=home;
    else if(action==='awards_methodology')result={season:{awards_at:'2026-12-18T20:00:00-03:00'},award_catalog:[award]};
    else if(action==='nominees')result=[];
    else if(action==='blog_index')result=[article];
    else if(action==='blog_post')result=article;
    else if(action==='offers')result=home.offers;
    else if(action==='health')result={status:'healthy'};
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,result})});
  });
}

function compact(v){return {id:v.id,impact:v.impact,help:v.help,helpUrl:v.helpUrl,nodes:v.nodes.slice(0,8).map(n=>({target:n.target,html:n.html,failureSummary:n.failureSummary}))};}

test('critical public GCL journeys have no serious or critical WCAG A/AA violations',async({page})=>{
  await mockPublic(page);
  const report={captured_at:new Date().toISOString(),base:BASE,routes:[],blocking:[]};
  for(const path of routes){
    await page.goto(`${BASE}${path}`,{waitUntil:'domcontentloaded'});
    await page.waitForTimeout(350);
    const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
    const violations=result.violations.map(compact);
    const blocking=violations.filter(v=>v.impact==='serious'||v.impact==='critical');
    report.routes.push({path,violations});
    for(const v of blocking)report.blocking.push({path,...v});
  }
  fs.writeFileSync('a11y-result.json',JSON.stringify(report,null,2));
  expect(report.blocking,JSON.stringify(report.blocking,null,2)).toEqual([]);
});
