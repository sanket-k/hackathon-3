import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { AuditResult, LanguageCode, VaultDocument } from './types/contract';
import type { BlackoutStrategy, BriefExportRequest, IntakeStats } from './types/ui';
import { INITIAL_VAULT_DOCS, PRESET_BLR_RENTAL } from './data/presets';
import {
  PHOTO_CHECK_DEMO_URL,
  blackoutHeaderRegion,
  buildLaneAStats,
  buildLaneBStats,
  compressImageAndCheckBlur,
  decidePdfLane,
  prepareImagesForUpload,
  shouldBlockBlurry,
} from './utils/ingest';
import type { ImagePrepResult, LaneADecision } from './utils/ingest';
import { checkSafeToSend, maskIndianPII, rehydrateParsedObject } from './utils/piiGuard';
import type { PiiMaskResult } from './utils/piiGuard';
import { loadVault, persistVault } from './utils/vaultStore';
import { DesktopLanding } from './components/DesktopLanding';
import { DesktopWorkspace } from './components/DesktopWorkspace';
import { DesktopSubViews } from './components/DesktopSubViews';
import { MobileFlow, type MobileScreen } from './components/MobileFlow';
import { BriefModal, MobileQrModal, SecurityAuditModal, WhatsAppModal } from './components/Modals';

type DesktopView = 'landing' | 'workspace' | 'vault' | 'benchmarks' | 'privacy';

interface PhotoPipelineInput {
  strategy: BlackoutStrategy;
  /** Prepared (and possibly blacked-out later) page images, primary page first. */
  dataUrls: string[];
  /** On-device prep result of the primary page, when this scan came from files. */
  blurPrep?: ImagePrepResult;
  /** Measured compress + blur-check duration for this intake. */
  blurMs?: number;
}

function loadInitialVault(): VaultDocument[] {
  const loaded = loadVault();
  return loaded.length > 0 ? loaded : INITIAL_VAULT_DOCS;
}

function emptyMask(rawText: string): PiiMaskResult {
  return { maskedText: rawText, tokens: [], countsByType: {}, totalMasked: 0 };
}

function baseLaneBStats(
  prep: ImagePrepResult | undefined,
  piiCountsByType: Record<string, number>,
  piiTotalMasked: number,
): IntakeStats {
  if (prep) return buildLaneBStats(prep, piiCountsByType);
  return {
    lane: 'B',
    piiCountsByType: { ...piiCountsByType },
    piiTotalMasked,
  };
}

function hydrateAuditFromApiPayload(
  payload: {
    audit?: AuditResult;
    summary?: Partial<AuditResult['summary']>;
    findings?: AuditResult['findings'];
    missing_clauses?: AuditResult['missing_clauses'];
    rule_pack_applied?: AuditResult['rule_pack_applied'];
    completeness?: AuditResult['completeness'];
  },
  fallbackBase: AuditResult,
  docTitle: string,
  lane: 'A' | 'B',
  piiCounts: Record<string, number>,
  photoUrl?: string,
): AuditResult {
  if (payload.audit) {
    return {
      ...fallbackBase,
      ...payload.audit,
      completeness: payload.audit.completeness || payload.completeness || fallbackBase.completeness,
      lane,
      original_photo_url: photoUrl || fallbackBase.original_photo_url,
    };
  }
  const findings = payload.findings && payload.findings.length > 0 ? payload.findings : fallbackBase.findings;
  const riskScore =
    typeof payload.summary?.risk_score === 'number'
      ? payload.summary.risk_score
      : fallbackBase.summary.risk_score;
  const riskBand: AuditResult['summary']['risk_band'] =
    riskScore >= 75 ? 'critical' : riskScore >= 45 ? 'caution' : 'safe';

  const piiTokens = Object.entries(piiCounts).map(([type, count]) => ({
    label: `${type} (${count} detected)`,
    masked_preview: `[${type}_REDACTED]`,
    status: 'MASKED' as const,
  }));

  const rulePack: AuditResult['rule_pack_applied'] = payload.rule_pack_applied
    ? {
        ...fallbackBase.rule_pack_applied,
        ...payload.rule_pack_applied,
        panIndiaOnly:
          payload.rule_pack_applied.panIndiaOnly ??
          fallbackBase.rule_pack_applied.panIndiaOnly ??
          false,
      }
    : fallbackBase.rule_pack_applied;

  return {
    ...fallbackBase,
    id: `scan-${Date.now()}`,
    title: docTitle,
    lane,
    original_photo_url: photoUrl || fallbackBase.original_photo_url,
    completeness: payload.completeness || fallbackBase.completeness,
    pii_masked_tokens: piiTokens.length > 0 ? piiTokens : fallbackBase.pii_masked_tokens,
    rule_pack_applied: rulePack,
    summary: {
      ...fallbackBase.summary,
      ...(payload.summary || {}),
      risk_score: riskScore,
      risk_band: riskBand,
      risk_band_label: `${riskScore} · ${riskBand === 'critical' ? 'Critical' : riskBand === 'caution' ? 'Caution' : 'Safe'}`,
    },
    findings,
    missing_clauses: payload.missing_clauses || fallbackBase.missing_clauses,
  };
}

export default function App() {
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 900 : false,
  );
  const [manualMobilePreview, setManualMobilePreview] = useState<boolean>(false);

  const [language, setLanguage] = useState<LanguageCode>('kn');
  const [piiAutoMask, setPiiAutoMask] = useState<boolean>(true);
  const [desktopView, setDesktopView] = useState<DesktopView>('landing');
  const [mobileScreen, setMobileScreen] = useState<MobileScreen>('m1_analyze');

  const [vaultDocs, setVaultDocs] = useState<VaultDocument[]>(loadInitialVault);
  const [activeAudit, setActiveAudit] = useState<AuditResult>(PRESET_BLR_RENTAL);
  const [capturedPhotoUrl, setCapturedPhotoUrl] = useState<string | null>(null);
  const [telemetryStage, setTelemetryStage] = useState<number>(1);
  const [desktopScanning, setDesktopScanning] = useState<boolean>(false);
  const [intakeStats, setIntakeStats] = useState<IntakeStats | null>(null);
  const [briefRequest, setBriefRequest] = useState<BriefExportRequest | undefined>(undefined);

  // Modals
  const [whatsAppModalOpen, setWhatsAppModalOpen] = useState(false);
  const [whatsAppDraft, setWhatsAppDraft] = useState('');
  const [briefModalOpen, setBriefModalOpen] = useState(false);
  const [securityModalOpen, setSecurityModalOpen] = useState(false);
  const [mobileQrOpen, setMobileQrOpen] = useState(false);

  // Toast
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const telemetryTimerRef = useRef<number | null>(null);
  const vaultBudgetNotifiedRef = useRef(false);
  const intakeRef = useRef<{
    primaryUrl: string;
    dataUrls: string[];
    prep: ImagePrepResult;
    blurMs: number;
  } | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToastMsg(null), 3200);
  };

  useEffect(() => {
    const onResize = () => {
      setIsMobileViewport(window.innerWidth < 900);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const report = persistVault(vaultDocs);
    if (report.dropped.length > 0 && !vaultBudgetNotifiedRef.current) {
      vaultBudgetNotifiedRef.current = true;
      showToast(`${report.dropped.length} documents exceeded the local vault size budget`);
    }
  }, [vaultDocs]);

  const useMobileUI = isMobileViewport || manualMobilePreview;

  const activeVaultDoc = useMemo(
    () => vaultDocs.find((d) => d.audit.id === activeAudit.id) || vaultDocs[0],
    [vaultDocs, activeAudit.id],
  );

  const upsertVaultDocument = (audit: AuditResult, customTag?: string) => {
    const newDoc: VaultDocument = {
      id: `vault-${audit.id}`,
      customTag: customTag || audit.title.split(' • ')[0],
      scannedAt: 'Just now',
      statusLabel: 'Active Review',
      audit,
      notes: [],
    };
    setVaultDocs((prev) => {
      const exists = prev.some((d) => d.audit.id === audit.id);
      if (exists) return prev;
      return [newDoc, ...prev];
    });
  };

  const handleSelectPreset = (preset: AuditResult) => {
    setActiveAudit(preset);
    if (useMobileUI) {
      setMobileScreen('m4_report');
    } else {
      setDesktopView('workspace');
    }
    showToast(`Loaded ${preset.title.split(' • ')[0]}`);
  };

  const handleOpenVaultItem = (doc: VaultDocument) => {
    setActiveAudit(doc.audit);
    if (useMobileUI) {
      setMobileScreen('m4_report');
    } else {
      setDesktopView('workspace');
    }
  };

  const handleUpdateVaultTag = (id: string, tag: string) => {
    setVaultDocs((prev) => prev.map((d) => (d.id === id ? { ...d, customTag: tag } : d)));
    showToast('Updated local vault label.');
  };

  const handleDeleteVaultItem = (id: string) => {
    setVaultDocs((prev) => prev.filter((d) => d.id !== id));
    showToast('Removed document from local vault.');
  };

  const handleClearVault = () => {
    setVaultDocs([]);
    showToast('Cleared all local vault records.');
  };

  const handleSaveNote = (text: string, tag = 'Private Note') => {
    const targetId = activeVaultDoc?.id;
    const newNote = {
      id: `note-${Date.now()}`,
      createdAt: 'Just now',
      tag,
      text,
      encrypted: true,
    };
    if (!targetId) {
      const created: VaultDocument = {
        id: `vault-${activeAudit.id}`,
        customTag: activeAudit.title.split(' • ')[0],
        scannedAt: 'Just now',
        statusLabel: 'Active Review',
        audit: activeAudit,
        notes: [newNote],
      };
      setVaultDocs((prev) => [created, ...prev]);
    } else {
      setVaultDocs((prev) =>
        prev.map((d) => (d.id === targetId ? { ...d, notes: [newNote, ...d.notes] } : d)),
      );
    }
    showToast('Note saved locally on-device.');
  };

  const handleExportVaultJson = () => {
    const blob = new Blob([JSON.stringify(vaultDocs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lawlens-local-vault-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Exported Local Vault JSON.');
  };

  const handleExportBrief = (request?: { selectedClauseIds: string[]; tone: 'polite' | 'firm' }) => {
    setBriefRequest(
      request
        ? {
            auditId: activeAudit.id,
            selectedClauseIds: request.selectedClauseIds,
            tone: request.tone,
          }
        : undefined,
    );
    setBriefModalOpen(true);
  };

  const startTelemetryTicker = (onComplete: () => void) => {
    if (telemetryTimerRef.current) window.clearInterval(telemetryTimerRef.current);
    setTelemetryStage(1);
    let stage = 1;
    telemetryTimerRef.current = window.setInterval(() => {
      stage += 1;
      if (stage <= 4) {
        setTelemetryStage(stage);
      } else {
        if (telemetryTimerRef.current) window.clearInterval(telemetryTimerRef.current);
        onComplete();
      }
    }, 520);
  };

  const cancelTelemetry = () => {
    abortRef.current?.abort();
    if (telemetryTimerRef.current) window.clearInterval(telemetryTimerRef.current);
    setDesktopScanning(false);
    setMobileScreen('m1_analyze');
    showToast('Analysis cancelled.');
  };

  const runPhotoAnalysisPipeline = async ({ strategy, dataUrls, blurPrep, blurMs }: PhotoPipelineInput) => {
    setIntakeStats(
      blurPrep
        ? {
            ...buildLaneBStats(blurPrep, {}),
            gateTimingsMs: typeof blurMs === 'number' ? { 1: blurMs } : undefined,
          }
        : null,
    );
    const controller = new AbortController();
    abortRef.current = controller;

    if (useMobileUI) {
      setMobileScreen('m3_telemetry');
    } else {
      setDesktopScanning(true);
    }

    const blackout = strategy === 'header';
    const uploadable = dataUrls.filter((url) => typeof url === 'string' && url.startsWith('data:image/'));
    const photoToUse = dataUrls[0] || capturedPhotoUrl || PHOTO_CHECK_DEMO_URL;

    const finish = (finalAudit: AuditResult) => {
      if (controller.signal.aborted) return;
      setActiveAudit(finalAudit);
      upsertVaultDocument(finalAudit);
      setDesktopScanning(false);
      if (useMobileUI) {
        setMobileScreen('m4_report');
      } else {
        setDesktopView('workspace');
      }
    };

    let ocrAuditResult: AuditResult = {
      ...PRESET_BLR_RENTAL,
      lane: 'B',
      original_photo_url: photoToUse,
    };

    // Call /api/ocr only if photos are uploaded data URLs; otherwise run clean instant demo telemetry
    if (uploadable.length > 0) {
      const gateTimingsMs: Record<number, number> = {};
      if (typeof blurMs === 'number') gateTimingsMs[1] = blurMs;

      let images = uploadable;
      let piiGateMs = 0;
      if (blackout) {
        const blackoutStart = Date.now();
        try {
          images = await Promise.all(uploadable.map((url) => blackoutHeaderRegion(url)));
        } catch {
          images = uploadable;
        }
        piiGateMs += Date.now() - blackoutStart;
      }

      try {
        const res = await fetch('/api/ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            images,
            language_hint: language,
          }),
        });
        if (res.ok) {
          const ocrJson = (await res.json()) as {
            ok?: boolean;
            data?: {
              clauses?: Array<{ clause_id: string; section_label: string; text: string }>;
            };
          };
          if (ocrJson.ok && ocrJson.data?.clauses && ocrJson.data.clauses.length > 0) {
            const combined = ocrJson.data.clauses.map((c) => `${c.section_label}: ${c.text}`).join('\n\n');
            const maskStart = Date.now();
            const masked =
              piiAutoMask || blackout ? maskIndianPII(combined) : emptyMask(combined);
            piiGateMs += Date.now() - maskStart;

            const piiVerdict = checkSafeToSend(masked.maskedText, masked.tokens);
            if (!piiVerdict.safeToSend) {
              setIntakeStats({
                ...baseLaneBStats(blurPrep, masked.countsByType, masked.totalMasked),
                blocked: true,
                blockReason: piiVerdict.reason || 'Possible PII leak detected in outbound payload.',
                gateTimingsMs: { ...gateTimingsMs, 2: piiGateMs },
              });
              if (controller.signal.aborted) return;
              setDesktopScanning(false);
              showToast('Upload blocked: possible PII leak — re-scan required');
              if (useMobileUI) setMobileScreen('m2_photo');
              return;
            }

            const auditStart = Date.now();
            const auditRes = await fetch('/api/audit', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              signal: controller.signal,
              body: JSON.stringify({
                contract_text: masked.maskedText,
                language,
                title: 'Scanned Contract Photo',
              }),
            });
            const auditGateMs = Date.now() - auditStart;
            if (auditRes.ok) {
              const groundStart = Date.now();
              const rawAudit = await auditRes.json();
              const rehydrated = rehydrateParsedObject(rawAudit, masked.tokens);
              const hydrated = hydrateAuditFromApiPayload(
                rehydrated,
                PRESET_BLR_RENTAL,
                'Scanned Contract Photo',
                'B',
                masked.countsByType,
                images[0] || photoToUse,
              );
              const groundGateMs = Date.now() - groundStart;
              ocrAuditResult = hydrated;
              setIntakeStats({
                ...baseLaneBStats(blurPrep, masked.countsByType, masked.totalMasked),
                packDisplayName: hydrated.rule_pack_applied.display_name,
                packMatchPct: hydrated.rule_pack_applied.match_pct,
                gateTimingsMs: { ...gateTimingsMs, 2: piiGateMs, 3: auditGateMs, 4: groundGateMs },
              });
            }
          }
        }
      } catch {
        // Abort or graceful fallback to deterministic preset audit
      }
    }

    startTelemetryTicker(() => finish(ocrAuditResult));
  };

  const handleImageIntake = async (imageFiles: File[]) => {
    const prepStart = Date.now();
    let preps: ImagePrepResult[];
    try {
      preps =
        imageFiles.length === 1
          ? [await compressImageAndCheckBlur(imageFiles[0])]
          : await prepareImagesForUpload(imageFiles);
    } catch {
      showToast('Could not process image file. Loaded demo scan instead.');
      setCapturedPhotoUrl(PHOTO_CHECK_DEMO_URL);
      if (useMobileUI) setMobileScreen('m2_photo');
      return;
    }
    const blurMs = Date.now() - prepStart;

    if (preps.length === 0) {
      showToast('Could not process image file. Loaded demo scan instead.');
      setCapturedPhotoUrl(PHOTO_CHECK_DEMO_URL);
      if (useMobileUI) setMobileScreen('m2_photo');
      return;
    }

    const primary = preps[0];
    setCapturedPhotoUrl(primary.dataUrl);

    if (shouldBlockBlurry(primary)) {
      intakeRef.current = null;
      setIntakeStats({
        ...buildLaneBStats(primary, {}),
        blocked: true,
        blockReason: `${primary.verdict} (sharpness ${primary.blurScore}) — retake before uploading.`,
        gateTimingsMs: { 1: blurMs },
      });
      showToast(`Upload blocked: ${primary.verdict.toLowerCase()} — retake required.`);
      if (useMobileUI) setMobileScreen('m2_photo');
      return;
    }

    const dataUrls = preps.map((p) => p.dataUrl);
    showToast(
      `${primary.verdict} (EXIF stripped, ${Math.round(primary.compressedBytes / 1024)} KB${
        preps.length > 1 ? ` · ${preps.length} pages` : ''
      })`,
    );
    intakeRef.current = { primaryUrl: primary.dataUrl, dataUrls, prep: primary, blurMs };
    setIntakeStats({ ...buildLaneBStats(primary, {}), gateTimingsMs: { 1: blurMs } });

    if (useMobileUI) {
      setMobileScreen('m2_photo');
    } else {
      await runPhotoAnalysisPipeline({
        strategy: 'none',
        dataUrls,
        blurPrep: primary,
        blurMs,
      });
    }
  };

  const handleFilesSelected = async (files: FileList) => {
    const all = Array.from(files);
    const file = all[0];
    if (!file) return;

    setIntakeStats(null);

    if (file.type.startsWith('image/')) {
      const imageFiles = all.filter((f) => f.type.startsWith('image/'));
      await handleImageIntake(imageFiles.length > 0 ? imageFiles : [file]);
      return;
    }

    // Lane A: PDF or text extraction on-device
    try {
      setDesktopScanning(true);
      if (useMobileUI) setMobileScreen('m3_telemetry');

      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      const extractStart = Date.now();
      let decision: LaneADecision;
      if (isPdf) {
        decision = await decidePdfLane(file);
      } else {
        const text = await file.text();
        const wordCount = text.split(/\s+/).filter(Boolean).length;
        const readable = text.trim().length >= 40;
        decision = {
          lane: readable ? 'A' : 'B',
          reason: readable ? `plain text document — ${wordCount} words` : 'no readable text found',
          isScannableVector: readable,
          pageCount: 1,
          wordCount,
          extractedText: readable ? text : '',
        };
      }
      const extractMs = Date.now() - extractStart;

      if (decision.lane === 'B' || decision.extractedText.trim().length === 0) {
        setDesktopScanning(false);
        showToast('Scanned PDF detected — no text layer. Photograph the pages to audit them.');
        if (useMobileUI) {
          setMobileScreen(capturedPhotoUrl ? 'm2_photo' : 'm1_analyze');
        } else if (capturedPhotoUrl) {
          await runPhotoAnalysisPipeline({ strategy: 'none', dataUrls: [capturedPhotoUrl] });
        }
        return;
      }

      const maskStart = Date.now();
      const masked = piiAutoMask ? maskIndianPII(decision.extractedText) : emptyMask(decision.extractedText);
      const maskMs = Date.now() - maskStart;

      const piiVerdict = checkSafeToSend(masked.maskedText, masked.tokens);
      setIntakeStats({
        ...buildLaneAStats(decision, masked.countsByType),
        blocked: piiVerdict.safeToSend ? undefined : true,
        blockReason: piiVerdict.safeToSend ? undefined : piiVerdict.reason,
        gateTimingsMs: { 1: extractMs, 2: maskMs },
      });
      if (!piiVerdict.safeToSend) {
        setDesktopScanning(false);
        showToast('Upload blocked: possible PII leak — re-scan required');
        if (useMobileUI) setMobileScreen('m1_analyze');
        return;
      }

      const docTitle = file.name.replace(/\.[^.]+$/, '');
      const auditStart = Date.now();
      const res = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contract_text: masked.maskedText,
          language,
          title: docTitle,
        }),
      });
      const json = await res.json();
      const auditGateMs = Date.now() - auditStart;

      const groundStart = Date.now();
      const rehydrated = rehydrateParsedObject(json, masked.tokens);
      const nextAudit = hydrateAuditFromApiPayload(
        rehydrated,
        PRESET_BLR_RENTAL,
        docTitle,
        'A',
        masked.countsByType,
      );
      const groundGateMs = Date.now() - groundStart;

      setIntakeStats({
        ...buildLaneAStats(decision, masked.countsByType),
        packDisplayName: nextAudit.rule_pack_applied.display_name,
        packMatchPct: nextAudit.rule_pack_applied.match_pct,
        gateTimingsMs: { 1: extractMs, 2: maskMs, 3: auditGateMs, 4: groundGateMs },
      });

      startTelemetryTicker(() => {
        setActiveAudit(nextAudit);
        upsertVaultDocument(nextAudit);
        setDesktopScanning(false);
        if (useMobileUI) {
          setMobileScreen('m4_report');
        } else {
          setDesktopView('workspace');
        }
        showToast(`Audit complete (${masked.totalMasked} PII tokens masked on-device).`);
      });
    } catch (err) {
      setDesktopScanning(false);
      showToast(err instanceof Error ? err.message : 'PDF check failed; opening workspace.');
      setDesktopView('workspace');
    }
  };

  return (
    <>
      {useMobileUI ? (
        <MobileFlow
          screen={mobileScreen}
          onNavigate={setMobileScreen}
          audit={activeAudit}
          language={language}
          onChangeLanguage={setLanguage}
          vaultDocs={vaultDocs}
          activeVaultDoc={activeVaultDoc}
          capturedPhotoUrl={capturedPhotoUrl}
          telemetryStage={telemetryStage}
          intakeStats={intakeStats}
          onCancelTelemetry={cancelTelemetry}
          onStartPhotoFlow={(photoUrl) => {
            setCapturedPhotoUrl(photoUrl || PHOTO_CHECK_DEMO_URL);
            setMobileScreen('m2_photo');
          }}
          onRunPhotoAnalysis={(blackoutStrategy) => {
            const saved =
              intakeRef.current && capturedPhotoUrl === intakeRef.current.primaryUrl
                ? intakeRef.current
                : null;
            void runPhotoAnalysisPipeline({
              strategy: blackoutStrategy,
              dataUrls: saved
                ? saved.dataUrls
                : capturedPhotoUrl
                  ? [capturedPhotoUrl]
                  : [],
              blurPrep: saved?.prep,
              blurMs: saved?.blurMs,
            });
          }}
          onFilesSelected={handleFilesSelected}
          onSelectPreset={handleSelectPreset}
          onOpenVaultItem={handleOpenVaultItem}
          onUpdateVaultTag={handleUpdateVaultTag}
          onDeleteVaultItem={handleDeleteVaultItem}
          onClearVault={handleClearVault}
          onSaveNote={handleSaveNote}
          onExportVaultJson={handleExportVaultJson}
          onExportBrief={handleExportBrief}
          onOpenSecurityModal={() => setSecurityModalOpen(true)}
          isDesktopPreview={!isMobileViewport && manualMobilePreview}
          onSwitchToDesktop={() => setManualMobilePreview(false)}
          onToast={showToast}
        />
      ) : desktopView === 'workspace' ? (
        <DesktopWorkspace
          audit={activeAudit}
          vaultDoc={activeVaultDoc}
          language={language}
          onChangeLanguage={setLanguage}
          onBackHome={() => setDesktopView('landing')}
          onOpenBriefModal={handleExportBrief}
          onOpenWhatsAppModal={(draft) => {
            setWhatsAppDraft(draft);
            setWhatsAppModalOpen(true);
          }}
          onOpenSecurityModal={() => setSecurityModalOpen(true)}
          onOpenMobileQr={() => setMobileQrOpen(true)}
          onSaveNote={handleSaveNote}
          onToast={showToast}
        />
      ) : desktopView === 'landing' ? (
        <DesktopLanding
          language={language}
          onChangeLanguage={setLanguage}
          piiAutoMask={piiAutoMask}
          onTogglePiiAutoMask={setPiiAutoMask}
          vaultDocs={vaultDocs}
          onSelectPreset={handleSelectPreset}
          onOpenVaultItem={handleOpenVaultItem}
          onClearVault={handleClearVault}
          onFilesSelected={handleFilesSelected}
          onOpenNav={(nav) => setDesktopView(nav)}
          onOpenMobileQr={() => setMobileQrOpen(true)}
          onSwitchMobilePreview={() => {
            setManualMobilePreview(true);
            setMobileScreen('m1_analyze');
          }}
          activeNav="landing"
        />
      ) : (
        <DesktopSubViews
          view={desktopView}
          vaultDocs={vaultDocs}
          onNavigate={(v) => setDesktopView(v)}
          onOpenVaultItem={handleOpenVaultItem}
          onDeleteVaultItem={handleDeleteVaultItem}
          onUpdateVaultTag={handleUpdateVaultTag}
          onClearVault={handleClearVault}
          onExportVaultJson={handleExportVaultJson}
          onToast={showToast}
        />
      )}

      {/* Desktop Telemetry Overlay while scanning uploaded PDF/Photo */}
      {!useMobileUI && desktopScanning && (
        <div
          className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Analyzing Contract Locally"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-outline-variant/40 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-on-surface">Neural X-Ray Inspection</span>
              <span className="text-xs font-bold text-primary-container">Stage {telemetryStage} / 4</span>
            </div>
            <div className="w-full h-2 rounded-full bg-surface-container overflow-hidden">
              <div
                className="h-full bg-primary-container transition-all duration-300"
                style={{ width: `${telemetryStage * 25}%` }}
              />
            </div>
            <p className="text-xs text-on-surface-variant">
              Running local PII masking, rule-pack benchmark matching, and verbatim quote verification...
            </p>
            <button
              type="button"
              onClick={cancelTelemetry}
              className="w-full py-2 rounded-xl bg-surface-container text-xs font-bold text-on-surface cursor-pointer"
            >
              Cancel Analysis
            </button>
          </div>
        </div>
      )}

      {/* Global Modals */}
      <WhatsAppModal
        open={whatsAppModalOpen}
        onClose={() => setWhatsAppModalOpen(false)}
        audit={activeAudit}
        initialDraft={whatsAppDraft}
        onToast={showToast}
      />
      <BriefModal
        open={briefModalOpen}
        onClose={() => setBriefModalOpen(false)}
        audit={activeAudit}
        request={briefRequest}
        onToast={showToast}
      />
      <SecurityAuditModal
        open={securityModalOpen}
        onClose={() => setSecurityModalOpen(false)}
        audit={activeAudit}
      />
      <MobileQrModal
        open={mobileQrOpen}
        onClose={() => setMobileQrOpen(false)}
        language={language}
      />

      {/* Non-intrusive Toast */}
      {toastMsg && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-20 right-6 z-[60] px-4 py-2.5 rounded-full bg-on-surface text-white text-xs font-bold shadow-xl flex items-center gap-2"
        >
          <span>{toastMsg}</span>
        </div>
      )}
    </>
  );
}
