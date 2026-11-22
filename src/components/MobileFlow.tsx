import React, { useMemo, useRef, useState } from 'react';
import type { AuditResult, LanguageCode, VaultDocument } from '../types/contract';
import { ALL_PRESETS } from '../data/presets';
import { ORIGINAL_SCAN_DEMO_URL, PHOTO_CHECK_DEMO_URL } from '../utils/ingest';
import { calculateWayOutAtMonth } from '../utils/wayOutMath';
import { playRegionalSpeech, stopAllSpeech } from '../utils/audioSync';
import { Icon } from './Icons';

export type MobileScreen =
  | 'm1_analyze'
  | 'm2_photo'
  | 'm3_telemetry'
  | 'm4_report'
  | 'm5_inspector'
  | 'm6_negotiate'
  | 'm7_voice'
  | 'm8_vault';

interface MobileFlowProps {
  screen: MobileScreen;
  onNavigate: (s: MobileScreen) => void;
  audit: AuditResult;
  language: LanguageCode;
  onChangeLanguage: (lang: LanguageCode) => void;
  vaultDocs: VaultDocument[];
  activeVaultDoc?: VaultDocument;
  capturedPhotoUrl: string | null;
  telemetryStage: number;
  onCancelTelemetry: () => void;
  onStartPhotoFlow: (photoUrl?: string) => void;
  onRunPhotoAnalysis: (blackoutEnabled: boolean) => void;
  onFilesSelected: (files: FileList) => void;
  onSelectPreset: (preset: AuditResult) => void;
  onOpenVaultItem: (doc: VaultDocument) => void;
  onUpdateVaultTag: (id: string, tag: string) => void;
  onDeleteVaultItem: (id: string) => void;
  onClearVault: () => void;
  onSaveNote: (text: string, tag?: string) => void;
  onExportVaultJson: () => void;
  onOpenSecurityModal: () => void;
  onSwitchToDesktop?: () => void;
  isDesktopPreview?: boolean;
  onToast: (msg: string) => void;
}

const LANG_OPTIONS: Array<{ code: LanguageCode; native: string; name: string }> = [
  { code: 'kn', native: 'ಕನ್ನಡ', name: 'Kannada' },
  { code: 'hi', native: 'हिन्दी', name: 'Hindi' },
  { code: 'ta', native: 'தமிழ்', name: 'Tamil' },
  { code: 'en', native: 'English', name: 'English' },
];

export const MobileFlow: React.FC<MobileFlowProps> = ({
  screen,
  onNavigate,
  audit,
  language,
  onChangeLanguage,
  vaultDocs,
  activeVaultDoc,
  capturedPhotoUrl,
  telemetryStage,
  onCancelTelemetry,
  onStartPhotoFlow,
  onRunPhotoAnalysis,
  onFilesSelected,
  onSelectPreset,
  onOpenVaultItem,
  onUpdateVaultTag,
  onDeleteVaultItem,
  onClearVault,
  onSaveNote,
  onExportVaultJson,
  onOpenSecurityModal,
  onSwitchToDesktop,
  isDesktopPreview,
  onToast,
}) => {
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // M2 Photo Check states
  const [blackoutEnabled, setBlackoutEnabled] = useState(true);
  const [pageCountDetected, setPageCountDetected] = useState(1);

  // M4 Report states
  const [wayOutMonth, setWayOutMonth] = useState<number>(
    Math.min(Math.max(1, Math.floor((audit.way_out_params.lock_in_months || 6) / 2)), audit.way_out_params.total_months || 11),
  );

  // M5 Clause Inspector states
  const [inspectorTab, setInspectorTab] = useState<'text' | 'photo'>('text');
  const [focusedClauseId, setFocusedClauseId] = useState<string>(audit.clauses[1]?.clause_id || audit.clauses[0]?.clause_id || 'clause-4-2');
  const [ocrVerified, setOcrVerified] = useState(false);
  const [showOcrPopover, setShowOcrPopover] = useState(false);
  const [showPlainBanner, setShowPlainBanner] = useState(true);

  // M6 Negotiate states
  const [selectedAskIds, setSelectedAskIds] = useState<string[]>(() =>
    audit.findings.map((f) => f.finding_id),
  );
  const [tone, setTone] = useState<'polite' | 'firm'>('polite');
  const [channel, setChannel] = useState<'whatsapp' | 'email'>('whatsapp');
  const [draftOverride, setDraftOverride] = useState<string | null>(null);

  // M7 Voice Q&A states
  const [isPlayingVoice, setIsPlayingVoice] = useState(false);
  const [voiceSpeed, setVoiceSpeed] = useState(1.0);
  const [qaText, setQaText] = useState('');
  const [isHoldingMic, setIsHoldingMic] = useState(false);
  const [qaItem, setQaItem] = useState(() => audit.qa_presets[0]);
  const [voiceHistoryCount, setVoiceHistoryCount] = useState(0);

  // M8 Vault states
  const [vaultFilter, setVaultFilter] = useState<'all' | 'rental' | 'loan' | 'employment'>('all');
  const [showClearModal, setShowClearModal] = useState(false);
  const [editingTag, setEditingTag] = useState(false);
  const [tagDraft, setTagDraft] = useState('');
  const [showNoteComposer, setShowNoteComposer] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');

  const langObj = LANG_OPTIONS.find((l) => l.code === language) || LANG_OPTIONS[0];
  const wayOut = useMemo(
    () => calculateWayOutAtMonth(audit.way_out_params, wayOutMonth),
    [audit.way_out_params, wayOutMonth],
  );

  const generatedNegotiateDraft = useMemo(() => {
    const chosen = audit.findings.filter((f) => selectedAskIds.includes(f.finding_id));
    const party = audit.stamp_header.lessor_name || 'Landlord';
    const intro =
      tone === 'polite'
        ? `Hi ${party}, thank you for sharing the agreement. Before signing, could we align on these standard points?`
        : `Dear ${party}, please revise the highlighted clauses below to align with ${audit.rule_pack_applied.display_name}:`;
    const body = chosen
      .map((f, idx) => `${idx + 1}. ${f.negotiation.short_title}: ${tone === 'polite' ? f.negotiation.polite_ask : f.negotiation.firm_ask}`)
      .join('\n');
    const outro =
      tone === 'polite'
        ? 'Happy to sign right away once these are updated. Thank you!'
        : 'Kindly send the revised draft prior to execution.';
    return `${intro}\n\n${body || 'No asks selected.'}\n\n${outro}`;
  }, [audit, selectedAskIds, tone]);

  const activeNegotiateDraft = draftOverride !== null ? draftOverride : generatedNegotiateDraft;

  const handlePlayAudio = async (text: string) => {
    if (isPlayingVoice) {
      stopAllSpeech();
      setIsPlayingVoice(false);
      return;
    }
    await playRegionalSpeech(text, language, voiceSpeed, {
      onStart: () => setIsPlayingVoice(true),
      onEnd: () => setIsPlayingVoice(false),
    });
  };

  const handleAskMobileQA = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed) return;
    setQaText('');
    setVoiceHistoryCount((c) => c + 1);
    const fullContractText = audit.clauses.map((c) => `${c.section_label}: ${c.text}`).join('\n\n');
    try {
      const res = await fetch('/api/qa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: trimmed,
          language,
          contract_text: fullContractText,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          ok?: boolean;
          fallback_recommended?: boolean;
          spoken_script?: string;
          answer_en?: string;
          statutory_note?: string;
          clause_id?: string;
          verbatim_quote?: string;
        };
        if (data.ok && !data.fallback_recommended && data.answer_en) {
          setQaItem({
            chip: trimmed,
            question_native: trimmed,
            question_en: trimmed,
            answer_native: data.spoken_script || data.answer_en || '',
            answer_en: data.answer_en || '',
            statutory_note: data.statutory_note || audit.rule_pack_applied.display_name,
            clause_id: data.clause_id || audit.clauses[0]?.clause_id || 'clause-4-2',
            excerpt: data.verbatim_quote || audit.clauses[0]?.text || '',
          });
          return;
        }
      }
      throw new Error('Fallback to preset QA');
    } catch {
      const lower = trimmed.toLowerCase();
      const match =
        audit.qa_presets.find((p) =>
          p.chip.toLowerCase().split(/\s+/).some((w) => w.length > 3 && lower.includes(w)),
        ) || audit.qa_presets[0];
      if (match) {
        setQaItem({
          ...match,
          question_native: trimmed,
          question_en: trimmed,
        });
      }
    }
  };

  const showBottomNav =
    screen === 'm1_analyze' ||
    screen === 'm4_report' ||
    screen === 'm6_negotiate' ||
    screen === 'm8_vault';

  const screenTitle =
    screen === 'm1_analyze'
      ? 'Analyze'
      : screen === 'm4_report'
        ? 'Report'
        : screen === 'm6_negotiate'
          ? 'Negotiate'
          : screen === 'm8_vault'
            ? 'Local Vault'
            : screen === 'm7_voice'
              ? 'Voice Assistant'
              : 'Clause Inspector';

  return (
    <div className="min-h-screen bg-surface-container-low flex justify-center">
      <div className="w-full max-w-[430px] h-dvh max-h-dvh bg-surface text-on-surface flex flex-col relative shadow-2xl border-x border-outline-variant/20 overflow-hidden">
        {/* Hidden File Inputs */}
        <input
          ref={pdfInputRef}
          type="file"
          accept=".pdf,image/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              onFilesSelected(e.target.files);
            }
          }}
        />
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              onFilesSelected(e.target.files);
            }
          }}
        />

        {/* Optional Desktop Preview Exit Strip */}
        {isDesktopPreview && onSwitchToDesktop && (
          <div className="bg-on-surface text-white px-4 py-1.5 flex items-center justify-between text-[11px]">
            <span className="font-semibold">Mobile Preview Mode (390px)</span>
            <button
              type="button"
              onClick={onSwitchToDesktop}
              className="px-2.5 py-0.5 rounded bg-primary-container text-white font-bold cursor-pointer"
            >
              Back to Desktop
            </button>
          </div>
        )}

        {/* Top App Bar */}
        <header className="sticky top-0 z-30 h-14 px-4 bg-white/95 backdrop-blur-md border-b border-outline-variant/30 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {screen !== 'm1_analyze' && screen !== 'm4_report' && screen !== 'm6_negotiate' && (
              <button
                type="button"
                onClick={() => {
                  if (screen === 'm3_telemetry') onCancelTelemetry();
                  else if (screen === 'm5_inspector' || screen === 'm7_voice') onNavigate('m4_report');
                  else onNavigate('m1_analyze');
                }}
                aria-label="Go back"
                className="w-10 h-10 -ml-2 rounded-full flex items-center justify-center hover:bg-surface-container cursor-pointer"
              >
                <Icon name="arrow_back" className="text-[22px] text-on-surface" />
              </button>
            )}
            <h1 className="text-[18px] font-bold text-on-surface truncate">{screenTitle}</h1>
          </div>

          <div className="flex items-center gap-2">
            {screen !== 'm2_photo' &&
              screen !== 'm3_telemetry' &&
              screen !== 'm5_inspector' &&
              screen !== 'm7_voice' &&
              screen !== 'm8_vault' && (
                <button
                  type="button"
                  onClick={() => onNavigate('m8_vault')}
                  aria-label="Open Vault"
                  className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-surface-container text-on-surface cursor-pointer"
                >
                  <Icon name="folder_open" className="text-[22px]" />
                </button>
              )}
            <button
              type="button"
              onClick={onOpenSecurityModal}
              aria-label="Security & Privacy Shield"
              className="w-9 h-9 rounded-full bg-primary-container text-white flex items-center justify-center cursor-pointer"
            >
              <Icon name="person" className="text-[19px]" />
            </button>
          </div>
        </header>

        {/* SCREEN CONTENT */}
        <div className="flex-1 min-h-0 overflow-y-auto pb-6">
          {/* M1: ANALYZE HOME */}
          {screen === 'm1_analyze' && (
            <div className="p-4 space-y-4">
              {/* Hero Intake Card */}
              <div className="rounded-3xl bg-white p-5 shadow-sm border border-outline-variant/30 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container text-primary-container text-xs font-bold">
                    <Icon name="verified_user" className="text-[15px]" />
                    AI Legal Aide
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-primary-container">
                    <Icon name="bolt" className="text-[15px]" />
                    60s Analysis
                  </span>
                </div>

                <div className="space-y-2">
                  <h2 className="text-[24px] leading-[30px] font-extrabold text-on-surface tracking-tight">
                    Understand any contract in 60 seconds — in your language.
                  </h2>
                  <p className="text-sm text-on-surface-variant leading-relaxed">
                    Spot hidden fees, unfair lock-ins, and risky clauses before you sign.
                  </p>
                </div>

                <div className="space-y-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => onStartPhotoFlow()}
                    className="w-full min-h-[48px] rounded-2xl bg-primary-container text-white font-bold text-sm flex items-center justify-center gap-2 shadow-sm active:scale-[0.99] cursor-pointer"
                  >
                    <Icon name="photo_camera" className="text-[20px]" />
                    <span>Scan Photo or Upload PDF</span>
                    <Icon name="description" className="text-[18px]" />
                  </button>

                  <button
                    type="button"
                    onClick={() => pdfInputRef.current?.click()}
                    className="w-full min-h-[44px] rounded-xl text-primary-container font-bold text-sm flex items-center justify-center gap-1.5 hover:bg-surface-container-low cursor-pointer"
                  >
                    <Icon name="upload_file" className="text-[18px]" />
                    <span>Upload PDF</span>
                  </button>
                </div>
              </div>

              {/* Language Selector */}
              <div className="rounded-2xl bg-white p-4 shadow-xs border border-outline-variant/30 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-on-surface">Choose your language</span>
                  <span className="font-bold text-primary-container">{langObj.name}</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {LANG_OPTIONS.map((l) => {
                    const active = language === l.code;
                    return (
                      <button
                        key={l.code}
                        type="button"
                        onClick={() => onChangeLanguage(l.code)}
                        className={`min-h-[44px] rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                          active
                            ? 'bg-primary-container text-white border-primary-container shadow-xs'
                            : 'bg-surface-container-low text-on-surface border-outline-variant/30'
                        }`}
                      >
                        {l.native}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Try an instant demo */}
              <div className="rounded-2xl bg-white p-4 shadow-xs border border-outline-variant/30 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-on-surface">
                  <Icon name="play_circle" className="text-primary-container text-[18px]" />
                  <span>Try an instant demo:</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: 'Bengaluru Rental', icon: 'home_work', preset: ALL_PRESETS[0] },
                    { label: 'Loan T&C', icon: 'account_balance', preset: ALL_PRESETS[1] },
                    { label: 'Offer Letter', icon: 'work', preset: ALL_PRESETS[2] },
                  ].map((d) => (
                    <button
                      key={d.label}
                      type="button"
                      onClick={() => onSelectPreset(d.preset)}
                      className="min-h-[44px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-surface-container-low border border-outline-variant/40 text-xs font-bold text-on-surface hover:border-primary-container cursor-pointer"
                    >
                      <Icon name={d.icon} className="text-[16px] text-primary-container" />
                      <span>{d.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 100% Private Banner */}
              <button
                type="button"
                onClick={onOpenSecurityModal}
                className="w-full text-left rounded-2xl bg-surface-container p-4 flex items-center gap-3 cursor-pointer"
              >
                <div className="w-10 h-10 rounded-full bg-white text-primary-container flex items-center justify-center shrink-0">
                  <Icon name="shield" className="text-[20px]" />
                </div>
                <p className="text-xs text-on-surface leading-relaxed">
                  <strong>100% Private</strong> · Local PII Shield masks your Aadhaar, phone &amp; name.
                </p>
              </button>
            </div>
          )}

          {/* M2: PHOTO CHECK */}
          {screen === 'm2_photo' && (
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-surface-container text-primary-container text-[11px] font-bold">
                    Step 1 of 2
                  </span>
                  <span className="text-sm font-bold text-on-surface">Photo Check</span>
                </div>
                <span className="text-[11px] font-bold text-primary-container uppercase tracking-wide flex items-center gap-1">
                  <Icon name="verified" className="text-[15px]" />
                  Ready to inspect
                </span>
              </div>

              {/* Captured Frame Preview */}
              <div className="rounded-2xl bg-white border border-outline-variant/40 overflow-hidden shadow-xs">
                <div className="px-3.5 py-2 flex items-center justify-between text-xs border-b border-outline-variant/30">
                  <span className="font-bold text-primary-container flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-primary-container" />
                    100ms Quality Check
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[11px] flex items-center gap-1">
                    <Icon name="check_circle" className="text-[14px]" />
                    Sharp &amp; Legible
                  </span>
                </div>

                <div className="relative bg-stone-200 h-[270px] overflow-hidden flex items-center justify-center">
                  <img
                    src={capturedPhotoUrl || PHOTO_CHECK_DEMO_URL}
                    alt="Captured physical contract page"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                  {/* Blue corner reticles */}
                  <div className="absolute inset-4 pointer-events-none">
                    <div className="absolute top-0 left-0 w-7 h-7 border-t-3 border-l-3 border-primary-container rounded-tl-md" />
                    <div className="absolute top-0 right-0 w-7 h-7 border-t-3 border-r-3 border-primary-container rounded-tr-md" />
                    <div className="absolute bottom-0 left-0 w-7 h-7 border-b-3 border-l-3 border-primary-container rounded-bl-md" />
                    <div className="absolute bottom-0 right-0 w-7 h-7 border-b-3 border-r-3 border-primary-container rounded-br-md" />
                  </div>

                  {blackoutEnabled && (
                    <div className="absolute top-8 left-6 right-6 bg-slate-900/90 text-white px-3 py-2 rounded-xl flex items-center justify-between gap-2 text-[11px] shadow-lg">
                      <span className="flex items-center gap-1.5 font-semibold">
                        <Icon name="shield" className="text-[15px] text-emerald-400" />
                        Blacked out: Aadhaar &amp; Phone (2)
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-white/15 font-bold text-[10px]">MASKED</span>
                    </div>
                  )}

                  <div className="absolute top-1/2 -translate-y-1/2 bg-slate-900/75 text-white px-3 py-1.5 rounded-full text-[11px] font-semibold flex items-center gap-1.5">
                    <Icon name="crop_free" className="text-[14px]" />
                    Auto-aligned • 0.4° Deskewed
                  </div>
                </div>

                <div className="px-3.5 py-2.5 flex items-center justify-between text-xs text-on-surface-variant">
                  <span className="font-semibold text-on-surface">
                    Page {pageCountDetected} of 3 detected
                  </span>
                  <span className="font-mono text-[11px]">2.4 MB • 300 DPI</span>
                </div>
              </div>

              {/* 1-Tap Privacy Blackout Card */}
              <div className="rounded-2xl bg-white border border-outline-variant/40 p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-surface-container text-primary-container flex items-center justify-center shrink-0">
                      <Icon name="verified_user" className="text-[20px]" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-on-surface">1-Tap Privacy Blackout</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-surface-container text-primary-container font-bold">
                          RECOMMENDED
                        </span>
                      </div>
                      <p className="text-xs text-on-surface-variant mt-0.5">
                        Hide Aadhaar, PAN, and phone numbers before AI reading
                      </p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={blackoutEnabled}
                      onChange={(e) => setBlackoutEnabled(e.target.checked)}
                      className="sr-only peer"
                      aria-label="1-Tap Privacy Blackout"
                    />
                    <div className="w-12 h-7 bg-surface-container-highest rounded-full peer peer-checked:after:translate-x-5 after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-white after:rounded-full after:h-[22px] after:w-[22px] after:transition-all peer-checked:bg-primary-container" />
                  </label>
                </div>

                <div
                  className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                    blackoutEnabled
                      ? 'bg-surface-container-low text-primary-container'
                      : 'bg-amber-50 text-amber-800'
                  }`}
                >
                  <Icon name="shield" className="text-[16px]" />
                  <span>
                    {blackoutEnabled
                      ? 'Header PII Blackout: Active (Safe to analyze)'
                      : 'Header Blackout Off — Local regex shield still active'}
                  </span>
                </div>
              </div>

              {/* Language Grid */}
              <div className="rounded-2xl bg-white border border-outline-variant/40 p-4 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-on-surface flex items-center gap-1.5">
                    <Icon name="translate" className="text-[17px] text-primary-container" />
                    Explain Agreement In
                  </span>
                  <span className="text-primary-container font-semibold">Audio + Text</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {LANG_OPTIONS.map((l) => {
                    const active = language === l.code;
                    return (
                      <button
                        key={l.code}
                        type="button"
                        onClick={() => onChangeLanguage(l.code)}
                        className={`py-2 px-1 rounded-xl border text-center cursor-pointer ${
                          active
                            ? 'bg-primary-container text-white border-primary-container'
                            : 'bg-surface-container-low text-on-surface border-outline-variant/40'
                        }`}
                      >
                        <span className="block text-xs font-bold">{l.code === 'en' ? 'EN' : l.native}</span>
                        <span className={`block text-[10px] ${active ? 'text-blue-100' : 'text-on-surface-variant'}`}>
                          {l.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-on-surface-variant">
                  Audio &amp; key clause summaries will be generated in <strong>{langObj.name}</strong>.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => onRunPhotoAnalysis(blackoutEnabled)}
                  className="w-full min-h-[48px] rounded-2xl bg-primary-container text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md cursor-pointer"
                >
                  <Icon name="psychology" className="text-[20px]" />
                  <span>Analyze Contract →</span>
                </button>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setPageCountDetected((c) => c + 1);
                      onToast(`Added Page ${pageCountDetected + 1} to local scan queue.`);
                    }}
                    className="min-h-[44px] rounded-xl bg-white border border-outline-variant/40 text-xs font-bold text-on-surface flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Icon name="post_add" className="text-[17px]" />
                    <span>Add Page {pageCountDetected + 1} (+)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    className="min-h-[44px] rounded-xl bg-white border border-outline-variant/40 text-xs font-bold text-on-surface flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Icon name="refresh" className="text-[17px]" />
                    <span>Retake Photo</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* M3: TELEMETRY SCANNER */}
          {screen === 'm3_telemetry' && (
            <div className="p-4 space-y-4">
              <div className="rounded-2xl bg-white border border-outline-variant/40 p-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-surface-container text-primary-container flex items-center justify-center shrink-0">
                    <Icon name="description" className="text-[18px]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-on-surface truncate">{audit.title}</p>
                    <p className="text-[11px] text-on-surface-variant truncate">{audit.meta_badge}</p>
                  </div>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-surface-container text-primary-container text-[11px] font-bold shrink-0">
                  ● Scanning
                </span>
              </div>

              {/* Neural X-Ray Laser Card */}
              <div className="rounded-2xl bg-white border border-outline-variant/40 p-4 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-on-surface flex items-center gap-1.5">
                    <Icon name="radar" className="text-[18px] text-primary-container" />
                    Neural X-Ray Pass
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-surface-container text-primary-container font-bold text-[11px] tabular-nums">
                    {Math.min(100, telemetryStage * 25)}% Analyzed
                  </span>
                </div>

                <div className="relative rounded-xl bg-surface-container-low border border-outline-variant/40 p-3 space-y-2.5 overflow-hidden">
                  <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs">
                    <span className="font-bold text-error block">▲ Clause 8.2 • 10-Month Lock-in Penalty</span>
                  </div>
                  <div className="h-0.5 w-full bg-primary-container shadow-[0_0_12px_2px_#1d4ed8]" />
                  <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs">
                    <span className="font-bold text-amber-800 block">
                      ⚖ Clause 14.1 • Non-Refundable Painting Fee
                    </span>
                  </div>
                  <div className="flex justify-between text-[10px] font-mono text-on-surface-variant pt-1">
                    <span>DEEP CLAUSE EXTRACTION</span>
                    <span className="text-primary-container font-bold">● Live OCR Sync</span>
                  </div>
                </div>
              </div>

              {/* 4 Inspection Gates */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs font-bold text-on-surface px-1">
                  <span>Inspection Gates</span>
                  <span className="text-primary-container">Stage {telemetryStage} of 4</span>
                </div>

                {[
                  {
                    step: 1,
                    title: 'Blur & Legibility Check',
                    desc: '100% sharp • Full character clarity',
                    time: '0.2s',
                  },
                  {
                    step: 2,
                    title: 'Local PII Shield Masking',
                    desc: `${audit.pii_masked_tokens.length} sensitive tokens masked on-device`,
                    time: '0.4s',
                  },
                  {
                    step: 3,
                    title: 'Rule Pack Match',
                    desc: `Matching ${audit.rule_pack_applied.display_name}`,
                    time: `${audit.rule_pack_applied.match_pct}%`,
                  },
                  {
                    step: 4,
                    title: 'Legal Grounding Check',
                    desc: 'Cross-referencing clause excerpts verbatim',
                    time: telemetryStage >= 4 ? 'Done' : 'Queued',
                  },
                ].map((g) => {
                  const done = telemetryStage > g.step;
                  const active = telemetryStage === g.step;
                  return (
                    <div
                      key={g.step}
                      className={`rounded-2xl p-3.5 bg-white border flex items-start gap-3 ${
                        active ? 'border-primary-container shadow-xs' : 'border-outline-variant/40'
                      }`}
                    >
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                          done
                            ? 'bg-primary-container text-white'
                            : active
                              ? 'bg-blue-100 text-primary-container animate-pulse'
                              : 'bg-surface-container text-on-surface-variant'
                        }`}
                      >
                        <Icon name={done ? 'check' : active ? 'sync' : 'hourglass_empty'} className="text-[16px]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-on-surface">{g.title}</span>
                          <span className="text-[11px] font-bold text-primary-container font-mono">{g.time}</span>
                        </div>
                        <p className="text-[11px] text-on-surface-variant mt-0.5">{g.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={onCancelTelemetry}
                className="w-full min-h-[44px] rounded-xl text-xs font-bold text-on-surface hover:bg-surface-container cursor-pointer"
              >
                ✕ Cancel Analysis
              </button>
            </div>
          )}

          {/* M4: REPORT */}
          {screen === 'm4_report' && (
            <div className="space-y-4">
              {/* Sub-header */}
              <div className="px-4 py-2.5 bg-white border-b border-outline-variant/30 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-on-surface">{audit.title.split(' • ')[0]}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-error">
                      {audit.summary.risk_band_label}
                    </span>
                    <span className="text-[11px] text-on-surface-variant">{audit.meta_badge}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onChangeLanguage(language === 'kn' ? 'en' : 'kn')}
                  className="px-3 py-1.5 rounded-full bg-surface-container text-primary-container text-xs font-bold cursor-pointer"
                >
                  {language.toUpperCase()} / EN
                </button>
              </div>

              <div className="px-4 space-y-4">
                {/* Hero Exposure Card */}
                <div className="rounded-2xl bg-white border border-outline-variant/40 p-4 space-y-3 shadow-xs">
                  <div className="flex items-center justify-between text-xs">
                    <span className="px-2 py-0.5 rounded bg-red-50 text-error font-bold">
                      ▲ {audit.summary.risk_band_label}
                    </span>
                    <span className="text-[11px] text-on-surface-variant">Verified by LawLens</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold text-error tabular-nums">
                      ₹{audit.summary.rupee_exposure_inr.toLocaleString('en-IN')}
                    </span>
                    <span className="text-xs font-bold text-error">Extra Risk</span>
                  </div>
                  <p className="text-xs text-on-surface-variant leading-relaxed">{audit.summary.alert_banner}</p>
                </div>

                {/* What You're Agreeing To */}
                <div className="rounded-2xl bg-white border border-outline-variant/40 p-4 space-y-3">
                  <h3 className="text-sm font-bold text-on-surface flex items-center gap-2">
                    <Icon name="fact_check" className="text-primary-container text-[18px]" />
                    What You&apos;re Agreeing To
                  </h3>
                  <div className="space-y-2">
                    {audit.summary.top_3_bullets.map((b, i) => (
                      <div key={b.title} className="p-3 rounded-xl bg-surface-container-low flex items-start gap-2.5 text-xs">
                        <span className="w-5 h-5 rounded-full bg-primary-container/15 text-primary-container font-bold flex items-center justify-center shrink-0">
                          {i + 1}
                        </span>
                        <div>
                          <span className="font-bold text-on-surface block">{b.title}</span>
                          <span className="text-on-surface-variant">{b.detail}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Way Out Slider */}
                <div className="rounded-2xl bg-white border border-outline-variant/40 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-on-surface flex items-center gap-1.5">
                      <Icon name="directions_run" className="text-primary-container text-[18px]" />
                      Way Out Slider
                    </span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-error">
                      Month {wayOutMonth} · {wayOut.inLockIn ? 'Penalty' : 'Safe'}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={audit.way_out_params.total_months || 11}
                    value={wayOutMonth}
                    onChange={(e) => setWayOutMonth(Number(e.target.value))}
                    aria-label="Mobile Way Out Slider"
                    className="w-full accent-primary-container"
                  />
                  <div className="p-2.5 rounded-xl bg-surface-container-low text-xs font-semibold text-on-surface">
                    {wayOut.headline}
                  </div>
                </div>

                {/* Flagged Clauses */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <h3 className="text-sm font-bold text-on-surface">
                      Flagged Clauses ({audit.findings.length})
                    </h3>
                    <span className="text-xs text-on-surface-variant">Tap to inspect</span>
                  </div>

                  {audit.findings.map((f) => (
                    <div
                      key={f.finding_id}
                      className="rounded-2xl bg-white border border-outline-variant/40 p-4 space-y-2.5 shadow-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                            f.severity === 'critical' ? 'bg-red-100 text-error' : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {f.severity}
                        </span>
                        <span className="text-[10px] font-bold text-primary-container bg-surface-container px-2 py-0.5 rounded-full">
                          {f.rule_ref.citation_label}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-on-surface">{f.headline}</h4>
                      <p className="text-xs text-on-surface-variant leading-relaxed">{f.plain_explanation}</p>
                      <div className="p-3 rounded-xl bg-surface-container-low space-y-2">
                        <p className="font-serif italic text-xs text-on-surface">&ldquo;{f.verbatim_quote}&rdquo;</p>
                        <div className="flex items-center justify-between text-xs pt-1">
                          <span className="text-primary-container font-semibold">✓ Verified excerpt</span>
                          <button
                            type="button"
                            onClick={() => {
                              setFocusedClauseId(f.clause_id);
                              onNavigate('m5_inspector');
                            }}
                            className="font-bold text-primary-container cursor-pointer"
                          >
                            See in Doc →
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Sticky Explain + Ask CTA */}
                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => handlePlayAudio(audit.summary.walkthrough_intro_spoken[language])}
                    className="flex-1 min-h-[46px] rounded-2xl bg-primary-container text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md cursor-pointer"
                  >
                    <Icon name={isPlayingVoice ? 'stop' : 'play_arrow'} className="text-[18px]" filled />
                    <span>Explain in {langObj.name} (52s)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('m7_voice')}
                    className="min-h-[46px] px-4 rounded-2xl bg-surface-container text-primary-container font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Icon name="mic" className="text-[18px]" />
                    <span>Ask</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* M5: CLAUSE INSPECTOR */}
          {screen === 'm5_inspector' && (
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => onNavigate('m4_report')}
                  className="px-3 py-1.5 rounded-full bg-surface-container text-xs font-bold text-on-surface cursor-pointer"
                >
                  ← Back to Report
                </button>
                <span className="px-2.5 py-1 rounded-full bg-red-100 text-error text-[11px] font-bold">
                  Critical Risk
                </span>
              </div>

              <div className="grid grid-cols-2 p-1 rounded-xl bg-surface-container">
                <button
                  type="button"
                  onClick={() => setInspectorTab('text')}
                  className={`min-h-[40px] rounded-lg text-xs font-bold cursor-pointer ${
                    inspectorTab === 'text' ? 'bg-white text-primary-container shadow-xs' : 'text-on-surface-variant'
                  }`}
                >
                  Reconstructed Text
                </button>
                <button
                  type="button"
                  onClick={() => setInspectorTab('photo')}
                  className={`min-h-[40px] rounded-lg text-xs font-bold cursor-pointer ${
                    inspectorTab === 'photo' ? 'bg-white text-primary-container shadow-xs' : 'text-on-surface-variant'
                  }`}
                >
                  Original Photo
                </button>
              </div>

              {inspectorTab === 'text' ? (
                <div className="rounded-2xl bg-white border border-outline-variant/40 p-5 space-y-4 shadow-xs">
                  <div className="flex items-center justify-between text-[11px] font-mono text-on-surface-variant">
                    <span>{audit.stamp_header.doc_title}</span>
                    <span>Page 2 of 6</span>
                  </div>

                  <div className="space-y-4">
                    {audit.clauses.map((c) => {
                      const active = c.clause_id === focusedClauseId || c.severity === 'critical';
                      const hasToken = c.ocr_highlight_token && c.text.includes(c.ocr_highlight_token);
                      return (
                        <div
                          key={c.clause_id}
                          className={
                            active
                              ? 'rounded-xl border-l-4 border-error bg-red-50/50 p-3.5 space-y-1.5'
                              : 'text-on-surface-variant'
                          }
                        >
                          {active && (
                            <span className="text-[10px] font-bold uppercase text-error block">
                              ● ACTIVE CLAUSE • {c.section_label}
                            </span>
                          )}
                          <p className="font-serif text-[15px] leading-relaxed text-on-surface">
                            {hasToken ? (
                              <>
                                {c.text.split(c.ocr_highlight_token!)[0]}
                                <button
                                  type="button"
                                  onClick={() => setShowOcrPopover((s) => !s)}
                                  className={`px-1.5 py-0.5 rounded font-bold underline decoration-dashed cursor-pointer ${
                                    ocrVerified ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-primary-container'
                                  }`}
                                >
                                  {c.ocr_highlight_token}
                                </button>
                                {c.text.split(c.ocr_highlight_token!).slice(1).join(c.ocr_highlight_token!)}
                              </>
                            ) : (
                              c.text
                            )}
                          </p>
                          {hasToken && showOcrPopover && (
                            <div className="p-3 rounded-xl bg-white border border-outline-variant/50 shadow-md text-xs space-y-2">
                              <p className="font-bold text-on-surface">
                                OCR Confidence: {c.ocr_confidence || 99.8}%
                              </p>
                              <button
                                type="button"
                                onClick={() => {
                                  setOcrVerified(true);
                                  setShowOcrPopover(false);
                                  onToast('Verified OCR token against original scan.');
                                }}
                                className="w-full py-1.5 rounded-lg bg-primary-container text-white font-bold cursor-pointer"
                              >
                                {ocrVerified ? '✓ Verified' : 'Mark Value Verified'}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl bg-white border border-outline-variant/40 p-3 space-y-2">
                  <img
                    src={audit.original_photo_url || ORIGINAL_SCAN_DEMO_URL}
                    alt="Original contract scan photo"
                    referrerPolicy="no-referrer"
                    className="w-full rounded-xl object-contain max-h-[420px] bg-stone-100"
                  />
                  <p className="text-[11px] font-mono text-on-surface-variant text-center">
                    e-Stamp {audit.stamp_header.stamp_cert_id} • {audit.stamp_header.stamp_value}
                  </p>
                </div>
              )}

              {showPlainBanner && (
                <div className="rounded-2xl bg-white border border-outline-variant/40 p-4 shadow-md space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-red-50 text-error flex items-center justify-center shrink-0">
                        <Icon name="gavel" className="text-[18px]" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-error block">Plain-Language Summary</span>
                        <p className="text-sm font-bold text-on-surface">
                          Exceeds 2-month statutory cap by ₹{audit.summary.rupee_exposure_inr.toLocaleString('en-IN')}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowPlainBanner(false)}
                      aria-label="Close summary banner"
                      className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center cursor-pointer"
                    >
                      <Icon name="close" className="text-[16px]" />
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handlePlayAudio(audit.findings[0]?.spoken_script || '')}
                      className="flex-1 min-h-[44px] rounded-xl bg-primary-container text-white text-xs font-bold cursor-pointer"
                    >
                      {isPlayingVoice ? '■ Stop Audio' : '▷ Play Audio (12s)'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowPlainBanner(false)}
                      className="px-4 min-h-[44px] rounded-xl bg-surface-container text-xs font-bold cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* M6: NEGOTIATE */}
          {screen === 'm6_negotiate' && (
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-on-surface">Select Asks to Include</h2>
                <span className="px-2.5 py-0.5 rounded-full bg-surface-container text-primary-container text-xs font-bold">
                  {selectedAskIds.length}/{audit.findings.length} ticked
                </span>
              </div>

              <div className="space-y-2.5">
                {audit.findings.map((f, idx) => {
                  const checked = selectedAskIds.includes(f.finding_id);
                  return (
                    <label
                      key={f.finding_id}
                      className="rounded-2xl bg-white border border-outline-variant/40 p-3.5 flex items-start gap-3 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setDraftOverride(null);
                          setSelectedAskIds((prev) =>
                            prev.includes(f.finding_id)
                              ? prev.filter((id) => id !== f.finding_id)
                              : [...prev, f.finding_id],
                          );
                        }}
                        className="mt-1 w-4 h-4 accent-primary-container"
                      />
                      <div className="flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-on-surface">
                            {idx + 1}. {f.negotiation.short_title}
                          </span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                              f.severity === 'critical'
                                ? 'bg-red-100 text-error'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {f.negotiation.impact_badge}
                          </span>
                        </div>
                        <p className="text-[11px] text-on-surface-variant mt-1">
                          {tone === 'polite' ? f.negotiation.polite_ask : f.negotiation.firm_ask}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="text-xs font-bold text-on-surface">Tone</span>
                  <div className="grid grid-cols-2 p-1 rounded-xl bg-white border border-outline-variant/40">
                    <button
                      type="button"
                      onClick={() => {
                        setTone('polite');
                        setDraftOverride(null);
                      }}
                      className={`py-2 rounded-lg text-xs font-bold cursor-pointer ${
                        tone === 'polite' ? 'bg-surface-container text-primary-container' : 'text-on-surface-variant'
                      }`}
                    >
                      Polite
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTone('firm');
                        setDraftOverride(null);
                      }}
                      className={`py-2 rounded-lg text-xs font-bold cursor-pointer ${
                        tone === 'firm' ? 'bg-surface-container text-primary-container' : 'text-on-surface-variant'
                      }`}
                    >
                      Firm
                    </button>
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-bold text-on-surface">Channel</span>
                  <div className="grid grid-cols-2 p-1 rounded-xl bg-white border border-outline-variant/40">
                    <button
                      type="button"
                      onClick={() => setChannel('whatsapp')}
                      className={`py-2 rounded-lg text-xs font-bold cursor-pointer ${
                        channel === 'whatsapp'
                          ? 'bg-surface-container text-primary-container'
                          : 'text-on-surface-variant'
                      }`}
                    >
                      WhatsApp
                    </button>
                    <button
                      type="button"
                      onClick={() => setChannel('email')}
                      className={`py-2 rounded-lg text-xs font-bold cursor-pointer ${
                        channel === 'email' ? 'bg-surface-container text-primary-container' : 'text-on-surface-variant'
                      }`}
                    >
                      Email
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-on-surface">Ready Draft</span>
                  <span className="text-on-surface-variant">Tap text to customize</span>
                </div>
                {channel === 'email' && (
                  <div className="px-3 py-2 rounded-xl bg-white border border-outline-variant/40 text-xs font-semibold text-on-surface">
                    Subject: Clause Revision Request — {audit.title.split(' • ')[0]}
                  </div>
                )}
                <textarea
                  rows={8}
                  value={activeNegotiateDraft}
                  onChange={(e) => setDraftOverride(e.target.value)}
                  aria-label="Counter-offer message draft"
                  className="w-full rounded-2xl bg-white border border-outline-variant/40 p-3.5 text-xs leading-relaxed text-on-surface"
                />
              </div>

              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(activeNegotiateDraft).catch(() => {});
                    onToast('Draft copied to clipboard!');
                  }}
                  className="min-h-[46px] px-4 rounded-xl bg-white border border-outline-variant/40 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Icon name="content_copy" className="text-[16px]" />
                  <span>Copy</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const encoded = encodeURIComponent(activeNegotiateDraft);
                    const href =
                      channel === 'whatsapp'
                        ? `https://api.whatsapp.com/send?text=${encoded}`
                        : `mailto:?subject=${encodeURIComponent(audit.title)}&body=${encoded}`;
                    const a = document.createElement('a');
                    a.href = href;
                    a.target = '_blank';
                    a.rel = 'noopener noreferrer';
                    a.click();
                    onToast(channel === 'whatsapp' ? 'Opened WhatsApp share draft!' : 'Opened Email draft!');
                  }}
                  className="flex-1 min-h-[46px] rounded-xl bg-primary-container text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Icon name={channel === 'whatsapp' ? 'chat' : 'mail'} className="text-[18px]" />
                  <span>{channel === 'whatsapp' ? 'Open in WhatsApp' : 'Send Email Draft'}</span>
                </button>
              </div>
            </div>
          )}

          {/* M7: LEGAL VOICE ASSISTANT */}
          {screen === 'm7_voice' && (
            <div className="p-4 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-bold text-on-surface">Legal Voice Assistant</h2>
                  <p className="text-xs text-on-surface-variant">{audit.title.split(' • ')[0]}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-full bg-surface-container text-primary-container text-[11px] font-bold">
                    ● {langObj.name} / Kanglish
                  </span>
                  <button
                    type="button"
                    onClick={() => onNavigate('m4_report')}
                    aria-label="Close voice assistant"
                    className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center cursor-pointer"
                  >
                    <Icon name="close" className="text-[18px]" />
                  </button>
                </div>
              </div>

              {/* Waveform + Question */}
              <div className="rounded-2xl bg-white border border-outline-variant/40 p-4 space-y-3">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-primary-container uppercase">
                    ● {isPlayingVoice || isHoldingMic ? 'Listening / Spoken Reply Active' : 'Live Synced'}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-surface-container text-primary-container font-bold">
                    Q#{voiceHistoryCount + 1}
                  </span>
                </div>

                <div className="h-10 rounded-xl bg-surface-container-low flex items-center justify-center gap-1 px-4">
                  {[10, 18, 28, 16, 30, 22, 26, 14, 24, 12].map((h, idx) => (
                    <span
                      key={idx}
                      className={`w-1.5 rounded-full bg-primary-container transition-all ${
                        isPlayingVoice || isHoldingMic ? 'animate-pulse' : ''
                      }`}
                      style={{ height: `${h}px` }}
                    />
                  ))}
                </div>

                <div className="p-3 rounded-xl bg-surface-container-low space-y-1">
                  <span className="text-[10px] font-bold text-primary-container uppercase">Your Question</span>
                  <p className="text-xs font-bold text-on-surface">&ldquo;{qaItem?.question_native}&rdquo;</p>
                  <p className="text-[11px] italic text-on-surface-variant">&ldquo;{qaItem?.question_en}&rdquo;</p>
                </div>
              </div>

              {/* Grounded Legal Answer */}
              <div className="rounded-2xl bg-white border border-outline-variant/40 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-surface-container text-primary-container text-[11px] font-bold">
                    ✓ Grounded Legal Answer
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold">
                    0 Hallucination Guard
                  </span>
                </div>
                <p className="p-3 rounded-xl bg-surface-container-low text-xs font-semibold text-on-surface leading-relaxed">
                  {qaItem?.answer_native}
                </p>
                <div className="text-xs text-on-surface-variant leading-relaxed">
                  <span className="text-[10px] font-bold uppercase block text-on-surface mb-0.5">
                    Plain English Breakdown
                  </span>
                  {qaItem?.answer_en}
                </div>
                <div className="p-3 rounded-xl bg-red-50/70 border border-red-200 text-[11px] text-red-950">
                  <strong>Statutory Benchmark:</strong> {qaItem?.statutory_note}
                </div>
              </div>

              {/* Verified Excerpt */}
              <div className="rounded-2xl bg-white border border-outline-variant/40 p-4 space-y-2.5">
                <div className="flex items-center justify-between text-xs font-bold text-primary-container">
                  <span>Verified Excerpt</span>
                  <span className="text-[10px] text-on-surface-variant">Signed Copy</span>
                </div>
                <p className="font-serif italic text-xs text-on-surface bg-surface-container-low p-3 rounded-xl">
                  &ldquo;{qaItem?.excerpt}&rdquo;
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setFocusedClauseId(qaItem?.clause_id || 'clause-4-2');
                    onNavigate('m5_inspector');
                  }}
                  className="text-xs font-bold text-primary-container cursor-pointer"
                >
                  Inspect in Original Contract →
                </button>
              </div>

              {/* Audio Bar */}
              <div className="rounded-2xl bg-white border border-outline-variant/40 p-3 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => handlePlayAudio(qaItem?.answer_native || qaItem?.answer_en || '')}
                  className="w-10 h-10 rounded-full bg-primary-container text-white flex items-center justify-center shrink-0 cursor-pointer"
                  aria-label="Play or pause answer audio"
                >
                  <Icon name={isPlayingVoice ? 'pause' : 'play_arrow'} className="text-[20px]" filled />
                </button>
                <span className="text-xs font-bold text-on-surface flex-1 truncate">
                  {langObj.name} Voice Walkthrough
                </span>
                <button
                  type="button"
                  onClick={() => setVoiceSpeed((s) => (s === 1.0 ? 1.25 : 1.0))}
                  className="px-2 py-1 rounded bg-surface-container text-xs font-mono font-bold cursor-pointer"
                >
                  {voiceSpeed.toFixed(1)}x
                </button>
              </div>

              {/* Follow-up Chips + Mic + Text Input */}
              <div className="space-y-3">
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {audit.qa_presets.map((chip) => (
                    <button
                      key={chip.chip}
                      type="button"
                      onClick={() => {
                        setQaItem(chip);
                        setVoiceHistoryCount((c) => c + 1);
                      }}
                      className="shrink-0 px-3 py-2 rounded-full bg-white border border-outline-variant/50 text-xs font-bold text-on-surface cursor-pointer"
                    >
                      {chip.chip}
                    </button>
                  ))}
                </div>

                <div className="flex flex-col items-center gap-2 py-2">
                  <button
                    type="button"
                    onMouseDown={() => setIsHoldingMic(true)}
                    onMouseUp={() => {
                      setIsHoldingMic(false);
                      handleAskMobileQA('Can owner deduct painting charges automatically?');
                    }}
                    onClick={() => handleAskMobileQA('Can owner deduct painting charges automatically?')}
                    aria-label="Hold to Ask voice question"
                    className={`w-14 h-14 rounded-full bg-primary-container text-white flex items-center justify-center shadow-lg cursor-pointer ${
                      isHoldingMic ? 'scale-110 ring-4 ring-blue-300' : ''
                    }`}
                  >
                    <Icon name="mic" className="text-[26px]" />
                  </button>
                  <span className="text-xs font-bold text-on-surface">Hold to Ask / Tap Sample</span>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleAskMobileQA(qaText);
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    value={qaText}
                    onChange={(e) => setQaText(e.target.value)}
                    placeholder="Type question in Kanglish or English..."
                    className="flex-1 min-h-[44px] rounded-xl border border-outline-variant/50 bg-white px-3 text-xs"
                  />
                  <button
                    type="submit"
                    className="min-h-[44px] px-4 rounded-xl bg-primary-container text-white text-xs font-bold cursor-pointer"
                  >
                    Ask
                  </button>
                </form>

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => onNavigate('m6_negotiate')}
                    className="min-h-[44px] rounded-xl bg-white border border-outline-variant/40 text-xs font-bold cursor-pointer"
                  >
                    + Add to Negotiate
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(qaItem?.answer_en || '').catch(() => {});
                      onToast('Answer copied!');
                    }}
                    className="min-h-[44px] rounded-xl bg-white border border-outline-variant/40 text-xs font-bold cursor-pointer"
                  >
                    Copy Answer
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* M8: LOCAL VAULT */}
          {screen === 'm8_vault' && (
            <div className="p-4 space-y-4">
              <div className="rounded-2xl bg-surface-container p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-primary-container text-white flex items-center justify-center">
                      <Icon name="shield" className="text-[20px]" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-on-surface">Local Vault</h2>
                      <p className="text-[11px] text-on-surface-variant">Zero-Cloud Sandboxed Storage</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowClearModal(true)}
                    className="px-3 py-1.5 rounded-full bg-white text-error text-xs font-bold border border-red-200 cursor-pointer"
                  >
                    Clear All
                  </button>
                </div>
                <div className="px-3 py-2 rounded-xl bg-white flex items-center justify-between text-xs">
                  <span className="font-semibold text-on-surface flex items-center gap-1.5">
                    <Icon name="lock" className="text-[15px] text-primary-container" />
                    On-Device Local Keychain
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-surface-container text-primary-container text-[10px] font-bold">
                    100% Offline
                  </span>
                </div>
              </div>

              {showClearModal && (
                <div className="rounded-2xl bg-red-50 border border-red-300 p-4 space-y-3">
                  <p className="text-xs font-bold text-red-950">
                    Clear all {vaultDocs.length} local contract analyses?
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowClearModal(false)}
                      className="flex-1 min-h-[40px] rounded-xl bg-white border text-xs font-bold cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onClearVault();
                        setShowClearModal(false);
                      }}
                      className="flex-1 min-h-[40px] rounded-xl bg-error text-white text-xs font-bold cursor-pointer"
                    >
                      Confirm Clear
                    </button>
                  </div>
                </div>
              )}

              {/* Currently Inspected Card */}
              {activeVaultDoc && (
                <div className="rounded-2xl bg-white border-2 border-primary-container/30 p-4 space-y-3">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-primary-container uppercase">● Currently Inspected</span>
                    <span className="px-2 py-0.5 rounded bg-red-100 text-error font-bold">
                      {activeVaultDoc.audit.summary.risk_band_label}
                    </span>
                  </div>

                  {editingTag ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={tagDraft}
                        onChange={(e) => setTagDraft(e.target.value)}
                        className="flex-1 rounded-lg border border-primary-container px-2.5 py-1.5 text-xs font-bold"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (tagDraft.trim()) onUpdateVaultTag(activeVaultDoc.id, tagDraft.trim());
                          setEditingTag(false);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-primary-container text-white text-xs font-bold cursor-pointer"
                      >
                        Save
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-base font-bold text-on-surface">{activeVaultDoc.audit.title.split(' • ')[0]}</h3>
                        <p className="text-xs text-primary-container font-semibold">{activeVaultDoc.customTag}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setTagDraft(activeVaultDoc.customTag);
                          setEditingTag(true);
                        }}
                        aria-label="Edit custom tag"
                        className="w-9 h-9 rounded-full hover:bg-surface-container flex items-center justify-center cursor-pointer"
                      >
                        <Icon name="edit" className="text-[18px] text-primary-container" />
                      </button>
                    </div>
                  )}

                  {/* Notes */}
                  <div className="p-3 rounded-xl bg-surface-container-low space-y-2">
                    <span className="text-xs font-bold text-on-surface block">My Private Notes &amp; Context</span>
                    {activeVaultDoc.notes.map((n) => (
                      <p key={n.id} className="text-xs bg-white p-2.5 rounded-lg text-on-surface">
                        &ldquo;{n.text}&rdquo;
                      </p>
                    ))}
                    {showNoteComposer && (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={noteDraft}
                          onChange={(e) => setNoteDraft(e.target.value)}
                          placeholder="Write private note..."
                          className="flex-1 rounded-lg border border-outline-variant px-2.5 py-1.5 text-xs bg-white"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (noteDraft.trim()) onSaveNote(noteDraft.trim(), 'Mobile Note');
                            setNoteDraft('');
                            setShowNoteComposer(false);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-primary-container text-white text-xs font-bold cursor-pointer"
                        >
                          Save
                        </button>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          onSaveNote('Voice memo note: Discussed deposit cap reduction.', 'Voice Memo');
                        }}
                        className="min-h-[40px] rounded-xl bg-white border border-outline-variant/40 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Icon name="mic" className="text-[16px] text-primary-container" />
                        <span>Record Note</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowNoteComposer((s) => !s)}
                        className="min-h-[40px] rounded-xl bg-white border border-outline-variant/40 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Icon name="chat_bubble" className="text-[16px] text-primary-container" />
                        <span>Write Note</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Saved Analyses Filter + Cards */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-on-surface">Saved Analyses ({vaultDocs.length})</h3>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {(
                    [
                      ['all', `All (${vaultDocs.length})`],
                      ['rental', `Rental (${vaultDocs.filter((d) => d.audit.category === 'rental').length})`],
                      ['loan', `Loans (${vaultDocs.filter((d) => d.audit.category === 'loan').length})`],
                      ['employment', `Employment (${vaultDocs.filter((d) => d.audit.category === 'employment').length})`],
                    ] as const
                  ).map(([cat, label]) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setVaultFilter(cat)}
                      className={`shrink-0 px-3.5 py-2 rounded-full text-xs font-bold cursor-pointer ${
                        vaultFilter === cat
                          ? 'bg-primary-container text-white'
                          : 'bg-white border border-outline-variant/40 text-on-surface'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {vaultDocs
                  .filter((d) => vaultFilter === 'all' || d.audit.category === vaultFilter)
                  .map((doc) => (
                    <div
                      key={doc.id}
                      className="rounded-2xl bg-white border border-outline-variant/40 p-4 space-y-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-surface-container text-primary-container">
                          {doc.statusLabel}
                        </span>
                        <span className="text-xs font-bold text-error">{doc.audit.summary.risk_band_label}</span>
                      </div>
                      <h4 className="text-sm font-bold text-on-surface">{doc.audit.title.split(' • ')[0]}</h4>
                      <p className="text-xs text-on-surface-variant">
                        {doc.customTag} • {doc.scannedAt}
                      </p>
                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => onOpenVaultItem(doc)}
                          className="flex-1 min-h-[42px] rounded-xl bg-primary-container text-white text-xs font-bold cursor-pointer"
                        >
                          Open Report →
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteVaultItem(doc.id)}
                          aria-label={`Delete ${doc.customTag}`}
                          className="w-11 min-h-[42px] rounded-xl bg-red-50 text-error flex items-center justify-center cursor-pointer"
                        >
                          <Icon name="delete" className="text-[18px]" />
                        </button>
                      </div>
                    </div>
                  ))}

                {/* Footer Storage Footprint */}
                <div className="rounded-2xl bg-white border border-outline-variant/40 p-4 space-y-3">
                  <div className="flex justify-between text-xs font-bold">
                    <span>Local Storage Footprint</span>
                    <span className="font-mono">{(vaultDocs.length * 0.8 + 0.8).toFixed(1)} MB / 50 MB</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={onExportVaultJson}
                      className="min-h-[42px] rounded-xl bg-surface-container text-xs font-bold cursor-pointer"
                    >
                      Export JSON
                    </button>
                    <button
                      type="button"
                      onClick={() => onToast('Cleared temporary OCR cache.')}
                      className="min-h-[42px] rounded-xl bg-surface-container text-xs font-bold cursor-pointer"
                    >
                      Clear Temp Cache
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sticky 4-Tab Mobile Bottom Navigation */}
        {showBottomNav && (
          <nav
            aria-label="Mobile navigation"
            className="sticky bottom-0 z-30 bg-white border-t border-outline-variant/40 px-2 py-1.5 grid grid-cols-4 gap-1 pb-safe shrink-0"
          >
            {(
              [
                ['m1_analyze', 'document_scanner', 'Analyze'],
                ['m4_report', 'analytics', 'Report'],
                ['m6_negotiate', 'handshake', 'Negotiate'],
                ['m8_vault', 'folder_open', 'Vault'],
              ] as const
            ).map(([target, iconName, label]) => {
              const active = screen === target;
              return (
                <button
                  key={target}
                  type="button"
                  onClick={() => onNavigate(target)}
                  className={`min-h-[48px] rounded-xl flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold cursor-pointer ${
                    active ? 'text-primary-container bg-surface-container-low' : 'text-on-surface-variant'
                  }`}
                >
                  <Icon name={iconName} className="text-[20px]" filled={active} />
                  <span>{label}</span>
                </button>
              );
            })}
          </nav>
        )}
      </div>
    </div>
  );
};
