# Neurosaur Phase 1

## Website

```powershell
cd G:\Project\applications
powershell -ExecutionPolicy Bypass -File .\setup.ps1
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

Open http://127.0.0.1:8501. Enter a JD, optionally specify skills/phrases to verify, upload 5–10 resumes, and compare. Expand each result to inspect resume excerpts, select candidates yourself and add a justification. Download the review as JSON. The website keeps candidate results in browser-session server memory; temporary upload files are deleted after parsing. It does not reuse another session's candidate pool. Only the embedding model is shared. Use “Start a new review” to clear the current review. The service listens only on this computer; stop it with Ctrl+C.

All application environments, model downloads, caches and temporary upload files are configured under G:\Project\applications. The existing Python interpreter and Windows remain on C:. No system relocation is performed.

Local resume ingestion and semantic JD matching using Python, PyMuPDF, python-docx, Sentence Transformers and FAISS. No API key is required. The first run downloads the MiniLM embedding model; subsequent runs can use `--offline`. Resume text is processed locally.

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

## Matching and evidence

Long documents are split into model-token windows. Normalized chunk embeddings are averaged and normalized into one candidate vector. FAISS inner product on normalized vectors gives cosine similarity (range -1 to 1); this is not a probability or qualification score. Ties use the candidate filename. Reports retain source hashes and excerpts with extracted-text line numbers. Excerpts are selected by lexical overlap; they are not verified skills or proof that mandatory requirements are satisfied. Missing qualification details are not inferred.

Candidate text and vectors are stored locally without application-level encryption. Keep this folder access restricted. Real resumes, stores, reports, caches and environments are ignored by Git. Use only trusted local FAISS stores. Previous index generations are retained to protect against interrupted ingestion; deleting `data/vector_store` removes all stored generations. This baseline has no authentication, web server, portal automation or automatic hiring decisions. Cloud deployment is a later phase.
