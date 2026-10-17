# Regels op de kaart: deeplink naar document component in document

Een userscript voor Violentmonkey of Tampermonkey. In Regels op de kaart toont het bij de kop van elk document component een knop. Een klik kopieert een link naar dat document component naar het klembord. Wie de link opent, komt in de viewer uit met dat document component opengeklapt en in beeld.

De knop werkt zoals in Jira bij een ticket. Ga je met de muis over een kop, of tab je ernaartoe, dan vaagt de knop in. Hij staat achteraan, na de knop voor onderliggende artikelen. Na een klik toont de knop twee seconden een vinkje en het label "Link gekopieerd". Gaan muis en focus weg van de kop, dan vervaagt de knop weer.

Een link ziet er zo uit:

```
https://omgevingswet.overheid.nl/regels-op-de-kaart/documenten/_akn_nl_act_gm1680_2020_omgevingsplan/regels?datum=2026-04-15#_akn_nl_act_gm1680_2020_omgevingsplan,chp_4__subchp_4.3__art_4.7
```

De datum is de eerste dag waarop de getoonde versie van het document geldig en beschikbaar is. Zo toont de link later nog steeds de tekst die je kopieerde, ook als er intussen een nieuwe versie is. Bekijk je een document in tijdreis, dan krijgt de link de begindatum van de versie die je ziet, niet je tijdreisdatum. Een ontwerp of besluitversie krijgt geen datum.

## Installeren

1. Installeer de extensie Tampermonkey of Violentmonkey in je browser.
2. Open de [installatielink](https://raw.githubusercontent.com/tfrijsewijk/regels-op-de-kaart-deeplink/main/regels-op-de-kaart-deeplink.user.js). De extensie herkent het bestand als userscript en vraagt of je het wilt installeren.
3. Open een document in Regels op de kaart, bijvoorbeeld het tabblad Regels van een omgevingsplan. Stond de pagina al open, herlaad hem dan.

In Chrome moet je bij zo'n extensie mogelijk "Gebruikersscripts toestaan" aanzetten in de details van de extensie, of de ontwikkelaarsmodus op de pagina met extensies. Dat is niet nagegaan.

## Updaten

De extensie kijkt zelf af en toe of er een nieuwe versie op `main` staat. Wil je niet wachten, zoek dan in het menu van de extensie naar updates.

Een nieuwe versie uitbrengen gaat zo: verhoog `@version` in de kop van het script en push naar `main`. Zonder hogere versie ziet de extensie geen update. GitHub houdt het ruwe bestand een paar minuten in de cache.

## Bekende grenzen

- De link is een URL van de applicatie, geen permalink. Verandert de viewer zijn URL-vorm, dan werken oude links niet meer.
- Het script leunt op de interne opbouw van de DSO Toolkit (de shadow root van `dso-document-component`) en op het BFF-endpoint dat de viewer zelf gebruikt voor versiegegevens. Wijzigt een van beide, dan kan de knop wegblijven of de datum ontbreken.
- De knop verschijnt alleen op de tabbladen Regels, Toelichting, Inhoud en Bijlagen, en alleen bij STOP-documenten. IHR-plannen en de inhoudsopgave krijgen geen knop.
- Lukt het ophalen van de versiegegevens niet, dan krijgt de link in tijdreis de tijdreisdatum en anders geen datum.
- Bij in- of uitklappen kan de viewer de knop weghalen. Hij komt terug zodra je de muis beweegt of de focus verplaatst.
- Na een klik met de muis houdt de knop de focus. Hij blijft dan zichtbaar tot je ergens anders klikt of verder tabt.
- Een link met datum toont in de viewer de tijdreisbalk, ook als de versie nog actueel is.
- Een link naar een lid springt naar het artikel. Dat doet de viewer zelf.
- De viewer scrolt het document component net onder zijn vaste tabbalk. Je ziet de kop dan soms niet meteen.
- Plak je de link in een tabblad dat al hetzelfde document en tabblad toont, dan verandert alleen het fragment. Het portaal geeft dat niet door aan de viewer en er gebeurt niets. Herlaad dan de pagina, of open de link in een nieuw tabblad.

## Testen

De functies die de link bouwen, werken zonder DOM en hebben tests. Draai ze met Node 20 of nieuwer:

```
node --test
```
