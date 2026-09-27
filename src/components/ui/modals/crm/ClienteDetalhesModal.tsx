import { useMemo } from "react";
import {
  Building2, Mail, Phone, MapPin, FileText, Users, TrendingUp,
  Package, Calendar, ExternalLink,
} from "lucide-react";
import { Modal } from "../../modal";
import { Button } from "../../button";
import { Badge } from "../../badge";
import { useData } from "../../../../contexts/DataContext";
import { useLocalization } from "../../../../contexts/LocalizationContext";
import { Link } from "react-router-dom";

interface Cliente {
  id: string;
  name: string;
  industry?: string;
  city?: string;
  state?: string;
  phone?: string;
  email?: string;
  status?: string;
  documento?: string | null;
  created_at?: string;
}

interface ClienteDetalhesModalProps {
  isOpen: boolean;
  onClose: () => void;
  cliente: Cliente | null;
  onManageContatos: (clienteId: string) => void;
}

function statusBadgeVariant(status?: string): "success" | "warning" | "secondary" {
  if (status === "Ativo") return "success";
  if (status === "Em Implantação") return "warning";
  return "secondary";
}

export function ClienteDetalhesModal({ isOpen, onClose, cliente, onManageContatos }: ClienteDetalhesModalProps) {
  const { leads, products } = useData();
  const { formatCurrency } = useLocalization();

  // Origem deste cliente: todo lead que fechou negócio e foi vinculado a ele
  // (createClientFromWonLead/reconciliação em DataContext gravam `clientId`
  // no lead assim que o cliente é criado/encontrado) — não existe FK inversa
  // dedicada, então o vínculo real é sempre por aqui, nunca por nome.
  const dealLeads = useMemo(
    () => (leads || []).filter((l: any) => l.clientId === cliente?.id),
    [leads, cliente?.id]
  );

  const totalWonValue = useMemo(
    () => dealLeads.reduce((sum: number, l: any) => sum + (Number(l.value) || 0), 0),
    [dealLeads]
  );

  const productNameById = useMemo(() => {
    const map = new Map<string, string>();
    (products || []).forEach((p: any) => map.set(p.id, p.name));
    return map;
  }, [products]);

  if (!cliente) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-[480px]"
      position="right"
      overlay="light"
      title={
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[var(--color-primary-blue)]/15 border border-[var(--color-primary-blue)]/20 flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5 text-[var(--color-primary-blue)]" />
          </div>
          <div>
            <div className="text-base font-black text-[var(--color-text-primary)]">{cliente.name}</div>
            <div className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-faint)] mt-0.5 flex items-center gap-1.5">
              {cliente.industry || "Cliente"}
              <Badge variant={statusBadgeVariant(cliente.status)} className="text-[9px] py-0 px-1.5">{cliente.status}</Badge>
            </div>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div className="p-3 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl flex items-center gap-2 text-xs">
            <Mail className="w-3.5 h-3.5 text-[var(--color-text-faint)] shrink-0" />
            <span className="text-[var(--color-text-primary)] truncate">{cliente.email || "—"}</span>
          </div>
          <div className="p-3 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl flex items-center gap-2 text-xs">
            <Phone className="w-3.5 h-3.5 text-[var(--color-text-faint)] shrink-0" />
            <span className="text-[var(--color-text-primary)]">{cliente.phone || "—"}</span>
          </div>
          <div className="p-3 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl flex items-center gap-2 text-xs">
            <MapPin className="w-3.5 h-3.5 text-[var(--color-text-faint)] shrink-0" />
            <span className="text-[var(--color-text-primary)]">{cliente.city ? `${cliente.city}, ${cliente.state}` : "—"}</span>
          </div>
          <div className="p-3 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl flex items-center gap-2 text-xs">
            <FileText className="w-3.5 h-3.5 text-[var(--color-text-faint)] shrink-0" />
            <span className="text-[var(--color-text-primary)] font-mono">{cliente.documento || "—"}</span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-[var(--color-primary-blue)]/10 border border-[var(--color-primary-blue)]/20 flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-primary-blue)] flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" /> Total Ganho com este Cliente
          </span>
          <span className="text-lg font-black text-[var(--color-primary-blue)] font-mono">{formatCurrency(totalWonValue)}</span>
        </div>

        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-faint)]">
            Negócios de Origem ({dealLeads.length})
          </p>
          {dealLeads.length === 0 ? (
            <p className="text-xs text-[var(--color-text-muted)]">Nenhum negócio vinculado ainda a este cliente.</p>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {dealLeads.map((l: any) => (
                <Link
                  key={l.id}
                  to="/app/pipeline"
                  onClick={onClose}
                  className="block p-3 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl hover:border-[var(--color-primary-blue)]/40 transition-colors group"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[var(--color-text-primary)] truncate flex items-center gap-1.5">
                      {l.name}
                      <ExternalLink className="w-3 h-3 text-[var(--color-text-faint)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </span>
                    <span className="text-xs font-mono font-black text-emerald-600 shrink-0">{formatCurrency(Number(l.value) || 0)}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-[10px] text-[var(--color-text-muted)]">
                    {Array.isArray(l.productIds) && l.productIds.length > 0 && (
                      <span className="flex items-center gap-1 truncate">
                        <Package className="w-3 h-3 shrink-0" />
                        {l.productIds.map((pid: string) => productNameById.get(pid)).filter(Boolean).join(", ") || "Produto vinculado"}
                      </span>
                    )}
                    {l.updated_at && (
                      <span className="flex items-center gap-1 shrink-0">
                        <Calendar className="w-3 h-3" /> {new Date(l.updated_at).toLocaleDateString("pt-BR")}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <Button
          variant="ghost"
          onClick={() => onManageContatos(cliente.id)}
          className="w-full h-9 text-[10px] font-black uppercase tracking-widest gap-1.5 border border-[var(--color-border-default)]"
        >
          <Users className="w-3.5 h-3.5" /> Ver Contatos e Decisores
        </Button>
      </div>
    </Modal>
  );
}
