"use strict";

const assert = require("node:assert/strict");
const { describe, test } = require("node:test");

const { formatXml, highlightXml } = require("../regels-op-de-kaart-powerthoys.user.js");

function stripSpans(html) {
  return html
    .replace(/<\/?span[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

describe("formatXml", () => {
  test("zet blokken op een eigen regel en houdt tekst met inline elementen op één regel", () => {
    const xml =
      '<Inhoud><Lid eId="art_4.7__para_1"><LidNummer>1.</LidNummer><Inhoud><Al>Het is verboden zonder ' +
      '<IntRef ref="art_1.1">omgevingsvergunning</IntRef> een <i>bouwwerk</i> te bouwen:</Al><Lijst type="expliciet">' +
      "<Li><LiNummer>a.</LiNummer><Al>een dakkapel;</Al></Li></Lijst></Inhoud></Lid></Inhoud>";

    assert.equal(
      formatXml(xml),
      [
        "<Inhoud>",
        '  <Lid eId="art_4.7__para_1">',
        "    <LidNummer>1.</LidNummer>",
        "    <Inhoud>",
        '      <Al>Het is verboden zonder <IntRef ref="art_1.1">omgevingsvergunning</IntRef> een <i>bouwwerk</i> te bouwen:</Al>',
        '      <Lijst type="expliciet">',
        "        <Li>",
        "          <LiNummer>a.</LiNummer>",
        "          <Al>een dakkapel;</Al>",
        "        </Li>",
        "      </Lijst>",
        "    </Inhoud>",
        "  </Lid>",
        "</Inhoud>",
      ].join("\n"),
    );
  });

  test("zet de XML-declaratie op een eigen regel", () => {
    assert.equal(
      formatXml('<?xml version="1.0"?><Kop><Nummer>1</Nummer></Kop>'),
      '<?xml version="1.0"?>\n<Kop>\n  <Nummer>1</Nummer>\n</Kop>',
    );
  });

  test("vervangt bestaande inspringing tussen elementen", () => {
    assert.equal(formatXml("<Inhoud>\n    <Al>x</Al>\n</Inhoud>"), "<Inhoud>\n  <Al>x</Al>\n</Inhoud>");
  });

  test("zet een element met alleen elementen en witruimte op aparte regels, net als Prettier", () => {
    assert.equal(formatXml("<Al><i>a</i> <b>b</b></Al>"), "<Al>\n  <i>a</i>\n  <b>b</b>\n</Al>");
  });

  test("behandelt een non-breaking space als inhoud en niet als witruimte", () => {
    assert.equal(
      formatXml("<Inhoud><Al> </Al><Al>x</Al></Inhoud>"),
      "<Inhoud>\n  <Al> </Al>\n  <Al>x</Al>\n</Inhoud>",
    );
    assert.equal(formatXml("<Al><i>a</i> <b>b</b></Al>"), "<Al><i>a</i> <b>b</b></Al>");
  });

  test("laat lege elementen, commentaar en CDATA staan", () => {
    assert.equal(
      formatXml("<Inhoud><Al/><Leeg>\n  </Leeg><!-- opmerking --><Al><![CDATA[a < b]]></Al></Inhoud>"),
      "<Inhoud>\n  <Al/>\n  <Leeg></Leeg>\n  <!-- opmerking -->\n  <Al><![CDATA[a < b]]></Al>\n</Inhoud>",
    );
  });

  test("laat tekst met regeleinden en entiteiten ongewijzigd", () => {
    const xml = '<Al a="x &gt; y">regel een\nregel twee &amp; <i>drie</i></Al>';

    assert.equal(formatXml(xml), xml);
  });

  test("laat tekst buiten een element ongewijzigd", () => {
    assert.equal(formatXml("voor <b>x</b> na"), "voor <b>x</b> na");
    assert.equal(formatXml("  tekst  "), "  tekst  ");
  });

  test("geeft XML die niet sluit ongewijzigd terug", () => {
    assert.equal(formatXml("<Inhoud><Al>x</Al>"), "<Inhoud><Al>x</Al>");
    assert.equal(formatXml("<Al>x</Al></Inhoud>"), "<Al>x</Al></Inhoud>");
  });

  test("geeft XML met een los kleiner-dan-teken ongewijzigd terug", () => {
    assert.equal(formatXml("<Al>a < b</Al>"), "<Al>a < b</Al>");
    assert.equal(formatXml("<Al>x</Al><"), "<Al>x</Al><");
  });
});

describe("highlightXml", () => {
  test("geeft tags, attributen en waarden de classes van highlight.js", () => {
    assert.equal(
      highlightXml('<Al eId="x">tekst</Al>'),
      '<span class="hljs-tag">&lt;<span class="hljs-name">Al</span> <span class="hljs-attr">eId</span>=' +
        '<span class="hljs-string">&quot;x&quot;</span>&gt;</span>tekst' +
        '<span class="hljs-tag">&lt;/<span class="hljs-name">Al</span>&gt;</span>',
    );
  });

  test("houdt een groter-dan-teken in een attribuutwaarde en enkele aanhalingstekens binnen de tag", () => {
    assert.equal(
      highlightXml("<Al a=\"x>y\" b='z'>t</Al>"),
      '<span class="hljs-tag">&lt;<span class="hljs-name">Al</span> <span class="hljs-attr">a</span>=' +
        '<span class="hljs-string">&quot;x&gt;y&quot;</span> <span class="hljs-attr">b</span>=' +
        "<span class=\"hljs-string\">'z'</span>&gt;</span>t" +
        '<span class="hljs-tag">&lt;/<span class="hljs-name">Al</span>&gt;</span>',
    );
  });

  test("geeft een leeg element zijn afsluitende schuine streep", () => {
    assert.equal(highlightXml("<Al/>"), '<span class="hljs-tag">&lt;<span class="hljs-name">Al</span>/&gt;</span>');
  });

  test("geeft de XML-declaratie en een doctype de class voor meta", () => {
    assert.equal(
      highlightXml('<?xml version="1.0"?>\n<!DOCTYPE Al><Al/>'),
      '<span class="hljs-meta">&lt;?xml version=&quot;1.0&quot;?&gt;</span>\n' +
        '<span class="hljs-meta">&lt;!DOCTYPE Al&gt;</span>' +
        '<span class="hljs-tag">&lt;<span class="hljs-name">Al</span>/&gt;</span>',
    );
  });

  test("ontsnapt tekst en entiteiten, zodat de XML geen HTML wordt", () => {
    assert.equal(
      highlightXml('<Al a="&lt;b&gt;">&lt;script&gt; &amp;</Al>'),
      '<span class="hljs-tag">&lt;<span class="hljs-name">Al</span> <span class="hljs-attr">a</span>=' +
        '<span class="hljs-string">&quot;&amp;lt;b&amp;gt;&quot;</span>&gt;</span>&amp;lt;script&amp;gt; &amp;amp;' +
        '<span class="hljs-tag">&lt;/<span class="hljs-name">Al</span>&gt;</span>',
    );
  });

  test("geeft commentaar en CDATA een eigen class", () => {
    assert.equal(
      highlightXml("<!-- x --><![CDATA[a < b]]>"),
      '<span class="hljs-comment">&lt;!-- x --&gt;</span><span class="hljs-meta">&lt;![CDATA[a &lt; b]]&gt;</span>',
    );
  });

  test("laat witruimte en een non-breaking space ongemoeid", () => {
    const xml = '<Inhoud>\n  <Al> </Al>\t<Al a="1"  b="2">x  y</Al>\r\n</Inhoud>';

    assert.equal(stripSpans(highlightXml(xml)), xml);
    assert.match(highlightXml(xml), /<\/span> <span/);
  });

  test("ontsnapt XML die niet te ontleden is als geheel", () => {
    assert.equal(highlightXml("<Al>a < b</Al>"), "&lt;Al&gt;a &lt; b&lt;/Al&gt;");
  });

  test("ontsnapt XML met een teken dat in geen token past als geheel", () => {
    assert.equal(highlightXml("<Al>x</Al><"), "&lt;Al&gt;x&lt;/Al&gt;&lt;");
  });
});
