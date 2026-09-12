import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(
  new URL('../supabase/functions/gcl-ai-enrichment-worker/index.ts', import.meta.url),
  'utf8',
);

test('GCL AI 2.3 promotes the faster free refiner and retains Ultra recovery', () => {
  assert.match(source, /PROMPT_VERSION='GCL-AI-2\.3'/);
  assert.match(source, /BASE_MODEL='nex-agi\/nex-n2\.5-mini:free'/);
  assert.match(source, /REFINE_MODEL='nvidia\/nemotron-3\.5-lightning:free'/);
  assert.match(source, /REFINE_FALLBACK_MODEL='nvidia\/nemotron-3-ultra-550b-a55b:free'/);
  assert.match(source, /route:'nemotron_lightning'/);
  assert.match(source, /route:'nemotron_ultra_fallback'/);
  assert.match(source, /REFINE_MODEL,24000/);
  assert.match(source, /REFINE_FALLBACK_MODEL,30000/);
});

test('the adaptive route preserves attribution, compact evidence and telemetry', () => {
  assert.doesNotMatch(source, /'X-Title'/);
  assert.match(source, /'X-OpenRouter-Title':'Global Conversion League'/);
  assert.match(source, /content_excerpt:str\(p\.reader\.content_excerpt,500\)/);
  assert.doesNotMatch(source, /field_metrics:x\.field_metrics/);
  assert.doesNotMatch(source, /axe:p\.browser\?\.axe/);
  assert.match(source, /provider:\{sort:'throughput'\}/);
  assert.match(source, /refine_primary_error/);
  assert.match(source, /refine_attempts/);
  assert.match(source, /refine_input_chars/);
  assert.match(source, /RefineRouteError/);
  assert.match(source, /refinement_fallback_error/);
});
