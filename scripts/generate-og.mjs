import sharp from 'sharp';

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <rect width="1200" height="630" fill="#0A0A0F"/>
  <text x="600" y="260" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-weight="800" font-size="80" fill="#F0F0F5">Lock<tspan fill="#6366F1">Pact</tspan></text>
  <text x="600" y="340" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-weight="400" font-size="32" fill="#8E8EA0">Your partner holds the key.</text>
  <text x="600" y="420" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-weight="400" font-size="22" fill="#5A5A6E">Free screen time accountability for iOS</text>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile('public/og-image.png');
console.log('Generated og-image.png');
