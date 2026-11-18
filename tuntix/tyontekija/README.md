# TuntiX — Työntekijä

Приложение для учёта рабочего времени с финским интерфейсом.

## Разработка

Весь код находится в `index.html`: HTML, CSS и JavaScript. Сборка и установка зависимостей не нужны. Для локального запуска выполните из корня репозитория:

```sh
python3 -m http.server 8000
```

Откройте `http://localhost:8000/tuntix/tyontekija/`.

## Возможности

- Учёт часов по датам, проектам и видам работ.
- Выбор недели по дате и месячный календарь.
- Профиль, дневная цель, светлая и тёмная темы.
- Резервные копии JSON и восстановление с проверкой данных.
- Выгрузка всех записей в CSV из настроек.

## Данные

Записи хранятся в localStorage браузера под ключом `tuntix.tt1`. Серверной базы данных и синхронизации между устройствами нет. При переносе между доменами или устройствами используйте JSON-резервную копию. Пользовательские записи не входят в исходники.

## Публикация

Существующий workflow `.github/workflows/pages.yml` публикует изменения в `tuntix/**` из ветки `main` через GitHub Pages.

## Проверено

- Добавление проекта и записи часов через интерфейс.
- Сохранение записи после перезагрузки страницы.
- Синтаксис JavaScript, обработка некорректных дат и часов при импорте, преобразование состояния в резервную копию и обратно, граница ISO-недели.

Дальнейшие изменения вносите в этой папке; соседнее приложение `tuntix/index.html` является отдельной версией.

## Расстояние от офиса

Рядом с часами показан автомобильный маршрут в одну сторону от адреса А. По умолчанию: Jaakonkatu 2, 01620 Vantaa. Адрес А меняется в Asetukset → Osoite A; новый адрес проверяется через Photon перед сохранением. Координаты офиса `[24.851418, 60.2847221]` проверены по Photon / OpenStreetMap 13.11.2026. Это расстояние до проекта, а не сумма поездок и не расчёт денежной компенсации.

Проект должен иметь адрес с улицей, номером дома и городом. Photon ищет адрес; принимается совпадение улицы, номера и города в Финляндии. Повторные объекты с одинаковым адресом объединяются. Неоднозначный или неполный адрес не превращается в приблизительное расстояние.

OSRM возвращает длину автомобильного маршрута в метрах. На экране она округляется до десятых километра. Результат сохраняется в `project.route`, включается в JSON-копию и перестаёт использоваться после изменения адреса. При ошибке доступен повторный запрос. Очередь запросов ограничивает частоту; загрузка имеет тайм-аут. Адрес проекта передаётся Photon, координаты маршрута — OSRM. Данные часов и профиля этим сервисам не передаются.

Используются публичные сервисы с ограничениями и без гарантии доступности. Для массового или коммерческого развёртывания следует заменить их сервисами с подходящими условиями или собственным сервером:

- https://github.com/komoot/photon
- https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server
- https://www.openstreetmap.org/copyright

Проверены в браузере автоматический расчёт для Ensi parvi 3, Helsinki (22,7 км на момент проверки) и показ километров при выборе проекта. Отдельно проверены отклонение другого номера/города/индекса, объединение дубликатов, сброс устаревшего результата после смены адреса и сохранение результата в резервной копии.

Адрес А сохраняется в `set.office` (адрес и координаты) и входит в резервную копию. Кэш и ключ очереди учитывают адрес А; результат старого запроса не записывается после его смены. При восстановлении копии маршруты проверяются относительно адреса А из самой копии. Адрес объекта показан под названием проекта в строке дневной записи и под выбором проекта в редакторе.

## Sää

Avaa **Sää** alavalikosta. Näkymä hakee Ilmatieteen laitoksen, MET Norwayn ja DWD ICONin
(Open-Meteon kautta) ennusteet samalle kellonajalle. Paikkahaku käyttää Open-Meteoa.
Sademäärä on tunnin kertymä ennusteen kellonajasta eteenpäin.
Sääkuvakkeet ovat [MET Norwayn Weather Icons](https://github.com/metno/weathericons)
-kokoelmasta (MIT).

Forecan kortti avaa Forecan verkkosivun oletusarvoisesti. Näytä Forecan lukemat
kortissa asettamalla `tuntix-foreca-endpoint`-metatagin arvoksi oman palvelimen
HTTPS-päätepiste. Lisää palvelimen origin myös CSP:n `connect-src`-luetteloon ja
salli palvelimella käyttöliittymän origin CORS-asetuksissa. Päätepiste vastaanottaa
`latitude`, `longitude` ja UTC-muotoisen `time`-parametrin. Se palauttaa Forecan
saman tunnin ennusteen muodossa `{"temp":6,"wind":4,"rain":0,"icon":"cloudy"}`.
Lämpötila on asteina (°C), tuuli metreinä sekunnissa ja tuntikertymä millimetreinä.
Valinnainen `icon` vastaa `weather-icons`-hakemiston tiedostonimeä ilman päätettä.
Forecan API-tunnukset säilytetään palvelimella.
