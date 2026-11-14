import { Modal } from "../../modal";
import { Button } from "../../button";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useLocalization } from "../../../../contexts/LocalizationContext";

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  /** "danger" (padrão): exclusão/ação irreversível, vermelho. "success": ação positiva (criar/ativar), verde, sem aviso de irreversível. */
  variant?: "danger" | "success";
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText,
  cancelText,
  variant = "danger",
}: ConfirmModalProps) {
  const success = variant === "success";
  const { t } = useLocalization();
  const resolvedConfirmText = confirmText ? t(confirmText) : success ? t("Confirmar") : t("Excluir permanentemente");
  const resolvedCancelText = cancelText ? t(cancelText) : t("Cancelar");
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t(title)}
      maxWidth="max-w-md"
      footer={null}
      closeOnBackdrop={!success}
    >
      <div className="flex flex-col items-center text-center space-y-4 pt-2 pb-2">
        <div className={success
          ? "w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 mb-1"
          : "w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 shadow-xl shadow-rose-950/20 mb-1"}>
          {success ? <CheckCircle2 className="w-8 h-8" /> : <AlertTriangle className="w-8 h-8" />}
        </div>

        <p className="text-sm text-[var(--color-text-muted)] font-sans leading-relaxed max-w-sm px-4">
          {t(message)}
        </p>

        {!success && (
        <div className="bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl flex items-start gap-2.5 w-full text-left mt-2 shadow-inner">
          <div className="p-1 rounded-lg bg-rose-500/20 text-rose-400 shrink-0">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-rose-400">{t("Atenção")}</p>
            <p className="text-xs text-rose-500/90 font-medium">{t("Esta ação é irreversível.")}</p>
          </div>
        </div>
        )}

        <div className="flex items-center gap-3 w-full mt-6 pt-4 border-t border-[var(--color-border-default)]">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            className="flex-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] text-xs font-bold font-sans cursor-pointer h-10 rounded-xl bg-[var(--color-surface-sunken)] hover:bg-[var(--color-border-subtle)] transition-colors"
          >
            {resolvedCancelText}
          </Button>
          <Button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={success
              ? "flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold font-sans shadow-lg shadow-emerald-950/30 border border-emerald-500/20 h-10 rounded-xl transition-all cursor-pointer group relative overflow-hidden"
              : "flex-1 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold font-sans shadow-lg shadow-rose-950/40 border border-rose-500/20 h-10 rounded-xl transition-all cursor-pointer group relative overflow-hidden"}
          >
            <span className="relative z-10 flex items-center justify-center gap-2">
              {!success && <AlertTriangle className="w-3.5 h-3.5 opacity-0 -ml-5 group-hover:opacity-100 group-hover:ml-0 transition-all duration-300" />}
              {resolvedConfirmText}
            </span>
          </Button>
        </div>
      </div>
    </Modal>
  );
}
