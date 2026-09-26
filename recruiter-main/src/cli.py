import argparse
import hashlib
import json
import sys
from pathlib import Path
from .embeddings import DEFAULT_MODEL, Embedder
from .resume_parser import parse_document
from .vector_store import save_store, load_store
from .jd_matcher import rank_candidates


def ingest(folder, store, embedder):
    folder = Path(folder)
    if not folder.is_dir():
        raise ValueError(f'Resume folder does not exist: {folder}')
    records, failures = [], []
    for path in sorted(folder.rglob('*')):
        if not path.is_file() or path.suffix.lower() not in {'.pdf', '.docx', '.txt'} or path.name.startswith('~$'):
            continue
        try:
            records.append({'candidate': path.relative_to(folder).as_posix(),
                            'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                            'text': parse_document(path)})
        except Exception as exc:
            failures.append({'candidate': path.name, 'error': str(exc)})
    for failure in failures:
        print(f"Skipped {failure['candidate']}: {failure['error']}", file=sys.stderr)
    if not records:
        raise ValueError('No readable PDF, DOCX or TXT resumes found')
    vectors = embedder.encode([record['text'] for record in records])
    save_store(store, vectors, records, embedder.model_name)
    print(f'Indexed {len(records)} resumes; skipped {len(failures)}.', file=sys.stderr)
    return failures


def main():
    parser = argparse.ArgumentParser(description='Neurosaur Phase 1 local resume matching')
    parser.add_argument('command', nargs='?', default='run', choices=['run', 'ingest', 'match'])
    parser.add_argument('--resumes', default='data/resumes')
    parser.add_argument('--jd', help='Job description: TXT, PDF or DOCX')
    parser.add_argument('--store', default='data/vector_store')
    parser.add_argument('--output', default='output/ranking.json')
    parser.add_argument('--model', default=DEFAULT_MODEL)
    parser.add_argument('--offline', action='store_true', help='Use a previously downloaded model only')
    parser.add_argument('--top', type=int, help='Return top N; default returns all candidates')
    args = parser.parse_args()
    if args.command != 'ingest' and not args.jd:
        parser.error('--jd is required for run/match')
    if args.top is not None and args.top < 1:
        parser.error('--top must be positive')
    try:
        jd = parse_document(args.jd) if args.command != 'ingest' else None
        embedder = Embedder(args.model, args.offline)
        failures = ingest(args.resumes, args.store, embedder) if args.command != 'match' else []
        if jd is not None:
            index, metadata = load_store(args.store)
            results = rank_candidates(index, metadata, jd, embedder, args.top)
            output = Path(args.output)
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_text(json.dumps({
                'model': args.model, 'job_description': str(args.jd),
                'notice': 'Cosine similarity is a retrieval signal, not a hiring decision. Evidence excerpts use lexical overlap, not verified criteria.',
                'ingestion_failures': failures, 'results': results
            }, ensure_ascii=False, indent=2), encoding='utf-8')
            print(f"{'Rank':<6}{'Candidate':<45}Similarity")
            for rank, result in enumerate(results, 1):
                print(f"{rank:<6}{result['candidate']:<45}{result['similarity']:.4f}")
            print(f'\nReport: {output.resolve()}')
        return 0
    except Exception as exc:
        print(f'Error: {exc}', file=sys.stderr)
        return 1
