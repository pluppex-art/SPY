import { useEffect, useState } from "react";
import { ConfirmModal } from "./modals/shared/ConfirmModal";
import { useLocalization } from "../../contexts/LocalizationContext";

interface ConfirmOptions {
  title?: string;
  description?: string;
  message?: string;
  confirmText?: string;
  confirmLabel?: string;
  cancelText?: string;
  /** "success" = ação positiva (verde). Padrão: "danger" (vermelho, exclusão). */
  variant?: "danger" | "success";
}

type ConfirmState = ConfirmOptions & { resolve: (value: boolean) => void };

let listener: ((state: ConfirmState) => void) | null = null;

// Confirmação global de ações destrutivas (excluir, remover, desligar etc), reaproveitando
// o mesmo ConfirmModal já usado em Contracts/AgendaCRM/Tarefas — sem precisar de um estado
// "xToDelete" + JSX próprio em cada tela. Uso: `if (await confirmDialog({ description: "..." })) { ...delete... }`
export function confirmDialog(options: ConfirmOptions = {}): Promise<boolean> {
  const normalized: ConfirmOptions = {
    ...options,
    description: options.description || options.message,
    confirmText: options.confirmText || options.confirmLabel,
  };
  return new Promise((resolve) => {
    if (!listener) {
      resolve(window.confirm(normalized.description || normalized.title || "Confirmar ação?"));
      return;
    }
    listener({ ...normalized, resolve });
  });
}

export function ConfirmDialogHost() {
  const [state, setState] = useState<ConfirmState | null>(null);
  const { t } = useLocalization();

  useEffect(() => {
    listener = (next) => setState(next);
    return () => { listener = null; };
  }, []);

  const close = (result: boolean) => {
    state?.resolve(result);
    setState(null);
  };

  return (
    <ConfirmModal
      isOpen={!!state}
      onClose={() => close(false)}
      onConfirm={() => close(true)}
      title={state?.title || t("Confirmar exclusão")}
      message={state?.description || t("Essa ação não pode ser desfeita.")}
      confirmText={state?.confirmText}
      cancelText={state?.cancelText}
      variant={state?.variant}
    />
  );
}
