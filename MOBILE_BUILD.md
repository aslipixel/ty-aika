# Työaika mobile build (Android and iOS)

This branch prepares the existing web application for Capacitor. It does not publish or change the live GitHub Pages site.

## Prepare
Install Node.js LTS and run `npm install`. Copy the existing static site files (`index.html`, `sw.js`, `manifest.webmanifest`, and referenced icons/assets) into a folder named `www/`. Ensure every relative resource referenced by the app is copied. Then run `npx cap add android` and `npx cap add ios` (the latter requires macOS/Xcode or a macOS cloud build environment). Run `npx cap sync` after web changes.

## Android
Open the generated Android project with `npx cap open android` and build an APK in Android Studio on Windows, macOS or Linux.

## iOS
Build/sign the generated iOS project using Xcode on macOS (locally or through a cloud macOS builder). A signed IPA is required for 3uTools; 3uTools itself does not replace Apple's signing requirements.

## Data and safety
Capacitor WebView storage is separate from Safari/Chrome storage. Export a JSON backup from the existing web app before migrating, then import into the installed app. Confirm backup import/export and offline operation on actual devices before relying on the mobile version. Native WebView file download and file input behavior may require Capacitor native filesystem/share plugins; this has not yet been implemented or tested. Keep the existing site unchanged until both builds are verified.
