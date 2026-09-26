FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/app/.cache/huggingface \
    HF_HUB_DISABLE_TELEMETRY=1 \
    DEPLOYMENT_MODE=cloud \
    STREAMLIT_BROWSER_GATHER_USAGE_STATS=false \
    OMP_NUM_THREADS=1 \
    TOKENIZERS_PARALLELISM=false

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt ./
RUN pip install torch --index-url https://download.pytorch.org/whl/cpu \
    && pip install -r requirements.txt
COPY src/ ./src/
# Bake the embedding model into the image. No model download at runtime.
RUN python -c "from src.embeddings import Embedder; Embedder().encode(['Build verification'])"
ENV HF_HUB_OFFLINE=1
COPY app.py run.py ./
COPY .streamlit/config.toml ./.streamlit/config.toml
RUN useradd --create-home --uid 10001 appuser \
    && mkdir -p /app/.cache/tmp && chown -R appuser:appuser /app
USER appuser
EXPOSE 8501
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8501/_stcore/health', timeout=4)"
CMD ["python", "-m", "streamlit", "run", "app.py", "--server.address=0.0.0.0", "--server.port=8501", "--server.headless=true"]
