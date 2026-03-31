const fs = require('fs');
const path = require('path');

const fontPath = path.join(__dirname, '../node_modules/@expo-google-fonts/josefin-sans/700Bold/JosefinSans_700Bold.ttf');
const fontB64 = fs.readFileSync(fontPath).toString('base64');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <style>
      @font-face {
        font-family: 'JosefinSans';
        src: url('data:font/truetype;base64,${fontB64}') format('truetype');
        font-weight: 700;
      }
    </style>
    <radialGradient id="bg" cx="50%" cy="45%" r="75%" fx="50%" fy="45%">
      <stop offset="0%"   stop-color="#7dd4e5"/>
      <stop offset="55%"  stop-color="#59c2d7"/>
      <stop offset="100%" stop-color="#3aa8be"/>
    </radialGradient>
  </defs>

  <!-- Background -->
  <rect width="1024" height="1024" fill="url(#bg)"/>

  <!-- M in JosefinSans 700Bold, letter-spacing matches header (8px at 24px = 33% → ~210px at 640px) -->
  <text
    x="512"
    y="710"
    font-family="JosefinSans"
    font-weight="700"
    font-size="660"
    text-anchor="middle"
    letter-spacing="50"
    fill="#0F0F0D"
  >M</text>
</svg>`;

const outPath = path.join(__dirname, 'generate-icon.svg');
fs.writeFileSync(outPath, svg);
console.log('Written:', outPath);
