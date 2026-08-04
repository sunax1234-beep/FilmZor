# FilmZor — Android TV

Tenký WebView wrapper okolo FilmZor webovej appky, s Leanback launcher ikonou
(zobrazí sa v TV domovskej obrazovke). Navigácia šípkami/diaľkovým ovládaním
je riešená priamo v JS appke (`useSpatialNavigation`), WebView len prirodzene
prepúšťa D-pad eventy ďalej.

## Nastavenie URL

Appka teraz smeruje na LAN adresu (`MainActivity.kt` → `appUrl`):

```
http://192.168.10.11:5180
```

TV zariadenie musí byť **v tej istej WiFi sieti** ako počítač, na ktorom beží
`npm run dev -- --host 0.0.0.0` (frontend) a backend server. Ak sa PC IP adresa
zmení, uprav `appUrl` v `MainActivity.kt` a appku znova zostav.

Po prípadnom nasadení backendu/frontendu do cloudu stačí `appUrl` zmeniť na
verejnú `https://` adresu — appka bude fungovať aj mimo domácej siete.

## Build

Appka sa buildí automaticky cez GitHub Actions (`.github/workflows/android-tv.yml`)
pri každom pushi do `main`, ktorý mení niečo v `filmzor-tv/`. Hotový `.apk`
nájdeš v GitHub repozitári v sekcii **Actions** → posledný beh → **Artifacts**
→ `filmzor-tv-debug-apk`.

## Inštalácia na Android TV / Google TV

1. Stiahni `.apk` z GitHub Actions artifacts (vyššie) do počítača
2. Na TV zapni **Developer options** → **USB debugging** (Nastavenia → System → About → viackrát klikni na Build number, potom Developer options)
3. Over, že TV je v tej istej sieti ako počítač, a zisti jej IP adresu (Nastavenia → Network)
4. Z počítača (potrebuješ nainštalovaný `adb` — súčasť Android SDK platform-tools):
   ```
   adb connect <IP_ADRESA_TV>:5555
   adb install cesta/k/app-debug.apk
   ```
5. Appka "FilmZor" by sa mala objaviť v ponuke aplikácií na TV

**Alternatíva bez adb:** nainštaluj na TV appku **"Downloader"** (dostupná v Google Play na väčšine Android TV/Google TV zariadení), stiahni cez ňu `.apk` z verejného odkazu (napr. nahraný na Google Drive s verejným zdieľaním) a nainštaluj priamo na TV.
