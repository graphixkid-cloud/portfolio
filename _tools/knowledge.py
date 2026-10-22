#!/usr/bin/env python3
"""Build the Portfolio Assistant's knowledge from the site's own sources.

Sources: the home page (index.html, minus the generated case cards), each case study
in _tools/cases/<slug>.html, the plain-text résumé in _tools/resume.txt, and
Rick's approved extra background in _tools/about-rick.md.
Output: _worker/src/knowledge.js, which exports KNOWLEDGE (plain text) and PAGES
(slug -> {title, url}). build_pages.py calls write_knowledge() at the end of every
build, so the assistant always answers from what the site currently says.
"""
import html, json, re, sys
from html.parser import HTMLParser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_pages import CASES, PDFS, SITE  # noqa: E402

FORBIDDEN = ["uxd2026"]  # the Verizon PDF password must never reach the assistant
SKIP = {"script", "style", "svg", "nav", "header", "video", "button", "picture"}  # elements with end tags
VOID_IGNORE = {"img", "source", "input", "meta", "link"}
BLOCK = {"p", "div", "section", "article", "li", "dt", "dd", "h1", "h2", "h3", "h4", "h5",
         "blockquote", "figcaption", "footer", "ul", "ol", "dl", "br", "tr"}


def absolute(href):
    if href.startswith(("http://", "https://", "mailto:")):
        return href
    if href.startswith(("#", "tel:", "javascript:")):
        return None
    href = re.sub(r"^(\.\./)+", "", href)
    return f"{SITE}/{href.lstrip('/')}"


class Text(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out, self.skip, self.links = [], 0, []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in VOID_IGNORE:
            if tag == "img" and a.get("alt") and not self.skip:
                self.out.append(f" (image: {a['alt']}) ")
            return
        if tag in SKIP:
            self.skip += 1
            return
        if self.skip:
            return
        if tag in BLOCK:
            self.out.append("\n")
        elif tag in ("span", "small", "b", "strong"):
            self.out.append(" ")
        if tag in ("h1", "h2", "h3", "h4", "h5"):
            self.out.append("### ")
        elif tag == "li":
            self.out.append("- ")
        elif tag == "footer":
            self.out.append("— ")
        elif tag == "dd":
            self.out.append(": ")
        if tag == "a":
            self.links.append(absolute(a.get("href", "")))

    def handle_endtag(self, tag):
        if tag in SKIP:
            self.skip = max(0, self.skip - 1)
            return
        if self.skip:
            return
        if tag == "a" and self.links:
            url = self.links.pop()
            if url:
                self.out.append(f" ({url})")
        if tag in BLOCK:
            self.out.append("\n")

    def handle_startendtag(self, tag, attrs):
        if tag == "br" and not self.skip:
            self.out.append("\n")

    def handle_data(self, data):
        if not self.skip:
            self.out.append(data)

    def text(self):
        s = "".join(self.out).replace("\u2197", "").replace("\xa0", " ")
        s = re.sub(r"[ \t]+", " ", s)
        s = re.sub(r" *\n *", "\n", s)
        s = re.sub(r"\n- \n+", "\n- ", s)
        s = re.sub(r"\n+:\s*", ": ", s)  # dt / dd on one line
        s = re.sub(r"\n### \n+", "\n### ", s)
        s = re.sub(r"\n{3,}", "\n\n", s)
        return s.strip()


def to_text(fragment):
    p = Text()
    p.feed(fragment)
    p.close()
    return p.text()


def home_text(root):
    page = (root / "index.html").read_text(encoding="utf-8")
    main = page[page.index("<main"):page.index("</main>")]
    # The case cards are generated from _tools/cases; the full case studies are added separately.
    main = re.sub(r"<!-- cases:start.*?<!-- cases:end -->", "", main, flags=re.S)
    return to_text(main)


def case_text(root, c):
    art = (root / "_tools" / "cases" / f"{c['slug']}.html").read_text(encoding="utf-8")
    name = html.unescape(re.search(r"<h3>(.*?)</h3>", art, re.S).group(1))
    url = f"{SITE}/work/{c['slug']}/"
    return f"## Case study: {name} — {url}\nPage title: {c['title']}\nSummary: {c['description']}\n\n{to_text(art)}"


def build_knowledge(root: Path) -> str:
    root = Path(root)
    parts = [
        "# Rick Hollandsworth — portfolio site content (rickhollandsworth.com)",
        "Everything below is published on Rick's site. Text written in the first person (\"I\", \"my\") is Rick speaking on his own site.",
        "## Home page — " + SITE + "/\n\n" + home_text(root),
    ]
    parts += [case_text(root, c) for c in CASES]
    pdfs = "\n".join(f"- {SITE}/{p}" for p in PDFS)
    parts.append("## Downloadable PDFs\n" + pdfs + "\n- " + SITE + "/finfront/ (short link to the FinFront overview PDF)\n- " + SITE + "/ai/ (short link to the FinFront AI Assistant case study PDF)")
    parts.append("## Résumé\n" + (root / "_tools" / "resume.txt").read_text(encoding="utf-8").strip())
    about = (root / "_tools" / "about-rick.md").read_text(encoding="utf-8")
    about = re.sub(r"^# .*?\n\n.*?\n\n", "", about, count=1, flags=re.S)  # drop the title and editor note
    parts.append("## Additional background (approved by Rick)\n\n" + about.strip())
    k = "\n\n".join(parts) + "\n"
    for bad in FORBIDDEN:
        if bad in k.lower():
            raise SystemExit(f"knowledge contains a forbidden string: {bad!r}")
    return k


def pages(root: Path) -> dict:
    out = {"home": {"title": "Home — Rick Hollandsworth, Principal / Staff Product Designer", "url": f"{SITE}/"}}
    for c in CASES:
        out[c["slug"]] = {"title": c["title"], "url": f"{SITE}/work/{c['slug']}/"}
    return out


def write_knowledge(root: Path, out: Path | None = None) -> Path:
    root = Path(root)
    out = out or root / "_worker" / "src" / "knowledge.js"
    out.parent.mkdir(parents=True, exist_ok=True)
    js = ("export const KNOWLEDGE = " + json.dumps(build_knowledge(root), ensure_ascii=False) + ";\n"
          "export const PAGES = " + json.dumps(pages(root), ensure_ascii=False) + ";\n")
    out.write_text(js, encoding="utf-8")
    return out


if __name__ == "__main__":
    print(write_knowledge(Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent))
