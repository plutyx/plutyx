import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(here, '..');
const repositoryDir = path.resolve(projectDir, '..');
const workflowNames = [
  'gcl-queue-experience-ci.yml',
  'gcl-production-proof.yml',
  'gcl-cross-browser.yml',
  'ranking-conversao.yml',
  'gcl-accessibility.yml',
  'gcl-ranking-ci.yml',
  'gcl-production-member-smoke.yml',
  'gcl-community-social-ci.yml',
];

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(projectDir, file), 'utf8'));
}

test('v86 pins remediated build and browser-test dependencies in the lockfile', () => {
  const manifest = readJson('package.json');
  const lockfile = readJson('package-lock.json');

  assert.equal(manifest.devDependencies['@playwright/test'], '1.63.0');
  assert.equal(manifest.devDependencies.vite, '7.3.6');
  assert.equal(lockfile.lockfileVersion, 3);
  assert.equal(lockfile.packages[''].devDependencies['@playwright/test'], '1.63.0');
  assert.equal(lockfile.packages[''].devDependencies.vite, '7.3.6');
  assert.equal(lockfile.packages['node_modules/@playwright/test'].version, '1.63.0');
  assert.equal(lockfile.packages['node_modules/vite'].version, '7.3.6');
});

test('v86 uses frozen installs with lifecycle scripts disabled in every GCL workflow', () => {
  for (const workflowName of workflowNames) {
    const workflow = fs.readFileSync(
      path.join(repositoryDir, '.github/workflows', workflowName),
      'utf8',
    );

    assert.match(
      workflow,
      /cache-dependency-path:\s*ranking-conversao\/package-lock\.json/,
      `${workflowName} must cache from the authoritative lockfile`,
    );
    assert.match(
      workflow,
      /npm ci --ignore-scripts --no-audit --no-fund/,
      `${workflowName} must use a frozen install with scripts disabled`,
    );
    assert.doesNotMatch(
      workflow,
      /cache-dependency-path:\s*ranking-conversao\/package\.json/,
      `${workflowName} must not key its cache from package.json`,
    );
  }
});
