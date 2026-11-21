# LetterPilot app

iPhone and Android app of `letterpilot/index.html`, built with Capacitor 8. The page is bundled
in the app; translation goes through the LetterPilot Cloudflare Worker (Google Gemini), so the
app needs internet and the access code in ⚙️ Settings.

## Download
GitHub → **Actions**:
- **Build LetterPilot Android** → latest successful run → artifact **LetterPilot-Android-APK** →
  unzip → `LetterPilot.apk`. It is a debug-signed test build: open it on the phone and allow
  installing from this source.
- **Build LetterPilot IPA** → artifact **LetterPilot-iPhone-IPA** → `LetterPilot.ipa`, unsigned.
  Sign it with your own Apple identity (same way as TuntiX), then install.

Both builds run automatically when `letterpilot/index.html` or this folder changes on `main`.

## Build locally
```sh
cd letterpilot-app
npm ci
node build.mjs
npx cap add android && node android-prepare.mjs   # Android Studio: npx cap open android
npx cap add ios --packagemanager SPM && node ios-prepare.mjs   # Xcode: npx cap open ios
```
