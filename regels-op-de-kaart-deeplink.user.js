// ==UserScript==
// @name         Regels op de kaart: deeplink naar document component in document
// @namespace    tfrijsewijk
// @version      1.1.0
// @description  Toont in Regels op de kaart bij de kop van elk document component een knop die een deeplink naar dat document component kopieert, en naast de titel een knop voor een permalink naar het document.
// @match        https://document-viewer.dso.kadaster.nl/*
// @match        https://*.document-viewer.dso.kadaster.nl/*
// @grant        GM_setClipboard
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/tfrijsewijk/regels-op-de-kaart-deeplink/main/regels-op-de-kaart-deeplink.user.js
// @downloadURL  https://raw.githubusercontent.com/tfrijsewijk/regels-op-de-kaart-deeplink/main/regels-op-de-kaart-deeplink.user.js
// ==/UserScript==

"use strict";

// Pure functies, zonder DOM. De tests in test/deeplink.test.js draaien hierop.

// Het tabblad Bijlagen heeft bij STOP-documenten het pad "bijlage". Het pad "bijlagen" hoort bij IHR.
const SUPPORTED_TABS = ["regels", "toelichting", "inhoud", "bijlage"];
// Eén keer aanmaken: het script ontleedt de datum bij elk pointerover-event.
const AMSTERDAM_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Amsterdam",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const AMSTERDAM_OFFSET = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Amsterdam",
  timeZoneName: "longOffset",
});

function parseDocumentPath(pathname) {
  const match = /^\/documenten\/([^/]+)(?:\/([^/]+))?\/?$/.exec(pathname);

  if (!match || match[1] === "not-found") {
    return null;
  }

  return { documentId: match[1], tab: match[2] ?? null };
}

function parseViewerPath(pathname) {
  const path = parseDocumentPath(pathname);

  if (!path || !SUPPORTED_TABS.includes(path.tab)) {
    return null;
  }

  return path;
}

function parseHostId(hostId) {
  // IHR-documenten hebben een IMRO-id. Voor die documenten kent de viewer dit fragment niet.
  if (typeof hostId !== "string" || !hostId.startsWith("_akn_")) {
    return null;
  }

  // Een technisch id bevat geen "-". De eerste "-" scheidt dus het technische id van de eId.
  const separator = hostId.indexOf("-");

  if (separator === -1 || separator === hostId.length - 1) {
    return null;
  }

  return { documentId: hostId.slice(0, separator), eId: hostId.slice(separator + 1) };
}

function isDraftId(documentId) {
  return documentId.includes("_akn_nl_bill_");
}

function amsterdamDate(instant) {
  const parts = AMSTERDAM_DATE.formatToParts(instant);
  const part = (type) => parts.find((p) => p.type === type).value;

  return `${part("year")}-${part("month")}-${part("day")}`;
}

function amsterdamOffset(date) {
  // Om 21:00 UTC is de wissel van zomer- en wintertijd (01:00 UTC) al geweest. Dit is dus de offset aan het eind van de dag.
  const parts = AMSTERDAM_OFFSET.formatToParts(new Date(`${date}T21:00:00Z`));
  const name = parts.find((p) => p.type === "timeZoneName").value;

  return name === "GMT" ? "+00:00" : name.slice(3);
}

function parseTimeTravel(search) {
  const datum = new URLSearchParams(search).get("datum");

  if (!datum) {
    return null;
  }

  // Zelfde parsing als de viewer: een ongeldige datum betekent geen tijdreis.
  const referenceTime = new Date(datum).getTime();

  if (Number.isNaN(referenceTime)) {
    return null;
  }

  const geldigOp = amsterdamDate(new Date(referenceTime));

  // De viewer vraagt beschikbaarOp om 23:59:59 op die dag, zodat alles telt wat die dag geregistreerd is.
  return {
    referenceTime,
    geldigOp,
    beschikbaarOp: `${geldigOp}T23:59:59${amsterdamOffset(geldigOp)}`,
  };
}

function documentRequestUrl(viewerOrigin, documentId, timeTravel) {
  const params = timeTravel
    ? { beschikbaarOp: timeTravel.beschikbaarOp, geldigOp: timeTravel.geldigOp }
    : { synchroniseerMetTileset: "Actueel" };

  return `${viewerOrigin}/bff/ois/ontsluiten/v2/documenten/${encodeURIComponent(documentId)}?${new URLSearchParams(params)}`;
}

function laterDate(a, b) {
  return a > b ? a : b;
}

function versionStartDate(version) {
  if (!version || !version.geldigVanaf || !version.beschikbaarVanaf) {
    return null;
  }

  return laterDate(version.geldigVanaf, amsterdamDate(new Date(version.beschikbaarVanaf)));
}

function isGeldend(version, referenceTime) {
  return (
    new Date(version.geldigVanaf).getTime() <= referenceTime &&
    (!version.geldigTot || new Date(version.geldigTot).getTime() > referenceTime)
  );
}

function determineLinkDate({ pathDocumentId, componentDocumentId, oisDocument, timeTravel, now }) {
  if (isDraftId(pathDocumentId) || isDraftId(componentDocumentId)) {
    return null;
  }

  const documentStart = versionStartDate(oisDocument);

  if (!documentStart) {
    // Zonder versiegegevens toont de tijdreisdatum zelf nog steeds dezelfde versie.
    return timeTravel ? timeTravel.geldigOp : null;
  }

  if (componentDocumentId === oisDocument.uriIdentificatie) {
    return documentStart;
  }

  // Voorbeschermingsregels zijn tijdelijke regelingdelen van het document in het pad. OIS kent ze niet als eigen
  // document. De link moet een datum krijgen waarop ook die versie van het tijdelijke deel getoond wordt.
  const referenceTime = timeTravel ? timeTravel.referenceTime : now;
  const delen = oisDocument.omgevingsdocumentMetadata?.gerelateerdeTijdelijkeRegelingdelen ?? [];
  const deel = delen.find((v) => v.uriIdentificatie === componentDocumentId && isGeldend(v, referenceTime));
  const deelStart = versionStartDate(deel);

  return deelStart ? laterDate(documentStart, deelStart) : documentStart;
}

function buildDeeplink({ portalOrigin, pathDocumentId, tab, date, componentDocumentId, eId }) {
  const query = date ? `?datum=${date}` : "";

  return `${portalOrigin}/regels-op-de-kaart/documenten/${pathDocumentId}/${tab}${query}#${componentDocumentId},${eId}`;
}

function buildPermalink({ portalOrigin, pathDocumentId, oisDocument }) {
  // Elk portaal heeft een eigen resolver: resolver.omgevingswet.overheid.nl, resolver.pre.omgevingswet.overheid.nl.
  const portal = new URL(portalOrigin);
  const resolver = `${portal.protocol}//resolver.${portal.host}/viewer/document`;

  // Een expressionId legt de getoonde versie vast, net als de datum in een deeplink. Een ontwerp, besluitversie of
  // IHR-plan heeft al een eigen technisch id per versie. De resolver herkent een ontwerp alleen aan dat technische id.
  const expressionId =
    pathDocumentId.startsWith("_akn_") && !isDraftId(pathDocumentId)
      ? oisDocument?.omgevingsdocumentMetadata?.expressionId
      : null;

  // Zonder encoding, zoals in de documentatie van de resolver: de resolver accepteert het en de link blijft leesbaar.
  return expressionId ? `${resolver}?expressionId=${expressionId}` : `${resolver}?documentId=${pathDocumentId}`;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    buildDeeplink,
    buildPermalink,
    determineLinkDate,
    documentRequestUrl,
    parseDocumentPath,
    parseHostId,
    parseTimeTravel,
    parseViewerPath,
    versionStartDate,
  };
}

// DOM

const WRAPPER_CLASS = "userscript-deeplink";
const INNER_CLASS = "userscript-deeplink-inner";
const STATUS_CLASS = "userscript-deeplink-status";
const STYLE_CLASS = "userscript-deeplink-style";
const HEADING_SELECTOR = ".heading-container > .heading > :is(h2, h3, h4, h5, h6, [role='heading'])";
const TITLE_CONTAINER = "dsov-document-header .dso-document-header.title";
const COMPONENT_STATES = {
  idle: { icon: "copy-outline", label: "Kopieer link naar dit onderdeel" },
  copied: { icon: "check", label: "Link gekopieerd" },
};
const DOCUMENT_STATES = {
  idle: { icon: "internet", label: "Kopieer permalink naar dit document" },
  copied: { icon: "check", label: "Permalink gekopieerd" },
};
const COPIED_DURATION = 2000;
const FADE_DURATION = 200;

// Verborgen neemt de knop geen ruimte in. Anders verspringt de kop bij elke injectie, en die gebeurt al bij hover over
// de inhoud van een component. Een kolom van 0fr of 1fr geeft breedte 0 of die van de knop, zonder vaste maat.
function wrapperStyle(container) {
  const visible = `${container}:is(:hover, :focus-within) .${WRAPPER_CLASS}`;

  return `
.${WRAPPER_CLASS} {
  display: grid;
  grid-template-columns: 0fr;
  flex-shrink: 0;
  /* Heft de gap van 8px voor de knop op zolang de knop verborgen is. */
  margin-inline-start: -8px;
  opacity: 0;
  pointer-events: none;
  /* Bij verdwijnen klapt de ruimte pas dicht als de knop onzichtbaar is. */
  transition:
    opacity ${FADE_DURATION}ms ease-out,
    grid-template-columns 0s ${FADE_DURATION}ms,
    margin-inline-start 0s ${FADE_DURATION}ms;
}

/* Zonder min-inline-size: 0 kan de kolom niet smaller worden dan de knop. */
.${INNER_CLASS} {
  display: flex;
  min-inline-size: 0;
}

.${WRAPPER_CLASS} dso-icon-button {
  /* Dezelfde private custom properties die het document component zelf voor zijn knoppen gebruikt. De header van de
     titel heeft een grijze achtergrond en zet de hover-kleur daarom op grijs. */
  --_dso-icon-button-tertiary-color: #275937;
  --_dso-icon-button-tertiary-hover-color: #275937;
}

${visible} {
  grid-template-columns: 1fr;
  margin-inline-start: 0;
  opacity: 1;
  pointer-events: auto;
  transition: opacity ${FADE_DURATION}ms ease-out;
}

/* Een knop die bij hover wordt geïnjecteerd, vaagt ook de eerste keer in. */
@starting-style {
  ${visible} {
    opacity: 0;
  }
}

.${STATUS_CLASS} {
  position: absolute;
  inline-size: 1px;
  block-size: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
`;
}

const COMPONENT_STYLE = wrapperStyle(".heading-container");

const DOCUMENT_STYLE = `
/* Naast de titel in plaats van eronder. */
${TITLE_CONTAINER}:has(> .${WRAPPER_CLASS}) {
  display: flex;
  align-items: center;
  gap: 8px;
}

${TITLE_CONTAINER}:has(> .${WRAPPER_CLASS}) > h1 {
  min-inline-size: 0;
}

/* In de sticky header vult de titel de breedte, zodat het pijltje naar boven rechts blijft staan. */
${TITLE_CONTAINER}.dso-document-header-sticky:has(> .${WRAPPER_CLASS}) > h1 {
  flex-grow: 1;
}
${wrapperStyle(TITLE_CONTAINER)}`;

const oisDocuments = new Map();
const hostsWithListeners = new WeakSet();
const resetTimers = new WeakMap();
let portalOrigin = null;
let documentWrapper = null;

function findPortalOrigin() {
  const ancestors = location.ancestorOrigins;

  if (ancestors && ancestors.length > 0 && ancestors[0] !== "null") {
    return ancestors[0];
  }

  // Firefox kent geen ancestorOrigins.
  if (window.self === window.top || !document.referrer) {
    return null;
  }

  try {
    return new URL(document.referrer).origin;
  } catch {
    return null;
  }
}

function currentPage() {
  const path = parseDocumentPath(location.pathname);

  if (!path) {
    return null;
  }

  return { ...path, timeTravel: parseTimeTravel(location.search) };
}

function loadOisDocument(page) {
  // Alleen van een vastgestelde STOP-regeling hebben de links de versiegegevens nodig.
  if (!page.documentId.startsWith("_akn_") || isDraftId(page.documentId)) {
    return Promise.resolve(null);
  }

  const key = `${page.documentId}|${page.timeTravel ? page.timeTravel.geldigOp : ""}`;
  let request = oisDocuments.get(key);

  if (!request) {
    request = fetch(documentRequestUrl(location.origin, page.documentId, page.timeTravel), {
      headers: { Accept: "application/hal+json" },
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        return response.json();
      })
      .catch((error) => {
        // Bij de volgende injectie opnieuw proberen, in plaats van de fout te onthouden.
        oisDocuments.delete(key);
        console.warn("[deeplink] Versiegegevens niet opgehaald:", error);

        return null;
      });
    oisDocuments.set(key, request);
  }

  return request;
}

function setButtonState(button, state) {
  // Attributen en geen properties: met @grant draait het script in een eigen JavaScript-omgeving, waar de properties
  // van het custom element niet zichtbaar zijn.
  button.setAttribute("icon", state.icon);
  button.setAttribute("label", state.label);
}

function showCopied(button, status, states) {
  clearTimeout(resetTimers.get(button));
  setButtonState(button, states.copied);
  status.textContent = states.copied.label;
  resetTimers.set(
    button,
    setTimeout(() => {
      setButtonState(button, states.idle);
      status.textContent = "";
    }, COPIED_DURATION),
  );
}

async function componentLink(host) {
  const page = currentPage();
  const target = parseHostId(host.id);

  if (!page || !SUPPORTED_TABS.includes(page.tab) || !target) {
    return null;
  }

  const oisDocument = await loadOisDocument(page);
  const date = determineLinkDate({
    pathDocumentId: page.documentId,
    componentDocumentId: target.documentId,
    oisDocument,
    timeTravel: page.timeTravel,
    now: Date.now(),
  });

  return buildDeeplink({
    portalOrigin,
    pathDocumentId: page.documentId,
    tab: page.tab,
    date,
    componentDocumentId: target.documentId,
    eId: target.eId,
  });
}

async function documentLink() {
  const page = currentPage();

  if (!page) {
    return null;
  }

  const oisDocument = await loadOisDocument(page);

  return buildPermalink({ portalOrigin, pathDocumentId: page.documentId, oisDocument });
}

async function copyLink(getLink, button, status, states) {
  const link = await getLink();

  if (!link) {
    return;
  }

  GM_setClipboard(link);
  showCopied(button, status, states);
}

function createStyle(css) {
  const style = document.createElement("style");
  style.className = STYLE_CLASS;
  style.textContent = css;

  return style;
}

function createWrapper(states, getLink) {
  const wrapper = document.createElement("span");
  wrapper.className = WRAPPER_CLASS;

  const inner = document.createElement("span");
  inner.className = INNER_CLASS;

  const button = document.createElement("dso-icon-button");
  button.setAttribute("variant", "tertiary");
  setButtonState(button, states.idle);

  // Een gewijzigd aria-label lezen niet alle schermlezers voor. Een live region die er al vóór de klik staat wel.
  const status = document.createElement("span");
  status.className = STATUS_CLASS;
  status.setAttribute("role", "status");

  button.addEventListener("click", (event) => {
    // De klik hoort alleen bij deze knop. Het component en de viewer mogen er niet op reageren, bijvoorbeeld door in of
    // uit te klappen.
    event.stopPropagation();
    copyLink(getLink, button, status, states);
  });

  inner.append(button);
  wrapper.append(inner, status);

  return wrapper;
}

function cleanUp(host) {
  host.shadowRoot?.querySelectorAll(`.${WRAPPER_CLASS}, .${STYLE_CLASS}`).forEach((node) => node.remove());
  host.removeEventListener("mouseleave", scheduleCleanUp);
  host.removeEventListener("focusout", scheduleCleanUp);
  hostsWithListeners.delete(host);
}

function scheduleCleanUp(event) {
  const host = event.currentTarget;

  // Pas na het event weet de browser waar hover en focus terechtkomen. Wachten tot de knop is vervaagd, anders knipt
  // het opruimen de overgang af.
  setTimeout(() => {
    if (!host.matches(":hover, :focus-within")) {
      cleanUp(host);
    }
  }, FADE_DURATION + 50);
}

function inject(host, page) {
  if (host.getAttribute("mode") === "table-of-contents" || !parseHostId(host.id)) {
    return;
  }

  const root = host.shadowRoot;
  const heading = root?.querySelector(HEADING_SELECTOR);

  if (!heading) {
    return;
  }

  loadOisDocument(page);

  // Stencil kan bij een herrender onze nodes weghalen of verplaatsen. Daarom elke keer in de shadow root kijken.
  if (!root.querySelector(`.${STYLE_CLASS}`)) {
    root.append(createStyle(COMPONENT_STYLE));
  }

  // Achter de knop voor onderliggende artikelen en de badge, maar vóór de addons. Die staan rechts uitgelijnd.
  const row = heading.parentElement;
  const addons = row.querySelector(":scope > .addons");
  const wrapper = root.querySelector(`.${WRAPPER_CLASS}`);

  if (!wrapper) {
    row.insertBefore(
      createWrapper(COMPONENT_STATES, () => componentLink(host)),
      addons,
    );
  } else if (wrapper.parentElement !== row || wrapper.nextElementSibling !== addons) {
    row.insertBefore(wrapper, addons);
  }

  if (!hostsWithListeners.has(host)) {
    host.addEventListener("mouseleave", scheduleCleanUp);
    host.addEventListener("focusout", scheduleCleanUp);
    hostsWithListeners.add(host);
  }
}

function ensureDocumentButton(page) {
  loadOisDocument(page);

  // Er is maar één titel. Die knop mag blijven staan, ook zonder hover of focus.
  if (documentWrapper?.isConnected) {
    return;
  }

  const container = document.querySelector(TITLE_CONTAINER);

  if (!container?.querySelector(":scope > h1")) {
    return;
  }

  if (!document.head.querySelector(`.${STYLE_CLASS}`)) {
    document.head.append(createStyle(DOCUMENT_STYLE));
  }

  documentWrapper = createWrapper(DOCUMENT_STATES, documentLink);
  container.append(documentWrapper);
}

function handleActivity(event) {
  const page = currentPage();

  if (!page) {
    return;
  }

  ensureDocumentButton(page);

  if (!SUPPORTED_TABS.includes(page.tab)) {
    return;
  }

  for (const node of event.composedPath()) {
    if (node.nodeType === Node.ELEMENT_NODE && node.localName === "dso-document-component") {
      inject(node, page);
    }
  }
}

function start() {
  portalOrigin = findPortalOrigin();

  if (!portalOrigin) {
    return;
  }

  // Geen MutationObserver: er staan veel document componenten op een pagina. Alleen de keten onder de muis of focus
  // krijgt een knop. De titel krijgt zijn knop bij het eerste event op een documentpagina.
  document.addEventListener("pointerover", handleActivity, true);
  document.addEventListener("focusin", handleActivity, true);
}

if (typeof document !== "undefined") {
  start();
}
