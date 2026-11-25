const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/components/SuperAdmin/SuperAdminView.tsx');
let txt = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');

const lines = txt.split('\n');
const idx = lines.findIndex(l => l.includes('Admin QR') && l.includes('Links Popup Modal'));
if (idx === -1) { console.error('Line not found'); process.exit(1); }

const cacModalLines = [
  `      {/* ── CAC Review Modal ── */}`,
  `      {viewingCacModal && (`,
  `        <div className="fixed inset-0 bg-black/80 z-[9999] flex items-center justify-center p-4" onClick={() => setViewingCacModal(null)}>`,
  `          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4" onClick={e => e.stopPropagation()}>`,
  `            <div className="flex items-center justify-between">`,
  `              <div>`,
  `                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">CAC Document Review</p>`,
  `                <h3 className="text-white font-bold text-sm mt-0.5">{viewingCacModal.tenantName}</h3>`,
  `              </div>`,
  `              <button onClick={() => setViewingCacModal(null)} className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer">`,
  `                <X className="w-4 h-4" />`,
  `              </button>`,
  `            </div>`,
  `            <img`,
  `              src={viewingCacModal.url}`,
  `              alt="CAC Certificate"`,
  `              className="w-full max-h-80 object-contain rounded-xl border border-neutral-700 bg-neutral-950"`,
  `            />`,
  `            <div className="flex items-center gap-2">`,
  `              <button`,
  `                type="button"`,
  `                onClick={async () => {`,
  `                  await syncRestaurantMetaToSupabase(viewingCacModal.tenantId, { cacStatus: 'verified' });`,
  `                  setTenants(prev => prev.map(t => t.id === viewingCacModal.tenantId ? { ...t, cacStatus: 'verified' } : t));`,
  `                  showNotification('CAC marked as verified \u2713');`,
  `                  setViewingCacModal(null);`,
  `                }}`,
  `                className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs cursor-pointer transition-colors"`,
  `              >`,
  `                \u2713 Mark Verified`,
  `              </button>`,
  `              <button`,
  `                type="button"`,
  `                onClick={async () => {`,
  `                  await syncRestaurantMetaToSupabase(viewingCacModal.tenantId, { cacStatus: 'rejected' });`,
  `                  setTenants(prev => prev.map(t => t.id === viewingCacModal.tenantId ? { ...t, cacStatus: 'rejected' } : t));`,
  `                  showNotification('CAC marked as rejected');`,
  `                  setViewingCacModal(null);`,
  `                }}`,
  `                className="px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 font-bold rounded-xl text-xs cursor-pointer transition-colors"`,
  `              >`,
  `                \u2717 Reject`,
  `              </button>`,
  `              <a`,
  `                href={viewingCacModal.url}`,
  `                target="_blank"`,
  `                rel="noreferrer"`,
  `                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold rounded-xl text-xs cursor-pointer transition-colors"`,
  `              >`,
  `                Open Full`,
  `              </a>`,
  `            </div>`,
  `          </div>`,
  `        </div>`,
  `      )}`,
  ``,
];

// Insert before the Admin QR line
lines.splice(idx, 0, ...cacModalLines);

fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
console.log('CAC review modal inserted before line', idx + 1);
