# Neurosaur Candidate Review

This repository now supports two separate operating modes:

- **Cloudflare Workers Free:** a static browser application under `public/`. Enter a JD, upload 5–30 TXT, text-based PDF or DOCX resumes, and receive one ranked cohort containing every readable resume. A report-grounded chatbot answers candidate/group questions with citations. No application server or Cloudflare Container is used.
- **Local Python:** the original Streamlit, Sentence Transformers and FAISS workflow remains available for local use. It is not deployed by the Free-plan configuration.

## Evidence review and chatbot

The hosted workflow automatically extracts JD requirements in the background. There is no requirements questionnaire, rating form or confirmation step. It distinguishes demonstrated evidence, mentions, partial matches, missing information, contradictions and claims needing verification. Expand a candidate's evidence details when needed.

Everyone remains in one ranked cohort. Strict/loose tiers and their controls have been removed. Final shortlisting remains an optional recruiter action.

The JSON is generated when comparison completes. Ask “Who hasn't completed a PhD?”, “Who knows Python?”, “Which resumes should I review later?”, or ask about a named candidate. PhD answers separate explicitly completed, in-progress, explicitly incomplete, unmentioned and unclear qualifications. Lower-priority suggestions show JD evidence gaps without removing anyone. Download the full review JSON or original resumes. Full JSON includes extracted resume text and chat history; closing the tab clears the active review.

See [the evidence engine specification](docs/REVIEW_ENGINE.md) for the schema and limitations. The bot uses local excerpt retrieval and structured answers, not a hosted language model. “Verified” means resume-supported, not externally authenticated.

## Cloudflare Free deployment

See [CLOUDFLARE.md](CLOUDFLARE.md) for exact GitHub-connected deployment settings. The required file is named `wrangler.jsonc`, the Worker name is `recruiter`, and the build produces the `dist/` static-asset directory.

```powershell
npm test
npm run build
```

The hosted version performs all review work in browser memory. Refreshing or closing the tab clears the documents and active review. PDF and DOCX parsing libraries are loaded from pinned public CDN URLs; for sensitive production use, vendor those libraries into `public/vendor/` and update `public/app.js` and `public/index.html`.

## Automatic Git sync

The Windows login task `NeurosaurGitAutoSync` runs `scripts/git_autosync.py` in the background. After code is unchanged for 40 seconds, it runs tests, commits eligible changes and pushes `main` to `origin`. Retries happen at most once per minute. It never force-pushes or pulls; a remote conflict is logged for manual resolution. Switching branches, staging changes manually or starting a merge pauses synchronization. Only common code/configuration/text file types are watched; candidate documents, data, uploads, reports, secrets, caches and environments are excluded. Keep personal data out of source-code files and the synthetic examples folder.

Logs and status: `.cache/autosync/autosync.log` and `.cache/autosync/status.json` on G:.

```powershell
# Pause (also disables automatic start at login)
powershell -ExecutionPolicy Bypass -File .\scripts\stop-autosync.ps1
# Resume
powershell -ExecutionPolicy Bypass -File .\scripts\start-autosync.ps1
```

## Local Python website

```powershell
cd G:\Project\applications
powershell -ExecutionPolicy Bypass -File .\setup.ps1
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

The legacy Python UI supports 5–30 resumes and its original semantic-ranking JSON. Its evidence and chat features have not been replaced by the hosted JavaScript engine. The new evidence review and chatbot run in the Cloudflare application. The CLI already supports arbitrary pool sizes. Local setup commands are retained for reference; they are not needed for Cloudflare deployment.

All application environments, model downloads, caches and temporary upload files are configured under G:\Project\applications. The existing Python interpreter and Windows remain on C:. No system relocation is performed.

The local mode provides semantic JD matching using Python, PyMuPDF, python-docx, Sentence Transformers and FAISS. No API key is required. The first run downloads the MiniLM embedding model; subsequent runs can use `--offline`. Resume text is processed locally.

## Windows setup

```powershell
cd G:\Project\applications
powershell -ExecutionPolicy Bypass -File .\setup.ps1
.\.venv\Scripts\python.exe run.py --resumes examples/resumes --jd examples/software_engineer.txt
```

The setup uses Python 3.14. Dependencies, pip cache and model cache live inside this folder on G:. No environment activation is necessary.

## Your resumes

```powershell
New-Item -ItemType Directory -Force data/resumes, data/job_descriptions
# Copy your PDF/DOCX resumes into data/resumes.
# Save the JD as data/job_descriptions/job.txt (UTF-8).
.\.venv\Scripts\python.exe run.py --resumes data/resumes --jd data/job_descriptions/job.txt
```

This rebuilds the index from the current folder. Results include every valid candidate, sorted by cosine similarity, and are written to `output/ranking.json`. TXT resumes are also supported for samples. Blank, corrupt, encrypted or scanned documents are reported as failures; no OCR is included. Partial failures are recorded in the JSON report. An entirely invalid pool exits with an error and preserves the previous index.

## Reuse an index

```powershell
.\.venv\Scripts\python.exe run.py ingest --resumes data/resumes
.\.venv\Scripts\python.exe run.py match --jd data/job_descriptions/job.txt --top 10 --offline
.\.venv\Scripts\python.exe -m pytest -q
```

Use `--store`, `--output` and `--model` to override defaults. Re-ingest when changing models. Paths are relative to your current working directory. A different JD can query the same index without re-parsing resumes.

## Matching and evidence in local Python mode

Long documents are split into model-token windows. Normalized chunk embeddings are averaged and normalized into one candidate vector. FAISS inner product on normalized vectors gives cosine similarity (range -1 to 1); this is not a probability or qualification score. Ties use the candidate filename. Reports retain source hashes and excerpts with extracted-text line numbers. Excerpts are selected by lexical overlap; they are not verified skills or proof that mandatory requirements are satisfied. Missing qualification details are not inferred.

Candidate text and vectors are stored locally without application-level encryption. Keep this folder access restricted. Real resumes, stores, reports, caches and environments are ignored by Git. Use only trusted local FAISS stores. Previous index generations are retained to protect against interrupted ingestion; deleting `data/vector_store` removes all stored generations. This baseline has no authentication, web server, portal automation or automatic hiring decisions. Cloud deployment is a later phase.
