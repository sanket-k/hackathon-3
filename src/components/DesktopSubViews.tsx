import React, { useState } from 'react';
import type { VaultDocument } from '../types/contract';
import { RULE_PACKS } from '../data/rulePacks';
import { maskIndianPII } from '../utils/piiGuard';
import { estimateDocBytes, MAX_DOC_BYTES, MAX_TOTAL_BYTES } from '../utils/vaultStore';
import { Icon } from './Icons';

const formatBytes = (bytes: number): string =>
  bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;

interface DesktopSubViewsProps {
  view: 'vault' | 'benchmarks' | 'privacy';
  vaultDocs: VaultDocument[];
  onNavigate: (view: 'landing' | 'vault' | 'benchmarks' | 'privacy') => void;
  onOpenVaultItem: (doc: VaultDocument) => void;
  onDeleteVaultItem: (id: string) => void;
  onUpdateVaultTag: (id: string, tag: string) => void;
  onClearVault: () => void;
  onExportVaultJson: () => void;
  onToast: (msg: string) => void;
}

export const DesktopSubViews: React.FC<DesktopSubViewsProps> = ({
  view,
  vaultDocs,
  onNavigate,
  onOpenVaultItem,
  onDeleteVaultItem,
  onUpdateVaultTag,
  onClearVault,
  onExportVaultJson,
  onToast,
}) => {
  const [vaultFilter, setVaultFilter] = useState<'all' | 'rental' | 'loan' | 'employment'>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTagValue, setEditTagValue] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);

  // Live PII sandbox tester on Privacy Audit page
  const [sampleInput, setSampleInput] = useState(
    'Lessor: Mr. Ramesh Nair (Aadhaar: 4567 8912 3456, PAN: ABCDE1234F, +91 98450 11223) agrees to lease Flat 304, Indiranagar, Bengaluru.',
  );
  const liveMaskPreview = maskIndianPII(sampleInput);

  const filteredDocs =
    vaultFilter === 'all' ? vaultDocs : vaultDocs.filter((d) => d.audit.category === vaultFilter);

  const vaultBytes = vaultDocs.reduce((sum, doc) => sum + estimateDocBytes(doc), 0);
  const vaultPercent = Math.min(100, Math.round((vaultBytes / MAX_TOTAL_BYTES) * 100));

  return (
    <div className="min-h-screen flex flex-col bg-surface text-on-surface">
      {/* Shared Top Bar */}
      <header className="sticky top-0 z-40 bg-surface-container-lowest/95 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
        <div className="h-16 w-full max-w-[1440px] mx-auto px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => onNavigate('landing')}
              className="flex items-center gap-2.5 cursor-pointer text-left"
            >
              <div className="w-9 h-9 rounded-lg bg-primary-container flex items-center justify-center text-white">
                <Icon name="verified_user" className="text-[20px]" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="text-[18px] font-bold tracking-tight whitespace-nowrap">LawLens</span>
                  <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed font-semibold">
                    AI
                  </span>
                </div>
                <span className="text-[11px] text-on-surface-variant whitespace-nowrap">Consumer Legal Clarity</span>
              </div>
            </button>

            <nav className="hidden md:flex items-center gap-1" aria-label="Main navigation">
              {(
                [
                  ['landing', 'Analyzer Workspace'],
                  ['vault', 'Saved Vault'],
                  ['benchmarks', 'Risk Benchmark Index'],
                  ['privacy', 'Local Privacy Audit'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => onNavigate(key)}
                  className={`px-3 py-1.5 rounded-lg text-[13px] font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    view === key
                      ? 'bg-surface-container-high text-on-surface'
                      : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                  }`}
                >
                  {label}
                </button>
              ))}
            </nav>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('landing')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary-container text-white text-xs font-bold whitespace-nowrap cursor-pointer"
          >
            <Icon name="arrow_back" className="text-[16px]" />
            <span>Back to Analyzer</span>
          </button>
        </div>
      </header>

      <main className="flex-1 w-full max-w-[1280px] mx-auto px-6 py-8 space-y-8">
        {view === 'vault' && (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-primary-container">
                  On-Device Sandboxed Repository
                </span>
                <h1 className="text-2xl font-bold text-on-surface">Saved Local Contract Vault ({vaultDocs.length})</h1>
                <p className="text-sm text-on-surface-variant mt-1">
                  All scans, private voice notes, and redacted reports live strictly in your browser storage.
                </p>
                <div className="mt-3 flex items-center gap-2.5 max-w-sm">
                  <div className="flex-1 h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
                    <div
                      className="bg-primary-container h-full rounded-full transition-all"
                      style={{ width: `${vaultPercent}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-bold text-on-surface tabular-nums whitespace-nowrap">
                    {formatBytes(vaultBytes)} / {MAX_TOTAL_BYTES / 1024} KB
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onExportVaultJson}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-outline-variant/50 text-xs font-bold hover:bg-surface-container-low cursor-pointer"
                >
                  <Icon name="download" className="text-[16px] text-primary-container" />
                  <span>Export JSON</span>
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-error-container text-on-error-container text-xs font-bold hover:bg-error hover:text-white transition-colors cursor-pointer"
                >
                  <Icon name="delete_sweep" className="text-[16px]" />
                  <span>Clear All</span>
                </button>
              </div>
            </div>

            {confirmClear && (
              <div className="p-4 rounded-2xl bg-red-50 border border-red-300 flex items-center justify-between gap-4">
                <div className="text-xs text-red-950">
                  <strong>Confirm Clear Local Vault?</strong> This permanently removes all {vaultDocs.length} saved
                  contract audits from browser storage.
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setConfirmClear(false)}
                    className="px-3 py-1.5 rounded-lg bg-white border border-outline-variant text-xs font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onClearVault();
                      setConfirmClear(false);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-error text-white text-xs font-bold cursor-pointer"
                  >
                    Yes, Clear Vault
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 flex-wrap">
              {(
                [
                  ['all', `All (${vaultDocs.length})`],
                  ['rental', `Rental (${vaultDocs.filter((d) => d.audit.category === 'rental').length})`],
                  ['loan', `Loans & Finance (${vaultDocs.filter((d) => d.audit.category === 'loan').length})`],
                  ['employment', `Employment (${vaultDocs.filter((d) => d.audit.category === 'employment').length})`],
                ] as const
              ).map(([cat, label]) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setVaultFilter(cat)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-bold cursor-pointer ${
                    vaultFilter === cat
                      ? 'bg-primary-container text-white'
                      : 'bg-white border border-outline-variant/40 text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredDocs.length === 0 ? (
                <div className="col-span-full p-10 rounded-2xl bg-white border border-outline-variant/40 text-center space-y-2">
                  <Icon name="folder_open" className="text-4xl text-on-surface-variant mx-auto" />
                  <p className="text-sm font-bold text-on-surface">No contracts in this category</p>
                  <p className="text-xs text-on-surface-variant">
                    Analyze a PDF/photo or open a preset from the Analyzer Workspace to save it here.
                  </p>
                </div>
              ) : (
                filteredDocs.map((doc) => {
                  const isHigh = doc.audit.summary.risk_score >= 60;
                  const docBytes = estimateDocBytes(doc);
                  const isOverDocBudget = docBytes > MAX_DOC_BYTES;
                  const isIncomplete = doc.audit.completeness.status === 'missing_pages';
                  const firstGap = doc.audit.completeness.missing_gaps[0];
                  return (
                    <div
                      key={doc.id}
                      className="rounded-2xl bg-white border border-outline-variant/40 p-5 shadow-xs flex flex-col justify-between gap-4"
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-surface-container text-primary-container">
                            {doc.statusLabel}
                          </span>
                          <span
                            className={`text-xs font-extrabold px-2.5 py-0.5 rounded-lg tabular-nums ${
                              isHigh
                                ? 'bg-red-100 text-error'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {doc.audit.summary.risk_band_label}
                          </span>
                        </div>

                        {editingId === doc.id ? (
                          <div className="flex gap-1.5">
                            <input
                              type="text"
                              value={editTagValue}
                              onChange={(e) => setEditTagValue(e.target.value)}
                              className="flex-1 rounded-lg border border-primary-container px-2.5 py-1 text-xs font-bold"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (editTagValue.trim()) {
                                  onUpdateVaultTag(doc.id, editTagValue.trim());
                                }
                                setEditingId(null);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-primary-container text-white text-xs font-bold cursor-pointer"
                            >
                              Save
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-2">
                            <h3 className="text-base font-bold text-on-surface truncate">{doc.customTag}</h3>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingId(doc.id);
                                setEditTagValue(doc.customTag);
                              }}
                              aria-label="Edit label"
                              className="text-on-surface-variant hover:text-primary-container cursor-pointer"
                            >
                              <Icon name="edit" className="text-[16px]" />
                            </button>
                          </div>
                        )}

                        <p className="text-xs text-on-surface-variant">
                          {doc.scannedAt} • {doc.audit.meta_badge}
                        </p>

                        {(isIncomplete || isOverDocBudget) && (
                          <div className="flex flex-wrap gap-1.5">
                            {isIncomplete && (
                              <span
                                title={
                                  firstGap
                                    ? `Missing page or annexure: ${firstGap}`
                                    : 'Some pages are missing from this scan'
                                }
                                className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50/35 border border-amber-300 text-amber-800"
                              >
                                Incomplete scan
                              </span>
                            )}
                            {isOverDocBudget && (
                              <span
                                title={`${formatBytes(docBytes)} exceeds the ${MAX_DOC_BYTES / 1024} KB per-document storage cap — this scan is kept in memory only.`}
                                className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50/35 border border-amber-300 text-amber-800"
                              >
                                Over budget · {formatBytes(docBytes)}
                              </span>
                            )}
                          </div>
                        )}

                        <div className="flex flex-wrap gap-1.5">
                          {doc.audit.findings.slice(0, 2).map((f) => (
                            <span
                              key={f.finding_id}
                              className="text-[10px] font-semibold px-2 py-0.5 rounded bg-surface-container-low border border-outline-variant/40 text-on-surface"
                            >
                              {f.negotiation.short_title}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-2 border-t border-outline-variant/30">
                        <button
                          type="button"
                          onClick={() => onOpenVaultItem(doc)}
                          className="flex-1 py-2 px-3 rounded-xl bg-primary-container text-white text-xs font-bold hover:opacity-95 cursor-pointer"
                        >
                          Open in X-Ray →
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteVaultItem(doc.id)}
                          aria-label={`Delete ${doc.customTag}`}
                          className="p-2 rounded-xl bg-surface-container-low hover:bg-red-100 text-on-surface-variant hover:text-error cursor-pointer"
                        >
                          <Icon name="delete" className="text-[18px]" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}

        {view === 'benchmarks' && (
          <>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-primary-container">
                Deterministic Rule Packs (Nov 2026)
              </span>
              <h1 className="text-2xl font-bold text-on-surface">Indian Consumer Statutory &amp; Risk Benchmark Index</h1>
              <p className="text-sm text-on-surface-variant mt-1">
                Every LawLens clause rating maps strictly to a cited statutory rule or regional market benchmark.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {Object.values(RULE_PACKS).map((pack) => (
                <div
                  key={pack.pack_id}
                  className="rounded-2xl bg-white border border-outline-variant/40 p-6 shadow-xs space-y-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-surface-container text-primary-container">
                        {pack.pack_id}
                      </span>
                      <h2 className="text-lg font-bold text-on-surface mt-1.5">{pack.display_name}</h2>
                    </div>
                    <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
                      Verified {pack.verified_date}
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {pack.rules.map((r) => (
                      <div key={r.rule_id} className="p-3 rounded-xl bg-surface-container-low space-y-1 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-on-surface">{r.title}</span>
                          <span className="text-[10px] font-bold uppercase text-primary-container">
                            Norm: {r.benchmark.typical_label}
                          </span>
                        </div>
                        <p className="text-[11px] text-on-surface-variant">{r.detection_hint}</p>
                        <p className="text-[10px] font-mono text-on-surface-variant">
                          Basis: {r.statutory_citation.act} ({r.statutory_citation.section})
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {view === 'privacy' && (
          <>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                Zero-Cloud PII Architecture
              </span>
              <h1 className="text-2xl font-bold text-on-surface">Local Privacy Audit &amp; Fail-Closed PII Shield</h1>
              <p className="text-sm text-on-surface-variant mt-1">
                Verify how LawLens strips Aadhaar, PAN, phone numbers, IFSC, and party identities before any AI call.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                {
                  icon: 'devices',
                  title: 'Lane A: On-Device Vector PDF',
                  body: 'pdfjs-dist parses text inside browser memory. Raw PDF bytes never cross the network.',
                },
                {
                  icon: 'photo_camera',
                  title: 'Lane B: EXIF-Stripped Canvas Photo',
                  body: 'Photos are re-encoded on Canvas to ≤1500px JPEG, wiping GPS coordinates and device metadata.',
                },
                {
                  icon: 'verified_user',
                  title: 'Layer 3 Fail-Closed Leak Check',
                  body: 'Outbound requests run assertNoPiiLeak() and abort if any Aadhaar or PAN regex survives.',
                },
              ].map((card) => (
                <div key={card.title} className="p-5 rounded-2xl bg-white border border-outline-variant/40 space-y-2">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
                    <Icon name={card.icon} className="text-[22px]" />
                  </div>
                  <h3 className="text-sm font-bold text-on-surface">{card.title}</h3>
                  <p className="text-xs text-on-surface-variant leading-relaxed">{card.body}</p>
                </div>
              ))}
            </div>

            <div className="rounded-2xl bg-white border border-outline-variant/40 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-on-surface">Live Client-Side PII Redaction Tester</h2>
                  <p className="text-xs text-on-surface-variant">
                    Type or paste sample contract text containing Aadhaar, PAN, or +91 numbers to inspect masking.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onToast(`Masked ${liveMaskPreview.totalMasked} sensitive tokens locally.`)}
                  className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-bold cursor-pointer"
                >
                  {liveMaskPreview.totalMasked} Tokens Masked
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="pii-raw-input" className="text-xs font-bold text-on-surface">
                    Raw Input (Stays in Browser)
                  </label>
                  <textarea
                    id="pii-raw-input"
                    rows={4}
                    value={sampleInput}
                    onChange={(e) => setSampleInput(e.target.value)}
                    className="w-full rounded-xl border border-outline-variant/60 p-3 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <span className="text-xs font-bold text-emerald-800 block">
                    Sanitized Outbound Payload
                  </span>
                  <div className="w-full min-h-[102px] rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-xs font-mono text-emerald-950 break-words">
                    {liveMaskPreview.maskedText}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
};
