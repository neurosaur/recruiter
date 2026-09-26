import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location('autosync', Path(__file__).resolve().parents[1] / 'scripts/git_autosync.py')
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


def test_autosync_excludes_private_data():
    for name in ['data/person.txt', 'uploads/resume.txt', '.env', '.env.local',
                 '.streamlit/secrets.toml', 'credentials.json', 'candidate.docx',
                 '.cache/status.json', 'reports/ranking.json', 'resumes/person.txt']:
        assert not worker.safe_code(name), name
    for name in ['app.py', 'src/review.py', 'README.md', '.gitignore', 'tests/test_app.py']:
        assert worker.safe_code(name), name
    assert not worker.safe_code('examples/resumes/new-candidate.txt')
    assert not worker.safe_code('examples/software_engineer.txt')
