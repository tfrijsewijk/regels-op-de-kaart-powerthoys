"use strict";

const assert = require("node:assert/strict");
const { describe, test } = require("node:test");

const {
  buildDeeplink,
  buildPermalink,
  determineLinkDate,
  documentRequestUrl,
  parseDocumentPath,
  parseHostId,
  parseTimeTravel,
  parseViewerPath,
  versionStartDate,
} = require("../regels-op-de-kaart-powerthoys.user.js");

const PORTAL = "https://omgevingswet.overheid.nl";
const VIEWER = "https://document-viewer.dso.kadaster.nl";
const NOW = Date.parse("2026-10-17T10:00:00Z");

// Volgt de stappen van het script: pad en host-id ontleden, datum bepalen, link bouwen.
function deeplinkFor({ pathname, search = "", hostId, oisDocument, now = NOW }) {
  const page = parseViewerPath(pathname);
  const target = parseHostId(hostId);
  const timeTravel = parseTimeTravel(search);
  const date = determineLinkDate({
    pathDocumentId: page.documentId,
    componentDocumentId: target.documentId,
    oisDocument,
    timeTravel,
    now,
  });

  return buildDeeplink({
    portalOrigin: PORTAL,
    pathDocumentId: page.documentId,
    tab: page.tab,
    date,
    componentDocumentId: target.documentId,
    eId: target.eId,
  });
}

// Uitsneden uit GET /bff/ois/ontsluiten/v2/documenten/<id>, opgehaald op 2026-10-17.
const aaEnHunze = {
  uriIdentificatie: "_akn_nl_act_gm1680_2020_omgevingsplan",
  geldigVanaf: "2026-04-15",
  beschikbaarVanaf: "2026-03-18T09:30:42.687608Z",
  omgevingsdocumentMetadata: {
    gerelateerdeTijdelijkeRegelingdelen: [
      {
        uriIdentificatie: "_akn_nl_act_mnre1130_2026_VB000022TijdelijkDeel000022",
        geldigVanaf: "2026-02-12",
        beschikbaarVanaf: "2026-02-12T08:35:40.473043Z",
      },
    ],
  },
};

const aaEnHunzeTijdreis = {
  uriIdentificatie: "_akn_nl_act_gm1680_2020_omgevingsplan",
  geldigVanaf: "2025-08-07",
  beschikbaarVanaf: "2025-08-07T08:03:51.028251Z",
};

const rijssenHolten = {
  uriIdentificatie: "_akn_nl_act_gm1742_2020_omgevingsplan",
  geldigVanaf: "2026-05-22",
  geldigTot: "2026-11-26",
  beschikbaarVanaf: "2026-05-08T07:10:29.907756Z",
};

const utrecht = {
  uriIdentificatie: "_akn_nl_act_gm0344_2020_omgevingsplan",
  geldigVanaf: "2026-09-18",
  beschikbaarVanaf: "2026-08-20T07:54:10.3269Z",
  omgevingsdocumentMetadata: {
    gerelateerdeTijdelijkeRegelingdelen: [
      {
        uriIdentificatie: "_akn_nl_act_gm0344_2026_Regelinga44d27cdbfa1498d847f11d6696e2cde",
        geldigVanaf: "2026-10-03",
        beschikbaarVanaf: "2026-10-02T07:23:15.448831Z",
      },
    ],
  },
};

const brummenDeelId =
  "_akn_nl_act_pv25_2025_voorbeschermingsregels_gronden_voormalige_papierfabriek_de_hoop_te_eerbeek";
const brummen = {
  uriIdentificatie: "_akn_nl_act_gm0213_2020_omgevingsplan",
  geldigVanaf: "2024-06-26",
  beschikbaarVanaf: "2024-06-26T13:45:16.983646Z",
  omgevingsdocumentMetadata: {
    gerelateerdeTijdelijkeRegelingdelen: [
      {
        uriIdentificatie: brummenDeelId,
        geldigVanaf: "2025-06-04",
        geldigTot: "2025-06-06",
        beschikbaarVanaf: "2025-06-04T07:04:54.555418Z",
      },
      {
        uriIdentificatie: brummenDeelId,
        geldigVanaf: "2025-06-06",
        beschikbaarVanaf: "2025-06-06T08:37:55.884781Z",
      },
    ],
  },
};

describe("de link met echte gegevens", () => {
  test("bouwt de link naar Aa en Hunze, artikel 4.7", () => {
    assert.equal(
      deeplinkFor({
        pathname: "/documenten/_akn_nl_act_gm1680_2020_omgevingsplan/regels",
        hostId: "_akn_nl_act_gm1680_2020_omgevingsplan-chp_4__subchp_4.3__art_4.7",
        oisDocument: aaEnHunze,
      }),
      "https://omgevingswet.overheid.nl/regels-op-de-kaart/documenten/_akn_nl_act_gm1680_2020_omgevingsplan/regels?datum=2026-04-15#_akn_nl_act_gm1680_2020_omgevingsplan,chp_4__subchp_4.3__art_4.7",
    );
  });

  test("bouwt de link naar de toelichting bij artikel 13.8 van Rijssen-Holten", () => {
    assert.equal(
      deeplinkFor({
        pathname: "/documenten/_akn_nl_act_gm1742_2020_omgevingsplan/toelichting",
        hostId: "_akn_nl_act_gm1742_2020_omgevingsplan-artrecital__content_o_404",
        oisDocument: rijssenHolten,
      }),
      "https://omgevingswet.overheid.nl/regels-op-de-kaart/documenten/_akn_nl_act_gm1742_2020_omgevingsplan/toelichting?datum=2026-05-22#_akn_nl_act_gm1742_2020_omgevingsplan,artrecital__content_o_404",
    );
  });

  test("neemt bij tijdreis de begindatum van de getoonde versie, niet de tijdreisdatum", () => {
    assert.equal(
      deeplinkFor({
        pathname: "/documenten/_akn_nl_act_gm1680_2020_omgevingsplan/regels",
        search: "?datum=2025-12-01",
        hostId: "_akn_nl_act_gm1680_2020_omgevingsplan-chp_4__subchp_4.3__art_4.7",
        oisDocument: aaEnHunzeTijdreis,
      }),
      "https://omgevingswet.overheid.nl/regels-op-de-kaart/documenten/_akn_nl_act_gm1680_2020_omgevingsplan/regels?datum=2025-08-07#_akn_nl_act_gm1680_2020_omgevingsplan,chp_4__subchp_4.3__art_4.7",
    );
  });
});

describe("versionStartDate", () => {
  test("geeft de begindatum van de geldigheid als de versie eerder beschikbaar was", () => {
    assert.equal(versionStartDate({ geldigVanaf: "2026-04-15", beschikbaarVanaf: "2026-03-18T09:30:42Z" }), "2026-04-15");
  });

  test("geeft bij terugwerkende kracht de dag waarop de versie beschikbaar kwam", () => {
    assert.equal(versionStartDate({ geldigVanaf: "2026-01-01", beschikbaarVanaf: "2026-02-10T10:00:00Z" }), "2026-02-10");
  });

  test("rekent beschikbaarVanaf om naar de datum in Europe/Amsterdam (zomertijd)", () => {
    assert.equal(versionStartDate({ geldigVanaf: "2026-03-01", beschikbaarVanaf: "2026-03-18T23:30:00Z" }), "2026-03-19");
  });

  test("rekent beschikbaarVanaf om naar de datum in Europe/Amsterdam (wintertijd)", () => {
    assert.equal(versionStartDate({ geldigVanaf: "2026-01-01", beschikbaarVanaf: "2026-01-10T23:30:00Z" }), "2026-01-11");
    assert.equal(versionStartDate({ geldigVanaf: "2026-01-01", beschikbaarVanaf: "2026-01-10T22:30:00Z" }), "2026-01-10");
  });

  test("geeft null zonder versiegegevens", () => {
    assert.equal(versionStartDate(undefined), null);
    assert.equal(versionStartDate({ geldigVanaf: "2026-01-01" }), null);
  });
});

describe("determineLinkDate", () => {
  const act = "_akn_nl_act_gm1680_2020_omgevingsplan";
  const ontwerp =
    "_akn_nl_act_gm1895_2025_omgevingsvisie_akn_nl_bill_gm1895_2025_1_14";

  test("geeft een ontwerp of besluitversie geen datum", () => {
    assert.equal(
      determineLinkDate({ pathDocumentId: ontwerp, componentDocumentId: ontwerp, oisDocument: null, timeTravel: null, now: NOW }),
      null,
    );
  });

  test("geeft een component van een ontwerp binnen een vastgestelde regeling geen datum", () => {
    assert.equal(
      determineLinkDate({ pathDocumentId: act, componentDocumentId: ontwerp, oisDocument: aaEnHunze, timeTravel: null, now: NOW }),
      null,
    );
  });

  test("bouwt de link naar een ontwerp zonder datum", () => {
    assert.equal(
      deeplinkFor({
        pathname: `/documenten/${ontwerp}/inhoud`,
        hostId: `${ontwerp}-chp_1`,
        oisDocument: null,
      }),
      `https://omgevingswet.overheid.nl/regels-op-de-kaart/documenten/${ontwerp}/inhoud#${ontwerp},chp_1`,
    );
  });

  test("neemt bij voorbeschermingsregels de latere begindatum van plan en tijdelijk deel", () => {
    assert.equal(
      determineLinkDate({
        pathDocumentId: utrecht.uriIdentificatie,
        componentDocumentId: "_akn_nl_act_gm0344_2026_Regelinga44d27cdbfa1498d847f11d6696e2cde",
        oisDocument: utrecht,
        timeTravel: null,
        now: NOW,
      }),
      "2026-10-03",
    );
  });

  test("houdt de begindatum van het plan als het tijdelijke deel eerder begon", () => {
    assert.equal(
      determineLinkDate({
        pathDocumentId: act,
        componentDocumentId: "_akn_nl_act_mnre1130_2026_VB000022TijdelijkDeel000022",
        oisDocument: aaEnHunze,
        timeTravel: null,
        now: NOW,
      }),
      "2026-04-15",
    );
  });

  test("bouwt de link naar een component van de voorbeschermingsregels met het pad van het plan", () => {
    assert.equal(
      deeplinkFor({
        pathname: "/documenten/_akn_nl_act_gm0344_2020_omgevingsplan/regels",
        hostId: "_akn_nl_act_gm0344_2026_Regelinga44d27cdbfa1498d847f11d6696e2cde-art_1",
        oisDocument: utrecht,
      }),
      "https://omgevingswet.overheid.nl/regels-op-de-kaart/documenten/_akn_nl_act_gm0344_2020_omgevingsplan/regels?datum=2026-10-03#_akn_nl_act_gm0344_2026_Regelinga44d27cdbfa1498d847f11d6696e2cde,art_1",
    );
  });

  test("kiest de versie van het tijdelijke deel die nu geldt", () => {
    assert.equal(
      determineLinkDate({
        pathDocumentId: brummen.uriIdentificatie,
        componentDocumentId: brummenDeelId,
        oisDocument: brummen,
        timeTravel: null,
        now: NOW,
      }),
      "2025-06-06",
    );
  });

  test("kiest bij tijdreis de versie van het tijdelijke deel die op de tijdreisdatum gold", () => {
    assert.equal(
      determineLinkDate({
        pathDocumentId: brummen.uriIdentificatie,
        componentDocumentId: brummenDeelId,
        oisDocument: brummen,
        timeTravel: parseTimeTravel("?datum=2025-06-05"),
        now: NOW,
      }),
      "2025-06-04",
    );
  });

  test("valt zonder versiegegevens bij tijdreis terug op de tijdreisdatum", () => {
    assert.equal(
      determineLinkDate({
        pathDocumentId: act,
        componentDocumentId: act,
        oisDocument: null,
        timeTravel: parseTimeTravel("?datum=2025-12-01"),
        now: NOW,
      }),
      "2025-12-01",
    );
  });

  test("geeft zonder versiegegevens en zonder tijdreis geen datum", () => {
    assert.equal(
      determineLinkDate({ pathDocumentId: act, componentDocumentId: act, oisDocument: null, timeTravel: null, now: NOW }),
      null,
    );
  });
});

describe("parseViewerPath", () => {
  test("ontleedt technisch id en tabblad", () => {
    assert.deepEqual(parseViewerPath("/documenten/_akn_nl_act_gm1680_2020_omgevingsplan/regels"), {
      documentId: "_akn_nl_act_gm1680_2020_omgevingsplan",
      tab: "regels",
    });
  });

  test("accepteert regels, toelichting, inhoud en bijlage", () => {
    for (const tab of ["regels", "toelichting", "inhoud", "bijlage"]) {
      assert.equal(parseViewerPath(`/documenten/x/${tab}`)?.tab, tab);
    }
  });

  test("geeft null op het tabblad Overzicht en op tabbladen van IHR", () => {
    assert.equal(parseViewerPath("/documenten/_akn_nl_act_gm1680_2020_omgevingsplan/overzicht"), null);
    assert.equal(parseViewerPath("/documenten/_akn_nl_act_gm1680_2020_omgevingsplan/plekinfo"), null);
    assert.equal(parseViewerPath("/documenten/NL.IMRO.0200.bp1148-vas1/bijlagen"), null);
  });

  test("bouwt de link naar een bijlage", () => {
    assert.equal(
      deeplinkFor({
        pathname: "/documenten/_akn_nl_act_gm1680_2020_omgevingsplan/bijlage",
        hostId: "_akn_nl_act_gm1680_2020_omgevingsplan-cmp_II",
        oisDocument: aaEnHunze,
      }),
      "https://omgevingswet.overheid.nl/regels-op-de-kaart/documenten/_akn_nl_act_gm1680_2020_omgevingsplan/bijlage?datum=2026-04-15#_akn_nl_act_gm1680_2020_omgevingsplan,cmp_II",
    );
  });

  test("geeft null zonder tabblad of buiten /documenten", () => {
    assert.equal(parseViewerPath("/documenten/_akn_nl_act_gm1680_2020_omgevingsplan"), null);
    assert.equal(parseViewerPath("/zoeken"), null);
    assert.equal(parseViewerPath("/documenten/a/regels/extra"), null);
  });
});

describe("parseHostId", () => {
  test("splitst op de eerste -", () => {
    assert.deepEqual(parseHostId("_akn_nl_act_gm1680_2020_omgevingsplan-chp_4__subchp_4.3__art_4.7"), {
      documentId: "_akn_nl_act_gm1680_2020_omgevingsplan",
      eId: "chp_4__subchp_4.3__art_4.7",
    });
    assert.deepEqual(parseHostId("_akn_a-b-c"), { documentId: "_akn_a", eId: "b-c" });
  });

  test("geeft null voor IHR en voor ids zonder eId", () => {
    assert.equal(parseHostId("NL.IMRO.0200.bp1148-vas1-artikel_1"), null);
    assert.equal(parseHostId("_akn_nl_act_gm1680_2020_omgevingsplan"), null);
    assert.equal(parseHostId("_akn_nl_act_gm1680_2020_omgevingsplan-"), null);
    assert.equal(parseHostId(""), null);
  });
});

describe("parseTimeTravel en documentRequestUrl", () => {
  test("geeft zonder ?datum= geen tijdreis en vraagt de actuele versie op", () => {
    assert.equal(parseTimeTravel(""), null);
    assert.equal(
      documentRequestUrl(VIEWER, "_akn_nl_act_gm1680_2020_omgevingsplan", null),
      `${VIEWER}/bff/ois/ontsluiten/v2/documenten/_akn_nl_act_gm1680_2020_omgevingsplan?synchroniseerMetTileset=Actueel`,
    );
  });

  test("negeert een ongeldige datum, net als de viewer", () => {
    assert.equal(parseTimeTravel("?datum=morgen"), null);
  });

  test("vraagt bij tijdreis de versie op die dag op, tot 23:59:59 in Europe/Amsterdam", () => {
    const summer = parseTimeTravel("?datum=2026-04-15");
    assert.equal(summer.geldigOp, "2026-04-15");
    assert.equal(summer.beschikbaarOp, "2026-04-15T23:59:59+02:00");
    assert.equal(
      documentRequestUrl(VIEWER, "_akn_nl_act_gm1680_2020_omgevingsplan", summer),
      `${VIEWER}/bff/ois/ontsluiten/v2/documenten/_akn_nl_act_gm1680_2020_omgevingsplan?beschikbaarOp=2026-04-15T23%3A59%3A59%2B02%3A00&geldigOp=2026-04-15`,
    );

    assert.equal(parseTimeTravel("?datum=2026-01-15").beschikbaarOp, "2026-01-15T23:59:59+01:00");
  });

  test("gebruikt op de dag van de wissel naar wintertijd de offset van het eind van de dag", () => {
    assert.equal(parseTimeTravel("?datum=2026-10-25").beschikbaarOp, "2026-10-25T23:59:59+01:00");
    assert.equal(parseTimeTravel("?datum=2026-03-29").beschikbaarOp, "2026-03-29T23:59:59+02:00");
  });
});

describe("parseDocumentPath", () => {
  test("ontleedt technisch id en tabblad, ook op tabbladen zonder componentlinks", () => {
    assert.deepEqual(parseDocumentPath("/documenten/_akn_nl_act_gm1680_2020_omgevingsplan/overzicht"), {
      documentId: "_akn_nl_act_gm1680_2020_omgevingsplan",
      tab: "overzicht",
    });
  });

  test("accepteert een pad zonder tabblad", () => {
    assert.deepEqual(parseDocumentPath("/documenten/NL.IMRO.0200.bp1148-vas1"), {
      documentId: "NL.IMRO.0200.bp1148-vas1",
      tab: null,
    });
  });

  test("geeft null voor de foutpagina en buiten /documenten", () => {
    assert.equal(parseDocumentPath("/documenten/not-found"), null);
    assert.equal(parseDocumentPath("/zoeken"), null);
    assert.equal(parseDocumentPath("/documenten/a/regels/extra"), null);
  });
});

describe("buildPermalink", () => {
  const resolver = "https://resolver.omgevingswet.overheid.nl/viewer/document";

  test("legt bij een vastgestelde regeling de getoonde versie vast met het expressionId", () => {
    assert.equal(
      buildPermalink({
        portalOrigin: PORTAL,
        pathDocumentId: "_akn_nl_act_gm1680_2020_omgevingsplan",
        oisDocument: {
          ...aaEnHunze,
          omgevingsdocumentMetadata: { expressionId: "/akn/nl/act/gm1680/2020/omgevingsplan/nld@2026-03-18;1" },
        },
      }),
      `${resolver}?expressionId=/akn/nl/act/gm1680/2020/omgevingsplan/nld@2026-03-18;1`,
    );
  });

  test("gebruikt in tijdreis het expressionId van de versie die de viewer toont", () => {
    assert.equal(
      buildPermalink({
        portalOrigin: PORTAL,
        pathDocumentId: "_akn_nl_act_gm1680_2020_omgevingsplan",
        oisDocument: {
          ...aaEnHunzeTijdreis,
          omgevingsdocumentMetadata: { expressionId: "/akn/nl/act/gm1680/2020/omgevingsplan/nld@2025-08-07;2" },
        },
      }),
      `${resolver}?expressionId=/akn/nl/act/gm1680/2020/omgevingsplan/nld@2025-08-07;2`,
    );
  });

  test("gebruikt bij een ontwerp of besluitversie het technische id", () => {
    const ontwerp = "_akn_nl_act_gm1895_2025_omgevingsvisie_akn_nl_bill_gm1895_2025_1_14";

    assert.equal(
      buildPermalink({
        portalOrigin: PORTAL,
        pathDocumentId: ontwerp,
        oisDocument: { omgevingsdocumentMetadata: { expressionId: "/akn/nl/bill/gm1895/2025/1_14/nld@2025;1" } },
      }),
      `${resolver}?documentId=${ontwerp}`,
    );
  });

  test("gebruikt bij een IHR-plan het IMRO-id", () => {
    assert.equal(
      buildPermalink({ portalOrigin: PORTAL, pathDocumentId: "NL.IMRO.0200.bp1148-vas1", oisDocument: null }),
      `${resolver}?documentId=NL.IMRO.0200.bp1148-vas1`,
    );
  });

  test("valt zonder versiegegevens terug op het technische id", () => {
    assert.equal(
      buildPermalink({
        portalOrigin: PORTAL,
        pathDocumentId: "_akn_nl_act_gm1680_2020_omgevingsplan",
        oisDocument: null,
      }),
      `${resolver}?documentId=_akn_nl_act_gm1680_2020_omgevingsplan`,
    );
  });

  test("gebruikt de resolver die bij het portaal hoort", () => {
    assert.equal(
      buildPermalink({
        portalOrigin: "https://pre.omgevingswet.overheid.nl",
        pathDocumentId: "NL.IMRO.0200.bp1148-vas1",
        oisDocument: null,
      }),
      "https://resolver.pre.omgevingswet.overheid.nl/viewer/document?documentId=NL.IMRO.0200.bp1148-vas1",
    );
  });
});
