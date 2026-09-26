import { MAX_RESUMES, CATEGORIES, TYPES, extractRequirements, createReport, buildCohorts, answerQuestion, suggestedQuestions } from './review-engine.js';

const PDF_MODULE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';
const PDF_WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['txt', 'pdf', 'docx']);

const state = {
  step: 1,
  jd: '',
  criteria: [],
  files: [],
  results: [],
  failures: [],
  review: new Map(),
  requirements: [],
  report: null,
  chatContext: {},
  documents: new Map(),
};

const elements = {
  alertRegion: document.querySelector('#alert-region'),
  jdText: document.querySelector('#jd-text'),
  jdFile: document.querySelector('#jd-file'),
  jdFileName: document.querySelector('#jd-file-name'),
  criteriaText: document.querySelector('#criteria-text'),
  continueButton: document.querySelector('#continue-button'),
  editJdButton: document.querySelector('#edit-jd-button'),
  jdPreviewText: document.querySelector('#jd-preview-text'),
  resumeFiles: document.querySelector('#resume-files'),
  resumeDropzone: document.querySelector('#resume-dropzone'),
  candidateCount: document.querySelector('#candidate-count'),
  fileList: document.querySelector('#file-list'),
  compareButton: document.querySelector('#compare-button'),
  metrics: document.querySelector('#metrics'),
  skippedFiles: document.querySelector('#skipped-files'),
  rankingBody: document.querySelector('#ranking-body'),
  resultCards: document.querySelector('#result-cards'),
  downloadButton: document.querySelector('#download-button'),
  changePoolButton: document.querySelector('#change-pool-button'),
  newReviewButton: document.querySelector('#new-review-button'),
};

function extensionOf(filename) {
  return String(filename).split('.').pop().toLowerCase();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function wordCount(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}

function showAlert(message, type = 'error') {
  elements.alertRegion.innerHTML = message
    ? `<div class="alert ${type}" role="alert">${escapeHtml(message)}</div>`
    : '';
  if (message) elements.alertRegion.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function setButtonBusy(button, busy, busyLabel, defaultLabel) {
  button.disabled = busy;
  button.innerHTML = busy ? escapeHtml(busyLabel) : defaultLabel;
}

function setStep(step) {
  state.step = step;
  for (const section of document.querySelectorAll('section.workspace-card[id^="step-"]')) {
    section.hidden = section.id !== `step-${step}`;
  }
  for (const marker of document.querySelectorAll('[data-step-marker]')) {
    const markerStep = Number(marker.dataset.stepMarker);
    marker.classList.toggle('active', markerStep === step);
    marker.classList.toggle('complete', markerStep < step);
  }
  showAlert('');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function sha256(file) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function parsePdf(file) {
  let pdfjs;
  try {
    pdfjs = await import(PDF_MODULE_URL);
  } catch {
    throw new Error('PDF reader could not load. Check whether cdnjs.cloudflare.com is permitted, or use TXT/DOCX.');
  }
  pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
  const document = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items.map((item) => item.str).join(' ').trim();
    if (text) pages.push(text);
  }
  return pages.join('\n');
}

async function parseDocx(file) {
  if (!window.mammoth?.extractRawText) {
    throw new Error('Word reader could not load. Check whether cdn.jsdelivr.net is permitted, or save the document as TXT.');
  }
  const result = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return result.value;
}

async function parseDocument(file) {
  const extension = extensionOf(file.name);
  if (!ALLOWED_EXTENSIONS.has(extension)) throw new Error('Unsupported format. Use TXT, PDF or DOCX.');
  if (file.size > MAX_FILE_SIZE) throw new Error('File exceeds the 10 MB limit.');

  let text;
  if (extension === 'txt') text = await file.text();
  else if (extension === 'pdf') text = await parsePdf(file);
  else text = await parseDocx(file);

  const cleaned = String(text || '')
    .replaceAll('\u0000', '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (wordCount(cleaned) < 5) {
    throw new Error('No readable text was found. Scanned PDFs need OCR before upload.');
  }
  return cleaned;
}

function renderFiles() {
  elements.candidateCount.textContent = `${state.files.length} of ${MAX_RESUMES}`;
  elements.compareButton.disabled = state.files.length < 5 || state.files.length > MAX_RESUMES;
  elements.fileList.innerHTML = state.files.map((file, index) => `
    <div class="file-item">
      <div class="file-meta">
        <span class="file-type">${escapeHtml(extensionOf(file.name).toUpperCase())}</span>
        <span class="file-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}<small class="file-size">${formatBytes(file.size)}</small></span>
      </div>
      <button class="remove-file" type="button" data-remove-index="${index}" aria-label="Remove ${escapeHtml(file.name)}">Remove</button>
    </div>
  `).join('');
}

function addFiles(fileList) {
  const incoming = [...fileList];
  const invalid = incoming.find((file) => !ALLOWED_EXTENSIONS.has(extensionOf(file.name)));
  if (invalid) {
    showAlert(`${invalid.name}: unsupported format. Use TXT, PDF or DOCX.`);
    return;
  }
  const combined = [...state.files, ...incoming];
  if (combined.length > MAX_RESUMES) {
    showAlert(`Select no more than ${MAX_RESUMES} resumes.`);
    return;
  }
  state.files = combined;
  elements.resumeFiles.value = '';
  renderFiles();
  showAlert('');
}

function renderResults() {
  elements.metrics.innerHTML = `
    <div class="metric"><span>Candidates compared</span><strong>${state.results.length}</strong></div>
    <div class="metric"><span>Strict / loose cohort</span><strong>${state.report.cohorts.strict.length} / ${state.report.cohorts.loose.length}</strong></div>
    <div class="metric"><span>Files skipped</span><strong>${state.failures.length}</strong></div>
  `;

  elements.skippedFiles.innerHTML = state.failures.length
    ? `<details class="skipped"><summary>${state.failures.length} skipped file${state.failures.length === 1 ? '' : 's'}</summary><ul>${state.failures.map((item) => `<li><strong>${escapeHtml(item.candidate)}:</strong> ${escapeHtml(item.error)}</li>`).join('')}</ul></details>`
    : '';

  elements.rankingBody.innerHTML = state.results.map((result, index) => `
    <tr>
      <td>${index + 1}</td>
      <td><strong>${escapeHtml(result.candidate)}</strong></td>
      <td><span class="score-chip">${result.verifiedRequirements}</span></td>
      <td>${result.evidenceCoverage}%</td>
    </tr>
  `).join('');

  elements.resultCards.innerHTML = state.results.map((result, index) => {
    const evidence = result.matchedEvidence.length
      ? result.matchedEvidence.map((item) => `<div class="evidence">${escapeHtml(item.text)}<small>Extracted text segment ${item.line}</small></div>`).join('')
      : '<div class="evidence">No strong overlapping excerpt was identified. Review the full resume manually.</div>';
    const checks = result.criterionChecks.length
      ? `<h3>Skill and phrase checks</h3><div class="checks">${result.criterionChecks.map((check) => `
          <div class="check-row ${check.found ? 'found' : 'missing'}">
            <strong>${check.found ? '✓' : '○'} ${escapeHtml(check.phrase)}</strong>
            <span>${escapeHtml(check.finding)}${check.evidence ? ` — “${escapeHtml(check.evidence)}”` : ''}</span>
          </div>`).join('')}</div>`
      : '';

    return `
      <details class="result-card" ${index === 0 ? 'open' : ''}>
        <summary>
          <span class="rank-badge">${index + 1}</span>
          <span class="candidate-title"><strong>${escapeHtml(result.candidate)}</strong><small>${result.verifiedRequirements} verified · ${result.evidenceCoverage}% evidence coverage</small></span>
          <span class="result-score">${state.report.cohorts.strict.includes(result.sourceSha256) ? 'Strict' : state.report.cohorts.loose.includes(result.sourceSha256) ? 'Loose' : 'Review gaps'}</span>
        </summary>
        <div class="result-content">
          <p>This candidate ranks ${index + 1} of ${state.results.length}. Review the excerpts and verify experience, skill depth, location, availability and compensation directly.</p>
          <h3>Evidence to review</h3>
          <div class="evidence-list">${evidence}</div>
          ${checks}
          <h3>Requirement-by-requirement analysis</h3>
          <div class="requirement-analysis">${result.requirementAnalysis.map((a) => `
            <article class="analysis-item">
              <strong>${escapeHtml(a.id)} · ${escapeHtml(a.description)}</strong>
              <p>${escapeHtml(a.category)} · ${escapeHtml(a.type)} · <b>${escapeHtml(a.verificationStatus)}</b> · ${escapeHtml(a.evidenceStrength)} evidence</p>
              ${a.gap ? `<p>${escapeHtml(a.gap)}</p>` : ''}
              ${a.candidateEvidence.map((e) => `<blockquote>${escapeHtml(e.text)}<small>${escapeHtml(e.candidate)}, extracted segment ${e.segment}</small></blockquote>`).join('')}
              ${a.notes.map((note) => `<small>${escapeHtml(note)}</small>`).join('')}
              ${a.verificationQuestion ? `<p><b>Ask:</b> ${escapeHtml(a.verificationQuestion)}</p>` : ''}
            </article>`).join('')}</div>
          <div class="action-row"><button type="button" class="button secondary" data-resume="${result.sourceSha256}">Download original resume</button><button type="button" class="button secondary" data-ask="${result.sourceSha256}">Ask about this candidate</button></div>
          <div class="review-controls">
            <label><input type="checkbox" data-shortlist="${result.sourceSha256}"> Add to shortlist</label>
            <input type="text" data-note="${result.sourceSha256}" aria-label="Recruiter notes for ${escapeHtml(result.candidate)}" placeholder="Recruiter justification or follow-up notes">
          </div>
        </div>
      </details>
    `;
  }).join('');
  renderCohorts();
}

async function continueToResumes() {
  showAlert('');
  setButtonBusy(elements.continueButton, true, 'Reading job description…', 'Continue to resumes <span aria-hidden="true">→</span>');
  try {
    const pasted = elements.jdText.value.trim();
    const uploaded = elements.jdFile.files[0];
    const jd = pasted || (uploaded ? await parseDocument(uploaded) : '');
    if (wordCount(jd) < 10) throw new Error('Provide a fuller job description containing at least 10 words.');
    state.jd = jd;
    state.criteria = elements.criteriaText.value
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean);
    state.requirements = extractRequirements(state.jd, state.criteria);
    renderRequirements();
    elements.jdPreviewText.textContent = `${state.jd}${state.criteria.length ? `\n\nPhrases to verify:\n• ${state.criteria.join('\n• ')}` : ''}`;
    setStep(2);
  } catch (error) {
    showAlert(error.message || String(error));
  } finally {
    setButtonBusy(elements.continueButton, false, '', 'Continue to resumes <span aria-hidden="true">→</span>');
  }
}

async function compareCandidates() {
  if (state.files.length < 5 || state.files.length > MAX_RESUMES) {
    showAlert('Select between 5 and 30 resumes.');
    return;
  }
  if (!document.querySelector('#confirm-requirements').checked) { showAlert('Review the extracted requirements and confirm them before comparing.'); return; }

  showAlert('');
  setButtonBusy(elements.compareButton, true, 'Reading resumes…', 'Compare candidates <span aria-hidden="true">→</span>');
  const records = [];
  const failures = [];
  const hashes = new Set();
  state.documents = new Map();

  for (let index = 0; index < state.files.length; index += 1) {
    const file = state.files[index];
    elements.compareButton.textContent = `Reading ${index + 1} of ${state.files.length}…`;
    try {
      const digest = await sha256(file);
      if (hashes.has(digest)) throw new Error('Duplicate file contents; already included.');
      const text = await parseDocument(file);
      hashes.add(digest);
      records.push({ candidate: file.name, text, sha256: digest, fileType: extensionOf(file.name) });
      state.documents.set(digest, file);
    } catch (error) {
      failures.push({ candidate: file.name, error: error.message || String(error) });
    }
  }

  try {
    if (records.length < 5) {
      throw new Error(`Only ${records.length} readable, unique resumes remain. At least 5 are required. Replace skipped files and try again.`);
    }
    elements.compareButton.textContent = 'Calculating relevance…';
    state.report = createReport(state.jd, records, state.requirements, failures, cohortOptions());
    state.results = state.report.results;
    state.failures = failures;
    state.review = new Map();
    state.chatContext = {};
    document.querySelector('#chat-messages').replaceChildren();
    document.querySelector('#chat-input').value = '';
    document.querySelector('#chat-candidate').innerHTML = '<option value="">Whole review</option>' + state.results.map((r) => `<option value="${r.sourceSha256}">${escapeHtml(r.candidate)}</option>`).join('');
    renderResults();
    renderSuggestions();
    setStep(3);
  } catch (error) {
    state.failures = failures;
    showAlert(error.message || String(error));
  } finally {
    setButtonBusy(elements.compareButton, false, '', 'Compare candidates <span aria-hidden="true">→</span>');
    elements.compareButton.disabled = state.files.length < 5 || state.files.length > MAX_RESUMES;
  }
}

function downloadReview() {
  syncReport();
  downloadJson(state.report, `neurosaur-review-${new Date().toISOString().slice(0, 10)}.json`);
  showAlert(`Review downloaded with ${state.report.shortlist.length} manually shortlisted candidates.`, 'success');
}

function syncReport() {
  if (!state.report) return;
  const selected = state.results.filter((result) => state.review.get(result.sourceSha256)?.selected);
  state.results.forEach((result) => {
    result.recruiterNote = state.review.get(result.sourceSha256)?.note || '';
    result.recruiterDecision = state.review.get(result.sourceSha256)?.selected ? 'shortlisted_by_recruiter' : 'not_selected_in_this_review';
  });
  state.report.shortlist = selected.map((r) => ({ candidate: r.candidate, sourceSha256: r.sourceSha256, recruiterNote: r.recruiterNote }));
  state.report.criteria = state.criteria;
}

function downloadJson(report, filename) {
  downloadBlob(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }), filename);
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function resetReview() {
  Object.assign(state, { step: 1, jd: '', criteria: [], files: [], results: [], failures: [], review: new Map(), requirements: [], report: null, chatContext: {}, documents: new Map() });
  document.querySelector('#chat-messages').replaceChildren();
  document.querySelector('#result-cards').replaceChildren();
  for (const id of ['cohort-summary', 'chat-suggestions', 'ranking-body', 'metrics', 'skipped-files', 'requirements-list']) document.querySelector(`#${id}`).replaceChildren();
  document.querySelector('#chat-candidate').innerHTML = '<option value="">Whole review</option>';
  document.querySelector('#chat-input').value = '';
  elements.jdText.value = '';
  elements.criteriaText.value = '';
  elements.jdFile.value = '';
  elements.resumeFiles.value = '';
  elements.jdFileName.hidden = true;
  renderFiles();
  setStep(1);
}

function renderRequirements() {
  document.querySelector('#confirm-requirements').checked = false;
  document.querySelector('#requirements-list').innerHTML = state.requirements.map((r, i) => `<div class="requirement-editor" data-requirement="${i}">
    <label>${escapeHtml(r.id)}<input aria-label="Requirement ${i + 1}" data-field="description" value="${escapeHtml(r.description)}" required></label>
    <label>Category<select data-field="category">${CATEGORIES.map((v) => `<option ${v === r.category ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    <label>Type<select data-field="type">${TYPES.map((v) => `<option ${v === r.type ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    <label>Minimum<input type="number" min="0" step="0.5" data-field="minimum" value="${r.minimum ?? ''}"></label>
    <label>Maximum<input type="number" min="0" step="0.5" data-field="maximum" value="${r.maximum ?? ''}"></label>
    <label>Unit<input data-field="unit" value="${escapeHtml(r.unit)}" placeholder="years, employees…"></label>
    <button class="remove-file" type="button" data-delete-requirement="${i}">Remove</button>
  </div>`).join('');
}
function cohortOptions() { return { strictLimit: Number(document.querySelector('#strict-limit').value), looseLimit: Number(document.querySelector('#loose-limit').value) }; }
function renderCohorts() {
  document.querySelector('#cohort-summary').innerHTML = ['strict', 'loose'].map((mode) => `<div><h3>${mode === 'strict' ? 'Strict' : 'Loose'} cohort · ${state.report.cohorts[mode].length}</h3><p>${escapeHtml(state.report.cohorts.policy[mode])}</p><ul>${state.results.filter((r) => state.report.cohorts[mode].includes(r.sourceSha256)).map((r) => `<li>${escapeHtml(r.candidate)}</li>`).join('') || '<li>No candidates meet this policy.</li>'}</ul><button type="button" class="button secondary" data-cohort-download="${mode}">Download ${mode} JSON</button></div>`).join('');
}
function renderSuggestions() {
  if (!state.report) return;
  document.querySelector('#chat-suggestions').innerHTML = suggestedQuestions(state.report, state.chatContext.candidateId).map((q) => `<button type="button" class="button ghost" data-question="${escapeHtml(q)}">${escapeHtml(q)}</button>`).join('');
}
function askBot(question) {
  if (!state.report || !question.trim()) return;
  syncReport();
  const answer = answerQuestion(state.report, question.slice(0, 2000), state.chatContext);
  if ('candidateId' in answer) state.chatContext.candidateId = answer.candidateId;
  document.querySelector('#chat-candidate').value = state.chatContext.candidateId || '';
  state.report.chat.push({ question, ...answer, at: new Date().toISOString() });
  const message = document.createElement('article');
  message.className = 'chat-message';
  message.innerHTML = `<b>You</b><p>${escapeHtml(question)}</p><b>Review assistant</b><p class="chat-answer">${escapeHtml(answer.text)}</p>${answer.citations.map((c) => `<blockquote>${escapeHtml(c.text)}<small>${escapeHtml(c.candidate)} · extracted segment ${c.segment}</small></blockquote>`).join('')}`;
  document.querySelector('#chat-messages').append(message);
  message.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  renderSuggestions();
}

document.querySelector('#requirements-list').addEventListener('input', (event) => {
  const row = event.target.closest('[data-requirement]');
  if (!row || !event.target.dataset.field) return;
  const field = event.target.dataset.field;
  state.requirements[Number(row.dataset.requirement)][field] = ['minimum', 'maximum'].includes(field) ? event.target.value === '' ? null : Number(event.target.value) : event.target.value;
  document.querySelector('#confirm-requirements').checked = false;
});
document.querySelector('#requirements-list').addEventListener('click', (event) => {
  const button = event.target.closest('[data-delete-requirement]');
  if (button) { state.requirements.splice(Number(button.dataset.deleteRequirement), 1); renderRequirements(); }
});
document.querySelector('#add-requirement').addEventListener('click', () => {
  const next = Math.max(0, ...state.requirements.map((r) => Number(r.id.split('-')[1]))) + 1;
  state.requirements.push({ id: `REQ-${String(next).padStart(2, '0')}`, description: '', category: 'Technical skill', type: 'Mandatory', sourceText: 'Recruiter added', minimum: null, maximum: null, unit: '' });
  renderRequirements();
});
document.querySelector('#update-cohorts').addEventListener('click', () => {
  state.report.cohorts = buildCohorts(state.results, cohortOptions());
  syncReport();
  renderResults();
  for (const input of elements.resultCards.querySelectorAll('[data-shortlist]')) input.checked = Boolean(state.review.get(input.dataset.shortlist)?.selected);
  for (const input of elements.resultCards.querySelectorAll('[data-note]')) input.value = state.review.get(input.dataset.note)?.note || '';
  askBot('Show strict and loose cohorts');
});
document.querySelector('#cohort-summary').addEventListener('click', (event) => {
  const mode = event.target.closest('[data-cohort-download]')?.dataset.cohortDownload;
  if (!mode) return;
  syncReport();
  downloadJson({ schemaVersion: state.report.schemaVersion, generatedAt: new Date().toISOString(), mode, policy: state.report.cohorts.policy[mode], requirements: state.report.requirements, results: state.results.filter((r) => state.report.cohorts[mode].includes(r.sourceSha256)) }, `neurosaur-${mode}-cohort.json`);
});
document.querySelector('#chat-form').addEventListener('submit', (event) => { event.preventDefault(); const input = document.querySelector('#chat-input'); askBot(input.value); input.value = ''; });
document.querySelector('#chat-suggestions').addEventListener('click', (event) => { const q = event.target.closest('[data-question]')?.dataset.question; if (q) askBot(q); });
document.querySelector('#chat-candidate').addEventListener('change', (event) => { state.chatContext = { candidateId: event.target.value || null }; renderSuggestions(); });
elements.resultCards.addEventListener('click', (event) => {
  const resume = event.target.closest('[data-resume]')?.dataset.resume;
  if (resume) { const file = state.documents.get(resume); if (file) downloadBlob(file, file.name); }
  const candidateId = event.target.closest('[data-ask]')?.dataset.ask;
  if (candidateId) { state.chatContext = { candidateId }; askBot(`What needs verification for ${state.results.find((r) => r.sourceSha256 === candidateId).candidate}?`); }
});

elements.jdFile.addEventListener('change', () => {
  const file = elements.jdFile.files[0];
  elements.jdFileName.hidden = !file;
  elements.jdFileName.textContent = file ? `Selected: ${file.name} (${formatBytes(file.size)})` : '';
});
elements.continueButton.addEventListener('click', continueToResumes);
elements.editJdButton.addEventListener('click', () => setStep(1));
elements.resumeFiles.addEventListener('change', () => addFiles(elements.resumeFiles.files));
elements.fileList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-remove-index]');
  if (!button) return;
  state.files.splice(Number(button.dataset.removeIndex), 1);
  renderFiles();
});

for (const eventName of ['dragenter', 'dragover']) {
  elements.resumeDropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.resumeDropzone.classList.add('dragging');
  });
}
for (const eventName of ['dragleave', 'drop']) {
  elements.resumeDropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.resumeDropzone.classList.remove('dragging');
  });
}
elements.resumeDropzone.addEventListener('drop', (event) => addFiles(event.dataTransfer.files));
elements.compareButton.addEventListener('click', compareCandidates);
elements.resultCards.addEventListener('input', (event) => {
  const hash = event.target.dataset.shortlist || event.target.dataset.note;
  if (!hash) return;
  const current = state.review.get(hash) || { selected: false, note: '' };
  if (event.target.dataset.shortlist) current.selected = event.target.checked;
  if (event.target.dataset.note) current.note = event.target.value;
  state.review.set(hash, current);
});
elements.downloadButton.addEventListener('click', downloadReview);
elements.changePoolButton.addEventListener('click', () => setStep(2));
elements.newReviewButton.addEventListener('click', resetReview);

renderFiles();
setStep(1);
