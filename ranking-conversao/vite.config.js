import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const canonicalReplacements=[
  ['GCL Labs','GCL Intelligence'],
  ['GCL LABS','GCL INTELLIGENCE'],
  ['Community · Labs · Market','Community · Intelligence · Market'],
  ['evidência do SAC','evidência GCL'],
  ['Raio-X SAC','GCL Conversion Audit'],
  ['SAC Score','GCL Score'],
  ['SAC Awards','Global Conversion Awards'],
  ['Reconhecimento principal SAC','Reconhecimento principal GCL']
];

function canonicalCopy(){
  return {
    name:'gcl-canonical-copy',
    enforce:'pre',
    transform(code,id){
      if(!/\/src\/.*\.(?:js|jsx|ts|tsx)$/.test(id))return null;
      let next=code;
      for(const [from,to] of canonicalReplacements)next=next.split(from).join(to);
      return next===code?null:{code:next,map:null};
    }
  };
}

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/ranking-site/',
  plugins: [canonicalCopy(),tailwindcss(), react()],
  build: {
    target: 'es2022',
    sourcemap: false,
    outDir: 'dist',
    assetsDir: 'assets',
  },
});
