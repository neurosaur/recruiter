from pathlib import Path
from .text_cleaner import clean_text


def parse_document(path):
    path = Path(path)
    suffix = path.suffix.lower()
    if suffix == '.pdf':
        import pymupdf
        with pymupdf.open(path) as doc:
            if doc.needs_pass:
                raise ValueError('Password-protected PDF')
            text = '\n'.join(page.get_text(sort=True) for page in doc)
    elif suffix == '.docx':
        from docx import Document
        from docx.table import Table
        from docx.text.paragraph import Paragraph
        doc = Document(path)
        parts = []
        for item in doc.iter_inner_content():
            if isinstance(item, Paragraph):
                parts.append(item.text)
            elif isinstance(item, Table):
                parts.extend(' | '.join(cell.text for cell in row.cells) for row in item.rows)
        text = '\n'.join(parts)
    elif suffix == '.txt':
        text = path.read_text(encoding='utf-8-sig')
    else:
        raise ValueError(f'Unsupported format: {suffix}')
    text = clean_text(text)
    if not text:
        raise ValueError('No readable text; scanned PDFs need OCR before ingestion')
    return text
