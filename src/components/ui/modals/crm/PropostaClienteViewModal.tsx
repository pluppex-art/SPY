import { Download, Link2, ExternalLink, X } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { Modal } from "../../modal";
import { Button } from "../../button";
import { PropostaDocumento, type PropostaDocumentoItem } from "../../../proposta/PropostaDocumento";
import { usePropostaBranding } from "../../../proposta/usePropostaBranding";
import { downloadPropostaClientePdf, type PropostaClienteDados } from "../../../../pages/crm/utils/proposalClientPdf";

interface PropostaClienteViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: PropostaClienteDados | null;
  itens: PropostaDocumentoItem[];
  viewToken?: string | null;
}

/**
 * "Visualização do cliente": só leitura, renderiza o mesmo <PropostaDocumento> da página
 * pública, mas SEM abrir a URL pública (isso registraria uma visualização do cliente).
 */
export function PropostaClienteViewModal({ isOpen, onClose, data, itens, viewToken }: PropostaClienteViewModalProps) {
  const branding = usePropostaBranding();
  const [baixando, setBaixando] = useState(false);
  if (!isOpen || !data) return null;

  const publicUrl = viewToken ? `${window.location.origin}/proposta/${viewToken}` : null;

  const baixar = async () => {
    setBaixando(true);
    try {
      await downloadPropostaClientePdf(data, itens, branding);
    } finally {
      setBaixando(false);
    }
  };

  const vencida = data.validade ? new Date(data.validade + "T23:59:59") < new Date() : false;

  return (
    <Modal isOpen={isOpen} onClose={onClose} noPadding maxWidth="max-w-5xl" className="h-[92vh] sm:h-[90vh]">
      <div className="flex flex-col h-full min-h-0">
        <div className="flex items-center justify-between gap-3 flex-wrap px-4 sm:px-6 py-3 border-b border-[var(--color-border-default)] shrink-0 bg-[var(--color-surface-elevated)]">
          <div className="min-w-0">
            <h3 className="text-sm font-black text-[var(--color-text-primary)]">Visualização do cliente</h3>
            <p className="text-[11px] text-[var(--color-text-muted)]">Somente leitura — é assim que o cliente recebe a proposta.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button type="button" variant="outline" size="sm" onClick={baixar} disabled={baixando} className="h-9 gap-1.5 text-xs font-bold cursor-pointer">
              <Download className="w-3.5 h-3.5" /> {baixando ? "Gerando..." : "Baixar PDF"}
            </Button>
            {publicUrl && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(publicUrl);
                    toast.success("Link público copiado!");
                  }}
                  className="h-9 gap-1.5 text-xs font-bold cursor-pointer"
                >
                  <Link2 className="w-3.5 h-3.5" /> Copiar link
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(publicUrl, "_blank", "noopener,noreferrer")}
                  className="h-9 gap-1.5 text-xs font-bold cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Abrir link público
                </Button>
              </>
            )}
            <Button type="button" variant="outline" size="sm" onClick={onClose} className="h-9 gap-1.5 text-xs font-bold cursor-pointer">
              <X className="w-3.5 h-3.5" /> Fechar
            </Button>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin bg-[var(--color-surface)]">
          <div className="max-w-4xl mx-auto px-3 sm:px-6 py-5 sm:py-8">
            <PropostaDocumento
              proposta={{ ...data, itens }}
              brandColor={branding.brandColor}
              tenantName={branding.tenantName}
              empresaDados={branding.empresaDados}
              isAccepted={data.status === "Aceita"}
              isVencida={vencida}
              refId={`PROP-${(data.id || "").slice(0, 8) || "NOVA"}`}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}
