# Deploy Neurosaur on Cloudflare Workers Free

The Cloudflare deployment is a static, browser-based version of the recruiter workspace. It does not use Workers Containers, Durable Objects, Docker, Python, PyTorch, Streamlit, FAISS or a server-side embedding model. This is the required architecture for the Workers Free plan.

## What caused the previous failures

1. The original configuration declared a Cloudflare Container, which requires Workers Paid.
2. The next repository used `recruiter.jsonc`. Wrangler only auto-discovers supported names such as `wrangler.jsonc`, so it ignored that file and reported that it could not detect a static directory.
3. A root-level `requirements.txt` caused Workers Builds to install the complete Python/AI stack even though the static deployment did not use it.

The corrected repository uses `wrangler.jsonc`, creates `dist/` during `npm run build`, serves that directory as Workers Static Assets, and keeps local Python packages in `requirements-local.txt` so Cloudflare does not install them.

## Cloudflare dashboard settings

Open **Workers & Pages → recruiter → Settings → Build** and use:

| Setting | Required value |
| --- | --- |
| Worker name | `recruiter` |
| Production branch | `main` |
| Root directory | `/` or leave blank |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Node version | `24` |
| Static output directory | Leave blank; `wrangler.jsonc` supplies `./dist` |

Do not set a Python build command, Docker command, output directory override, `--containers-rollout`, or a Containers API token. The standard Workers Builds token is sufficient for static asset deployment.

## Repository changes to commit

Commit and push all of these together:

- `wrangler.jsonc`
- `package.json` and `package-lock.json`
- `public/`
- `scripts/build-static.mjs`
- `requirements-local.txt`
- the deletion of `recruiter.jsonc`, root `requirements.txt`, and `worker/index.js`

Pushing to `main` starts a new production build. If you upload the ZIP manually, extract it and ensure the repository root contains `wrangler.jsonc` directly—not another nested folder.

## Verify before pushing

```powershell
npm install
npm test
npm run build
```

The build must create:

```text
dist/index.html
dist/app.js
dist/matcher.js
dist/styles.css
```

For an optional local Cloudflare preview:

```powershell
npx wrangler dev
```

Then open the local URL, paste a JD, upload five synthetic TXT resumes, compare them, shortlist one candidate and download the JSON review.

## Data handling and functional differences

- Documents and review state stay in browser memory and are not posted to the application server.
- Closing or refreshing the page clears the review; download the JSON first.
- TXT works without a document-reader library. PDF.js and Mammoth are loaded from pinned public CDNs for PDF and DOCX parsing. The document bytes remain in the browser, but production handling of sensitive resumes should use locally vendored copies of those libraries.
- Scanned PDFs still require OCR before use.
- The Free-plan web score is lexical TF-IDF similarity plus optional phrase coverage. It is not the local MiniLM semantic score, a probability, a qualification score, or an automatic hiring decision.
- The original Python/Streamlit semantic workflow remains available locally through `setup.ps1` and `start.ps1`.

## Relevant Cloudflare documentation

- https://developers.cloudflare.com/workers/static-assets/
- https://developers.cloudflare.com/workers/static-assets/get-started/
- https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/
- https://developers.cloudflare.com/workers/platform/limits/
