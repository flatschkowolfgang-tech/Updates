# VIP Updates

Zentrale Ablage für alle VIP-Apps, die über den **VIP Hub** verteilt werden.

- Jede App hat hier einen eigenen **Release-Bereich** mit festem Namen (z. B. `rewind`).
  Darin liegen immer die neueste Setup-Datei, `latest.yml` (für Auto-Updates) und die Signatur (`.sig`).
- **`apps.json`** ist die App-Liste für das Hub (Name, Version, Neuigkeiten, Download-Link).
- Neue Versionen lädt `publish.mjs` hoch. Das macht das Release-Skript der jeweiligen App automatisch.

Updates werden in den Apps nur installiert, wenn die Signatur zum Schlüssel der App passt.
