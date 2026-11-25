const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/components/SuperAdmin/SuperAdminView.tsx');
let txt = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');

// Fix: add status field to setViewingCacModal call
const old = `setViewingCacModal({ url: t.cacCertificateUrl!, tenantName: t.name, tenantId: t.id })`;
const fixed = `setViewingCacModal({ url: t.cacCertificateUrl!, tenantName: t.name, tenantId: t.id, status: t.cacStatus || 'pending' })`;

if (!txt.includes(old)) { console.error('Pattern not found'); process.exit(1); }
// Replace all occurrences (table row + mobile card)
const updated = txt.split(old).join(fixed);
fs.writeFileSync(filePath, updated, 'utf8');
console.log('Fixed', (txt.split(old).length - 1), 'occurrence(s)');
