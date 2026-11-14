import sharp from 'sharp';
await sharp('../tuntix/tuntix-icon.svg').resize(1024,1024).flatten({background:'#ffffff'}).png().toFile('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png');
