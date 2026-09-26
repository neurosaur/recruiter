import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_RESUMES, extractRequirements, evaluateRequirement, createReport, buildCohorts, answerQuestion, suggestedQuestions } from '../public/review-engine.js';

const requirement = (description, overrides = {}) => ({ id: 'REQ-01', description, category: 'Technical skill', type: 'Mandatory', minimum: null, maximum: null, unit: '', ...overrides });
const record = (text, i = 1) => ({ candidate: `candidate-${i}.txt`, sha256: String(i), fileType: 'txt', text });
const evaluate = (description, text, overrides) => evaluateRequirement(requirement(description, overrides), record(text), 2026);

test('extracts distinct skills, preferred and context sections, scoped experience', () => {
  const rows = extractRequirements('Required\nPython, SQL and SAP\n10 years HR experience, including 5 years manufacturing and 3 years managing an HR team.\nPreferred\nPower BI\nAbout us\nWe are a friendly growing company.');
  assert(rows.some((r) => r.description === 'Python' && r.type === 'Mandatory'));
  assert(rows.some((r) => r.description === 'Power BI' && r.type === 'Preferred'));
  assert(rows.some((r) => r.minimum === 5 && /manufacturing/.test(r.description)));
  assert.equal(rows.at(-1).type, 'Context');
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length);
});

test('distinguishes demonstrated work, skill list mentions, missing, partial and negative evidence', () => {
  assert.equal(evaluate('Python', 'Skills: Python, SQL').verificationStatus, 'Mentioned');
  assert.equal(evaluate('Python', 'Skills: Python\nBuilt production services using Python.').verificationStatus, 'Verified');
  assert.equal(evaluate('SQL', 'Used PostgreSQL extensively.').verificationStatus, 'Not Found');
  assert.equal(evaluate('computer vision', 'Developed computer applications.').verificationStatus, 'Partial');
  assert.equal(evaluate('SAP', 'No experience with SAP.').verificationStatus, 'Contradicted');
  assert.equal(evaluate('Python', 'No experience with SAP but developed Python services.').verificationStatus, 'Verified');
});

test('compares scoped experience without borrowing an unrelated total', () => {
  const options = { category: 'Experience', minimum: 5, unit: 'years' };
  const result = evaluate('5 years manufacturing HR experience', '12 years HR experience, including 2 years manufacturing HR experience.', options);
  assert.equal(result.candidateValue, 2);
  assert.equal(result.verificationStatus, 'Contradicted');
  assert.equal(evaluate('5 years SAP experience', 'SAP consultant since graduation in 2021.', options).verificationStatus, 'Requires Verification');
  assert.equal(evaluate('5 years SAP experience', '6 years SAP experience.', options).verificationStatus, 'Verified');
  assert.equal(evaluate('5 years SAP experience', '3+ years SAP experience.', options).verificationStatus, 'Requires Verification');
  assert.equal(evaluate('5 years SAP experience', '3–6 years SAP experience.', options).verificationStatus, 'Requires Verification');
});

test('dates are conservative estimates, overlapping jobs do not establish exact duration', () => {
  const result = evaluate('5 years SAP experience', 'SAP consultant 2018–2024\nSAP consultant 2020–2025', { category: 'Experience', minimum: 5, unit: 'years' });
  assert.equal(result.candidateValue, 6);
  assert.equal(result.verificationStatus, 'Requires Verification');
  assert.match(result.experienceEstimate.method, /overlapping/);
});

test('external rankings, qualifications, relocation and stale skills remain cautious', () => {
  assert.equal(evaluate('two Q1 journal publications', 'Published two Q1 journal publications.', { category: 'Achievement', minimum: 2, unit: 'q1 journal publications' }).verificationStatus, 'Requires Verification');
  assert.equal(evaluate('PhD in Computer Science or related discipline', 'PhD in Physics, Example University.', { category: 'Qualification' }).verificationStatus, 'Requires Verification');
  assert.equal(evaluate('PhD in Computer Science', 'PhD in Computer Science, Example University, 2022.', { category: 'Qualification' }).verificationStatus, 'Verified');
  assert.notEqual(evaluate('Location Chennai', 'Current location Delhi', { category: 'Eligibility' }).verificationStatus, 'Contradicted');
  assert.equal(evaluate('Python', 'Built Python services 2018–2019.').verificationStatus, 'Requires Verification');
});

test('30 candidate report yields capped cohorts, JSON, citations and consistent chatbot answers', () => {
  assert.equal(MAX_RESUMES, 30);
  const records = Array.from({ length: 30 }, (_, i) => record(i < 12 ? 'Built Python services and delivered production APIs.' : i < 25 ? 'Skills: Python. Worked on operational support.' : 'Accounting and financial reporting experience.', i));
  const report = createReport('Python is required to develop software services for the platform team.', records, [requirement('Python')]);
  assert.equal(report.results.length, 30);
  assert.equal(report.cohorts.strict.length, 10);
  assert.equal(report.cohorts.loose.length, 20);
  assert.equal(buildCohorts(report.results, { strictLimit: 5, looseLimit: 15 }).strict.length, 5);
  assert.equal(JSON.parse(JSON.stringify(report)).candidateSources.length, 30);
  assert.match(answerQuestion(report, 'Show strict and loose cohorts').text, /STRICT — 10 candidates/);
  assert.match(answerQuestion(report, 'Show strict and loose cohorts').text, /LOOSE — 20 candidates/);
  assert.match(answerQuestion(report, 'Who did I shortlist?').text, /not manually shortlisted/);
  report.results[0].recruiterDecision = 'shortlisted_by_recruiter';
  assert.match(answerQuestion(report, 'Who did I shortlist?').text, /manually selected/);
  const answer = answerQuestion(report, 'What evidence supports candidate-0.txt?');
  assert.equal(answer.citations[0].sourceSha256, '0');
  assert.match(answer.citations[0].text, /Built Python/);
  assert.equal(answer.candidateId, '0');
  assert.match(answerQuestion(report, 'What are the gaps?', { candidateId: '15' }).text, /candidate-15/);
  assert.match(answerQuestion(report, 'Why is candidate-15.txt not in the strict cohort?').text, /Mentioned/);
  assert(suggestedQuestions(report, '15').some((q) => /Python/.test(q)));
});

test('does not pad cohorts or treat missing evidence as rejection', () => {
  const report = createReport('Python is a required skill for this software engineering role.', Array.from({ length: 5 }, (_, i) => record('Accounts and business reporting with financial analysis.', i)), [requirement('Python')]);
  assert.deepEqual(report.cohorts.strict, []);
  assert.deepEqual(report.cohorts.loose, []);
  assert.match(report.results[0].gaps[0].gap, /does not establish absence/);
  assert.match(answerQuestion(report, 'quantum entanglement').text, /cannot establish/);
  assert.equal(buildCohorts([{ ...report.results[0], requirementAnalysis: [requirement('Python', { type: 'Preferred', verificationStatus: 'Verified' })] }]).strict.length, 0);
});

test('validates pool boundaries, duplicate hashes and incomplete edited requirements', () => {
  const records = Array.from({ length: 31 }, (_, i) => record('Built Python software services for production.', i));
  assert.throws(() => createReport('Python', records, [requirement('Python')]), /5–30/);
  assert.throws(() => createReport('Python', records.slice(0, 4), [requirement('Python')]), /5–30/);
  assert.throws(() => createReport('Python', Array(5).fill(records[0]), [requirement('Python')]), /Duplicate/);
  assert.throws(() => createReport('Python', records.slice(0, 5), [requirement('')]), /Complete/);
  assert.throws(() => createReport('Python', records.slice(0, 5), [requirement('Python', { minimum: 5, maximum: 2, unit: 'years' })]), /bounds/);
});
