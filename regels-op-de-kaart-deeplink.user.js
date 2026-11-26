// ==UserScript==
// @name         Regels op de kaart PowerThoys
// @namespace    tfrijsewijk
// @version      1.3.0
// @description  Toont in Regels op de kaart bij de kop van elk document component een knop die een deeplink naar dat document component kopieert en een knop die de verwerkte XML toont, en naast de titel een knop voor een permalink naar het document.
// @match        https://document-viewer.dso.kadaster.nl/*
// @match        https://*.document-viewer.dso.kadaster.nl/*
// @grant        GM_setClipboard
// @sandbox      raw
// @inject-into  auto
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/tfrijsewijk/regels-op-de-kaart-powerthoys/main/regels-op-de-kaart-powerthoys.user.js
// @downloadURL  https://raw.githubusercontent.com/tfrijsewijk/regels-op-de-kaart-powerthoys/main/regels-op-de-kaart-powerthoys.user.js
// ==/UserScript==

"use strict";

// Pure functies, zonder DOM, zodat de tests in test/ ze zonder browser kunnen draaien.

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

// Opmaak en kleuren werken op de tekst zelf en niet via een XML-parser. Een parser schrijft de XML opnieuw. Zo verandert
// de kleuring geen teken, en de opmaak alleen witruimte tussen elementen. Klopt de opbouw niet, dan blijft de XML zoals
// hij is.
const XML_TOKEN =
  /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<![^>]*>|<\/[^>]*>|<(?:"[^"]*"|'[^']*'|[^'">])*>|[^<]+/g;
const XML_TAG = /^(<\/?)([^\s/>]+)([\s\S]*?)(\/?>)$/;
const XML_ATTRIBUTE = /(\s+)([^\s=]+)(\s*=\s*)("[^"]*"|'[^']*')/g;

function xmlTokenKind(text) {
  if (!text.startsWith("<")) {
    return "text";
  }

  if (text.startsWith("<!--")) {
    return "comment";
  }

  if (text.startsWith("<![CDATA[")) {
    return "cdata";
  }

  if (text.startsWith("<?") || text.startsWith("<!")) {
    return "meta";
  }

  if (text.startsWith("</")) {
    return "close";
  }

  return text.endsWith("/>") ? "empty" : "open";
}

function tokenizeXml(xml) {
  const tokens = [];
  let length = 0;

  for (const [text] of xml.matchAll(XML_TOKEN)) {
    tokens.push({ kind: xmlTokenKind(text), text });
    length += text.length;
  }

  // Een teken dat in geen enkel token past, zou anders ongemerkt uit de XML verdwijnen.
  return length === xml.length ? tokens : null;
}

function parseXmlTree(tokens) {
  const root = { children: [] };
  const stack = [root];

  for (const token of tokens) {
    if (token.kind === "open") {
      const element = { open: token.text, close: "", children: [] };
      stack.at(-1).children.push(element);
      stack.push(element);
    } else if (token.kind === "close") {
      if (stack.length === 1) {
        return null;
      }

      stack.pop().close = token.text;
    } else {
      stack.at(-1).children.push(token);
    }
  }

  return stack.length === 1 ? root.children : null;
}

function rawXml(node) {
  return node.kind ? node.text : node.open + node.children.map(rawXml).join("") + node.close;
}

function isBlankXml(node) {
  // Alleen deze vier tekens zijn witruimte in XML. Een non-breaking space is inhoud.
  return node.kind === "text" && /^[ \t\r\n]*$/.test(node.text);
}

function hasInlineContent(children) {
  return children.some((child) => (child.kind === "text" && !isBlankXml(child)) || child.kind === "cdata");
}

function printXml(nodes, depth, lines) {
  const indent = "  ".repeat(depth);

  for (const node of nodes) {
    if (isBlankXml(node)) {
      continue;
    }

    if (node.kind) {
      lines.push(indent + node.text);
      continue;
    }

    // Zoals Prettier met xmlWhitespaceSensitivity "preserve": een element met tekst blijft precies zoals het was, want
    // daar telt elke spatie. Witruimte tussen elementen is opmaak.
    if (hasInlineContent(node.children)) {
      lines.push(indent + rawXml(node));
      continue;
    }

    const children = node.children.filter((child) => !isBlankXml(child));

    if (children.length === 0) {
      lines.push(indent + node.open + node.close);
      continue;
    }

    lines.push(indent + node.open);
    printXml(children, depth + 1, lines);
    lines.push(indent + node.close);
  }
}

function formatXml(xml) {
  const tokens = tokenizeXml(xml);
  const tree = tokens && parseXmlTree(tokens);

  // Liever ongeformatteerd dan een deel van de XML kwijt. Tekst buiten een element telt net zo goed als tekst in een
  // element, dus ook daar blijft alles zoals het was.
  if (!tree || hasInlineContent(tree)) {
    return xml;
  }

  const lines = [];
  printXml(tree, 0, lines);

  return lines.join("\n");
}

function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function highlightSpan(className, html) {
  return `<span class="${className}">${html}</span>`;
}

function highlightAttributes(attributes) {
  let html = "";
  let last = 0;

  for (const match of attributes.matchAll(XML_ATTRIBUTE)) {
    const [whole, space, name, equals, value] = match;
    html +=
      escapeHtml(attributes.slice(last, match.index)) +
      space +
      highlightSpan("hljs-attr", escapeHtml(name)) +
      escapeHtml(equals) +
      highlightSpan("hljs-string", escapeHtml(value));
    last = match.index + whole.length;
  }

  return html + escapeHtml(attributes.slice(last));
}

function highlightTag(text) {
  const match = XML_TAG.exec(text);

  if (!match) {
    return escapeHtml(text);
  }

  const [, start, name, attributes, end] = match;

  return (
    escapeHtml(start) + highlightSpan("hljs-name", escapeHtml(name)) + highlightAttributes(attributes) + escapeHtml(end)
  );
}

// Dezelfde classes en opbouw als highlight.js. Een thema van highlight.js past dus, en highlight.js zelf ook.
function highlightXml(xml) {
  const tokens = tokenizeXml(xml);

  // Zonder geldige opbouw zou een losse "<" een halve tag kleuren. Dan liever alles als gewone tekst.
  if (!tokens || !parseXmlTree(tokens)) {
    return escapeHtml(xml);
  }

  return tokens
    .map(({ kind, text }) => {
      switch (kind) {
        case "text":
          return escapeHtml(text);
        case "comment":
          return highlightSpan("hljs-comment", escapeHtml(text));
        case "cdata":
        case "meta":
          return highlightSpan("hljs-meta", escapeHtml(text));
        default:
          return highlightSpan("hljs-tag", highlightTag(text));
      }
    })
    .join("");
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    buildDeeplink,
    buildPermalink,
    determineLinkDate,
    documentRequestUrl,
    formatXml,
    highlightXml,
    parseDocumentPath,
    parseHostId,
    parseTimeTravel,
    parseViewerPath,
    versionStartDate,
  };
}

// DOM

const WRAPPER_CLASS = "userscript-powerthoys";
const INNER_CLASS = "userscript-powerthoys-inner";
const STATUS_CLASS = "userscript-powerthoys-status";
const STYLE_CLASS = "userscript-powerthoys-style";
const PINNED_CLASS = "userscript-powerthoys-pinned";
const XML_TOGGLE_CLASS = "userscript-xml-toggle";
const XML_PANEL_CLASS = "userscript-xml";
const XML_BOX_CLASS = "userscript-xml-box";
const XML_ACTIONS_CLASS = "userscript-xml-actions";
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
const XML_STATES = {
  closed: { icon: "plus-square-outline", label: "Toon verwerkte XML" },
  open: { icon: "plus-square-solid", label: "Verberg verwerkte XML" },
};
const XML_COPY_STATES = {
  idle: { icon: "copy-outline", label: "Kopieer XML" },
  copied: { icon: "check", label: "XML gekopieerd" },
};
const XML_VIEW_STATES = {
  original: { icon: "sitemap", label: "Toon opgemaakte XML" },
  formatted: { icon: "sitemap", label: "Toon originele XML" },
};
const XML_PROPERTIES = ["gereserveerd", "vervallen", "kop", "inhoud"];
// Bij een aanhef en een sluiting maakt de viewer de kop zelf. Die kop komt niet van Ozon.
const TYPES_WITH_GENERATED_KOP = ["AANHEF", "SLUITING"];
const COPIED_DURATION = 2000;
const FADE_DURATION = 200;

// De opmaak loopt alleen via deze functie, zodat Prettier er later in past. De functie mag een Promise geven, een fout
// gooien of eindigen op een regeleinde: het script vangt dat op. Prettier zelf vraagt wel een build-stap, want
// @prettier/plugin-xml heeft geen versie voor de browser. Zet daar ook printWidth hoog, anders breekt Prettier
// attributen af.
const xmlFormatter = formatXml;

// De kleuren lopen alleen via deze functie, zodat highlight.js er later in past zonder verdere wijziging. Die geeft
// dezelfde classes: (xml) => hljs.highlight(xml, { language: "xml" }).value. Het resultaat gaat naar innerHTML, dus
// elke vervanger moet de tekst zelf ontsnappen.
const xmlHighlighter = highlightXml;

// Verborgen neemt de knop geen ruimte in. Anders verspringt de kop bij elke injectie, en die gebeurt al bij hover over
// de inhoud van een component. Een kolom van 0fr of 1fr geeft breedte 0 of die van de knop, zonder vaste maat.
// Staat de XML open, dan blijven de knoppen staan. Zo is te zien dat het paneel bij dit component hoort en sluit het
// met dezelfde knop.
function wrapperStyle(container) {
  const visible = `${container}:is(:hover, :focus-within) .${WRAPPER_CLASS}, .${WRAPPER_CLASS}.${PINNED_CLASS}`;

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

const COMPONENT_STYLE = `${wrapperStyle(".heading-container")}
.${XML_PANEL_CLASS} {
  margin-block: 8px 16px;
  /* Zoals de toolkit bij de kenmerken doet, zodat de rechterrand van beide panelen gelijk loopt. */
  padding-inline-end: 8px;
}

.${XML_BOX_CLASS} {
  position: relative;
  /* De rand van het kenmerkenpaneel, zodat beide panelen bij elkaar horen. */
  border: 1px solid #b2b2b2;
  border-radius: 4px;
  background-color: #f6f6f6;
}

.${XML_PANEL_CLASS} pre {
  margin: 0;
  /* Rechts ruimte voor de knoppen, zodat die geen tekst bedekken. */
  padding: 12px 64px 12px 16px;
  /* De originele XML staat vaak op één lange regel. Afbreken op het scherm verandert de gekopieerde tekst niet. */
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
  font-size: 0.875rem;
  line-height: 1.5;
  color: #191919;
}

.${XML_BOX_CLASS} > p {
  margin: 0;
  padding: 12px 16px;
}

.${XML_ACTIONS_CLASS} {
  position: absolute;
  inset-block-start: 4px;
  inset-inline-end: 4px;
  display: flex;
}

.${XML_ACTIONS_CLASS} dso-icon-button {
  --_dso-icon-button-tertiary-color: #275937;
  --_dso-icon-button-tertiary-hover-color: #275937;
}

.${XML_PANEL_CLASS} .hljs-tag,
.${XML_PANEL_CLASS} .hljs-meta {
  color: #666;
}

.${XML_PANEL_CLASS} .hljs-name {
  color: #116329;
}

.${XML_PANEL_CLASS} .hljs-attr {
  color: #0550ae;
}

.${XML_PANEL_CLASS} .hljs-string {
  color: #953800;
}

.${XML_PANEL_CLASS} .hljs-comment {
  color: #666;
  font-style: italic;
}
`;

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
// Per component het open XML-paneel, de XML waar het van is gemaakt en de gekozen weergave. Stencil kan het paneel bij
// een herrender verplaatsen. Met deze map zet het script het terug, en blijft de knop kloppen.
const xmlPanels = new WeakMap();
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
        console.warn("[powerthoys] Versiegegevens niet opgehaald:", error);

        return null;
      });
    oisDocuments.set(key, request);
  }

  return request;
}

function setButtonState(button, state) {
  // Attributen en geen properties: dan werken de linkknoppen ook als de script-manager het script afgeschermd van de
  // pagina draait. Daar zijn de properties van custom elements niet zichtbaar.
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

async function copyText(getText, button, status, states) {
  const text = await getText();

  if (!text) {
    return;
  }

  GM_setClipboard(text);
  showCopied(button, status, states);
}

function createStyle(css) {
  const style = document.createElement("style");
  style.className = STYLE_CLASS;
  style.textContent = css;

  return style;
}

function createIconButton(onClick) {
  const button = document.createElement("dso-icon-button");
  button.setAttribute("variant", "tertiary");
  button.addEventListener("click", (event) => {
    // De klik hoort alleen bij deze knop. Het component en de viewer mogen er niet op reageren, bijvoorbeeld door in of
    // uit te klappen.
    event.stopPropagation();
    onClick();
  });

  return button;
}

function createCopyButton(states, getText) {
  // Een gewijzigd aria-label lezen niet alle schermlezers voor. Een live region die er al vóór de klik staat wel.
  const status = document.createElement("span");
  status.className = STATUS_CLASS;
  status.setAttribute("role", "status");

  const button = createIconButton(() => copyText(getText, button, status, states));
  setButtonState(button, states.idle);

  return { button, status };
}

function createWrapper(...controls) {
  const wrapper = document.createElement("span");
  wrapper.className = WRAPPER_CLASS;

  const inner = document.createElement("span");
  inner.className = INNER_CLASS;
  inner.append(...controls.map((control) => control.button));

  wrapper.append(inner, ...controls.flatMap((control) => (control.status ? [control.status] : [])));

  return wrapper;
}

function canReadXml(host) {
  // Alleen in de context van de pagina ziet het script de properties die de viewer op het component zet. Draait de
  // script-manager het script afgeschermd, bijvoorbeeld door een strengere CSP, dan blijft de XML-knop weg en werken de
  // linkknoppen nog wel.
  return "inhoud" in host;
}

function xmlSources(host) {
  const skipKop = TYPES_WITH_GENERATED_KOP.includes(host.getAttribute("type"));

  return XML_PROPERTIES.filter((property) => !(property === "kop" && skipKop)).map((property) => host[property]);
}

function serializeXml(sources) {
  const serializer = new XMLSerializer();

  return sources
    .filter((value) => value)
    .map((value) => (typeof value === "string" ? value : serializer.serializeToString(value)));
}

function sameSources(a, b) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function shownXml(state) {
  return state.view === "formatted" ? state.formatted : state.original;
}

function renderXml(state) {
  // Per deel, zodat een deel dat niet te kleuren is de andere delen hun kleur laat houden.
  state.code.innerHTML = shownXml(state)
    .map((xml) => xmlHighlighter(xml))
    .join("\n\n");
  setButtonState(state.viewButton, XML_VIEW_STATES[state.view]);
}

async function formatFragment(xml) {
  try {
    return (await xmlFormatter(xml)).replace(/\n+$/, "");
  } catch (error) {
    console.warn("[powerthoys] XML niet opgemaakt:", error);

    return xml;
  }
}

async function switchXmlView(state) {
  const next = state.view === "original" ? "formatted" : "original";

  if (next === "formatted") {
    // Eén keer opmaken, ook als er een tweede klik komt terwijl de opmaak nog loopt.
    state.formatting ??= Promise.all(state.original.map(formatFragment));
    state.formatted = await state.formatting;
  }

  state.view = next;
  renderXml(state);
}

function createXmlPanel(state) {
  const panel = document.createElement("div");
  panel.className = XML_PANEL_CLASS;
  // De toolkit laat de kenmerken inspringen via dit part, en de maat verschilt per schermbreedte en per soort onderdeel.
  // Met hetzelfde part springt de XML in elk geval net zo ver in.
  panel.setAttribute("part", "_annotation-container");

  const box = document.createElement("div");
  box.className = XML_BOX_CLASS;
  panel.append(box);

  // Een leeg vlak lijkt op een fout, en knoppen zonder tekst doen niets.
  if (state.original.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "Dit onderdeel heeft geen XML.";
    box.append(empty);

    return panel;
  }

  state.code = document.createElement("code");

  const pre = document.createElement("pre");
  pre.append(state.code);

  state.viewButton = createIconButton(() => switchXmlView(state));

  const copy = createCopyButton(XML_COPY_STATES, () => shownXml(state).join("\n\n"));

  const actions = document.createElement("div");
  actions.className = XML_ACTIONS_CLASS;
  actions.append(state.viewButton, copy.button);

  box.append(pre, actions, copy.status);
  renderXml(state);

  return panel;
}

function openXmlPanel(host, view) {
  const sources = xmlSources(host);
  const state = { sources, original: serializeXml(sources), formatted: null, formatting: null, view: "original" };
  state.panel = createXmlPanel(state);
  xmlPanels.set(host, state);

  if (view === "formatted" && state.original.length > 0) {
    switchXmlView(state);
  }
}

function refreshXmlPanel(host) {
  const open = xmlPanels.get(host);

  // De viewer hergebruikt een component zolang het id gelijk blijft, en kan er dan nieuwe XML op zetten. Het paneel zou
  // anders de oude XML tonen en kopiëren. De gekozen weergave blijft.
  if (open && !sameSources(open.sources, xmlSources(host))) {
    open.panel.remove();
    openXmlPanel(host, open.view);
  }
}

function placeXmlPanel(host) {
  const panel = xmlPanels.get(host)?.panel;
  const headingContainer = host.shadowRoot?.querySelector(".heading-container");

  // Alleen verplaatsen als het nodig is. Verplaatsen haalt de focus van de kopieerknop in het paneel.
  if (panel && headingContainer && headingContainer.nextElementSibling !== panel) {
    headingContainer.after(panel);
  }
}

function updateXmlState(host) {
  const root = host.shadowRoot;
  const panel = xmlPanels.get(host)?.panel;
  const button = root?.querySelector(`.${XML_TOGGLE_CLASS}`);

  root?.querySelector(`.${WRAPPER_CLASS}`)?.classList.toggle(PINNED_CLASS, !!panel);

  if (button) {
    setButtonState(button, panel ? XML_STATES.open : XML_STATES.closed);
    button.setAttribute("expanded", String(!!panel));
    button.controlsElement = panel;
  }
}

function toggleXml(host) {
  const open = xmlPanels.get(host);

  if (open) {
    open.panel.remove();
    xmlPanels.delete(host);
  } else {
    openXmlPanel(host, "original");
    placeXmlPanel(host);
  }

  updateXmlState(host);
}

function createXmlToggle(host) {
  const button = createIconButton(() => toggleXml(host));
  button.classList.add(XML_TOGGLE_CLASS);
  setButtonState(button, XML_STATES.closed);

  return { button };
}

function cleanUp(host) {
  // Een open paneel houdt zijn knoppen en zijn opmaak.
  if (xmlPanels.has(host)) {
    return;
  }

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
    const controls = [createCopyButton(COMPONENT_STATES, () => componentLink(host))];

    if (canReadXml(host)) {
      controls.push(createXmlToggle(host));
    }

    row.insertBefore(createWrapper(...controls), addons);
  } else if (wrapper.parentElement !== row || wrapper.nextElementSibling !== addons) {
    row.insertBefore(wrapper, addons);
  }

  refreshXmlPanel(host);
  placeXmlPanel(host);
  updateXmlState(host);

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

  documentWrapper = createWrapper(createCopyButton(DOCUMENT_STATES, documentLink));
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
