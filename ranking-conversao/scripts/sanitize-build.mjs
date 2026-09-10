import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve('dist');
const replacements=[
  ['GCL Labs','GCL Intelligence'],
  ['GCL LABS','GCL INTELLIGENCE'],
  ['Community · Labs · Market','Community · Intelligence · Market'],
  ['evidência do SAC','evidência GCL'],
  ['Raio-X SAC','GCL Conversion Audit'],
  ['SAC Score','GCL Score'],
  ['SAC Awards','Global Conversion Awards'],
  ['Reconhecimento principal SAC','Reconhecimento principal GCL']
];
const forbidden=[
  'O corpus HTTP e o cohort',
  'Percentis do corpus profundo permanecem bloqueados',
  'Um selo que pode ser provado.',
  'Três sinais. Nenhum pay-to-win.',
  'GCL Labs',
  'GCL LABS',
  'chatgpt',
  'openai',
  'onrender.com',
  'vercel.app',
  'netlify.app',
  'localhost'
];

function files(dir){
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
    const p=path.join(dir,entry.name);
    return entry.isDirectory()?files(p):[p];
  });
}

if(!fs.existsSync(root))throw new Error('dist_not_found');
const targets=files(root).filter(p=>/\.(?:js|css|html|json)$/i.test(p));
let changed=0;
for(const file of targets){
  let text=fs.readFileSync(file,'utf8');
  const before=text;
  for(const [from,to] of replacements)text=text.split(from).join(to);
  if(text!==before){fs.writeFileSync(file,text);changed++;}
}
const violations=[];
for(const file of targets){
  const text=fs.readFileSync(file,'utf8').toLowerCase();
  for(const term of forbidden){
    if(text.includes(term.toLowerCase()))violations.push(`${path.relative(root,file)} :: ${term}`);
  }
}
if(violations.length){
  console.error('Production bundle hygiene failed:\n'+violations.join('\n'));
  process.exit(1);
}
console.log(`GCL production bundle sanitized: ${changed} file(s) normalized; ${targets.length} file(s) verified.`);
