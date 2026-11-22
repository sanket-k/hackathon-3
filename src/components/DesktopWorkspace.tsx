import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { AuditResult, ContractClause, LanguageCode, VaultDocument } from '../types/contract';
import { calculateWayOutAtMonth } from '../utils/wayOutMath';
import { ORIGINAL_SCAN_DEMO_URL } from '../utils/ingest';
import { playRegionalSpeech, stopAllSpeech } from '../utils/audioSync';
import {
  MIN_VOICE_CAPTURE_MS,
  startVoiceCapture,
  transcribeAudio,
  type VoiceCaptureHandle,
} from '../utils/voiceCapture';
import { Icon } from './Icons';

interface DesktopWorkspaceProps {
  audit: AuditResult;
  vaultDoc?: VaultDocument;
  language: LanguageCode;
  onChangeLanguage: (lang: LanguageCode) => void;
  onBackHome: () => void;
  onOpenBriefModal: () => void;
  onOpenWhatsAppModal: (draft: string) => void;
  onOpenSecurityModal: () => void;
  onOpenMobileQr: () => void;
  onSaveNote: (text: string, tag?: string) => void;
  onToast: (msg: string) => void;
}

const LANG_DISPLAY: Record<LanguageCode, { native: string; label: string; speaker: string }> = {
  kn: { native: 'ಕನ್ನಡ', label: 'Kannada', speaker: 'Kannada Audio Synced' },
  hi: { native: 'हिन्दी', label: 'Hindi', speaker: 'Hindi Audio Synced' },
  ta: { native: 'தமிழ்', label: 'Tamil', speaker: 'Tamil Audio Synced' },
  en: { native: 'EN', label: 'English', speaker: 'English Audio Synced' },
};

interface QaHistoryEntry {
  question: string;
  answerNative: string;
  answerEn: string;
  statutoryNote: string;
  clauseId: string;
  excerpt: string;
}

export const DesktopWorkspace: React.FC<DesktopWorkspaceProps> = ({
  audit,
  vaultDoc,
  language,
  onChangeLanguage,
  onBackHome,
  onOpenBriefModal,
  onOpenWhatsAppModal,
  onOpenSecurityModal,
  onOpenMobileQr,
  onSaveNote,
  onToast,
}) => {
  const [layoutMode, setLayoutMode] = useState<'report' | 'split' | 'scan'>('split');
  const [leftTab, setLeftTab] = useState<'understand' | 'negotiate' | 'notes'>('understand');
  const [sheetView, setSheetView] = useState<'reconstructed' | 'original'>('reconstructed');
  const [zoomPct, setZoomPct] = useState<number>(100);
  const [wayOutMonth, setWayOutMonth] = useState<number>(
    Math.min(Math.max(1, Math.floor((audit.way_out_params.lock_in_months || 6) / 2)), audit.way_out_params.total_months || 11),
  );
  const [activeClauseId, setActiveClauseId] = useState<string | null>(null);
  const [verifiedOcrTokens, setVerifiedOcrTokens] = useState<Record<string, boolean>>({});
  const [ocrPopoverClauseId, setOcrPopoverClauseId] = useState<string | null>(null);

  // Negotiate state
  const [tone, setTone] = useState<'polite' | 'firm'>('polite');
  const [selectedFindingIds, setSelectedFindingIds] = useState<string[]>(() =>
    audit.findings.filter((f) => f.negotiation.default_selected).map((f) => f.finding_id),
  );
  const [includeMissingAddendum, setIncludeMissingAddendum] = useState<boolean>(false);
  const [customDraftOverride, setCustomDraftOverride] = useState<string | null>(null);

  // Audio playback state
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioSpeed, setAudioSpeed] = useState<number>(1.0);
  const [playingCaption, setPlayingCaption] = useState<string>(audit.summary.audio_duration_label);

  // Private notes state
  const [noteInput, setNoteInput] = useState('');

  // Floating Q&A drawer (D7)
  const [qaOpen, setQaOpen] = useState(false);
  const [qaQuestion, setQaQuestion] = useState('');
  const [qaLoading, setQaLoading] = useState(false);
  // Real Hold-to-Ask capture: idle → requesting (mic opening) → recording → transcribing → answering
  const [voiceStage, setVoiceStage] = useState<'idle' | 'requesting' | 'recording' | 'transcribing' | 'answering'>(
    'idle',
  );
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const voiceHandleRef = useRef<VoiceCaptureHandle | null>(null);
  const voiceFailedRef = useRef(false);
  const voicePressActiveRef = useRef(false);
  const voiceAnswerRef = useRef<HTMLDivElement | null>(null);
  const [qaHistory, setQaHistory] = useState<QaHistoryEntry[]>(() =>
    audit.qa_presets.slice(0, 1).map((q) => ({
      question: q.question_native || q.question_en,
      answerNative: q.answer_native,
      answerEn: q.answer_en,
      statutoryNote: q.statutory_note,
      clauseId: q.clause_id,
      excerpt: q.excerpt,
    })),
  );

  const clauseRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const wayOut = useMemo(
    () => calculateWayOutAtMonth(audit.way_out_params, wayOutMonth),
    [audit.way_out_params, wayOutMonth],
  );

  const generatedDraft = useMemo(() => {
    const selected = audit.findings.filter((f) => selectedFindingIds.includes(f.finding_id));
    const party = audit.stamp_header.lessor_name || 'Counterparty';
    const greeting =
      tone === 'polite'
        ? `Hi ${party}, thank you for sharing the draft of "${audit.title.split(' • ')[0]}". Before signing, could we align on the points below?`
        : `Dear ${party}, following our review of "${audit.title.split(' • ')[0]}" against ${audit.rule_pack_applied.display_name}, please update the following clauses prior to execution:`;

    const lines = selected.map((f, i) => `${i + 1}. ${tone === 'polite' ? f.negotiation.polite_ask : f.negotiation.firm_ask}`);

    if (includeMissingAddendum && audit.missing_clauses.length > 0) {
      const m = audit.missing_clauses[0];
      lines.push(
        `${lines.length + 1}. ${m.label}: ${m.recommended_addendum || m.why_it_matters}`,
      );
    }

    const closing =
      tone === 'polite'
        ? 'Happy to sign immediately once these standard points are updated. Thank you!'
        : 'Kindly circulate the revised clean draft for signature. Regards.';

    return `${greeting}\n\n${lines.length ? lines.join('\n') : 'No modifications selected.'}\n\n${closing}`;
  }, [audit, selectedFindingIds, tone, includeMissingAddendum]);

  const activeDraft = customDraftOverride !== null ? customDraftOverride : generatedDraft;

  const jumpToClause = (clauseId: string) => {
    setSheetView('reconstructed');
    if (layoutMode === 'report') setLayoutMode('split');
    setActiveClauseId(clauseId);
    setTimeout(() => {
      const el = clauseRefs.current[clauseId];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 60);
    setTimeout(() => {
      setActiveClauseId((curr) => (curr === clauseId ? null : curr));
    }, 2600);
  };

  const handlePlaySpeech = async (text: string, label?: string) => {
    if (isPlayingAudio && (!label || playingCaption === label)) {
      stopAllSpeech();
      setIsPlayingAudio(false);
      return;
    }
    setPlayingCaption(label || audit.summary.audio_duration_label);
    await playRegionalSpeech(text, language, audioSpeed, {
      onStart: () => setIsPlayingAudio(true),
      onEnd: () => setIsPlayingAudio(false),
      onFallback: () => {},
    });
  };

  const cycleSpeed = () => {
    const next = audioSpeed === 1.0 ? 1.25 : audioSpeed === 1.25 ? 1.5 : 1.0;
    setAudioSpeed(next);
    onToast(`Audio playback speed set to ${next}x`);
  };

  const handleToggleFinding = (findingId: string) => {
    setCustomDraftOverride(null);
    setSelectedFindingIds((prev) =>
      prev.includes(findingId) ? prev.filter((id) => id !== findingId) : [...prev, findingId],
    );
  };

  const handleAskQuestion = async (qText: string): Promise<QaHistoryEntry | null> => {
    const trimmed = qText.trim();
    if (!trimmed) return null;
    setQaQuestion('');
    setQaLoading(true);
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
          const entry: QaHistoryEntry = {
            question: trimmed,
            answerNative: data.spoken_script || data.answer_en || '',
            answerEn: data.answer_en || '',
            statutoryNote: data.statutory_note || audit.rule_pack_applied.display_name,
            clauseId: data.clause_id || audit.clauses[0]?.clause_id || 'clause-4-2',
            excerpt: data.verbatim_quote || audit.clauses[0]?.text || '',
          };
          setQaHistory((prev) => [...prev, entry]);
          return entry;
        }
      }
      throw new Error('Fallback to grounded preset Q&A');
    } catch {
      const lower = trimmed.toLowerCase();
      const presetMatch =
        audit.qa_presets.find((p) =>
          p.chip.toLowerCase().split(/\s+/).some((w) => w.length > 3 && lower.includes(w)),
        ) || audit.qa_presets[0];
      const entry: QaHistoryEntry = {
        question: trimmed,
        answerNative: presetMatch?.answer_native || audit.findings[0]?.spoken_script || 'Clause reviewed.',
        answerEn: presetMatch?.answer_en || audit.findings[0]?.plain_explanation || 'See highlighted clauses.',
        statutoryNote: presetMatch?.statutory_note || audit.rule_pack_applied.display_name,
        clauseId: presetMatch?.clause_id || audit.clauses[0]?.clause_id || 'clause-4-2',
        excerpt: presetMatch?.excerpt || audit.clauses[0]?.text || '',
      };
      setQaHistory((prev) => [...prev, entry]);
      return entry;
    } finally {
      setQaLoading(false);
    }
  };

  /** Existing tap-a-sample behaviour, kept as the graceful path when voice is unusable. */
  const sampleQuestion = audit.qa_presets[0]?.question_en || audit.qa_presets[0]?.chip || '';

  const fallbackToSampleQuestion = () => {
    onToast('Voice unavailable — pick a sample question');
    if (sampleQuestion) void handleAskQuestion(sampleQuestion);
  };

  /** POST /api/qa → show the answer card → scroll/highlight the grounded clause → speak the script. */
  const answerVoiceTranscript = async (transcript: string) => {
    setVoiceStage('answering');
    setQaOpen(true);
    const entry = await handleAskQuestion(transcript);
    if (!entry) {
      setVoiceStage('idle');
      fallbackToSampleQuestion();
      return;
    }
    jumpToClause(entry.clauseId);
    setVoiceStage('idle');
    window.requestAnimationFrame(() => {
      voiceAnswerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    const spoken = entry.answerNative || entry.answerEn;
    if (spoken) {
      setPlayingCaption('Q&A Answer');
      setIsPlayingAudio(true);
      await playRegionalSpeech(spoken, language, audioSpeed, {
        onStart: () => setIsPlayingAudio(true),
        onEnd: () => setIsPlayingAudio(false),
        onFallback: () => {},
      });
      setIsPlayingAudio(false);
    }
  };

  const handleVoicePressStart = async (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (voiceStage !== 'idle') return;
    voiceFailedRef.current = false;
    voicePressActiveRef.current = true;
    setVoiceTranscript('');
    setVoiceStage('requesting');
    try {
      const handle = await startVoiceCapture({ maxDurationMs: 30_000 });
      // Released (or cancelled) before the mic permission resolved — do not keep recording.
      if (!voicePressActiveRef.current) {
        handle.cancel();
        handle.cleanup();
        setVoiceStage('idle');
        return;
      }
      voiceHandleRef.current = handle;
      setVoiceStage('recording');
    } catch {
      voiceHandleRef.current = null;
      voiceFailedRef.current = true;
      setVoiceStage('idle');
    }
  };

  const handleVoicePressEnd = async () => {
    voicePressActiveRef.current = false;
    if (voiceFailedRef.current) {
      voiceFailedRef.current = false;
      setVoiceStage('idle');
      fallbackToSampleQuestion();
      return;
    }

    const handle = voiceHandleRef.current;
    voiceHandleRef.current = null;
    if (!handle) return;

    try {
      const capture = await handle.stop();
      handle.cleanup();

      // A quick tap (no held speech) keeps the existing tap-a-sample behaviour.
      if (capture.durationMs < MIN_VOICE_CAPTURE_MS) {
        setVoiceStage('idle');
        if (sampleQuestion) void handleAskQuestion(sampleQuestion);
        return;
      }

      setVoiceStage('transcribing');
      const stt = await transcribeAudio(capture.dataUrl, language);
      if (!stt.ok || !stt.transcript) throw new Error(stt.reason || 'STT unavailable');

      setVoiceTranscript(stt.transcript);
      await answerVoiceTranscript(stt.transcript);
    } catch {
      setVoiceStage('idle');
      fallbackToSampleQuestion();
    }
  };

  const handleVoicePressCancel = () => {
    voicePressActiveRef.current = false;
    const handle = voiceHandleRef.current;
    voiceHandleRef.current = null;
    if (handle) {
      handle.cancel();
      handle.cleanup();
    }
    voiceFailedRef.current = false;
    setVoiceStage((stage) =>
      stage === 'recording' || stage === 'requesting' || stage === 'transcribing' ? 'idle' : stage,
    );
  };

  // Release the mic if the component unmounts mid-recording.
  useEffect(
    () => () => {
      voiceHandleRef.current?.cancel();
      voiceHandleRef.current?.cleanup();
      voiceHandleRef.current = null;
    },
    [],
  );

  const langInfo = LANG_DISPLAY[language];
  const isCritical = audit.summary.risk_band === 'critical';
  const isSafe = audit.summary.risk_band === 'safe';

  return (
    <div className="min-h-screen h-screen flex flex-col bg-surface text-on-surface overflow-hidden">
      {/* Row 1 + Row 2 Sticky Header matching D2/D3 */}
      <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-outline-variant/40 shadow-xs shrink-0">
        {/* Row 1 */}
        <div className="w-full max-w-[1600px] mx-auto px-4 lg:px-6 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => {
                stopAllSpeech();
                onBackHome();
              }}
              className="flex items-center gap-2 shrink-0 cursor-pointer group"
              title="Back to Analyzer Workspace"
            >
              <div className="w-8 h-8 rounded-lg bg-primary-container flex items-center justify-center text-white">
                <Icon name="verified_user" className="text-[18px]" />
              </div>
              <div className="flex flex-col text-left">
                <div className="flex items-center gap-1">
                  <span className="text-[16px] font-bold text-on-surface tracking-tight group-hover:text-primary-container whitespace-nowrap">
                    LawLens
                  </span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary-container text-white font-bold uppercase">
                    PRO
                  </span>
                </div>
                <span className="text-[10px] text-on-surface-variant whitespace-nowrap">AI Legal X-Ray</span>
              </div>
            </button>

            <div className="hidden md:block w-[1px] h-7 bg-outline-variant/40" />

            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-md bg-surface-container flex items-center justify-center text-primary-container shrink-0">
                <Icon name="description" className="text-[17px]" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-on-surface truncate max-w-[200px] xl:max-w-[280px]">
                    {audit.title}
                  </span>
                  <span className="hidden xl:inline-flex px-2 py-0.5 rounded bg-surface-container text-[10px] font-medium text-on-surface-variant whitespace-nowrap">
                    {audit.meta_badge}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px] font-bold whitespace-nowrap">
                  <span
                    className={
                      isSafe ? 'text-emerald-700' : isCritical ? 'text-error' : 'text-amber-700'
                    }
                  >
                    ● Score: {audit.summary.risk_score} • {isSafe ? 'Safe' : isCritical ? 'Critical' : 'Caution'}
                  </span>
                  {audit.summary.rupee_exposure_inr > 0 && (
                    <>
                      <span className="text-outline-variant">•</span>
                      <span className="text-error tabular-nums">
                        ₹{audit.summary.rupee_exposure_inr.toLocaleString('en-IN')} Extra Financial Risk
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Center-Right: Mode Toggle + Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden lg:flex items-center p-1 rounded-xl bg-surface-container border border-outline-variant/40">
              {(['report', 'split', 'scan'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    setLayoutMode(mode);
                    if (mode === 'scan') setSheetView('original');
                    if (mode === 'split') setSheetView('reconstructed');
                  }}
                  className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-all whitespace-nowrap cursor-pointer ${
                    layoutMode === mode
                      ? 'bg-white text-primary-container font-bold shadow-xs'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {mode === 'report' ? 'Report' : mode === 'split' ? 'Split' : 'Original Scan'}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={onOpenBriefModal}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-outline-variant/50 bg-white text-on-surface hover:bg-surface-container-low text-xs font-semibold whitespace-nowrap cursor-pointer"
            >
              <Icon name="summarize" className="text-[16px] text-primary-container" />
              <span>Export 1-Pg Brief</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenWhatsAppModal(activeDraft)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-primary-container text-white hover:opacity-95 text-xs font-bold shadow-xs whitespace-nowrap cursor-pointer"
            >
              <Icon name="chat" className="text-[16px]" />
              <span>Draft WhatsApp Message</span>
            </button>

            <button
              type="button"
              onClick={onOpenMobileQr}
              className="hidden xl:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container text-xs font-semibold text-on-surface whitespace-nowrap cursor-pointer"
              title="Open Mobile QR"
            >
              <Icon name="qr_code_2" className="text-[16px] text-primary-container" />
              <span>Mobile QR</span>
            </button>

            <div className="w-8 h-8 rounded-full bg-surface-container-high border border-primary-container/20 flex items-center justify-center text-xs font-bold text-primary-container shrink-0">
              VK
            </div>
          </div>
        </div>

        {/* Row 2: Statutory & PII Compliance Proof Bar */}
        <div className="w-full bg-surface-container-low/80 border-t border-outline-variant/30">
          <div className="w-full max-w-[1600px] mx-auto px-4 lg:px-6 py-1.5 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={onOpenSecurityModal}
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 text-[11px] font-bold hover:bg-emerald-200 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Icon name="shield" className="text-[14px]" />
                <span>Local PII Shield: {audit.pii_masked_tokens.length} tokens masked on-device</span>
              </button>

              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white border border-outline-variant/40 text-[11px] font-semibold text-on-surface whitespace-nowrap">
                <Icon name="account_balance" className="text-[14px] text-primary-container" />
                <span>{audit.rule_pack_applied.display_name}</span>
                <span className="text-primary-container font-bold">
                  {audit.rule_pack_applied.match_pct}% Matched
                </span>
              </span>

              <button
                type="button"
                onClick={() => handlePlaySpeech(audit.summary.walkthrough_intro_spoken[language], langInfo.speaker)}
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white border border-outline-variant/40 text-[11px] font-semibold text-on-surface hover:border-primary-container transition-colors cursor-pointer whitespace-nowrap"
              >
                <Icon name="headphones" className="text-[14px] text-primary-container" />
                <span>
                  {langInfo.native} ({langInfo.speaker})
                </span>
              </button>

              <div className="hidden md:flex items-center gap-1 ml-1">
                {(['kn', 'hi', 'ta', 'en'] as LanguageCode[]).map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => onChangeLanguage(code)}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase cursor-pointer ${
                      language === code
                        ? 'bg-primary-container text-white'
                        : 'bg-white text-on-surface-variant hover:text-on-surface border border-outline-variant/30'
                    }`}
                  >
                    {code}
                  </button>
                ))}
              </div>
            </div>

            <div className="hidden sm:flex items-center gap-3 text-[11px] text-on-surface-variant whitespace-nowrap">
              <span className="flex items-center gap-1 text-emerald-700 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                Dual Panes Synchronized
              </span>
              <span>•</span>
              <span>Ephemeral Client Sandbox</span>
            </div>
          </div>
        </div>
      </header>

      {/* Missing Page Stress Test Warning Banner */}
      {audit.completeness.status === 'missing_pages' && (
        <div className="w-full bg-amber-50 border-b border-amber-300 px-6 py-2 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-2 text-xs text-amber-950 font-semibold">
            <Icon name="warning" className="text-amber-700 text-[18px]" />
            <span>
              <strong>Completeness Gate Triggered:</strong>{' '}
              {audit.completeness.missing_gaps.join(' • ')}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setLeftTab('negotiate');
              onToast('Added missing page request to Negotiate tab.');
            }}
            className="px-3 py-1 rounded-lg bg-amber-700 text-white text-[11px] font-bold hover:bg-amber-800 whitespace-nowrap cursor-pointer"
          >
            Request Missing Pages
          </button>
        </div>
      )}

      {/* Split Workspace Main Area */}
      <main className="flex-1 flex overflow-hidden">
        {/* LEFT PANE (48% in Split, 100% in Report) */}
        {layoutMode !== 'scan' && (
          <section
            className={`${
              layoutMode === 'split' ? 'w-full lg:w-[48%]' : 'w-full max-w-4xl mx-auto'
            } h-full flex flex-col bg-white border-r border-outline-variant/40 overflow-hidden`}
          >
            {/* 3-Tab Header */}
            <div className="px-4 pt-2.5 border-b border-outline-variant/30 flex items-center gap-2 bg-surface-container-lowest shrink-0">
              <button
                type="button"
                onClick={() => setLeftTab('understand')}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                  leftTab === 'understand'
                    ? 'border-primary-container text-primary-container'
                    : 'border-transparent text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <Icon name="lightbulb" className="text-[16px]" />
                <span>1. Understand</span>
              </button>
              <button
                type="button"
                onClick={() => setLeftTab('negotiate')}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                  leftTab === 'negotiate'
                    ? 'border-primary-container text-primary-container'
                    : 'border-transparent text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <Icon name="gavel" className="text-[16px]" />
                <span>2. Negotiate</span>
                <span className="px-1.5 py-0.5 rounded-full bg-surface-container text-[10px] font-bold text-primary-container tabular-nums">
                  {audit.findings.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setLeftTab('notes')}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                  leftTab === 'notes'
                    ? 'border-primary-container text-primary-container'
                    : 'border-transparent text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <Icon name="notes" className="text-[16px]" />
                <span>3. Notes &amp; Audio</span>
              </button>
            </div>

            {/* Scrollable Tab Content */}
            <div className="flex-1 overflow-y-auto custom-scroll p-5 space-y-5">
              {leftTab === 'understand' && (
                <>
                  {/* Hero Exposure Card */}
                  <div
                    className={`rounded-2xl p-5 border space-y-4 ${
                      isSafe
                        ? 'bg-emerald-50/70 border-emerald-200'
                        : 'bg-red-50/60 border-red-200'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <span
                          className={`text-[10px] font-bold uppercase tracking-widest ${
                            isSafe ? 'text-emerald-800' : 'text-error'
                          }`}
                        >
                          {isSafe ? 'VERIFIED CONTRACT EXPOSURE' : 'UNCHECKED FINANCIAL EXPOSURE'}
                        </span>
                        <div className="flex items-baseline gap-2 mt-1">
                          <span
                            className={`text-3xl font-extrabold tabular-nums ${
                              isSafe ? 'text-emerald-800' : 'text-error'
                            }`}
                          >
                            ₹{audit.summary.rupee_exposure_inr.toLocaleString('en-IN')}
                          </span>
                          <span className="text-xs font-medium text-on-surface-variant">
                            {audit.summary.exposure_caption}
                          </span>
                        </div>
                      </div>
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                          isSafe ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-error'
                        }`}
                      >
                        <Icon name="account_balance_wallet" className="text-[20px]" />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2.5">
                      {audit.summary.breakdown_cards.map((card) => (
                        <div
                          key={card.label}
                          className="p-2.5 rounded-xl bg-white border border-outline-variant/30 shadow-xs"
                        >
                          <span className="text-[10px] text-on-surface-variant block font-medium">
                            {card.label}
                          </span>
                          <span className="text-sm font-extrabold text-on-surface tabular-nums block mt-0.5">
                            {card.value}
                          </span>
                          <span
                            className={`text-[10px] font-bold block mt-0.5 ${
                              card.tone === 'error'
                                ? 'text-error'
                                : card.tone === 'caution'
                                  ? 'text-amber-700'
                                  : 'text-emerald-700'
                            }`}
                          >
                            {card.sublabel}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="p-3 rounded-xl bg-white/80 border border-outline-variant/30 text-xs text-on-surface-variant leading-relaxed">
                      <strong className="text-on-surface">Statutory Alert:</strong> {audit.summary.alert_banner}
                    </div>
                  </div>

                  {/* Top 3 Things You're Agreeing To */}
                  <div className="rounded-2xl border border-outline-variant/40 bg-white p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon name="fact_check" className="text-primary-container text-[18px]" />
                        <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface">
                          Top 3 Things You&apos;re Agreeing To
                        </h3>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-container font-semibold text-on-surface-variant">
                        Plain {langInfo.label}
                      </span>
                    </div>

                    <div className="space-y-2.5">
                      {audit.summary.top_3_bullets.map((b, i) => (
                        <div key={b.title} className="flex items-start gap-3">
                          <div className="w-6 h-6 rounded-full bg-primary-container/10 text-primary-container font-bold text-xs flex items-center justify-center shrink-0 mt-0.5 tabular-nums">
                            {i + 1}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-on-surface">{b.title}</p>
                            <p className="text-[11px] text-on-surface-variant leading-relaxed mt-0.5">{b.detail}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Interactive Way Out Timeline */}
                  <div className="rounded-2xl border border-outline-variant/40 bg-white p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                          Exit Penalty Simulation
                        </span>
                        <h3 className="text-sm font-bold text-on-surface">The &quot;Way Out&quot; Timeline</h3>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-surface-container text-[11px] font-bold text-primary-container">
                        Month {wayOutMonth} Active Sim
                      </span>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[10px] font-semibold text-on-surface-variant">
                        <span>Start (Mo 1)</span>
                        <span className={wayOut.inLockIn ? 'text-error font-bold' : ''}>
                          Month {wayOutMonth} (Selected)
                        </span>
                        {audit.way_out_params.lock_in_months > 0 && (
                          <span className="text-primary-container font-bold">
                            Month {audit.way_out_params.lock_in_months} (Lock-in End)
                          </span>
                        )}
                        <span>Month {audit.way_out_params.total_months} (Expiry)</span>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={audit.way_out_params.total_months || 11}
                        value={wayOutMonth}
                        onChange={(e) => setWayOutMonth(Number(e.target.value))}
                        aria-label="Way Out Timeline exit month"
                        className="w-full accent-primary-container cursor-pointer"
                      />
                    </div>

                    <div
                      className={`p-3 rounded-xl border text-xs space-y-1 ${
                        wayOut.totalCashLossInr > 0
                          ? 'bg-red-50 border-red-200 text-red-950'
                          : 'bg-emerald-50 border-emerald-200 text-emerald-950'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold">
                        <Icon
                          name={wayOut.totalCashLossInr > 0 ? 'warning' : 'check_circle'}
                          className={`text-[16px] ${wayOut.totalCashLossInr > 0 ? 'text-error' : 'text-emerald-700'}`}
                        />
                        <span>{wayOut.headline}</span>
                      </div>
                      <p className="text-[11px] opacity-90 leading-relaxed">{wayOut.breakdown}</p>
                    </div>
                  </div>

                  {/* Analyzed Clauses */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface">
                        Analyzed Clauses ({audit.findings.length} Flags)
                      </h3>
                      <span className="text-[11px] text-on-surface-variant">Click to highlight sheet</span>
                    </div>

                    {audit.findings.map((f) => {
                      const crit = f.severity === 'critical';
                      const caut = f.severity === 'caution';
                      return (
                        <div
                          key={f.finding_id}
                          className={`rounded-2xl p-4 border space-y-2.5 transition-shadow hover:shadow-sm ${
                            crit
                              ? 'border-red-200 bg-white'
                              : caut
                                ? 'border-amber-200 bg-white'
                                : 'border-emerald-200 bg-white'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span
                              className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                                crit
                                  ? 'bg-red-100 text-error'
                                  : caut
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              ● {f.severity.toUpperCase()} • {f.category}
                            </span>
                            <span className="text-[11px] font-mono text-on-surface-variant">{f.line_ref}</span>
                          </div>

                          <h4 className="text-sm font-bold text-on-surface">{f.headline}</h4>
                          <p className="text-xs text-on-surface-variant leading-relaxed">
                            {f.statutory_rule_text && (
                              <strong className="text-primary-container">{f.statutory_rule_text} </strong>
                            )}
                            {f.plain_explanation}
                          </p>

                          {f.risk_detail && (
                            <div className="p-2.5 rounded-xl bg-surface-container-low text-[11px] text-on-surface-variant">
                              <strong className="text-on-surface">Risk:</strong> {f.risk_detail}
                            </div>
                          )}

                          <div className="flex items-center justify-between pt-1 gap-2 flex-wrap">
                            <button
                              type="button"
                              onClick={() => jumpToClause(f.clause_id)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-container text-white text-[11px] font-bold hover:opacity-95 cursor-pointer"
                            >
                              <Icon name="my_location" className="text-[14px]" />
                              <span>Jump to Clause in Sheet →</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handlePlaySpeech(f.spoken_script, f.headline)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface text-[11px] font-semibold cursor-pointer"
                            >
                              <Icon name="volume_up" className="text-[14px] text-primary-container" />
                              <span>Listen {langInfo.label} Audio</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {/* Missing Clauses */}
                    {audit.missing_clauses.map((mc) => (
                      <div
                        key={mc.label}
                        className="rounded-2xl p-4 border border-dashed border-amber-300 bg-amber-50/40 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase text-amber-800">
                            ⓘ MISSING CLAUSE
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-white border border-amber-200 font-semibold text-amber-900">
                            Contract Gap
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-on-surface">{mc.label}</h4>
                        <p className="text-xs text-on-surface-variant">{mc.why_it_matters}</p>
                        <button
                          type="button"
                          onClick={() => {
                            setIncludeMissingAddendum(true);
                            setCustomDraftOverride(null);
                            setLeftTab('negotiate');
                            onToast(`Added ${mc.label} addendum to Negotiate draft.`);
                          }}
                          className="inline-flex items-center gap-1 text-xs font-bold text-primary-container hover:underline cursor-pointer"
                        >
                          <Icon name="add_circle" className="text-[15px]" />
                          <span>Insert Recommended Addendum</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {leftTab === 'negotiate' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-on-surface">Counter-Offer Builder</h3>
                      <p className="text-xs text-on-surface-variant">
                        Select clauses to contest and copy or send via WhatsApp
                      </p>
                    </div>
                    <div className="flex items-center p-1 rounded-lg bg-surface-container text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          setTone('polite');
                          setCustomDraftOverride(null);
                        }}
                        className={`px-2.5 py-1 rounded font-semibold cursor-pointer ${
                          tone === 'polite' ? 'bg-white text-primary-container shadow-xs font-bold' : 'text-on-surface-variant'
                        }`}
                      >
                        Polite
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTone('firm');
                          setCustomDraftOverride(null);
                        }}
                        className={`px-2.5 py-1 rounded font-semibold cursor-pointer ${
                          tone === 'firm' ? 'bg-white text-primary-container shadow-xs font-bold' : 'text-on-surface-variant'
                        }`}
                      >
                        Firm Statutory
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {audit.findings.map((f) => {
                      const checked = selectedFindingIds.includes(f.finding_id);
                      return (
                        <label
                          key={f.finding_id}
                          className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                            checked
                              ? 'border-primary-container bg-blue-50/40'
                              : 'border-outline-variant/40 bg-white'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => handleToggleFinding(f.finding_id)}
                            className="mt-0.5 accent-primary-container"
                          />
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-on-surface">{f.negotiation.short_title}</span>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant">
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

                  <div className="space-y-1.5">
                    <label htmlFor="desktop-negotiate-draft" className="text-xs font-bold text-on-surface">
                      Live Counter-Offer Message
                    </label>
                    <textarea
                      id="desktop-negotiate-draft"
                      rows={9}
                      value={activeDraft}
                      onChange={(e) => setCustomDraftOverride(e.target.value)}
                      className="w-full rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-3 text-xs leading-relaxed text-on-surface focus:outline-none focus:border-primary-container"
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(activeDraft).catch(() => {});
                        onToast('Counter-offer draft copied to clipboard!');
                      }}
                      className="px-4 py-2.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-xs font-bold text-on-surface cursor-pointer"
                    >
                      Copy Draft
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenWhatsAppModal(activeDraft)}
                      className="flex-1 px-4 py-2.5 rounded-xl bg-primary-container text-white text-xs font-bold hover:opacity-95 cursor-pointer flex items-center justify-center gap-2"
                    >
                      <Icon name="chat" className="text-[16px]" />
                      <span>Open in WhatsApp Composer</span>
                    </button>
                  </div>
                </div>
              )}

              {leftTab === 'notes' && (
                <div className="space-y-4">
                  <div className="rounded-2xl p-4 bg-surface-container-low border border-outline-variant/40 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-on-surface">
                        {langInfo.label} Spoken Walkthrough Script
                      </span>
                      <button
                        type="button"
                        onClick={() => handlePlaySpeech(audit.summary.walkthrough_intro_spoken[language])}
                        className="px-3 py-1 rounded-lg bg-primary-container text-white text-[11px] font-bold cursor-pointer"
                      >
                        {isPlayingAudio ? 'Stop Audio' : `Play ${langInfo.label}`}
                      </button>
                    </div>
                    <p className="text-xs text-on-surface leading-relaxed bg-white p-3 rounded-xl border border-outline-variant/30">
                      {audit.summary.walkthrough_intro_spoken[language]}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-on-surface uppercase tracking-wider">
                      Private Local Notebook (On-Device Only)
                    </h4>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={noteInput}
                        onChange={(e) => setNoteInput(e.target.value)}
                        placeholder="Add landlord discussion note (saved locally)..."
                        className="flex-1 rounded-xl border border-outline-variant/60 px-3 py-2 text-xs bg-white focus:outline-none focus:border-primary-container"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!noteInput.trim()) return;
                          onSaveNote(noteInput.trim(), 'Workspace Note');
                          setNoteInput('');
                        }}
                        className="px-4 py-2 rounded-xl bg-primary-container text-white text-xs font-bold cursor-pointer"
                      >
                        Save Note
                      </button>
                    </div>

                    <div className="space-y-2 pt-2">
                      {(vaultDoc?.notes || []).length === 0 ? (
                        <p className="text-xs text-on-surface-variant italic">No private notes saved yet.</p>
                      ) : (
                        vaultDoc?.notes.map((n) => (
                          <div
                            key={n.id}
                            className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs space-y-1"
                          >
                            <div className="flex items-center justify-between text-[10px] text-on-surface-variant">
                              <span className="font-bold text-primary-container">{n.tag}</span>
                              <span>{n.createdAt}</span>
                            </div>
                            <p className="text-on-surface">&ldquo;{n.text}&rdquo;</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Sticky Audio Walkthrough Footer */}
            <div className="px-4 py-2.5 border-t border-outline-variant/40 bg-surface-container-lowest flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => handlePlaySpeech(audit.summary.walkthrough_intro_spoken[language])}
                  aria-label={isPlayingAudio ? 'Pause audio walkthrough' : 'Play audio walkthrough'}
                  className="w-8 h-8 rounded-full bg-primary-container text-white flex items-center justify-center shrink-0 cursor-pointer hover:opacity-90"
                >
                  <Icon name={isPlayingAudio ? 'pause' : 'play_arrow'} className="text-[18px]" filled />
                </button>
                <div className="min-w-0">
                  <span className="text-xs font-bold text-on-surface block truncate">
                    Audio Walkthrough in {langInfo.label}
                  </span>
                  <span className="text-[11px] text-on-surface-variant block truncate">{playingCaption}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={cycleSpeed}
                className="px-2 py-1 rounded bg-surface-container text-[11px] font-bold font-mono text-on-surface hover:bg-surface-container-high cursor-pointer"
              >
                {audioSpeed.toFixed(1)}x
              </button>
            </div>
          </section>
        )}

        {/* RIGHT PANE (52% in Split, 100% in Original Scan) */}
        {layoutMode !== 'report' && (
          <section
            className={`${
              layoutMode === 'split' ? 'hidden lg:flex lg:w-[52%]' : 'flex w-full'
            } h-full flex-col bg-surface-container-low overflow-hidden`}
          >
            {/* Sheet Toolbar */}
            <div className="px-4 py-2 bg-white border-b border-outline-variant/40 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-1 p-1 rounded-xl bg-surface-container">
                <button
                  type="button"
                  onClick={() => setSheetView('reconstructed')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                    sheetView === 'reconstructed'
                      ? 'bg-white text-primary-container font-bold shadow-xs'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <Icon name="article" className="text-[15px]" />
                  <span>Reconstructed Text</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSheetView('original')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                    sheetView === 'original'
                      ? 'bg-white text-primary-container font-bold shadow-xs'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <Icon name="photo_library" className="text-[15px]" />
                  <span>Original Scan Photo</span>
                </button>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <div className="flex items-center gap-1 bg-surface-container-low border border-outline-variant/40 rounded-lg px-2 py-1 font-mono text-[11px]">
                  <button
                    type="button"
                    onClick={() => setZoomPct((z) => Math.max(80, z - 10))}
                    aria-label="Zoom out"
                    className="px-1 hover:text-primary-container cursor-pointer"
                  >
                    -
                  </button>
                  <span className="font-bold tabular-nums">{zoomPct}%</span>
                  <button
                    type="button"
                    onClick={() => setZoomPct((z) => Math.min(130, z + 10))}
                    aria-label="Zoom in"
                    className="px-1 hover:text-primary-container cursor-pointer"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoomPct(100)}
                    className="pl-1 border-l border-outline-variant/40 text-on-surface-variant hover:text-on-surface cursor-pointer"
                  >
                    Fit
                  </button>
                </div>
                <span className="text-[11px] font-medium text-on-surface-variant whitespace-nowrap">Page 2 of 3</span>
              </div>
            </div>

            {/* Legend strip */}
            <div className="px-5 py-1.5 bg-surface-container-low border-b border-outline-variant/30 flex items-center justify-between text-[11px] shrink-0">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1 font-medium text-on-surface-variant">
                  <span className="w-2 h-2 rounded-full bg-error" /> Critical
                </span>
                <span className="flex items-center gap-1 font-medium text-on-surface-variant">
                  <span className="w-2 h-2 rounded-full bg-amber-600" /> Caution
                </span>
                <span className="flex items-center gap-1 font-medium text-on-surface-variant">
                  <span className="w-2 h-2 rounded-full bg-emerald-600" /> Safe
                </span>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-blue-50 text-primary-container font-bold text-[10px]">
                ● OCR Confidence 99.8%
              </span>
            </div>

            {/* Sheet Body */}
            <div className="flex-1 overflow-y-auto custom-scroll p-6 pb-20">
              {sheetView === 'reconstructed' ? (
                <div
                  className="max-w-[680px] mx-auto bg-white rounded-xl shadow-sm border border-outline-variant/50 p-8 sm:p-10 space-y-6 origin-top transition-transform"
                  style={{ transform: `scale(${zoomPct / 100})` }}
                >
                  {/* Legal Doc Header */}
                  <div className="flex items-start justify-between text-[10px] font-mono text-on-surface-variant uppercase tracking-wider">
                    <span>{audit.stamp_header.reg_line}</span>
                    <span className="font-bold text-primary-container">{audit.stamp_header.stamp_value}</span>
                  </div>

                  <div className="text-center space-y-1 pt-2">
                    <h2 className="font-serif text-xl font-bold tracking-tight text-on-surface">
                      {audit.stamp_header.doc_title}
                    </h2>
                    <p className="font-serif text-xs text-on-surface-variant uppercase tracking-widest">
                      {audit.stamp_header.doc_subtitle}
                    </p>
                  </div>

                  <p className="font-serif text-[14px] leading-relaxed text-on-surface">
                    {audit.stamp_header.recitals}
                  </p>

                  {/* Clause Blocks */}
                  <div className="space-y-4">
                    {audit.clauses.map((clause: ContractClause) => {
                      const isActive = activeClauseId === clause.clause_id;
                      const isAnyActive = activeClauseId !== null;
                      const borderClass =
                        clause.severity === 'critical'
                          ? 'border-red-300 bg-red-50/35'
                          : clause.severity === 'caution'
                            ? 'border-amber-300 bg-amber-50/35'
                            : 'border-emerald-300 bg-emerald-50/30';

                      const renderTextWithToken = () => {
                        if (!clause.ocr_highlight_token || !clause.text.includes(clause.ocr_highlight_token)) {
                          return clause.text;
                        }
                        const parts = clause.text.split(clause.ocr_highlight_token);
                        const isVerified = !!verifiedOcrTokens[clause.clause_id];
                        return (
                          <>
                            {parts[0]}
                            <span className="relative inline-block">
                              <button
                                type="button"
                                onClick={() =>
                                  setOcrPopoverClauseId((curr) =>
                                    curr === clause.clause_id ? null : clause.clause_id,
                                  )
                                }
                                className={`px-1.5 py-0.5 rounded font-bold underline decoration-dashed underline-offset-4 cursor-pointer ${
                                  isVerified
                                    ? 'bg-emerald-100 text-emerald-900 decoration-emerald-600'
                                    : 'bg-blue-100 text-primary-container decoration-primary-container'
                                }`}
                                title="Click to verify OCR value against original scan"
                              >
                                {clause.ocr_highlight_token}
                              </button>
                              {ocrPopoverClauseId === clause.clause_id && (
                                <div className="absolute left-0 top-full mt-1.5 z-30 w-64 rounded-xl bg-white shadow-xl border border-outline-variant/60 p-3 text-left font-sans">
                                  <div className="flex items-center justify-between text-[11px] font-bold text-on-surface mb-1">
                                    <span>OCR Confidence: {clause.ocr_confidence || 99.8}%</span>
                                    <button
                                      type="button"
                                      onClick={() => setOcrPopoverClauseId(null)}
                                      className="text-on-surface-variant hover:text-on-surface cursor-pointer"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                  <p className="text-[11px] text-on-surface-variant mb-2">
                                    Extracted exact figure from scanned stamp paper. Verify match?
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setVerifiedOcrTokens((v) => ({ ...v, [clause.clause_id]: true }));
                                      setOcrPopoverClauseId(null);
                                      onToast(`Verified figure ${clause.ocr_highlight_token} matches scan.`);
                                    }}
                                    className="w-full py-1.5 rounded-lg bg-primary-container text-white text-[11px] font-bold cursor-pointer"
                                  >
                                    {isVerified ? '✓ Verified' : 'Mark Value Verified'}
                                  </button>
                                </div>
                              )}
                            </span>
                            {parts.slice(1).join(clause.ocr_highlight_token)}
                          </>
                        );
                      };

                      return (
                        <div
                          key={clause.clause_id}
                          ref={(el) => {
                            clauseRefs.current[clause.clause_id] = el;
                          }}
                          className={`rounded-xl border p-4 space-y-2 transition-all duration-300 ${borderClass} ${
                            isActive ? 'clause-active-pulse' : isAnyActive ? 'opacity-55' : 'opacity-100'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`text-[10px] font-bold uppercase tracking-wider ${
                                clause.severity === 'critical'
                                  ? 'text-error'
                                  : clause.severity === 'caution'
                                    ? 'text-amber-800'
                                    : 'text-emerald-800'
                              }`}
                            >
                              {clause.severity === 'critical' ? '● ' : ''}
                              {clause.badge_label}
                            </span>
                            {clause.right_badge && (
                              <span
                                className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${
                                  clause.severity === 'critical'
                                    ? 'bg-red-100 text-error'
                                    : clause.severity === 'caution'
                                      ? 'bg-amber-100 text-amber-900'
                                      : 'bg-emerald-100 text-emerald-900'
                                }`}
                              >
                                {clause.right_badge}
                              </span>
                            )}
                          </div>

                          <p className="font-serif text-[14px] leading-relaxed text-on-surface">
                            {renderTextWithToken()}
                          </p>

                          {clause.warning_footer && (
                            <div className="pt-1 flex items-center justify-between text-[11px]">
                              <span className="text-error font-semibold flex items-center gap-1">
                                <Icon name="warning" className="text-[14px]" />
                                {clause.warning_footer}
                              </span>
                              {clause.ocr_confidence && (
                                <span className="px-2 py-0.5 rounded bg-blue-50 text-primary-container font-mono text-[10px] font-bold">
                                  OCR Confidence: {clause.ocr_confidence}%
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Missing Annexure Block */}
                  {audit.missing_clauses.length > 0 && (
                    <div className="rounded-xl border border-amber-300 bg-amber-50/70 p-4 flex items-start gap-3">
                      <Icon name="warning" className="text-amber-700 text-[20px] shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-xs font-bold text-on-surface">Missing Section / Annexure Detected</h4>
                        <p className="text-[11px] text-on-surface-variant mt-0.5">
                          {audit.missing_clauses[0].label} — {audit.missing_clauses[0].why_it_matters}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Signature Footer */}
                  <div className="pt-6 border-t border-outline-variant/40 grid grid-cols-2 gap-8 text-[11px] font-mono">
                    <div>
                      <span className="font-bold text-on-surface block">LESSOR / ISSUER SIGNATURE</span>
                      <span className="text-on-surface-variant">[Signed via Aadhaar eSign]</span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-on-surface block">COUNTERPARTY SIGNATURE</span>
                      <span className="text-on-surface-variant">[Awaiting Counter-Signature]</span>
                    </div>
                  </div>
                </div>
              ) : (
                /* Original Scan Photo View */
                <div className="max-w-[680px] mx-auto space-y-5">
                  <div className="rounded-xl bg-white border border-outline-variant/50 shadow-sm overflow-hidden">
                    <div className="px-4 py-2.5 bg-surface-container-lowest border-b border-outline-variant/40 flex items-center justify-between text-xs">
                      <span className="font-bold text-on-surface">
                        Physical Stamp Certificate &amp; Captured Document Photo
                      </span>
                      <span className="font-mono text-[11px] text-emerald-700 font-semibold">
                        EXIF Stripped • {audit.stamp_header.stamp_cert_id}
                      </span>
                    </div>
                    <div className="p-4 bg-stone-100 flex flex-col items-center gap-4">
                      <img
                        src={audit.original_photo_url || ORIGINAL_SCAN_DEMO_URL}
                        alt="Original physical contract scan"
                        referrerPolicy="no-referrer"
                        className="w-full max-h-[520px] object-contain rounded-lg border border-outline-variant/50 shadow-sm bg-white"
                      />
                      <div className="w-full rounded-xl bg-white p-4 border border-outline-variant/40 text-xs font-mono space-y-1">
                        <div className="flex justify-between">
                          <span className="text-on-surface-variant">e-Stamp Certificate No:</span>
                          <span className="font-bold text-on-surface">{audit.stamp_header.stamp_cert_id}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-on-surface-variant">Issued Timestamp:</span>
                          <span className="font-bold text-on-surface">{audit.stamp_header.stamp_issued}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-on-surface-variant">Stamp Duty Paid:</span>
                          <span className="font-bold text-primary-container">{audit.stamp_header.stamp_value}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      {/* Floating Bottom-Right Ask This Contract Trigger + D7 Drawer */}
      <div className="fixed bottom-5 right-6 z-40">
        {!qaOpen ? (
          <button
            type="button"
            onClick={() => setQaOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-3 rounded-full bg-primary-container text-white font-bold text-xs shadow-xl hover:scale-[1.02] transition-transform cursor-pointer"
          >
            <Icon name="mic" className="text-[18px]" />
            <span>Ask this contract</span>
          </button>
        ) : (
          <div className="w-[380px] max-w-[92vw] rounded-2xl bg-white shadow-2xl border border-outline-variant/50 overflow-hidden flex flex-col max-h-[75vh]">
            <div className="p-3.5 bg-primary-container text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon name="graphic_eq" className="text-[18px]" />
                <div>
                  <h4 className="text-xs font-bold">Ask this contract ({langInfo.label})</h4>
                  <p className="text-[10px] text-blue-100">0 Hallucination Guard • Grounded in clauses</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setQaOpen(false)}
                aria-label="Close Ask this contract drawer"
                className="w-7 h-7 rounded-full hover:bg-white/15 flex items-center justify-center cursor-pointer"
              >
                <Icon name="close" className="text-[18px]" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-surface-container-low">
              {qaHistory.map((item, idx) => (
                <div key={idx} className="space-y-2">
                  <div className="p-2.5 rounded-xl bg-white border border-outline-variant/30 text-xs">
                    <span className="text-[10px] font-bold uppercase text-primary-container block mb-0.5">
                      Your Question
                    </span>
                    <p className="font-semibold text-on-surface">&ldquo;{item.question}&rdquo;</p>
                  </div>

                  <div
                    ref={idx === qaHistory.length - 1 ? voiceAnswerRef : undefined}
                    className={`p-3 rounded-xl bg-white border text-xs space-y-2 transition-shadow ${
                      idx === qaHistory.length - 1 &&
                      (voiceStage === 'answering' || voiceStage === 'transcribing')
                        ? 'border-primary-container/60 shadow-md animate-pulse'
                        : 'border-primary-container/25'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase text-emerald-700">
                        ✓ Grounded Answer
                      </span>
                      <button
                        type="button"
                        onClick={() => handlePlaySpeech(item.answerNative || item.answerEn, 'Q&A Answer')}
                        className="text-[10px] font-bold text-primary-container hover:underline cursor-pointer"
                      >
                        🔊 Listen
                      </button>
                    </div>
                    {item.answerNative && (
                      <p className="p-2 rounded-lg bg-blue-50/70 text-on-surface font-medium leading-relaxed">
                        {item.answerNative}
                      </p>
                    )}
                    <p className="text-on-surface-variant leading-relaxed">{item.answerEn}</p>
                    <p className="text-[10px] font-semibold text-amber-800 bg-amber-50 p-2 rounded-lg">
                      {item.statutoryNote}
                    </p>
                    {item.excerpt && (
                      <button
                        type="button"
                        onClick={() => jumpToClause(item.clauseId)}
                        className="text-[11px] font-bold text-primary-container hover:underline cursor-pointer"
                      >
                        Inspect Verified Clause in Sheet →
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {qaLoading && (
                <div className="text-xs text-on-surface-variant animate-pulse p-2">
                  Verifying against contract clauses...
                </div>
              )}
            </div>

            {/* Preset Chips + Hold-to-Ask + Form */}
            <div className="p-3 bg-white border-t border-outline-variant/40 space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {audit.qa_presets.slice(0, 2).map((chip) => (
                  <button
                    key={chip.chip}
                    type="button"
                    onClick={() => handleAskQuestion(chip.question_en)}
                    className="text-[10px] px-2.5 py-1 rounded-full bg-surface-container hover:bg-surface-container-high font-semibold text-on-surface cursor-pointer"
                  >
                    {chip.chip}
                  </button>
                ))}
              </div>

              {/* Hold-to-Ask: press → record → release → STT → QA → spoken answer */}
              <div className="flex items-center gap-2 rounded-xl border border-outline-variant/40 bg-surface-container-low px-2.5 py-2">
                <button
                  type="button"
                  onPointerDown={handleVoicePressStart}
                  onPointerUp={() => {
                    void handleVoicePressEnd();
                  }}
                  onPointerLeave={() => {
                    if (voiceStage === 'recording' || voiceStage === 'requesting') void handleVoicePressEnd();
                  }}
                  onPointerCancel={handleVoicePressCancel}
                  onContextMenu={(e) => e.preventDefault()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (sampleQuestion) void handleAskQuestion(sampleQuestion);
                    }
                  }}
                  disabled={voiceStage === 'transcribing' || voiceStage === 'answering'}
                  aria-label="Hold to Ask voice question"
                  aria-pressed={voiceStage === 'recording'}
                  title="Hold to ask by voice (max 30s)"
                  className={`w-9 h-9 shrink-0 rounded-full text-white flex items-center justify-center cursor-pointer select-none touch-none transition-all disabled:opacity-60 disabled:cursor-wait ${
                    voiceStage === 'recording'
                      ? 'bg-error ring-4 ring-red-300 scale-105'
                      : voiceStage === 'requesting' || voiceStage === 'transcribing' || voiceStage === 'answering'
                        ? 'bg-primary-container ring-4 ring-blue-200 animate-pulse'
                        : 'bg-primary-container hover:opacity-95'
                  }`}
                >
                  <Icon
                    name={voiceStage === 'recording' ? 'graphic_eq' : 'mic'}
                    className="text-[18px]"
                    filled={voiceStage === 'recording'}
                  />
                </button>
                <div className="min-w-0 flex-1">
                  <span className="text-[11px] font-bold text-on-surface block truncate">
                    {voiceStage === 'requesting'
                      ? 'Opening microphone…'
                      : voiceStage === 'recording'
                        ? 'Recording… release to ask'
                        : voiceStage === 'transcribing'
                          ? 'Transcribing your question…'
                          : voiceStage === 'answering'
                            ? 'Verifying against clauses…'
                            : 'Hold to Ask (or tap a sample)'}
                  </span>
                  <span className="text-[10px] text-on-surface-variant block truncate">
                    {voiceStage === 'recording'
                      ? 'Speak now — auto-stops at 30s'
                      : voiceTranscript
                        ? `Heard: “${voiceTranscript}”`
                        : `${langInfo.label} voice • 30s max`}
                  </span>
                </div>
                {voiceStage === 'recording' && (
                  <span className="w-2 h-2 rounded-full bg-error animate-pulse shrink-0" />
                )}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleAskQuestion(qaQuestion);
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={qaQuestion}
                  onChange={(e) => setQaQuestion(e.target.value)}
                  placeholder="Ask in English, Kannada, Hindi, or Kanglish..."
                  className="flex-1 rounded-xl border border-outline-variant/60 px-3 py-1.5 text-xs focus:outline-none focus:border-primary-container"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-xl bg-primary-container text-white text-xs font-bold cursor-pointer"
                >
                  Ask
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
