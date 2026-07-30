# Android-APK: Build, Installation & Update

## Konzept

Die App ist ein **Capacitor-Wrapper im Remote-URL-Modus** — sie zeigt `https://pumpe.local` in einer WebView. UI-Änderungen brauchen **keine** neue APK; der Service Worker zieht den neuen Build automatisch.

## Voraussetzungen (Entwicklungsrechner)

- Java 21 (JDK) — **nicht** das neuere JDK aus dem PATH verwenden, Gradle 8.14 baut damit nicht.
  Am einfachsten das mit Android Studio gelieferte JBR nehmen.
- Android SDK (Compile SDK 36, Min SDK 24)
- Node.js + npm (für Capacitor-Sync)

### Einmalig: SDK-Pfad hinterlegen

`android/local.properties` ist maschinenspezifisch und **nicht** im Repo. Fehlt sie,
bricht der Build mit `SDK location not found` ab:

```
sdk.dir=C:\\Users\\<user>\\AppData\\Local\\Android\\Sdk
```

## APK bauen

Bei nativen Änderungen (neues Plugin, Manifest) vorher synchronisieren:

```powershell
cd c:\dev\modbus_logo\pi\frontend
npx cap sync android
```

Dann bauen:

```powershell
cd c:\dev\modbus_logo\pi\frontend\android
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
.\gradlew.bat assembleRelease --no-daemon
```

Die signierte APK liegt danach unter:

```
app\build\outputs\apk\release\app-release.apk
```

Signing-Config ist in `keystore.properties` hinterlegt (Keystore: `pumpe-release.keystore`, Alias: `pumpe`).

### APK prüfen (optional)

Die Signatur ist **nicht** an `META-INF/*.RSA` erkennbar — v2/v3-Signaturen stehen
im ZIP-Trailer. Immer `apksigner` fragen:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\build-tools\37.0.0\apksigner.bat" verify --print-certs `
    app\build\outputs\apk\release\app-release.apk
```

Erwartet: `V2 Signer: certificate DN: CN=Pumpe, ...`. Gleiches Zertifikat wie bisher
bedeutet, dass die App über die alte drüber installiert werden kann.

## APK auf den Pi hochladen

```bash
scp app\build\outputs\apk\release\app-release.apk pi@pumpe.local:/tmp/pumpe.apk
ssh pi@pumpe.local "sudo mv /tmp/pumpe.apk /var/www/pumpe/downloads/pumpe.apk"
```

nginx stellt die Datei unter `https://pumpe.local/pumpe.apk` bereit.

## Installation auf dem Handy

1. Im Browser `https://pumpe.local/pumpe.apk` aufrufen
2. APK herunterladen und installieren (ggf. "Unbekannte Quellen" erlauben)
3. Bei Update: einfach über die bestehende App installieren (gleiche Signatur)

## Wann muss eine neue APK gebaut werden?

| Anlass | Grund |
|--------|-------|
| Pi-Zertifikat erneuert | Cert-Pinning in der App schlägt fehl |
| `capacitor.config.ts` geändert | Server-URL oder App-ID geändert |
| Capacitor-Major-Update | Native Schicht muss neu gebaut werden |
| Neue Android-Permissions | Manifest-Änderungen erfordern Neubau |
| Neues natives Plugin | Plugin-Code liegt im APK, nicht im Web-Build |

Reine UI-/Backend-Änderungen brauchen **keine** neue APK.

## Zertifikat aktualisieren

Wenn das Pi-Zertifikat erneuert wird:

```bash
# Cert vom Pi exportieren
openssl s_client -connect pumpe.local:443 </dev/null 2>/dev/null \
  | openssl x509 -outform PEM > pumpe.crt
```

Die Datei nach `pi/frontend/android/app/src/main/res/raw/pumpe.crt` kopieren, dann APK neu bauen und verteilen.

## Hinweise

- Die APK wird **nicht** von der CI/CD-Pipeline gebaut — nur manuell auf dem Entwicklungsrechner.
- Der Keystore (`pumpe-release.keystore`) und die Credentials (`keystore.properties`) liegen im Repo unter `pi/frontend/android/`.
- Die Network-Security-Config (`res/xml/network_security_config.xml`) pinnt das Pi-Zertifikat für `pumpe.local`.

## Spracheingabe

Der Assistent wird **getippt** — es gibt bewusst kein Mikrofon-Symbol.

Ein Versuch mit `@capacitor-community/speech-recognition` wurde wieder
entfernt: Die Bridge meldete das Plugin zwar als vorhanden und die
Geraete-Erkennung als verfuegbar, der Aufruf kam aber nie zurueck und
Android zeigte nie den Berechtigungsdialog.

Es braucht dafuer auch nichts: Die Android-Tastatur hat ein eigenes
Mikrofon, mit dem sich in jedes Textfeld diktieren laesst — inklusive der
Eingabezeile des Assistenten. Auf dem iPhone gilt dasselbe.
