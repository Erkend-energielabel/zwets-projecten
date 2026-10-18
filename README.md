# Zwets Projecten

Projectbudget, materiaal en urenregistratie voor de schilders van Zwets Schilderwerken B.V.

- Per project een budget en uurtarief. Materiaal gaat van het budget af; wat overblijft ÷ uurtarief = beschikbare uren, te verdelen over x man.
- Schilders vullen hun uren in per dagdeel (ochtend 4 u, middag 4 u, hele dag 8 u).
- Nacalculatie en verdeling naar rato van de gewerkte uren, met het werkelijk verdiende uurtarief.

Inloggen gaat met naam en pincode. Alle gegevens staan in een Google Sheet van Zwets.

## Wie mag wat

| Rol (tabblad Schilders) | Wat kan iemand |
|---|---|
| schilder | Alle projecten en uren **zien**. Alleen **eigen** uren invullen en verwijderen. Materiaal boeken en alleen eigen boekingen verwijderen. |
| kantoor | Alles: projecten aanmaken/wijzigen/afronden, uren en materiaal van iedereen aanpassen, schilders en pincodes beheren. |

De controle zit in de Google Sheet zelf (Code.gs), niet alleen in de app. Na 5 foute pincodes gaat een account op slot.

## Bestanden

| Bestand | Inhoud |
|---|---|
| `index.html` + `app.js` | De app (via GitHub Pages) |
| `config.js` | De link naar de Google Sheet (web-app-URL van Apps Script) |
| `Code.gs` | De code die in de Google Sheet draait (Extensies > Apps Script) |

## Installatie (eenmalig, ca. 10 minuten)

1. Ga naar **sheets.new** en noem de Sheet "Zwets projecten".
2. Kies **Extensies > Apps Script**, haal de bestaande code weg en plak de inhoud van **Code.gs**. Klik op Opslaan.
3. Kies bovenaan de functie **installeer** en klik op **Uitvoeren**. Geef toestemming (Geavanceerd > Ga naar … > Toestaan). De tabbladen Schilders, Projecten, Materiaal en Uren worden aangemaakt, met één kantoor-account: naam **Kantoor**, pincode **1234**.
4. Pas in het tabblad **Schilders** de naam en pincode van dat kantoor-account aan (laat Rol op `kantoor`).
5. Kies **Implementeren > Nieuwe implementatie > Web-app**, met Uitvoeren als **Ik** en Toegang **Iedereen**. Kopieer de web-app-URL (eindigt op `/exec`).
6. Plak die URL in **config.js** tussen de aanhalingstekens.
7. Zet GitHub Pages aan: repository **Settings > Pages**, Source **Deploy from a branch**, Branch **main** / **(root)**. Na een minuut staat de app op `https://<gebruikersnaam>.github.io/<repo>/`.

## Dagelijks gebruik

- **Schilder toevoegen:** log in als kantoor, kies **Schilders**, vul naam en pincode (4–6 cijfers) in en geef die door. Het kan ook direct in de Sheet (Naam, Pincode, Rol).
- **Pincode vergeten / account op slot:** kantoor kiest bij die schilder **Wijzigen** en stelt een nieuwe pincode in; dat geeft het account ook vrij. In de Sheet kan het ook: maak de cel Vergrendeld leeg.
- **Eigen pincode wijzigen:** bovenaan **Pincode wijzigen**.
- **Project afronden:** in het project **Wijzigen > Project afgerond**. Er kunnen dan geen uren meer bij en je ziet de eindafrekening onder Verdeling.
- **Overzicht in de Sheet:** de tabbladen Projecten, Materiaal en Uren zijn gewone tabellen; je kunt ze filteren of een draaitabel maken. Pas de ID-kolommen niet aan.

## Code bijwerken

Plak de nieuwe Code.gs in Apps Script, Opslaan, dan **Implementeren > Implementaties beheren > potloodje > Versie: Nieuwe versie > Implementeren**. De link blijft hetzelfde.
