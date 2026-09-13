import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const commercePath = path.resolve(here, '../src/production-commerce-v6.js');
const source = fs.readFileSync(commercePath, 'utf8');

test('commerce UI no longer tells users that Stripe live still needs to be connected', () => {
  assert.doesNotMatch(source, /Stripe live estiver conectada/i);
  assert.doesNotMatch(source, /Conecte Stripe live/i);
  assert.doesNotMatch(source, /ativação Stripe live/i);
});

test('commerce UI explains the real fail-closed commercial-release state', () => {
  assert.match(source, /release comercial/i);
  assert.match(source, /infraestrutura Stripe live/i);
  assert.match(source, /nenhuma cobrança real é aberta enquanto os controles de go-live estiverem pendentes/i);
});
