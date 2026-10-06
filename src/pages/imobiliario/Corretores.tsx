import { useState, useEffect } from "react";
import { PageContainer } from "../../components/PageContainer";
import { Button } from "../../components/ui/button";
import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect, FilterChips } from "../../components/ui/kpi-filter-card";
import {
  Plus, Search, Star, Building2, TrendingUp, Copy, ExternalLink, X,
  Phone, Mail, Edit2, Trash2, Link, Target, Award, Users, ChevronRight,
  MessageSquare, BarChart2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../../lib/supabase";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { Modal } from "../../components/ui/modal";
import { useLocalization } from "../../contexts/LocalizationContext";
import { useAuth } from "../../contexts/AuthContext";
import { friendlyError } from "../../lib/friendlyError";

type Corretor = {
  id: string;
  nome: string;
  creci: string;
  telefone: string;
  email: string;
  especialidade: string;
  imovisAtivos: number;
  vendasMes: number;
  totalVendas: number;
  vgvMes: number;
  meta: number;
  avaliacao: number;
  bio: string;
  slug: string;
  status: "Ativo" | "Inativo";
  comissaoPct: number;
};


const ESPECIALIDADES = ["Residencial", "Comercial", "Alto Padrão", "Lançamentos", "Rural", "Industrial"];

const FIELD = "w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl px-3.5 py-2 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary-blue)]";
const SELECT = "w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl px-3.5 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]";
const LABEL = "text-xs font-semibold text-[var(--color-text-primary)] mb-1.5 block";

function StarRating({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(s => (
        <Star key={s} className={`w-3 h-3 ${s <= Math.round(value) ? "text-amber-400 fill-current" : "text-slate-700"}`} />
      ))}
      <span className="text-[11px] font-black text-amber-400 ml-1">{value}</span>
    </div>
  );
}

const especialidadeColor: Record<string, string> = {
  "Alto Padrão": "bg-violet-500/10 text-violet-400 border-violet-500/20",
  "Residencial": "bg-blue-500/10 text-blue-400 border-blue-500/20",
  "Comercial": "bg-amber-500/10 text-amber-400 border-amber-500/20",
  "Lançamentos": "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  "Rural": "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  "Industrial": "bg-orange-500/10 text-orange-400 border-orange-500/20",
};

// ─── FORM MODAL ───────────────────────────────────────────────────────────────
function CorretorFormModal({ onClose, onSave, initial }: {
  onClose: () => void;
  onSave: (d: any) => void;
  initial?: Partial<Corretor>;
}) {
  const [form, setForm] = useState({
    nome: initial?.nome ?? "",
    creci: initial?.creci ?? "",
    telefone: initial?.telefone ?? "",
    email: initial?.email ?? "",
    especialidade: initial?.especialidade ?? "Residencial",
    bio: initial?.bio ?? "",
    meta: String(initial?.meta ?? "5"),
    status: initial?.status ?? "Ativo",
    comissaoPct: String(initial?.comissaoPct ?? "5"),
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const isEdit = Boolean(initial?.id);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    onSave({ ...form, meta: Number(form.meta) || 5, comissaoPct: Number(form.comissaoPct) || 0 });
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
            <Users className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[var(--color-text-primary)]">{isEdit ? "Editar Corretor" : "Novo Corretor"}</h2>
            <p className="text-xs text-[var(--color-text-muted)]">{isEdit ? "Atualize os dados do corretor" : "Cadastre um novo membro da equipe"}</p>
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
            form="form-corretor-modal"
            className="h-9 px-4 text-xs font-semibold bg-[var(--color-primary-blue)] hover:bg-[var(--color-primary-blue)]/90 text-white"
          >
            {isEdit ? "Salvar Alterações" : "Cadastrar Corretor"}
          </Button>
        </div>
      }
    >
      <form id="form-corretor-modal" onSubmit={handleSubmit} className="space-y-4 py-1">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Nome Completo *</label>
            <input required value={form.nome} onChange={e => set("nome", e.target.value)} placeholder="Ana Lima" className={FIELD} />
          </div>
          <div>
            <label className={LABEL}>CRECI</label>
            <input value={form.creci} onChange={e => set("creci", e.target.value)} placeholder="CRECI-SP 123456" className={FIELD} />
          </div>
          <div>
            <label className={LABEL}>Telefone</label>
            <input value={form.telefone} onChange={e => set("telefone", e.target.value)} placeholder="(11) 99999-9999" className={FIELD} />
          </div>
          <div>
            <label className={LABEL}>E-mail</label>
            <input value={form.email} onChange={e => set("email", e.target.value)} placeholder="corretor@email.com" className={FIELD} />
          </div>
          <div>
            <label className={LABEL}>Especialidade</label>
            <select value={form.especialidade} onChange={e => set("especialidade", e.target.value)} className={SELECT}>
              {ESPECIALIDADES.map(e => <option key={e}>{e}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL}>Meta Mensal (vendas)</label>
            <input type="number" value={form.meta} onChange={e => set("meta", e.target.value)} placeholder="5" className={FIELD} />
          </div>
          <div>
            <label className={LABEL}>Comissão (%)</label>
            <input type="number" step="0.5" min="0" max="100" value={form.comissaoPct} onChange={e => set("comissaoPct", e.target.value)} placeholder="5" className={FIELD} />
          </div>
          {isEdit && (
            <div>
              <label className={LABEL}>Status</label>
              <select value={form.status} onChange={e => set("status", e.target.value)} className={SELECT}>
                <option>Ativo</option><option>Inativo</option>
              </select>
            </div>
          )}
          <div className={isEdit ? "" : "col-span-2"}>
            <label className={LABEL}>Bio / Descrição</label>
            <textarea value={form.bio} onChange={e => set("bio", e.target.value)} rows={3} placeholder="Fale sobre a experiência e especialização..." className={`${FIELD} resize-none`} />
          </div>
        </div>
      </form>
    </Modal>
  );
}

// ─── DETAIL DRAWER ────────────────────────────────────────────────────────────
function CorretorDetailDrawer({ c, idx, onClose, onEdit, onDelete }: {
  c: Corretor;
  idx: number;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { formatCurrency } = useLocalization();
  // Baixo (auditoria 2026-09-21): meta=0 é permitido no formulário e gerava NaN%.
  const metaPct = c.meta > 0 ? Math.min((c.vendasMes / c.meta) * 100, 100) : 0;
  const espColor = especialidadeColor[c.especialidade] ?? "bg-slate-500/10 text-slate-400 border-slate-500/20";
  const phoneRaw = c.telefone.replace(/\D/g, "");

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-md bg-[var(--color-surface)] border-l border-white/10 flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-6 border-b border-white/5 bg-gradient-to-br from-blue-900/20 to-violet-900/10">
          <div className="flex items-start justify-between mb-4">
            <button onClick={onClose} className="p-1.5 rounded-lg bg-white/[0.03] hover:bg-white/5 text-slate-500 ml-auto"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white font-black text-xl">
                {c.nome.split(" ").map(n => n[0]).join("").slice(0, 2)}
              </div>
              {idx === 0 && (
                <div className="absolute -top-1 -right-1 w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center">
                  <Award className="w-3 h-3 text-white" />
                </div>
              )}
            </div>
            <div>
              <h2 className="font-black text-white text-base">{c.nome}</h2>
              <p className="text-[10px] text-slate-500">{c.creci}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${espColor}`}>{c.especialidade}</span>
                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${c.status === "Ativo" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"}`}>{c.status}</span>
              </div>
            </div>
          </div>
          <div className="mt-3">
            <StarRating value={c.avaliacao} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* KPIs */}
          <div className="px-6 py-4 border-b border-white/5">
            <p className={LABEL}>Performance</p>
            <div className="grid grid-cols-3 gap-2 mt-2">
              <div className="bg-white/5 rounded-xl p-3 text-center">
                <p className="text-xl font-black text-white">{c.imovisAtivos}</p>
                <p className="text-[9px] text-slate-500 mt-0.5">Imóveis Ativos</p>
              </div>
              <div className="bg-white/5 rounded-xl p-3 text-center">
                <p className="text-xl font-black text-white">{c.vendasMes}</p>
                <p className="text-[9px] text-slate-500 mt-0.5">Vendas/Mês</p>
              </div>
              <div className="bg-white/5 rounded-xl p-3 text-center">
                <p className="text-xl font-black text-white">{c.totalVendas}</p>
                <p className="text-[9px] text-slate-500 mt-0.5">Total Vendas</p>
              </div>
            </div>
          </div>

          {/* VGV e Meta */}
          <div className="px-6 py-4 border-b border-white/5">
            <div className="flex items-center justify-between mb-2">
              <p className={LABEL}>Meta do Mês</p>
              <span className="text-xs font-black text-white">R$ {c.vgvMes.toFixed(1)}M VGV</span>
            </div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] text-slate-500">{c.vendasMes} de {c.meta} vendas</span>
              <span className={`text-[10px] font-black ${metaPct >= 100 ? "text-emerald-400" : metaPct >= 60 ? "text-amber-400" : "text-slate-400"}`}>{metaPct.toFixed(0)}%</span>
            </div>
            <div className="h-2 bg-white/5 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${metaPct >= 100 ? "bg-emerald-500" : metaPct >= 60 ? "bg-amber-500" : "bg-blue-500"}`} style={{ width: `${metaPct}%` }} />
            </div>
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
              <span className="text-[10px] text-slate-500">Comissão ({c.comissaoPct}%) estimada no mês</span>
              <span className="text-xs font-black text-emerald-400">
                {formatCurrency(c.vgvMes * 1_000_000 * (c.comissaoPct / 100))}
              </span>
            </div>
          </div>

          {/* Contato */}
          <div className="px-6 py-4 border-b border-white/5">
            <p className={LABEL}>Contato</p>
            <div className="space-y-2 mt-2">
              <a href={`tel:${phoneRaw}`} className="flex items-center gap-3 p-2.5 rounded-xl bg-white/5 hover:bg-white/10 transition-all group">
                <Phone className="w-3.5 h-3.5 text-slate-500 group-hover:text-blue-400" />
                <span className="text-sm text-slate-300">{c.telefone}</span>
              </a>
              <a href={`mailto:${c.email}`} className="flex items-center gap-3 p-2.5 rounded-xl bg-white/5 hover:bg-white/10 transition-all group">
                <Mail className="w-3.5 h-3.5 text-slate-500 group-hover:text-blue-400" />
                <span className="text-sm text-slate-300">{c.email}</span>
              </a>
              <a href={`https://wa.me/55${phoneRaw}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 transition-all">
                <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-sm text-emerald-400 font-bold">WhatsApp</span>
                <ExternalLink className="w-3 h-3 text-emerald-400 ml-auto" />
              </a>
            </div>
          </div>

          {/* Bio */}
          {c.bio && (
            <div className="px-6 py-4 border-b border-white/5">
              <p className={LABEL}>Sobre</p>
              <p className="text-sm text-slate-300 leading-relaxed mt-2">{c.bio}</p>
            </div>
          )}

          {/* Portfólio */}
          <div className="px-6 py-4">
            <p className={LABEL}>Portfólio Público</p>
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/corretor/${c.slug}`); toast.success("Link copiado!"); }}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 text-[11px] font-black transition-all border border-blue-500/20"
              >
                <Copy className="w-3.5 h-3.5" /> Copiar Link
              </button>
              <button
                onClick={() => window.open(`/corretor/${c.slug}`, "_blank")}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-[11px] font-black transition-all border border-white/10"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Visualizar
              </button>
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
export default function Corretores() {
  const { formatCurrency } = useLocalization();
  const { activeTenantId } = useAuth();
  const [corretores, setCorretores] = useState<Corretor[]>([]);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterEsp, setFilterEsp] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editCorretor, setEditCorretor] = useState<Corretor | null>(null);
  const [selectedCorretor, setSelectedCorretor] = useState<{ c: Corretor; idx: number } | null>(null);
  const [sortBy, setSortBy] = useState<"vendas" | "avaliacao" | "vgv">("vendas");

  useEffect(() => {
    if (!supabase || !activeTenantId) return;
    Promise.all([
      supabase.from("imobiliario_corretores").select("*").eq("tenant_id", activeTenantId).order("created_at", { ascending: false }),
      supabase.from("imobiliario_imoveis").select("corretor,status,valor,updated_at").eq("tenant_id", activeTenantId),
    ]).then(([{ data }, { data: imoveis }]) => {
      if (!data) return;
      const now = new Date();
      const normalize = (s: string) => s.trim().toLowerCase();

      setCorretores(data.map(r => {
        const meus = (imoveis ?? []).filter(im => normalize(im.corretor ?? "") === normalize(r.nome));
        const vendidos = meus.filter(im => im.status === "Vendido");
        const vendidosMes = vendidos.filter(im => {
          const d = new Date(im.updated_at ?? "");
          return !isNaN(d.getTime()) && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        });
        const ativos = meus.filter(im => im.status === "Disponível" || im.status === "Reservado").length;
        const vgvMesReais = vendidosMes.reduce((s, im) => s + Number(im.valor ?? 0), 0);

        return {
          id: r.id, nome: r.nome, creci: r.creci ?? "", telefone: r.telefone ?? "",
          email: r.email ?? "", especialidade: r.especialidade, imovisAtivos: ativos,
          vendasMes: vendidosMes.length, totalVendas: vendidos.length, vgvMes: vgvMesReais / 1_000_000,
          meta: r.meta ?? 5, avaliacao: Number(r.avaliacao ?? 5), bio: r.bio ?? "",
          slug: r.slug ?? "", status: r.status, comissaoPct: Number(r.comissao_pct ?? 5),
        };
      }));
    });
  }, [activeTenantId]);

  const filtered = corretores
    .filter(c =>
      c.nome.toLowerCase().includes(search.toLowerCase()) ||
      c.especialidade.toLowerCase().includes(search.toLowerCase()) ||
      c.creci.toLowerCase().includes(search.toLowerCase())
    )
    .filter(c => !filterStatus || c.status === filterStatus)
    .filter(c => !filterEsp || c.especialidade === filterEsp)
    .sort((a, b) => {
      if (sortBy === "vendas") return b.vendasMes - a.vendasMes;
      if (sortBy === "avaliacao") return b.avaliacao - a.avaliacao;
      return b.vgvMes - a.vgvMes;
    });

  const makeSlug = (nome: string) =>
    nome.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "-");

  const handleSave = async (form: any) => {
    const slug = makeSlug(form.nome);
    const novo: Corretor = { ...form, id: Date.now().toString(), slug, imovisAtivos: 0, vendasMes: 0, totalVendas: 0, vgvMes: 0, avaliacao: 5.0, status: "Ativo" };
    setCorretores(prev => [novo, ...prev]);
    if (supabase && activeTenantId) {
      const { error } = await supabase.from("imobiliario_corretores").insert({ nome: form.nome, creci: form.creci, telefone: form.telefone, email: form.email, especialidade: form.especialidade, bio: form.bio, slug, meta: form.meta, comissao_pct: form.comissaoPct, id: novo.id, tenant_id: activeTenantId });
      if (error) {
        console.error("[Supabase]", error.message);
        toast.error(`Erro ao cadastrar corretor: ${friendlyError(error)}`);
        setCorretores(prev => prev.filter(c => c.id !== novo.id));
        return;
      }
    }
    toast.success("Corretor cadastrado!");
  };

  const handleEdit = async (form: any) => {
    if (!editCorretor) return;
    const previous = editCorretor;
    const updated = { ...editCorretor, ...form };
    setCorretores(prev => prev.map(c => c.id === editCorretor.id ? updated : c));
    if (selectedCorretor?.c.id === editCorretor.id) setSelectedCorretor({ c: updated, idx: selectedCorretor.idx });
    if (supabase) {
      const { error } = await supabase.from("imobiliario_corretores").update({ nome: form.nome, creci: form.creci, telefone: form.telefone, email: form.email, especialidade: form.especialidade, bio: form.bio, meta: form.meta, status: form.status, comissao_pct: form.comissaoPct }).eq("id", editCorretor.id);
      if (error) {
        console.error("[Supabase]", error.message);
        toast.error(`Erro ao atualizar corretor: ${friendlyError(error)}`);
        setCorretores(prev => prev.map(c => c.id === previous.id ? previous : c));
        if (selectedCorretor?.c.id === previous.id) setSelectedCorretor({ c: previous, idx: selectedCorretor.idx });
        setEditCorretor(null);
        return;
      }
    }
    toast.success("Corretor atualizado!");
    setEditCorretor(null);
  };

  const handleDelete = async (id: string) => {
    const alvo = corretores.find(c => c.id === id);
    if (!(await confirmDialog({
      title: "Excluir corretor",
      description: `Excluir ${alvo?.nome || "este corretor"}? Essa ação não pode ser desfeita.`,
    }))) return;
    setCorretores(prev => prev.filter(c => c.id !== id));
    if (supabase) {
      const { error } = await supabase.from("imobiliario_corretores").delete().eq("id", id);
      if (error) {
        console.error("[Supabase]", error.message);
        toast.error(`Erro ao remover corretor: ${friendlyError(error)}`);
        if (alvo) setCorretores(prev => [alvo, ...prev]);
        return;
      }
    }
    toast.success("Corretor removido.");
  };

  const totalVendas = filtered.reduce((s, c) => s + c.vendasMes, 0);
  const totalVGV = filtered.reduce((s, c) => s + c.vgvMes, 0);
  const mediaAvaliacao = filtered.length
    ? (filtered.reduce((s, c) => s + c.avaliacao, 0) / filtered.length).toFixed(1)
    : "0";

  return (
    <PageContainer
      title="Corretores & Vendedores"
      description="Gerencie a equipe de corretores e vendedores, portfólios públicos e performance individual."
      actions={
        <Button onClick={() => setShowForm(true)} className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-5 h-10 gap-2 font-bold">
          <Plus className="w-4 h-4" /> Novo Corretor
        </Button>
      }
    >
      {showForm && <CorretorFormModal onClose={() => setShowForm(false)} onSave={handleSave} />}
      {editCorretor && <CorretorFormModal onClose={() => setEditCorretor(null)} onSave={handleEdit} initial={editCorretor} />}
      {selectedCorretor && (
        <CorretorDetailDrawer
          c={selectedCorretor.c}
          idx={selectedCorretor.idx}
          onClose={() => setSelectedCorretor(null)}
          onEdit={() => { setEditCorretor(selectedCorretor.c); setSelectedCorretor(null); }}
          onDelete={() => handleDelete(selectedCorretor.c.id)}
        />
      )}

      <KpiFilterCard
        id="imobCorretores"
        kpis={[
          { label: "Corretores", value: filtered.length, icon: Users, tone: "primary" },
          { label: "Vendas Mês", value: totalVendas, icon: TrendingUp, tone: "success" },
          { label: "VGV Mês", value: `R$ ${totalVGV.toFixed(1)}M`, icon: Target, tone: "info" },
          { label: "Média Avaliação", value: mediaAvaliacao, icon: Star, tone: "warning" },
        ]}
        activeCount={(search.trim() ? 1 : 0) + (filterStatus ? 1 : 0) + (filterEsp ? 1 : 0)}
        onClear={() => { setSearch(""); setFilterStatus(""); setFilterEsp(""); }}
      >
        <FilterBar>
          <FilterSearch value={search} onChange={setSearch} placeholder="Buscar corretor, CRECI ou especialidade..." />
          <FilterSelect icon={Award} value={filterEsp} onChange={setFilterEsp} options={ESPECIALIDADES} allLabel="Todas as especialidades" />
          <FilterChips value={filterStatus} onChange={setFilterStatus} options={["Ativo", "Inativo"]} />
          <div className="flex bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-[var(--radius-control)] p-1 gap-1" title="Ordenar por">
            {(["vendas", "avaliacao", "vgv"] as const).map(s => (
              <button key={s} onClick={() => setSortBy(s)} className={`px-3 py-1 text-[10px] font-black rounded-lg transition-all cursor-pointer ${sortBy === s ? "bg-[var(--color-primary-blue)]/15 text-[var(--color-primary-blue)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"}`}>
                {s === "vendas" ? "Vendas" : s === "avaliacao" ? "Avaliação" : "VGV"}
              </button>
            ))}
          </div>
        </FilterBar>
      </KpiFilterCard>

      <div className="mt-4" />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((c, idx) => {
          const metaPct = c.meta > 0 ? Math.min((c.vendasMes / c.meta) * 100, 100) : 0;
          const espColor = especialidadeColor[c.especialidade] ?? "bg-slate-500/10 text-slate-400 border-slate-500/20";

          return (
            <div
              key={c.id}
              onClick={() => setSelectedCorretor({ c, idx })}
              className="bg-[var(--color-surface-elevated)]/80 border border-white/5 rounded-2xl p-5 hover:border-blue-500/20 transition-all group cursor-pointer"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white font-black text-lg">
                      {c.nome.split(" ").map(n => n[0]).join("").slice(0, 2)}
                    </div>
                    {idx === 0 && (
                      <div className="absolute -top-1 -right-1 w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center">
                        <Award className="w-2.5 h-2.5 text-white" />
                      </div>
                    )}
                  </div>
                  <div>
                    <h3 className="font-black text-white text-sm">{c.nome}</h3>
                    <p className="text-[10px] text-slate-500">{c.creci}</p>
                    <span className={`inline-block text-[9px] font-black px-2 py-0.5 rounded-full border mt-1 ${c.status === "Ativo" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"}`}>{c.status}</span>
                  </div>
                </div>
                <StarRating value={c.avaliacao} />
              </div>

              <div className="mb-3">
                <span className={`text-[10px] font-black px-2.5 py-1 rounded-full border ${espColor}`}>{c.especialidade}</span>
              </div>

              <p className="text-xs text-slate-500 mb-4 line-clamp-2 leading-relaxed">{c.bio}</p>

              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="bg-white/[0.03] rounded-xl p-2.5 text-center">
                  <p className="text-base font-black text-white">{c.imovisAtivos}</p>
                  <p className="text-[9px] text-slate-500 mt-0.5">Ativos</p>
                </div>
                <div className="bg-white/[0.03] rounded-xl p-2.5 text-center">
                  <p className="text-base font-black text-white">{c.vendasMes}</p>
                  <p className="text-[9px] text-slate-500 mt-0.5">Vendas</p>
                </div>
                <div className="bg-white/[0.03] rounded-xl p-2.5 text-center">
                  <p className="text-base font-black text-white">{c.totalVendas}</p>
                  <p className="text-[9px] text-slate-500 mt-0.5">Total</p>
                </div>
              </div>

              {/* Meta */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] text-slate-500">Meta: {c.meta} vendas</span>
                  <span className={`text-[10px] font-black ${metaPct >= 100 ? "text-emerald-400" : metaPct >= 60 ? "text-amber-400" : "text-slate-400"}`}>{metaPct.toFixed(0)}%</span>
                </div>
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${metaPct >= 100 ? "bg-emerald-500" : metaPct >= 60 ? "bg-amber-500" : "bg-blue-500"}`} style={{ width: `${metaPct}%` }} />
                </div>
              </div>

              {/* Portfólio */}
              <div className="border-t border-white/5 pt-3" onClick={e => e.stopPropagation()}>
                <div className="flex gap-2">
                  <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/corretor/${c.slug}`); toast.success("Link copiado!"); }} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 text-[11px] font-black transition-all border border-blue-500/20">
                    <Copy className="w-3 h-3" /> Portfólio
                  </button>
                  <button onClick={() => setEditCorretor(c)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-[11px] font-black transition-all border border-white/10">
                    <Edit2 className="w-3 h-3" /> Editar
                  </button>
                  <button onClick={() => handleDelete(c.id)} className="px-3 py-2 rounded-xl bg-white/5 hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-all border border-white/10">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-20 text-slate-500">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="font-bold">Nenhum corretor encontrado</p>
          <p className="text-xs mt-1">Tente ajustar o filtro ou cadastre um novo corretor.</p>
        </div>
      )}
    </PageContainer>
  );
}
