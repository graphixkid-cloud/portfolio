import json, re, sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "_tools"))
from knowledge import build_knowledge, write_knowledge  # noqa: E402


@pytest.fixture(scope="module")
def k():
    return build_knowledge(ROOT)


def test_contains_key_facts(k):
    assert "$41B" in k and "30-person" in k and "950K+" in k


def test_has_case_urls(k):
    for slug in ["verizon-family", "ebs", "gizmo-watch", "care-smart", "finfront"]:
        assert f"https://rickhollandsworth.com/work/{slug}/" in k


def test_pdf_links_absolute(k):
    assert "https://rickhollandsworth.com/assets/pdf/ebs-case-study.pdf" in k
    assert "(assets/" not in k


def test_no_password(k):
    assert "uxd2026" not in k.lower()


def test_no_html(k):
    assert "<" not in k and "data-goatcounter" not in k and "&amp;" not in k


def test_no_remote_preference(k):
    # "remote Medical ID management" is a product feature and may appear; "(Remote)" as a work setup must not.
    assert "(Remote)" not in k and "remote position" not in k.lower()


def test_resume_included(k):
    assert "Pratt Institute" in k and "Pershing" in k


def test_contact_included(k):
    assert "rick.hollandsworth@outlook.com" in k
    assert "https://www.linkedin.com/in/rickhollandsworth/" in k


def test_about_rick_included(k):
    assert "Speaking Human" in k and "Additional background (approved by Rick)" in k
    assert "editor note" not in k and "Approved by Rick (2026" not in k
    for private in ["908", "267-567", "917) 374", "horstfra", "mcgeebr", "phlpkm", "1995", "GPA", "Hybrid", "647.63", "$99M", "$35M", "$220M", "$514M", "$1B", "17.7M"]:
        assert private not in k, private


def test_size_budget(k):
    assert len(k) < 60000


def test_write_knowledge_module(tmp_path):
    out = write_knowledge(ROOT, out=tmp_path / "knowledge.js")
    js = out.read_text(encoding="utf-8")
    m = re.match(r"export const KNOWLEDGE = (\".*?\");\nexport const PAGES = (\{.*\});\n$", js, re.S)
    assert m, js[:200]
    assert json.loads(m.group(1)) == build_knowledge(ROOT)
    pages = json.loads(m.group(2))
    assert pages["home"]["url"] == "https://rickhollandsworth.com/"
    assert pages["ebs"]["url"] == "https://rickhollandsworth.com/work/ebs/"
    assert set(pages) >= {"home", "verizon-family", "ebs", "gizmo-watch", "care-smart", "finfront"}
