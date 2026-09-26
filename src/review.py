import re


def criterion_mentions(text, criteria):
    checks = []
    for criterion in criteria:
        pattern = r'(?<!\w)' + re.escape(criterion) + r'(?!\w)'
        evidence = next((line for line in text.splitlines() if re.search(pattern, line, re.IGNORECASE)), None)
        checks.append({'Phrase': criterion,
                       'Finding': 'Explicit mention — verify proficiency' if evidence else 'Not explicitly found — verify with candidate',
                       'Resume excerpt': evidence or ''})
    return checks
