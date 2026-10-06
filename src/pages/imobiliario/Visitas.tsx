import { useState, useEffect } from "react";
import { PageContainer } from "../../components/PageContainer";
import { Button } from "../../components/ui/button";
import {
  Plus, Calendar, MapPin, User, Clock, Check, X, Building2, Car,
  Search, CheckCircle2, XCircle, AlertCircle, Eye, TrendingUp,
  Phone, Edit2, Trash2, ChevronRight, MessageSquare, ExternalLink,
} from "lucide-react";
import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect, FilterChips } from "../../components/ui/kpi-filter-card";
import { DateRangeFilter } from "../../components/ui/DateRangeFilter";
import { toast } from "sonner";
import { supabase } from "../../lib/supabase";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { Modal } from "../../components/ui/modal";
import { useAuth } from "../../contexts/AuthContext";
import { friendlyError } from "../../lib/friendlyError";

type Visita = {
  id: string;
  imovel: string;
  bairro: string;
  cliente: string;
  telefone: string;
  corretor: string;
  data: string;
  hora: string;
  status: "Agendada" | "Confirmada" | "Realizada" | "Cancelada";
  obs: string;
  imovelId: string | null;
  veiculoId: string | null;
};

/** Imóvel ou veículo vinculado a esta visita/test-drive — opcional, alimenta
 * o seletor do formulário. */
interface AtivoOption { id: string; tipo: "imovel" | "veiculo"; label: string; }


const STATUS_COLORS: Record<string, string> = {
  Agendada: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  Confirmada: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  Realizada: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  Cancelada: "bg-red-500/10 text-red-400 border-red-500/20",
};

const STATUS_ICON: Record<string, any> = {
  Agendada: AlertCircle,
  Confirmada: Clock,
  Realizada: CheckCircle2,
  Cancelada: XCircle,
};

const FIELD = "w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl px-3.5 py-2 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary-blue)]";
const SELECT = "w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl px-3.5 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]";
const LABEL = "text-xs font-semibold text-[var(--color-text-primary)] mb-1.5 block";

// ─── FORM MODAL ───────────────────────────────────────────────────────────────
function VisitaFormModal({ onClose, onSave, initial, ativos }: {
  onClose: () => void;
  onSave: (d: any) => void;
  initial?: Partial<Visita>;
  ativos: AtivoOption[];
}) {
  const initialAtivoKey = initial?.imovelId ? `imovel:${initial.imovelId}` : initial?.veiculoId ? `veiculo:${initial.veiculoId}` : "";
  const [form, setForm] = useState({
    imovel: initial?.imovel ?? "",
    bairro: initial?.bairro ?? "",
    cliente: initial?.cliente ?? "",
    telefone: initial?.telefone ?? "",
    corretor: initial?.corretor ?? "",
    data: initial?.data ?? "",
    hora: initial?.hora ?? "10:00",
    status: initial?.status ?? "Agendada",
    obs: initial?.obs ?? "",
    ativoKey: initialAtivoKey,
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const isEdit = Boolean(initial?.id);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.imovel.trim() || !form.cliente.trim() || !form.data) {
      toast.error("Preencha os campos obrigatórios");
      return;
    }
    const [ativoTipo, ativoId] = form.ativoKey ? form.ativoKey.split(":") : [null, null];
    const { ativoKey, ...rest } = form;
    onSave({
      ...rest,
      imovelId: ativoTipo === "imovel" ? ativoId : null,
      veiculoId: ativoTipo === "veiculo" ? ativoId : null,
    });
    onClose();
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      maxWidth="max-w-lg"
      title={
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] flex items-center justify-center shrink-0">
            <Calendar className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[var(--color-text-primary)]">{isEdit ? "Editar Visita" : "Agendar Visita"}</h2>
            <p className="text-xs text-[var(--color-text-muted)]">{isEdit ? "Atualize as informações da visita" : "Cadastre uma nova visita de cliente"}</p>
          </div>
        </div>
      }
      footer={
        <div className="flex items-center justify-end gap-2 w-full">
          <Button type="button" variant="outline" onClick={onClose} className="h-9 px-4 text-xs font-semibold">
            Cancelar
          </Button>
          <Button
            type="submit"
            form="form-visita-modal"
            className="h-9 px-4 text-xs font-semibold bg-[var(--color-primary-blue)] hover:bg-[var(--color-primary-blue)]/90 text-white"
          >
            {isEdit ? "Salvar Alterações" : "Agendar Visita"}
          </Button>
        </div>
      }
    >
      <form id="form-visita-modal" onSubmit={handleSubmit} className="space-y-4 py-1">
        <div>
          <label className={LABEL}>Imóvel ou Veículo *</label>
          <input required value={form.imovel} onChange={e => set("imovel", e.target.value)} placeholder="Nome/endereço do imóvel ou marca/modelo do veículo" className={FIELD} />
        </div>
        <div>
          <label className={LABEL}>Vincular a um Cadastro (opcional)</label>
          <select value={form.ativoKey} onChange={e => set("ativoKey", e.target.value)} className={SELECT}>
            <option value="">Nenhum — apenas o texto acima</option>
            {ativos.filter(a => a.tipo === "imovel").length > 0 && (
              <optgroup label="Imóveis">
                {ativos.filter(a => a.tipo === "imovel").map(a => (
                  <option key={a.id} value={`imovel:${a.id}`}>{a.label}</option>
                ))}
              </optgroup>
            )}
            {ativos.filter(a => a.tipo === "veiculo").length > 0 && (
              <optgroup label="Veículos">
                {ativos.filter(a => a.tipo === "veiculo").map(a => (
                  <option key={a.id} value={`veiculo:${a.id}`}>{a.label}</option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Bairro</label>
            <input value={form.bairro} onChange={e => set("bairro", e.target.value)} placeholder="Moema" className={FIELD} />
          </div>
          <div>
            <label className={LABEL}>Corretor / Consultor</label>
            <input value={form.corretor} onChange={e => set("corretor", e.target.value)} placeholder="Nome do corretor" className={FIELD} />
          </div>
          <div>
            <label className={LABEL}>Cliente *</label>
            <input required value={form.cliente} onChange={e => set("cliente", e.target.value)} placeholder="Nome do cliente" className={FIELD} />
          </div>
          <div>
            <label className={LABEL}>Telefone</label>
            <input value={form.telefone} onChange={e => set("telefone", e.target.value)} placeholder="(11) 99999-9999" className={FIELD} />
          </div>
          <div>
            <label className={LABEL}>Data *</label>
            <input required type="date" value={form.data} onChange={e => set("data", e.target.value)} className={FIELD} />
          </div>
          <div>
            <label className={LABEL}>Horário *</label>
            <input required type="time" value={form.hora} onChange={e => set("hora", e.target.value)} className={FIELD} />
          </div>
          {isEdit && (
            <div className="col-span-2">
              <label className={LABEL}>Status</label>
              <select value={form.status} onChange={e => set("status", e.target.value)} className={SELECT}>
                <option>Agendada</option><option>Confirmada</option><option>Realizada</option><option>Cancelada</option>
              </select>
            </div>
          )}
          <div className="col-span-2">
            <label className={LABEL}>Observações</label>
            <textarea value={form.obs} onChange={e => set("obs", e.target.value)} rows={2} placeholder="Informações adicionais, preferências do cliente..." className={`${FIELD} resize-none`} />
          </div>
        </div>
      </form>
    </Modal>
  );
}

// ─── DETAIL DRAWER ────────────────────────────────────────────────────────────
function VisitaDetailDrawer({ v, onClose, onEdit, onDelete, onUpdateStatus }: {
  v: Visita;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onUpdateStatus: (status: Visita["status"]) => void;
}) {
  const StatusIcon = STATUS_ICON[v.status] ?? AlertCircle;
  const phoneRaw = v.telefone.replace(/\D/g, "");
  const dataFmt = new Date(v.data + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-md bg-[var(--color-surface)] border-l border-white/10 flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-6 border-b border-white/5">
          <div className="flex items-center justify-between mb-4">
            <span className={`text-[10px] font-black px-2.5 py-1 rounded-full border flex items-center gap-1 ${STATUS_COLORS[v.status]}`}>
              <StatusIcon className="w-2.5 h-2.5" />{v.status}
            </span>
            <button onClick={onClose} className="p-1.5 rounded-lg bg-white/[0.03] hover:bg-white/5 text-slate-500"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-900/40 to-violet-900/30 flex items-center justify-center shrink-0">
              {v.veiculoId ? <Car className="w-6 h-6 text-blue-400/60" /> : <Building2 className="w-6 h-6 text-blue-400/60" />}
            </div>
            <div>
              <h2 className="font-black text-white text-sm leading-tight">{v.imovel}</h2>
              <p className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5"><MapPin className="w-3 h-3" />{v.bairro}</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Data e hora */}
          <div className="px-6 py-4 border-b border-white/5 grid grid-cols-2 gap-3">
            <div className="bg-white/5 rounded-xl p-4">
              <p className="text-[9px] text-slate-500 uppercase tracking-widest mb-1">Data</p>
              <p className="text-sm font-bold text-white capitalize">{dataFmt}</p>
            </div>
            <div className="bg-white/5 rounded-xl p-4">
              <p className="text-[9px] text-slate-500 uppercase tracking-widest mb-1">Horário</p>
              <p className="text-xl font-black text-white">{v.hora}</p>
            </div>
          </div>

          {/* Envolvidos */}
          <div className="px-6 py-4 border-b border-white/5">
            <p className={LABEL}>Envolvidos</p>
            <div className="space-y-2 mt-2">
              <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white font-black text-xs shrink-0">
                  {v.cliente.split(" ").map(n => n[0]).join("").slice(0, 2)}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-white">{v.cliente}</p>
                  <p className="text-[9px] text-slate-500">Cliente</p>
                </div>
                {v.telefone && (
                  <a href={`https://wa.me/55${phoneRaw}`} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 transition-all">
                    <MessageSquare className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
              <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white font-black text-xs shrink-0">
                  {v.corretor.split(" ").map(n => n[0]).join("").slice(0, 2)}
                </div>
                <div>
                  <p className="text-sm font-bold text-white">{v.corretor}</p>
                  <p className="text-[9px] text-slate-500">Corretor responsável</p>
                </div>
              </div>
              {v.telefone && (
                <a href={`tel:${phoneRaw}`} className="flex items-center gap-3 p-3 bg-white/5 rounded-xl hover:bg-white/10 transition-all group">
                  <Phone className="w-4 h-4 text-slate-500 group-hover:text-blue-400" />
                  <span className="text-sm text-slate-300">{v.telefone}</span>
                </a>
              )}
            </div>
          </div>

          {/* Obs */}
          {v.obs && (
            <div className="px-6 py-4 border-b border-white/5">
              <p className={LABEL}>Observações</p>
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 mt-2">
                <p className="text-sm text-slate-300 leading-relaxed">{v.obs}</p>
              </div>
            </div>
          )}

          {/* Alterar status */}
          <div className="px-6 py-4">
            <p className={LABEL}>Alterar Status</p>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {(["Agendada", "Confirmada", "Realizada", "Cancelada"] as const).map(s => {
                const Icon = STATUS_ICON[s];
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onUpdateStatus(s)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      v.status === s
                        ? STATUS_COLORS[s] + " ring-1 ring-current"
                        : "bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)] border-[var(--color-border-default)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface)]"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" /> {s}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/5 flex gap-2">
          <Button onClick={onEdit} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-xl gap-2">
            <Edit2 className="w-3.5 h-3.5" /> Editar
          </Button>
          <Button onClick={() => { onDelete(); onClose(); }} variant="ghost" className="px-4 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function Visitas() {
  const { activeTenantId } = useAuth();
  const [visitas, setVisitas] = useState<Visita[]>([]);
  const [ativos, setAtivos] = useState<AtivoOption[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todas");
  const [corretorFilter, setCorretorFilter] = useState("");
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editVisita, setEditVisita] = useState<Visita | null>(null);
  const [selectedVisita, setSelectedVisita] = useState<Visita | null>(null);

  useEffect(() => {
    if (!supabase || !activeTenantId) return;
    supabase.from("imobiliario_visitas").select("*").eq("tenant_id", activeTenantId).order("data", { ascending: true }).then(({ data }) => {
      if (data) {
        setVisitas(data.map(r => ({
          id: r.id, imovel: r.imovel, bairro: r.bairro ?? "",
          cliente: r.cliente, telefone: r.telefone ?? "", corretor: r.corretor ?? "",
          data: r.data, hora: r.hora ?? "10:00", status: r.status, obs: r.obs ?? "",
          imovelId: r.imovel_id ?? null, veiculoId: r.veiculo_id ?? null,
        })));
      }
    });

    Promise.all([
      supabase.from("imobiliario_imoveis").select("id, titulo, bairro").eq("tenant_id", activeTenantId),
      supabase.from("imobiliario_veiculos").select("id, marca, modelo").eq("tenant_id", activeTenantId),
    ]).then(([imoveisRes, veiculosRes]) => {
      const imoveis: AtivoOption[] = (imoveisRes.data ?? []).map(i => ({
        id: i.id, tipo: "imovel", label: `${i.titulo}${i.bairro ? ` — ${i.bairro}` : ""}`,
      }));
      const veiculos: AtivoOption[] = (veiculosRes.data ?? []).map(v => ({
        id: v.id, tipo: "veiculo", label: `${v.marca} ${v.modelo}`,
      }));
      setAtivos([...imoveis, ...veiculos]);
    });
  }, [activeTenantId]);

  const filtered = visitas.filter(v => {
    const q = search.toLowerCase();
    return (
      (v.cliente.toLowerCase().includes(q) || v.imovel.toLowerCase().includes(q) || v.corretor.toLowerCase().includes(q) || v.bairro.toLowerCase().includes(q)) &&
      (statusFilter === "Todas" || v.status === statusFilter) &&
      (!corretorFilter || v.corretor === corretorFilter) &&
      (!dateFrom || v.data >= dateFrom) &&
      (!dateTo || v.data <= dateTo)
    );
  });

  const corretoresList = Array.from(new Set(visitas.map(v => v.corretor).filter(Boolean))).sort();

  const handleSave = async (form: any) => {
    const nova: Visita = { ...form, id: Date.now().toString(), status: "Agendada" };
    setVisitas(prev => [nova, ...prev]);
    if (supabase && activeTenantId) {
      const { imovelId, veiculoId, ...rest } = form;
      const { error } = await supabase.from("imobiliario_visitas").insert({
        ...rest, id: nova.id, imovel_id: imovelId, veiculo_id: veiculoId, tenant_id: activeTenantId,
      });
      if (error) {
        console.error("[Supabase]", error.message);
        toast.error(`Erro ao agendar visita: ${friendlyError(error)}`);
        setVisitas(prev => prev.filter(v => v.id !== nova.id));
        return;
      }
    }
    toast.success("Visita agendada!");
  };

  const handleEdit = async (form: any) => {
    if (!editVisita) return;
    const previous = editVisita;
    const updated = { ...editVisita, ...form };
    setVisitas(prev => prev.map(v => v.id === editVisita.id ? updated : v));
    if (selectedVisita?.id === editVisita.id) setSelectedVisita(updated);
    if (supabase) {
      const { imovelId, veiculoId, ...rest } = form;
      const { error } = await supabase.from("imobiliario_visitas")
        .update({ ...rest, imovel_id: imovelId, veiculo_id: veiculoId })
        .eq("id", editVisita.id);
      if (error) {
        console.error("[Supabase]", error.message);
        toast.error(`Erro ao atualizar visita: ${friendlyError(error)}`);
        setVisitas(prev => prev.map(v => v.id === previous.id ? previous : v));
        if (selectedVisita?.id === previous.id) setSelectedVisita(previous);
        setEditVisita(null);
        return;
      }
    }
    toast.success("Visita atualizada!");
    setEditVisita(null);
  };

  const updateStatus = async (id: string, status: Visita["status"]) => {
    const previous = visitas.find(v => v.id === id)?.status;
    setVisitas(prev => prev.map(v => v.id === id ? { ...v, status } : v));
    if (selectedVisita?.id === id) setSelectedVisita(s => s ? { ...s, status } : null);
    if (supabase) {
      const { error } = await supabase.from("imobiliario_visitas").update({ status }).eq("id", id);
      if (error) {
        console.error("[Supabase]", error.message);
        toast.error(`Erro ao atualizar status: ${friendlyError(error)}`);
        if (previous) {
          setVisitas(prev => prev.map(v => v.id === id ? { ...v, status: previous } : v));
          if (selectedVisita?.id === id) setSelectedVisita(s => s ? { ...s, status: previous } : null);
        }
        return;
      }
    }
    const msgs: Record<string, string> = { Confirmada: "Visita confirmada!", Realizada: "Visita marcada como realizada.", Cancelada: "Visita cancelada." };
    toast.success(msgs[status] ?? `Status: ${status}`);
  };

  const handleDelete = async (id: string) => {
    const alvo = visitas.find(v => v.id === id);
    if (!(await confirmDialog({
      title: "Excluir visita",
      description: alvo ? `Excluir a visita de ${alvo.cliente} ao imóvel ${alvo.imovel}? Essa ação não pode ser desfeita.` : "Excluir esta visita? Essa ação não pode ser desfeita.",
    }))) return;
    setVisitas(prev => prev.filter(v => v.id !== id));
    if (supabase) {
      const { error } = await supabase.from("imobiliario_visitas").delete().eq("id", id);
      if (error) {
        console.error("[Supabase]", error.message);
        toast.error(`Erro ao remover visita: ${friendlyError(error)}`);
        if (alvo) setVisitas(prev => [alvo, ...prev]);
        return;
      }
    }
    toast.success("Visita removida.");
  };

  const hoje = new Date().toISOString().split("T")[0];
  const proximas = filtered.filter(v => v.data >= hoje && v.status !== "Cancelada" && v.status !== "Realizada");
  const historico = filtered.filter(v => v.data < hoje || v.status === "Realizada" || v.status === "Cancelada");

  const agendadas = filtered.filter(v => v.status === "Agendada").length;
  const confirmadas = filtered.filter(v => v.status === "Confirmada").length;
  const realizadas = filtered.filter(v => v.status === "Realizada").length;
  const canceladas = filtered.filter(v => v.status === "Cancelada").length;

  const VisitaRow = ({ v }: { v: Visita }) => {
    const StatusIcon = STATUS_ICON[v.status] ?? AlertCircle;
    const phoneRaw = v.telefone.replace(/\D/g, "");

    return (
      <div
        onClick={() => setSelectedVisita(v)}
        className="flex items-start gap-4 p-4 bg-[var(--color-surface-elevated)]/80 border border-white/5 rounded-xl hover:border-blue-500/20 transition-all cursor-pointer group"
      >
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-900/30 to-violet-900/20 flex items-center justify-center shrink-0">
          {v.veiculoId ? <Car className="w-5 h-5 text-blue-400/60" /> : <Building2 className="w-5 h-5 text-blue-400/60" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <p className="font-bold text-white text-sm truncate">{v.imovel}</p>
            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border flex items-center gap-1 ${STATUS_COLORS[v.status]}`}>
              <StatusIcon className="w-2 h-2" />{v.status}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-slate-500 flex-wrap">
            <span className="flex items-center gap-1"><User className="w-3 h-3" />{v.cliente}</span>
            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(v.data + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</span>
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{v.hora}</span>
            <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{v.bairro}</span>
            <span>Corretor: <span className="text-slate-300 font-bold">{v.corretor}</span></span>
          </div>
          {v.obs && (
            <p className="text-[10px] text-slate-500 italic mt-1.5 bg-white/[0.02] rounded-lg px-2.5 py-1.5 border border-white/5 line-clamp-1">
              "{v.obs}"
            </p>
          )}
        </div>
        <div className="flex gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
          {v.status === "Agendada" && (
            <button onClick={() => updateStatus(v.id, "Confirmada")} className="p-2 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 transition-all" title="Confirmar">
              <Check className="w-3.5 h-3.5" />
            </button>
          )}
          {(v.status === "Agendada" || v.status === "Confirmada") && (
            <button onClick={() => updateStatus(v.id, "Realizada")} className="p-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 transition-all" title="Realizar">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </button>
          )}
          {v.status !== "Cancelada" && v.status !== "Realizada" && (
            <button type="button" onClick={() => updateStatus(v.id, "Cancelada")} className="p-2 rounded-lg bg-[var(--color-surface-sunken)] hover:bg-rose-500/10 text-[var(--color-text-muted)] hover:text-rose-500 transition-all cursor-pointer" title="Cancelar">
              <XCircle className="w-3.5 h-3.5" />
            </button>
          )}
          <button type="button" onClick={() => setEditVisita(v)} className="p-2 rounded-lg bg-[var(--color-surface-sunken)] hover:bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-all cursor-pointer" title="Editar">
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={() => handleDelete(v.id)} className="p-2 rounded-lg bg-[var(--color-surface-sunken)] hover:bg-rose-500/10 text-[var(--color-text-faint)] hover:text-rose-500 transition-all cursor-pointer" title="Remover">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
        <ChevronRight className="w-4 h-4 text-[var(--color-text-muted)] group-hover:text-[var(--color-text-primary)] transition-colors shrink-0 mt-1" />
      </div>
    );
  };

  return (
    <PageContainer
      title="Visitas & Test-Drives"
      description="Controle e organize todas as visitas de imóveis e test-drives de veículos com clientes."
      actions={
        <Button onClick={() => setShowForm(true)} className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs">
          <Plus className="w-3.5 h-3.5" /> Agendar Visita
        </Button>
      }
    >
      {showForm && <VisitaFormModal onClose={() => setShowForm(false)} onSave={handleSave} ativos={ativos} />}
      {editVisita && <VisitaFormModal onClose={() => setEditVisita(null)} onSave={handleEdit} initial={editVisita} ativos={ativos} />}
      {selectedVisita && (
        <VisitaDetailDrawer
          v={selectedVisita}
          onClose={() => setSelectedVisita(null)}
          onEdit={() => { setEditVisita(selectedVisita); setSelectedVisita(null); }}
          onDelete={() => handleDelete(selectedVisita.id)}
          onUpdateStatus={s => updateStatus(selectedVisita.id, s)}
        />
      )}

      <KpiFilterCard
        id="imobVisitas"
        kpis={[
          { label: "Agendadas", value: agendadas, icon: AlertCircle, tone: "warning" },
          { label: "Confirmadas", value: confirmadas, icon: Clock, tone: "info" },
          { label: "Realizadas", value: realizadas, icon: CheckCircle2, tone: "success" },
          { label: "Taxa Realização", value: realizadas + canceladas > 0 ? `${Math.round((realizadas / (realizadas + canceladas)) * 100)}%` : "—", icon: TrendingUp, tone: "accent" },
        ]}
        activeCount={(search.trim() ? 1 : 0) + (statusFilter !== "Todas" ? 1 : 0) + (corretorFilter ? 1 : 0) + (dateFrom || dateTo ? 1 : 0)}
        onClear={() => { setSearch(""); setStatusFilter("Todas"); setCorretorFilter(""); setDateFrom(null); setDateTo(null); }}
      >
        <FilterBar>
          <FilterSearch value={search} onChange={setSearch} placeholder="Buscar cliente, imóvel, corretor ou bairro..." />
          <FilterSelect icon={User} value={corretorFilter} onChange={setCorretorFilter} options={corretoresList} allLabel="Todos os corretores" />
          <DateRangeFilter dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} className="h-[38px]" />
          <FilterChips value={statusFilter} onChange={setStatusFilter} allValue="Todas" allLabel="Todas" options={["Agendada", "Confirmada", "Realizada", "Cancelada"]} />
        </FilterBar>
      </KpiFilterCard>

      <div className="mt-4" />

      {proximas.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1.5 h-4 bg-blue-500 rounded-full" />
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Próximas Visitas <span className="text-blue-400">({proximas.length})</span>
            </h3>
          </div>
          <div className="space-y-2">
            {proximas.map(v => <VisitaRow key={v.id} v={v} />)}
          </div>
        </div>
      )}

      {historico.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1.5 h-4 bg-slate-600 rounded-full" />
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Histórico <span className="text-slate-500">({historico.length})</span>
            </h3>
          </div>
          <div className="space-y-2">
            {historico.map(v => <VisitaRow key={v.id} v={v} />)}
          </div>
        </div>
      )}

      {filtered.length === 0 && (
        <div className="text-center py-20 text-slate-500">
          <Calendar className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="font-bold">Nenhuma visita encontrada</p>
          <p className="text-sm mt-1">Ajuste os filtros ou agende uma nova visita.</p>
        </div>
      )}
    </PageContainer>
  );
}
