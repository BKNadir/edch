# EDCH — Elite Dangerous Companion Helper

[English](README.md) · [Français](README.fr.md) · **Deutsch** · [Español](README.es.md) · [Português (Brasil)](README.pt-BR.md) · [Русский](README.ru.md)

Ein schlanker Begleiter für **Elite Dangerous** (Windows). Er liest das Spiel-Journal in Echtzeit und zeigt dir für jedes Ingenieursmaterial, **wo du es findest – mit echten, anklickbaren Systemen in deiner Nähe**.

![Seite eines Materials: Tauschvorschläge und Systeme im Boom/in Expansion (Demodaten)](docs/materials.png)

## Was es kann

- **Live-Inventar**: Roh-, hergestellte und kodierte Materialien, angeordnet wie beim Materialhändler (eine Zeile pro Familie, Stufen 1 bis 5) mit Füllstandsanzeige. Der Odyssey-Schiffsspind (Daten, Komponenten, Gegenstände, Verbrauchsgüter) wird aus `ShipLocker.json` gelesen.
- **Fundorte mit echten Systemen**: Jede Spawn-Bedingung wird zu einer [Spansh](https://spansh.co.uk)-Suche rund um deine Position.
  - HGE: bevölkerte Systeme im Boom/in Expansion, Krieg, Unruhen, Ausbruch, Föderation oder Imperium. Zu alte Fraktionszustände werden ignoriert.
  - Kodierte Emissionen nach Sicherheitsstufe, Konfliktzonen, Hochenergie-Spuren.
  - Landbare Planeten nach Rohmaterial-% sortiert, Eisringe oder unberührte Ringe, Guardian- und Thargoiden-Stätten.
  - Odyssey-Siedlungen und bekannte Farmstellen (Jameson, Dav's Hope, Brain Trees, Kristalle…).
  - Klick auf ein System: Es wird kopiert und kann direkt in die Galaxiekarte eingefügt werden. Daneben Links zu Spansh und Inara.
- **Nächster Materialhändler** des passenden Typs, mit **Tauschvorschlägen** auf Basis deines Bestands (Kurse des Spiels, unter Berücksichtigung dessen, was deine Wunschliste reserviert).
- **Ingenieurwesen**: alle Modifikationen, experimentellen Effekte, Synthesen, Technologiemakler-Freischaltungen und Odyssey-Upgrades, mit dem, was du schon besitzt.
- **Wunschliste**: Füge Modifikationen hinzu (Stufen, Anzahl der Würfe, Menge). Sie berechnet, was fehlt, und den besten Tausch, um es zu decken.
- **Ingenieure**: Status und Rang aus dem Journal, kopierbares System, Entfernung, und Freischaltbedingungen, die automatisch abgehakt werden, wenn das Journal sie prüfen kann (Odyssey-Spind, Fracht, Materialien).
- **Build-Import**: Füge einen **EDSY**- oder **Coriolis**-Export ein oder wähle die Datei (SLEF oder Loadout-JSON). Jedes modifizierte Modul und sein experimenteller Effekt landen auf der Wunschliste. Du kannst auch von deinem aktuellen Schiff ausgehen.
- **Suche wie bei Inara**: wo du eine Ware kaufen oder verkaufen kannst (nach Preis oder Entfernung), ein Schiff, ein Modul (Klasse und Bewertung) oder einen Dienst (Interstellar Factors, Technologiemakler, Materialhändler…) in deiner Nähe.
- **Navigation**: Sprungreichweite deines Schiffs (leer, voll, beladen, jetzt, simulierte Fracht), Route mit Neutronen-Boost über Spansh und Fleet Carrier (Sprünge, Tritium und Dauer – als Schnellschätzung oder detaillierter Spansh-Plan mit Nachladestopps).
- **Steuerung & Geräte**: liest deine Tastenbelegung (aktive Vorlage, auch unterschiedliche Vorlagen für Schiff, SRV und zu Fuß) und zeichnet jedes Gerät. Die Tastatur wird Taste für Taste gezeichnet (QWERTY, AZERTY oder QWERTZ), das Xbox- oder PlayStation-Gamepad mit nummerierten Markierungen. Erkannte HOTAS, Joysticks und Gamepads (etwa 45 Modelle: VKB, Virpil, Thrustmaster, Saitek/Logitech, CH…) werden auf dem Bild des Modells gezeigt, mit der Aktion im Feld jeder Taste. Die Vorlagen stammen von EDRefCard und werden aus dessen GitHub-Repository geladen. Für ein unbekanntes Modell wählst du die ähnlichste Vorlage, sonst erscheint ein einfaches Schema mit Achsen, Coolie-Hats und Tasten. Jeder Befehl hat eine Legende und eine Farbe pro Modus, mit Filtern Schiff / SRV / Zu Fuß, Suche und druckbarem Blatt.
- **Sicherung der Konfiguration**: exportiert deine Tastenbelegung (und Grafikeinstellungen) als Zip nach Dokumente\EDCH und stellt sie mit einem Klick wieder her. Vor jedem Import wird die aktuelle Konfiguration automatisch gesichert.
- **Synchronisierung wie EDMC**: Live-Übertragung an **EDDN** (Märkte, Ausrüstung, Werften, Sprünge, Scans, Routen), **EDSM** und **Inara** (mit deinem API-Schlüssel). Die Regeln von EDDN werden eingehalten: persönliche Daten entfernt, Position gegengeprüft, abgelehnte Nachrichten werden nie erneut gesendet, nichts aus deinem Verlauf.

![Ein VKB Gladiator mit seiner Belegung (Demo-Belegung)](docs/controls.png)

## Sprachen

EDCH gibt es in den sechs Sprachen des Spiels: Englisch (Standard), Französisch, Deutsch, Spanisch, Portugiesisch (Brasilien) und Russisch. Das Installationsprogramm fragt nach der Sprache, und die App übernimmt sie beim ersten Start. Du kannst sie jederzeit unter **Einstellungen → Sprache** ändern. Namen von Materialien, Modulen und Befehlen bleiben wie im englischen Spiel.

Um eine Übersetzung hinzuzufügen oder zu korrigieren, bearbeite `tools/translations_*.txt` (eine Zeile pro Text: `fr ¦ en ¦ de ¦ es ¦ pt ¦ ru`) und führe dann `python3 tools/gen_locales.py` aus.

## Installation

Lade das Installationsprogramm (`.exe` oder `.msi`) unter [Releases](../../releases) herunter oder die portable `edch.exe` aus den Artefakten des letzten Builds (Reiter *Actions*). Windows 10/11 bringt WebView2 bereits mit.

Beim ersten Start wird der Journal-Ordner automatisch erkannt (`%USERPROFILE%\Saved Games\Frontier Developments\Elite Dangerous`). Du kannst ihn in den **Einstellungen** ändern.

## Entwicklung

Voraussetzungen: Node 20+, stabiles Rust und die [Tauri-Voraussetzungen](https://tauri.app/start/prerequisites/) für Windows.

```bash
npm install
npm test            # baut die Oberfläche und führt die Tests aus (Journal, Tausch, Spansh-Abfragen, EDDN, Belegung)
npm run app:dev     # startet die App
npm run app:build   # Windows-Installationsprogramme in src-tauri/target/release/bundle
npm run demo        # nur die Oberfläche im Browser, mit einem Beispiel-Journal
```

Aufbau:

- `src-tauri/`: Rust-Backend (Journal lesen, JSON-Dateien des Spiels, HTTP-Aufrufe, Optionsdateien und Zips, Links öffnen). Es enthält keine Spiellogik.
- `src/`: Oberfläche in TypeScript ohne Framework.
  - `journal.ts`: Kommandantenzustand aus den Journal-Ereignissen.
  - `sources.ts`: Spawn-Bedingungen als Suchen.
  - `spansh.ts`: Aufrufe und Aufbereitung der Ergebnisse.
  - `trade.ts`: Kurse des Materialhändlers.
  - `eddn.ts`, `uploaders.ts`: EDDN-Nachrichten, EDSM und Inara.
  - `binds.ts`: `.binds`-Dateien und Gerätenamen.
  - `i18n.ts`: Übersetzungsschicht.
- `tools/gen_data.py`, `tools/gen_binds.py`, `tools/gen_locales.py`: erzeugen die Daten in `public/` neu (siehe NOTICE).

Bei jedem Push auf `main` läuft ein Windows-Build. Um eine Version zu veröffentlichen, pushe einen Tag wie `v0.4.0`: Es wird ein Release-Entwurf erstellt.

## Roadmap

- Frontier-Anmeldung (cAPI, OAuth) für Flotte, Bestand und Fleet Carrier: Dafür ist eine Frontier-Client-ID nötig.
- EDDN: restliche Schemas (codexentry, approachsettlement, fssbodysignals, fsssignaldiscovered…).
- Optimierte Farmroute für die Wunschliste.

## Danksagungen

Daten: EDCD/FDevIDs und msarilar/EDEngineer (MIT), über dseelinger/d47 (MIT). Befehlsnamen und Gerätevorlagen: EDRefCard (Richard Buckle, MIT). Suchen: Spansh (EDDN). Elite Dangerous ist eine Marke von Frontier Developments plc. Inoffizielles, nicht kommerzielles Community-Tool. Details in [NOTICE](NOTICE).
