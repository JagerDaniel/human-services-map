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
  zoom: 8,
  refreshSeconds: 60, // re-evaluate open/closed badges this often
};

const CATEGORY_LABEL = {
  food: "Food",
  housing: "Housing",
  mental_health: "Mental health",
};
const CATEGORY_COLOR = {
  food: "#2e7d32",
  housing: "#ef6c00",
  mental_health: "#6a1b9a",
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

const DAY_NAMES = { Mo: "Mon", Tu: "Tue", We: "Wed", Th: "Thu", Fr: "Fri", Sa: "Sat", Su: "Sun", PH: "holidays" };

function fmtTime(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const am = h < 12;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${am ? "AM" : "PM"}`;
}

function ordinal(n) {
  if (n === -1) return "last";
  return { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th", 5: "5th" }[n] || n + "th";
}

/* One day token: "Mo", "Mo-Fr", or "Th[2,4]" (nth weekday of the month). */
function humanDayToken(token) {
  const nth = token.match(/^([A-Za-z]{2})\[([-\d,]+)\]$/);
  if (nth) {
    const day = DAY_NAMES[nth[1]] || nth[1];
    const ords = nth[2].split(",").map((x) => ordinal(parseInt(x, 10)));
    return ords.join(" & ") + " " + day;
  }
  return token.split("-").map((x) => DAY_NAMES[x] || x).join("–");
}

function humanHours(hoursOsm) {
  if (!hoursOsm || !String(hoursOsm).trim()) return "Hours unknown — call to check";
  const s = String(hoursOsm).trim();
  if (s === "24/7") return "Open 24 hours, every day";
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
      if (/^(off|closed)$/i.test(times)) times = "closed";
      else times = times.split(",").map((r) => r.split("-").map(fmtTime).join(" to ")).join(" and ");
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
  const a = el("a", "correction", "Report a correction");
  a.href = "mailto:" + encodeURIComponent(CONFIG.correctionEmail) +
    "?subject=" + encodeURIComponent(`Correction: ${svc.name} [${svc.service_id || "?"}]`);
  return a;
}

/* ---------- state ---------- */

let services = [];          // [{...attributes, objectId, hasPoint, state}]
let layerView = null;
let mapView = null;
const activeCategories = new Set(["food", "housing", "mental_health"]);
let hideClosed = false;
let searchTerms = []; // lowercased words; every word must match somewhere

function matchesSearch(svc) {
  if (!searchTerms.length) return true;
  const hay = [svc.name, svc.services_desc, svc.address]
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
  // Open first, then unknown, then closed; alphabetical within each group.
  const visible = visibleServices().sort((a, b) =>
    (STATE_RANK[a.state] - STATE_RANK[b.state]) ||
    String(a.name).localeCompare(String(b.name)));

  const status = document.getElementById("status");
  status.textContent = visible.length
    ? `${visible.length} service${visible.length === 1 ? "" : "s"} shown`
    : "No services match the current filters.";

  for (const svc of visible) {
    const card = el("article", "card cat-" + svc.category);
    card.dataset.objectId = svc.objectId ?? "";
    card.setAttribute("aria-label", svc.name);

    const head = el("div", "card-head");
    head.appendChild(el("h2", "name", svc.name));
    const badge = el("span", "badge badge-" + svc.state,
      svc.state === "open" ? "Open now" : svc.state === "closed" ? "Closed now" : "Hours unknown");
    head.appendChild(badge);
    card.appendChild(head);

    card.appendChild(el("p", "category-line",
      CATEGORY_LABEL[svc.category] +
      (svc.eligibility_cost === "free" ? " · Free"
        : svc.eligibility_cost === "sliding_scale" ? " · Sliding-scale cost" : "")));

    if (svc.is_confidential) {
      card.appendChild(el("p", "confidential-note",
        "Confidential location — call for help. No address is shown for safety."));
    } else if (svc.address) {
      card.appendChild(el("p", "address", svc.address));
    }

    if (svc.services_desc) card.appendChild(el("p", "desc", svc.services_desc));
    card.appendChild(el("p", "hours", humanHours(svc.hours_osm)));

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
        "Last verified " + new Date(svc.last_verified).toLocaleDateString("en-US",
          { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" })));
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
  if (!layerView) return;
  const ids = visibleServices().filter((s) => s.hasPoint).map((s) => s.objectId);
  layerView.filter = { objectIds: ids.length ? ids : [-1] };
}

function refresh() {
  for (const svc of services) svc.state = openState(svc.hours_osm);
  renderCards();
  applyMapFilter();
}

/* ---------- wiring ---------- */

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

/* ---------- map + data ---------- */

require([
  "esri/Map", "esri/views/MapView", "esri/layers/FeatureLayer",
], (Map, MapView, FeatureLayer) => {
  // County outlines (Kittitas + Yakima, WA) — US Census TIGERweb, the same
  // authoritative source the wrapper's geocoder already trusts for the
  // geofence. Outline only (no fill) so it never obscures the basemap or
  // service points; drawn first so it sits below everything else.
  const countyLayer = new FeatureLayer({
    url: "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1",
    definitionExpression: "STATE='53' AND (BASENAME='Kittitas' OR BASENAME='Yakima')",
    outFields: ["BASENAME"],
    // TIGERweb ships this sublayer with its own minScale/maxScale (tuned for
    // its reference-map context) that suspends rendering at our normal
    // browsing zoom. 0 = no restriction, so it's always visible here.
    minScale: 0,
    maxScale: 0,
    renderer: {
      type: "simple",
      symbol: {
        type: "simple-fill",
        color: [0, 0, 0, 0],
        outline: { color: "#5f6368", width: 1.5, style: "short-dash" },
      },
    },
    popupEnabled: false,
  });

  const layer = new FeatureLayer({
    url: CONFIG.layerUrl,
    outFields: ["*"],
    renderer: {
      type: "unique-value",
      field: "category",
      uniqueValueInfos: Object.keys(CATEGORY_COLOR).map((value) => ({
        value,
        symbol: { type: "picture-marker", url: pinDataUri(value, 30), width: "30px", height: "30px" },
      })),
    },
    popupEnabled: false, // detail lives in the injection-safe cards
  });

  const map = new Map({ basemap: "streets-navigation-vector", layers: [countyLayer, layer] });
  mapView = new MapView({
    container: "mapView", map,
    center: CONFIG.center, zoom: CONFIG.zoom,
    constraints: { minZoom: 7 },
  });
  // Exposed for console debugging only (e.g. window.__debugView.goTo(...)).
  // No secrets here — these are just the public ArcGIS view/layer objects.
  window.__debugMap = map; window.__debugView = mapView; window.__debugCountyLayer = countyLayer;

  mapView.whenLayerView(layer).then((lv) => { layerView = lv; applyMapFilter(); });

  // Tap a point -> scroll to and highlight its card.
  mapView.on("click", async (event) => {
    const hit = await mapView.hitTest(event, { include: layer });
    const g = hit.results.find((r) => r.graphic && r.graphic.attributes);
    if (!g) return;
    const oid = g.graphic.attributes[layer.objectIdField];
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
  const loadingWatchdog = setTimeout(() => {
    const status = document.getElementById("status");
    if (status.textContent.startsWith("Loading")) {
      status.textContent =
        "Still loading… If you are developing against the private view, " +
        "complete the ArcGIS sign-in prompt (the public site will not ask).";
    }
  }, 15000);

  // One query for everything (small dataset): confidential rows have no
  // geometry and simply arrive point-less; they render as phone-only cards.
  layer.queryFeatures({
    where: "status = 'active'",
    outFields: ["*"],
    returnGeometry: true,
  }).then((result) => {
    clearTimeout(loadingWatchdog);
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
    document.getElementById("status").textContent =
      "Could not load services. Please try again later.";
    console.error("query failed:", err);
  });
});
