# Deploy Neurosaur from GitHub

This Streamlit application runs in **Cloudflare Workers + Containers**. It requires a Workers Paid plan. Cloudflare Pages cannot serve its Python/PyTorch process. Cloudflare builds the Docker image from the repository; Docker is not required on your Windows computer for this path.

## Dashboard settings

1. Open Workers & Pages → Create application → Import a repository.
2. Authorize GitHub and select `neurosaur/recruiter`.
3. Choose the **Worker** deployment flow, not Pages.
4. Use these settings:

| Setting | Value |
| --- | --- |
| Worker/project name | `neurosaur-recruiter` |
| Production branch | `main` |
| Root directory | `/` (repository root) |
| Build command | `npm ci && npm run build` |
| Deploy command | `npx wrangler deploy` |
| Dependency installation | Included in the build command |
| Build environment | `NODE_VERSION=24` |
| Build environment | `SKIP_DEPENDENCY_INSTALL=1` |
| Static output directory | None; this is a Worker with a container |

Python dependencies install inside Docker, not in the Workers build host. The Docker image bundles the MiniLM model and CPU-only PyTorch. No Hugging Face or OpenAI API key is required. The first image build takes longer than later cached builds.

The Worker name must match `name` in `wrangler.jsonc`. Production must use `wrangler deploy`, not `wrangler versions upload`, so the container image is published too. Disable non-production branch builds initially.

## Before using real resumes

The app currently has no user login. Protect its deployed URL with Cloudflare Access restricted to your recruiter email/team before uploading personal data. For workers.dev URLs, use the Worker's Settings → Domains & Routes → workers.dev Access control; alternatively attach a custom domain and protect it with a self-hosted Access application. Protect or disable any alternate public route. Do not put credentials in this repository.

## Check the deployment

Wait for container provisioning after the first deployment. Open the Worker URL and verify the JD screen. Use the JD and five synthetic resumes under `examples/` to test the full upload-and-ranking flow before using real resumes. The health endpoint is `/_stcore/health`.

The configuration uses one `standard-1` container (4 GiB memory) for the local CPU model. HTTP uploads and WebSockets route to the same instance. Each Streamlit session has its own candidate results; only model resources are shared. The container sleeps after 10 minutes idle. Data is ephemeral: deployments, restarts and sleep can clear sessions. Download the JSON review before leaving. This baseline is for a small team, not a production multi-tenant service.

## Local files and auto-deployment

Local app files, environments and caches remain under `G:\Project\applications`. Cloudflare deployment runs on Cloudflare infrastructure, which has no Windows drive letters. GitHub never receives resumes, local indexes or caches.

Once Git integration is enabled, pushes to `main` trigger Cloudflare builds. The optional Windows auto-sync watcher can create these pushes; keep it paused during multi-file edits that should ship together.

## Official references

- https://developers.cloudflare.com/containers/guides/deploy/
- https://developers.cloudflare.com/containers/platform/limits/
- https://developers.cloudflare.com/workers/ci-cd/builds/
