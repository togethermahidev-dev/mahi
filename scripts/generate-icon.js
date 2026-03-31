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
    <!-- Instagram-style diagonal gradient: teal top-left → cyan mid → periwinkle bottom-right -->
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"   stop-color="#1ecfd6"/>
      <stop offset="35%"  stop-color="#59c2d7"/>
      <stop offset="65%"  stop-color="#4b8fd4"/>
      <stop offset="100%" stop-color="#5a6dee"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="1024" height="1024" fill="url(#bg)"/>

  <!-- Echo MAHI (cyan tint, offset 6px down-right, matching header echo) -->
  <text
    x="518"
    y="596"
    font-family="JosefinSans"
    font-weight="700"
    font-size="220"
    text-anchor="middle"
    letter-spacing="38"
    fill="#3aa8be"
    opacity="0.7"
  >MAHI</text>

  <!-- Main MAHI (white, matching header style) -->
  <text
    x="512"
    y="590"
    font-family="JosefinSans"
    font-weight="700"
    font-size="220"
    text-anchor="middle"
    letter-spacing="38"
    fill="#FFFFFF"
  >MAHI</text>
</svg>`;

const outPath = path.join(__dirname, 'generate-icon.svg');
fs.writeFileSync(outPath, svg);
console.log('Written:', outPath);
