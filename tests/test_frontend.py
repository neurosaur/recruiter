from pathlib import Path
from streamlit.testing.v1 import AppTest

APP = Path(__file__).resolve().parents[1] / 'app.py'


def test_jd_validation_and_next_step():
    app = AppTest.from_file(str(APP)).run(timeout=30)
    assert not app.exception
    next(button for button in app.button if button.label == 'Continue to resumes').click().run()
    assert len(app.error) == 1
    app.text_area[0].set_value('We need a Python engineer with FastAPI PostgreSQL Docker and automated testing experience.')
    next(button for button in app.button if button.label == 'Continue to resumes').click().run()
    assert not app.exception
    assert app.session_state['step'] == 2
    assert next(button for button in app.button if button.label == 'Compare candidates').disabled


def test_review_and_shortlist():
    app = AppTest.from_file(str(APP))
    app.session_state['step'] = 3
    app.session_state['jd'] = 'Python engineer'
    app.session_state['criteria'] = ['Python']
    app.session_state['failures'] = []
    app.session_state['results'] = [{
        'candidate': 'sample.txt', 'source_sha256': 'abc', 'similarity': .7,
        'matched_evidence': [{'text': 'Python developer', 'line': 1}], 'criterion_checks': []
    }]
    app.run(timeout=30)
    assert not app.exception
    app.checkbox[0].check().run()
    assert not app.exception
    assert app.session_state['pick_abc'] is True
