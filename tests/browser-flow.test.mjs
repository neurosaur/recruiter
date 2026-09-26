import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import * as engine from '../public/review-engine.js';

// Exercise the actual controller with a small DOM adapter: no server, browser install,
// or model downloads. Rendering/reader integration still needs a hosted browser check.
test('controller smoke: 30 uploads → report → chat → selection → download → reset', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const elements = new Map();
  function element(id = '') {
    return { id, innerHTML: '', textContent: '', value: '', checked: false, disabled: false, hidden: false, files: [], dataset: {}, listeners: {}, classList: { toggle() {}, add() {}, remove() {} },
      addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
      querySelectorAll() { return []; }, replaceChildren() { this.innerHTML = ''; this.children = []; },
      append(child) { (this.children ||= []).push(child); }, scrollIntoView() {}, click() {}, remove() {} };
  }
  for (const match of html.matchAll(/id="([^"]+)"/g)) elements.set(match[1], element(match[1]));
  for (const removed of ['strict-limit', 'loose-limit', 'requirements-list', 'confirm-requirements', 'criteria-text']) assert(!elements.has(removed));
  const document = { querySelector(selector) { assert(selector.startsWith('#'), selector); assert(elements.has(selector.slice(1)), `Missing element ${selector}`); return elements.get(selector.slice(1)); },
    querySelectorAll(selector) { return selector.startsWith('section.') ? [1, 2, 3].map((i) => elements.get(`step-${i}`)) : []; }, createElement: element, body: element() };
  const downloads = [];
  const context = vm.createContext({ ...engine, document, window: { scrollTo() {} }, crypto: webcrypto, Blob, Set, Map, console,
    URL: { createObjectURL(blob) { downloads.push(blob); return 'blob:smoke'; }, revokeObjectURL() {} }, setTimeout(fn) { fn(); } });
  const source = (await readFile(new URL('../public/app.js', import.meta.url), 'utf8')).replace(/^import .*?;\r?\n/gm, '');
  vm.runInContext(`${source}\nglobalThis.controller = { state, continueToResumes, compareCandidates, addFiles, askBot, downloadReview, resetReview };`, context);
  const controller = context.controller;
  elements.get('jd-text').value = 'Required\nPython is required to develop software services for a growing engineering platform.';
  await controller.continueToResumes();
  assert.equal(controller.state.step, 2);
  const files = Array.from({ length: 30 }, (_, i) => new File([`Built Python services and delivered software for project number ${i}.`], `engineer-${i}.txt`, { type: 'text/plain' }));
  controller.addFiles(files);
  assert.equal(elements.get('candidate-count').textContent, '30 of 30');
  controller.addFiles([new File(['extra resume'], 'extra.txt')]);
  assert.equal(controller.state.files.length, 30);
  assert.match(elements.get('alert-region').innerHTML, /no more than 30/);
  await controller.compareCandidates();
  assert.equal(controller.state.step, 3);
  assert.equal(controller.state.report.results.length, 30);
  assert.equal(controller.state.report.cohort.length, 30);
  assert(controller.state.report.requirements.length > 0);
  assert.equal(controller.state.report.cohorts, undefined);
  assert.match(elements.get('result-cards').innerHTML, /JD evidence and gaps/);
  controller.askBot('Show everyone in ranked order');
  assert.match(controller.state.report.chat[0].text, /30 candidates total/);
  const first = controller.state.results[0];
  controller.state.review.set(first.sourceSha256, { selected: true, note: 'Follow up with recruiter' });
  controller.askBot('Who did I shortlist?');
  assert.match(controller.state.report.chat.at(-1).text, /Follow up with recruiter/);
  controller.askBot("Who hasn't completed a PhD?");
  assert.match(controller.state.report.chat.at(-1).text, /completion unknown/);
  assert.equal(controller.state.report.shortlist.length, 1);
  controller.downloadReview();
  const report = JSON.parse(await downloads.at(-1).text());
  assert.equal(report.results.length, 30);
  assert.equal(report.shortlist[0].recruiterNote, 'Follow up with recruiter');
  assert.equal(report.chat.length, 3);
  assert.equal(report.candidateSources.length, 30);
  controller.resetReview();
  assert.equal(controller.state.report, null);
  assert.equal(controller.state.documents.size, 0);
  assert.equal(elements.get('chat-messages').children.length, 0);
});
