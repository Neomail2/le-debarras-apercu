// Le Débarras — application du catalogue privé (sans dépendance, sans étape de construction).
// Les données viennent de /api/* ; aucun texte venant des données n'est inséré comme HTML.
// Globales du navigateur déclarées explicitement (relecture et analyse statique sans configuration navigateur).
const { document, window } = globalThis;
const app = document.getElementById('app');
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const state = { info: null, catalog: null, authed: false, pending: null, maps: null, prevPath: null, path: null };

const ICONS = {
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h10"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9.5l6 6 6-6"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 6l6 6-6 6"/></svg>',
  whatsapp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 19.5l1.2-3.6A8 8 0 1 1 8.6 18.6z"/><path d="M9.2 8.6c.2-.4.4-.5.7-.5h.5c.2 0 .4.1.5.4l.6 1.5c.1.2 0 .5-.1.7l-.5.6c.5 1 1.4 1.9 2.4 2.4l.6-.5c.2-.2.5-.2.7-.1l1.5.6c.3.1.4.3.4.5v.5c0 .3-.1.5-.5.7-.6.3-1.4.5-2.3.2a8.3 8.3 0 0 1-4.9-4.9c-.3-.8-.1-1.6.2-2.2z"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6.6 3.5h2.6l1.3 4-2 1.4a12 12 0 0 0 6.6 6.6l1.4-2 4 1.3v2.6a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2z"/></svg>',
};
const STATUS = { disponible: 'Disponible', reserve: 'Réservé', vendu: 'Vendu' };

// ---------- Mode aperçu statique (GitHub Pages) ----------
// Activé par <meta name="ld-static" data-base="/chemin"> (ajoutée par tools/export-apercu.mjs).
// Pas de serveur : le code n'est qu'une porte d'entrée côté page ; les données de l'aperçu sont fictives.
const STATIC_CFG = document.querySelector('meta[name="ld-static"]');
const BASE = STATIC_CFG ? (STATIC_CFG.dataset.base || '').replace(/\/$/, '') : '';
const GATE_KEY = 'ld_apercu_acces';
let memGate = null;
const normalizeCode = (t) => String(t || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[\s\-_.]/g, '');
async function sha256hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function gateOk() {
  let v = memGate;
  try { v = localStorage.getItem(GATE_KEY) || v; } catch { /* stockage indisponible : mémoire seule */ }
  return !!v && (state.info?.gate || []).includes(v);
}
async function staticJson(file) {
  try {
    const res = await fetch(`${BASE}/data/${file}`, { cache: 'no-cache' });
    return res.ok ? { ok: true, status: 200, data: await res.json() } : { ok: false, status: res.status, data: null };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}
async function staticApi(path, method, body) {
  // Les informations publiques sont intégrées à la page (bloc #ld-public) ; absentes : porte fermée.
  if (path === '/api/catalog') return gateOk() ? staticJson('catalog.json') : { ok: false, status: 401, data: null };
  if (path === '/api/session') {
    if (method === 'GET') return { ok: true, status: 200, data: { authenticated: gateOk() } };
    if (method === 'DELETE') {
      memGate = null;
      try { localStorage.removeItem(GATE_KEY); } catch { /* rien */ }
      return { ok: true, status: 200, data: { ok: true } };
    }
    const hash = await sha256hex(`le-debarras:${normalizeCode(body?.code)}`);
    if (!(state.info?.gate || []).includes(hash)) return { ok: false, status: 401, data: null };
    memGate = hash;
    try { localStorage.setItem(GATE_KEY, hash); } catch { /* mémoire seule */ }
    return { ok: true, status: 200, data: { ok: true } };
  }
  return { ok: false, status: 404, data: null };
}

// ---------- Outils ----------
function icon(name) {
  const t = document.createElement('template');
  t.innerHTML = ICONS[name];
  const svg = t.content.firstElementChild;
  svg.setAttribute('aria-hidden', 'true');
  return svg;
}

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'href' && typeof v === 'string' && v.startsWith('/') && !v.startsWith('//')) el.setAttribute('href', BASE + v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (typeof v === 'boolean' && k in el) el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid instanceof window.Node ? kid : document.createTextNode(typo(String(kid))));
  }
  return el;
}

const mediaUrl = (f) => `${BASE}/media/${encodeURIComponent(f)}`;
const plural = (n) => `${n} pièce${n > 1 ? 's' : ''}`;
const euro = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: Number.isInteger(n) ? 0 : 2 }).format(n);
const discount = (p) => (p.price !== undefined && p.priceBefore > p.price ? Math.round((1 - p.price / p.priceBefore) * 100) : 0);
// Typographie française : espace insécable fine avant ! ? ; : » et après « (évite « ? » seul en début de ligne).
const typo = (t) => t.replace(/ ([!?;:»])/g, '\u202f$1').replace(/« /g, '«\u202f');

function rafThrottle(fn) {
  let queued = false;
  return () => {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(() => { queued = false; fn(); });
  };
}

async function api(path, { method = 'GET', body } = {}) {
  if (STATIC_CFG) return staticApi(path, method, body);
  try {
    const res = await fetch(path, {
      method, credentials: 'same-origin',
      headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

function picture(m, { sizes = '50vw', eager = false } = {}) {
  const wrap = h('div', { class: 'ph' });
  if (!m) return wrap;
  // Fond d'attente : beige de la marque (les couleurs tirées des photos ne sont plus utilisées, V2).
  // Chaque appareil télécharge la taille utile : ¼, ½ ou pleine largeur selon l'affichage et la densité de l'écran.
  const set = m.w ? [[m.small, 4], [m.thumb, 2], [m.src, 1]].filter(([f]) => f).map(([f, d]) => `${mediaUrl(f)} ${Math.round(m.w / d)}w`) : [];
  const srcset = set.length > 1 ? set.join(', ') : null;
  const img = h('img', { alt: m.alt || '', decoding: 'async', loading: eager ? 'eager' : 'lazy', sizes: srcset ? sizes : null, srcset, src: mediaUrl(m.thumb || m.src) });
  if (eager) img.setAttribute('fetchpriority', 'high');
  const done = () => wrap.classList.add('is-loaded');
  img.addEventListener('load', done, { once: true });
  img.addEventListener('error', done, { once: true });
  wrap.append(img);
  if (img.complete && img.naturalWidth) done();
  return wrap;
}

let toastTimer;
function toast(text) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = h('div', { class: 'toast', role: 'status' });
    document.body.append(el);
  }
  el.textContent = typo(text);
  window.requestAnimationFrame(() => el.classList.add('is-on'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-on'), Math.min(9000, 2600 + text.length * 40));
}

function applyTheme(theme = {}) {
  const root = document.documentElement.style;
  for (const [k, v] of Object.entries(theme.colors || {})) if (/^#[0-9a-f]{6}$/i.test(v)) root.setProperty(`--${k}`, v);
  if (theme.fontDisplay) root.setProperty('--font-display', theme.fontDisplay);
  if (theme.fontText) root.setProperty('--font', theme.fontText);
}

// ---------- Mascotte : uniquement des transformations du visuel fourni ----------
/** Visuel de marque ; largeur/hauteur d'origine (si connues) : la place est réservée avant le chargement. */
function brandImg(key, props = {}) {
  const b = state.info.brand;
  const d = b.dims?.[key];
  return h('img', { src: b[key], width: d?.w, height: d?.h, ...props });
}

/** art (facultatif) : une déclinaison de la mascotte fournie par Le Débarras ({ src, w, h } des données,
 *  ex. la mascotte en crampons pour la catégorie Crampons) ; sinon la mascotte officielle. */
function mascot(cls = '', art = null) {
  const own = typeof art?.src === 'string' && art.src !== '';
  const img = own
    ? h('img', { src: mediaUrl(art.src), width: art.w, height: art.h, alt: '', draggable: 'false', decoding: 'async' })
    : brandImg('mascot', { alt: '', draggable: 'false' });
  // Déclinaison introuvable (fichier absent ou mal nommé) : la mascotte officielle prend sa place, jamais d'image cassée.
  if (own && state.info.brand.mascot) img.addEventListener('error', () => { img.src = state.info.brand.mascot; }, { once: true });
  const root = h('div', { class: `mascot ${cls}`.trim() }, img);
  let current = '';
  const set = (name) => {
    root.classList.remove('is-idle', 'is-enter', 'is-hop', 'is-nope', 'is-boop');
    void root.offsetWidth;
    if (name) root.classList.add(`is-${name}`);
    current = name;
  };
  return {
    root,
    idle: () => set('idle'),
    play(name) {
      if (reduced) { set('idle'); return Promise.resolve(); }
      set(name);
      return new Promise((resolve) => {
        const end = () => { root.removeEventListener('animationend', end); if (current === name) set('idle'); resolve(); };
        root.addEventListener('animationend', end);
        setTimeout(end, 1400);
      });
    },
  };
}

/** La mascotte qui parle : elle accueille, présente une catégorie ou une pièce, oriente dans le menu.
 *  note : 2e ligne de la bulle (ex. « Toutes nos pièces sont en qualité 1.1 ! », catalog.json → quality).
 *  Toujours dans le flux de la page (place réservée) : elle ne recouvre jamais un contenu. */
function guide(role, text, { first = 'enter', art = null, note = null } = {}) {
  const m = mascot('guide__mascot', art);
  const bubble = h('p', { class: 'say' }, text, note ? h('strong', { class: 'say__note' }, note) : null);
  const root = h('div', { class: `guide guide--${role}`, 'data-mascot': role }, m.root, bubble);
  m.root.addEventListener('click', () => m.play('boop'));
  m.play(first);
  return { root };
}
/** Phrase que la mascotte précise sur les pages (données) ; absente ou vide : rien. */
const qualityNote = () => (typeof state.catalog?.quality === 'string' && state.catalog.quality.trim() ? state.catalog.quality.trim() : null);

// ---------- Promotion du moment : tout vient des données (catalog.json → promo) ----------
// { active, theme, title, percent, text, ctaLabel, ctaTarget, note, visual, colors }. Rien à coder pour changer d'offre.
const PROMO_COLORS = { bg: '--p-bg', bg2: '--p-bg2', text: '--p-ink', sticker: '--p-sticker', stickerText: '--p-sticker-ink', button: '--p-btn', buttonText: '--p-btn-ink' };
function promoData(c) {
  const pr = c?.promo;
  if (!pr || pr.active !== true) return null;
  const n = Number(pr.percent);
  const percent = pr.percent !== '' && pr.percent !== null && pr.percent !== undefined && Number.isFinite(n) && n > 0 && n < 100 ? Math.round(n) : null;
  if (!pr.title && percent === null) return null;
  const theme = /^[a-z0-9-]{1,24}$/.test(pr.theme || '') ? pr.theme : 'caramel';
  // Lien du bouton : une ancre de la page ou une page du catalogue, jamais une adresse extérieure.
  const target = typeof pr.ctaTarget === 'string' && /^(#[a-z0-9-]+|\/(?!\/)[a-z0-9/-]*)$/.test(pr.ctaTarget) ? pr.ctaTarget : '#categories';
  return { ...pr, percent, theme, target, label: pr.ctaLabel || 'Découvrir le catalogue' };
}

function promoSection(c) {
  const pr = promoData(c);
  if (!pr) return null;
  const m = mascot();
  const pct = pr.percent !== null ? h('p', { class: 'promo__pct' }, h('span', { class: 'promo__minus' }, '−'), String(pr.percent), h('span', { class: 'promo__unit' }, '\u202f%')) : null;
  const go = (e) => {
    m.play('hop');
    if (!pr.target.startsWith('#')) return; // page du catalogue : navigation normale (data-link)
    e.preventDefault();
    document.getElementById(pr.target.slice(1))?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
  };
  const cta = h('a', { class: 'btn promo__cta', href: pr.target, 'data-link': pr.target.startsWith('/') ? '' : null, onclick: go }, pr.label, icon('arrow'));
  const section = h('section', { class: 'promo', 'data-theme': pr.theme, 'aria-labelledby': pr.title ? 'promo-title' : null, 'aria-label': pr.title ? null : 'Offre du moment' },
    pr.visual?.src ? h('div', { class: 'promo__visual' }, picture(pr.visual, { sizes: '(min-width: 720px) 48vw, 92vw', eager: true })) : null,
    h('div', { class: 'promo__body' },
      h('div', { class: 'promo__snow', 'aria-hidden': 'true' }),
      pr.title ? h('h2', { class: 'promo__title orn', id: 'promo-title' }, pr.title) : null,
      h('div', { class: 'promo__deal' },
        h('div', { class: 'promo__mascot', 'data-mascot': 'promo' }, m.root),
        pct),
      pr.text ? h('p', { class: 'promo__text' }, pr.text) : null,
      cta,
      pr.note ? h('p', { class: 'promo__note' }, pr.note) : null));
  for (const [k, prop] of Object.entries(PROMO_COLORS)) {
    const v = pr.colors?.[k];
    if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) section.style.setProperty(prop, v);
  }
  m.root.addEventListener('click', () => m.play('boop'));
  // La mascotte arrive, puis montre la remise du doigt (au même rythme que la remise qui « tape »).
  m.play('enter').then(() => section.classList.add('is-live'));
  return section;
}

// ---------- Superpositions (menu, photos en grand) : le bouton retour les ferme ----------
const overlay = {
  current: null,
  open(el, onClose) {
    saveScroll();
    this.current?.el.remove();
    document.body.append(el);
    window.requestAnimationFrame(() => el.classList.add('is-open'));
    this.current = { el, onClose };
    window.history.pushState({ ...(window.history.state || {}), overlay: true }, '');
    document.documentElement.classList.add('no-scroll');
  },
  teardown() {
    if (!this.current) return false;
    const { el, onClose } = this.current;
    this.current = null;
    el.classList.remove('is-open');
    setTimeout(() => el.remove(), 320);
    document.documentElement.classList.remove('no-scroll');
    onClose?.();
    return true;
  },
  dismiss() {
    if (this.current) window.history.back();
  },
};

// ---------- Navigation ----------
function parseRoute(fullPath) {
  const pathname = BASE && fullPath.startsWith(BASE) ? fullPath.slice(BASE.length) || '/' : fullPath;
  if (pathname === '/' || pathname === '/catalogue') return { name: 'home' };
  let m = /^\/c\/([a-z0-9-]+)\/?$/.exec(pathname);
  if (m) return { name: 'category', id: m[1] };
  m = /^\/p\/([a-z0-9-]+)\/?$/.exec(pathname);
  if (m) return { name: 'product', slug: m[1] };
  return { name: 'notfound' };
}

function saveScroll() {
  window.history.replaceState({ ...(window.history.state || {}), scrollY: window.scrollY }, '');
}

function navigate(path, { replace = false } = {}) {
  if (path === window.location.pathname && !replace) {
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    return;
  }
  saveScroll();
  window.history[replace ? 'replaceState' : 'pushState']({ scrollY: 0 }, '', path);
  render({ scrollY: 0, transition: true });
}

window.addEventListener('popstate', (e) => {
  if (overlay.teardown()) return;
  render({ scrollY: e.state?.scrollY ?? 0, transition: true });
});

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-link]');
  if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
  e.preventDefault();
  if (overlay.current) {
    // Depuis le menu : on remplace l'entrée du menu par la nouvelle page (un seul « retour » suffit ensuite).
    overlay.teardown();
    navigate(a.getAttribute('href'), { replace: true });
    return;
  }
  navigate(a.getAttribute('href'));
});

function render({ scrollY = 0, transition = false } = {}) {
  const route = parseRoute(window.location.pathname);
  const draw = () => {
    closeNav();
    let view;
    if (!state.authed) view = viewWelcome();
    else if (route.name === 'home') view = viewHome();
    else if (route.name === 'category') view = viewCategory(route.id);
    else if (route.name === 'product') view = viewProduct(route.slug);
    else view = viewNotFound();
    if (state.path !== window.location.pathname) { state.prevPath = state.path; state.path = window.location.pathname; }
    app.replaceChildren(view);
    window.scrollTo(0, scrollY);
    companion.update(route);
  };
  if (transition && state.authed && document.startViewTransition && !reduced) document.startViewTransition(draw);
  else draw();
}

// ---------- Données ----------
async function loadCatalog() {
  const r = await api('/api/catalog');
  if (!r.ok || !r.data) return r.status;
  const c = r.data;
  const cat = new Map(c.categories.map((x) => [x.id, x]));
  const bySlug = new Map(c.products.map((p) => [p.slug, p]));
  const byCat = new Map(c.categories.map((x) => [x.id, []]));
  for (const p of c.products) byCat.get(p.category)?.push(p);
  for (const list of byCat.values()) list.sort((a, b) => (a.status === 'vendu') - (b.status === 'vendu'));
  state.catalog = c;
  state.maps = { cat, bySlug, byCat, universes: universesOf(c), uniOf: new Map() };
  for (const u of state.maps.universes) for (const x of u.cats) state.maps.uniOf.set(x.id, u);
  return 200;
}

// Univers du menu principal (Vêtements, Football…) : tout vient des données (catalog.json → universes, et
// category.universe). Une catégorie sans univers connu va dans « Autres » ; sans univers du tout, un seul groupe.
// Un univers sans catégorie n'est pas affiché. Rien à coder pour ajouter un univers ou une catégorie.
function universesOf(c) {
  const list = (Array.isArray(c.universes) ? c.universes : [])
    .filter((u) => u && typeof u.id === 'string' && typeof u.name === 'string' && u.name.trim())
    .filter((u, i, all) => all.findIndex((v) => v.id === u.id) === i)
    .map((u) => ({ id: u.id, name: u.name, cats: c.categories.filter((x) => x.universe === u.id) }));
  const known = new Set(list.map((u) => u.id));
  const rest = c.categories.filter((x) => !known.has(x.universe));
  if (rest.length) list.push({ id: '', name: list.length ? 'Autres' : 'Catégories', cats: rest });
  return list.filter((u) => u.cats.length);
}
const countOf = (catId) => state.maps.byCat.get(catId)?.length || 0;

// Contact : WhatsApp (numéro et message dans les données). Catalogue, pas commande : le message cite la pièce et
// son lien, rien d'autre (ni taille, ni option choisie).
function contactLinks(p) {
  const c = state.catalog?.contact || {};
  const placeholders = state.catalog?.contactPlaceholders || [];
  const link = p ? `${window.location.origin}${BASE}/p/${p.slug}` : `${window.location.origin}${BASE}/`;
  const tpl = c.whatsapp?.message || 'Bonjour, je suis intéressé(e) par « {produit} » : {lien}';
  const text = p ? tpl.replaceAll('{produit}', p.name).replaceAll('{lien}', link) : 'Bonjour, j’ai une question sur le catalogue Le Débarras.';
  const out = [];
  const number = String(c.whatsapp?.number || '').replace(/\D/g, '');
  if (number) {
    out.push({ kind: 'whatsapp', label: p ? 'Demander sur WhatsApp' : 'Écrire sur WhatsApp', href: `https://wa.me/${number}?text=${encodeURIComponent(text)}` });
  } else if (placeholders.includes('whatsapp')) {
    // Maquette : pas encore de numéro. On montre le message qui partira, sans rien ouvrir.
    const preview = p ? tpl.replaceAll('{produit}', p.name).replaceAll('{lien}', '[lien de la pièce]') : text;
    out.push({ kind: 'whatsapp', label: p ? 'Demander sur WhatsApp' : 'Écrire sur WhatsApp', toast: `Maquette — WhatsApp s’ouvrira avec : « ${preview} »` });
  }
  if (c.phone) out.push({ kind: 'phone', label: 'Appeler', href: `tel:${c.phone.number.replace(/[^+\d]/g, '')}` });
  return out;
}

function contactButtons(p) {
  return contactLinks(p).map((c, i) => {
    const cls = `btn ${i === 0 ? 'btn--dark' : 'btn--outline'} btn--block`;
    return c.href
      ? h('a', { class: cls, href: c.href, target: '_blank', rel: 'noopener noreferrer' }, icon(c.kind), c.label)
      : h('button', { class: cls, type: 'button', onclick: () => toast(c.toast) }, icon(c.kind), c.label);
  });
}

async function logout() {
  await api('/api/session', { method: 'DELETE' });
  state.authed = false;
  state.catalog = null;
  document.body.classList.remove('is-authed');
  overlay.teardown();
  window.history.replaceState({ scrollY: 0 }, '', BASE + '/');
  state.pending = BASE + '/';
  render();
}

function expire(message) {
  state.authed = false;
  state.catalog = null;
  document.body.classList.remove('is-authed');
  state.pending = window.location.pathname;
  overlay.teardown();
  render();
  const err = document.getElementById('code-error');
  if (err) err.textContent = message;
}

document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !state.authed) return;
  const r = await api('/api/session');
  // Réponse inconnue (réseau) : on ne déconnecte pas ; refus explicite seulement.
  if (r.ok && r.data && r.data.authenticated === false) expire('Votre accès a expiré ou le code a changé. Saisissez le code actuel.');
});

// ---------- Éléments communs ----------
function topbar() {
  const b = state.info.brand;
  const bar = h('header', { class: 'topbar' },
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Ouvrir le menu', onclick: openMenu }, icon('menu')),
    h('a', { class: 'topbar__logo', href: '/', 'data-link': '', 'aria-label': `${b.name} — accueil du catalogue` },
      b.logo ? brandImg('logo', { alt: b.name }) : b.name),
    h('span'));
  return bar;
}

// ---------- Menu principal : les univers côte à côte, chacun ouvre au clic la liste de ses catégories ----------
// Navigation « à volets » (bouton + liste de liens) : un seul volet ouvert ; il se ferme par un second clic,
// un clic ou un toucher à côté, la touche Échap, ou en choisissant une catégorie.
let navOpen = null; // { item, btn }
function closeNav({ focus = false } = {}) {
  if (!navOpen) return;
  const { item, btn } = navOpen;
  navOpen = null;
  item.classList.remove('is-open');
  btn.setAttribute('aria-expanded', 'false');
  item.closest('.unav')?.classList.remove('has-open');
  if (focus) btn.focus();
}
document.addEventListener('click', (e) => { if (navOpen && !navOpen.item.contains(e.target)) closeNav(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && navOpen) { e.preventDefault(); closeNav({ focus: true }); } });

function mainNav(activeCatId) {
  const current = activeCatId ? state.maps.uniOf.get(activeCatId) : null;
  const items = state.maps.universes.map((u, k) => {
    const panelId = `unav-${k}`;
    const links = u.cats.map((x, i) => h('li', { style: `--i:${i}` },
      h('a', { class: 'unav__link', href: `/c/${x.id}`, 'data-link': '', 'aria-current': x.id === activeCatId ? 'page' : null, onclick: () => closeNav() },
        h('span', { class: 'unav__thumb', 'data-cat': x.id }),
        h('span', { class: 'unav__name' }, x.name),
        h('span', { class: 'unav__count' }, plural(countOf(x.id))),
        icon('next'))));
    const panel = h('div', { class: 'unav__panel', id: panelId }, h('ul', { class: 'unav__list', role: 'list' }, links));
    const btn = h('button', {
      class: `unav__btn${u === current ? ' is-current' : ''}`, type: 'button', 'aria-expanded': 'false', 'aria-controls': panelId,
      onclick: () => (navOpen?.item === item ? closeNav() : open()),
    }, h('span', {}, u.name), icon('chevron'));
    const item = h('div', { class: 'unav__item' }, btn, panel);
    function open() {
      closeNav();
      // Vignettes chargées à la première ouverture seulement (rien à télécharger tant que le menu reste fermé).
      for (const t of panel.querySelectorAll('.unav__thumb:empty')) t.append(picture(state.maps.cat.get(t.dataset.cat)?.cover, { sizes: '40px', eager: true }));
      item.classList.add('is-open');
      btn.setAttribute('aria-expanded', 'true');
      nav.classList.add('has-open');
      navOpen = { item, btn };
      companion.close();
    }
    // Clavier : flèches haut/bas pour parcourir la liste (elle s'ouvre si besoin) ; Tab hors du volet le referme.
    item.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const all = [...panel.querySelectorAll('.unav__link')];
      if (!all.length) return;
      e.preventDefault();
      if (navOpen?.item !== item) open();
      const i = all.indexOf(document.activeElement);
      all[e.key === 'ArrowDown' ? (i + 1) % all.length : (i <= 0 ? all.length - 1 : i - 1)].focus();
    });
    item.addEventListener('focusout', (e) => { if (navOpen?.item === item && e.relatedTarget && !item.contains(e.relatedTarget)) closeNav(); });
    return item;
  });
  const nav = h('nav', { class: 'unav', 'aria-label': 'Menu principal' }, h('div', { class: `unav__bar${items.length > 2 ? ' is-many' : ''}`, style: `--n:${items.length}` }, items));
  // Voile léger sous le menu ouvert : un toucher à côté ferme le volet sans rien déclencher dessous.
  const veil = h('div', { class: 'unav__veil', 'aria-hidden': 'true', onclick: () => closeNav() });
  return [nav, veil];
}

function priceLine(p, big = false) {
  if (p.price === undefined) return null;
  const d = discount(p);
  return h('div', { class: big ? 'info__price' : 'card__meta' },
    h('span', { class: 'price' }, euro(p.price)),
    d ? h('span', { class: 'price-before' }, h('span', { class: 'visually-hidden' }, 'au lieu de '), euro(p.priceBefore)) : null,
    big && d ? h('span', { class: 'deal' }, `−${d} %`) : null);
}

/** Simple mention à côté du prix (ex. « Flocage : +5 € » pour les maillots) : priceNote de la pièce ou de sa
 *  catégorie (données). Une mention, pas une option : rien à cocher, rien d'ajouté au message. */
function priceNote(...from) {
  const t = from.map((x) => x?.priceNote).find((v) => typeof v === 'string' && v.trim());
  return t ? h('p', { class: 'price-note' }, t.trim()) : null;
}

/** Coloris (facultatifs) d'une pièce : [{ name, media? }] des données. Le 1er est celui de ses photos. */
const colorsOf = (p) => (Array.isArray(p.colors) ? p.colors : []).filter((c) => c && typeof c.name === 'string' && c.name.trim());
/** Photos d'un coloris : les siennes ; pour le 1er coloris, à défaut, celles de la pièce. Jamais la photo d'un
 *  autre coloris sous son nom : un coloris sans photo reste écrit en toutes lettres, sans vignette. */
function colorImages(p, k) {
  const own = (Array.isArray(colorsOf(p)[k]?.media) ? colorsOf(p)[k].media : []).filter((m) => m?.type === 'image' && typeof m.src === 'string');
  if (own.length || k > 0) return own;
  return p.media.filter((m) => m.type === 'image');
}

function card(p) {
  const img = p.media.find((m) => m.type === 'image');
  const hasVideo = p.media.some((m) => m.type === 'video');
  const d = discount(p);
  const badge = p.status === 'vendu' ? h('span', { class: 'badge badge--vendu' }, 'Vendu')
    : p.status === 'reserve' ? h('span', { class: 'badge badge--reserve' }, 'Réservé')
      : d ? h('span', { class: 'badge badge--deal' }, `−${d} %`) : null;
  return h('a', { class: `card${p.status === 'vendu' ? ' is-sold' : ''}`, href: `/p/${p.slug}`, 'data-link': '' },
    h('div', { class: 'card__media' },
      picture(img, { sizes: '(min-width: 1024px) 23vw, (min-width: 720px) 31vw, 46vw' }),
      badge,
      hasVideo ? h('span', { class: 'chip-video' }, icon('play'), 'Vidéo') : null),
    h('span', { class: 'card__name' }, p.name),
    colorsOf(p).length > 1 ? h('span', { class: 'card__colors' }, `${colorsOf(p).length} coloris`) : null,
    priceLine(p));
}

function demoLine() {
  const t = state.info.demo?.banner;
  return t ? h('p', { class: 'demo-line' }, t) : null;
}

function footer() {
  const b = state.info.brand;
  return h('footer', { class: 'footer' },
    b.lockup ? brandImg('lockup', { class: 'footer__logo', alt: `${b.name} — ${b.tagline || ''}`, loading: 'lazy', decoding: 'async' }) : null,
    h('p', {}, 'Catalogue privé réservé aux clients du Débarras. Pas de vente en ligne : les pièces se réservent par message.'),
    state.info.demo?.banner ? h('p', { class: 'footer__demo' }, state.info.demo.banner) : null,
    h('div', { class: 'footer__links' },
      h('a', { href: '/', 'data-link': '' }, 'Accueil du catalogue'),
      h('button', { type: 'button', onclick: logout }, 'Se déconnecter')));
}

// ---------- Vues ----------
function viewWelcome() {
  const b = state.info.brand;
  document.title = `${b.name} — Catalogue privé`;
  const m = b.mascot ? mascot('welcome__mascot') : null;
  const input = h('input', {
    id: 'code', name: 'code', type: 'text', size: '8', inputmode: 'text', autocomplete: 'off', autocapitalize: 'characters',
    autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'go', maxlength: '40', placeholder: 'Votre code d’accès',
    'aria-describedby': 'code-help code-error',
  });
  const btn = h('button', { type: 'submit', 'aria-label': 'Entrer dans le catalogue' }, icon('arrow'));
  const err = h('p', { class: 'code-form__error', id: 'code-error', role: 'alert' });
  const field = h('div', { class: 'code-field' }, input, btn);
  const shake = () => { field.classList.remove('is-shake'); void field.offsetWidth; field.classList.add('is-shake'); };
  let busy = false;
  const view = h('main', { class: 'welcome' },
    h('div', { class: 'welcome__stage' }, m?.root, h('div', { class: 'mascot-shadow' })),
    h('h1', { class: 'welcome__logo' }, b.lockup ? brandImg('lockup', { alt: `${b.name} — ${b.tagline || ''}` }) : b.name),
    h('form', {
      class: 'code-form', novalidate: true,
      onsubmit: async (e) => {
        e.preventDefault();
        if (busy) return;
        const code = input.value.trim();
        if (!code) { err.textContent = 'Saisissez le code qui vous a été communiqué.'; shake(); input.focus(); return; }
        busy = true;
        btn.disabled = true;
        btn.replaceChildren(h('span', { class: 'spin', 'aria-hidden': 'true' }));
        err.textContent = '';
        const r = await api('/api/session', { method: 'POST', body: { code } });
        let status = r.status;
        if (r.ok) status = await loadCatalog();
        if (status === 200) { input.blur(); await openCatalog(view, m); return; }
        busy = false;
        btn.disabled = false;
        btn.replaceChildren(icon('arrow'));
        err.textContent = status === 401 ? 'Ce code ne fonctionne pas. Vérifiez-le et réessayez.'
          : status === 429 ? `Trop d’essais. Réessayez dans ${Math.max(1, Math.ceil((r.data?.retryAfter || 600) / 60))} min.`
            : status === 0 ? 'Connexion impossible. Vérifiez votre réseau puis réessayez.'
              : 'Le catalogue est momentanément indisponible. Réessayez dans un instant.';
        shake();
        m?.play('nope');
        input.select();
      },
    },
    h('label', { class: 'code-form__title', for: 'code' }, b.welcomeTitle || 'Catalogue privé'),
    h('p', { class: 'code-form__help', id: 'code-help' }, b.welcomeText || 'Saisissez votre code d’accès.'),
    field, err),
    h('p', { class: 'welcome__foot' }, 'Accès réservé aux clients du Débarras'));
  if (m) {
    m.play('enter');
    m.root.addEventListener('click', () => m.play('boop'));
  }
  return view;
}

async function openCatalog(welcome, m) {
  await m?.play('hop');
  state.authed = true;
  document.body.classList.add('is-authed');
  const target = state.pending && parseRoute(state.pending).name !== 'notfound' ? state.pending : BASE + '/';
  state.pending = null;
  welcome.classList.add('is-leaving');
  document.body.append(welcome);
  window.history.replaceState({ scrollY: 0 }, '', target);
  render();
  app.querySelector('.page')?.classList.add('is-reveal');
  if (reduced || !m) {
    welcome.remove();
    companion.show(true);
    return;
  }
  const img = m.root.querySelector('img');
  const from = img.getBoundingClientRect();
  const to = companion.target();
  const flight = h('img', { class: 'flight', src: img.currentSrc || img.src, alt: '' });
  Object.assign(flight.style, { position: 'fixed', left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, zIndex: 95, transformOrigin: '0 0', pointerEvents: 'none' });
  document.body.append(flight);
  m.root.style.visibility = 'hidden';
  const s = to.width / from.width;
  const dx = to.left - from.left;
  const dy = to.top - from.top;
  await Promise.all([
    welcome.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-100%)' }], { duration: 860, easing: 'cubic-bezier(.7,0,.2,1)', fill: 'forwards' }).finished,
    flight.animate([
      { transform: 'translate(0, 0) scale(1)' },
      { transform: `translate(${dx * 0.55}px, ${dy * 0.35 - 80}px) scale(${(1 + s) / 2}) rotate(-10deg)`, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) scale(${s})` },
    ], { duration: 980, easing: 'cubic-bezier(.45,0,.2,1)', fill: 'forwards' }).finished,
  ]);
  flight.remove();
  welcome.remove();
  companion.show(true);
}

function viewHome() {
  const c = state.catalog;
  document.title = `${state.info.brand.name} — Catalogue privé`;
  // Coups de cœur : les pièces en vedette (données : featured), rangées par leur rang (featured = 1, 2, 3…) s'il est
  // donné, sinon dans l'ordre du catalogue (featured = true).
  const rank = (p) => (typeof p.featured === 'number' ? p.featured : Infinity);
  const featured = c.products.filter((p) => p.featured).sort((a, b) => (rank(a) === rank(b) ? 0 : rank(a) - rank(b)));
  const home = c.home || {};
  const heroImg = h('img', { src: mediaUrl(home.heroMobile || home.heroDesktop || ''), alt: '', decoding: 'async', fetchpriority: 'high' });
  const hero = home.heroMobile || home.heroDesktop
    ? h('section', { class: 'hero' },
      h('picture', {}, home.heroDesktop ? h('source', { media: '(min-width: 720px)', srcset: mediaUrl(home.heroDesktop) }) : null, heroImg),
      h('div', { class: 'hero__body' },
        h('p', { class: 'eyebrow' }, `Catalogue privé · ${plural(c.products.length)}`),
        h('h1', { class: 'hero__title' }, home.title || 'La sélection'),
        home.subtitle ? h('p', { class: 'hero__sub' }, home.subtitle) : null,
        h('a', { class: 'btn btn--light', href: '#categories', onclick: (e) => { e.preventDefault(); document.getElementById('categories')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' }); } }, 'Découvrir', icon('arrow'))))
    : null;
  return h('div', {}, topbar(), mainNav(null),
    h('main', { class: 'page' },
      demoLine(),
      promoSection(c),
      hero,
      h('section', { class: 'section', id: 'categories' },
        h('div', { class: 'section__head' }, h('h2', { class: 'section__title brush-under' }, 'Les catégories')),
        // La mascotte d'accueil (données : home.mascot, home.say) souhaite la bienvenue et précise la qualité.
        guide('accueil', home.say || 'Bienvenue ! Choisissez un rayon, je vous y emmène.', { art: home.mascot, note: qualityNote() }).root,
        // Une rangée par univers, dans l'ordre du menu principal.
        state.maps.universes.map((u) => h('div', { class: 'universe' },
          state.maps.universes.length > 1 ? h('h3', { class: 'universe__title' }, u.name, h('small', {}, plural(u.cats.reduce((n, x) => n + countOf(x.id), 0)))) : null,
          h('div', { class: 'tiles', 'data-n': u.cats.length }, u.cats.map((cat, i, all) =>
            h('a', { class: 'tile', href: `/c/${cat.id}`, 'data-link': '' },
              // Largeur affichée : vignette élargie si l'univers a 1 à 3 catégories (ordinateur) ou si elle est seule sur sa ligne (téléphone).
              picture(cat.cover, { sizes: `(min-width: 1024px) ${all.length <= 3 ? Math.round(96 / all.length) : 16}vw, (min-width: 720px) 31vw, ${i === all.length - 1 && all.length % 2 ? 92 : 46}vw` }),
              h('div', { class: 'tile__body' }, h('span', { class: 'tile__name' }, cat.name), h('span', { class: 'tile__count' }, plural(countOf(cat.id)))))))))),
      featured.length ? h('section', { class: 'section' },
        h('div', { class: 'section__head' }, h('h2', { class: 'section__title brush-under' }, 'Coups de cœur')),
        h('div', { class: 'scroller rail' }, featured.map(card))) : null,
      h('section', { class: 'how' },
        h('h2', {}, 'Une pièce vous plaît ?'),
        h('ol', {},
          h('li', {}, 'Ouvrez sa fiche : photos, coloris et prix.'),
          h('li', {}, 'Écrivez-nous en un geste, l’article est indiqué dans le message.'),
          h('li', {}, 'On vous répond vite pour la réserver.')),
        h('div', { class: 'how__cta' }, contactButtons(null))),
      footer()));
}

function viewCategory(id) {
  let cat = state.maps.cat.get(id);
  // Ancienne adresse d'un rayon regroupé (données : category.aliases) : l'adresse devient celle du nouveau rayon.
  const to = cat ? null : state.catalog.categories.find((x) => Array.isArray(x.aliases) && x.aliases.includes(id));
  if (to) {
    window.history.replaceState(window.history.state, '', `${BASE}/c/${to.id}`);
    cat = to;
    id = to.id;
  }
  if (!cat) return viewNotFound();
  const items = state.maps.byCat.get(id) || [];
  const u = state.maps.uniOf.get(id);
  document.title = `${cat.name} — ${state.info.brand.name}`;
  // La mascotte présente la catégorie avec son accroche (données) ; sans accroche, une phrase par défaut.
  // Mascotte de la catégorie si les données en donnent une (category.mascot), sinon la mascotte officielle.
  // Catégorie encore vide : un message propre et les catégories voisines du même univers, jamais une erreur.
  const intro = guide('categorie', items.length ? cat.tagline || `Toutes nos pièces ${cat.name.toLowerCase()}, choisies une à une.`
    : 'Rien ici pour l’instant : les premières pièces arrivent bientôt !', { first: items.length ? 'enter' : 'nope', art: cat.mascot, note: items.length ? qualityNote() : null });
  const near = (u?.cats || []).filter((x) => x.id !== id && countOf(x.id));
  return h('div', {}, topbar(), mainNav(id),
    h('main', { class: 'page' },
      demoLine(),
      h('header', { class: 'cat-head' },
        h('div', { class: 'cat-head__title' },
          h('p', { class: 'eyebrow' }, u && state.maps.universes.length > 1 ? `${u.name} · ${plural(items.length)}` : plural(items.length)),
          h('h1', { class: 'brush-under' }, cat.name),
          priceNote(cat)),
        intro.root),
      items.length ? h('div', { class: 'grid' }, items.map(card))
        : h('div', { class: 'empty empty--cat' }, h('strong', {}, 'Bientôt de nouvelles pièces ici.'),
          near.length ? h('p', { class: 'empty__near' }, 'En attendant, voyez aussi :') : null,
          near.length ? h('div', { class: 'empty__links' }, near.map((x) => h('a', { class: 'pill', href: `/c/${x.id}`, 'data-link': '' }, x.name))) : null,
          h('a', { class: 'btn btn--dark', href: '/', 'data-link': '' }, 'Voir tout le catalogue')),
      footer()));
}

/** Galerie d'un jeu de photos (celles de la pièce ou d'un coloris) : [galerie, vignettes]. */
function galleryParts(images, video) {
  const n = images.length;
  const counter = n > 1 ? h('div', { class: 'gallery__count', 'aria-hidden': 'true' }, `1 / ${n}`) : null;
  const track = h('div', { class: 'gallery__track' }, images.map((m, i) =>
    h('button', { class: 'gallery__slide', type: 'button', 'aria-label': `Voir la photo ${i + 1} sur ${n} en grand`, onclick: () => openLightbox(images, i) },
      picture(m, { sizes: '(min-width: 1024px) 55vw, 100vw', eager: i === 0 }))));
  const thumbs = n > 1 ? h('div', { class: 'thumbs' }, images.map((m, i) =>
    h('button', {
      class: `thumb${i === 0 ? ' is-active' : ''}`, type: 'button', 'aria-label': `Afficher la photo ${i + 1}`,
      onclick: () => track.scrollTo({ left: i * track.clientWidth, behavior: reduced ? 'auto' : 'smooth' }),
    }, picture(m, { sizes: '60px' })))) : null;
  track.addEventListener('scroll', rafThrottle(() => {
    const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
    if (counter) counter.textContent = `${i + 1} / ${n}`;
    thumbs?.querySelectorAll('.thumb').forEach((t, k) => t.classList.toggle('is-active', k === i));
  }), { passive: true });
  const chip = video ? h('button', {
    class: 'gallery__video', type: 'button',
    onclick: () => document.getElementById('video')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' }),
  }, icon('play'), 'Voir la vidéo') : null;
  return [h('div', { class: 'gallery' }, track, counter, chip), thumbs];
}

// Coloris (facultatifs) : une vignette par coloris qui a ses photos ; la toucher affiche ses photos dans la galerie.
// Un coloris sans photo reste écrit en toutes lettres (aucune photo d'un autre coloris montrée sous son nom).
function colorsBlock(p, onPick) {
  const colors = colorsOf(p);
  if (!colors.length) return null;
  const current = h('strong', { class: 'colors__current' }, colors[0].name);
  const list = h('div', { class: 'colors__list', role: 'group', 'aria-label': 'Coloris' });
  list.append(...colors.map((c, k) => {
    const imgs = colorImages(p, k);
    if (!imgs.length) return h('span', { class: 'swatch swatch--text' }, h('span', { class: 'swatch__name' }, c.name));
    return h('button', {
      class: 'swatch', type: 'button', 'aria-pressed': String(k === 0), 'aria-label': `Voir le coloris ${c.name}`,
      onclick: (e) => {
        if (e.currentTarget.getAttribute('aria-pressed') === 'true') return;
        for (const b of list.querySelectorAll('button.swatch')) b.setAttribute('aria-pressed', String(b === e.currentTarget));
        current.textContent = typo(c.name);
        onPick(imgs);
      },
    }, h('span', { class: 'swatch__img' }, picture(imgs[0], { sizes: '56px' })), h('span', { class: 'swatch__name' }, c.name));
  }));
  return h('div', { class: 'colors' },
    h('p', { class: 'colors__label' }, colors.length > 1 ? `${colors.length} coloris · ` : 'Coloris · ', current), list);
}

function videoBlock(p, v) {
  const el = h('video', {
    src: mediaUrl(v.src), poster: v.poster ? mediaUrl(v.poster) : null, controls: true, loop: true,
    preload: 'metadata', playsinline: '', muted: '', 'aria-label': `Vidéo : ${p.name}`,
  });
  el.muted = true;
  el.playsInline = true;
  if (!reduced && 'IntersectionObserver' in window) {
    const io = new window.IntersectionObserver(([e]) => {
      if (!el.isConnected) { io.disconnect(); return; }
      if (e.isIntersecting) el.play().catch(() => {});
      else el.pause();
    }, { threshold: 0.6 });
    io.observe(el);
  }
  return h('section', { class: 'video-block', id: 'video' }, h('h2', {}, 'En vidéo'), h('div', { class: 'video-block__frame' }, el));
}

// Tailles : toutes les tailles disponibles, écrites en clair (catalogue : rien à cocher, rien d'ajouté au message).
function sizesBlock(p) {
  const list = (Array.isArray(p.sizes) ? p.sizes : []).filter((s) => typeof s === 'string' || typeof s === 'number').map((s) => String(s).trim()).filter(Boolean);
  if (!list.length) return null;
  return h('p', { class: 'sizes' },
    h('span', { class: 'sizes__label' }, list.length > 1 ? (p.status === 'vendu' ? 'Tailles' : 'Tailles disponibles') : 'Taille'),
    h('span', { class: 'sizes__text' }, list.join(' · ')));
}

// Sur la fiche, la mascotte de la catégorie (sinon l'officielle) invite à écrire et précise la qualité.
function productGuide(p, cat) {
  const opts = { art: cat.mascot, note: qualityNote() };
  if (p.status === 'vendu') return guide('fiche', 'Celle-ci a trouvé preneur. Écrivez-nous : je vous préviens si une pièce semblable arrive.', { ...opts, first: 'nope' });
  return guide('fiche', 'Cette pièce vous plaît ? Écrivez-nous, je transmets !', opts);
}

function viewProduct(slug) {
  const p = state.maps.bySlug.get(slug);
  if (!p) return viewNotFound();
  const cat = state.maps.cat.get(p.category);
  document.title = `${p.name} — ${state.info.brand.name}`;
  const images = colorImages(p, 0);
  const video = p.media.find((m) => m.type === 'video');
  const catPath = `/c/${cat.id}`;
  const related = (state.maps.byCat.get(cat.id) || []).filter((x) => x.id !== p.id && x.status !== 'vendu').slice(0, 8);
  const cta = h('div', { class: 'cta' }, contactButtons(p));
  const g = productGuide(p, cat);
  // Photos + coloris : toucher un coloris remplace les photos de la galerie par les siennes (la vidéo reste).
  const media = h('div', { class: 'product__media' });
  const swatches = colorsBlock(p, (imgs) => {
    media.replaceChildren(...galleryParts(imgs, video).filter(Boolean), swatches);
    media.querySelector('.gallery').classList.add('is-swap');
  });
  media.append(...(images.length ? galleryParts(images, video) : []).filter(Boolean), ...(swatches ? [swatches] : []));
  const back = h('a', {
    class: 'back', href: catPath,
    onclick: (e) => {
      // Retour à la catégorie d'où l'on vient : on remonte l'historique pour retrouver la position.
      if (state.prevPath === BASE + catPath && window.history.length > 1) { e.preventDefault(); e.stopPropagation(); window.history.back(); }
    },
    'data-link': '',
  }, icon('back'), cat.name);
  return h('div', {}, topbar(), mainNav(p.category),
    h('main', { class: 'page' },
      back,
      h('article', { class: 'product' },
        media.childElementCount ? media : null,
        h('div', { class: 'info' },
          h('p', { class: 'eyebrow' }, cat.name),
          h('h1', {}, p.name),
          priceLine(p, true),
          priceNote(p, cat),
          p.status ? h('p', { class: `status status--${p.status}` }, STATUS[p.status]) : null,
          sizesBlock(p),
          p.description ? h('p', { class: 'desc' }, p.description) : null,
          p.details?.length ? h('dl', { class: 'details' }, p.details.map((d) => [h('dt', {}, d.label), h('dd', {}, d.value)])) : null,
          g.root,
          cta,
          h('p', { class: 'cta__note' }, 'Pas de paiement en ligne : on vous répond pour la réserver.'))),
      video ? videoBlock(p, video) : null,
      related.length ? h('section', { class: 'section' },
        h('div', { class: 'section__head' }, h('h2', { class: 'section__title' }, `Aussi en ${cat.name.toLowerCase()}`),
          h('a', { class: 'section__link', href: catPath, 'data-link': '' }, 'Tout voir')),
        h('div', { class: 'scroller rail' }, related.map(card))) : null,
      footer()));
}

function viewNotFound() {
  document.title = `Page introuvable — ${state.info.brand.name}`;
  return h('div', {}, topbar(), state.maps ? mainNav(null) : null, h('main', { class: 'page' },
    h('div', { class: 'empty' }, h('strong', {}, 'Cette page n’existe pas ou plus.'),
      guide('introuvable', 'Oups, je ne trouve rien ici. Je vous ramène au catalogue ?', { first: 'nope' }).root,
      h('a', { class: 'btn btn--dark', href: '/', 'data-link': '' }, 'Retour au catalogue')),
    footer()));
}

// ---------- Menu ----------
function openMenu() {
  const b = state.info.brand;
  const pr = promoData(state.catalog);
  const el = h('div', { class: 'menu', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Menu' },
    h('div', { class: 'menu__head' },
      b.logo ? brandImg('logo', { alt: b.name }) : h('strong', {}, b.name),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Fermer le menu', onclick: () => overlay.dismiss() }, icon('close'))),
    b.mascot ? guide('menu', 'Bonne visite ! Touchez une catégorie, je vous y emmène.').root : null,
    pr ? h('a', { class: 'menu__promo', href: '/', 'data-link': '', 'data-theme': pr.theme },
      h('span', {}, pr.title || 'Offre du moment'), pr.percent !== null ? h('small', {}, `−${pr.percent}\u202f%`) : null) : null,
    h('nav', { class: 'menu__nav', 'aria-label': 'Catégories' },
      h('a', { href: '/', 'data-link': '' }, h('span', {}, 'Accueil'), h('small', {}, plural(state.catalog.products.length))),
      // Mêmes univers que le menu principal (Vêtements, Football…), chacun avec ses catégories.
      state.maps.universes.map((u) => [
        state.maps.universes.length > 1 ? h('p', { class: 'menu__group' }, u.name) : null,
        u.cats.map((c) => h('a', { href: `/c/${c.id}`, 'data-link': '' }, h('span', {}, c.name), h('small', {}, plural(countOf(c.id)))))])),
    h('div', { class: 'menu__foot' }, contactButtons(null),
      h('button', { class: 'menu__logout', type: 'button', onclick: logout }, 'Se déconnecter')));
  overlay.open(el);
  companion.close();
}

// ---------- Photos en plein écran ----------
function openLightbox(images, start) {
  const counter = h('span', {}, `${start + 1} / ${images.length}`);
  const track = h('div', { class: 'lightbox__track' }, images.map((m) =>
    h('figure', { class: 'lightbox__slide' }, h('img', { src: mediaUrl(m.src), alt: m.alt || '', decoding: 'async' }))));
  const go = (d) => track.scrollTo({ left: (Math.round(track.scrollLeft / track.clientWidth) + d) * track.clientWidth, behavior: 'smooth' });
  const onKey = (e) => {
    if (e.key === 'Escape') overlay.dismiss();
    else if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'ArrowLeft') go(-1);
  };
  const el = h('div', { class: 'lightbox', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Photos en grand' },
    h('div', { class: 'lightbox__bar' }, counter,
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Fermer', onclick: () => overlay.dismiss() }, icon('close'))),
    track);
  track.addEventListener('scroll', rafThrottle(() => {
    counter.textContent = `${Math.round(track.scrollLeft / Math.max(1, track.clientWidth)) + 1} / ${images.length}`;
  }), { passive: true });
  document.addEventListener('keydown', onKey);
  overlay.open(el, () => document.removeEventListener('keydown', onKey));
  window.requestAnimationFrame(() => { track.scrollLeft = start * track.clientWidth; });
  companion.close();
}

// ---------- Compagnon : la mascotte accompagne la navigation, dans la case libre à droite de la barre du haut ----------
// Place réservée (la barre reste en haut de l'écran) : elle ne recouvre jamais le contenu, sur toute page et tout écran.
const companion = (() => {
  let root = null;
  let ctl = null;
  let bubble = null;
  let route = null;
  let greeted = false;

  function product() {
    return route?.name === 'product' ? state.maps?.bySlug.get(route.slug) : null;
  }
  function fill(text, { greeting = false } = {}) {
    const p = product();
    const kids = [
      h('button', { class: 'bubble__close', type: 'button', 'aria-label': 'Fermer', onclick: close }, icon('close')),
      h('p', { class: 'bubble__text' }, text || (p ? 'Cette pièce vous plaît ? Écrivez-nous, je transmets !' : 'Une question sur une pièce ? Écrivez-nous.')),
    ];
    if (!greeting) {
      kids.push(...contactButtons(p));
      if (window.scrollY > 600) {
        kids.push(h('button', { class: 'btn btn--outline btn--block', type: 'button', onclick: () => { close(); window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' }); } }, icon('up'), 'Remonter en haut'));
      }
    }
    bubble.classList.toggle('is-greeting', greeting);
    bubble.replaceChildren(...kids);
  }
  function open(text, opts) {
    fill(text, opts);
    bubble.classList.add('is-open');
    root.querySelector('.companion__btn').setAttribute('aria-expanded', 'true');
  }
  function close() {
    if (!bubble) return;
    bubble.classList.remove('is-open');
    root.querySelector('.companion__btn').setAttribute('aria-expanded', 'false');
  }
  function build() {
    if (root || !state.info.brand.mascot) return;
    ctl = mascot();
    bubble = h('div', { class: 'bubble', id: 'companion-bubble', role: 'dialog', 'aria-label': 'Contacter Le Débarras' });
    root = h('div', { class: 'companion is-hidden' },
      h('button', {
        class: 'companion__btn', type: 'button', 'aria-label': 'Une question ? Contacter Le Débarras', 'aria-expanded': 'false', 'aria-controls': 'companion-bubble',
        onclick: () => { ctl.play('boop'); if (bubble.classList.contains('is-open')) close(); else open(); },
      }, ctl.root),
      bubble);
    document.body.append(root);
    window.addEventListener('scroll', rafThrottle(() => {
      document.querySelector('.topbar')?.classList.toggle('is-scrolled', window.scrollY > 4);
      if (bubble.classList.contains('is-greeting')) close();
    }), { passive: true });
  }
  return {
    target() {
      build();
      return root.querySelector('.companion__btn img').getBoundingClientRect();
    },
    show(first = false) {
      build();
      if (!root) return;
      root.classList.remove('is-hidden');
      ctl.play('hop');
      if (first && !greeted && !window.sessionStorage.getItem('ld_greeted')) {
        greeted = true;
        window.sessionStorage.setItem('ld_greeted', '1');
        setTimeout(() => { if (state.authed) open('Bienvenue ! Une question ? Je suis là.', { greeting: true }); }, 900);
        setTimeout(() => { if (bubble?.classList.contains('is-greeting')) close(); }, 3900);
      }
    },
    update(r) {
      const prev = route;
      route = r;
      if (!state.authed) { if (root) root.classList.add('is-hidden'); close(); return; }
      build();
      if (!root) return;
      close();
      if (prev && (prev.name !== r.name || prev.id !== r.id || prev.slug !== r.slug) && !root.classList.contains('is-hidden')) ctl.play('hop');
    },
    close,
  };
})();

// ---------- Démarrage ----------
async function boot() {
  // Aperçu statique : les informations publiques sont intégrées à la page (aucune requête avant le premier affichage).
  let pub = null;
  const inline = document.getElementById('ld-public');
  if (inline) {
    try { pub = { ok: true, data: JSON.parse(inline.textContent) }; } catch { pub = null; }
  }
  if (!pub) pub = await api('/api/public');
  state.info = pub.ok && pub.data ? pub.data : { brand: { name: 'Le Débarras' }, theme: {}, demo: {} };
  applyTheme(state.info.theme);
  if (state.info.demo?.banner) document.body.append(h('div', { class: 'demo-badge' }, state.info.demo.banner));
  window.history.scrollRestoration = 'manual';
  const s = await api('/api/session');
  if (s.ok && s.data?.authenticated && (await loadCatalog()) === 200) {
    state.authed = true;
    document.body.classList.add('is-authed');
  } else {
    state.pending = window.location.pathname;
  }
  const y = window.history.state?.scrollY ?? 0;
  window.history.replaceState({ ...(window.history.state || {}), scrollY: y, overlay: false }, '');
  render({ scrollY: y });
  if (state.authed) { app.querySelector('.page')?.classList.add('is-reveal'); companion.show(); }
}

boot();
