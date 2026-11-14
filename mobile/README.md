# TuntiX mobile

Native iPhone wrapper of `tuntix/tyontekija/index.html`, using Capacitor 8.
The web app is bundled locally. Distance lookup and maps require internet.

## IPA download

Open GitHub Actions → **Build TuntiX IPA** → successful run → **TuntiX-iPhone-IPA**.
Extract the artifact ZIP to obtain `TuntiX-unsigned.ipa` and its SHA-256 checksum.
This is a physical-device arm64 build, not a simulator build.
Sign it locally with your own Apple identity/certificate using your existing installation tool, then install.
No signing credentials are stored in this repository or requested by this workflow.

Existing Safari data is separate: export a JSON backup from the website, then import it in the app's settings.
Native JSON/CSV export uses the system share sheet; choose Save to Files to keep a copy.
Keep backups before reinstalling or removing the app.

## Build

On a Mac with Xcode 26 and Node 22+:

```sh
cd mobile
npm ci
node build.mjs
npx cap add ios --packagemanager SPM
npx cap open ios
```

The GitHub workflow builds without an Apple signing identity. Signing and physical-device testing are separate steps.
Native generated folders and web bundles are reproducible and are not committed.
The original website remains the source for UI changes.
