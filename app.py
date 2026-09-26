import hashlib
import json
import os
import tempfile
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TEMP = ROOT / '.cache' / 'tmp'
TEMP.mkdir(parents=True, exist_ok=True)
os.environ['HF_HOME'] = str(ROOT / '.cache' / 'huggingface')
os.environ['HF_HUB_DISABLE_SYMLINKS_WARNING'] = '1'
os.environ['TEMP'] = os.environ['TMP'] = str(TEMP)
tempfile.tempdir = str(TEMP)

import streamlit as st
import faiss
from src.embeddings import Embedder
from src.resume_parser import parse_document
from src.jd_matcher import rank_candidates
from src.review import criterion_mentions

st.set_page_config(page_title='Neurosaur | Candidate review', page_icon='🦕', layout='wide')


@st.cache_resource
def model_resource():
    return Embedder(), threading.Lock()


def read_upload(upload):
    with tempfile.TemporaryDirectory(dir=TEMP) as folder:
        path = Path(folder) / ('document' + Path(upload.name).suffix.lower())
        path.write_bytes(upload.getvalue())
        return parse_document(path)


st.caption('NEUROSAUR / RECRUITMENT WORKSPACE')
st.title('A clearer first shortlist.')
st.write('Start with the role. Compare a small candidate pool. Review the evidence behind every result.')
step = st.session_state.get('step', 1)
with st.sidebar:
    st.subheader('Your review')
    st.write(('➜ ' if step == 1 else '✓ ') + '1. Job description')
    st.write(('➜ ' if step == 2 else '') + '2. Candidate resumes')
    st.write(('➜ ' if step == 3 else '') + '3. Evidence & shortlist')
    st.divider()
    st.caption('Local workspace • Up to 10 resumes per review')
    st.caption('Resume contents are processed locally. Temporary upload files are removed after parsing.')
    if st.button('Start a new review'):
        st.session_state.clear()
        st.rerun()

if step == 1:
    st.subheader('1. Describe the role')
    st.caption('Paste the JD or upload a TXT, PDF or Word document. Pasted text takes precedence.')
    jd_text = st.text_area('Job description', value=st.session_state.get('jd', ''), height=260,
                           placeholder='Role, responsibilities, required skills, experience and location…')
    jd_file = st.file_uploader('Or upload the JD', type=['txt', 'pdf', 'docx'])
    criteria_text = st.text_area('Skills or phrases to check (optional, one per line)',
                                value=st.session_state.get('criteria_text', ''),
                                placeholder='Python\nFastAPI\nPostgreSQL', height=120,
                                help='Checks explicit mentions only. A mention is not proof of experience; a missing phrase is not proof a skill is absent.')
    if st.button('Continue to resumes', type='primary'):
        try:
            jd = jd_text.strip() or (read_upload(jd_file) if jd_file else '')
            if len(jd.split()) < 10:
                st.error('Please provide a fuller JD with at least 10 words.')
            else:
                st.session_state.update(jd=jd, criteria_text=criteria_text,
                                        criteria=[x.strip() for x in criteria_text.splitlines() if x.strip()], step=2)
                st.rerun()
        except Exception as exc:
            st.error(f'Could not read the JD: {exc}')

elif step == 2:
    st.subheader('2. Add 5–10 candidate resumes')
    with st.expander('Review the job description'):
        st.text(st.session_state.jd)
    uploads = st.file_uploader('Upload resumes', type=['pdf', 'docx', 'txt'], accept_multiple_files=True,
                               help='Maximum 10 MB per file. Scanned PDFs need text extraction/OCR first.')
    st.caption(f'{len(uploads)} of 10 files selected. Use 5–10 resumes for this first comparison.')
    back, run = st.columns([1, 3])
    if back.button('Edit JD'):
        st.session_state.step = 1
        st.rerun()
    if run.button('Compare candidates', type='primary', disabled=not 5 <= len(uploads) <= 10):
        records, failures, seen = [], [], set()
        progress = st.progress(0, text='Reading candidate resumes…')
        for i, upload in enumerate(uploads):
            try:
                if upload.size > 10 * 1024 * 1024:
                    raise ValueError('File exceeds 10 MB')
                digest = hashlib.sha256(upload.getvalue()).hexdigest()
                if digest in seen:
                    raise ValueError('Duplicate file contents; already included')
                text = read_upload(upload)
                seen.add(digest)
                records.append({'candidate': upload.name, 'text': text, 'sha256': digest})
            except Exception as exc:
                failures.append({'candidate': upload.name, 'error': str(exc)})
            progress.progress((i + 1) / len(uploads) * 0.4, text=f'Read {i + 1} of {len(uploads)} resumes')
        for failure in failures:
            st.warning(f"{failure['candidate']}: {failure['error']}")
        if len(records) < 5:
            st.error('At least 5 readable, unique resumes are required. Replace the failed or duplicate files and try again.')
        else:
            try:
                progress.progress(0.5, text='Loading local matching model. The first run may download model files…')
                embedder, lock = model_resource()
                with lock:
                    vectors = embedder.encode([r['text'] for r in records])
                    index = faiss.IndexFlatIP(vectors.shape[1])
                    index.add(vectors)
                    progress.progress(0.8, text='Comparing candidates against the JD…')
                    results = rank_candidates(index, {'model': embedder.model_name, 'records': records},
                                              st.session_state.jd, embedder)
                by_hash = {r['sha256']: r for r in records}
                for result in results:
                    result['criterion_checks'] = criterion_mentions(by_hash[result['source_sha256']]['text'], st.session_state.criteria)
                st.session_state.update(results=results, failures=failures, step=3)
                st.rerun()
            except Exception as exc:
                st.error(f'Comparison failed: {exc}')

else:
    results = st.session_state.results
    st.subheader('3. Review evidence and build your shortlist')
    st.info('Relevance is cosine similarity × 100, not a probability or a hiring recommendation. Verify the resume evidence and role requirements before shortlisting.')
    a, b, c = st.columns(3)
    a.metric('Candidates compared', len(results))
    b.metric('Top relevance', f"{results[0]['similarity'] * 100:.1f}")
    c.metric('Files skipped', len(st.session_state.failures))
    if st.session_state.failures:
        with st.expander('Skipped files'):
            for failure in st.session_state.failures:
                st.write(f"{failure['candidate']}: {failure['error']}")
    st.dataframe([{'Rank': i + 1, 'Candidate': r['candidate'], 'Relevance': round(r['similarity'] * 100, 1)}
                  for i, r in enumerate(results)], hide_index=True, width='stretch')
    selected = []
    for i, result in enumerate(results):
        with st.expander(f"{i + 1}. {result['candidate']} · {result['similarity'] * 100:.1f} relevance", expanded=i == 0):
            st.write(f"This resume ranks {i + 1} of {len(results)} by semantic similarity to your JD. Review the following excerpts when deciding whether to shortlist.")
            st.caption('Excerpts use word overlap with the JD and do not independently explain every part of the embedding score.')
            for evidence in result['matched_evidence']:
                st.text(evidence['text'])
                st.caption(f"Extracted resume text, line {evidence['line']}")
            if result['criterion_checks']:
                st.write('Your skill / phrase checks')
                st.dataframe(result['criterion_checks'], hide_index=True, width='stretch')
            st.caption('Verify experience, skill depth, location, compensation and availability. No automatic eligibility or rejection decision has been made.')
            chosen = st.checkbox('Add to my shortlist', key='pick_' + result['source_sha256'])
            note = st.text_input('Recruiter justification / follow-up notes', key='note_' + result['source_sha256'])
            if chosen:
                selected.append({**result, 'reviewer_note': note, 'decision': 'shortlisted_by_recruiter'})
    report = {'job_description': st.session_state.jd, 'criteria': st.session_state.criteria,
              'results': results, 'shortlist': selected, 'skipped_files': st.session_state.failures,
              'score_definition': 'Cosine similarity; displayed relevance = cosine * 100, not a probability.'}
    st.download_button(f'Download review ({len(selected)} shortlisted)',
                       data=json.dumps(report, indent=2, ensure_ascii=False),
                       file_name='neurosaur-review.json', mime='application/json')
    if st.button('Change candidate pool'):
        st.session_state.step = 2
        st.rerun()
