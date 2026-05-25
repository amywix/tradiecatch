const fs = require('fs');
const path = require('path');

const WEB_BUILD = path.resolve(__dirname, '..', 'web-build');
const ASSETS = path.resolve(__dirname, '..', 'assets', 'images');

if (!fs.existsSync(WEB_BUILD)) {
  console.error('web-build directory not found. Run expo export first.');
  process.exit(1);
}

fs.copyFileSync(path.join(ASSETS, 'icon-192.png'), path.join(WEB_BUILD, 'icon-192.png'));
fs.copyFileSync(path.join(ASSETS, 'icon-512.png'), path.join(WEB_BUILD, 'icon-512.png'));
fs.copyFileSync(path.join(ASSETS, 'icon-512.png'), path.join(WEB_BUILD, 'apple-touch-icon.png'));

const manifest = {
  name: 'CallCatch',
  short_name: 'CallCatch',
  description: 'Never miss a job from a missed call again.',
  start_url: '/',
  display: 'standalone',
  background_color: '#1B2838',
  theme_color: '#1B2838',
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    { src: '/apple-touch-icon.png', sizes: '512x512', type: 'image/png' },
  ],
};

fs.writeFileSync(
  path.join(WEB_BUILD, 'manifest.json'),
  JSON.stringify(manifest, null, 2),
);

const indexPath = path.join(WEB_BUILD, 'index.html');
let html = fs.readFileSync(indexPath, 'utf-8');

const pwaHead = `
    <link rel="manifest" href="/manifest.json" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="CallCatch" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="theme-color" content="#1B2838" />`;

if (!html.includes('rel="manifest"')) {
  html = html.replace('</head>', pwaHead + '\n  </head>');
  fs.writeFileSync(indexPath, html);
  console.log('PWA tags injected into index.html');
} else {
  console.log('PWA tags already present');
}

console.log('PWA setup complete.');
