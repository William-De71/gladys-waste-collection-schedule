# Waste Collection Schedule

## Überblick

Diese Integration bringt die Abfuhrtermine Ihrer Adresse in Gladys Assistant: in den Gladys-Kalender, als Erinnerung am Vorabend und in ein Dashboard-Widget mit den nächsten Abholungen.

Die Termine stammen aus [Waste Collection Schedule](https://github.com/mampfes/hacs_waste_collection_schedule), der von Home-Assistant-Nutzern bekannten Bibliothek: fast 1.000 Quellen, Gemeinden und Entsorger aus rund dreißig Ländern, Apps (Abfall.IO, Abfall+, MüllMax…) und jeder ICS-Kalenderlink. Die Bibliothek läuft unverändert im Container der Integration.

- **Kalender**: ein Kalender pro Abfuhrplan („Müllabfuhr – Zuhause“) für jeden Benutzer, der die Integration aktiviert, mit einem ganztägigen Termin pro Abholung und Abfallart.
- **Widget** „Nächste Abholungen“: die nächsten Abholtage, jeweils mit einer Tonne in der passenden Farbe.
- **Szenen**: Erinnerungen am Vorabend und am Morgen einer Abholung sowie Aktionen, um die nächste Abholung abzurufen oder die Termine zu aktualisieren.

![Das Widget „Nächste Abholungen“, mit einem Abfuhrplan und dann mit zweien (generierte Illustration, kein Bildschirmfoto)](https://raw.githubusercontent.com/William-De71/gladys-waste-collection-schedule/main/docs/assets/widgets.de.png)

**Transport: Cloud.** Der Container fragt die Website oder die API Ihrer Quelle von Ihrem Gladys aus ab, standardmäßig alle 12 Stunden. Ihre Adresse (oder was die Quelle braucht: Straße, Hausnummer, Kalenderlink) geht an diese Quelle und an niemanden sonst. Nichts läuft über einen Gladys-Server.

## Voraussetzungen

- Gladys Assistant 5.2.0 oder neuer (Kalender-Integrationen).
- Ihr Gladys erreicht das Internet.
- Eine Quelle für Ihre Adresse. Sehen Sie in der [Liste der Quellen](https://github.com/mampfes/hacs_waste_collection_schedule#supported-service-providers) nach oder nutzen Sie die Schaltfläche **Quelle suchen** auf der Konfigurationsseite. Keine Quelle für Ihren Ort? Die Quelle **ics** liest jeden Kalenderlink (`.ics`, `webcal://`), den Ihre Gemeinde oder Ihr Entsorger veröffentlicht.

## Konfiguration

Ein Administrator richtet die Quellen einmal für den ganzen Haushalt ein.

### Quelle und Argumente finden

1. Öffnen Sie **Integrationen → Waste Collection Schedule → Konfiguration**.
2. Geben Sie unten auf der Seite bei **Quelle suchen** den Namen Ihres Ortes oder Ihres Entsorgers ein und starten Sie die Suche. Die Antwort listet die passenden Quellen auf, mit der zu übernehmenden **Quelle**, den bereits bekannten **Argumenten**, den noch fehlenden und der Dokumentation der Quelle.
3. Lesen Sie die Dokumentation der Quelle: Sie erklärt jedes Argument (Straße, Hausnummer, eine Kennung von der Website des Entsorgers).

### Einen Abfuhrplan ausfüllen

| Feld      | Was eintragen                                                                                                                                                   |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name      | ein Name für den Abfuhrplan, angezeigt im Kalender, im Widget und in den Szenen (zum Beispiel „Zuhause“)                                                        |
| Quelle    | der Name der Quelle, zum Beispiel `ics` oder `awido_de`                                                                                                         |
| Argumente | ein JSON-Objekt, zum Beispiel `{"customer": "gifhorn", "city": "Hankensbüttel", "street": "Allersehl"}`, oder Paare `schlüssel=wert`, getrennt durch Semikolons |

Beispiele:

- ein ICS-Link: Quelle `ics`, Argumente `{"url": "https://example.org/abfuhr.ics"}`;
- Bordeaux Métropole: Quelle `opendata_bordeauxmetropole_fr`, Argumente `{"city": "Bordeaux", "address": "20 Cours Pasteur"}`.

Bis zu drei Abfuhrpläne: ein Ferienhaus oder eine zweite Quelle für dieselbe Adresse (die Gemeinde für die meisten Tonnen und ein ICS-Link für Glas). Speichern Sie und drücken Sie dann **Abfuhrpläne testen**: Die Antwort nennt für jeden Abfuhrplan, wie viele Termine und welche Abfallarten die Quelle geliefert hat, oder was nicht stimmt.

### Abfallarten, Erinnerungen und Aktualisierung

| Feld                                   | Standard   | Zweck                                                                          |
| -------------------------------------- | ---------- | ------------------------------------------------------------------------------ |
| Umbenennen                             | leer       | Paare `Original=Neu`, getrennt durch Semikolons: `Gelbe Tonne=Wertstoffe`      |
| Ausblenden                             | leer       | zu ignorierende Arten, getrennt durch Semikolons: `Weihnachtsbäume; Sperrmüll` |
| Erinnerung am Vorabend                 | 19:00      | Uhrzeit der Auslöser „Müllabfuhr morgen“, oder Aus                             |
| Erinnerung am Morgen                   | 06:00      | Uhrzeit des Auslösers „Müllabfuhr heute“, oder Aus                             |
| Termine aktualisieren alle             | 12 Stunden | wie oft die Quellen abgefragt werden (6, 12 oder 24 Stunden)                   |
| Sprache der an Szenen gesendeten Texte | Englisch   | Standardnamen der Abfuhrpläne und Fehlermeldungen in den Szenen-Variablen      |

Umbenennen und Ausblenden gelten für alle Abfuhrpläne. Die Kalendernamen folgen der Sprache jedes Benutzers.

## Verwendung

### Meine Kalender

Jeder Benutzer, der die Abholungen in seinem eigenen Kalender möchte, öffnet die Integration und drückt **Für mich aktivieren** unter **Meine Kalender**. Ein Kalender pro Abfuhrplan erscheint, mit einem ganztägigen Termin pro Abholung und Abfallart, von 35 Tagen zurück bis 400 Tage voraus. Die Termine folgen der Quelle: Eine Abholung, die die Quelle verschiebt oder streicht, wird auch in Gladys verschoben oder verschwindet.

Ein Kalender ist anfangs privat. Schalten Sie **Mit dem Haushalt teilen** ein, um ihn dem ganzen Haushalt zu zeigen und in Szenen mit den Kalender-Auslösern von Gladys zu nutzen; schalten Sie **Diesen Kalender synchronisieren** aus, um ihn nicht mehr zu erhalten. Widget und Szenen-Auslöser der Integration funktionieren auch, wenn niemand sie aktiviert.

### Widget

Fügen Sie im Dashboard-Editor das Widget **Nächste Abholungen** aus dem Bereich Waste Collection Schedule hinzu. Es zeigt die nächste Abholung, die nächsten Abholtage mit einer Tonne in der passenden Farbe (gelb für Wertstoffe, blau für Papier, grün für Glas und Grünschnitt, braun für Bioabfall, grau für Restmüll), den Zustand jedes Abfuhrplans und eine Schaltfläche **Aktualisieren**. Einstellungen: der angezeigte Abfuhrplan (alle oder einer), die Zahl der Abholtage (3, 5 oder 8) und die Schaltfläche Aktualisieren.

### Szenen-Auslöser

| Auslöser                                        | Wann                                                                | Variablen                                                  |
| ----------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------- |
| Müllabfuhr morgen                               | am Vorabend eines Abholtags, zur Erinnerungszeit am Abend           | Abfallarten, Anzahl der Arten, Datum, Name des Abfuhrplans |
| Abfallart wird morgen abgeholt                  | zum selben Zeitpunkt, einmal pro Art (um nach einer Art zu filtern) | Abfallart, Datum, Name des Abfuhrplans                     |
| Müllabfuhr heute                                | am Morgen eines Abholtags, zur Erinnerungszeit am Morgen            | Abfallarten, Anzahl der Arten, Datum, Name des Abfuhrplans |
| Aktualisierung der Abfuhrtermine fehlgeschlagen | einmal, wenn eine Quelle zu versagen beginnt                        | Name des Abfuhrplans, Quelle, Fehler                       |

Jeder Auslöser lässt sich nach einem Abfuhrplan filtern. Eine Erinnerung kommt nur einmal, auch wenn Gladys neu startet; war Gladys zur Erinnerungszeit aus, kommt sie bis zu 3 Stunden später.

### Szenen-Aktionen

- **Nächste Abholung abrufen** (wahlweise einer Abfallart, zum Beispiel „glas“): gefunden, Datum, Tage bis dahin, Abfallarten, Name des Abfuhrplans. Nutzen Sie „Tage bis dahin“ in einer Bedingung der folgenden Schritte.
- **Abfuhrtermine aktualisieren**: fragt die Quellen sofort ab; liefert Erfolg, Fehler, nächstes Datum, nächste Abfallarten, Tage bis zur nächsten Abholung.

### Szenen-Beispiele

- **Müllabfuhr morgen** → eine Nachricht senden „Morgen: {{triggerEvent.data.waste_types}}, Tonnen rausstellen“.
- **Abfallart wird morgen abgeholt**, Abfallart „Gelbe Tonne“ → das Licht im Flur 10 Minuten gelb leuchten lassen.
- Ein Kalender-Auslöser von Gladys auf dem geteilten Kalender „Müllabfuhr – Zuhause“, 30 Minuten vor dem Termin → eine Erinnerung an den Haushalt.

## Fehlerbehebung

- **Unbekannte Quelle**: Prüfen Sie die Schreibweise der Quelle (Kleinbuchstaben, Unterstriche), so wie **Quelle suchen** sie angibt.
- **Ungültige Argumente**: Die Meldung von **Abfuhrpläne testen** nennt das betroffene Argument und schlägt, wenn die Quelle sie kennt, die richtigen Werte vor (Straßennamen, Orte).
- **Die Quelle ist fehlgeschlagen** oder **hat zu lange gebraucht**: Die Website der Quelle ist gestört oder hat sich geändert, oder sie findet Ihre Adresse nicht mehr. Die Integration versucht es nach 15 Minuten erneut, dann immer seltener, und behält in der Zwischenzeit die letzten bekannten Termine. Hält es an, prüfen Sie, ob die Quelle in Home Assistant funktioniert: Falls nicht, melden Sie es bei [Waste Collection Schedule](https://github.com/mampfes/hacs_waste_collection_schedule/issues); die Korrektur kommt mit einem Update der Integration.
- **Falsche oder fehlende Termine**: Die Termine sind die der Quelle. Vergleichen Sie mit der Website Ihres Entsorgers und melden Sie Abweichungen dort, wo die Quelle gepflegt wird.
- **Kein Kalender nach dem Aktivieren**: Die Kalender werden nach der ersten erfolgreichen Aktualisierung der Quellen übertragen; prüfen Sie, ob **Diesen Kalender synchronisieren** eingeschaltet ist.
- **Keine Erinnerung**: Prüfen Sie die Erinnerungszeiten in der Konfiguration und den Abfuhrplan-Filter der Szene.
- **Protokolle**: der Reiter **Protokolle** der Integration. Für mehr Details fügen Sie die Umgebungsvariable `DEBUG=gladys-integration-sdk` hinzu. Um ein Problem zu melden, eröffnen Sie ein [Issue](https://github.com/William-De71/gladys-waste-collection-schedule/issues) mit den Versionen von Gladys und der Integration, der Quelle und den Protokollen.
