import re
import unicodedata


def clean_text(text):
    text = unicodedata.normalize('NFKC', text).replace('\x00', '')
    return '\n'.join(re.sub(r'\s+', ' ', line).strip()
                     for line in text.splitlines() if line.strip())
