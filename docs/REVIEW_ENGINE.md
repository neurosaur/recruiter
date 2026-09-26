# Evidence review specification

The deployed Cloudflare application automatically analyzes JD/resume evidence with `public/review-engine.js` and a report-grounded retrieval assistant. The supplied `fine-tune.docx` is a product specification, not a labeled training dataset. No MiniLM weights were trained, and no hosted LLM or API key is required.

## Workflow

1. Enter a JD.
2. Upload 5–30 unique readable TXT, PDF or DOCX resumes, up to 10 MB each.
3. Compare: analysis runs automatically, with no requirements editor, ratings or confirmation gate.
4. Inspect one ranked cohort containing everyone. Ask the assistant about candidates or groups; notes and manual shortlisting are optional.
5. Download the full JSON or individual original resumes. The JSON includes extracted resume text, so handle it as candidate data. Closing or refreshing clears this tab's data.

## Requirement schema

Automatically extracted requirements have `id`, `description`, `category`, `type`, `sourceText`, `minimum`, `maximum`, and `unit`. Categories cover eligibility, experience, qualifications, technical skills/tools, responsibilities, scope, industry/domain, achievements and context. Types are Mandatory, Preferred, Responsibility and Context. Explicit JD mandatory language is preserved. Unlabeled prose starts as Preferred rather than silently becoming a hard eligibility filter.

Candidate analysis adds `candidateEvidence` (filename, content hash, extracted segment number and quote), `evidenceStrength`, `candidateValue`, `experienceEstimate`, `verificationStatus`, `gap`, `lastEvidenceYear`, `notes`, and `verificationQuestion`.

Statuses distinguish Verified, Mentioned, Partial, Not Found, Contradicted, Requires Verification, and Context. Verified means supported by resume text, never independently authenticated. Missing evidence is not evidence that a candidate lacks a qualification. No automatic hiring or rejection decision is made.

## Evidence handling

- Usage/action statements support stronger evidence than standalone skills lists. Related wording is Partial rather than presumed equivalent.
- Explicit quantities are compared only in subject-matched excerpts. Years and months can be converted. Different experience clauses are separated so total experience cannot substitute for industry-specific tenure.
- Matching dated roles produce a conservative year-based tenure estimate with overlapping periods counted once. Exact months, role allocations and relevance still require verification. Graduation year is never used to invent experience.
- Exact degree/discipline statements can be marked resume-supported. Related disciplines, alternative qualifications, credentials and validity require verification; higher degrees are not automatically treated as equivalent.
- Q1 journal status and externally verifiable achievements remain unverified, even when the resume claims them. No journal database or credential issuer is queried.
- Location/authorization constraints require confirmation. A different city alone is not a contradiction.
- Explicit negative claims are distinguished from missing data. Skill evidence dated more than three years ago is flagged for recency review. Undated evidence retains unknown recency.
- Scope, responsibilities and industry evidence use the same explicit-subject rules. There is no exhaustive industry ontology.

The draft extractor and word-based evidence matcher are heuristics. They can miss paraphrases, complex tables, multi-line role context, negation scope, acronyms or unusual date formats. Review the extracted requirements and quotes. This version does not claim universal semantic understanding or calibrated predictive hiring accuracy.

## Cohort policy

Every readable resume remains in one ranked cohort. Strict/loose tiers, caps and controls are removed. Results sort by verified requirement count, direct evidence coverage, then TF-IDF relevance. All criteria have equal weight within these counts; these defaults are engineering rules, not learned thresholds.

When asked for lower-priority resumes, the assistant identifies explicit mandatory contradictions or the bottom third with fewer supported requirements or lower coverage than the top candidate. Equal evidence does not manufacture a lower-priority group. Reasons are shown; nobody is automatically rejected or removed.

## Chat and JSON

The report is generated before the assistant is enabled. The assistant supports the ranked cohort, manual shortlist, candidate gaps, evidence and interview questions, skill groups, PhD completion groups, lower-priority reviews and excerpt retrieval. PhD groups distinguish explicitly completed, ongoing, explicitly incomplete, unclear and unmentioned qualifications. Listed degree dates alone do not establish completion; supervising PhD students does not establish the candidate has a PhD. Conflicting statements remain uncertain.

Whole-pool questions such as “Who hasn't completed a PhD?” override an earlier candidate context. Candidate-specific follow-ups can use the optional selector. The bot uses retrieval and deterministic answer templates, not a general-purpose LLM. Unsupported questions return an inability to establish the answer. Resume instructions are treated as text, and displayed content is escaped.

Schema version 3 contains `results`, `shortlist`, `skippedFiles`, `jobDescription`, `scoreDefinition`, automatic `requirements`, and `cohort` (every candidate's rank, filename and source hash). It retains candidate source text, method metadata, gaps, questions and chat history, and adds doctoral status. The prior `cohorts.strict` and `cohorts.loose` fields are removed. Candidate identity is the source SHA-256. Regenerating or resetting clears the prior report and chat.

## Future model training

Actual weight fine-tuning requires a separate, consented and de-identified training set: JDs, normalized requirements, evidence spans, verified labels and held-out evaluation examples across roles. The supplied specification contains no such labeled dataset. The current version implements the requested behavior without inventing training examples or claiming unmeasured model improvements.
