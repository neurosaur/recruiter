import { rankCandidates, tokenize } from './matcher.js';

export const MAX_RESUMES = 30;
export const CATEGORIES = ['Eligibility', 'Experience', 'Qualification', 'Technical skill', 'Responsibility', 'Scope', 'Industry', 'Achievement', 'Context'];
export const TYPES = ['Mandatory', 'Preferred', 'Responsibility', 'Context'];
const TERMS = ['Python', 'TensorFlow', 'PyTorch', 'SAP', 'Excel', 'Power BI', 'SQL', 'PostgreSQL', 'FastAPI', 'AutoCAD', 'Computer Vision', 'Edge AI', 'LeJepa', 'recruitment', 'employee relations', 'payroll', 'performance management', 'training', 'grant writing', 'student mentoring', 'international collaboration', 'project management', 'sales', 'manufacturing', 'automotive', 'BFSI', 'healthcare', 'SaaS', 'pharma', 'hospitality', 'construction'];
const ACTION = /\b(developed|built|implemented|delivered|managed|led|designed|deployed|used|conducted|published|supported|trained|mentored|achieved|created|performed|responsible for)\b/i;
const NEGATIVE = /\b(no experience|never used|not proficient|do not have|does not have|lack(?:s|ing)?|without experience|not certified|expired|not eligible|not authorized)\b/i;
const GENERIC = new Set(tokenize('required mandatory essential preferred minimum maximum experience experienced including relevant total skill skills knowledge ability proficiency strong excellent must should candidate candidates demonstrate demonstrated related discipline using use years degree qualification responsibilities responsibility team work in of with and or at least more than up to'));
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const phrase = (s) => new RegExp(`(?<!\\w)${escapeRegex(s.trim()).replace(/\s+/g, '\\s+')}(?!\\w)`, 'i');
export function segments(text) {
  return String(text || '').split(/\r?\n|(?<=[.!?])\s+(?=[A-Z])|,?\s+(?:including|and)\s+(?=\d+\s*\+?\s*(?:years?|yrs?))|,\s*(?=\d+\s*\+?\s*(?:years?|yrs?))|\s+(?:but|whereas|and (?=no experience|never used))\s*/i).map((text, i) => ({ segment: i + 1, text: text.trim() })).filter((s) => s.text);
}

function categoryOf(text) {
  if (/\b(publication|publications|journal|patent|award|Q1)\b/i.test(text)) return 'Achievement';
  if (/\b(degree|PhD|Ph\.D|bachelor|master|diploma|certification|certified|license)\b/i.test(text)) return 'Qualification';
  if (/\b(years?|months?)\b/i.test(text)) return 'Experience';
  if (/\b(location|relocat|authorization|clearance|language|eligible|based in)/i.test(text)) return 'Eligibility';
  if (/\b(budget|direct reports|employees|team size|geographic|business.unit)\b/i.test(text)) return 'Scope';
  if (/\b(industry|domain|manufacturing|automotive|BFSI|healthcare|SaaS|pharma|hospitality|construction)\b/i.test(text)) return 'Industry';
  if (/\b(lead|manage|deliver|develop|mentor|recruit|conduct|responsibilit)/i.test(text)) return 'Responsibility';
  return 'Technical skill';
}

function quantity(text) {
  const normalized = text.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/gi, (word) => String(['one','two','three','four','five','six','seven','eight','nine','ten'].indexOf(word.toLowerCase()) + 1));
  const m = normalized.match(/(\d+(?:\.\d+)?)\s*(?:[-–]\s*(\d+(?:\.\d+)?))?\s*\+?\s*[-–]?\s*(years?|yrs?|months?|employees?|direct reports|publications|journal publications|Q1 journal publications)/i);
  if (!m) return { minimum: null, maximum: null, unit: '' };
  const maximumOnly = /\b(maximum|at most|up to|no more than)\b/i.test(text);
  return { minimum: maximumOnly ? null : Number(m[1]), maximum: maximumOnly ? Number(m[1]) : m[2] ? Number(m[2]) : null, lowerBound: /\+|\b(at least|over|more than)\b/i.test(normalized), unit: m[3].toLowerCase().replace(/^(years?|yrs?)$/, 'years').replace(/^months?$/, 'months').replace(/^employees?$/, 'employees') };
}

// Automatic draft extraction supplies evidence analysis without a setup questionnaire.
export function extractRequirements(jd, criteria = []) {
  const rows = [];
  let sectionType = 'Preferred';
  for (const raw of jd.split(/\r?\n|;|(?<=[.!?])\s+(?=[A-Z])/)) {
    const line = raw.replace(/^\s*(?:[-•*]\s+|\d+[.)]\s+)/, '').trim();
    if (!line) continue;
    const heading = line.match(/^(required|requirements|mandatory|essential|preferred|desirable|nice to have|responsibilities|duties|about us|company|benefits)\s*:?\s*$/i);
    if (heading) {
      sectionType = /preferred|desirable|nice/.test(heading[1].toLowerCase()) ? 'Preferred' : /responsibilit|duties/i.test(heading[1]) ? 'Responsibility' : /about|company|benefits/i.test(heading[1]) ? 'Context' : 'Mandatory';
      continue;
    }
    const type = /\b(preferred|desirable|nice.to.have|a plus)\b/i.test(line) ? 'Preferred' : /\b(must|required|mandatory|minimum|at least)\b/i.test(line) ? 'Mandatory' : /^(we are|about |our company|benefits|salary|compensation)/i.test(line) ? 'Context' : sectionType;
    // Preserve numeric, qualification and scope clauses intact. Split independently measurable experience clauses.
    const clauses = line.split(/,?\s+(?:including|and)\s+(?=\d+\s*\+?\s*years?)/i);
    for (const clause of clauses) {
      const category = type === 'Context' ? 'Context' : categoryOf(clause);
      const terms = TERMS.filter((term) => phrase(term).test(clause));
      const splitTerms = terms.length > 1 && !['Experience', 'Qualification', 'Achievement', 'Scope', 'Eligibility', 'Context'].includes(category);
      const descriptions = splitTerms ? terms : [clause];
      for (const description of descriptions) rows.push({ description, category: splitTerms ? categoryOf(description) : category, type, sourceText: line, ...quantity(description) });
    }
  }
  for (const description of criteria) rows.push({ description, category: categoryOf(description), type: 'Preferred', sourceText: 'Recruiter supplied phrase', ...quantity(description) });
  const seen = new Set();
  return rows.filter((r) => { const key = `${r.description.toLowerCase()}|${r.type}`; if (seen.has(key)) return false; seen.add(key); return true; }).map((r, i) => ({ id: `REQ-${String(i + 1).padStart(2, '0')}`, ...r }));
}

function relevantSegments(requirement, text) {
  const terms = [...new Set(tokenize(requirement.description))].filter((t) => !GENERIC.has(t) && !/^\d/.test(t));
  return segments(text).map((s) => {
    const found = new Set(tokenize(s.text));
    const overlap = terms.filter((t) => found.has(t)).length;
    return { ...s, coverage: terms.length ? overlap / terms.length : 0, exact: phrase(requirement.description).test(s.text) };
  }).filter((s) => s.exact || s.coverage > 0).sort((a, b) => Number(b.exact) - Number(a.exact) || b.coverage - a.coverage || Number(NEGATIVE.test(b.text)) - Number(NEGATIVE.test(a.text)) || Number(ACTION.test(b.text)) - Number(ACTION.test(a.text)) || a.segment - b.segment);
}

function datedExperience(matches, asOfYear) {
  // Year-only dates cannot justify an exact tenure. Keep an explicit lower-bound estimate.
  const ranges = matches.filter((s) => s.exact || s.coverage >= 0.8).flatMap((s) => [...s.text.matchAll(/\b((?:19|20)\d{2})\s*[-–—]\s*((?:19|20)\d{2}|present|current)\b/gi)].map((m) => ({ start: Number(m[1]) + 1, end: /^\d/.test(m[2]) ? Number(m[2]) : asOfYear, source: s.segment }))).filter((r) => r.end >= r.start && r.end <= asOfYear).sort((a, b) => a.start - b.start);
  const merged = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }
  return ranges.length ? { lowerBoundYears: merged.reduce((sum, r) => sum + r.end - r.start, 0), ranges, method: 'Conservative lower bound from subject-matched year ranges; overlapping intervals counted once. Exact months and role allocation require confirmation.' } : null;
}

export function evaluateRequirement(requirement, record, asOfYear = new Date().getFullYear()) {
  const matches = relevantSegments(requirement, record.text);
  const best = matches[0];
  let status = 'Not Found', strength = 'None', gap = 'Not evidenced in the resume; this does not establish absence.';
  let candidateValue = null;
  let experienceEstimate = null;
  const notes = [];
  const supported = best && (best.exact || best.coverage >= 0.8);
  if (best) {
    status = supported ? 'Mentioned' : 'Partial';
    strength = supported ? 'Moderate' : 'Weak';
    gap = supported ? 'Mentioned without sufficient demonstration.' : 'Related wording is present; equivalence requires verification.';
    if (supported && ACTION.test(best.text) && !/^(skills?|technologies|tools|profile)\s*:/i.test(best.text)) {
      status = 'Verified'; strength = 'Strong'; gap = null;
    }
    if (supported && NEGATIVE.test(best.text)) {
      status = 'Contradicted'; strength = 'Strong'; gap = 'An explicit negative statement conflicts with this requirement. Verify its context.';
    }
  }
  const evidence = matches.slice(0, 3).map((s) => ({ candidate: record.candidate, sourceSha256: record.sha256, segment: s.segment, text: s.text }));
  if (requirement.minimum !== null || requirement.maximum !== null) {
    const numericEvidence = matches.filter((s) => s.exact || s.coverage >= 0.8).map((s) => {
      const q = quantity(s.text);
      if (['months', 'years'].includes(q.unit) && ['months', 'years'].includes(requirement.unit) && q.unit !== requirement.unit) {
        const factor = q.unit === 'months' ? 1 / 12 : 12;
        if (q.minimum !== null) q.minimum *= factor;
        if (q.maximum !== null) q.maximum *= factor;
        q.unit = requirement.unit;
      }
      return { s, q };
    }).find(({ q }) => q.unit === requirement.unit && q.minimum !== null);
    if (numericEvidence) {
      candidateValue = numericEvidence.q.minimum;
      const below = requirement.minimum !== null && candidateValue < requirement.minimum;
      const above = requirement.maximum !== null && candidateValue > requirement.maximum;
      const uncertainRange = (below && (numericEvidence.q.lowerBound || numericEvidence.q.maximum >= requirement.minimum)) || (requirement.maximum !== null && numericEvidence.q.lowerBound && !above);
      status = uncertainRange ? 'Requires Verification' : below || above ? 'Contradicted' : 'Verified';
      strength = 'Strong';
      gap = uncertainRange ? 'The stated range or lower bound does not establish compliance; confirm the exact quantity.' : below || above ? `Stated ${candidateValue} ${requirement.unit}; requirement ${requirement.minimum ?? 'no minimum'}–${requirement.maximum ?? 'no maximum'}.` : null;
      if (NEGATIVE.test(numericEvidence.s.text)) { status = 'Contradicted'; gap = 'An explicit negative statement conflicts with this requirement; verify context.'; }
      notes.push('Explicit duration/count claim only. Overlapping roles are not added; total tenure is not inferred from graduation dates.');
    } else {
      status = best ? 'Requires Verification' : 'Not Found';
      gap = `Cannot establish the required ${requirement.unit || 'quantity'} for this specific requirement.`;
      if (requirement.category === 'Experience' && requirement.unit === 'years') {
        experienceEstimate = datedExperience(matches, asOfYear);
        if (experienceEstimate) {
          candidateValue = experienceEstimate.lowerBoundYears;
          notes.push(experienceEstimate.method);
          gap = `At least approximately ${candidateValue} years in matching dated excerpts; verify exact dates, role relevance and concurrent responsibilities.`;
        }
      }
    }
  }
  if (requirement.category === 'Qualification' && best && status !== 'Contradicted') {
    const explicitDegree = supported && /\b(PhD|Ph\.D|bachelor|master|degree|diploma)\b/i.test(best.text) && !/\b(related|equivalent|or|certification|license|valid)\b/i.test(requirement.description);
    status = explicitDegree ? 'Verified' : 'Requires Verification';
    strength = explicitDegree ? 'Strong' : strength;
    gap = explicitDegree ? null : 'Confirm the exact degree, discipline, institution, license/certification and validity. Higher or related qualifications are not assumed equivalent.';
    notes.push('Qualification claims have not been authenticated with the institution.');
    if (PHD.test(requirement.description) && doctoralStatus(record.text).status !== 'completed') {
      status = 'Requires Verification';
      gap = 'PhD completion is not explicitly established; a mention, ongoing study or coursework is not a completed degree.';
    }
  }
  if (requirement.category === 'Achievement' && /\b(Q1|ranking|ranked|journal|patent|award)\b/i.test(requirement.description)) {
    status = best ? 'Requires Verification' : 'Not Found';
    gap = 'Cannot independently verify this achievement or ranking from resume text; external verification required.';
  }
  if (requirement.category === 'Eligibility' && best && status !== 'Contradicted') {
    status = 'Requires Verification';
    gap = 'Confirm eligibility, current location, relocation willingness or authorization directly; location differences do not establish ineligibility.';
  }
  const dates = best?.text.match(/\b(?:19|20)\d{2}\b/g)?.map(Number).filter((year) => year <= asOfYear) || [];
  const lastEvidenceYear = dates.length ? Math.max(...dates) : null;
  if (lastEvidenceYear && asOfYear - lastEvidenceYear > 3 && ['Technical skill', 'Responsibility'].includes(requirement.category) && !/\b(present|current|ongoing)\b/i.test(best.text)) {
    notes.push(`Potentially outdated evidence: last year in this excerpt is ${lastEvidenceYear}; confirm last use.`);
    if (status === 'Verified') { status = 'Requires Verification'; gap = 'Confirm current proficiency and last use.'; }
  }
  if (!lastEvidenceYear) notes.push('Recency and duration are not established from this excerpt.');
  if (requirement.type === 'Context') { status = 'Context'; gap = null; }
  return { ...requirement, candidateEvidence: evidence, evidenceStrength: strength, candidateValue, experienceEstimate, verificationStatus: status, gap, lastEvidenceYear, notes, verificationQuestion: status === 'Verified' || status === 'Context' ? null : `For “${requirement.description}”, please provide the relevant role/project, dates, specific responsibilities and supporting evidence${requirement.category === 'Qualification' ? ', including institution and current credential validity' : ''}.` };
}

export function createReport(jd, records, requirements = extractRequirements(jd), failures = [], options = {}) {
  if (records.length < 5 || records.length > MAX_RESUMES) throw new Error('Use 5–30 readable, unique resumes.');
  if (new Set(records.map((r) => r.sha256)).size !== records.length) throw new Error('Duplicate resume contents.');
  if (requirements.some((r) => !r.description.trim() || !CATEGORIES.includes(r.category) || !TYPES.includes(r.type) || [r.minimum, r.maximum].some((v) => v !== null && (!Number.isFinite(v) || v < 0)) || (r.minimum !== null && r.maximum !== null && r.maximum < r.minimum) || ((r.minimum !== null || r.maximum !== null) && !r.unit.trim()))) throw new Error('Complete each requirement and check its numeric bounds and unit.');
  const results = rankCandidates(jd, records).map((r) => {
    const record = records.find((item) => item.sha256 === r.sourceSha256);
    const analysis = requirements.map((q) => evaluateRequirement(q, record, options.asOfYear));
    const active = analysis.filter((a) => a.type !== 'Context');
    const verified = active.filter((a) => a.verificationStatus === 'Verified').length;
    const supported = active.filter((a) => ['Strong', 'Moderate'].includes(a.evidenceStrength) && ['Verified', 'Mentioned', 'Requires Verification'].includes(a.verificationStatus)).length;
    return { ...r, requirementAnalysis: analysis, verifiedRequirements: verified, evidenceCoverage: active.length ? Math.round(100 * supported / active.length) : 0, doctoralStatus: doctoralStatus(record.text), gaps: active.filter((a) => a.gap).map((a) => ({ requirementId: a.id, status: a.verificationStatus, gap: a.gap })), verificationQuestions: active.filter((a) => a.verificationQuestion).map((a) => ({ requirementId: a.id, question: a.verificationQuestion })), recruiterDecision: 'not_selected_in_this_review', recruiterNote: '' };
  }).sort((a, b) => b.verifiedRequirements - a.verifiedRequirements || b.evidenceCoverage - a.evidenceCoverage || b.score - a.score || a.candidate.localeCompare(b.candidate));
  return { schemaVersion: '3.0', generatedAt: new Date().toISOString(), jobDescription: jd, requirements, analysisMethod: 'Automatic rule-based JD analysis with resume excerpt retrieval; no model weight training or external fact verification.', scoreDefinition: 'Ranking orders verified requirement count, direct evidence coverage, then TF-IDF relevance. Relevance is not a probability.', processing: 'Documents processed in browser memory. This export includes extracted resume text for grounded review.', results, cohort: results.map((r, index) => ({ rank: index + 1, candidate: r.candidate, sourceSha256: r.sourceSha256 })), shortlist: [], skippedFiles: failures, candidateSources: records.map(({ candidate, sha256, text }) => ({ candidate, sourceSha256: sha256, text })), chat: [] };
}

const PHD = /\b(?:ph\.?\s*d\.?|doctorate|doctoral|doctor of philosophy)\b/i;
export function doctoralStatus(text) {
  const evidence = segments(text).filter((s) => PHD.test(s.text) && !/\b(supervis|mentor|advis|recruit|teach|taught|assist).*\b(?:ph\.?d|doctoral)\b/i.test(s.text));
  const classified = evidence.map((s) => {
    let status = 'unclear';
    if (/honorary|honoris causa/i.test(s.text)) status = 'unclear';
    else if (/\b(not (?:yet )?completed|not (?:yet )?awarded|hasn['’]?t completed|incomplete|did not complete|didn['’]?t complete|withdrawn|dropped out|no phd|no ph\.d|without a phd|do not hold|not earned)\b/i.test(s.text)) status = 'not_completed';
    else if (/\b(pursuing|pursued|ongoing|in progress|candidate|student|expected|anticipated|enrolled|pending|submitted|coursework|ABD|present)\b/i.test(s.text)) status = 'in_progress';
    else if (/\b(earned|awarded|conferred|obtained|graduated|completed|holds?|received)\b/i.test(s.text)) status = 'completed';
    return { ...s, status };
  });
  const states = new Set(classified.map((s) => s.status));
  const status = states.size > 1 ? 'unclear' : classified[0]?.status || 'not_found';
  return { status, evidence: classified, note: 'Resume statements only. A listed degree or missing mention does not independently establish completion.' };
}

export function suggestedQuestions(report, candidateId) {
  const result = report.results.find((r) => r.sourceSha256 === candidateId) || report.results[0];
  const gap = result?.requirementAnalysis.find((a) => a.verificationQuestion);
  return ['Show everyone in ranked order', "Who hasn't completed a PhD?", 'Which resumes should I review later?', ...(result ? [`What needs verification for ${result.candidate}?`, ...(gap ? [`What does ${result.candidate} say about ${gap.description}?`] : [])] : [])];
}

export function answerQuestion(report, question, context = {}) {
  const q = question.toLowerCase();
  const named = report.results.filter((r) => q.includes(r.candidate.toLowerCase()));
  const wholePool = /\b(who|which (?:resumes|candidates|people)|everyone|all candidates|cohort)\b/.test(q);
  const selected = named.length ? named : !wholePool && context.candidateId ? report.results.filter((r) => r.sourceSha256 === context.candidateId) : [];
  const cite = (r, evidence) => ({ candidate: r.candidate, sourceSha256: r.sourceSha256, ...evidence });
  if (PHD.test(q)) {
    const pool = selected.length ? selected : report.results;
    const negative = /didn|hasn|haven|not |without|incomplete|didnt|hasnt|haven’t|hasn’t|didn’t/.test(q);
    const labels = negative ? { in_progress: 'Not completed yet / in progress as stated', not_completed: 'Explicitly not completed', not_found: 'No PhD information found — completion unknown', unclear: 'PhD mentioned — completion needs confirmation' } : { completed: 'Completion explicitly stated', in_progress: 'In progress as stated', not_completed: 'Explicitly not completed', unclear: 'PhD mentioned — completion needs confirmation', not_found: 'No PhD information found — completion unknown' };
    const groups = Object.entries(labels).map(([status, label]) => { const matches = pool.filter((r) => r.doctoralStatus.status === status); return `${label} (${matches.length})\n${matches.map((r) => `• ${r.candidate}`).join('\n') || 'None.'}`; });
    const included = pool.filter((r) => r.doctoralStatus.status in labels);
    return { text: groups.join('\n\n') + '\n\nMissing or ambiguous information is not proof of an incomplete PhD. These are resume claims; confirm with the candidate.', citations: included.flatMap((r) => r.doctoralStatus.evidence.map((e) => cite(r, e))), candidateId: selected.length === 1 ? selected[0].sourceSha256 : null };
  }
  if (/review later|lower.priority|not bother|deprioriti|ignore|skip|reject|least suitable|least relevant/.test(q)) {
    const best = report.results[0];
    const lower = report.results.filter((r, i) => r.requirementAnalysis.some((a) => a.type === 'Mandatory' && a.verificationStatus === 'Contradicted') || (i >= Math.floor(report.results.length * 2 / 3) && (r.verifiedRequirements < best.verifiedRequirements || r.evidenceCoverage < best.evidenceCoverage)));
    return { text: lower.length ? `Lower priority for review against this JD:\n${lower.map((r) => `• ${r.candidate} — rank ${report.results.indexOf(r) + 1}; ${r.verifiedRequirements} supported requirements; ${r.evidenceCoverage}% evidence coverage. ${r.gaps.slice(0, 2).map((g) => `${g.requirementId}: ${g.gap}`).join(' ')}`).join('\n')}\n\nThis identifies explicit mandatory conflicts or the bottom third with less evidence than the top candidate. Everyone remains in the cohort. Missing evidence calls for follow-up, not automatic rejection.` : 'I do not have enough evidence to distinguish a lower-priority group. Everyone remains in the cohort; inspect the evidence and gaps before deciding.', citations: lower.flatMap((r) => r.requirementAnalysis.filter((a) => a.verificationStatus === 'Contradicted').flatMap((a) => a.candidateEvidence.map((e) => cite(r, e)))), candidateId: null };
  }
  const topics = TERMS.filter((term) => phrase(term).test(q));
  if (wholePool && topics.length) {
    const negative = /\b(no|not|without|lacks?|missing)\b|don['’]?t|doesn['’]?t|didn['’]?t|haven['’]?t|hasn['’]?t/.test(q);
    const assessed = report.candidateSources.map((source) => ({ source, checks: topics.map((description) => evaluateRequirement({ description, category: 'Technical skill', type: 'Preferred', minimum: null, maximum: null, unit: '' }, { candidate: source.candidate, sha256: source.sourceSha256, text: source.text })) }));
    const matches = assessed.filter(({ checks }) => negative ? checks.some((a) => ['Not Found', 'Partial', 'Contradicted'].includes(a.verificationStatus)) : checks.every((a) => ['Verified', 'Mentioned', 'Requires Verification'].includes(a.verificationStatus)));
    return { text: `${negative ? 'Missing, partial or conflicting evidence' : 'Resume evidence'} for ${topics.join(', ')} (${matches.length} candidates):\n${matches.map(({ source, checks }) => `• ${source.candidate}: ${checks.map((a) => `${a.description} — ${a.verificationStatus}`).join('; ')}`).join('\n') || 'No matching candidates.'}\n\nA missing mention does not mean the candidate lacks the skill. Confirm proficiency directly.`, citations: matches.flatMap(({ checks }) => checks.flatMap((a) => a.candidateEvidence.slice(0, 1))), candidateId: null };
  }
  if (/\b(cohort|ranked|ranking|everyone|top \d+)\b/.test(q)) {
    const requested = Number(q.match(/\b(?:top|first|show|give me)\s+(\d+)\b/)?.[1]);
    return { text: `Ranked cohort — ${report.results.length} candidates total\n${report.results.slice(0, requested || Infinity).map((r, i) => `${i + 1}. ${r.candidate} — ${r.verifiedRequirements} supported requirements; ${r.evidenceCoverage}% evidence coverage`).join('\n')}`, citations: [], candidateId: null };
  }
  if (/short.?list|selected.*round/.test(q)) {
    const list = report.results.filter((r) => r.recruiterDecision === 'shortlisted_by_recruiter');
    return { text: list.length ? `Your manually selected shortlist:\n${list.map((r) => `• ${r.candidate}${r.recruiterNote ? ` — ${r.recruiterNote}` : ''}`).join('\n')}` : 'You have not manually shortlisted anyone yet. Ask for the ranked cohort to review every candidate.', citations: [] };
  }
  if (selected.length && /question|interview|faq|verif|gap|missing|evidence|why|compare/.test(q)) {
    const questions = /question|interview|faq/.test(q);
    const evidenceOnly = /evidence|why|compare/.test(q) && !/gap|missing/.test(q);
    const citations = [];
    const text = selected.map((r) => {
      const rows = r.requirementAnalysis.filter((a) => a.type !== 'Context' && (evidenceOnly || a.verificationStatus !== 'Verified'));
      return `${r.candidate}\n${rows.map((a) => {
        citations.push(...a.candidateEvidence.slice(0, 1).map((e) => cite(r, e)));
        return questions ? `• ${a.verificationQuestion || `Explain your work on ${a.description}, including your contribution and outcome.`}` : `• ${a.id} ${a.description}: ${a.verificationStatus}. ${a.gap || 'Supported by the quoted resume evidence.'}`;
      }).join('\n') || 'No unresolved requirements in this review.'}`;
    }).join('\n\n');
    return { text, citations, candidateId: selected.length === 1 ? selected[0].sourceSha256 : null };
  }
  const queryTerms = [...new Set(tokenize(question))].filter((t) => !GENERIC.has(t) && !['tell','show','about','what','which','does','resume','candidate','please'].includes(t));
  const sources = report.candidateSources.filter((s) => !selected.length || selected.some((r) => r.sourceSha256 === s.sourceSha256));
  const hits = sources.flatMap((source) => segments(source.text).map((s) => ({ candidate: source.candidate, sourceSha256: source.sourceSha256, ...s, overlap: queryTerms.filter((t) => tokenize(s.text).includes(t)).length }))).filter((s) => s.overlap > 0).sort((a, b) => b.overlap - a.overlap).slice(0, 5);
  return { text: hits.length ? 'These resume excerpts relate to your question. They are candidate claims, not independently verified facts.' : 'I cannot establish that from this review. Ask about the ranked cohort, PhD completion, lower-priority reviews, or name a candidate to inspect evidence and gaps.', citations: hits.map(({ overlap, ...s }) => s), candidateId: selected.length === 1 ? selected[0].sourceSha256 : null };
}
