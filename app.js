/* Human Services Web Map — front-end logic.
 *
 * Security rules honored here (see repo operating contract):
 * - All service text is rendered with textContent — never innerHTML — so
 *   scraped content can never execute as markup.
 * - The map reads the PUBLIC read-only view; no credentials exist client-side.
 * - Open/closed is computed client-side with opening_hours.js, pinned to
 *   America/Los_Angeles. FAIL-OPEN: unknown/missing/unparseable hours are
 *   always shown and never hidden by the "hide closed" toggle.
 * - Confidential records render as phone-only cards: no address, no map point.
 */
"use strict";

const CONFIG = {
  // The PUBLIC read-only VIEW layer (never the private source).
  layerUrl:
    "https://services6.arcgis.com/XZK8P2K8iP98wM2w/arcgis/rest/services/human_services_view/FeatureServer/0",
  // The public corrections channel: every card shows "Report a correction"
  // mailing here with the service name + service_id prefilled in the subject.
  correctionEmail: "correctionscw@gmail.com",
  center: [-120.6, 46.85], // between Ellensburg and Yakima
  zoom: 8, // full two-county extent
  refreshSeconds: 60, // re-evaluate open/closed badges this often
};

/* ---------- i18n (English + Mexican Spanish) ----------
 * i18next is loaded in index.html. The DATA (service names/descriptions) stays
 * as discovered; only the UI chrome, badges, and the plain-language hours are
 * translated. Language persists in localStorage and defaults to the browser's
 * preference (es-* -> Spanish), so a Spanish-first visitor lands in Spanish. */
const I18N = {
  en: {
    docTitle: "Food, Housing & Mental Health Help — Kittitas & Yakima Counties",
    metaDescription: "Free map of food, housing, and mental-health services in Kittitas and Yakima counties, Washington.",
    skipLink: "Skip to the list of services",
    h1: "Find Help in Kittitas and Yakima Counties",
    tagline: "Free food, housing, and mental-health services in Kittitas and Yakima counties.",
    disclaimerShort: "Please call ahead to confirm details.",
    disclaimerLead: "Please double-check before you go.",
    disclaimerRest: "Call the number listed to confirm hours, address, and what to bring — details can change.",
    controlsToggle: "Search & filters",
    tapExpand: "Tap to expand",
    tapCollapse: "Tap to collapse",
    searchPlaceholder: "Search — e.g. veterans, shelter, WIC, Sunnyside",
    sortLabel: "Sort",
    sortOpen: "Open first",
    sortAlpha: "Alphabetical",
    hideClosed: "Hide places closed right now",
    failOpenNote: "Places with unknown hours are always shown.",
    sheetTitle: "Location Details",
    sheetHint: "Address, hours & phone",
    // Screen-reader landmark labels — never visible, so they were the easiest
    // strings to miss; a Spanish screen-reader user heard English landmarks.
    ariaMap: "Map of services",
    ariaFilters: "Filter services",
    ariaCategories: "Show categories",
    ariaList: "List of services",
    footerPacific: "Hours shown in Pacific time.",
    reportCorrection: "Report a correction",
    statusLoading: "Loading services…",
    loadError: "Could not load services. Please try again later.",
    loadingSlow: "Still loading… If you are developing against the private view, complete the ArcGIS sign-in prompt (the public site will not ask).",
    countShown_one: "{{count}} service shown",
    countShown_other: "{{count}} services shown",
    noMatch: "No services match your filters. Try turning on more categories, clearing the search box, or unchecking “Hide places closed right now.”",
    cat: { food: "Food", housing: "Housing", mental_health: "Mental health" },
    free: "Free",
    slidingScale: "Sliding-scale cost",
    confidentialNote: "Confidential location — call for help. No address is shown for safety.",
    lastVerified: "Last verified {{date}}",
    badge: { open: "Open now", closed: "Closed now", unknown: "Hours unknown" },
    hoursUnknownLong: "Hours unknown — call to check",
    open247: "Open 24 hours, every day",
    days: { Mo: "Mon", Tu: "Tue", We: "Wed", Th: "Thu", Fr: "Fri", Sa: "Sat", Su: "Sun", PH: "holidays" },
    to: "to", and: "and", closed: "closed", am: "AM", pm: "PM", last: "last",
    ord: { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th", 5: "5th" },
  },
  es: {
    docTitle: "Ayuda con comida, vivienda y salud mental — Condados de Kittitas y Yakima",
    metaDescription: "Mapa gratuito de servicios de comida, vivienda y salud mental en los condados de Kittitas y Yakima, Washington.",
    skipLink: "Saltar a la lista de servicios",
    h1: "Encuentra ayuda en los condados de Kittitas y Yakima",
    tagline: "Servicios gratuitos de comida, vivienda y salud mental en los condados de Kittitas y Yakima.",
    disclaimerShort: "Por favor llama antes de ir para confirmar la información.",
    disclaimerLead: "Por favor confirma antes de ir.",
    disclaimerRest: "Llama al número indicado para confirmar el horario, la dirección y qué llevar; la información puede cambiar.",
    controlsToggle: "Buscar y filtrar",
    tapExpand: "Toca para abrir",
    tapCollapse: "Toca para cerrar",
    searchPlaceholder: "Buscar — p. ej. veteranos, refugio, WIC, Sunnyside",
    sortLabel: "Ordenar",
    sortOpen: "Abiertos primero",
    sortAlpha: "Alfabético",
    hideClosed: "Ocultar lugares cerrados ahora",
    failOpenNote: "Los lugares con horario desconocido siempre se muestran.",
    sheetTitle: "Detalles del lugar",
    sheetHint: "Dirección, horario y teléfono",
    ariaMap: "Mapa de servicios",
    ariaFilters: "Filtrar servicios",
    ariaCategories: "Mostrar categorías",
    ariaList: "Lista de servicios",
    footerPacific: "Horario en hora del Pacífico.",
    reportCorrection: "Reportar una corrección",
    statusLoading: "Cargando servicios…",
    loadError: "No se pudieron cargar los servicios. Inténtalo de nuevo más tarde.",
    loadingSlow: "Cargando aún… Si estás desarrollando con la vista privada, completa el inicio de sesión de ArcGIS (el sitio público no lo pide).",
    countShown_one: "{{count}} servicio mostrado",
    countShown_other: "{{count}} servicios mostrados",
    noMatch: "Ningún servicio coincide con tus filtros. Prueba activar más categorías, borrar la búsqueda o desmarcar «Ocultar lugares cerrados ahora».",
    cat: { food: "Comida", housing: "Vivienda", mental_health: "Salud mental" },
    free: "Gratis",
    slidingScale: "Costo según ingresos",
    confidentialNote: "Ubicación confidencial: llama para pedir ayuda. Por seguridad no se muestra la dirección.",
    lastVerified: "Verificado por última vez el {{date}}",
    badge: { open: "Abierto ahora", closed: "Cerrado ahora", unknown: "Horario desconocido" },
    hoursUnknownLong: "Horario desconocido; llama para confirmar",
    open247: "Abierto las 24 horas, todos los días",
    days: { Mo: "Lun", Tu: "Mar", We: "Mié", Th: "Jue", Fr: "Vie", Sa: "Sáb", Su: "Dom", PH: "días festivos" },
    to: "a", and: "y", closed: "cerrado", am: "a.m.", pm: "p.m.", last: "último",
    ord: { 1: "1.º", 2: "2.º", 3: "3.º", 4: "4.º", 5: "5.º" },
  },
};

function pickInitialLang() {
  const saved = localStorage.getItem("hs-lang");
  if (saved === "en" || saved === "es") return saved;
  return (navigator.language || "en").toLowerCase().startsWith("es") ? "es" : "en";
}

i18next.init({
  lng: pickInitialLang(),
  fallbackLng: "en",
  resources: { en: { translation: I18N.en }, es: { translation: I18N.es } },
});
const t = (key, opts) => i18next.t(key, opts);
// Full BCP-47 tag, not the bare i18next code: it sets <html lang> (so a screen
// reader picks the Mexican Spanish voice rather than a generic/Castilian one)
// and formats dates as es-MX.
const LOCALE_TAG = { en: "en-US", es: "es-MX" };
const localeTag = () => LOCALE_TAG[i18next.language] || "en-US";

const CATEGORY_COLOR = {
  food: "#5b7a3a",
  housing: "#b5652e",
  mental_health: "#6b4e7a",
};

/* Map-pin / dot glyphs — built from plain SVG primitives (rect/circle/
 * polygon/ellipse) rather than hand-tuned bezier paths, so they render
 * correctly without visual tuning: an apple (food — symbolic of the Yakima
 * Valley's orchards), a house (housing), a heart (mental health). White on
 * the category color, inside a circle. Each entry is a function of the pin
 * color so a glyph can "cut" a same-color notch (see the apple's stem dimple)
 * that always matches its own pin, even if CATEGORY_COLOR changes later. */
// Pins are drawn at 50% opacity so overlapping/clustered points blend
// instead of one fully hiding another. Applied to the colored fill only —
// the white glyph and outline stay fully opaque for legibility.
const PIN_FILL_OPACITY = 0.5;

const CATEGORY_ICON_MARKUP = {
  food: (color) =>
      '<circle cx="12" cy="13.5" r="6" fill="white"/>'          // apple body
    + `<circle cx="12" cy="8" r="2.3" fill="${color}" fill-opacity="${PIN_FILL_OPACITY}"/>`  // top notch (cut to match the pin)
    + '<rect x="11.3" y="4" width="1.4" height="4.5" rx="0.7" fill="white"/>'  // stem
    + '<ellipse cx="14.5" cy="5.3" rx="2.1" ry="1.1" fill="white" transform="rotate(35 14.5 5.3)"/>', // leaf
  housing: () =>
      '<polygon points="12,4.7 19,11 17,11 17,19 13.2,19 13.2,14.5 10.8,14.5 10.8,19 7,19 7,11 5,11" fill="white"/>',
  mental_health: () =>
      '<circle cx="9" cy="10" r="3.1" fill="white"/><circle cx="15" cy="10" r="3.1" fill="white"/>'
    + '<polygon points="6.4,11.1 17.6,11.1 12,19" fill="white"/>',
};

function pinSvgMarkup(category, diameter) {
  const color = CATEGORY_COLOR[category] || "#555";
  const r = 10.5;
  const glyph = CATEGORY_ICON_MARKUP[category] ? CATEGORY_ICON_MARKUP[category](color) : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${diameter}" height="${diameter}" viewBox="0 0 24 24">`
    + `<circle cx="12" cy="12" r="${r}" fill="${color}" fill-opacity="${PIN_FILL_OPACITY}" stroke="white" stroke-width="1.5"/>`
    + glyph
    + `</svg>`;
}

function pinDataUri(category, diameter = 30) {
  return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(pinSvgMarkup(category, diameter));
}

/* ---------- time: pin evaluation to Pacific ---------- */

function pacificNow() {
  // Build a Date whose wall-clock fields equal the current Pacific wall clock,
  // so opening_hours (which evaluates in local wall time) reads the schedule
  // as Pacific regardless of the visitor's timezone or DST.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t).value;
  const hour = get("hour") === "24" ? "00" : get("hour");
  return new Date(
    `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}:${get("second")}`
  );
}

/* Returns "open" | "closed" | "unknown". Any parse/eval problem => unknown
 * (fail-open: unknown is always shown). */
function openState(hoursOsm) {
  if (!hoursOsm || !String(hoursOsm).trim()) return "unknown";
  try {
    const oh = new opening_hours(String(hoursOsm));
    return oh.getState(pacificNow()) ? "open" : "closed";
  } catch (e) {
    return "unknown";
  }
}

/* ---------- plain-language hours ---------- */

function dayName(code) { return t("days." + code, { defaultValue: code }); }

function fmtTime(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const am = h < 12;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${am ? t("am") : t("pm")}`;
}

function ordinal(n) {
  if (n === -1) return t("last");
  return t("ord." + n, { defaultValue: String(n) });
}

/* One day token: "Mo", "Mo-Fr", or "Th[2,4]" (nth weekday of the month). */
function humanDayToken(token) {
  const nth = token.match(/^([A-Za-z]{2})\[([-\d,]+)\]$/);
  if (nth) {
    const day = dayName(nth[1]);
    const ords = nth[2].split(",").map((x) => ordinal(parseInt(x, 10)));
    return ords.join(" " + t("and") + " ") + " " + day;
  }
  return token.split("-").map(dayName).join("–");
}

function humanHours(hoursOsm) {
  if (!hoursOsm || !String(hoursOsm).trim()) return t("hoursUnknownLong");
  const s = String(hoursOsm).trim();
  if (s === "24/7") return t("open247");
  // Translate the validated subset (day selectors incl. Day[n] monthly
  // patterns + 24h ranges); anything surprising falls back to the raw string.
  try {
    const DAY_ATOM = "[A-Za-z]{2}(?:-[A-Za-z]{2}|\\[[-\\d,]+\\])?";
    const dayRe = new RegExp("^((?:" + DAY_ATOM + ")(?:," + DAY_ATOM + ")*)?\\s*(.*)$");
    return s.split(";").map((rule) => {
      rule = rule.trim();
      const m = rule.match(dayRe);
      let days = (m[1] || "").split(/,(?![-\d,]*\])/).filter(Boolean)
        .map(humanDayToken).join(", ");
      let times = m[2] || "";
      if (/^(off|closed)$/i.test(times)) times = t("closed");
      else times = times.split(",").map((r) => r.split("-").map(fmtTime).join(" " + t("to") + " ")).join(" " + t("and") + " ");
      return [days, times].filter(Boolean).join(" ");
    }).join("; ");
  } catch (e) {
    return s;
  }
}

/* ---------- safe DOM helpers (textContent only) ---------- */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function telLink(phone) {
  const digits = String(phone).replace(/\D+/g, "");
  if (digits.length !== 10 && !(digits.length === 11 && digits.startsWith("1"))) return null;
  const a = el("a", "phone", phone);
  a.href = "tel:+1" + (digits.length === 11 ? digits.slice(1) : digits);
  return a;
}

function webLink(url) {
  try {
    const u = new URL(String(url));
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    const a = el("a", "website", u.hostname.replace(/^www\./, ""));
    a.href = u.href;
    a.rel = "noopener noreferrer";
    a.target = "_blank";
    return a;
  } catch (e) {
    return null;
  }
}

function buildCorrectionLink(svc) {
  if (!CONFIG.correctionEmail) return null;
  const a = el("a", "correction", t("reportCorrection"));
  a.href = "mailto:" + encodeURIComponent(CONFIG.correctionEmail) +
    "?subject=" + encodeURIComponent(`Correction: ${svc.name} [${svc.service_id || "?"}]`);
  return a;
}

/* ---------- state ---------- */

let services = [];          // [{...attributes, objectId, hasPoint, state}]
const categoryLayerViews = {}; // {food: LayerView, housing: LayerView, mental_health: LayerView}
let mapView = null;
const activeCategories = new Set(["food", "housing", "mental_health"]);
let hideClosed = false;
let searchTerms = []; // lowercased words; every word must match somewhere
let sortMode = "open"; // "open" (open now, then unknown, then closed) | "alpha"

/* The description in the reader's language. Falls back to English whenever the
 * Spanish translation is missing (services_desc_es is NULL until the promotion
 * step translates a row), so an untranslated record shows English rather than
 * a blank card — the same fail-open rule the hours logic follows. */
function describe(svc) {
  return (i18next.language === "es" && svc.services_desc_es) || svc.services_desc;
}

function matchesSearch(svc) {
  if (!searchTerms.length) return true;
  // Both languages are always searched, regardless of the UI language, so
  // "comida" and "food" each find the record whichever way the page is set.
  const hay = [svc.name, svc.services_desc, svc.services_desc_es, svc.address]
    .filter(Boolean).join(" ").toLowerCase();
  return searchTerms.every((t) => hay.includes(t));
}

/* ---------- rendering ---------- */

function visibleServices() {
  return services.filter((s) => {
    if (!activeCategories.has(s.category)) return false;
    if (hideClosed && s.state === "closed") return false; // "unknown" stays
    if (!matchesSearch(s)) return false;
    return true;
  });
}

const STATE_RANK = { open: 0, unknown: 1, closed: 2 };

function renderCards() {
  const wrap = document.getElementById("cards");
  wrap.replaceChildren();
  // "open" mode: open first, then unknown, then closed; alphabetical within
  // each group. "alpha" mode: pure A-Z, ignoring open/closed state.
  const visible = visibleServices().sort((a, b) =>
    (sortMode === "alpha" ? 0 : STATE_RANK[a.state] - STATE_RANK[b.state]) ||
    String(a.name).localeCompare(String(b.name)));

  const status = document.getElementById("status");
  status.textContent = visible.length
    ? t("countShown", { count: visible.length })
    : t("noMatch");

  for (const svc of visible) {
    const card = el("article", "card cat-" + svc.category);
    card.dataset.objectId = svc.objectId ?? "";
    card.setAttribute("aria-label", svc.name);

    const head = el("div", "card-head");
    head.appendChild(el("h2", "name", svc.name));
    const badge = el("span", "badge badge-" + svc.state, t("badge." + svc.state));
    head.appendChild(badge);
    card.appendChild(head);

    card.appendChild(el("p", "category-line",
      t("cat." + svc.category, { defaultValue: svc.category }) +
      (svc.eligibility_cost === "free" ? " · " + t("free")
        : svc.eligibility_cost === "sliding_scale" ? " · " + t("slidingScale") : "")));

    if (svc.is_confidential) {
      card.appendChild(el("p", "confidential-note", t("confidentialNote")));
    } else if (svc.address) {
      card.appendChild(el("p", "address", svc.address));
    }

    const desc = describe(svc);
    if (desc) card.appendChild(el("p", "desc", desc));
    // 24/7 already reads "Open now" from the badge above; a second line
    // saying "Open 24 hours, every day" is a redundant restatement.
    if (String(svc.hours_osm || "").trim() !== "24/7") {
      card.appendChild(el("p", "hours", humanHours(svc.hours_osm)));
    }

    const links = el("p", "links");
    if (svc.phone) { const t = telLink(svc.phone); if (t) links.appendChild(t); }
    if (svc.website) { const w = webLink(svc.website); if (w) links.appendChild(w); }
    const corr = buildCorrectionLink(svc);
    if (corr) links.appendChild(corr);
    if (links.childNodes.length) card.appendChild(links);

    if (svc.last_verified) {
      // ArcGIS dates are epoch ms at UTC midnight; format in UTC so the
      // calendar date doesn't shift back a day for US visitors.
      card.appendChild(el("p", "verified",
        t("lastVerified", { date: new Date(svc.last_verified).toLocaleDateString(localeTag(),
          { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }) })));
    }

    if (svc.hasPoint) {
      card.tabIndex = 0;
      card.addEventListener("click", () => zoomTo(svc));
      card.addEventListener("keydown", (ev) => { if (ev.key === "Enter") zoomTo(svc); });
    }
    wrap.appendChild(card);
  }
}

function zoomTo(svc) {
  if (mapView && svc.geometry) {
    mapView.goTo({ target: svc.geometry, zoom: Math.max(mapView.zoom, 13) });
  }
}

function applyMapFilter() {
  const visible = visibleServices();
  for (const cat of Object.keys(categoryLayerViews)) {
    const lv = categoryLayerViews[cat];
    if (!lv) continue;
    const ids = visible.filter((s) => s.hasPoint && s.category === cat).map((s) => s.objectId);
    lv.filter = { objectIds: ids.length ? ids : [-1] };
  }
}

function refresh() {
  for (const svc of services) svc.state = openState(svc.hours_osm);
  renderCards();
  applyMapFilter();
}

/* ---------- wiring ---------- */

// Mobile bottom-sheet toggle: collapsed by default (map gets most of the
// screen), tap to reveal the actual list. Inert on desktop — the CSS at the
// 900px breakpoint forces .list-content visible and hides this button
// regardless of the class, so toggling it there has no visual effect.
const sheetToggle = document.getElementById("sheetToggle");
const sheetHint = sheetToggle.querySelector(".sheet-toggle-hint");
sheetToggle.addEventListener("click", () => {
  const expanded = sheetToggle.getAttribute("aria-expanded") === "true";
  sheetToggle.setAttribute("aria-expanded", String(!expanded));
  document.querySelector("main").classList.toggle("sheet-expanded", !expanded);
  sheetHint.textContent = expanded ? t("sheetHint") : t("tapCollapse");
});

// Mobile-only search/filters drawer — same collapsed-by-default idea as the
// bottom sheet above, so the intro stack stays short and the map is visible
// without scrolling on load. Inert on desktop (900px breakpoint forces it
// open and hides this button regardless of the class).
const controlsToggle = document.getElementById("controlsToggle");
const controlsHint = controlsToggle.querySelector(".controls-toggle-hint");
controlsToggle.addEventListener("click", () => {
  const expanded = controlsToggle.getAttribute("aria-expanded") === "true";
  controlsToggle.setAttribute("aria-expanded", String(!expanded));
  controlsToggle.closest(".controls").classList.toggle("expanded", !expanded);
  controlsHint.textContent = expanded ? t("tapExpand") : t("tapCollapse");
});

/* ---------- i18n application + language switch ---------- */

// Re-apply each collapse/expand hint in the current language, reading the
// toggle's current state (so a mid-session language switch is correct).
function refreshToggleHints() {
  const sheetExpanded = sheetToggle.getAttribute("aria-expanded") === "true";
  sheetHint.textContent = sheetExpanded ? t("tapCollapse") : t("sheetHint");
  const ctrlExpanded = controlsToggle.getAttribute("aria-expanded") === "true";
  controlsHint.textContent = ctrlExpanded ? t("tapCollapse") : t("tapExpand");
}

// Set all static UI text from the translation table. [data-i18n] -> textContent,
// [data-i18n-ph] -> placeholder, [data-i18n-aria] -> aria-label (screen-reader
// landmarks), [data-i18n-content] -> content (the <meta> description).
// Dynamic content (cards) is redrawn separately.
function applyStaticI18n() {
  document.documentElement.lang = localeTag();
  document.title = t("docTitle");
  document.querySelectorAll("[data-i18n]").forEach((n) => {
    n.textContent = t(n.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-ph]").forEach((n) => {
    n.setAttribute("placeholder", t(n.dataset.i18nPh));
  });
  document.querySelectorAll("[data-i18n-aria]").forEach((n) => {
    n.setAttribute("aria-label", t(n.dataset.i18nAria));
  });
  document.querySelectorAll("[data-i18n-content]").forEach((n) => {
    n.setAttribute("content", t(n.dataset.i18nContent));
  });
  refreshToggleHints();
  document.querySelectorAll(".lang-btn").forEach((b) => {
    const on = b.dataset.lang === i18next.language;
    b.classList.toggle("is-on", on);
    b.setAttribute("aria-pressed", String(on));
  });
}

function setLanguage(lng) {
  i18next.changeLanguage(lng, () => {
    localStorage.setItem("hs-lang", lng);
    applyStaticI18n();
    if (services.length) renderCards(); // redraw badges/hours/status in the new language
  });
}

document.querySelectorAll(".lang-btn").forEach((b) => {
  b.addEventListener("click", () => setLanguage(b.dataset.lang));
});

applyStaticI18n(); // apply the initial (saved / browser-detected) language

// Filter-button dots use the exact same glyphs as the map pins, so the
// legend and the map teach each other.
document.querySelectorAll(".dot[data-category]").forEach((dot) => {
  dot.style.backgroundImage = `url("${pinDataUri(dot.dataset.category, 20)}")`;
});

document.querySelectorAll(".cat-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const cat = btn.dataset.category;
    const on = !activeCategories.has(cat);
    if (on) activeCategories.add(cat); else activeCategories.delete(cat);
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", String(on));
    refresh();
  });
});

document.getElementById("hideClosed").addEventListener("change", (ev) => {
  hideClosed = ev.target.checked;
  refresh();
});

document.getElementById("searchInput").addEventListener("input", (ev) => {
  searchTerms = ev.target.value.toLowerCase().split(/\s+/).filter(Boolean);
  refresh();
});

document.getElementById("sortSelect").addEventListener("change", (ev) => {
  sortMode = ev.target.value;
  renderCards();
});

/* ---------- map + data ---------- */

require([
  "esri/Map", "esri/views/MapView", "esri/layers/FeatureLayer",
], (Map, MapView, FeatureLayer) => {
  // County outlines (Kittitas + Yakima, WA) — US Census TIGERweb, the same
  // authoritative source the wrapper's geocoder already trusts for the
  // geofence. Outline only (no fill) so it never obscures the basemap or
  // service points; drawn first so it sits below everything else.
  //
  // "Drop shadow" is faked with two stacked copies of the same query: a
  // wide, soft, semi-transparent solid line UNDER a crisp thin dashed line.
  // (Real CSS-style drop-shadow isn't a thing at the vector-symbol level;
  // ArcGIS CIM symbols can approximate one, but that's untested territory
  // in this pinned SDK — two plain simple-fill/outline layers is the same
  // technique already proven reliable here, just doubled.)
  const countyUrl = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1";
  const countyWhere = "STATE='53' AND (BASENAME='Kittitas' OR BASENAME='Yakima')";
  const countyScale = { minScale: 0, maxScale: 0 }; // override TIGERweb's own scale range (see below)



  const countyLayer = new FeatureLayer({
    url: countyUrl,
    definitionExpression: countyWhere,
    outFields: ["BASENAME"],
    // TIGERweb ships this sublayer with its own minScale/maxScale (tuned for
    // its reference-map context) that suspends rendering at our normal
    // browsing zoom. 0 = no restriction, so it's always visible here.
    ...countyScale,
    renderer: {
      type: "simple",
      symbol: {
        type: "simple-fill",
        color: [51,51, 204, 0.1 ],
        outline: { color: "#7a6a56", width: 1.5},
      },
    },
    popupEnabled: false,
  });
  // CSS drop-shadow() arguments are SPACE-separated, not comma-separated —
  // commas here silently no-op the whole filter (verified live: neither the
  // original nor a comma-fixed-but-still-small value produced any visible
  // shadow). Even the space-fixed version needs a real blur/offset to read
  // reliably across the zoom range people actually browse at — 6px/6px/8px
  // was visible at zoom 14 but borderline at zoom 13, so sized up further.
  countyLayer.effect = "drop-shadow(4px 4px 12px rgba(0, 0, 0, 0.7)) brightness(1.1)";

  // A data-only layer, never added to the map: it's just the query target
  // for building the `services` array (the card list). Clustering/rendering
  // happens on the three per-category layers below instead.
  const layer = new FeatureLayer({ url: CONFIG.layerUrl, outFields: ["*"] });

  // One FeatureLayer per category (same service, filtered by
  // definitionExpression) rather than one layer with a unique-value
  // renderer. Clustering only ever combines features within a single layer,
  // so this is what keeps a cluster from mixing food/housing/mental-health
  // points -- and it lets each layer's cluster symbol just BE that
  // category's own pin glyph (scaled up) instead of a generic circle,
  // since every point already-clustered under it is guaranteed that category.
  // Cluster config per category — a factory so the same config can be
  // re-applied when clustering is toggled back on by zoom (see CLUSTER_MAX_ZOOM).
  const clusterReductionFor = (cat) => ({
    type: "cluster",
    clusterMinSize: 28, // was 26
    clusterMaxSize: 44, // was 52
    symbol: { type: "picture-marker", url: pinDataUri(cat, 44), width: "44px", height: "44px" },
  });

  const categoryLayers = {};
  Object.keys(CATEGORY_COLOR).forEach((cat) => {
    const catLayer = new FeatureLayer({
      url: CONFIG.layerUrl,
      definitionExpression: `category = '${cat}'`,
      outFields: ["*"],
      renderer: {
        type: "simple",
        symbol: { type: "picture-marker", url: pinDataUri(cat, 30), width: "30px", height: "30px" },
      },
      popupEnabled: false, // detail lives in the injection-safe cards
    });
    catLayer.featureReduction = clusterReductionFor(cat);
    categoryLayers[cat] = catLayer;
  });

  // gray-vector: a muted, low-contrast basemap so the colored/semi-
  // transparent service pins (the actual point of the map) are the visual
  // focus instead of competing with a busy streets basemap's own colors.
  const map = new Map({
    basemap: "gray-vector",
    layers: [countyLayer, ...Object.values(categoryLayers)],
  });
  mapView = new MapView({
    container: "mapView", map,
    center: CONFIG.center, zoom: CONFIG.zoom,
    constraints: { minZoom: 7 },
  });
  // Exposed for console debugging only (e.g. window.__debugView.goTo(...)).
  // No secrets here — these are just the public ArcGIS view/layer objects.
  window.__debugMap = map; window.__debugView = mapView; window.__debugCountyLayer = countyLayer;

  Object.keys(categoryLayers).forEach((cat) => {
    mapView.whenLayerView(categoryLayers[cat]).then((lv) => {
      categoryLayerViews[cat] = lv;
      applyMapFilter();
    });
  });

  // Turn clustering OFF past street level so points that clustering keeps
  // merged even when zoomed in — including providers co-located at one address
  // — separate into individual, clickable pins. Below the threshold, clustering
  // keeps the two-county overview readable. (Truly identical coordinates still
  // overlap; that would need spiderfication, tracked separately.)
  const CLUSTER_MAX_ZOOM = 15;
  const applyClusterForZoom = () => {
    const clustered = mapView.zoom <= CLUSTER_MAX_ZOOM;
    Object.entries(categoryLayers).forEach(([cat, lyr]) => {
      if (clustered && !lyr.featureReduction) {
        lyr.featureReduction = clusterReductionFor(cat);
      } else if (!clustered && lyr.featureReduction) {
        lyr.featureReduction = null;
      }
    });
  };
  mapView.watch("zoom", applyClusterForZoom);

  // Tap a pin -> scroll to and highlight its card. Tapping a CLUSTER can't map
  // to a single card (a cluster graphic is an aggregate with no feature
  // OBJECTID), so drill in to expand it instead — the next tap lands on an
  // individual pin. Without this, tapping any clustered pin (common for the
  // dense food category) silently did nothing.
  mapView.on("click", async (event) => {
    const hit = await mapView.hitTest(event, { include: Object.values(categoryLayers) });
    const g = hit.results.find((r) => r.graphic && r.graphic.attributes);
    if (!g) return;
    const graphic = g.graphic;
    if (graphic.isAggregate) {
      mapView.goTo({ target: graphic.geometry, zoom: mapView.zoom + 2 }).catch(() => {});
      return;
    }
    const oid = graphic.attributes[graphic.layer.objectIdField];
    const card = document.querySelector(`.card[data-object-id="${oid}"]`);
    if (card) {
      card.scrollIntoView({ behavior: "smooth", block: "nearest" });
      card.classList.add("is-highlighted");
      setTimeout(() => card.classList.remove("is-highlighted"), 2000);
    }
  });

  // Dev-mode watchdog: while the view is shared privately, the query waits on
  // an ArcGIS sign-in. Explain the hang instead of showing "Loading…" forever.
  // Harmless at launch (the public view resolves long before this fires).
  let dataLoaded = false; // language-agnostic (status text may be translated)
  const loadingWatchdog = setTimeout(() => {
    if (!dataLoaded) document.getElementById("status").textContent = t("loadingSlow");
  }, 15000);

  // One query for everything (small dataset): confidential rows have no
  // geometry and simply arrive point-less; they render as phone-only cards.
  layer.queryFeatures({
    where: "status = 'active'",
    outFields: ["*"],
    returnGeometry: true,
  }).then((result) => {
    clearTimeout(loadingWatchdog);
    dataLoaded = true;
    services = result.features.map((f) => ({
      ...f.attributes,
      objectId: f.attributes[layer.objectIdField],
      geometry: f.geometry,
      hasPoint: !!f.geometry && !f.attributes.is_confidential,
      state: "unknown",
    }));
    refresh();
    setInterval(refresh, CONFIG.refreshSeconds * 1000);
  }).catch((err) => {
    clearTimeout(loadingWatchdog);
    dataLoaded = true;
    document.getElementById("status").textContent = t("loadError");
    console.error("query failed:", err);
  });
});
