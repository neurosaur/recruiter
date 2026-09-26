const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'being', 'but', 'by',
  'can', 'for', 'from', 'had', 'has', 'have', 'he', 'her', 'his', 'i', 'in',
  'into', 'is', 'it', 'its', 'may', 'of', 'on', 'or', 'our', 'she', 'that',
  'the', 'their', 'them', 'they', 'this', 'to', 'was', 'we', 'were', 'will',
  'with', 'you', 'your', 'years', 'year', 'work', 'working', 'role', 'job',
]);

function normalizeToken(token) {
  let value = token.toLowerCase().replace(/^\.+|\.+$/g, '');
  if (value.length > 5 && value.endsWith('ies')) value = `${value.slice(0, -3)}y`;
  else if (value.length > 5 && value.endsWith('ing')) value = value.slice(0, -3);
  else if (value.length > 4 && value.endsWith('ed')) value = value.slice(0, -2);
  else if (value.length > 4 && value.endsWith('s') && !value.endsWith('ss')) value = value.slice(0, -1);
  return value;
}

export function tokenize(text) {
  const raw = String(text || '').toLowerCase().match(/[a-z0-9][a-z0-9+#.\/-]*/g) || [];
  return raw
    .map(normalizeToken)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function termFrequency(tokens) {
  const counts = new Map();
  for (const token of tokens) counts.set(token, (counts.get(token) || 0) + 1);
  const total = Math.max(tokens.length, 1);
  return new Map([...counts].map(([token, count]) => [token, count / total]));
}

function idfMap(documents) {
  const documentSets = documents.map((text) => new Set(tokenize(text)));
  const allTerms = new Set(documentSets.flatMap((terms) => [...terms]));
  const count = Math.max(documentSets.length, 1);
  const idf = new Map();
  for (const term of allTerms) {
    const present = documentSets.reduce((sum, terms) => sum + Number(terms.has(term)), 0);
    idf.set(term, Math.log((count + 1) / (present + 1)) + 1);
  }
  return idf;
}

function vector(text, idf) {
  const tf = termFrequency(tokenize(text));
  return new Map([...tf].map(([term, value]) => [term, value * (idf.get(term) || 1)]));
}

function cosine(left, right) {
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (const value of left.values()) leftMagnitude += value ** 2;
  for (const value of right.values()) rightMagnitude += value ** 2;
  for (const [term, value] of left) dot += value * (right.get(term) || 0);
  if (!leftMagnitude || !rightMagnitude) return 0;
  return dot / Math.sqrt(leftMagnitude * rightMagnitude);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function phraseRegex(phrase) {
  return new RegExp(`(?<!\\w)${escapeRegex(phrase.trim())}(?!\\w)`, 'i');
}

export function criterionChecks(text, criteria) {
  const lines = String(text || '')
    .split(/\r?\n|(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter(Boolean);

  return criteria.map((criterion) => {
    const pattern = phraseRegex(criterion);
    const evidence = lines.find((line) => pattern.test(line)) || '';
    return {
      phrase: criterion,
      found: Boolean(evidence),
      finding: evidence
        ? 'Explicit mention — verify depth and recency'
        : 'Not explicitly found — verify with candidate',
      evidence,
    };
  });
}

function evidenceLines(text, jdText, criteria, limit = 3) {
  const queryTerms = new Set(tokenize(jdText));
  const candidates = String(text || '')
    .split(/\r?\n|(?<=[.!?])\s+/)
    .map((line, index) => ({ line: index + 1, text: line.trim() }))
    .filter(({ text: value }) => value.length >= 24);

  const scored = candidates.map((entry) => {
    const terms = new Set(tokenize(entry.text));
    const overlap = [...terms].reduce((sum, term) => sum + Number(queryTerms.has(term)), 0);
    const phraseMatches = criteria.reduce((sum, criterion) => {
      return sum + Number(phraseRegex(criterion).test(entry.text));
    }, 0);
    return { ...entry, evidenceScore: overlap + phraseMatches * 3 };
  });

  return scored
    .filter(({ evidenceScore }) => evidenceScore > 0)
    .sort((a, b) => b.evidenceScore - a.evidenceScore || a.line - b.line)
    .slice(0, limit)
    .map(({ line, text: value }) => ({ line, text: value }));
}

export function rankCandidates(jdText, records, criteria = []) {
  if (!String(jdText || '').trim()) throw new Error('A job description is required.');
  if (!Array.isArray(records) || !records.length) throw new Error('At least one candidate is required.');

  const corpus = [jdText, ...records.map((record) => record.text)];
  const idf = idfMap(corpus);
  const jdVector = vector(jdText, idf);

  return records
    .map((record) => {
      const lexicalSimilarity = Math.max(0, Math.min(1, cosine(jdVector, vector(record.text, idf))));
      const checks = criterionChecks(record.text, criteria);
      const criterionCoverage = checks.length
        ? checks.filter((check) => check.found).length / checks.length
        : null;
      const combined = criterionCoverage === null
        ? lexicalSimilarity
        : lexicalSimilarity * 0.82 + criterionCoverage * 0.18;

      return {
        candidate: record.candidate,
        sourceSha256: record.sha256,
        fileType: record.fileType,
        score: Math.round(combined * 1000) / 10,
        lexicalSimilarity: Math.round(lexicalSimilarity * 1000) / 10,
        criterionCoverage: criterionCoverage === null ? null : Math.round(criterionCoverage * 1000) / 10,
        matchedEvidence: evidenceLines(record.text, jdText, criteria),
        criterionChecks: checks,
      };
    })
    .sort((left, right) => right.score - left.score || left.candidate.localeCompare(right.candidate));
}
