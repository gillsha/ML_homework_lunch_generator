"""Check the final PDF and render page previews (requires PyMuPDF)."""
import json
import sys
from pathlib import Path
import fitz

root = Path(__file__).resolve().parents[1]
output = Path(sys.argv[1])
output.mkdir(parents=True, exist_ok=True)
doc = fitz.open(root / "elatontseva_a02_report.pdf")
assert len(doc) == 6, f"Expected six pages, got {len(doc)}"
pages = []
for number, page in enumerate(doc, 1):
    text = page.get_text()
    assert len(text) > 500, f"Page {number} is unexpectedly empty"
    assert "\ufffd" not in text, f"Replacement character on page {number}"
    for block in page.get_text("blocks"):
        assert block[0] >= 0 and block[1] >= 0
        assert block[2] <= page.rect.width + 1 and block[3] <= page.rect.height + 1
    page.get_pixmap(matrix=fitz.Matrix(1.3, 1.3)).save(output / f"page-{number}.png")
    pages.append({"page": number, "characters": len(text), "within_page_bounds": True})
all_text = "\n".join(page.get_text() for page in doc)
for expected in ["Polina Elatontseva", "redlymood@gmail.com", "2026-09-25", "Precision@5", "AI Usage Disclosure", "References", "elatontseva_a02_session.json"]:
    assert expected in all_text, expected
report = {"passed": True, "page_count": len(doc), "pages": pages}
(root / "experiments/pdf-verification.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(report, indent=2))
