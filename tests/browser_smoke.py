import importlib.util
import json
import os
import sys
import tempfile
import threading
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
PUBLICATIONS = json.loads((ROOT / "data/publications.json").read_text(encoding="utf-8"))
NEWS = json.loads((ROOT / "data/news.json").read_text(encoding="utf-8"))
spec = importlib.util.spec_from_file_location("site_server", ROOT / "tools/serve.py")
site_server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(site_server)


class QuietHandler(site_server.SiteHandler):
    def log_message(self, *args):
        pass


def browser_path():
    override = os.environ.get("BROWSER_PATH")
    if override:
        return override
    for path in (
        Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
        Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
    ):
        if path.exists():
            return str(path)
    return None


def assert_layout(page, width, label):
    page.set_viewport_size({"width": width, "height": 900})
    dimensions = page.evaluate("({width:innerWidth, scroll:document.documentElement.scrollWidth})")
    assert dimensions["scroll"] <= width, (label, dimensions)


def main():
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_port}"
    screenshots = Path(tempfile.mkdtemp(prefix="taochang-homepage-preview-"))
    try:
        with sync_playwright() as p:
            options = {"headless": True}
            executable = browser_path()
            if executable:
                options["executable_path"] = executable
            browser = p.chromium.launch(**options)
            context = browser.new_context(viewport={"width": 1440, "height": 1000}, reduced_motion="reduce")
            page = context.new_page()
            errors, failures, requests = [], [], []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.on("requestfailed", lambda request: failures.append(request.url))
            page.on("request", lambda request: requests.append(request.url))

            for filename in ("index.html", "publications.html", "news.html", "index.zh.html", "publications.zh.html", "news.zh.html"):
                response = page.goto(f"{base}/{filename}", wait_until="load")
                assert response.status == 200
                page.evaluate("() => document.fonts.ready")
                assert "Taochang Liu" in page.title()
                assert page.locator(".empty-state").count() == 0
                for image in page.locator("img").all():
                    image.scroll_into_view_if_needed()
                page.wait_for_function("() => [...document.images].every(i=>i.complete && i.naturalWidth>0)")
                for width in (1920, 1440, 1280, 1024, 900, 768, 700, 390, 375, 360, 320):
                    assert_layout(page, width, filename)
                    for card in page.locator(".paper-card").all():
                        sizes = card.evaluate("""card => ['.paper-meta', '.paper-title', '.paper-authors']
                            .map(selector => getComputedStyle(card.querySelector(selector)).fontSize)""")
                        assert sizes == ["16px", "16px", "16px"], (filename, width, sizes)
                        assert card.locator(".paper-badges,.paper-badge,.accepted-date").count() == 0
                        assert "First Author" not in card.inner_text()
                        assert "Accepted 07 Oct 2026" not in card.inner_text()
                    for date in page.locator(".education-date").all():
                        assert date.evaluate("element => getComputedStyle(element).fontSize") == "14px", (filename, width)
                if not filename.startswith("news"):
                    abstract = page.locator(".paper-abstract").first
                    assert not abstract.locator(".abstract-body").is_visible()
                    abstract.locator("summary").click()
                    assert abstract.get_attribute("open") is not None
                    assert abstract.locator(".abstract-body").is_visible()
                    assert "3.41%" in abstract.inner_text()
                    assert_layout(page, 320, "expanded abstract")
                    abstract.locator("summary").click()
                    assert abstract.get_attribute("open") is None
                    assert not abstract.locator(".abstract-body").is_visible()
                    page.locator("[data-cite]").first.click()
                    assert page.locator("#citation-dialog").is_visible()
                    assert "@article{buildflow2026" in page.locator("#citation-text").inner_text()
                    assert "10.1109/TGRS.2026.3748296" in page.locator("#citation-text").inner_text()
                    assert "note = {Accepted}" not in page.locator("#citation-text").inner_text()
                    assert page.locator("#citation-doi").is_visible()
                    assert page.locator("#citation-doi").get_attribute("href") == "https://doi.org/10.1109/TGRS.2026.3748296"
                    page.keyboard.press("Escape")
                    assert not page.locator("#citation-dialog").is_visible()
                    page.locator("[data-cite]").nth(1).click()
                    assert "10.1109/LGRS.2026.3741864" in page.locator("#citation-text").inner_text()
                    assert page.locator("#citation-doi").is_visible()
                    page.keyboard.press("Escape")
                print(f"PASS page, images, and eleven viewport widths: {filename}", flush=True)

            page.goto(f"{base}/index.html", wait_until="load")
            assert not any("/data/" in url for url in requests)
            assert all(url.startswith(base) for url in requests), requests
            assert page.locator("#honors,a[href='#honors']").count() == 0
            assert page.locator("#news .update-row").count() == 2
            assert page.locator("#news time[datetime='2026-10-31']").count() == 0
            assert page.locator("#news time[datetime='2026-10-26']").count() == 1
            assert page.locator("#news time[datetime='2026-10-07']").count() == 1
            assert page.locator(".paper-card time").count() == 0
            assert "BuildFlow, has been accepted by IEEE Transactions on Geoscience and Remote Sensing" in page.locator("#news .update-row").first.inner_text()
            assert "Early Access" not in page.locator("main").inner_text()
            assert page.locator("#news .update-row").first.locator(".update-links a").inner_text() == "IEEE Xplore"
            assert page.locator("#news .update-row").first.locator(".update-links a").get_attribute("href") == "https://ieeexplore.ieee.org/document/11758603"
            assert page.locator("main h2").evaluate_all("""headings => headings.map(heading => {
                const label = heading.cloneNode(true);
                label.querySelectorAll('[aria-hidden="true"]').forEach(icon=>icon.remove());
                return label.textContent.trim();
            })""") == [
                "News", "Selected Publications", "Research Interests", "Education", "Contact"
            ]
            assert page.locator("main section").evaluate_all("sections=>sections.map(section=>section.id)") == [
                "about", "news", "publications", "research", "education", "contact"
            ]
            assert "advised by Prof. Xinchang Zhang and Dr. Ji Qi" in page.locator(".hero-bio").inner_text()
            assert page.locator(".social-link").count() == 3
            assert page.locator(".contact-details dt").all_text_contents() == ["Email", "Profiles"]
            assert "Office" not in page.locator("#contact").inner_text()
            assert_layout(page, 1440, "desktop proportions")
            geometry = page.evaluate("""() => {
                const rect = selector => document.querySelector(selector).getBoundingClientRect();
                const avatar = rect('.avatar-frame img');
                return {
                    nameSize: parseFloat(getComputedStyle(document.querySelector('.hero h1')).fontSize),
                    heroHeight: rect('.hero').height,
                    profileWidth: rect('.hero-field').width,
                    researchHeight: rect('.research-item').height,
                    educationWidths: [...document.querySelectorAll('.education-item')].map(i=>i.getBoundingClientRect().width),
                    avatarRatio: avatar.width / avatar.height
                };
            }""")
            assert geometry["nameSize"] <= 75, geometry
            assert geometry["heroHeight"] < 520, geometry
            assert geometry["profileWidth"] <= 250, geometry
            assert geometry["researchHeight"] < 180, geometry
            assert abs(geometry["educationWidths"][0] - geometry["educationWidths"][1]) < 1, geometry
            assert abs(geometry["avatarRatio"] - 1) < 0.01, geometry
            grids = page.evaluate("""() => Object.fromEntries(['.hero','.research-grid','.paper-layout','.education-list','.contact-layout']
                .map(selector=>[selector, getComputedStyle(document.querySelector(selector)).gridTemplateColumns.split(' ').map(parseFloat)]))""")
            assert len(grids['.hero']) == 2 and abs(grids['.hero'][1] - 248) < 1, grids
            assert len(grids['.research-grid']) == 2, grids
            assert page.locator(".research-item h3").all_text_contents() == ["Generative Modeling", "Remote Sensing"]
            assert len(grids['.education-list']) == 2, grids
            assert len(grids['.contact-layout']) == 2, grids
            assert abs(grids['.paper-layout'][0] / sum(grids['.paper-layout']) - 0.35) < 0.01, grids
            assert page.locator(".file-chrome,.file-dots,.contact-file").count() == 0
            assert page.locator(".paper-summary,.paper-journal").count() == 0
            assert page.locator(".paper-card").first.locator(".paper-actions a").all_text_contents() == ["Paper", "Code"]
            assert page.locator(".paper-card").first.locator(".paper-title a").get_attribute("href") == "https://ieeexplore.ieee.org/document/11758603"
            assert page.locator(".paper-card").first.locator(".paper-actions a").first.get_attribute("href") == "https://ieeexplore.ieee.org/document/11758603"
            assert page.locator(".paper-card").nth(1).locator(".paper-actions a").all_text_contents() == ["Paper", "Code"]
            assert "IEEE Geoscience and Remote Sensing Letters" not in page.locator(".paper-card").first.inner_text()
            assert page.locator(".paper-card").first.locator(".paper-actions > .paper-abstract > summary.paper-link").is_visible()
            assert page.locator(".heading-emoji").all_text_contents() == ["\U0001f525", "\U0001f393", "\U0001f4ec"]
            assert page.locator("#news .title-icon svg,#education .title-icon svg,#contact h2 svg").count() == 0
            assert page.locator(".education-logo").count() == 2
            for width in (1440, 900, 390, 320):
                assert_layout(page, width, "school crests and names")
                for emoji in page.locator(".heading-emoji").all():
                    assert emoji.evaluate("element => element.clientWidth >= parseFloat(getComputedStyle(element).fontSize)")
                for school in page.locator(".education-item").all():
                    logo, name = school.locator(".education-logo"), school.locator("h3")
                    logo.scroll_into_view_if_needed()
                    assert logo.evaluate("image => image.complete && image.naturalWidth > 0")
                    logo_box, name_box = logo.bounding_box(), name.bounding_box()
                    assert logo_box["x"] + logo_box["width"] < name_box["x"], (logo_box, name_box)
                    assert abs(logo_box["y"] + logo_box["height"] / 2 - name_box["y"] - name_box["height"] / 2) < 1
            assert_layout(page, 1440, "inline abstract row")
            summary = page.locator(".paper-card").first.locator(".paper-abstract summary")
            summary.scroll_into_view_if_needed()
            buttons = page.locator(".paper-card").first.locator(".paper-actions > .paper-link,.paper-abstract > summary")
            assert buttons.all_text_contents() == ["Paper", "Code", "Abstract", "Cite"]
            before = [item.bounding_box() for item in buttons.all()]
            assert max(box["y"] for box in before) - min(box["y"] for box in before) < 1
            summary.focus()
            page.keyboard.press("Enter")
            assert page.locator(".paper-card").first.locator(".abstract-body").is_visible()
            after = [item.bounding_box() for item in buttons.all()]
            assert all(abs(a["y"] - b["y"]) < 1 for a, b in zip(before, after)), (before, after)
            content_box = page.locator(".paper-card").first.locator(".abstract-body").bounding_box()
            assert content_box["y"] >= max(box["y"] + box["height"] for box in after)
            assert abs(content_box["width"] - page.locator(".paper-card").first.locator(".paper-content").bounding_box()["width"]) < 1
            page.keyboard.press("Space")
            assert not page.locator(".paper-card").first.locator(".abstract-body").is_visible()
            print("PASS compact publication actions, keyboard abstract, exact heading emoji, and local school crests", flush=True)
            for label in ("Email", "GitHub", "ORCID"):
                assert page.locator(".social-link", has_text=label).is_visible()
            for icon in page.locator(".title-icon").all():
                assert icon.evaluate("e=>getComputedStyle(e).backgroundColor") == "rgba(0, 0, 0, 0)"
                assert icon.evaluate("e=>parseFloat(getComputedStyle(e).borderTopWidth)") == 0
            for name in ("lightbulb", "news", "graduate", "envelope", "calendar", "paper", "copy"):
                symbol = page.locator(f"#icon-{name}")
                assert symbol.get_attribute("viewBox").startswith("0 0 ")
                assert symbol.get_attribute("stroke") == "none"
                assert symbol.get_attribute("fill") == "currentColor"
            theme = page.evaluate("""() => {
                const style = selector => getComputedStyle(document.querySelector(selector));
                return {background:style('body').backgroundColor, bodyFont:style('body').fontFamily,
                    headingFont:style('.hero h1').fontFamily, headingColor:style('.hero h1').color,
                    iconColor:style('#research .title-icon').color, newsFont:style('.update-content p').fontFamily,
                    paperFont:style('.paper-title').fontFamily,
                    backdropVisible:style('.profile-backdrop').display !== 'none'};
            }""")
            assert theme['background'] == 'rgb(254, 255, 254)', theme
            assert theme['headingColor'] == 'rgb(30, 41, 59)', theme
            assert theme['iconColor'] == 'rgb(212, 165, 98)', theme
            assert 'Inter' in theme['bodyFont'] and 'Crimson Text' in theme['headingFont'], theme
            assert 'Kalam' in theme['newsFont'] and 'IBM Plex Mono' in theme['paperFont'], theme
            assert not theme['backdropVisible'], theme
            print("PASS approved layout retained with the old homepage palette, fonts, emoji, and Font Awesome icons", flush=True)
            assert_layout(page, 390, "menu")
            toggle = page.locator(".menu-toggle")
            toggle.click()
            assert toggle.get_attribute("aria-expanded") == "true"
            assert page.locator("#site-nav").is_visible()
            page.keyboard.press("Escape")
            assert toggle.get_attribute("aria-expanded") == "false"
            toggle.click()
            page.locator("#site-nav a[href='#publications']").click()
            assert page.evaluate("location.hash") == "#publications"
            assert toggle.get_attribute("aria-expanded") == "false"
            assert not page.locator("#site-nav").is_visible()
            toggle.click()
            assert_layout(page, 1440, "menu reset")
            assert toggle.get_attribute("aria-expanded") == "false"
            assert_layout(page, 390, "menu after resize")
            assert not page.locator("#site-nav").is_visible()
            print("PASS mobile navigation, Escape, resize, and hidden awards", flush=True)

            page.evaluate("""() => {
                window.__copied = null;
                Object.defineProperty(navigator, 'clipboard', {configurable:true, value:{writeText:async text=>{window.__copied=text}}});
            }""")
            page.locator(".copy-email").click()
            page.wait_for_function("window.__copied === 'liutc@e.gzhu.edu.cn'")
            assert page.locator("#toast").inner_text() == "Email copied to clipboard."
            page.locator("[data-cite]").first.click()
            page.locator("#copy-citation").click()
            page.wait_for_function("window.__copied.includes('@article{buildflow2026')")
            assert page.locator("#citation-dialog #toast").is_visible()
            page.locator("#citation-dialog button[aria-label='Close citation dialog']").click()
            print("PASS clipboard actions without altering the system clipboard", flush=True)

            page.goto(f"{base}/index.html", wait_until="load")
            assert_layout(page, 1440, "screenshot desktop")
            page.locator(".figure-link").first.scroll_into_view_if_needed()
            page.wait_for_function("() => [...document.images].every(i=>i.complete && i.naturalWidth>0)")
            page.evaluate("async () => { await Promise.all([...document.images].map(i=>i.decode())); }")
            page.wait_for_timeout(200)
            page.evaluate("window.scrollTo(0,0)")
            page.screenshot(path=str(screenshots / "desktop.png"), full_page=True)
            assert_layout(page, 390, "screenshot mobile")
            page.screenshot(path=str(screenshots / "mobile.png"), full_page=True)

            for source, target in (("index.html", "index.zh.html"), ("publications.html", "publications.zh.html"), ("news.html", "news.zh.html")):
                page.goto(f"{base}/{source}", wait_until="load")
                page.locator(".language-switch").click()
                page.wait_for_url(f"**/{target}")
                assert page.locator("html").get_attribute("lang") == "zh-CN"
                assert page.locator(".language-switch").inner_text() == "EN"
                page.locator(".language-switch").click()
                page.wait_for_url(f"**/{source}")
                assert page.locator("html").get_attribute("lang") == "en"

            page.goto(f"{base}/index.html#publications", wait_until="load")
            page.locator(".language-switch").click()
            page.wait_for_url("**/index.zh.html#publications")
            assert " ".join(page.locator(".hero-role").text_content().split()) == "硕士研究生 · 广州大学"
            assert "Xinchang Zhang 教授和Ji Qi 博士" in page.locator(".hero-bio").inner_text()
            assert page.locator("main section").evaluate_all("sections=>sections.map(section=>section.id)") == [
                "about", "news", "publications", "research", "education", "contact"
            ]
            assert page.locator(".education-item h3").all_text_contents() == ["广州大学", "东北农业大学"]
            assert page.locator(".paper-card").first.locator(".paper-actions a").all_text_contents() == ["论文", "代码"]
            assert page.locator(".paper-card").nth(1).locator(".paper-actions a").all_text_contents() == ["论文", "代码"]
            assert page.locator(".paper-abstract summary").first.inner_text() == "摘要"
            assert page.locator("[data-cite]").first.inner_text() == "引用"
            assert "2024" in page.locator(".education-date").first.inner_text()
            assert "至今" in page.locator(".education-date").first.inner_text()
            news_text = "\n".join(page.locator(".update-content").all_inner_texts())
            assert "Early Access" not in news_text
            assert "我们的论文 BuildFlow 已被" in news_text
            assert "我们的论文 RegularFlow 已被" in news_text
            assert "10月26日" in page.locator("#news time").first.inner_text()
            assert page.locator(".research-item h3").all_text_contents() == ["生成式建模", "遥感影像分析"]
            assert "Office" not in page.locator("#contact").inner_text()
            page.locator(".paper-abstract summary").first.click()
            assert "确定性条件流匹配框架" in page.locator(".abstract-body").first.inner_text()
            page.locator(".paper-abstract summary").first.click()
            page.locator("#news .section-heading .text-link").click()
            page.wait_for_url("**/news.zh.html")
            page.locator(".archive-nav a").click()
            page.wait_for_url("**/index.zh.html#news")
            page.locator("#publications .section-heading .text-link").click()
            page.wait_for_url("**/publications.zh.html")
            page.locator(".archive-nav a").click()
            page.wait_for_url("**/index.zh.html#publications")

            assert_layout(page, 390, "Chinese navigation")
            assert page.locator(".language-switch").is_visible()
            page.locator(".menu-toggle").click()
            assert page.locator(".menu-toggle").get_attribute("aria-label") == "收起导航"
            page.locator("#site-nav a[href='#research']").click()
            assert page.locator(".menu-toggle").get_attribute("aria-label") == "展开导航"
            assert page.evaluate("location.hash") == "#research"
            page.evaluate("""() => {
                window.__copied = null;
                Object.defineProperty(navigator, 'clipboard', {configurable:true, value:{writeText:async text=>{window.__copied=text}}});
            }""")
            page.locator(".copy-email").click()
            page.wait_for_function("window.__copied === 'liutc@e.gzhu.edu.cn'")
            assert page.locator("#toast").inner_text() == "邮箱地址已复制。"
            page.locator("[data-cite]").first.click()
            assert page.locator("#citation-title").inner_text() == "引用"
            assert "@article{buildflow2026" in page.locator("#citation-text").inner_text()
            page.locator("#copy-citation").click()
            page.wait_for_function("window.__copied.includes('@article{buildflow2026')")
            assert page.locator("#citation-dialog #toast").inner_text() == "BibTeX 已复制。"
            page.locator("#citation-dialog button[aria-label='关闭引用窗口']").click()
            print("PASS bilingual switches, preserved anchors, translated biography, menu, archives, abstract, and clipboard", flush=True)

            page.goto(f"{base}/index.zh.html", wait_until="load")
            for image in page.locator("img").all():
                image.scroll_into_view_if_needed()
            page.wait_for_function("() => [...document.images].every(i=>i.complete && i.naturalWidth>0)")
            page.evaluate("async () => { await document.fonts.ready; await Promise.all([...document.images].map(i=>i.decode())); }")
            assert_layout(page, 1440, "Chinese screenshot desktop")
            page.evaluate("window.scrollTo(0,0)")
            page.screenshot(path=str(screenshots / "desktop-zh.png"), full_page=True)
            assert_layout(page, 390, "Chinese screenshot mobile")
            page.screenshot(path=str(screenshots / "mobile-zh.png"), full_page=True)
            assert all(url.startswith(base) for url in requests), requests
            assert not any("/data/" in url for url in requests)

            for old, new in (("all-publications.html", "publications.html"), ("all-news.html", "news.html"), ("all-honors.html", "index.html")):
                page.goto(f"{base}/pages/{old}", wait_until="load")
                page.wait_for_url(f"{base}/{new}")
            print("PASS legacy archive redirects", flush=True)

            page.goto((ROOT / "index.html").as_uri(), wait_until="load")
            assert page.locator(".update-row").count() == len(NEWS)
            assert page.locator(".paper-card").count() == len(PUBLICATIONS)
            for image in page.locator("img").all():
                image.scroll_into_view_if_needed()
            page.wait_for_function("() => [...document.images].every(i=>i.complete && i.naturalWidth>0)")
            page.locator(".paper-abstract summary").first.click()
            assert page.locator(".abstract-body").first.is_visible()
            page.locator(".paper-abstract summary").first.click()
            page.locator("[data-cite]").first.click()
            assert page.locator("#citation-dialog").is_visible()
            page.keyboard.press("Escape")
            assert_layout(page, 320, "file preview")
            page.locator(".language-switch").click()
            page.wait_for_url("**/index.zh.html")
            assert page.locator("html").get_attribute("lang") == "zh-CN"
            page.locator(".paper-abstract summary").first.click()
            assert "确定性条件流匹配框架" in page.locator(".abstract-body").first.inner_text()
            page.locator("[data-cite]").first.click()
            assert page.locator("#citation-title").inner_text() == "引用"
            page.keyboard.press("Escape")
            page.locator("#publications .section-heading .text-link").click()
            page.wait_for_url("**/publications.zh.html")
            page.locator(".language-switch").click()
            page.wait_for_url("**/publications.html")
            assert_layout(page, 320, "bilingual file archive")
            print("PASS bilingual file:// preview with local news, school crests, abstracts, archives, and citations", flush=True)

            nojs = browser.new_context(java_script_enabled=False, viewport={"width": 390, "height": 844})
            static = nojs.new_page()
            static.goto(f"{base}/index.html", wait_until="load")
            assert static.locator(".update-row").count() == len(NEWS)
            assert static.locator(".paper-card").count() == len(PUBLICATIONS)
            assert static.locator("#publications").is_visible()
            assert static.locator("#site-nav").is_visible()
            assert not static.locator(".menu-toggle").is_visible()
            assert static.locator(".abstract-body:visible").count() == 0
            static.locator(".paper-abstract summary").first.click()
            assert static.locator(".abstract-body").first.is_visible()
            static.locator(".paper-abstract summary").first.click()
            assert not static.locator(".abstract-body").first.is_visible()
            assert static.locator("[data-cite]:visible").count() == 0
            assert_layout(static, 320, "English no-JS navigation")
            static.locator(".language-switch").click()
            static.wait_for_url("**/index.zh.html")
            assert static.locator("html").get_attribute("lang") == "zh-CN"
            assert "生成式建模" in static.locator("#research").inner_text()
            static.locator(".paper-abstract summary").first.click()
            assert "确定性条件流匹配框架" in static.locator(".abstract-body").first.inner_text()
            assert_layout(static, 320, "Chinese no-JS navigation")
            static.locator("#publications .section-heading .text-link").click()
            static.wait_for_url("**/publications.zh.html")
            static.locator(".language-switch").click()
            static.wait_for_url("**/publications.html")
            nojs.close()
            print("PASS JavaScript-disabled bilingual switching, archives, content, and native abstract", flush=True)

            motion = browser.new_context(viewport={"width": 1440, "height": 900}, reduced_motion="no-preference")
            animated = motion.new_page()
            animated.goto(f"{base}/index.html", wait_until="load")
            for section in ("news", "publications", "research", "education", "contact"):
                animated.locator(f"#{section}").scroll_into_view_if_needed()
                animated.wait_for_function("""id => [...document.querySelectorAll(`#${id} [data-reveal]`)]
                    .every(element => element.classList.contains('is-visible'))""", arg=section)
            motion.close()
            print("PASS normal-motion section reveals", flush=True)

            assert not errors, errors
            assert not failures, failures
            print("ALL BROWSER CHECKS PASSED", flush=True)
            print(f"Screenshots: {screenshots}", flush=True)
            browser.close()
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    main()
