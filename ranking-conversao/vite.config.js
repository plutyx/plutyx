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
  ['Reconhecimento principal SAC','Reconhecimento principal GCL'],
  ['Competition without pay-to-win','Competição por mérito digital'],
  ['Pagamento libera participação, visibilidade e serviços. Nunca compra posição ou Award.','Cada conquista nasce da evolução do site ao longo da temporada.'],
  ['Posição é conquistada. Compra não altera score. Dados observados, estimados e first-party permanecem identificados separadamente.','Cada rodada revela uma nova oportunidade: analise, implemente, reaudite e veja até onde seu site consegue chegar.'],
  ['A assinatura compra presença; a posição continua determinada pela evidência GCL.','Entre no placar oficial e acompanhe sua evolução a cada rodada.'],
  ['O ranking oficial começa vazio por design: benchmark não é participante. O primeiro site pagante e elegível inaugura o placar.','As primeiras posições da Founding Season ainda estão abertas. Seu site pode inaugurar essa história.']
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

function stableVendorChunks(id){
  if(!id.includes('/node_modules/'))return;
  if(id.includes('/node_modules/react/')||id.includes('/node_modules/react-dom/')||id.includes('/node_modules/scheduler/'))return 'vendor-react';
  if(id.includes('/node_modules/lucide-react/'))return 'vendor-icons';
}

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/ranking-site/',
  plugins: [canonicalCopy(),tailwindcss(), react()],
  build: {
    target: 'es2022',
    sourcemap: false,
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions:{
      output:{manualChunks:stableVendorChunks}
    }
  },
});
