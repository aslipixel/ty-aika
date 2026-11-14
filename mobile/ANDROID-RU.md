# TuntiX Työntekijä — Android

В GitHub Actions откройте успешную сборку **Build TuntiX Android APK**.

* **TuntiX-Android-APK** — архив с готовым `TuntiX-Tyontekija-debug.apk`. Распакуйте и откройте APK на телефоне Android.
* **TuntiX-Android-Studio** — готовый проект. Распакуйте архив целиком, в Android Studio выберите **Open** → папку **android**. Дождитесь Gradle Sync, выберите телефон или эмулятор и нажмите Run ▶.

Для проекта нужны Android Studio 2025.2.1 или новее, JDK 21 и Android SDK 36. Android Studio предложит установить недостающие компоненты. Проект включает исходники нативных зависимостей; Node.js для открытия этого архива не нужен. Исходный веб-интерфейс находится в репозитории `tuntix/tyontekija/index.html`.

APK подписан тестовым ключом для проверки приложения, не для Google Play. Новая сборка на другом компьютере может иметь другую подпись: перед переустановкой сохраните JSON-копию данных. Для постоянных обновлений понадобится собственный неизменный release-ключ.

Данные сайта автоматически не переносятся: экспортируйте JSON в настройках сайта и импортируйте в настройках приложения. Экспорт в приложении открывает системное меню «Поделиться».

## Повторная генерация из репозитория

```sh
cd mobile
npm ci
node build.mjs
npx cap add android
node android-prepare.mjs
```

Откройте `mobile/android` в Android Studio. Если папка android уже создана, используйте `npx cap sync android` вместо `cap add`, затем снова `node android-prepare.mjs`.
