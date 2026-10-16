# Taochang Liu - Academic Homepage

An independently designed bilingual static academic homepage for Taochang Liu.
The approved redesign replaces the old template in the GitHub Pages repository.
The previous local site and its Git history are backed up outside the repository.

- Website: <https://qwerasdzxhjk.github.io/>
- Chinese version: <https://qwerasdzxhjk.github.io/index.zh.html>
- Repository: <https://github.com/qwerasdzxhjk/qwerasdzxhjk.github.io>

## Preview

The generated `index.html` can be opened directly in a browser. Profile, news,
publications, and local fonts do not need a network request to an external service.
No runtime JSON fetch is used, so opening the site with `file://` works too.
Use the header's language link to switch between English (`index.html`) and
Simplified Chinese (`index.zh.html`). Both publication/news archives have matching
language versions, and internal archive/back links stay in the current language.
The switch is visible outside the mobile menu and works without JavaScript;
with JavaScript enabled, it also preserves the current section anchor.

For local development, run from this folder:

```powershell
node tools/build.mjs
python tools/serve.py --port 8001
```

Then visit `http://127.0.0.1:8001/`. Keep the terminal running; press Ctrl+C to stop.
Alternatively, run `powershell -ExecutionPolicy Bypass -File .\preview.ps1`.

## Visual Direction

The approved new layout is retained, while the visual theme follows the owner's
old academic homepage in the separate original directory:

- White (`#fefffe`) and cool light-gray surfaces, dark slate headings (`#1e293b`),
  muted slate text (`#64748b`), and warm gold accents (`#d4a562`).
- Crimson Text headings, Inter interface/body text, Times New Roman biography,
  Kalam news, and IBM Plex Mono publication headings/actions, matching the old site.
- News, Education, and Contact restore the old site's exact colorful emoji.
  Font Awesome Free 6.4.0 supplies the familiar lightbulb, star, mail, location,
  social marks, and publication action icons. Social links retain visible labels
  and the old rounded-outline button treatment.
- Publications use the old site's pale cyan accents (`#61b4bd`, `#367d85`), thin
  rules, white cards, and small-radius resource buttons.
- The avatar keeps the old rounded photo frame; the earlier green terrain backdrop
  is hidden. Its original asset remains available but is not part of the active theme.
- Section order: About Me, News, Selected Publications, Research Interests,
  Education, and Contact, with navigation in the same order.
- Lightweight research lists, dated news, compact figure-led publication cards,
  education entries with authentic school crests, and a plain contact details list.
- The approved hero/profile arrangement, three research columns, image/text paper
  ratio, two-column education/contact layout, and responsive breakpoints stay
  intact. Research Interests follows Publications. Typography may naturally
  change line wrapping.
- Complete publication titles, a shared heading/spacing scale, and no fake terminal
  window controls keep the layout proportional to its content.
- A responsive layout, keyboard-accessible navigation and dialogs, reduced-motion
  support, and print styling.
- No template branding, invented awards, CV links, or unsupported social profiles.

## Edit Content

| File | Contents |
| --- | --- |
| `data/profile.json` | Name, affiliation, advisors, contact, research, education, Chinese content overrides |
| `data/publications.json` | Papers, full authors, images, abstracts, links, source metadata |
| `data/news.json` | Research updates with ISO dates |
| `data/i18n.json` | English/Chinese interface labels, biography wording, and interaction messages |
| `src/index.template.html` | Homepage structure |
| `src/archive.template.html` | Publication and news archive structure |
| `styles.css` | Design tokens and responsive styling |
| `script.js` | Navigation, motion, citations, clipboard |

After updating data or templates, run `node tools/build.mjs`. The generated files
are `index.html`, `publications.html`, `news.html`, and the corresponding
`index.zh.html`, `publications.zh.html`, `news.zh.html` Chinese pages. The build also
generates redirects for the old `pages/all-*.html` archive URLs. Do not edit
generated HTML if you want changes to survive the next build. No npm packages are
needed.

The `advisors` list contains Prof. Xinchang Zhang and Dr. Ji Qi. Only the provided
Xinchang Zhang website is linked; no unverified URL or Chinese personal-name
characters are invented. Chinese content uses `translations.zh` overrides on
profile, research, education, news, and publication objects. The paper's formal
English title, author order, and BibTeX remain unchanged in both languages; the
Chinese abstract is a translation for the homepage. Chinese text uses installed
Chinese serif/sans fonts, without downloading an external font or translation
service. Update both language entries when changing translated content.

The RegularFlow acceptance date is **2026-10-07**, confirmed by the site owner.
The separate IEEE online publication date, **2026-10-12**, remains in source data.
The displayed update announces acceptance and does not say online or Early Access.
Publication cards omit the First Author badge and acceptance-date label. Author
names and journal/year metadata use the same 16px size as the paper title on desktop
and mobile; the owner's name remains bold. Education date ranges use a more
readable 14px size with medium weight. The acceptance date remains in the source
metadata and News.
Paper, Code, Abstract, and Cite share the same action row. Abstract uses a native
disclosure styled as a button, so it also works without JavaScript. The repeated
journal full name, short summary, and DOI resource button are not displayed; DOI
metadata remains available in the title link and BibTeX citation.

## Checks

```powershell
node --check script.js
node --test tests/site.test.mjs
python tests/browser_smoke.py
```

Browser checks require Python Playwright and an installed Chrome or Edge browser.
They cover HTTP and file previews, local assets and school crests, mobile layouts,
inline abstract actions, bilingual navigation and language switches, citations,
localized clipboard messages, archives, reduced motion, and JavaScript-disabled
content. All six pages are checked at eleven viewport widths from 320 to 1920px.
Theme checks verify the original site's colors/fonts/icons and the approved new
grid arrangements and publication figure/text ratio.

## Publishing

GitHub Pages serves the repository root on the `main` branch. Run the build and
checks before committing content or design changes, then push the commit to
`origin/main`. Include the generated HTML, CSS, JS, `.nojekyll`, local `assets/`,
and the editable data/templates/tools in the commit. No npm install or server-side
runtime is required. `.nojekyll` keeps publication and font assets available as
ordinary static files. Preview/build tools never commit or push automatically.
Paths are relative, so the site also works under a project subdirectory.

Old publication/news URLs redirect to their new archives; the old honors URL
returns to the homepage because that section is hidden. Earlier commits remain
available in Git history for rollback.

## References And Assets

The layout implementation is new; no source code from these templates is incorporated:

- [WowPage](https://github.com/WD7ang/WowPage): academic information hierarchy.
- [w-r-s/academic-homepage-template](https://github.com/w-r-s/academic-homepage-template): direct, concise academic content.
- [luost26/academic-homepage](https://github.com/luost26/academic-homepage): modular sections and responsive organization.
- [TermHub](https://github.com/H-Freax/TermHub): compact information hierarchy and content-first maintenance, not its terminal appearance.

The layout follows a content-first academic direction: familiar section names, a
short profile, visual paper explanations, and small supporting sections. The latest
theme reuses the owner's established visual language, not another template's layout
or runtime code. The previous version is preserved in an external backup and in
the repository's existing Git history.

The portrait in `assets/Taochang.jpg` is the owner's supplied photo, copied without
modifying the original image. The existing square frame uses top-aligned cropping
to keep the head visible. The earlier profile artwork remains as an unused asset.
The RegularFlow figure
comes from [the official paper repository](https://github.com/qwerasdzxhjk/RegularFlow/blob/main/resource/222.png).
The full abstract, author order, DOI, and journal metadata are verified against
[IEEE Xplore](https://ieeexplore.ieee.org/document/11733487).
The ORCID link comes from the IEEE author metadata. The framework figure remains
the original high-resolution file; allow for its size when planning deployment.

Crimson Text, Inter, Kalam, and IBM Plex Mono are self-hosted Google Fonts
distributions under the SIL Open Font License. Their license files are retained in
`assets/fonts/`; the Times New Roman biography uses the locally available system
font with serif fallbacks. The terrain SVG, favicon, and `tl.` wordmark are original
code-native assets. Fonts from earlier iterations remain as unused local assets.

Interface SVGs and brand icons come from
[Font Awesome Free 6.4.0](https://github.com/FortAwesome/Font-Awesome/tree/6.4.0)
by Fonticons, Inc., the icon family used by the original homepage. The SVG icons
are licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
Their original files and license are retained in `assets/icons/`. Active SVG icons
are embedded as symbols in each page; the heading emoji use local OS emoji fonts,
matching the original site's rendering on the same device. Viewing the site requires
no icon CDN or external requests. Earlier Lucide SVG sources remain as unused
assets, with their ISC license retained in `assets/icons/lucide/`.

University crests are unmodified local copies from the schools' official websites,
used solely to identify the education entries. The universities retain their marks:

- Guangzhou University: [official crest page](https://www.gzhu.edu.cn/xxgk/xxxhxg.htm),
  [image source](https://www.gzhu.edu.cn/images/img71.jpg),
  `assets/education/guangzhou-university.jpg`.
- Northeast Agricultural University: [official culture page](https://www.neau.edu.cn/dddd/rwct.htm),
  [image source](https://www.neau.edu.cn/__local/6/0D/18/A62419D2E72E9A70BB9BE230EA8_7BFAFF35_B524.png),
  `assets/education/northeast-agricultural-university.png`.
