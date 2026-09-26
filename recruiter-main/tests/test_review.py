from src.review import criterion_mentions


def test_phrase_boundaries_and_missing_evidence():
    checks = criterion_mentions('Used C++ and PostgreSQL\nPython developer', ['C++', 'SQL', 'python'])
    assert checks[0]['Resume excerpt'] == 'Used C++ and PostgreSQL'
    assert checks[1]['Resume excerpt'] == ''
    assert checks[2]['Resume excerpt'] == 'Python developer'
