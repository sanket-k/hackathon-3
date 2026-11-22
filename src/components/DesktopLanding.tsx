import React, { useRef, useState } from 'react';
import type { AuditResult, LanguageCode, VaultDocument } from '../types/contract';
import { ALL_PRESETS } from '../data/presets';
import { estimateDocBytes, MAX_TOTAL_BYTES } from '../utils/vaultStore';
import { Icon } from './Icons';

const formatBytes = (bytes: number): string =>
  bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;

interface DesktopLandingProps {
  language: LanguageCode;
  onChangeLanguage: (lang: LanguageCode) => void;
  piiAutoMask: boolean;
  onTogglePiiAutoMask: (v: boolean) => void;
  vaultDocs: VaultDocument[];
  onSelectPreset: (preset: AuditResult) => void;
  onOpenVaultItem: (doc: VaultDocument) => void;
  onClearVault: () => void;
  onFilesSelected: (files: FileList) => void;
  onOpenNav: (view: 'landing' | 'benchmarks' | 'privacy' | 'vault') => void;
  onOpenMobileQr: () => void;
  onSwitchMobilePreview: () => void;
  activeNav: 'landing' | 'benchmarks' | 'privacy' | 'vault';
}

const LANGUAGES: Array<{ code: LanguageCode; label: string }> = [
  { code: 'kn', label: 'ಕನ್ನಡ (Kannada)' },
  { code: 'hi', label: 'हिन्दी (Hindi)' },
  { code: 'ta', label: 'தமிழ் (Tamil)' },
  { code: 'en', label: 'English (EN)' },
];

export const DesktopLanding: React.FC<DesktopLandingProps> = ({
  language,
  onChangeLanguage,
  piiAutoMask,
  onTogglePiiAutoMask,
  vaultDocs,
  onSelectPreset,
  onOpenVaultItem,
  onClearVault,
  onFilesSelected,
  onOpenNav,
  onOpenMobileQr,
  onSwitchMobilePreview,
  activeNav,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const vaultBytes = vaultDocs.reduce((sum, doc) => sum + estimateDocBytes(doc), 0);
  const vaultPercent = Math.min(100, Math.round((vaultBytes / MAX_TOTAL_BYTES) * 100));

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFilesSelected(e.dataTransfer.files);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-surface text-on-surface">
      {/* Top Fixed Header matching D1 */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-surface-container-lowest/90 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
        <div className="h-16 w-full max-w-[1440px] mx-auto px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6 min-w-0">
            <button
              type="button"
              onClick={() => onOpenNav('landing')}
              className="flex items-center gap-2.5 shrink-0 cursor-pointer text-left"
            >
              <div className="w-9 h-9 rounded-lg bg-primary-container flex items-center justify-center text-on-primary">
                <Icon name="verified_user" className="text-[20px]" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="text-[18px] text-on-surface font-bold tracking-tight whitespace-nowrap">
                    LawLens
                  </span>
                  <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed font-semibold">
                    AI
                  </span>
                </div>
                <span className="text-[11px] text-on-surface-variant whitespace-nowrap">
                  Consumer Legal Clarity
                </span>
              </div>
            </button>

            <div className="hidden lg:block w-[1px] h-6 bg-outline-variant/40" />

            <nav className="hidden md:flex items-center gap-1" aria-label="Main navigation">
              <button
                type="button"
                onClick={() => onOpenNav('landing')}
                aria-current={activeNav === 'landing' ? 'page' : undefined}
                className={`px-3 py-1.5 rounded-lg text-[13px] font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  activeNav === 'landing'
                    ? 'bg-surface-container-high text-on-surface'
                    : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                }`}
              >
                Analyzer Workspace
              </button>
              <button
                type="button"
                onClick={() => onOpenNav('vault')}
                aria-current={activeNav === 'vault' ? 'page' : undefined}
                className={`px-3 py-1.5 rounded-lg text-[13px] font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  activeNav === 'vault'
                    ? 'bg-surface-container-high text-on-surface'
                    : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                }`}
              >
                Saved Vault
              </button>
              <button
                type="button"
                onClick={() => onOpenNav('benchmarks')}
                aria-current={activeNav === 'benchmarks' ? 'page' : undefined}
                className={`px-3 py-1.5 rounded-lg text-[13px] font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  activeNav === 'benchmarks'
                    ? 'bg-surface-container-high text-on-surface'
                    : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                }`}
              >
                Risk Benchmark Index
              </button>
              <button
                type="button"
                onClick={() => onOpenNav('privacy')}
                aria-current={activeNav === 'privacy' ? 'page' : undefined}
                className={`px-3 py-1.5 rounded-lg text-[13px] font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  activeNav === 'privacy'
                    ? 'bg-surface-container-high text-on-surface'
                    : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                }`}
              >
                Local Privacy Audit
              </button>
            </nav>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => onOpenNav('vault')}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container-low text-on-surface hover:bg-surface-container transition-colors text-xs font-semibold whitespace-nowrap cursor-pointer"
            >
              <Icon name="folder_special" className="text-[17px] text-on-surface-variant" />
              <span>Vault</span>
              <span className="px-1.5 py-0.5 rounded-full bg-surface-container-highest text-on-surface-variant font-bold text-[11px] tabular-nums">
                {vaultDocs.length}
              </span>
            </button>

            <div className="hidden md:flex items-center gap-1 p-1 rounded-xl bg-surface-container border border-outline-variant/40">
              <button
                type="button"
                onClick={() => onSelectPreset(ALL_PRESETS[0])}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary-container text-on-primary text-[11px] font-bold shadow-sm whitespace-nowrap cursor-pointer"
              >
                <Icon name="splitscreen" className="text-[14px]" />
                <span>D2 Split Workspace</span>
              </button>
              <button
                type="button"
                onClick={onOpenMobileQr}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high text-[11px] font-semibold whitespace-nowrap cursor-pointer"
                title="Open Mobile QR"
              >
                <Icon name="qr_code_2" className="text-[14px]" />
                <span>QR</span>
              </button>
              <button
                type="button"
                onClick={onSwitchMobilePreview}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-on-surface-variant hover:text-primary-container hover:bg-surface-container-high text-[11px] font-semibold whitespace-nowrap cursor-pointer"
                title="Preview Mobile Flow (M1)"
              >
                <Icon name="phone_iphone" className="text-[14px]" />
                <span>Mobile Flow</span>
              </button>
            </div>

            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
              <Icon name="person" className="text-on-primary text-[18px]" />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full pt-16 bg-surface">
        <div className="w-full max-w-[1440px] mx-auto px-6 py-6 flex flex-col gap-8">
          {/* Context & Rule Corpus Row */}
          <div className="w-full flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-surface-container-high text-on-surface text-xs shadow-sm">
              <span className="w-2 h-2 rounded-full bg-primary-container" />
              <span className="font-bold text-primary-container tracking-wider uppercase">Local Engine Ready</span>
              <span className="text-on-surface-variant">•</span>
              <span className="text-on-surface-variant font-medium">
                On-Device PDF Parser + PII Shield Initialized
              </span>
            </div>

            <button
              type="button"
              onClick={() => onOpenNav('benchmarks')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container text-on-surface text-xs font-semibold hover:bg-surface-container-high transition-colors cursor-pointer"
            >
              <Icon name="shield" className="text-[16px] text-primary-container" />
              <span>Statutory Indian Law Corpus</span>
              <span className="px-1.5 py-0.5 rounded bg-surface-container-highest text-on-surface-variant text-[11px] font-bold">
                Nov 2026
              </span>
            </button>
          </div>

          {/* Hero Section */}
          <section className="flex flex-col items-center text-center max-w-4xl mx-auto space-y-4">
            <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-surface-container text-primary-container text-xs font-semibold">
              <Icon name="verified_user" className="text-[15px]" />
              <span>AI Legal Aide • On-Device PII Protection • 60-Second X-Ray</span>
            </div>
            <h1 className="text-[32px] leading-[40px] font-bold text-on-surface tracking-[-0.02em] max-w-3xl text-balance">
              Understand any consumer contract in 60 seconds —{' '}
              <span className="text-primary-container">in your language.</span>
            </h1>
            <p className="text-[16px] leading-[25px] text-on-surface-variant max-w-2xl">
              Spot hidden fees, unfair lock-ins, statutory conflicts, and unilateral hikes before you sign. 100%
              on-device PII masking protects Aadhaar, PAN, and bank details.
            </p>

            {/* Language Selection Bar */}
            <div className="pt-1 flex flex-wrap items-center justify-center gap-3">
              <span className="text-xs font-semibold text-on-surface-variant flex items-center gap-1">
                <Icon name="translate" className="text-[18px]" />
                Explain Analysis In:
              </span>
              <div className="inline-flex items-center p-1 rounded-xl bg-surface-container-low gap-1" role="radiogroup">
                {LANGUAGES.map((l) => {
                  const active = language === l.code;
                  return (
                    <button
                      key={l.code}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => onChangeLanguage(l.code)}
                      className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                        active
                          ? 'bg-primary-container text-on-primary shadow-sm'
                          : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                      }`}
                    >
                      {active && <Icon name="check_circle" className="text-[16px]" />}
                      <span>{l.label}</span>
                    </button>
                  );
                })}
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container text-on-surface-variant text-[11px] font-medium">
                <Icon name="record_voice_over" className="text-[16px] text-primary-container" />
                <span>Audio + Text Summary Mode Active</span>
              </div>
            </div>
          </section>

          {/* Center Stage: Dropzone (8 Cols) + Local Vault Rail (4 Cols) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-8 flex flex-col gap-4">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`relative group rounded-2xl bg-surface-container-lowest p-8 sm:p-12 shadow-sm hover:shadow-md transition-all flex flex-col items-center justify-center text-center border ${
                  isDragging
                    ? 'border-2 border-primary-container bg-surface-container-low'
                    : 'border-outline-variant/40'
                }`}
              >
                <div className="relative mb-6">
                  <div className="w-24 h-24 rounded-full bg-surface-container-low flex items-center justify-center group-hover:scale-105 transition-transform duration-300">
                    <div className="w-16 h-16 rounded-xl bg-primary-container text-on-primary flex items-center justify-center shadow-md">
                      <Icon name="document_scanner" className="text-[36px]" />
                    </div>
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-surface-container-lowest shadow-sm flex items-center justify-center text-primary-container border border-outline-variant/30">
                    <Icon name="verified" className="text-[18px]" />
                  </div>
                </div>

                <h2 className="text-[18px] leading-[24px] text-on-surface font-bold tracking-tight mb-1">
                  Drag and drop your contract PDF or captured photos here
                </h2>
                <p className="text-[15px] text-on-surface-variant max-w-lg mb-6">
                  Supports multipage PDF, PNG, JPG, or HEIC • Up to 25MB • Local client-side extraction
                </p>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      onFilesSelected(e.target.files);
                    }
                  }}
                />

                <div className="flex flex-wrap items-center justify-center gap-4 w-full max-w-md mb-6">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 min-w-[180px] inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-primary-container text-on-primary text-sm font-semibold shadow-sm hover:opacity-95 transition-opacity cursor-pointer"
                  >
                    <Icon name="upload_file" className="text-[20px]" />
                    <span>Browse &amp; Analyze</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelectPreset(ALL_PRESETS[0])}
                    className="flex-1 min-w-[180px] inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-surface-container-high text-on-surface text-sm font-semibold hover:bg-surface-container-highest transition-colors cursor-pointer"
                  >
                    <Icon name="splitscreen" className="text-[20px]" />
                    <span>Open D2 Split X-Ray</span>
                  </button>
                </div>

                {/* Integrated On-Device Privacy Toggle */}
                <div className="w-full max-w-xl p-4 rounded-lg bg-surface-container-low flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-left">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-surface-container-lowest flex items-center justify-center text-primary-container shrink-0 shadow-sm">
                      <Icon name="enhanced_encryption" className="text-[20px]" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs text-on-surface font-bold">
                        Auto-mask Aadhaar, Phone &amp; PAN on-device
                      </span>
                      <span className="text-[11px] text-on-surface-variant">
                        Client-side sanitization strips PII fields prior to vector PDF parsing
                      </span>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={piiAutoMask}
                      onChange={(e) => onTogglePiiAutoMask(e.target.checked)}
                      className="sr-only peer"
                      aria-label="Auto-mask Aadhaar, Phone and PAN on-device"
                    />
                    <div className="w-11 h-6 bg-surface-container-highest rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-container peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary-container" />
                  </label>
                </div>
              </div>

              {/* Four Diagnostic Micro-Badges */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {[
                  { icon: 'speed', title: '60-Sec Engine', sub: 'Parallel Clause Scan', warn: false },
                  { icon: 'gavel', title: 'Statutory Check', sub: 'Real Estate & Labor', warn: false },
                  { icon: 'warning', title: 'Unilateral Traps', sub: 'Notice & Penalty Hikes', warn: true },
                  {
                    icon: 'lock_person',
                    title: 'On-Device PII Masking',
                    sub: '1500px Downscale · EXIF Stripped',
                    warn: false,
                  },
                ].map((b) => (
                  <div
                    key={b.title}
                    className="p-3 rounded-lg bg-surface-container-lowest shadow-sm border border-outline-variant/30 flex items-center gap-2"
                  >
                    <Icon
                      name={b.icon}
                      className={`text-[18px] ${b.warn ? 'text-tertiary' : 'text-primary-container'}`}
                    />
                    <div className="flex flex-col">
                      <span className="text-[11px] text-on-surface font-bold">{b.title}</span>
                      <span className="text-[11px] text-on-surface-variant">{b.sub}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Rail: Local Vault */}
            <div className="lg:col-span-4 flex flex-col gap-4">
              <div className="rounded-xl bg-surface-container-lowest p-4 shadow-sm border border-outline-variant/40 flex flex-col">
                <div className="flex items-center justify-between pb-2">
                  <div className="flex items-center gap-1.5">
                    <Icon name="folder_special" className="text-primary-container text-[20px]" />
                    <h3 className="text-[18px] text-on-surface font-bold">Recent Local Scans</h3>
                  </div>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed font-bold">
                    Local Vault
                  </span>
                </div>
                <p className="text-[11px] text-on-surface-variant mb-4">
                  Stored locally in browser storage. Zero telemetry transmitted.
                </p>

                <div className="flex flex-col gap-1.5">
                  {vaultDocs.length === 0 ? (
                    <div className="p-4 rounded-lg bg-surface-container-low text-center text-xs text-on-surface-variant">
                      Vault is empty. Analyze a contract or click a preset below.
                    </div>
                  ) : (
                    vaultDocs.slice(0, 3).map((doc) => {
                      const isHigh = doc.audit.summary.risk_score >= 60;
                      return (
                        <button
                          key={doc.id}
                          type="button"
                          onClick={() => onOpenVaultItem(doc)}
                          className="w-full text-left p-2.5 rounded-lg bg-surface-container-low hover:bg-surface-container transition-colors cursor-pointer flex items-center justify-between group"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 font-bold text-xs tabular-nums ${
                                isHigh
                                  ? 'bg-error-container text-on-error-container'
                                  : 'bg-secondary-fixed text-on-secondary-fixed'
                              }`}
                            >
                              {doc.audit.summary.risk_score}
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="text-xs text-on-surface font-bold truncate group-hover:text-primary-container transition-colors">
                                {doc.customTag}
                              </span>
                              <span className="text-[11px] text-on-surface-variant truncate">
                                {doc.scannedAt} • {doc.audit.findings.length} Flagged Clauses
                              </span>
                            </div>
                          </div>
                          <Icon
                            name="chevron_right"
                            className="text-on-surface-variant group-hover:translate-x-0.5 transition-transform text-[18px]"
                          />
                        </button>
                      );
                    })
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-surface-container flex flex-col gap-1.5">
                  <div className="flex justify-between items-center text-[11px] text-on-surface-variant">
                    <span>Local Storage Sandbox:</span>
                    <span className="font-bold text-on-surface tabular-nums">
                      {formatBytes(vaultBytes)} / {MAX_TOTAL_BYTES / 1024} KB
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
                    <div
                      className="bg-primary-container h-full rounded-full transition-all"
                      style={{ width: `${vaultPercent}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-on-surface-variant flex items-center gap-1">
                      <Icon name="cloud_off" className="text-[14px] text-primary-container" />
                      Zero Cloud Sync
                    </span>
                    <button
                      type="button"
                      onClick={onClearVault}
                      className="text-[11px] font-bold text-primary-container hover:underline cursor-pointer"
                    >
                      Clear Vault
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded-xl bg-surface-container p-4 flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5 text-primary-container">
                  <Icon name="lightbulb" className="text-[20px]" />
                  <span className="text-xs font-bold">Pro-Tip for Rental Agreements</span>
                </div>
                <p className="text-[13px] leading-[19px] text-on-surface-variant">
                  Under Karnataka Model Tenancy Act §10, security deposits cannot exceed 2 months&apos; rent for
                  residential premises. LawLens checks this automatically.
                </p>
              </div>
            </div>
          </div>

          {/* Four One-Tap Evaluation Presets */}
          <section className="w-full flex flex-col gap-4 pt-2">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
              <div>
                <span className="text-[11px] text-primary-container font-bold uppercase tracking-wider">
                  Instant Testing Benchmarks
                </span>
                <h2 className="text-[22px] leading-[28px] text-on-surface font-bold">
                  One-Tap Evaluation Presets
                </h2>
              </div>
              <p className="text-[13px] text-on-surface-variant max-w-md">
                Inspect real-world Indian contracts curated with highlighted clause risks, statutory violations, and
                structural stress points.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {ALL_PRESETS.map((preset, idx) => {
                const isStress = preset.id === 'missing-page-stress';
                const isSafe = preset.summary.risk_band === 'safe';
                const badgeLabel =
                  idx === 0
                    ? 'High Conflict'
                    : idx === 1
                      ? 'Hidden Charges'
                      : idx === 2
                        ? 'Fair / Standard'
                        : 'Stress Test';
                const cardIcon =
                  idx === 0 ? 'home_work' : idx === 1 ? 'account_balance' : idx === 2 ? 'badge' : 'broken_image';

                return (
                  <div
                    key={preset.id}
                    className="rounded-xl bg-surface-container-lowest p-4 shadow-sm hover:shadow-md transition-all border border-outline-variant/40 flex flex-col justify-between group"
                  >
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
                            isSafe
                              ? 'bg-secondary-fixed text-on-secondary-fixed'
                              : 'bg-error-container text-on-error-container'
                          }`}
                        >
                          {badgeLabel}
                        </span>
                        <Icon
                          name={cardIcon}
                          className={`text-[18px] ${isStress ? 'text-error' : 'text-on-surface-variant'}`}
                        />
                      </div>
                      <h3
                        className={`text-[17px] leading-[23px] font-bold mt-1 transition-colors ${
                          isStress
                            ? 'text-on-surface group-hover:text-error'
                            : 'text-on-surface group-hover:text-primary-container'
                        }`}
                      >
                        {preset.title.split(' • ')[0]}
                      </h3>
                      <span
                        className={`text-[11px] ${
                          isStress ? 'text-error font-medium' : 'text-on-surface-variant'
                        }`}
                      >
                        {preset.subtitle}
                      </span>
                      <div className="mt-2 pt-1 flex flex-col gap-1.5 text-[13px] text-on-surface-variant">
                        <div className="flex items-center gap-1.5">
                          <Icon
                            name={isStress ? 'error' : 'check_circle'}
                            className={`text-[16px] ${isStress ? 'text-error' : 'text-tertiary'}`}
                          />
                          <span>{preset.meta_badge}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Icon
                            name={idx === 0 ? 'currency_rupee' : idx === 1 ? 'priority_high' : 'find_in_page'}
                            className={`text-[16px] ${isSafe ? 'text-on-surface-variant' : 'text-error'}`}
                          />
                          <span className="font-semibold text-on-surface">
                            {preset.summary.rupee_exposure_inr > 0
                              ? `₹${preset.summary.rupee_exposure_inr.toLocaleString('en-IN')} Risk Exposure`
                              : preset.summary.breakdown_cards[0]?.value + ' Notice Lock'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-on-surface-variant">
                          <Icon name="shield_with_heart" className="text-[14px]" />
                          <span className="truncate">{preset.rule_pack_applied.display_name}</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-2">
                      <button
                        type="button"
                        onClick={() => onSelectPreset(preset)}
                        className={`w-full flex items-center justify-center gap-1.5 py-2 px-4 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                          idx === 0
                            ? 'bg-primary-container text-on-primary shadow-sm hover:opacity-95'
                            : isStress
                              ? 'bg-error-container text-on-error-container hover:bg-error hover:text-on-error'
                              : 'bg-surface-container hover:bg-primary-container hover:text-on-primary text-on-surface'
                        }`}
                      >
                        <span>
                          {idx === 0
                            ? 'Inspect in D2 Workspace'
                            : isStress
                              ? 'Run Stress Test'
                              : 'Inspect Preset'}
                        </span>
                        <Icon
                          name={idx === 0 ? 'open_in_new' : isStress ? 'bolt' : 'arrow_forward'}
                          className="text-[16px]"
                        />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Trust & Statutory Proof Badges */}
          <section className="w-full pt-2 pb-4">
            <div className="rounded-xl bg-surface-container-low p-6 flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary-container text-on-primary flex items-center justify-center shadow-sm shrink-0">
                  <Icon name="verified" className="text-[24px]" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[17px] text-on-surface font-bold">
                    Client-Verified Consumer Protection
                  </span>
                  <span className="text-[13px] text-on-surface-variant">
                    Informational clarity only — not formal legal representation. Built to spot asymmetric clauses.
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full md:w-auto">
                <div className="flex items-center gap-2">
                  <Icon name="account_balance" className="text-primary-container text-[20px]" />
                  <div className="flex flex-col">
                    <span className="text-xs text-on-surface font-bold">Karnataka Tenancy 2021</span>
                    <span className="text-[11px] text-on-surface-variant">Model Tenancy Cross-check</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Icon name="key" className="text-primary-container text-[20px]" />
                  <div className="flex flex-col">
                    <span className="text-xs text-on-surface font-bold">Local PII Shield</span>
                    <span className="text-[11px] text-on-surface-variant">Client-side Fail-Closed Guard</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Icon name="security_update_good" className="text-primary-container text-[20px]" />
                  <div className="flex flex-col">
                    <span className="text-xs text-on-surface font-bold">Zero Cloud Retention</span>
                    <span className="text-[11px] text-on-surface-variant">No training on contracts</span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>

      <footer className="w-full bg-surface-container-low mt-8">
        <div className="w-full max-w-[1440px] mx-auto px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-4 text-on-surface-variant">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-primary-container flex items-center justify-center text-on-primary">
              <Icon name="verified_user" className="text-[14px]" />
            </div>
            <span className="text-xs text-on-surface font-semibold">LawLens AI</span>
            <span className="text-[13px] text-on-surface-variant">
              — Consumer Protection &amp; Grounded Legal Review
            </span>
          </div>
          <div className="flex items-center gap-6 text-xs font-medium">
            <span className="flex items-center gap-1">
              <Icon name="encrypted" className="text-[16px] text-primary-container" />
              Client-Side Sandbox Execution
            </span>
            <span className="hidden sm:inline">© 2026 LawLens. Informational Clarity Only.</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
