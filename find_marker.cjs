const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/components/SuperAdmin/SuperAdminView.tsx');
let txt = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');

// Find exact bytes of the marker line
const lines = txt.split('\n');
const idx = lines.findIndex(l => l.includes('Admin QR') && l.includes('Links Popup Modal'));
if (idx === -1) { console.error('Line not found'); process.exit(1); }
console.log('Found marker at line', idx + 1, ':', JSON.stringify(lines[idx]));
