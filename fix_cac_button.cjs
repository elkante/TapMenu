const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/components/SuperAdmin/SuperAdminView.tsx');
let txt = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');

const marker = `<span>QR & Links</span>
                              </button>
                              <button
                                onClick={() => handleLoginAs(t)}`;

const replacement = `<span>QR & Links</span>
                              </button>

                              {/* CAC Review button — only shown if tenant has uploaded a CAC doc */}
                              {t.cacCertificateUrl && (
                                <button
                                  onClick={() => setViewingCacModal({ url: t.cacCertificateUrl!, tenantName: t.name, tenantId: t.id })}
                                  className={\`px-2.5 py-1.5 rounded-lg font-bold text-[11px] transition-colors flex items-center gap-1 cursor-pointer border \${
                                    t.cacStatus === 'verified'
                                      ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                      : 'bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border-blue-500/30'
                                  }\`}
                                  title="Review CAC registration document"
                                >
                                  <ShieldCheck className="w-3.5 h-3.5" />
                                  <span>{t.cacStatus === 'verified' ? '✓ CAC' : '⏳ CAC'}</span>
                                </button>
                              )}

                              <button
                                onClick={() => handleLoginAs(t)}`;

if (!txt.includes(marker)) {
  console.error('MARKER NOT FOUND in file');
  process.exit(1);
}

const updated = txt.replace(marker, replacement);
fs.writeFileSync(filePath, updated, 'utf8');
console.log('CAC review button inserted successfully.');
