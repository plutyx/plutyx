import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(
  new URL('../supabase/functions/gcl-ai-enrichment-worker/index.ts', import.meta.url),
  'utf8',
);

test('GCL AI 2.1 keeps the OpenRouter pipeline free and adds a fast refiner fallback', () => {
  assert.match(source, /PROMPT_VERSION='GCL-AI-2\.1'/);
  assert.match(source, /BASE_MODEL='nex-agi\/nex-n2\.5-mini:free'/);
  assert.match(source, /REFINE_MODEL='nvidia\/nemotron-3-ultra-550b-a55b:free'/);
  assert.match(source, /REFINE_FALLBACK_MODEL='nvidia\/nemotron-3\.5-lightning:free'/);
  assert.match(source, /async function refineResilient/);
  assert.match(source, /nemotron_lightning_fallback/);
  assert.match(source, /refine_primary_error/);
  assert.match(source, /refine_attempts/);
});

test('OpenRouter requests use the official attribution header and compact refiner evidence', () => {
  assert.doesNotMatch(source, /'X-Title'/);
  assert.match(source, /'X-OpenRouter-Title':'Global Conversion League'/);
  assert.match(source, /content_excerpt:str\(p\.reader\.content_excerpt,800\)/);
  assert.match(source, /provider:\{sort:'throughput'\}/);
});
