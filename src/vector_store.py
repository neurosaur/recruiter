import json
import os
import uuid
from pathlib import Path
import faiss
import numpy as np


def save_store(folder, vectors, records, model):
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    vectors = np.ascontiguousarray(vectors, dtype='float32')
    if len(records) != len(vectors) or not records:
        raise ValueError('Store requires one vector per candidate')
    index = faiss.IndexFlatIP(vectors.shape[1])
    index.add(vectors)
    generation = uuid.uuid4().hex
    # Commit a manifest last so interrupted ingestion preserves the previous store.
    index_name = generation + '.faiss'
    metadata_name = generation + '.json'
    faiss.write_index(index, str(folder / index_name))
    (folder / metadata_name).write_text(json.dumps({
        'model': model, 'dimension': vectors.shape[1], 'records': records,
        'embedding_method': 'normalized-mean-token-chunks-v1'
    }, indent=2, ensure_ascii=False), encoding='utf-8')
    pending = folder / (generation + '.manifest')
    pending.write_text(json.dumps({'index': index_name, 'metadata': metadata_name}), encoding='utf-8')
    os.replace(pending, folder / 'manifest.json')


def load_store(folder):
    folder = Path(folder)
    manifest = json.loads((folder / 'manifest.json').read_text(encoding='utf-8'))
    for value in manifest.values():
        if Path(value).name != value:
            raise ValueError('Invalid store manifest')
    metadata = json.loads((folder / manifest['metadata']).read_text(encoding='utf-8'))
    index = faiss.read_index(str(folder / manifest['index']))
    if index.ntotal != len(metadata['records']) or index.d != metadata['dimension']:
        raise ValueError('Inconsistent vector store; ingest resumes again')
    return index, metadata
