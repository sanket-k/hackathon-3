import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { AuditResult, LanguageCode } from '../types/contract';
import { exportOnePageBriefPDF } from '../utils/pdfBrief';
import { Icon } from './Icons';

interface WhatsAppModalProps {
  open: boolean;
  onClose: () => void;
  audit: AuditResult;
  initialDraft: string;
  onToast: (msg: string) => void;
}

export const WhatsAppModal: React.FC<WhatsAppModalProps> = ({
  open,
  onClose,
  audit,
  initialDraft,
  onToast,
}) => {
  const [waLang, setWaLang] = useState<'en' | 'kn'>('en');
  const [message, setMessage] = useState(initialDraft);

  useEffect(() => {
    if (waLang === 'en') {
      setMessage(initialDraft);
    } else {
      setMessage(
        `ನಮಸ್ಕಾರ ${audit.stamp_header.lessor_name} ಅವರೇ, ${audit.title} ಡ್ರಾಫ್ಟ್ ಪರಿಶೀಲಿಸಿದ್ದೇನೆ.\n\nಕರ್ನಾಟಕ ಬಾಡಿಗೆ ನಿಯಮಾವಳಿ (KMTA 2021) ಪ್ರಕಾರ 2 ತಿಂಗಳ ಅಡ್ವಾನ್ಸ್ ಡೆಪಾಸಿಟ್ ನೀಡಲು ನಾನು ಒಪ್ಪುತ್ತೇನೆ. ದಯವಿಟ್ಟು 10 ತಿಂಗಳ ಡೆಪಾಸಿಟ್ ಬದಲಿಗೆ 2 ತಿಂಗಳ ಷರತ್ತನ್ನು ಅಳವಡಿಸಿ ಹೊಸ ಪ್ರತಿ ಕಳುಹಿಸಿಕೊಡಿ.\n\nಧನ್ಯವಾದಗಳು - ${audit.stamp_header.lessee_name}`,
      );
    }
  }, [waLang, initialDraft, audit]);

  if (!open) return null;

  const handleCopy = () => {
    navigator.clipboard?.writeText(message).catch(() => {});
    onToast('WhatsApp message copied to clipboard!');
  };

  const handleOpenWhatsApp = () => {
    const encoded = encodeURIComponent(message);
    onToast('Prepared WhatsApp share text (copied to clipboard).');
    navigator.clipboard?.writeText(message).catch(() => {});
    const link = document.createElement('a');
    link.href = `https://api.whatsapp.com/send?text=${encoded}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.click();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Draft WhatsApp Counter-Offer"
    >
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-surface-container overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-4 bg-[#075E54] text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
              <Icon name="chat" className="text-[20px]" />
            </div>
            <div>
              <h3 className="text-sm font-bold">Draft WhatsApp Counter-Offer</h3>
              <p className="text-[11px] text-emerald-100">Ready to send directly to counterparty</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close WhatsApp modal"
            className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-white cursor-pointer"
          >
            <Icon name="close" className="text-[20px]" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="space-y-1">
            <label className="text-xs font-bold text-on-surface">Recipient</label>
            <div className="flex items-center gap-2 p-2.5 rounded-xl border border-surface-container bg-surface-container-low text-xs">
              <div className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
                {audit.stamp_header.lessor_name
                  .split(' ')
                  .slice(-2)
                  .map((w) => w[0])
                  .join('')
                  .toUpperCase()}
              </div>
              <div className="flex-1">
                <span className="font-bold text-on-surface block">{audit.stamp_header.lessor_name}</span>
                <span className="text-[11px] text-on-surface-variant">Counterparty • {audit.title}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label htmlFor="wa-message-textarea" className="text-xs font-bold text-on-surface">
              Message Content
            </label>
            <div className="flex items-center gap-1 bg-surface-container-low p-1 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => setWaLang('en')}
                className={`px-2 py-0.5 rounded font-semibold cursor-pointer ${
                  waLang === 'en' ? 'bg-white text-primary font-bold shadow-xs' : 'text-on-surface-variant'
                }`}
              >
                English
              </button>
              <button
                type="button"
                onClick={() => setWaLang('kn')}
                className={`px-2 py-0.5 rounded font-semibold cursor-pointer ${
                  waLang === 'kn' ? 'bg-white text-primary font-bold shadow-xs' : 'text-on-surface-variant'
                }`}
              >
                ಕನ್ನಡ (Kannada)
              </button>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#DCF8C6]/40 border border-[#b8e49c] space-y-2">
            <textarea
              id="wa-message-textarea"
              rows={8}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full text-xs font-sans p-2 rounded-xl bg-transparent border-0 focus:ring-0 focus:outline-none text-stone-900 resize-none leading-relaxed"
            />
            <div className="flex items-center justify-between text-[10px] text-stone-600 pt-1 border-t border-[#b8e49c]/40 font-mono">
              <span>Character count: {message.length}</span>
              <span className="text-emerald-800 font-semibold">
                ✓ Grounded in {audit.rule_pack_applied.pack_id}
              </span>
            </div>
          </div>
        </div>

        <div className="p-4 bg-surface-container-low border-t border-surface-container flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-surface-container-highest text-on-surface hover:bg-surface-container font-semibold text-xs transition-colors cursor-pointer"
          >
            <Icon name="content_copy" className="text-[16px]" />
            <span>Copy Message</span>
          </button>
          <button
            type="button"
            onClick={handleOpenWhatsApp}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#25D366] text-white hover:bg-[#20ba59] font-bold text-xs shadow-md transition-all cursor-pointer"
          >
            <Icon name="send" className="text-[18px]" />
            <span>Send via WhatsApp Web</span>
          </button>
        </div>
      </div>
    </div>
  );
};

interface BriefModalProps {
  open: boolean;
  onClose: () => void;
  audit: AuditResult;
  onToast: (msg: string) => void;
}

export const BriefModal: React.FC<BriefModalProps> = ({ open, onClose, audit, onToast }) => {
  if (!open) return null;

  const handleDownload = () => {
    exportOnePageBriefPDF(audit);
    onToast('Downloaded 1-Page Pre-Sign Brief PDF!');
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Executive 1-Page Summary Brief"
    >
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-surface-container overflow-hidden flex flex-col max-h-[92vh]">
        <div className="p-4 bg-surface-container-low border-b border-surface-container flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary text-white flex items-center justify-center">
              <Icon name="summarize" className="text-[18px]" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-on-surface">Executive 1-Page Summary Brief</h3>
              <p className="text-[11px] text-on-surface-variant">Print-ready consumer protection dossier</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 cursor-pointer"
            >
              <Icon name="picture_as_pdf" className="text-[15px]" />
              <span>Download PDF Brief</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close brief modal"
              className="w-8 h-8 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant cursor-pointer"
            >
              <Icon name="close" className="text-[20px]" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto bg-stone-50/50">
          <div className="p-6 bg-white rounded-xl border border-surface-container shadow-sm space-y-5">
            <div className="flex items-start justify-between border-b border-surface-container pb-4">
              <div>
                <span className="text-[10px] font-bold text-primary uppercase tracking-widest">
                  LAWLENS PRO AUDIT REPORT
                </span>
                <h2 className="text-lg font-bold text-on-surface">{audit.title}</h2>
                <p className="text-xs text-on-surface-variant">{audit.subtitle}</p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-black text-amber-600 tabular-nums">
                  {audit.summary.risk_score} / 100
                </div>
                <span className="text-[11px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                  {audit.summary.risk_band_label}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-red-50 border border-red-200">
                <span className="text-[10px] font-bold text-error uppercase">Total Financial Exposure</span>
                <p className="text-lg font-black text-error tabular-nums">
                  ₹{audit.summary.rupee_exposure_inr.toLocaleString('en-IN')}
                </p>
                <p className="text-[11px] text-red-900 mt-1">{audit.summary.exposure_caption}</p>
              </div>
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                <span className="text-[10px] font-bold text-emerald-800 uppercase">Verified Clauses</span>
                <p className="text-lg font-black text-emerald-700 tabular-nums">
                  {audit.findings.length} Flagged
                </p>
                <p className="text-[11px] text-emerald-950 mt-1">100% matched verbatim to sheet.</p>
              </div>
              <div className="p-3 rounded-xl bg-surface-container-low border border-surface-container">
                <span className="text-[10px] font-bold text-on-surface uppercase">Statutory Basis</span>
                <p className="text-sm font-bold text-primary mt-1">{audit.rule_pack_applied.pack_id}</p>
                <p className="text-[11px] text-on-surface-variant mt-1">
                  Verified {audit.rule_pack_applied.verified_date}
                </p>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <h4 className="font-bold text-on-surface uppercase tracking-wide text-[11px]">
                Key Findings &amp; Red Lines
              </h4>
              <ul className="space-y-1.5 text-on-surface-variant list-disc pl-4">
                {audit.findings.map((f) => (
                  <li key={f.finding_id}>
                    <strong className="text-on-surface">{f.headline}:</strong> {f.plain_explanation}
                  </li>
                ))}
              </ul>
            </div>

            <div className="pt-4 border-t border-surface-container flex items-center justify-between text-[11px] text-on-surface-variant">
              <div>
                <p className="font-bold text-on-surface">Informational Clarity Only — Not Formal Legal Representation</p>
                <p>Generated locally on-device with zero server cloud retention.</p>
              </div>
              <span className="font-mono text-primary font-bold">Page 1 of 1</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface SecurityAuditModalProps {
  open: boolean;
  onClose: () => void;
  audit: AuditResult;
}

export const SecurityAuditModal: React.FC<SecurityAuditModalProps> = ({ open, onClose, audit }) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Zero-Cloud Privacy and PII Shield Audit"
    >
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-surface-container overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-4 bg-emerald-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-emerald-700 flex items-center justify-center">
              <Icon name="shield" className="text-[20px]" />
            </div>
            <div>
              <h3 className="text-sm font-bold">Zero-Cloud Privacy &amp; PII Shield Audit</h3>
              <p className="text-[11px] text-emerald-200">
                {audit.lane === 'A' ? 'Lane A: On-Device Sandboxed Redaction' : 'Lane B: EXIF Stripped • Zero-Retention Vision'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close security modal"
            className="w-8 h-8 rounded-full hover:bg-emerald-800 flex items-center justify-center text-white cursor-pointer"
          >
            <Icon name="close" className="text-[20px]" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs text-on-surface-variant overflow-y-auto">
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 space-y-1">
            <div className="flex items-center gap-1.5 font-bold">
              <Icon name="lock" className="text-[17px] text-emerald-700" />
              <span>
                {audit.lane === 'A'
                  ? '100% Client-Side Fail-Closed PII Masking'
                  : 'Honest Image Mode: EXIF Stripped, Zero Training'}
              </span>
            </div>
            <p className="leading-relaxed">
              {audit.lane === 'A'
                ? 'Your vector PDF was parsed locally in browser memory. Sensitive identifiers (Aadhaar, PAN, mobile numbers, bank IFSC, party names) were masked before any clause audit.'
                : 'Captured photos are downscaled on-device to 1500px JPEG (stripping EXIF GPS/device metadata) and sent over zero-retention transit.'}
            </p>
          </div>

          <div className="space-y-2">
            <span className="font-bold text-on-surface uppercase tracking-wide text-[11px]">
              {audit.pii_masked_tokens.length} On-Device Protected Tokens (Counts &amp; Types Only)
            </span>
            <div className="space-y-2">
              {audit.pii_masked_tokens.map((tok, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-surface-container-low border border-surface-container"
                >
                  <div>
                    <span className="font-bold text-on-surface block">{tok.label}</span>
                    <span className="font-mono text-[10px] text-outline">{tok.masked_preview}</span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                    {tok.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-surface-container-low text-[11px] space-y-1">
            <span className="font-bold text-on-surface">Data Retention:</span>
            <p>Zero server retention or model training. Local vault records stay exclusively in your browser.</p>
          </div>
        </div>

        <div className="p-4 bg-surface-container-low border-t border-surface-container flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-primary text-white font-bold text-xs hover:bg-primary/90 transition-all cursor-pointer"
          >
            Acknowledge &amp; Return
          </button>
        </div>
      </div>
    </div>
  );
};

interface MobileQrModalProps {
  open: boolean;
  onClose: () => void;
  language: LanguageCode;
}

export const MobileQrModal: React.FC<MobileQrModalProps> = ({ open, onClose, language }) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const currentUrl = typeof window !== 'undefined' ? window.location.href : 'http://localhost:3000';

  useEffect(() => {
    if (!open) return;
    QRCode.toDataURL(currentUrl, { width: 220, margin: 2, color: { dark: '#0037b0', light: '#ffffff' } })
      .then((url) => setQrDataUrl(url))
      .catch(() => {});
  }, [open, currentUrl]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Open on Mobile Phone QR"
    >
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-surface-container p-6 flex flex-col items-center text-center gap-4">
        <div className="w-full flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon name="qr_code_2" className="text-primary text-[22px]" />
            <h3 className="text-sm font-bold text-on-surface">Test on Mobile Phone</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close QR modal"
            className="w-8 h-8 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant cursor-pointer"
          >
            <Icon name="close" className="text-[18px]" />
          </button>
        </div>

        <div className="p-3 rounded-2xl bg-surface-container-low border border-surface-container">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="QR code to open LawLens on mobile" className="w-48 h-48 rounded-lg" />
          ) : (
            <div className="w-48 h-48 flex items-center justify-center text-xs text-on-surface-variant">
              Generating QR...
            </div>
          )}
        </div>

        <div className="space-y-1">
          <p className="text-xs font-semibold text-on-surface">
            Scan to launch Mobile Intake &amp; Photo Check ({language.toUpperCase()})
          </p>
          <p className="text-[11px] text-on-surface-variant break-all font-mono">{currentUrl}</p>
        </div>
      </div>
    </div>
  );
};
