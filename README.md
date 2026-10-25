# Treningsveileder

En PWA som fungerer som din personlige treningsveileder for styrketrening. Den analyserer treningshistorikken din fra **Lyfta** og helsedata fra **Apple Helse**, og gir konkrete råd om frekvens, volum, restitusjon, progresjon og balanse.

## Funksjoner

- **Dagsform (0–100)** basert på søvn, hvilepuls og HRV mot ditt eget snitt, pluss treningsbelastning.
- **Anbefalinger**: treningsfrekvens mot mål, harde sett per muskel per uke, press/trekk-balanse, platåer, deload-forslag, plutselig økt belastning, søvn, skritt, kondisjon og vekttrend.
- **Neste økt**: foreslår økt (helkropp, overkropp/underkropp eller press/trekk/bein) ut fra hvilke muskler som er mest uthvilt, med dine egne favorittøvelser og vekter.
- **Øktlogger**: forslag til vekt og reps (dobbel progresjon), oppvarmingssett, skivekalkulator, pausetimer med lyd og vibrasjon, og skjermen holdes våken.
- **Fremgang**: estimert 1RM per øvelse, volum per muskel og helsetrender.
- Fungerer offline og kan installeres på Hjem-skjermen. All data lagres lokalt på enheten.

## Koble til Apple Helse og Lyfta

Apple tillater ikke at web-apper leser HealthKit direkte, og Lyfta har ikke et åpent API. Appen bruker derfor:

| Kilde | Metode | Gir |
|---|---|---|
| Apple Helse (daglig) | iOS-snarvei som kopierer verdier → «Lim inn fra Helse-snarvei» | Søvn, hvilepuls, HRV, skritt, vekt |
| Apple Helse (historikk) | Helse → Eksporter alle helsedata → velg `eksport.zip` | 13 mnd helsedata + alle treningsøkter |
| Lyfta | CSV-eksport fra Lyfta → «Importer Lyfta-CSV» | Øvelser, sett, reps, vekter |

Steg-for-steg-instruksjoner finnes i appen under **Data**. CSV-importen finner kolonnene selv, så eksporter fra Strong og Hevy fungerer også.

## Utvikling

```bash
npm install
npm run dev      # utviklingsserver
npm test         # tester
npm run build    # produksjonsbygg i dist/
npm run icons    # lag PNG-ikoner fra public/favicon.svg (krever Playwright)
```

React 19, TypeScript (strict), Tailwind CSS 4, Vite og vite-plugin-pwa.

## Publisering

`.github/workflows/deploy.yml` bygger og publiserer til GitHub Pages ved push til `main`. Aktiver det én gang under **Settings → Pages → Source: GitHub Actions**. Appen ligger da på `https://<bruker>.github.io/treningsveileder/`. Bruk miljøvariabelen `BASE_PATH` for å hoste et annet sted.
