import fs from 'node:fs';
import path from 'node:path';

const sha=process.env.RENDER_GIT_COMMIT||process.env.GITHUB_SHA||process.env.VERCEL_GIT_COMMIT_SHA||'local';
const body={
  source_sha:sha,
  built_at:new Date().toISOString(),
  base_path:'/ranking-site/',
  application:'Global Conversion League',
  artifact:'hostinger-production-bundle'
};
const out=path.resolve('dist/gcl-build.json');
fs.writeFileSync(out,JSON.stringify(body,null,2)+'\n');
console.log(`Wrote ${out} for ${sha.slice(0,12)}`);
