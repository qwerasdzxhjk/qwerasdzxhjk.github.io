'use strict';

document.documentElement.classList.add('js-enabled');

let ui = {};
try { ui = JSON.parse(document.getElementById('ui-data')?.textContent || '{}'); } catch { /* Default messages keep controls usable if translations are unavailable. */ }
const message = (key, fallback) => ui[key] || fallback;

// Static sibling pages also switch correctly with file URLs and JavaScript disabled.
const languageSwitch = document.querySelector('.language-switch');
if (languageSwitch) {
    const target = languageSwitch.getAttribute('href');
    const updateLanguageTarget = () => { languageSwitch.setAttribute('href', `${target}${location.hash}`); };
    window.addEventListener('hashchange', updateLanguageTarget);
    updateLanguageTarget();
}

const menu = document.querySelector('#site-nav');
const menuToggle = document.querySelector('.menu-toggle');

function setMenuOpen(open) {
    if (!menu || !menuToggle) return;
    menu.classList.toggle('is-open', open);
    menuToggle.setAttribute('aria-expanded', String(open));
    menuToggle.setAttribute('aria-label', open ? message('closeNavigation', 'Close navigation') : message('openNavigation', 'Open navigation'));
}

if (menuToggle && menu) {
    menuToggle.addEventListener('click', () => setMenuOpen(menuToggle.getAttribute('aria-expanded') !== 'true'));
    menu.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setMenuOpen(false)));
    document.addEventListener('click', event => {
        if (!menu.contains(event.target) && !menuToggle.contains(event.target)) setMenuOpen(false);
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && menuToggle.getAttribute('aria-expanded') === 'true') {
            setMenuOpen(false);
            menuToggle.focus();
        }
    });
    const desktop = window.matchMedia('(min-width: 701px)');
    desktop.addEventListener('change', () => { if (desktop.matches) setMenuOpen(false); });
}

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
if ('IntersectionObserver' in window && !reducedMotion.matches) {
    document.documentElement.classList.add('js-motion');
    const reveal = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                reveal.unobserve(entry.target);
            }
        });
    }, { threshold: 0.08, rootMargin: '0px 0px -25px 0px' });
    document.querySelectorAll('[data-reveal]').forEach(element => reveal.observe(element));
}

const sectionLinks = [...document.querySelectorAll('.site-nav a[href^="#"]')];
const sections = sectionLinks.map(link => document.getElementById(link.hash.slice(1))).filter(Boolean);
let scrollPending = false;
function updateNavigation() {
    const offset = (document.querySelector('.site-header')?.offsetHeight || 0) + 140;
    let current = null;
    sections.forEach(section => { if (section.getBoundingClientRect().top <= offset) current = section.id; });
    sectionLinks.forEach(link => {
        const active = link.hash === `#${current}`;
        link.classList.toggle('is-active', active);
        if (active) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
    });
    scrollPending = false;
}
window.addEventListener('scroll', () => {
    if (!scrollPending) {
        scrollPending = true;
        requestAnimationFrame(updateNavigation);
    }
}, { passive: true });
updateNavigation();

const toast = document.getElementById('toast');
let toastTimer;
function notify(message) {
    if (!toast) return;
    clearTimeout(toastTimer);
    const parent = document.querySelector('dialog[open]') || document.body;
    if (toast.parentElement !== parent) parent.appendChild(toast);
    toast.textContent = message;
    toast.hidden = false;
    toastTimer = setTimeout(() => { toast.hidden = true; }, 4000);
}

async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
        try { await navigator.clipboard.writeText(text); return true; } catch { /* Fall back for file URLs and restrictive permissions. */ }
    }
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.cssText = 'position:fixed;left:-9999px;top:0;';
    const previous = document.activeElement;
    (document.querySelector('dialog[open]') || document.body).appendChild(field);
    field.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } catch { copied = false; }
    field.remove();
    previous?.focus({ preventScroll: true });
    return copied;
}

document.querySelectorAll('[data-copy]').forEach(button => {
    button.addEventListener('click', async () => notify(await copyText(button.dataset.copy) ? message('emailCopied', 'Email copied to clipboard.') : message('emailCopyUnavailable', 'Copy unavailable. Select the email address to copy it.')));
});

const citationDialog = document.getElementById('citation-dialog');
const citationText = document.getElementById('citation-text');
const citationDataElement = document.getElementById('citation-data');
let citationData = {};
try { citationData = JSON.parse(citationDataElement?.textContent || '{}'); } catch { /* Citation controls stay hidden if embedded data is invalid. */ }

if (citationDialog && typeof citationDialog.showModal === 'function') {
    document.querySelectorAll('[data-cite]').forEach(button => {
        const citation = citationData[button.dataset.cite];
        if (!citation || !citationText) return;
        button.hidden = false;
        button.addEventListener('click', () => {
            citationText.textContent = citation.bibtex;
            document.getElementById('citation-doi').href = citation.doi;
            citationDialog.showModal();
            document.body.classList.add('dialog-open');
        });
    });
    citationDialog.addEventListener('close', () => {
        document.body.classList.remove('dialog-open');
        if (toast) document.body.appendChild(toast);
    });
    citationDialog.addEventListener('click', event => {
        const rect = citationDialog.getBoundingClientRect();
        if (event.target === citationDialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) citationDialog.close();
    });
    document.getElementById('copy-citation')?.addEventListener('click', async () => {
        notify(await copyText(citationText.textContent) ? message('bibtexCopied', 'BibTeX copied to clipboard.') : message('bibtexCopyUnavailable', 'Copy unavailable. Select the BibTeX text to copy it.'));
    });
}
