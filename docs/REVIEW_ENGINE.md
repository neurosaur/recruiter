# Evidence review specification

This update implements the requirement-evidence workflow described in the supplied `fine-tune.docx`. That document is a product specification, not a labeled training dataset. No MiniLM weights were trained, and no hosted LLM or API key is required. The deployed Cloudflare application uses an editable, deterministic evidence engine in `public/review-engine.js` and a report-grounded retrieval assistant.

## Workflow

1. Enter a JD and optional phrases.
2. Review the extracted requirements. Edit descriptions, categories, mandatory/preferred labels, numeric bounds and units. Split compound requirements and add requirements the draft extraction missed. Explicit confirmation is required before comparison.
3. Upload 5–30 unique readable TXT, PDF or DOCX resumes, up to 10 MB each.
4. Generate the in-memory JSON report and requirement-by-requirement analysis.
5. Inspect strict/loose cohorts, ask the assistant questions, review candidate FAQs, and manually shortlist candidates.
6. Download the full JSON, cohort JSON, or individual original resumes. The JSON includes extracted resume text, so handle it as candidate data. Closing or refreshing clears this tab's data.

## Requirement schema

Each requirement has `id`, `description`, `category`, `type`, `sourceText`, `minimum`, `maximum`, and `unit`. Categories cover eligibility, experience, qualifications, technical skills/tools, responsibilities, scope, industry/domain, achievements and context. Types are Mandatory, Preferred, Responsibility and Context. Optional user phrases start as Preferred; explicit JD mandatory language is preserved. Unlabeled prose starts as Preferred rather than silently becoming a hard eligibility filter.

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
- Scope, responsibilities and industry evidence use the same explicit-subject rules. Unknown tools or domain terms can be added in the editor; there is no exhaustive industry ontology.

The draft extractor and word-based evidence matcher are heuristics. They can miss paraphrases, complex tables, multi-line role context, negation scope, acronyms or unusual date formats. Review the extracted requirements and quotes. This version does not claim universal semantic understanding or calibrated predictive hiring accuracy.

## Cohort policy

Strict: every mandatory requirement must be Verified, and there must be at least one mandatory requirement. The cap is configurable from 1 to 10.

Loose: at least 50% of non-context requirements have direct evidence, and no mandatory requirement is Contradicted. Direct evidence counts Verified, Mentioned, or Requires Verification only when strength is Moderate or Strong. The cap is configurable from 1 to 20. Loose may include strict candidates.

Neither cohort is padded to meet a target. Preferred gaps do not automatically fail strict eligibility. Results sort by verified requirement count, then direct evidence coverage, then TF-IDF relevance. All criteria currently have equal weight within these counts; TF-IDF is only a tie-breaker. These transparent defaults are engineering rules, not thresholds learned from historical decisions.

## Chat and JSON

The report is generated before the assistant is enabled. The assistant reads that report, not another candidate pool or a shared server memory. It supports strict/loose cohorts, manual shortlist, candidate gaps, explanations, verification/interview questions, multi-candidate evidence comparison, and excerpt retrieval. A candidate selector and follow-up context avoid repeating a filename. Unsupported questions return an explicit inability to establish the answer. Resume instructions are treated as text, and all displayed content is escaped.

Schema version 2 retains `results`, `shortlist`, `skippedFiles`, `jobDescription`, `criteria`, and `scoreDefinition`. It adds structured requirements, cohorts and policies, candidate source text, method metadata, gaps, questions and chat history. Candidate identity is the source SHA-256, so equal filenames do not merge people. Manual decisions remain distinct from proposed cohorts. Regenerating a review resets the prior report and chat; changing a cohort cap preserves manual notes and selections.

## Future model training

Actual weight fine-tuning requires a separate, consented and de-identified training set: JDs, normalized requirements, evidence spans, verified labels and held-out evaluation examples across roles. The supplied specification contains no such labeled dataset. The current version implements the requested behavior without inventing training examples or claiming unmeasured model improvements.
