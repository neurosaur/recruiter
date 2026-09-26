import assert from 'node:assert/strict';
import test from 'node:test';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { criterionChecks, rankCandidates, tokenize } from '../public/matcher.js';

const root = resolve(import.meta.dirname, '..');

test('Cloudflare configuration targets static assets on the Free plan', async () => {
  const config = JSON.parse(await readFile(resolve(root, 'wrangler.jsonc'), 'utf8'));
  assert.equal(config.name, 'recruiter');
  assert.equal(config.assets.directory, './dist');
  assert.equal(config.assets.not_found_handling, 'single-page-application');
  assert.equal(config.containers, undefined);
  assert.equal(config.durable_objects, undefined);
  await assert.rejects(access(resolve(root, 'requirements.txt')));
});

test('tokenize normalizes common word forms and keeps technical tokens', () => {
  const tokens = tokenize('Building Python APIs with C++ and PostgreSQL services');
  assert(tokens.includes('build'));
  assert(tokens.includes('python'));
  assert(tokens.includes('c++'));
  assert(tokens.includes('postgresql'));
});

test('rankCandidates orders the closer resume first', () => {
  const records = [
    { candidate: 'finance.txt', sha256: '1', fileType: 'txt', text: 'Financial reporting accounts payable reconciliation.' },
    { candidate: 'python.txt', sha256: '2', fileType: 'txt', text: 'Python engineer building FastAPI services with PostgreSQL and automated tests.' },
  ];
  const results = rankCandidates(
    'Python engineer required for FastAPI PostgreSQL services and automated testing.',
    records,
    ['Python', 'FastAPI'],
  );
  assert.equal(results[0].candidate, 'python.txt');
  assert(results[0].score > results[1].score);
  assert.equal(results[0].criterionCoverage, 100);
});

test('criterionChecks uses phrase boundaries', () => {
  const checks = criterionChecks('Used C++ and PostgreSQL\nPython developer', ['C++', 'SQL', 'Python']);
  assert.equal(checks[0].found, true);
  assert.equal(checks[1].found, false);
  assert.equal(checks[2].found, true);
});
