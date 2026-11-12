/* Winter page: cold-weather shelters + how to help.
 *
 * Same safety rules as app.js: textContent only (scraped text never becomes
 * markup), public read-only layer only, no credentials, tel:/http(s) links
 * validated. Shelters are fail-safe: NEVER a computed open/closed — a cold-
 * weather shelter opens on the weather, so every card sends the reader to the
 * phone. Confidential records show phone only (no address). */
"use strict";

const CONFIG = {
  layerUrl:
    "https://services6.arcgis.com/XZK8P2K8iP98wM2w/arcgis/rest/services/human_services_view/FeatureServer/0",
  correctionEmail: "correctionscw@gmail.com",
  donateUrl: "winter-donate.json",
};

const I18N = {
  en: {
    docTitle: "Cold-Weather Shelters — Kittitas & Yakima Counties",
    skipLink: "Skip to the shelter list",
    h1: "Cold-Weather Shelters",
    tagline: "Kittitas and Yakima counties, Washington.",
    backLink: "← All services (food, housing, mental health)",
    callTitle: "Call before you go",
    callBody: "Cold-weather shelters often open only on the coldest nights, and dates, times and rules change. Call the number on the card to confirm it is open tonight.",
    call211: "— dial 2-1-1 any time to be connected with shelter and other help.",
    emergency: "In an emergency, call 9-1-1.",
    sheltersTitle: "Shelters",
    statusLoading: "Loading shelters…",
    countShown_one: "{{count}} shelter listed",
    countShown_other: "{{count}} shelters listed",
    none: "No shelters are listed here right now. Please call 2-1-1 to find shelter tonight.",
    loadError: "Could not load the shelter list. Please call 2-1-1 to find shelter tonight.",
    allServices: "See all food, housing and mental-health services on the map",
    giveTitle: "How to help",
    giveIntro: "Shelters run on donated time, food and warm clothing. Needs change week to week, so please contact the shelter before you drop anything off.",
    giveNone: "No donation information is listed yet. Call 2-1-1 to ask which shelters need help.",
    giveSource: "Source",
    giveEmail: "Email",
    giveUnconfirmed: "Not yet re-confirmed this season — contact them first.",
    footerNote: "Information is gathered from public sources and checked by a person before it appears here.",
    reportCorrection: "Report a correction",
    badge: "Cold-weather shelter",
    note: "Opens during cold weather. Call to confirm it is open before you go.",
    confidentialNote: "Confidential location — call for help. No address is shown for safety.",
    free: "Free",
    lastVerified: "Last verified {{date}}",
  },
  es: {
    docTitle: "Refugios para clima frío — Condados de Kittitas y Yakima",
    skipLink: "Saltar a la lista de refugios",
    h1: "Refugios para clima frío",
    tagline: "Condados de Kittitas y Yakima, Washington.",
    backLink: "← Todos los servicios (comida, vivienda, salud mental)",
    callTitle: "Llama antes de ir",
    callBody: "Los refugios para clima frío a menudo abren solo en las noches más frías, y las fechas, horarios y reglas cambian. Llama al número de la tarjeta para confirmar que está abierto esta noche.",
    call211: "— marca 2-1-1 a cualquier hora para que te conecten con refugio y otra ayuda.",
    emergency: "En una emergencia, llama al 9-1-1.",
    sheltersTitle: "Refugios",
    statusLoading: "Cargando refugios…",
    countShown_one: "{{count}} refugio en la lista",
    countShown_other: "{{count}} refugios en la lista",
    none: "Por ahora no hay refugios en esta lista. Llama al 2-1-1 para encontrar refugio esta noche.",
    loadError: "No se pudo cargar la lista de refugios. Llama al 2-1-1 para encontrar refugio esta noche.",
    allServices: "Ver todos los servicios de comida, vivienda y salud mental en el mapa",
    giveTitle: "Cómo ayudar",
    giveIntro: "Los refugios funcionan con tiempo, comida y ropa abrigadora donados. Las necesidades cambian cada semana, así que comunícate con el refugio antes de llevar algo.",
    giveNone: "Aún no hay información sobre donaciones. Llama al 2-1-1 para preguntar qué refugios necesitan ayuda.",
    giveSource: "Fuente",
    giveEmail: "Correo",
    giveUnconfirmed: "Aún no se ha reconfirmado esta temporada; contáctalos primero.",
    footerNote: "La información se recopila de fuentes públicas y una persona la revisa antes de que aparezca aquí.",
    reportCorrection: "Reportar una corrección",
    badge: "Refugio para clima frío",
    note: "Abre cuando hace mucho frío. Llama para confirmar que está abierto antes de ir.",
    confidentialNote: "Ubicación confidencial: llama para pedir ayuda. Por seguridad no se muestra la dirección.",
    free: "Gratis",
    lastVerified: "Verificado por última vez el {{date}}",
  },
};

function pickInitialLang() {
  let saved = null;
  try { saved = localStorage.getItem("hs-lang"); } catch (e) { /* ignore */ }
  if (saved === "en" || saved === "es") return saved;
  return (navigator.language || "en").toLowerCase().startsWith("es") ? "es" : "en";
}

i18next.init({
  lng: pickInitialLang(),
  fallbackLng: "en",
  resources: { en: { translation: I18N.en }, es: { translation: I18N.es } },
});
const t = (key, opts) => i18next.t(key, opts);
const LOCALE_TAG = { en: "en-US", es: "es-MX" };
const localeTag = () => LOCALE_TAG[i18next.language] || "en-US";

function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined && text !== null) n.textContent = String(text);
  return n;
}

function telLink(phone) {
  const digits = String(phone).replace(/\D+/g, "");
  if (digits.length !== 10 && !(digits.length === 11 && digits.startsWith("1"))) return null;
  const a = el("a", "phone", phone);
  a.href = "tel:+1" + (digits.length === 11 ? digits.slice(1) : digits);
  return a;
}

function webLink(url, label) {
  try {
    const u = new URL(String(url));
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    const a = el("a", "website", label || u.hostname.replace(/^www\./, ""));
    a.href = u.href;
    a.rel = "noopener noreferrer";
    a.target = "_blank";
    return a;
  } catch (e) { return null; }
}

const describe = (s) => (i18next.language === "es" && s.services_desc_es) || s.services_desc;

let shelters = null;   // null = not loaded, [] = loaded/none, undefined-safe
let loadFailed = false;
let donations = [];

function renderShelters() {
  const wrap = document.getElementById("shelters");
  const status = document.getElementById("status");
  wrap.replaceChildren();
  if (loadFailed) { status.textContent = t("loadError"); return; }
  if (shelters === null) { status.textContent = t("statusLoading"); return; }
  status.textContent = shelters.length ? t("countShown", { count: shelters.length }) : t("none");

  const sorted = [...shelters].sort((a, b) => String(a.name).localeCompare(String(b.name)));
  for (const s of sorted) {
    const card = el("article", "card cat-" + (s.category || "housing"));
    card.setAttribute("aria-label", s.name);
    const head = el("div", "card-head");
    head.appendChild(el("h3", "name", s.name));
    head.appendChild(el("span", "badge badge-hazard", t("badge")));
    card.appendChild(head);
    if (s.is_confidential) card.appendChild(el("p", "confidential-note", t("confidentialNote")));
    else if (s.address) card.appendChild(el("p", "address", s.address));
    const d = describe(s);
    if (d) card.appendChild(el("p", "desc", d));
    // Fail-safe: no computed open/closed for a weather-triggered service.
    card.appendChild(el("p", "hours hazard-note", t("note")));
    const links = el("p", "links");
    if (s.phone) { const p = telLink(s.phone); if (p) links.appendChild(p); }
    if (s.website) { const w = webLink(s.website); if (w) links.appendChild(w); }
    if (links.childNodes.length) card.appendChild(links);
    if (s.last_verified) {
      card.appendChild(el("p", "verified", t("lastVerified", {
        date: new Date(s.last_verified).toLocaleDateString(localeTag(),
          { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }),
      })));
    }
    wrap.appendChild(card);
  }
}

function renderDonations() {
  const wrap = document.getElementById("donations");
  wrap.replaceChildren();
  if (!donations.length) { wrap.appendChild(el("p", "fallback", t("giveNone"))); return; }
  for (const e of donations) {
    const card = el("article", "card cat-housing");
    card.appendChild(el("h3", "name", e.name));
    card.appendChild(el("p", "donate-how", (i18next.language === "es" && e.how_es) || e.how_en));
    if (!e.checked) card.appendChild(el("p", "hours hazard-note", t("giveUnconfirmed")));
    const links = el("p", "links");
    if (e.contact_email && /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i.test(e.contact_email)) {
      const a = el("a", "website", t("giveEmail") + ": " + e.contact_email);
      a.href = "mailto:" + encodeURIComponent(e.contact_email).replace("%40", "@");
      links.appendChild(a);
    }
    const src = e.source_url ? webLink(e.source_url, t("giveSource")) : null;
    if (src) links.appendChild(src);
    if (links.childNodes.length) card.appendChild(links);
    wrap.appendChild(card);
  }
}

function applyStaticI18n() {
  document.documentElement.lang = localeTag();
  document.title = t("docTitle");
  document.querySelectorAll("[data-i18n]").forEach((n) => { n.textContent = t(n.dataset.i18n); });
  document.querySelectorAll(".lang-btn").forEach((b) => {
    const on = b.dataset.lang === i18next.language;
    b.classList.toggle("is-on", on);
    b.setAttribute("aria-pressed", String(on));
  });
  const slot = document.getElementById("correctionSlot");
  slot.replaceChildren();
  if (CONFIG.correctionEmail) {
    const a = el("a", "correction", t("reportCorrection"));
    a.href = "mailto:" + encodeURIComponent(CONFIG.correctionEmail) +
      "?subject=" + encodeURIComponent("Correction: Winter shelter page");
    slot.appendChild(a);
  }
}

function setLanguage(lng) {
  i18next.changeLanguage(lng, () => {
    try { localStorage.setItem("hs-lang", lng); } catch (e) { /* ignore */ }
    applyStaticI18n(); renderShelters(); renderDonations();
  });
}
document.querySelectorAll(".lang-btn").forEach((b) =>
  b.addEventListener("click", () => setLanguage(b.dataset.lang)));
applyStaticI18n();
renderShelters();

// Shelters: the public view, cold hazard only. If the view does not expose
// hazard_type yet the query errors and we fall back to the 2-1-1 message.
const params = new URLSearchParams({
  where: "status = 'active' AND hazard_type = 'cold'",
  outFields: "*", returnGeometry: "false", f: "json",
});
fetch(CONFIG.layerUrl + "/query?" + params)
  .then((r) => r.json())
  .then((j) => {
    if (j.error || !Array.isArray(j.features)) throw new Error("query failed");
    shelters = j.features.map((f) => f.attributes);
    renderShelters();
  })
  .catch((err) => { loadFailed = true; renderShelters(); console.error(err); });

fetch(CONFIG.donateUrl)
  .then((r) => r.json())
  .then((j) => { donations = Array.isArray(j.entries) ? j.entries : []; renderDonations(); })
  .catch(() => { donations = []; renderDonations(); });
