"""Maakt de posters van de variant "papier" uit poster-papier.html.

    python3 store/posters/bron/maak.py

Schrijft store/posters/papier/: de A5 en drie A4's met twee A5's naast elkaar
(zonder iets, met snijtekens, met een stippellijn in het midden). Vraagt Google
Chrome (voor de PDF en het lettertype Inter van Google Fonts, dus met netwerk),
pypdf en reportlab.
"""

import io
import pathlib
import subprocess

from pypdf import PageObject, PdfReader, PdfWriter, Transformation
from reportlab.pdfgen import canvas

HIER = pathlib.Path(__file__).resolve().parent
UIT = HIER.parent / 'papier'
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
A4_B, A4_H = 841.8898, 595.2756  # liggend, in punten
NAAM = 'VTK-app-poster'


def a5():
    UIT.mkdir(exist_ok=True)
    pdf = UIT / f'{NAAM}-A5.pdf'
    subprocess.run([
        CHROME, '--headless=new', '--disable-gpu', '--no-pdf-header-footer',
        '--virtual-time-budget=15000', f'--print-to-pdf={pdf}',
        (HIER / 'poster-papier.html').as_uri(),
    ], check=True, capture_output=True)
    return pdf


def tekens(soort):
    """Een A4-laag met enkel de snijtekens of de stippellijn."""
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(A4_B, A4_H))
    x = A4_B / 2
    if soort == 'snijtekens':
        c.setStrokeGray(0.15)
        c.setLineWidth(0.6)
        c.line(x, A4_H, x, A4_H - 22.677)  # 8 mm
        c.line(x, 0, x, 22.677)
    elif soort == 'stippellijn':
        c.setStrokeGray(0.2)
        c.setLineWidth(0.5)
        c.setDash(3, 4)
        c.line(x, 0, x, A4_H)
    c.showPage()
    c.save()
    buf.seek(0)
    return PdfReader(buf).pages[0]


def twee_op_a4(a5_pdf, soort):
    poster = PdfReader(a5_pdf).pages[0]
    b, h = float(poster.mediabox.width), float(poster.mediabox.height)
    sx, sy = (A4_B / 2) / b, A4_H / h
    blad = PageObject.create_blank_page(width=A4_B, height=A4_H)
    for links in (0, A4_B / 2):
        blad.merge_transformed_page(poster, Transformation().scale(sx, sy).translate(links, 0))
    if soort:
        blad.merge_page(tekens(soort))
    w = PdfWriter()
    w.add_page(blad)
    w.compress_identical_objects()
    naam = f'{NAAM}-A4-2up' + (f'-{soort}' if soort else '') + '.pdf'
    with open(UIT / naam, 'wb') as f:
        w.write(f)


if __name__ == '__main__':
    pdf = a5()
    for soort in (None, 'snijtekens', 'stippellijn'):
        twee_op_a4(pdf, soort)
    print('\n'.join(sorted(p.name for p in UIT.glob('*.pdf'))))
