import { readFile, writeFile, access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const icon = name => `<svg aria-hidden="true"><use href="#icon-${name}"/></svg>`;
const messages = JSON.parse(await readFile(path.join(root, 'data/i18n.json'), 'utf8'));
const languages = ['en', 'zh'];
const localize = (item, language) => ({ ...item, ...item.translations?.[language] });
const pageFile = (page, language) => `${page}${language === 'en' ? '' : '.zh'}.html`;

function locale(language) {
    if (!languages.includes(language)) throw new Error(`Unsupported language: ${language}`);
    return messages[language];
}

// Text is escaped first; only the explicitly supplied, escaped slots can contain markup.
function formatText(text, slots = {}) {
    return escapeHtml(text).replace(/\{(\w+)\}/g, (_, key) => {
        if (!(key in slots)) throw new Error(`Missing text value: ${key}`);
        return slots[key];
    });
}

export function safeLink(value) {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error(`Unsupported link: ${value}`);
    return escapeHtml(url.href);
}

export function formatDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Expected an ISO date: ${value}`);
    const date = new Date(`${value}T12:00:00Z`);
    if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== value) throw new Error(`Invalid date: ${value}`);
    return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
}

export function bibtex(pub) {
    const latex = value => String(value).replace(/[\\{}%&#_$]/g, char => `\\${char}`);
    const lines = [
        `@article{${pub.id},`,
        `  title = {{${latex(pub.title)}}},`,
        `  author = {${pub.authors.map(latex).join(' and ')}},`,
        `  journal = {${latex(pub.venueFull || pub.venue)}},`,
        `  year = {${pub.year}},`,
    ];
    if (pub.doi) lines.push(`  doi = {${latex(pub.doi)}},`);
    if (pub.paperUrl) lines.push(`  url = {${latex(pub.paperUrl)}},`);
    if (pub.acceptanceDate && !['Published', 'Early Access'].includes(pub.status)) lines.push(`  note = {${latex(pub.status)}},`);
    lines.push('}');
    return lines.join('\n');
}

export function renderPublication(source, name, language = 'en') {
    const pub = localize(source, language);
    const { ui } = locale(language);
    const id = escapeHtml(pub.id);
    const titleUrl = pub.paperUrl || (pub.doi ? `https://doi.org/${pub.doi}` : '');
    const title = titleUrl
        ? `<a href="${safeLink(titleUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(pub.title)}</a>`
        : escapeHtml(pub.title);
    const authors = pub.authors.map(author => author === name ? `<strong>${escapeHtml(author)}</strong>` : escapeHtml(author)).join(', ');
    const actions = (pub.tags || []).filter(tag => tag.text.toLowerCase() !== 'doi').map(tag => `<a class="paper-link" href="${safeLink(tag.link)}" target="_blank" rel="noopener noreferrer">${icon(tag.text === 'Code' ? 'github' : 'paper')}${escapeHtml(tag.text === 'Code' ? ui.codeAction : tag.text === 'Paper' ? ui.paperAction : tag.text)}</a>`).join('');
    const figure = pub.thumbnail ? `<figure class="paper-figure"><a class="figure-link" href="${escapeHtml(pub.thumbnail)}" target="_blank" rel="noopener noreferrer" aria-label="${formatText(ui.openFigure, { title: escapeHtml(pub.title) })}"><img src="${escapeHtml(pub.thumbnail)}" alt="${escapeHtml(pub.thumbnailAlt || `Method overview for ${pub.title}`)}" width="${escapeHtml(pub.thumbnailWidth || 13253)}" height="${escapeHtml(pub.thumbnailHeight || 4475)}" loading="lazy" decoding="async"><span class="figure-zoom">${icon('expand')}</span></a><figcaption>${escapeHtml(ui.frameworkCaption)} ${icon('expand')}</figcaption></figure>` : '';
    const abstract = pub.abstract ? `<details class="paper-abstract"><summary class="paper-link">${icon('chevron-right')}${escapeHtml(ui.abstractAction)}</summary><div class="abstract-body"><p>${escapeHtml(pub.abstract)}</p></div></details>` : '';
    return `<article class="paper-card${figure ? '' : ' no-figure'}" aria-labelledby="title-${id}"><div class="paper-layout">${figure}<div class="paper-content"><p class="paper-meta"><span>${escapeHtml(pub.venue)}</span><span>${escapeHtml(pub.year)}</span></p><h3 class="paper-title" id="title-${id}" lang="en">${title}</h3><p class="paper-authors" lang="en">${authors}</p><div class="paper-actions">${actions}${abstract}<button class="paper-link citation-button" type="button" data-cite="${id}" aria-haspopup="dialog" aria-controls="citation-dialog" hidden>${icon('quote')}${escapeHtml(ui.citeAction)}</button></div></div></div></article>`;
}

export function renderNews(items, language = 'en') {
    const { ui } = locale(language);
    if (!items.length) return `<p class="empty-state">${escapeHtml(ui.noNews)}</p>`;
    return [...items].sort((a, b) => b.date.localeCompare(a.date)).map(source => {
        const item = localize(source, language);
        const formatted = formatDate(item.date);
        const date = language === 'zh' ? `${Number(item.date.slice(5, 7))}月${Number(item.date.slice(8))}日<span>${item.date.slice(0, 4)}年</span>` : `${formatted.slice(0, -5)}<span>${formatted.slice(-4)}</span>`;
        const links = (item.links || []).map(link => `<a class="text-link" href="${safeLink(link.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.text)}${icon('external')}</a>`).join('');
        return `<article class="update-row"><div class="update-date-group">${icon('calendar')}<time class="update-date mono" datetime="${escapeHtml(item.date)}">${date}</time></div><div class="update-content"><p>${escapeHtml(item.content)}</p></div><div class="update-links">${links}</div></article>`;
    }).join('\n');
}

function renderResearch(items, language) {
    return items.map(source => {
        const item = localize(source, language);
        return `<article class="research-item"><h3>${icon('star')}${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description)}</p></article>`;
    }).join('\n');
}

function renderEducation(items, language) {
    return items.map(source => {
        const item = localize(source, language);
        return `<article class="education-item"><div class="education-date mono">${escapeHtml(item.start)} <span>&mdash;</span> ${escapeHtml(item.end)}</div><img class="education-logo" src="${escapeHtml(item.logo)}" alt="${escapeHtml(item.university)}${language === 'zh' ? '校徽' : ' crest'}" width="54" height="54" loading="lazy" decoding="async"><h3>${escapeHtml(item.university)}</h3><p>${escapeHtml(item.degree)}${item.note ? ` <span class="education-note">(${escapeHtml(item.note).toLowerCase()})</span>` : ''}</p></article>`;
    }).join('\n');
}

async function icons() {
    const names = {
        user: 'user', lightbulb: 'lightbulb', news: 'fire', 'book-open': 'book-open',
        graduate: 'graduate', envelope: 'envelope', location: 'location', calendar: 'calendar',
        arrow: 'arrow', external: 'external', south: 'south', north: 'north', west: 'west',
        paper: 'paper', link: 'link', quote: 'quote', copy: 'copy', expand: 'expand', close: 'close',
        star: 'star', github: 'github', orcid: 'orcid', 'chevron-right': 'chevron-right',
    };
    // Use the old homepage's Font Awesome family, embedded for offline previews.
    const symbols = await Promise.all(Object.entries(names).map(async ([name, filename]) => {
        const source = await readFile(path.join(root, 'assets/icons', `${filename}.svg`), 'utf8');
        const viewBox = source.match(/viewBox="([^"]+)"/)?.[1];
        const body = source.match(/<svg\b[^>]*>([\s\S]*?)<\/svg>/)?.[1];
        if (!viewBox || !body || /<script|<foreignObject|\bon\w+=|\bhref=/i.test(body)) {
            throw new Error(`Invalid local icon: ${filename}`);
        }
        return `<symbol id="icon-${name}" viewBox="${viewBox}" fill="currentColor" stroke="none">${body.trim()}</symbol>`;
    }));
    return `<!-- Font Awesome Free 6.4.0 by Fonticons, Inc. / CC BY 4.0: https://fontawesome.com/license/free / assets/icons/LICENSE.txt. -->\n<svg class="icon-sprite" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${symbols.join('')}</svg>`;
}

function renderDialog(language) {
    const { ui } = locale(language);
    return `<dialog id="citation-dialog" class="citation-dialog" aria-labelledby="citation-title"><div class="dialog-header"><h2 id="citation-title">${escapeHtml(ui.citationTitle)}</h2><form method="dialog"><button class="icon-button" aria-label="${escapeHtml(ui.closeCitation)}">${icon('close')}</button></form></div><p class="citation-note">${escapeHtml(ui.citationNote)}</p><pre id="citation-text" lang="en"></pre><div class="dialog-actions"><button id="copy-citation" class="button button-primary" type="button">${icon('copy')}${escapeHtml(ui.copyBibtex)}</button><a id="citation-doi" class="text-link" href="https://doi.org/10.1109/LGRS.2026.3741864" target="_blank" rel="noopener noreferrer" hidden>${escapeHtml(ui.viewDoi)} ${icon('external')}</a></div></dialog>`;
}

function fill(template, values) {
    const output = template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
        if (!(key in values)) throw new Error(`Missing template value: ${key}`);
        return values[key];
    });
    if (/\{\{\w+\}\}/.test(output)) throw new Error('Unresolved template tokens');
    return output;
}

export async function buildSite() {
    const readJson = async name => JSON.parse(await readFile(path.join(root, 'data', name), 'utf8'));
    const [profile, publications, news, home, archive, terrain] = await Promise.all([
        readJson('profile.json'), readJson('publications.json'), readJson('news.json'),
        readFile(path.join(root, 'src/index.template.html'), 'utf8'),
        readFile(path.join(root, 'src/archive.template.html'), 'utf8'),
        readFile(path.join(root, 'assets/research-terrain.svg'), 'utf8'),
    ]);
    if (!Array.isArray(publications) || !Array.isArray(news)) throw new Error('Publication and news data must be arrays');
    for (const item of profile.education) {
        if (!item.logo?.startsWith('assets/education/') || item.logo.includes('..')) throw new Error('University crests must be local education assets');
        await access(path.join(root, item.logo));
    }
    const ids = new Set();
    for (const pub of publications) {
        if (!/^[a-z0-9-]+$/i.test(pub.id) || ids.has(pub.id)) throw new Error(`Invalid or duplicate publication ID: ${pub.id}`);
        ids.add(pub.id);
        if (!Array.isArray(pub.authors) || !pub.authors.length) throw new Error('Every paper needs authors');
        if (!/^\d{4}$/.test(String(pub.year))) throw new Error(`Invalid publication year: ${pub.year}`);
        if (!pub.doi && !pub.paperUrl) throw new Error(`Publication ${pub.id} needs a DOI or paper URL`);
        if (pub.paperUrl) safeLink(pub.paperUrl);
        if (pub.thumbnail) {
            if (!pub.thumbnail.startsWith('assets/') || pub.thumbnail.includes('..')) throw new Error('Paper images must be local assets');
            await access(path.join(root, pub.thumbnail));
        }
    }
    const sorted = [...publications].sort((a, b) => Number(b.year) - Number(a.year));
    const selected = sorted.filter(pub => pub.showOnHomepage !== false);
    const orderedNews = [...news].sort((a, b) => b.date.localeCompare(a.date));
    const citations = Object.fromEntries(publications.map(pub => [pub.id, { bibtex: bibtex(pub), doi: pub.doi ? `https://doi.org/${pub.doi}` : '' }]));
    const nameParts = profile.name.split(' ');
    const sprite = await icons();
    const pages = {};
    for (const language of languages) {
        const config = locale(language);
        const { ui } = config;
        const person = localize(profile, language);
        const advisors = profile.advisors.map(advisor => {
            const name = advisor.url ? `<a href="${safeLink(advisor.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(advisor.name)}</a>` : escapeHtml(advisor.name);
            const title = escapeHtml(config.advisorTitles[advisor.title] || advisor.title);
            return language === 'zh' ? `${name} ${title}` : `${title} ${name}`;
        }).join(escapeHtml(config.advisorSeparator));
        const bioSlots = {
            affiliation: escapeHtml(person.affiliation), advisors,
            previousUniversity: escapeHtml(localize(profile.education.at(-1), language).university),
        };
        const values = {
            ...Object.fromEntries(Object.entries(ui).map(([key, value]) => [key, escapeHtml(value)])),
            ...Object.fromEntries(['name', 'role', 'affiliation', 'email', 'avatar', 'description', 'location'].map(key => [key, escapeHtml(person[key])])),
            language: config.lang,
            firstName: escapeHtml(nameParts.slice(0, -1).join(' ')), lastName: escapeHtml(nameParts.at(-1)),
            github: safeLink(profile.links.github), orcid: safeLink(profile.links.orcid),
            year: new Date().getFullYear(), icons: sprite, dialog: renderDialog(language),
            terrain: terrain.replace('<svg ', '<svg class="terrain" aria-hidden="true" '),
            citations: JSON.stringify(citations).replace(/</g, '\\u003c'),
            uiData: JSON.stringify(Object.fromEntries(['openNavigation', 'closeNavigation', 'emailCopied', 'emailCopyUnavailable', 'bibtexCopied', 'bibtexCopyUnavailable'].map(key => [key, ui[key]]))).replace(/</g, '\\u003c'),
            bio: config.bio.map(paragraph => `<p>${formatText(paragraph, bioSlots)}</p>`).join(''),
            research: renderResearch(profile.research, language), education: renderEducation(profile.education, language),
            publications: selected.length ? selected.map(pub => renderPublication(pub, profile.name, language)).join('\n') : `<p class="empty-state">${escapeHtml(ui.noPublications)}</p>`,
            news: renderNews(orderedNews.slice(0, 4), language),
            homeHref: pageFile('index', language), newsHref: pageFile('news', language), publicationsHref: pageFile('publications', language),
        };
        const entries = [
            { page: 'index', template: home },
            { page: 'publications', template: archive, pageTitle: escapeHtml(ui.publicationsLabel), pageDescription: escapeHtml(ui.publicationsDescription), pageHeadingIcon: '<span class="title-icon publication-marker" aria-hidden="true"></span>', pageHeadingClass: 'publication-title', pageHeading: escapeHtml(ui.publicationsLabel), pageIntro: formatText(ui.publicationsIntro, { count: String(publications.length), plural: publications.length === 1 ? '' : 's' }), backAnchor: '#publications', contentClass: 'publication-list', content: sorted.map(pub => renderPublication(pub, profile.name, language)).join('\n') || `<p class="empty-state">${escapeHtml(ui.noPublications)}</p>` },
            { page: 'news', template: archive, pageTitle: escapeHtml(ui.newsLabel), pageDescription: escapeHtml(ui.newsDescription), pageHeadingIcon: '<span class="title-icon heading-emoji" aria-hidden="true">&#128293;</span>', pageHeadingClass: '', pageHeading: escapeHtml(ui.newsLabel), pageIntro: escapeHtml(ui.newsIntro), backAnchor: '#news', contentClass: 'updates', content: renderNews(news, language) },
        ];
        for (const entry of entries) {
            const otherLanguage = language === 'en' ? 'zh' : 'en';
            const languageSwitch = `<a class="language-switch" href="${pageFile(entry.page, otherLanguage)}" hreflang="${config.switchLang}" lang="${config.switchLang}" aria-label="${escapeHtml(ui.switchAria)}">${escapeHtml(ui.switchLabel)}</a>`;
            const alternates = languages.map(code => `<link rel="alternate" hreflang="${locale(code).lang}" href="${pageFile(entry.page, code)}">`).join('\n    ');
            pages[pageFile(entry.page, language)] = fill(entry.template, { ...values, ...entry, languageSwitch, alternates });
        }
    }
    const legacyPages = {
        'pages/all-publications.html': '../publications.html',
        'pages/all-news.html': '../news.html',
        'pages/all-honors.html': '../index.html',
    };
    for (const [name, target] of Object.entries(legacyPages)) {
        pages[name] = `<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" type="image/svg+xml" href="../assets/favicon.svg"><meta http-equiv="refresh" content="0; url=${target}"><link rel="canonical" href="${target}"><meta name="robots" content="noindex"><title>Page Moved | ${escapeHtml(profile.name)}</title></head><body><p>This page has moved. <a href="${target}">Continue to the updated homepage.</a></p></body></html>\n`;
    }
    await mkdir(path.join(root, 'pages'), { recursive: true });
    await Promise.all(Object.entries(pages).map(([name, html]) => writeFile(path.join(root, name), html, 'utf8')));
    return Object.keys(pages);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const pages = await buildSite();
    console.log(`Built ${pages.join(', ')}. Content is pre-rendered; no runtime JSON requests.`);
}
