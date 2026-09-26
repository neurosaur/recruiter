import numpy as np

DEFAULT_MODEL = 'sentence-transformers/all-MiniLM-L6-v2'


class Embedder:
    def __init__(self, model_name=DEFAULT_MODEL, offline=False):
        from sentence_transformers import SentenceTransformer
        self.model_name = model_name
        self.model = SentenceTransformer(model_name, device='cpu', local_files_only=offline)

    def chunks(self, text):
        # Token-based windows prevent silent truncation of long resumes.
        tokenizer = self.model.tokenizer
        ids = tokenizer.encode(text, add_special_tokens=False)
        size = max(16, self.model.max_seq_length - 16)
        return [tokenizer.decode(ids[i:i + size], skip_special_tokens=True)
                for i in range(0, len(ids), size)]

    def encode(self, texts):
        vectors = []
        for text in texts:
            chunks = self.chunks(text)
            embeddings = self.model.encode(chunks, normalize_embeddings=True,
                                           convert_to_numpy=True, show_progress_bar=False)
            vector = np.mean(embeddings, axis=0)
            norm = np.linalg.norm(vector)
            if not np.isfinite(norm) or norm == 0:
                raise ValueError('Invalid embedding')
            vectors.append(vector / norm)
        return np.asarray(vectors, dtype='float32')
