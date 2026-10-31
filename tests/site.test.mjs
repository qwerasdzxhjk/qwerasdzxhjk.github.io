import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { root, buildSite, escapeHtml, safeLink, formatDate, bibtex, renderPublication, renderNews } from '../tools/build.mjs';

const read = name => readFile(path.join(root, name), 'utf8');
const pages = ['index.html', 'publications.html', 'news.html', 'index.zh.html', 'publications.zh.html', 'news.zh.html'];
const pageIds = source => [...source.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
await buildSite();
const profile = JSON.parse(await read('data/profile.json'));
const papers = JSON.parse(await read('data/publications.json'));
const news = JSON.parse(await read('data/news.json'));
const translations = JSON.parse(await read('data/i18n.json'));
const buildflowPaper = papers.find(paper => paper.id === 'buildflow2026');
const regularflowPaper = papers.find(paper => paper.id === 'regularflow2026');

test('generated pages have valid anchors, unique IDs, and local resources', async () => {
    for (const file of pages) {
        const html = await read(file);
        assert.match(html, /<title>[^<]*Taochang Liu[^<]*<\/title>/);
        assert.doesNotMatch(html, /\{\{\w+\}\}|Your Name|href="#"|Unable to load|cdn\.tailwind|fonts\.googleapis/);
        const ids = pageIds(html);
        assert.equal(new Set(ids).size, ids.length, `${file}: duplicate IDs`);
        const base = new URL(file, 'https://example.test/notebook/');
        for (const [, value] of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
            const url = new URL(value.replaceAll('&amp;', '&'), base);
            if (url.origin !== base.origin) continue;
            const local = decodeURIComponent(url.pathname.replace('/notebook/', ''));
            await access(path.join(root, local));
            if (url.hash) assert.ok(pageIds(await read(local)).includes(decodeURIComponent(url.hash.slice(1))), `${file}: ${value}`);
        }
    }
});

test('build is deterministic and produces usable pre-rendered content', async () => {
    const before = await Promise.all(pages.map(read));
    await buildSite();
    const after = await Promise.all(pages.map(read));
    assert.deepEqual(after, before);
    assert.match(after[0], /Our paper, RegularFlow, has been accepted by IEEE Geoscience and Remote Sensing Letters/);
    assert.match(after[0], /<article class="paper-card"/);
    assert.match(after[0], /<details class="paper-abstract"/);
    assert.doesNotMatch(await read('script.js'), /\bfetch\(|XMLHttpRequest/);
});

test('legacy archive URLs redirect to the current static pages', async () => {
    for (const [file, target] of Object.entries({ 'pages/all-publications.html': 'publications.html', 'pages/all-news.html': 'news.html', 'pages/all-honors.html': 'index.html' })) {
        const html = await read(file);
        assert.ok(html.includes(`<meta http-equiv="refresh" content="0; url=../${target}">`));
        assert.ok(html.includes('<link rel="icon" type="image/svg+xml" href="../assets/favicon.svg">'));
        assert.ok(html.includes(`<a href="../${target}">`));
        assert.ok(html.includes(`<link rel="canonical" href="../${target}">`));
        await access(path.join(root, target));
        assert.doesNotMatch(html, /<script|fetch\(|<article/);
    }
});

test('real profile, publication status, and acceptance history replace template content', async () => {
    assert.equal(profile.name, 'Taochang Liu');
    assert.equal(profile.email, 'liutc@e.gzhu.edu.cn');
    assert.deepEqual(papers.map(paper => paper.id), ['buildflow2026', 'regularflow2026']);
    assert.equal(buildflowPaper.acceptanceDate, '2026-10-26');
    assert.equal(buildflowPaper.authors.at(-2), 'Yiping Chen');
    assert.equal(buildflowPaper.status, 'Early Access');
    assert.equal(buildflowPaper.doi, '10.1109/TGRS.2026.3748296');
    assert.equal(buildflowPaper.paperUrl, 'https://ieeexplore.ieee.org/document/11758603');
    assert.deepEqual(buildflowPaper.tags, [
        { text: 'Paper', link: buildflowPaper.paperUrl },
        { text: 'Code', link: 'https://github.com/qwerasdzxhjk/BuildFlow' },
    ]);
    assert.equal(regularflowPaper.doi, '10.1109/LGRS.2026.3741864');
    assert.equal(regularflowPaper.acceptanceDate, '2026-10-07');
    assert.equal(regularflowPaper.publicationDate, '2026-10-12');
    assert.equal(news.length, 2);
    assert.equal(news[0].date, '2026-10-26');
    assert.match(news[0].content, /BuildFlow, has been accepted by IEEE Transactions on Geoscience and Remote Sensing/);
    assert.deepEqual(news[0].links, [{ text: 'IEEE Xplore', url: buildflowPaper.paperUrl }]);
    assert.equal(news[1].date, '2026-10-07');
    for (const item of news) assert.doesNotMatch(item.content, /online|early.?access/i);
    const home = await read('index.html');
    assert.doesNotMatch(home, /Honors|Awards|Early Access|2026-10-31|href="#honors"/);
    assert.doesNotMatch(home, /First Author|Accepted <time/);
    assert.match(home, /BuildFlow, has been accepted by IEEE Transactions on Geoscience and Remote Sensing/);
    assert.match(home, /<time class="update-date mono" datetime="2026-10-26">/);
    assert.match(home, /<time class="update-date mono" datetime="2026-10-07">/);
    assert.equal(profile.education.length, 2);
});

test('BuildFlow paper links and citations are synchronized without adding an Early Access announcement', async () => {
    for (const filename of pages) {
        const html = await read(filename);
        const citations = JSON.parse(html.match(/id="citation-data" type="application\/json">(.*?)<\/script>/s)[1]);
        assert.equal(citations.buildflow2026.doi, `https://doi.org/${buildflowPaper.doi}`, filename);
        assert.ok(citations.buildflow2026.bibtex.includes(`doi = {${buildflowPaper.doi}}`), filename);
        assert.ok(citations.buildflow2026.bibtex.includes(`url = {${buildflowPaper.paperUrl}}`), filename);
        assert.doesNotMatch(citations.buildflow2026.bibtex, /note = \{Accepted\}|volume|pages|number =/);
        assert.doesNotMatch(html, /Early Access|2026-10-31/);
        if (!filename.startsWith('publications')) {
            const updates = [...html.matchAll(/<article class="update-row">[\s\S]*?<\/article>/g)].map(([row]) => row);
            assert.equal(updates.length, 2, filename);
            assert.match(updates[0], /datetime="2026-10-26"/);
            assert.match(updates[1], /datetime="2026-10-07"/);
            assert.ok(updates[0].includes(`href="${buildflowPaper.paperUrl}"`), filename);
            assert.match(updates[0], />IEEE Xplore<svg/);
            assert.doesNotMatch(updates[0], /GitHub/);
        }
        if (!filename.startsWith('news')) {
            const card = html.match(/<article class="paper-card"[^>]*aria-labelledby="title-buildflow2026"[\s\S]*?<\/article>/)[0];
            assert.ok(card.includes(`<a href="${buildflowPaper.paperUrl}"`), filename);
            const paperAction = filename.includes('.zh.') ? '论文' : 'Paper';
            assert.ok(card.includes(`href="#icon-paper"/></svg>${paperAction}</a>`), filename);
            assert.doesNotMatch(card, /Accepted|accepted-date|paper-badge/);
        }
    }
});

test('research interests retain only Generative Modeling and Remote Sensing in both languages', async () => {
    assert.deepEqual(profile.research.map(item => item.title), ['Generative Modeling', 'Remote Sensing']);
    for (const file of ['index.html', 'index.zh.html']) {
        const html = await read(file);
        const research = html.match(/<section id="research"[\s\S]*?<\/section>/)[0];
        assert.equal((research.match(/class="research-item"/g) || []).length, 2);
        assert.doesNotMatch(research, /Multimodal Learning|多模态学习/);
        for (const label of file.includes('.zh.') ? ['生成式建模', '遥感影像分析'] : ['Generative Modeling', 'Remote Sensing']) {
            assert.ok(research.includes(label), file);
        }
    }
});

test('fonts are local WOFF2 assets with retained licenses', async () => {
    const css = await read('fonts.css');
    assert.doesNotMatch(css, /https?:/);
    for (const [, file] of css.matchAll(/url\(([^)]+)\)/g)) {
        const buffer = await readFile(path.join(root, file));
        assert.equal(buffer.subarray(0, 4).toString(), 'wOF2');
    }
    for (const family of ['crimsontext', 'inter', 'kalam', 'ibmplexmono']) assert.match(await read(`assets/fonts/${family}-OFL.txt`), /SIL OPEN FONT LICENSE/);
    for (const family of ['Crimson Text', 'Inter', 'Kalam', 'IBM Plex Mono']) assert.ok(css.includes(`font-family: '${family}'`));
});

test('familiar academic headings replace slogans on the homepage and archives', async () => {
    const html = await read('index.html');
    const headings = [...html.matchAll(/<h2\b[^>]*>(.*?)<\/h2>/gs)].map(([, heading]) => heading.replace(/<span\b[^>]*aria-hidden="true"[^>]*>.*?<\/span>/gs, '').replace(/<[^>]*>/g, '').trim());
    assert.deepEqual(headings, ['News', 'Selected Publications', 'Research Interests', 'Education', 'Contact', 'Citation']);
    assert.match(html, /About Me/);
    assert.match(html, /Academic Homepage<\/title>/);
    assert.ok(html.indexOf('id="news"') < html.indexOf('id="publications"'));
    assert.ok(html.indexOf('id="publications"') < html.indexOf('id="research"'));
    assert.ok(html.indexOf('id="research"') < html.indexOf('id="education"'));
    for (const page of await Promise.all(pages.map(read))) {
        assert.doesNotMatch(page, /Research Notebook|Research notebook|Generative thinking|Notes along|Ideas, put|A path through|Good research starts|Let's talk|Back to notebook/);
    }
});

test('both languages share the new section order and list both advisors without invented links', async () => {
    assert.deepEqual(profile.advisors.map(advisor => [advisor.title, advisor.name]), [['Prof.', 'Xinchang Zhang'], ['Dr.', 'Ji Qi']]);
    assert.equal(profile.advisors[1].url, undefined);
    const english = await read('index.html');
    assert.match(english, /advised by Prof\. <a[^>]*>Xinchang Zhang<\/a> and Dr\. Ji Qi/);
    const chinese = await read('index.zh.html');
    assert.match(chinese, /导师为<a[^>]*>Xinchang Zhang<\/a> 教授和Ji Qi 博士/);
    for (const html of [english, chinese]) {
        const sections = [...html.matchAll(/<section id="([^"]+)"/g)].map(([, id]) => id);
        assert.deepEqual(sections, ['about', 'news', 'publications', 'research', 'education', 'contact']);
        const nav = html.match(/<nav id="site-nav"[\s\S]*?<\/nav>/)[0];
        assert.deepEqual([...nav.matchAll(/href="#([^"]+)"/g)].map(([, id]) => id), sections);
    }
});

test('six pre-rendered bilingual pages have matching switches, alternate links, and localized content', async () => {
    assert.deepEqual(Object.keys(translations.en.ui).sort(), Object.keys(translations.zh.ui).sort());
    for (const page of ['index', 'publications', 'news']) {
        for (const language of ['en', 'zh']) {
            const suffix = language === 'zh' ? '.zh' : '';
            const otherSuffix = language === 'zh' ? '' : '.zh';
            const html = await read(`${page}${suffix}.html`);
            assert.ok(html.includes(`<html lang="${language === 'zh' ? 'zh-CN' : 'en'}">`));
            assert.ok(html.includes(`class="language-switch" href="${page}${otherSuffix}.html"`));
            assert.ok(html.includes(`<link rel="alternate" hreflang="en" href="${page}.html">`));
            assert.ok(html.includes(`<link rel="alternate" hreflang="zh-CN" href="${page}.zh.html">`));
            const runtime = JSON.parse(html.match(/<script id="ui-data" type="application\/json">(.*?)<\/script>/s)[1]);
            assert.equal(runtime.emailCopied, translations[language].ui.emailCopied);
            if (page !== 'index') assert.ok(html.includes(`href="index${suffix}.html#${page}"`));
            if (language === 'zh') assert.match(html, /学术主页|返回主页/);
        }
    }
    const home = await read('index.zh.html');
    for (const label of ['关于我', '最新动态', '代表论文', '研究方向', '教育经历', '联系方式', '生成式建模', '遥感影像分析', '广州大学', '东北农业大学', '至今']) assert.ok(home.includes(label));
    assert.match(home, /href="news\.zh\.html"/);
    assert.match(home, /href="publications\.zh\.html"/);
    assert.match(home, /我们的论文 RegularFlow 已被 IEEE Geoscience and Remote Sensing Letters 接收/);
    assert.match(home, /10月7日<span>2026年<\/span>/);
    assert.doesNotMatch(home, /Office|B3 806|First Author|Early Access/);
    assert.match(home, /我们的论文 BuildFlow 已被 IEEE Transactions on Geoscience and Remote Sensing 接收/);
    assert.match(home, /10月26日<span>2026年<\/span>/);
    const chineseBuildflow = renderPublication(buildflowPaper, profile.name, 'zh');
    for (const label of ['论文', '代码', '摘要', '引用', '确定性条件流匹配', '3.41%']) assert.ok(chineseBuildflow.includes(label));
    assert.ok(chineseBuildflow.includes(buildflowPaper.title));
    assert.doesNotMatch(chineseBuildflow, /First Author|accepted-date|paper-badge/);
    const chineseRegularflow = renderPublication(regularflowPaper, profile.name, 'zh');
    for (const label of ['论文', '代码', '摘要', '引用', '确定性流匹配', '2.50%']) assert.ok(chineseRegularflow.includes(label));
    assert.ok(chineseRegularflow.includes(regularflowPaper.title));
    const englishCitation = JSON.parse((await read('publications.html')).match(/id="citation-data" type="application\/json">(.*?)<\/script>/s)[1]);
    const chineseCitation = JSON.parse((await read('publications.zh.html')).match(/id="citation-data" type="application\/json">(.*?)<\/script>/s)[1]);
    assert.deepEqual(chineseCitation, englishCitation);
    assert.throws(() => renderNews([], 'unknown'), /Unsupported language/);
});

test('interface SVGs use the old homepage Font Awesome family, locally embedded and licensed', async () => {
    const names = { user: 'user', lightbulb: 'lightbulb', news: 'fire', 'book-open': 'book-open', graduate: 'graduate', envelope: 'envelope', location: 'location', calendar: 'calendar', arrow: 'arrow', external: 'external', south: 'south', north: 'north', west: 'west', paper: 'paper', link: 'link', quote: 'quote', copy: 'copy', expand: 'expand', close: 'close', star: 'star', github: 'github', orcid: 'orcid', 'chevron-right': 'chevron-right' };
    assert.match(await read('assets/icons/LICENSE.txt'), /Icons: CC BY 4\.0 License/);
    for (const html of await Promise.all(pages.map(read))) {
        assert.match(html, /Font Awesome Free 6\.4\.0 by Fonticons/);
        for (const [name, source] of Object.entries(names)) {
            assert.match(await read(`assets/icons/${source}.svg`), /<svg.*viewBox="[^"]+".*<path/s);
            assert.match(html, new RegExp(`<symbol id="icon-${name}" viewBox="[^"]+" fill="currentColor" stroke="none"`));
        }
        assert.doesNotMatch(html, /cdnjs\.cloudflare|all\.min\.css|Lucide/);
    }
});

test('section headings restore the exact old emoji rather than gold SVG substitutes', async () => {
    const html = await read('index.html');
    for (const [label, code] of Object.entries({ News: '128293', Education: '127891', Contact: '128236' })) {
        assert.match(html, new RegExp(`<span class="title-icon heading-emoji" aria-hidden="true">&#${code};<\\/span>${label}`));
    }
    assert.match(await read('news.html'), /heading-emoji" aria-hidden="true">&#128293;<\/span>News/);
    assert.doesNotMatch(html, /<use href="#icon-(?:news|graduate)"/);
    assert.match(html, /<use href="#icon-lightbulb"/);
    assert.equal((html.match(/<use href="#icon-star"/g) || []).length, 2);
});

test('old homepage palette and typography replace the green notebook theme', async () => {
    const css = await read('styles.css');
    for (const [name, color] of Object.entries({ background: '#fefffe', foreground: '#0f172a', primary: '#1e293b', accent: '#d4a562', 'accent-dark': '#b88a4d', muted: '#64748b', 'pub-accent': '#61b4bd', 'pub-accent-dark': '#367d85' })) {
        assert.ok(css.includes(`--${name}: ${color};`));
    }
    assert.doesNotMatch(css, /Newsreader|Manrope|#254f40|#f5f4ed|#183d32|#dceca5/);
    assert.match(css, /--serif: 'Crimson Text'/);
    assert.match(css, /--sans: 'Inter'/);
    assert.match(css, /--hand: 'Kalam'/);
    for (const html of await Promise.all(pages.map(read))) assert.match(html, /<meta name="theme-color" content="#fefffe">/);
});

test('academic layout avoids terminal chrome and decorative research cards', async () => {
    const html = await read('index.html');
    assert.doesNotMatch(html, /file-chrome|file-dots|contact-file|terrain-frame|field-tag/);
    assert.match(html, /<dl class="contact-details"/);
    const contact = html.match(/<dl class="contact-details"[^>]*>([\s\S]*?)<\/dl>/)[1];
    const contactLabels = [...contact.matchAll(/<dt>(.*?)<\/dt>/gs)].map(([, label]) => label.replace(/<[^>]*>/g, ''));
    assert.deepEqual(contactLabels, ['Email', 'Profiles']);
    assert.doesNotMatch(contact, /Office|B3 806/);
    assert.match(html, /<div class="profile-backdrop" aria-hidden="true">/);
    assert.equal((html.match(/class="research-item"/g) || []).length, 2);
    assert.doesNotMatch(html, /class="paper-summary"/);
    for (const text of ['Email', 'GitHub', 'ORCID']) assert.match(html, new RegExp(`class="social-link"[^>]*>[\\s\\S]*?<\\/svg>${text}<\\/a>`));
    const css = await read('styles.css');
    assert.doesNotMatch(css, /file-chrome|file-dots|contact-file|--accent-soft/);
});

test('publication actions, full abstract, and citations are accessible', async () => {
    const html = await read('publications.html');
    assert.match(html, /aria-labelledby="title-buildflow2026"/);
    assert.match(html, /aria-labelledby="title-regularflow2026"/);
    assert.match(html, /aria-haspopup="dialog" aria-controls="citation-dialog"/);
    assert.match(html, /role="status" aria-live="polite"/);
    const embedded = JSON.parse(html.match(/<script id="citation-data" type="application\/json">(.*?)<\/script>/s)[1]);
    assert.match(embedded.buildflow2026.bibtex, /author = \{Taochang Liu and Xinchang Zhang and Ji Qi and Yongjian Ruan and Linrui Xu and Yiping Chen and Haifeng Li\}/);
    assert.match(embedded.buildflow2026.bibtex, /journal = \{IEEE Transactions on Geoscience and Remote Sensing\}/);
    assert.match(embedded.buildflow2026.bibtex, /doi = \{10\.1109\/TGRS\.2026\.3748296\}/);
    assert.match(embedded.buildflow2026.bibtex, /url = \{https:\/\/ieeexplore\.ieee\.org\/document\/11758603\}/);
    assert.doesNotMatch(embedded.buildflow2026.bibtex, /note = \{Accepted\}/);
    assert.equal(embedded.buildflow2026.doi, 'https://doi.org/10.1109/TGRS.2026.3748296');
    assert.match(embedded.regularflow2026.bibtex, /author = \{Taochang Liu and Ji Qi and Yibing Xiong and Hui Gong and Xinchang Zhang and Zihan Jiang\}/);
    assert.match(embedded.regularflow2026.bibtex, /10\.1109\/LGRS\.2026\.3741864/);
    assert.match(embedded.regularflow2026.bibtex, /year = \{2026\}/);
    assert.doesNotMatch(embedded.regularflow2026.bibtex, /volume|pages|number =/);
    assert.match(html, /id="citation-doi"[^>]*hidden/);
});

test('compact publication cards put Abstract alongside resources and omit redundant text and DOI buttons', async () => {
    for (const filename of ['index.html', 'publications.html']) {
        const html = await read(filename);
        const card = id => html.match(new RegExp(`<article class="paper-card"[^>]*aria-labelledby="title-${id}"[\\s\\S]*?<\\/article>`))[0];
        for (const item of [buildflowPaper, regularflowPaper]) {
            const publicationCard = card(item.id);
            assert.doesNotMatch(publicationCard, /paper-journal|paper-summary|paper-badges|paper-badge|accepted-date|First Author|Accepted /);
            assert.doesNotMatch(publicationCard, />DOI<\/a>/);
            assert.match(publicationCard, /<div class="paper-actions">/);
            assert.match(publicationCard, /<details class="paper-abstract"><summary class="paper-link">[\s\S]*?>Abstract<\/summary>/);
            assert.match(publicationCard, /href="#icon-chevron-right"/);
        }
        const buildflowCard = card('buildflow2026');
        assert.match(buildflowCard, /<p class="paper-authors" lang="en"><strong>Taochang Liu<\/strong>, Xinchang Zhang, Ji Qi, Yongjian Ruan, Linrui Xu, Yiping Chen, Haifeng Li<\/p>/);
        assert.match(buildflowCard, /href="https:\/\/ieeexplore\.ieee\.org\/document\/11758603"[^>]*>[\s\S]*?Paper<\/a>/);
        assert.match(buildflowCard, />Paper<\/a>[\s\S]*?>Code<\/a><details class="paper-abstract">/);
        assert.match(buildflowCard, /href="https:\/\/github\.com\/qwerasdzxhjk\/BuildFlow"[^>]*>[\s\S]*?Code<\/a>/);
        assert.doesNotMatch(buildflowCard, /paper-summary|A deterministic conditional flow-matching framework/);
        assert.match(buildflowCard, /3\.41%/);
        const regularflowCard = card('regularflow2026');
        assert.match(regularflowCard, /<p class="paper-authors" lang="en"><strong>Taochang Liu<\/strong>, Ji Qi, Yibing Xiong, Hui Gong, Xinchang Zhang, Zihan Jiang<\/p>/);
        assert.doesNotMatch(regularflowCard, /A deterministic flow-matching approach that combines body and boundary guidance/);
        assert.match(regularflowCard, />Paper<\/a>[\s\S]*?>Code<\/a><details class="paper-abstract">/);
        assert.match(regularflowCard, /2\.50%/);
    }
    const legacy = renderPublication({ ...regularflowPaper, tags: [...regularflowPaper.tags, { text: 'DOI', link: `https://doi.org/${regularflowPaper.doi}` }] }, profile.name);
    assert.doesNotMatch(legacy, />DOI<\/a>/);
});

test('authentic local school crests accompany education names', async () => {
    const html = await read('index.html');
    assert.equal((html.match(/class="education-logo"/g) || []).length, 2);
    assert.doesNotMatch(html, /class="education-icon"/);
    for (const item of profile.education) {
        assert.ok(item.logo.startsWith('assets/education/'));
        assert.ok(html.includes(`src="${item.logo}" alt="${item.university} crest"`));
        assert.ok((await readFile(path.join(root, item.logo))).length > 1000);
    }
});

test('renderer escapes content and rejects unsafe resource links', () => {
    assert.equal(escapeHtml('<script>"&\''), '&lt;script&gt;&quot;&amp;&#39;');
    assert.throws(() => safeLink('javascript:alert(1)'), /Unsupported/);
    assert.throws(() => safeLink('file:///private'), /Unsupported/);
    const malicious = renderPublication({ ...papers[0], title: '<script>alert(1)</script>', authors: ['<img src=x>'], abstract: '</p><script>', summary: '<img onerror="alert(1)">' }, profile.name);
    assert.doesNotMatch(malicious, /<script>|<img src=x>/);
    assert.match(malicious, /&lt;script&gt;/);
    assert.match(malicious, /&lt;\/p&gt;&lt;script&gt;/);
    assert.doesNotMatch(malicious, /onerror|paper-summary/);
});

test('dates are validated and news is ordered newest first', () => {
    assert.equal(formatDate('2026-10-07'), '07 Oct 2026');
    assert.throws(() => formatDate('2026-02-30'), /Invalid date/);
    assert.throws(() => formatDate('10.07'), /Expected an ISO/);
    const html = renderNews([{ date: '2026-01-01', content: 'Older' }, { date: '2026-10-07', content: 'Newer' }]);
    assert.ok(html.indexOf('Newer') < html.indexOf('Older'));
    assert.match(renderNews([]), /No updates to share/);
});

test('publication card remains usable without a figure or abstract', () => {
    const html = renderPublication({ ...regularflowPaper, thumbnail: '', abstract: '' }, profile.name);
    assert.match(html, /paper-card no-figure/);
    assert.doesNotMatch(html, /paper-figure|paper-abstract/);
    assert.match(html, /RegularFlow/);
});

test('BibTeX escapes special characters without modifying author order', () => {
    const citation = bibtex({ ...papers[0], title: 'A & B: 50% improvement', authors: ['First Author', 'Second Author'] });
    assert.ok(citation.includes('A \\& B: 50\\% improvement'));
    assert.ok(citation.includes('First Author and Second Author'));
});

test('raster publication figures are complete and original', async () => {
    for (const paper of papers) {
        const buffer = await readFile(path.join(root, paper.thumbnail));
        assert.equal(buffer.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', paper.id);
        assert.equal(buffer.subarray(-12).toString('hex'), '0000000049454e44ae426082', paper.id);
    }
});
