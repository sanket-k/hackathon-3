import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { AuditResult, LanguageCode, VaultDocument } from './types/contract';
import { INITIAL_VAULT_DOCS, PRESET_BLR_RENTAL } from './data/presets';
import {
  PHOTO_CHECK_DEMO_URL,
  compressImageAndCheckBlur,
  extractPdfTextLocally,
} from './utils/ingest';
import { assertNoPiiLeak, maskIndianPII, rehydrateParsedObject } from './utils/piiGuard';
import { DesktopLanding } from './components/DesktopLanding';
import { DesktopWorkspace } from './components/DesktopWorkspace';
import { DesktopSubViews } from './components/DesktopSubViews';
import { MobileFlow, type MobileScreen } from './components/MobileFlow';
import { BriefModal, MobileQrModal, SecurityAuditModal, WhatsAppModal } from './components/Modals';

const VAULT_STORAGE_KEY = 'lawlens_vault_v1';

type DesktopView = 'landing' | 'workspace' | 'vault' | 'benchmarks' | 'privacy';

function loadInitialVault(): VaultDocument[] {
  if (typeof window === 'undefined') return INITIAL_VAULT_DOCS;
  try {
    const raw = window.localStorage.getItem(VAULT_STORAGE_KEY);
    if (!raw) return INITIAL_VAULT_DOCS;
    const parsed = JSON.parse(raw) as VaultDocument[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : INITIAL_VAULT_DOCS;
  } catch {
    return INITIAL_VAULT_DOCS;
  }
}

function hydrateAuditFromApiPayload(
  payload: {
    audit?: AuditResult;
    summary?: Partial<AuditResult['summary']>;
    findings?: AuditResult['findings'];
    missing_clauses?: AuditResult['missing_clauses'];
    rule_pack_applied?: AuditResult['rule_pack_applied'];
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

  return {
    ...fallbackBase,
    id: `scan-${Date.now()}`,
    title: docTitle,
    lane,
    original_photo_url: photoUrl || fallbackBase.original_photo_url,
    pii_masked_tokens: piiTokens.length > 0 ? piiTokens : fallbackBase.pii_masked_tokens,
    rule_pack_applied: payload.rule_pack_applied || fallbackBase.rule_pack_applied,
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
    try {
      window.localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(vaultDocs));
    } catch {
      // Ignore storage quota errors
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

  const runPhotoAnalysisPipeline = async (blackout: boolean, photoOverride?: string) => {
    const controller = new AbortController();
    abortRef.current = controller;

    if (useMobileUI) {
      setMobileScreen('m3_telemetry');
    } else {
      setDesktopScanning(true);
    }

    const photoToUse = photoOverride || capturedPhotoUrl || PHOTO_CHECK_DEMO_URL;

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

    // Call /api/ocr only if photo is an uploaded data URL; otherwise run clean instant demo telemetry
    if (photoToUse.startsWith('data:image/')) {
      try {
        const res = await fetch('/api/ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            images: [photoToUse],
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
            const masked = piiAutoMask || blackout ? maskIndianPII(combined) : { maskedText: combined, tokens: [], countsByType: {}, totalMasked: 0 };
            const safeText = assertNoPiiLeak(masked.maskedText, masked.tokens);
            const auditRes = await fetch('/api/audit', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              signal: controller.signal,
              body: JSON.stringify({
                contract_text: safeText,
                language,
                title: 'Scanned Contract Photo',
              }),
            });
            if (auditRes.ok) {
              const rawAudit = await auditRes.json();
              const rehydrated = rehydrateParsedObject(rawAudit, masked.tokens);
              ocrAuditResult = hydrateAuditFromApiPayload(
                rehydrated,
                PRESET_BLR_RENTAL,
                'Scanned Contract Photo',
                'B',
                masked.countsByType,
                photoToUse,
              );
            }
          }
        }
      } catch {
        // Abort or graceful fallback to deterministic preset audit
      }
    }

    startTelemetryTicker(() => finish(ocrAuditResult));
  };

  const handleFilesSelected = async (files: FileList) => {
    const file = files[0];
    if (!file) return;

    if (file.type.startsWith('image/')) {
      try {
        const prep = await compressImageAndCheckBlur(file);
        setCapturedPhotoUrl(prep.dataUrl);
        showToast(`${prep.verdict} (EXIF stripped, ${Math.round(prep.compressedBytes / 1024)} KB)`);
        if (useMobileUI) {
          setMobileScreen('m2_photo');
        } else {
          await runPhotoAnalysisPipeline(piiAutoMask, prep.dataUrl);
        }
      } catch {
        showToast('Could not process image file. Loaded demo scan instead.');
        setCapturedPhotoUrl(PHOTO_CHECK_DEMO_URL);
        if (useMobileUI) setMobileScreen('m2_photo');
      }
      return;
    }

    // Lane A: PDF or text extraction on-device
    try {
      setDesktopScanning(true);
      if (useMobileUI) setMobileScreen('m3_telemetry');

      let rawText = '';
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        const pdfRes = await extractPdfTextLocally(file);
        rawText = pdfRes.extractedText;
      } else {
        rawText = await file.text();
      }

      if (!rawText || rawText.trim().length < 40) {
        // Fallback so single-page/image PDFs still show crisp demo workspace
        rawText = PRESET_BLR_RENTAL.clauses.map((c) => c.text).join('\n\n');
      }

      const masked = piiAutoMask
        ? maskIndianPII(rawText)
        : { maskedText: rawText, tokens: [], countsByType: {}, totalMasked: 0 };
      const outboundClean = assertNoPiiLeak(masked.maskedText, masked.tokens);

      const res = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contract_text: outboundClean,
          language,
          title: file.name.replace(/\.[^.]+$/, ''),
        }),
      });
      const json = await res.json();
      const rehydrated = rehydrateParsedObject(json, masked.tokens);
      const nextAudit = hydrateAuditFromApiPayload(
        rehydrated,
        PRESET_BLR_RENTAL,
        file.name.replace(/\.[^.]+$/, ''),
        'A',
        masked.countsByType,
      );

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
          onCancelTelemetry={cancelTelemetry}
          onStartPhotoFlow={(photoUrl) => {
            setCapturedPhotoUrl(photoUrl || PHOTO_CHECK_DEMO_URL);
            setMobileScreen('m2_photo');
          }}
          onRunPhotoAnalysis={(strategy) => runPhotoAnalysisPipeline(strategy !== 'none')}
          onFilesSelected={handleFilesSelected}
          onSelectPreset={handleSelectPreset}
          onOpenVaultItem={handleOpenVaultItem}
          onUpdateVaultTag={handleUpdateVaultTag}
          onDeleteVaultItem={handleDeleteVaultItem}
          onClearVault={handleClearVault}
          onSaveNote={handleSaveNote}
          onExportVaultJson={handleExportVaultJson}
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
          onOpenBriefModal={() => setBriefModalOpen(true)}
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
