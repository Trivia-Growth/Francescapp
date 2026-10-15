"""Render the João handoff from its editable Markdown source.

Requires reportlab. System Liberation fonts are used for portable PDF reading;
the mock's actual typefaces and tokens are documented in DESIGN.md.
"""

from html import escape
from pathlib import Path
import re

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageBreak, PageTemplate, Paragraph, Spacer,
    Table, TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs/projeto/especificacoes-para-joao.md"
OUTPUT = ROOT / "output/pdf/especificacoes-francescapp-joao.pdf"
FONT_DIR = Path("/usr/share/fonts/truetype/liberation")

for name, filename in (
    ("Text", "LiberationSans-Regular.ttf"),
    ("TextBold", "LiberationSans-Bold.ttf"),
    ("TextItalic", "LiberationSans-Italic.ttf"),
    ("TextBoldItalic", "LiberationSans-BoldItalic.ttf"),
    ("Editorial", "LiberationSerif-Regular.ttf"),
):
    pdfmetrics.registerFont(TTFont(name, str(FONT_DIR / filename)))
pdfmetrics.registerFontFamily(
    "Text", normal="Text", bold="TextBold", italic="TextItalic",
    boldItalic="TextBoldItalic",
)

INK = colors.HexColor("#273123")
OLIVE = colors.HexColor("#475436")
MUTED = colors.HexColor("#65705f")
LINE = colors.HexColor("#dfe5d4")
SOFT = colors.HexColor("#f1f4e9")
WIDTH, HEIGHT = A4
MARGIN = 44
CONTENT_WIDTH = WIDTH - 2 * MARGIN


def style(name, **kwargs):
    return ParagraphStyle(name, fontName="Text", fontSize=11, leading=14.5,
                          textColor=INK, alignment=TA_LEFT, **kwargs)


STYLES = {
    "body": style("body", spaceAfter=5),
    "bullet": style("bullet", leftIndent=11, firstLineIndent=-9, spaceAfter=4),
    "h1": ParagraphStyle("h1", fontName="Editorial", fontSize=42,
                         leading=45, textColor=OLIVE, spaceAfter=14,
                         keepWithNext=True),
    "h2": ParagraphStyle("h2", fontName="Editorial", fontSize=26,
                         leading=29, textColor=OLIVE, spaceAfter=10,
                         keepWithNext=True),
    "h3": ParagraphStyle("h3", fontName="TextBold", fontSize=11.5,
                         leading=15, textColor=OLIVE, spaceBefore=6,
                         spaceAfter=4, keepWithNext=True),
    "cell": ParagraphStyle("cell", fontName="Text", fontSize=10.2,
                           leading=13.5, textColor=INK),
    "cellhead": ParagraphStyle("cellhead", fontName="TextBold", fontSize=10.2,
                               leading=13.5, textColor=OLIVE),
}


def inline(text):
    text = re.sub(r"[\u2010-\u2015\u2212]", "-", text)
    text = escape(text)
    # Repository links stay readable in a standalone PDF, not broken local links.
    text = re.sub(r"\[([^]]+)\]\([^)]+\)", r"<b>\1</b>", text)
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    return re.sub(r"`([^`]+)`", r"\1", text)


class SpecificationDoc(BaseDocTemplate):
    def afterFlowable(self, flowable):
        if isinstance(flowable, Paragraph) and flowable.style.name in ("h1", "h2"):
            title = flowable.getPlainText()
            key = f"chapter-{self.seq.nextf('chapter')}"
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry(title, key, level=0, closed=False)


def furniture(canvas, doc):
    canvas.saveState()
    canvas.setTitle("Francescapp - Especificações de features e regras de negócio")
    canvas.setAuthor("Francescapp / Trivia")
    canvas.setSubject("Documento de trabalho para João - versão 1.0 - 14/10/2026")
    canvas.setStrokeColor(LINE)
    canvas.line(MARGIN, HEIGHT - 32, WIDTH - MARGIN, HEIGHT - 32)
    canvas.setFillColor(OLIVE)
    canvas.setFont("TextBold", 8.5)
    canvas.drawString(MARGIN, HEIGHT - 23, "FRANCESCAPP")
    canvas.setFont("Text", 8.5)
    canvas.setFillColor(MUTED)
    canvas.drawRightString(WIDTH - MARGIN, HEIGHT - 23, "ESPECIFICAÇÕES / 14.10.2026")
    canvas.line(MARGIN, 32, WIDTH - MARGIN, 32)
    canvas.drawString(MARGIN, 19, "Documento de trabalho para João · v1.0 · design provisório")
    canvas.drawRightString(WIDTH - MARGIN, 19, str(doc.page))
    canvas.restoreState()


def table(lines):
    rows = [[part.strip() for part in line.strip().strip("|").split("|")]
            for line in lines]
    rows = [rows[0]] + rows[2:]
    count = len(rows[0])
    widths = ([CONTENT_WIDTH * .27, CONTENT_WIDTH * .73] if count == 2
              else [CONTENT_WIDTH * .15, CONTENT_WIDTH * .43, CONTENT_WIDTH * .42])
    if rows[0][0] == "Perfil":
        widths = [CONTENT_WIDTH * .20, CONTENT_WIDTH * .40, CONTENT_WIDTH * .40]
    data = [[Paragraph(inline(value), STYLES["cellhead" if n == 0 else "cell"])
             for value in row] for n, row in enumerate(rows)]
    result = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT")
    result.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), SOFT),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LINEBELOW", (0, 0), (-1, -1), .4, LINE),
    ]))
    return result


def parse(markdown):
    lines = markdown.splitlines()
    story = []
    n = 0
    while n < len(lines):
        line = lines[n].strip()
        if not line:
            n += 1
            continue
        if line == "<!-- page -->":
            story.append(PageBreak())
        elif line.startswith("|"):
            block = []
            while n < len(lines) and lines[n].strip().startswith("|"):
                block.append(lines[n])
                n += 1
            story.extend([table(block), Spacer(1, 7)])
            continue
        elif line.startswith("#"):
            level = len(line) - len(line.lstrip("#"))
            story.append(Paragraph(inline(line[level:].strip()), STYLES[f"h{min(level, 3)}"]))
        elif line.startswith("- ") or re.match(r"^\d+\. ", line):
            label, text = ("-", line[2:]) if line.startswith("- ") else line.split(" ", 1)
            story.append(Paragraph(f"{label} {inline(text)}", STYLES["bullet"]))
        else:
            paragraph = [line]
            while n + 1 < len(lines) and lines[n + 1].strip() and not re.match(
                r"^(#|\||- |\d+\. |<!--)", lines[n + 1].strip()
            ):
                n += 1
                paragraph.append(lines[n].strip())
            story.append(Paragraph(inline(" ".join(paragraph)), STYLES["body"]))
        n += 1
    return story


def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc = SpecificationDoc(str(OUTPUT), pagesize=A4, leftMargin=MARGIN,
                           rightMargin=MARGIN, topMargin=48, bottomMargin=44)
    frame = Frame(MARGIN, 44, CONTENT_WIDTH, HEIGHT - 92,
                  leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates(PageTemplate(id="specification", frames=[frame], onPage=furniture))
    doc.build(parse(SOURCE.read_text(encoding="utf-8")))
    print(OUTPUT)


if __name__ == "__main__":
    main()
