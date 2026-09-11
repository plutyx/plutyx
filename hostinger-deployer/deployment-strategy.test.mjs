import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseDeployStrategy } from './deployment-strategy.mjs';

const direct = {
  HOSTINGER_FTP_SERVER: 'ftp.example.test',
  HOSTINGER_FTP_USERNAME: 'user',
  HOSTINGER_FTP_PASSWORD: 'secret',
  HOSTINGER_FTP_PATH: '/domains/plutyx.com/public_html/ranking-site',
};

const encrypted = {
  DEPLOY_PART_A: 'aaaaaaaa',
  DEPLOY_PART_B: 'bbbbbbbb',
  DEPLOY_PART_C: 'cccccccc',
};

test('prefers scoped direct FTPS credentials when complete', () => {
  assert.deepEqual(chooseDeployStrategy({ ...direct, ...encrypted }), {
    mode: 'direct_ftps',
    reason: 'direct_credentials_complete',
  });
});

test('uses encrypted deployer fallback when all three deploy fragments exist', () => {
  assert.deepEqual(chooseDeployStrategy(encrypted), {
    mode: 'encrypted_deployer',
    reason: 'encrypted_fragments_complete',
  });
});

test('fails closed when encrypted deploy fragments are incomplete', () => {
  assert.deepEqual(chooseDeployStrategy({ DEPLOY_PART_A: 'aaaaaaaa', DEPLOY_PART_B: 'bbbbbbbb' }), {
    mode: 'none',
    reason: 'deployment_credentials_unavailable',
  });
});

test('fails closed when direct FTPS path is outside ranking-site', () => {
  assert.deepEqual(chooseDeployStrategy({ ...direct, HOSTINGER_FTP_PATH: '/public_html' }), {
    mode: 'none',
    reason: 'direct_path_not_scoped',
  });
});
