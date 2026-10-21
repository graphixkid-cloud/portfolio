import re, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SLUGS = ["verizon-family", "ebs", "gizmo-watch", "care-smart", "finfront"]


def setup_module():
    subprocess.run([sys.executable, str(ROOT / "_tools" / "build_pages.py"), str(ROOT)], check=True, capture_output=True)


def tag(html):
    m = re.search(r'<script src="([^"]*assets/js/ask\.js)" defer data-endpoint="([^"]*)" data-page="([^"]+)"([^>]*)></script>', html)
    assert m, "ask.js script tag missing"
    return m


def test_home_includes_widget():
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    assert '<link rel="stylesheet" href="assets/css/ask.css">' in html
    m = tag(html)
    assert m.group(1) == "assets/js/ask.js" and m.group(3) == "home"
    assert html.count("assets/js/ask.js") == 1


def test_case_pages_include_widget():
    for slug in SLUGS:
        html = (ROOT / "work" / slug / "index.html").read_text(encoding="utf-8")
        assert '<link rel="stylesheet" href="../../assets/css/ask.css">' in html, slug
        m = tag(html)
        assert m.group(1) == "../../assets/js/ask.js" and m.group(3) == slug, slug
        assert html.count("assets/js/ask.js") == 1, slug


def test_endpoint_consistent():
    pages = [ROOT / "index.html"] + [ROOT / "work" / s / "index.html" for s in SLUGS]
    endpoints = {tag(p.read_text(encoding="utf-8")).group(2) for p in pages}
    assert len(endpoints) == 1
