import re


def rank_candidates(index, metadata, jd, embedder, top=None):
    if metadata['model'] != embedder.model_name:
        raise ValueError('Embedding model differs from stored model; re-ingest')
    query = embedder.encode([jd])
    if query.shape[1] != index.d:
        raise ValueError('Embedding dimension differs from stored index')
    scores, ids = index.search(query, index.ntotal)
    terms = set(re.findall(r'[a-zA-Z][a-zA-Z0-9+#.]{2,}', jd.lower()))
    results = []
    for score, candidate_id in zip(scores[0], ids[0]):
        record = metadata['records'][int(candidate_id)]
        lines = record['text'].splitlines()
        evidence = sorted(enumerate(lines), key=lambda pair: (
            -len(terms.intersection(re.findall(r'[a-zA-Z][a-zA-Z0-9+#.]{2,}', pair[1].lower()))), pair[0]))[:3]
        results.append({
            'candidate': record['candidate'], 'similarity': float(score),
            'source_sha256': record['sha256'],
            'matched_evidence': [{'text': line, 'line': i + 1} for i, line in evidence],
            'missing_information': ['Mandatory criteria, availability and compensation are not verified in Phase 1.'],
        })
    results.sort(key=lambda item: (-item['similarity'], item['candidate']))
    return results[:top] if top else results
