import { useState } from "react";
import { Upload, FileText, Image, FileSpreadsheet, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../../../lib/supabase";
import { useData } from "../../../contexts/DataContext";
import { useAuth } from "../../../contexts/AuthContext";
import { confirmDialog } from "../../../components/ui/confirm-dialog";

interface FinanceiroAnexosTabProps {
  transacaoId: string;
}

const fmtBytes = (n: number) => n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / (1024 * 1024)).toFixed(2)} MB`;

/** Aba "Arquivos" do lançamento (§3.9). Bucket `finance` PRIVADO com path prefixado por
 * tenant_id: o arquivo só é aberto por URL assinada de curta duração (createSignedUrl),
 * gerada para quem tem acesso à pasta do próprio tenant (policy de SELECT do bucket). */
export function FinanceiroAnexosTab({ transacaoId }: FinanceiroAnexosTabProps) {
  const { financeAttachments, addFinanceAttachment, deleteFinanceAttachment } = useData();
  const { activeTenantId } = useAuth();
  const [uploading, setUploading] = useState(false);

  const anexos = (financeAttachments as any[]).filter(a => a.transacao_id === transacaoId);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    e.target.value = "";
    if (!files || files.length === 0 || !supabase || !activeTenantId) return;

    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > 26214400) { toast.error(`"${file.name}" excede 25 MB.`); continue; }
        const path = `${activeTenantId}/${transacaoId}/${Date.now()}-${file.name}`;
        const { error: uploadError } = await supabase.storage.from("finance").upload(path, file, { upsert: true });
        if (uploadError) throw uploadError;
        await addFinanceAttachment({
          transacao_id: transacaoId,
          nome_arquivo: file.name,
          tamanho_bytes: file.size,
          storage_key: path,
          url: path, // caminho no bucket privado (não é URL pública); o link é gerado sob demanda
        });
      }
      toast.success("Arquivo(s) anexado(s).");
    } catch (err: any) {
      toast.error(`Falha ao enviar arquivo: ${err.message || err}`);
    } finally {
      setUploading(false);
    }
  };

  const handleOpen = async (anexo: any) => {
    if (!supabase || !anexo.storage_key) { toast.error("Arquivo sem caminho de armazenamento."); return; }
    const { data, error } = await supabase.storage.from("finance").createSignedUrl(anexo.storage_key, 300);
    if (error || !data?.signedUrl) { toast.error("Não foi possível abrir o arquivo."); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const handleRemove = async (anexo: any) => {
    if (!(await confirmDialog({ title: "Remover anexo", description: `Remover "${anexo.nome_arquivo}"? Essa ação não pode ser desfeita.` }))) return;
    if (supabase && anexo.storage_key) {
      try { await supabase.storage.from("finance").remove([anexo.storage_key]); } catch (err) { console.error("Falha ao remover do Storage:", err); }
    }
    await deleteFinanceAttachment(anexo.id);
    toast.success("Anexo removido.");
  };

  const iconFor = (nome: string) => {
    const ext = nome.split(".").pop()?.toLowerCase() || "";
    if (ext === "pdf") return <FileText className="w-4 h-4" />;
    if (["png", "jpg", "jpeg", "gif"].includes(ext)) return <Image className="w-4 h-4" />;
    return <FileSpreadsheet className="w-4 h-4" />;
  };

  return (
    <div className="space-y-4">
      <div className="relative border border-dashed border-[var(--color-border-default)] rounded-[var(--radius-panel)] p-6 flex flex-col items-center justify-center text-center hover:border-[var(--color-primary-blue)]/40 transition-colors">
        <input type="file" multiple onChange={handleFileChange} disabled={uploading} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-wait" />
        {uploading ? <Loader2 className="w-6 h-6 mb-2 text-[var(--color-text-faint)] animate-spin" /> : <Upload className="w-6 h-6 mb-2 text-[var(--color-text-faint)]" />}
        <span className="text-xs font-medium text-[var(--color-text-primary)]">{uploading ? "Enviando..." : "Arraste arquivos ou clique para selecionar"}</span>
        <span className="text-[10px] text-[var(--color-text-faint)] mt-1">Até 25 MB por arquivo</span>
      </div>

      <div className="space-y-2">
        {anexos.length === 0 ? (
          <p className="text-xs text-[var(--color-text-faint)] text-center py-4">Nenhum anexo neste lançamento.</p>
        ) : anexos.map(a => (
          <div key={a.id} className="flex items-center justify-between p-3 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-[var(--radius-control)]">
            <button type="button" onClick={() => handleOpen(a)} className="flex items-center gap-3 min-w-0 flex-1 text-left text-[var(--color-text-muted)] hover:text-[var(--color-primary-blue)]">
              {iconFor(a.nome_arquivo)}
              <div className="min-w-0">
                <span className="block text-xs font-medium text-[var(--color-text-primary)] truncate">{a.nome_arquivo}</span>
                <span className="text-[10px] text-[var(--color-text-faint)]">{fmtBytes(a.tamanho_bytes)}</span>
              </div>
            </button>
            <button type="button" onClick={() => handleRemove(a)} className="p-1.5 rounded-lg text-[var(--color-text-faint)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 shrink-0">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
