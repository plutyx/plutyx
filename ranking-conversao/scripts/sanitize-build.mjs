import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve('dist');
const forbidden=[
  'O corpus HTTP e o cohort',
  'Percentis do corpus profundo permanecem bloqueados',
  'Um selo que pode ser provado.',
  'pay-to-win',
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
console.log(`GCL production bundle verified: ${targets.length} file(s), zero forbidden branding/copy.`);
