# Liederboek

Meer › Liederboek toont de liedjes van [codex.rondgezang.be](https://codex.rondgezang.be)
(Rondgezang vzw), met toestemming overgenomen in november 2026. Ze staan in de
app zelf (`src/data/liederboek.json`), zodat ze op een cantus ook zonder netwerk
opengaan.

Per lied: de titel, de tekst per strofe (couplet en refrein, herhalingen,
vervangregels), de pagina in het Leuvens Liedboek (de nieuwste uitgave) en in de
KVHV Groene Codex van 2020, wie het schreef, de bron (behalve "Tekst verkregen
via Leuvens Liedboek vzw", dat de app sinds november 2026 niet meer toont; het
importscript laat die weg) en de YouTube-video als die er staat. De app noemt
de herkomst nergens. Zoeken gaat op titel en op paginanummer.

## Bijwerken

1. Haal de pagina's op, **traag** (de site blokkeert wie te snel gaat): de lijst
   van id's staat als links op de voorpagina, elk lied op `https://codex.rondgezang.be/<id>`.
   Bewaar ze als `<map>/<id>.html`, één per seconde of trager.
2. `python3 scripts/liederboek-parse.py <map> src/data/liederboek.json`
3. Kijk een paar liedjes na in de app, en publiceer een EAS Update.

Wijzigt rondgezang.be zijn opmaak, dan moet `scripts/liederboek-parse.py` mee.
