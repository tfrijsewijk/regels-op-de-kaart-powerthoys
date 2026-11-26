"use strict";

const assert = require("node:assert/strict");
const { describe, test } = require("node:test");

const { parseDocumentPath, showsChangeFilter } = require("../regels-op-de-kaart-powerthoys.user.js");

// Wijzigingsbesluit Integraal Kindcentrum Hessenbergweg 95 van Amsterdam.
const BESLUITVERSIE =
  "_akn_nl_act_gm0363_2020_omgevingsplan_akn_nl_bill_gm0363_2026_besluit52a353d664904aa5b11cfd7a829162d0";
// Een ontwerp van het omgevingsplan van Amsterdam.
const ONTWERP = "_akn_nl_act_gm0363_2020_omgevingsplan_akn_nl_bill_gm0363_2025_besluit0176ad2522de45a3bb10274db15a9366";
const REGELING = "_akn_nl_act_gm0363_2020_omgevingsplan";

function pageFor(pathname) {
  return parseDocumentPath(pathname);
}

describe("showsChangeFilter", () => {
  test("toont het filter bij een besluitversie op elk tabblad met document componenten", () => {
    for (const tab of ["regels", "toelichting", "inhoud", "bijlage"]) {
      assert.equal(showsChangeFilter(pageFor(`/documenten/${BESLUITVERSIE}/${tab}`)), true, tab);
    }
  });

  test("toont het filter bij een ontwerp", () => {
    assert.equal(showsChangeFilter(pageFor(`/documenten/${ONTWERP}/regels`)), true);
  });

  test("toont het filter niet bij een vastgestelde regeling", () => {
    assert.equal(showsChangeFilter(pageFor(`/documenten/${REGELING}/regels`)), false);
  });

  test("toont het filter niet op een tabblad zonder document componenten", () => {
    for (const tab of ["plekinfo", "overzicht", "kaarten", "gerelateerd"]) {
      assert.equal(showsChangeFilter(pageFor(`/documenten/${BESLUITVERSIE}/${tab}`)), false, tab);
    }
  });

  test("toont het filter niet zonder tabblad", () => {
    assert.equal(showsChangeFilter(pageFor(`/documenten/${BESLUITVERSIE}`)), false);
  });

  test("toont het filter niet bij een IHR-plan", () => {
    assert.equal(showsChangeFilter(pageFor("/documenten/NL.IMRO.0363.GA2302PBGST-VG02/regels")), false);
  });

  test("toont het filter niet buiten een document", () => {
    assert.equal(showsChangeFilter(pageFor("/zoeken/locatie")), false);
  });
});
