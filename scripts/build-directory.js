/**
 * Single source of truth for branch data + page generation.
 *
 * Run:  node scripts/build-directory.js
 *
 * 1. Injects the branch markers JSON into the <script id="fc-map-data">
 *    tag inside both index.html and locations.html (consumed by Leaflet
 *    at runtime to plot pins + popups).
 * 2. Rebuilds the state-grouped branch directory section in
 *    locations.html.
 * 3. Updates the "Showing N of N" count.
 *
 * Branch list comes from reference/branch_master_file.xlsx (locked
 * 2026-05-11). lat/lng are approximate city centroids — accurate enough
 * for a country-level map view; zoom in for street detail (the addresses
 * are exact).
 */

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

/* ===========================================================
   Branch data — keep alphabetical by state, then by brand.
   =========================================================== */
const branches = [
  // Georgia
  { brand: "C2H",                       city: "Lawrenceville",  state: "GA", addr: "1625 Lakes Parkway, Suite H, Lawrenceville, GA 30043", url: "https://c2h.com/",                                      phone: "(678) 837-3224", lat: 33.9562, lng: -83.9879 },
  { brand: "Conditioned Air",           city: "Macon",          state: "GA", addr: "241 South Street, Macon, GA 31206",                    url: "https://www.conditionedairinc.com/",                    phone: null,             lat: 32.8407, lng: -83.6324 },
  { brand: "Starr",                     city: "Macon",          state: "GA", addr: "539 Bartlett Street, Macon, GA 31204",                 url: "https://www.starrelectric.biz/",                        phone: null,             lat: 32.8430, lng: -83.6190 },
  { brand: "Timco",                     city: "Buford",         state: "GA", addr: "5309 Palmero Court, Suite 200, Buford, GA 30518",      url: "https://timcoair.com/",                                 phone: null,             lat: 34.1209, lng: -83.9889 },

  // Ohio
  { brand: "CLS Facility Services",     city: "Mentor",         state: "OH", addr: "8061 Tyler Boulevard, Mentor, OH 44060",               url: "https://clsfacilityservices.com/",                      phone: null,             lat: 41.6661, lng: -81.3396 },
  { brand: "Comfortrol",                city: "Columbus",       state: "OH", addr: "3155 Lamb Avenue, Columbus, OH 43219",                 url: "https://www.comfortrol.com/",                           phone: null,             lat: 39.9842, lng: -82.9381 },

  // North Carolina
  { brand: "Charlotte Temp Controls",   city: "Charlotte",      state: "NC", addr: "1705-A Orr Industrial Court, Charlotte, NC 28213",     url: "https://ctccontrols.com/",                              phone: null,             lat: 35.2811, lng: -80.7833 },
  { brand: "R&W Mechanical",            city: "Asheville",      state: "NC", addr: "90 London Road, Asheville, NC 28803",                  url: "https://rw-mechanical.com/",                            phone: null,             lat: 35.5563, lng: -82.5408 },
  { brand: "STR Mechanical",            city: "Charlotte",      state: "NC", addr: "11704 Reames Road, Charlotte, NC 28269",               url: "https://strmechanical.com/",                            phone: null,             lat: 35.3470, lng: -80.8460 },
  { brand: "STR Mechanical — Raleigh",  city: "Raleigh",        state: "NC", addr: "551 C Pylon Drive, Suite C, Raleigh, NC 27606",        url: "https://strmechanical.com/",                            phone: null,             lat: 35.7926, lng: -78.7036 },

  // Texas
  { brand: "FirstCall Mechanical — DFW",    city: "Carrollton", state: "TX", addr: "1750 Briercroft Court, Suite 128, Carrollton, TX 75006", url: "https://firstcallmechanical.com/dfw",                 phone: "(469) 669-0978", lat: 32.9537, lng: -96.8903 },
  { brand: "FirstCall Mechanical — Austin", city: "Austin",     state: "TX", addr: "10421 Old Manchaca Road, Suite 410, Austin, TX 78748",   url: "https://firstcallmechanical.com/central-texas",       phone: null,             lat: 30.1763, lng: -97.8362 },

  // New York
  { brand: "ICACS (Industrial Cooling)", city: "Freeport",      state: "NY", addr: "83 Hampton Road, Freeport, NY 11520",                   url: "https://www.industrialcoolinginc.com/welcome.php",   phone: null,             lat: 40.6576, lng: -73.5832 },
  { brand: "KATS Solutions",             city: "Wellsville",    state: "NY", addr: "37 Coats Street, Wellsville, NY 14895",                 url: "https://kats.pro/",                                   phone: null,             lat: 42.1223, lng: -77.9483 },
  { brand: "Select Environmental",       city: "West Babylon",  state: "NY", addr: "210 Dale Street, West Babylon, NY 11704",               url: "https://www.selectenv.com/",                          phone: null,             lat: 40.7104, lng: -73.3565 },

  // Florida
  { brand: "Kenyon & Partners",          city: "Tampa",         state: "FL", addr: "3203 Queen Palm Drive, Tampa, FL 33619",        url: "https://kenyonandpartners.com/",                              phone: null,             lat: 27.9506, lng: -82.4067 },
  { brand: "KPI Engineering",            city: "Tampa",         state: "FL", addr: "3203 Queen Palm Drive, Tampa, FL 33619",        url: "https://kpiengineering.com/",                                 phone: null,             lat: 27.9506, lng: -82.4067 },
  { brand: "Mecon",                      city: "Clearwater",    state: "FL", addr: "4181 116th Terrace N, Clearwater, FL 33762",    url: "https://www.meconinc.com/",                                   phone: null,             lat: 27.9099, lng: -82.7155 },

  // Virginia
  { brand: "Starnes",                              city: "Lebanon",    state: "VA", addr: "4082 US Highway 19, Lebanon, VA 24266",            url: "https://starnesinc.com/",        phone: null,             lat: 36.9077, lng: -82.0793 },
  { brand: "STR Mechanical — Chesapeake",  city: "Chesapeake", state: "VA", addr: "825 Green Briar Circle, Suite A, Chesapeake, VA 23320", url: "https://strmechanical.com/", phone: null,             lat: 36.7682, lng: -76.2875 },

  // South Carolina
  { brand: "STR Mechanical — Greenville", city: "Liberty",      state: "SC", addr: "550 Blackbottom Road, Liberty, SC 29657",       url: "https://strmechanical.com/",                                phone: null,             lat: 34.7873, lng: -82.6943 },

  // Massachusetts
  { brand: "LC Anderson",                 city: "Boston",       state: "MA", addr: "15 Soldiers Field Place, Boston, MA 02135",     url: "https://www.lc-anderson.com/",                              phone: null,             lat: 42.3601, lng: -71.0589 },

  // Louisiana
  { brand: "Optimum Air Solutions",       city: "Belle Chasse", state: "LA", addr: "127 Keating Drive, Belle Chasse, LA 70037",     url: "https://optimumairsolutions.com/",                          phone: null,             lat: 29.8552, lng: -89.9906 },

  // New Jersey
  { brand: "Automated Building Solutions (ABS)", city: "South Amboy", state: "NJ", addr: "PO Box 3186, South Amboy, NJ 08879",     url: "https://absautomation.com/",                                phone: null,             lat: 40.4862, lng: -74.2782 },
  { brand: "Statewide",                   city: "South Amboy",  state: "NJ", addr: "6200 Main Street, South Amboy, NJ 08879",       url: "https://www.statewideconditioninginc.com/",                 phone: null,             lat: 40.4862, lng: -74.2782 },
];

const STATE_NAMES = {
  GA: "Georgia", OH: "Ohio", NC: "North Carolina", TX: "Texas",
  NY: "New York", FL: "Florida", VA: "Virginia", SC: "South Carolina",
  MA: "Massachusetts", LA: "Louisiana", NJ: "New Jersey",
};
const STATE_ORDER = ["GA", "OH", "NC", "TX", "NY", "FL", "VA", "SC", "MA", "LA", "NJ"];

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function ctaLabel(b) {
  if (!b.url) return "Contact branch";
  try {
    return "Visit " + new URL(b.url).hostname.replace(/^www\./, "");
  } catch {
    return "Visit website";
  }
}

function searchHaystack(b) {
  return [b.brand, b.city, b.state, STATE_NAMES[b.state] || "", b.addr]
    .join(" ").toLowerCase();
}

function cardHtml(b) {
  const hasUrl = !!b.url;
  const linkOpen  = hasUrl ? `<a class="loc-card__link" href="${esc(b.url)}" rel="noopener">` : `<span class="loc-card__link">`;
  const linkClose = hasUrl ? `</a>` : `</span>`;
  const ctaStyle  = hasUrl ? "" : ` style="color:var(--color-text-light)"`;
  return `          <article class="loc-card" data-state="${b.state}" data-loc="${esc(searchHaystack(b))}">
            <span class="loc-card__location">${esc(b.city)}, ${b.state}</span>
            <h3 class="loc-card__brand">${linkOpen}${esc(b.brand)}${linkClose}</h3>
            <p class="loc-card__addr">${esc(b.addr)}</p>
            <span class="loc-card__cta"${ctaStyle}>${esc(hasUrl ? ctaLabel(b) : "Contact branch")}</span>
          </article>`;
}

/* ===========================================================
   1. Map data JSON — injected into both pages
   =========================================================== */
const mapData = branches.map(b => ({
  brand: b.brand,
  city:  b.city,
  state: b.state,
  addr:  b.addr,
  url:   b.url,
  phone: b.phone,
  lat:   b.lat,
  lng:   b.lng,
}));

function injectMapData(html) {
  const json = JSON.stringify(mapData);
  // Pretty-print isn't important — keep one line for size
  return html.replace(
    /<script id="fc-map-data"[^>]*>[\s\S]*?<\/script>/,
    `<script id="fc-map-data" type="application/json">${json}</script>`
  );
}

/* Swap the legacy inline US-map SVG for a Leaflet container.
   Idempotent — does nothing if the SVG block isn't present (i.e. the
   container is already in place). The placeholder fc-map-data script
   gets populated by injectMapData on the same run. */
function swapSvgForLeaflet(html) {
  const re = /<svg class="map-preview__svg"[\s\S]*?<\/svg>/;
  if (!re.test(html)) return html;
  const replacement = `<div id="fc-map" data-fc-map aria-label="Interactive US map of FirstCall branch locations"></div>
          <script id="fc-map-data" type="application/json">[]</script>`;
  return html.replace(re, replacement);
}

/* ===========================================================
   2. State-grouped directory for locations.html
   =========================================================== */
function buildDirectory() {
  const byState = {};
  for (const b of branches) (byState[b.state] ||= []).push(b);

  const groups = STATE_ORDER.filter(s => byState[s]).map(s => {
    const list  = byState[s];
    const cards = list.map(cardHtml).join("\n");
    return `        <section class="state-group" data-state-group="${s}">
          <h3 class="state-group__heading">
            <span>${STATE_NAMES[s]}</span>
            <span class="state-group__count">${list.length} ${list.length === 1 ? "location" : "locations"}</span>
          </h3>
          <div class="directory__grid">
${cards}
          </div>
        </section>`;
  }).join("\n");

  return `        <div data-directory-grid>
${groups}
        </div>`;
}

/* ===========================================================
   Apply to files
   =========================================================== */
function updateFile(filePath, transforms) {
  if (!fs.existsSync(filePath)) {
    console.warn("  · not found: " + path.basename(filePath));
    return;
  }
  let html = fs.readFileSync(filePath, "utf8");
  const orig = html;
  for (const fn of transforms) html = fn(html);
  if (html === orig) {
    console.log("  · " + path.basename(filePath) + " already up to date");
    return;
  }
  fs.writeFileSync(filePath, html);
  console.log("  ✓ " + path.basename(filePath));
}

// index.html — swap SVG for Leaflet, inject map data
updateFile(path.join(root, "index.html"), [swapSvgForLeaflet, injectMapData]);

// locations.html — swap SVG for Leaflet, inject map data, rebuild directory, update count
updateFile(path.join(root, "locations.html"), [
  swapSvgForLeaflet,
  injectMapData,
  function rebuildDirectory(html) {
    const newSection = buildDirectory();
    const re = /<div data-directory-grid>[\s\S]*?<\/div>\s*\n\s*<div class="directory__empty"/;
    if (!re.test(html)) {
      console.warn("    · no <div data-directory-grid> in locations.html — skipping");
      return html;
    }
    return html.replace(re, newSection + `

        <div class="directory__empty"`);
  },
  function updateCount(html) {
    const t = branches.length;
    return html.replace(/Showing \d+ of \d+ locations/g, `Showing ${t} of ${t} locations`);
  },
]);

console.log(`✓ ${branches.length} branches across ${new Set(branches.map(b => b.state)).size} states`);
