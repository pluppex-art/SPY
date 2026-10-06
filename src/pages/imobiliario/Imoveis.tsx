import { useState, useEffect } from "react";
import { PageContainer } from "../../components/PageContainer";
import { Button } from "../../components/ui/button";
import {
  Building2, Plus, Search, MapPin, Bed, Bath, Car, Eye, Edit2, Trash2,
  Copy, X, Home, DollarSign, Grid3x3, List, TrendingUp, Package,
  ChevronRight, User, ExternalLink, SquarePen, Columns3,
} from "lucide-react";
import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect } from "../../components/ui/kpi-filter-card";
import { EmptyState } from "../../components/ui/empty-state";
import { toast } from "sonner";
import { supabase } from "../../lib/supabase";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { Modal } from "../../components/ui/modal";
import { Link } from "react-router-dom";
import { useLocalization } from "../../contexts/LocalizationContext";
import { useAuth } from "../../contexts/AuthContext";
import { friendlyError } from "../../lib/friendlyError";
import { useIbgeLocalidades } from "../../lib/ibgeLocalidades";

type Imovel = {
  id: string;
  titulo: string;
  tipo: "Apartamento" | "Casa" | "Cobertura" | "Kitnet" | "Comercial" | "Terreno";
  operacao: "Venda" | "Locação";
  status: "Disponível" | "Vendido" | "Locado" | "Reservado";
  valor: number;
  bairro: string;
  cidade: string;
  area: number;
  quartos: number;
  banheiros: number;
  vagas: number;
  corretor: string;
  visitas: number;
  descricao: string;
  condominio?: number;
  iptu?: number;
  created_at?: string;
};


const TIPOS = ["Todos", "Apartamento", "Casa", "Cobertura", "Kitnet", "Comercial", "Terreno"];
const STATUS_LIST = ["Todos", "Disponível", "Vendido", "Locado", "Reservado"];
const OPERACOES = ["Todos", "Venda", "Locação"];

const FIELD = "w-full bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-xl px-3.5 py-2.5 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-faint)] focus:outline-none focus:border-blue-500/50";
const SELECT = "w-full bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-xl px-3.5 py-2.5 text-xs font-bold text-[var(--color-text-primary)] focus:outline-none focus:border-blue-500/50";
const LABEL = "text-[10px] font-black text-[var(--color-text-faint)] uppercase tracking-wider mb-1.5 block";

const statusColor = (s: string) => {
  if (s === "Disponível") return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
  if (s === "Vendido") return "bg-blue-500/10 text-blue-400 border-blue-500/20";
  if (s === "Locado") return "bg-violet-500/10 text-violet-400 border-violet-500/20";
  return "bg-amber-500/10 text-amber-400 border-amber-500/20";
};

const tipoGradient = (tipo: string) => {
  const map: Record<string, string> = {
    Apartamento: "from-blue-900/40 to-blue-800/10",
    Casa: "from-emerald-900/40 to-emerald-800/10",
    Cobertura: "from-violet-900/40 to-violet-800/10",
    Comercial: "from-amber-900/40 to-amber-800/10",
    Kitnet: "from-cyan-900/40 to-cyan-800/10",
    Terreno: "from-orange-900/40 to-orange-800/10",
  };
  return map[tipo] ?? "from-slate-900/40 to-slate-800/10";
};

const fmtValor = (im: Imovel) =>
  im.operacao === "Locação"
    ? `R$ ${im.valor.toLocaleString("pt-BR")}/mês`
    : im.valor >= 1e6
    ? `R$ ${(im.valor / 1e6).toFixed(1)}M`
    : `R$ ${(im.valor / 1000).toFixed(0)}k`;

// ─── FORM MODAL ───────────────────────────────────────────────────────────────
function ImovelFormModal({ onClose, onSave, initial, corretoresNomes = [] }: {
  onClose: () => void;
  onSave: (d: any) => void;
  initial?: Partial<Imovel>;
  corretoresNomes?: string[];
}) {
  const { formatCurrency } = useLocalization();
  const [form, setForm] = useState({
    titulo: initial?.titulo ?? "",
    tipo: initial?.tipo ?? "Apartamento",
    operacao: initial?.operacao ?? "Venda",
    status: initial?.status ?? "Disponível",
    valor: String(initial?.valor ?? ""),
    bairro: initial?.bairro ?? "",
    // Sem cidade fixa — nem todo tenant fica em São Paulo. `estadoUf` é só um
    // filtro client-side pro seletor de cidade (API do IBGE) — a tabela
    // imobiliario_imoveis não tem coluna de estado, então nunca é persistido.
    cidade: initial?.cidade ?? "",
    estadoUf: "",
    area: String(initial?.area ?? ""),
    quartos: String(initial?.quartos ?? "2"),
    banheiros: String(initial?.banheiros ?? "1"),
    vagas: String(initial?.vagas ?? "1"),
    condominio: String((initial as any)?.condominio ?? ""),
    iptu: String((initial as any)?.iptu ?? ""),
    corretor: initial?.corretor ?? "",
    descricao: initial?.descricao ?? "",
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const isEdit = Boolean(initial?.id);
  const { estados, municipios, loadingMunicipios } = useIbgeLocalidades(form.estadoUf);

  const handleSave = () => {
    if (!form.titulo.trim()) { toast.error("Título é obrigatório"); return; }
    const { estadoUf, ...formToSave } = form; // estadoUf é só filtro de UI — sem coluna correspondente no banco
    onSave({
      ...formToSave,
      valor: Number(form.valor), area: Number(form.area),
      quartos: Number(form.quartos), banheiros: Number(form.banheiros), vagas: Number(form.vagas),
      condominio: form.condominio ? Number(form.condominio) : undefined,
      iptu: form.iptu ? Number(form.iptu) : undefined,
    });
    onClose();
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      maxWidth="max-w-2xl"
      title={
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center font-bold shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-black text-[var(--color-text-primary)]">
              {isEdit ? "Editar Imóvel" : "Novo Imóvel no Portfólio"}
            </h3>
            <p className="text-xs text-[var(--color-text-muted)]">
              {isEdit ? "Atualize as informações do imóvel" : "Cadastre um novo imóvel ao catálogo da imobiliária"}
            </p>
          </div>
        </div>
      }
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-xs">
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-6 text-xs font-bold"
          >
            {isEdit ? "Salvar Alterações" : "Cadastrar Imóvel"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className={LABEL}>Título do Imóvel *</label>
          <input value={form.titulo} onChange={e => set("titulo", e.target.value)} placeholder="Ex: Apartamento 3 quartos - Moema" className={FIELD} />
        </div>
        <div className="grid grid-cols-2 gap-3.5">
          <div>
            <label className={LABEL}>Tipo</label>
            <select value={form.tipo} onChange={e => set("tipo", e.target.value)} className={SELECT}>
              {["Apartamento","Casa","Cobertura","Kitnet","Comercial","Terreno"].map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL}>Operação</label>
            <select value={form.operacao} onChange={e => set("operacao", e.target.value)} className={SELECT}>
              <option>Venda</option><option>Locação</option>
            </select>
          </div>
          <div>
            <label className={LABEL}>Status</label>
            <select value={form.status} onChange={e => set("status", e.target.value)} className={SELECT}>
              {["Disponível","Reservado","Vendido","Locado"].map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL}>Valor (R$)</label>
            <input type="number" value={form.valor} onChange={e => set("valor", e.target.value)} placeholder="850000" className={FIELD} />
          </div>
          <div>
            <label className={LABEL}>Condomínio (R$/mês)</label>
            <input type="number" value={form.condominio} onChange={e => set("condominio", e.target.value)} placeholder="800" className={FIELD} />
          </div>
          <div>
            <label className={LABEL}>IPTU (R$/ano)</label>
            <input type="number" value={form.iptu} onChange={e => set("iptu", e.target.value)} placeholder="2400" className={FIELD} />
          </div>
          <div>
            <label className={LABEL}>Área (m²)</label>
            <input type="number" value={form.area} onChange={e => set("area", e.target.value)} placeholder="120" className={FIELD} />
          </div>
          <div>
            <label className={LABEL}>Bairro</label>
            <input value={form.bairro} onChange={e => set("bairro", e.target.value)} placeholder="Moema" className={FIELD} />
          </div>
          <div>
            <label className={LABEL}>Estado (UF)</label>
            <select value={form.estadoUf} onChange={e => { set("estadoUf", e.target.value); set("cidade", ""); }} className={SELECT}>
              <option value="">Selecione...</option>
              {estados.map((uf) => <option key={uf.sigla} value={uf.sigla}>{uf.sigla}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL}>Cidade</label>
            {form.estadoUf && municipios.length > 0 ? (
              <select value={form.cidade} onChange={e => set("cidade", e.target.value)} className={SELECT}>
                <option value="">{loadingMunicipios ? "Carregando..." : "Selecione..."}</option>
                {municipios.map((m) => <option key={m.id} value={m.nome}>{m.nome}</option>)}
              </select>
            ) : (
              <input
                value={form.cidade}
                onChange={e => set("cidade", e.target.value)}
                placeholder={form.estadoUf ? "Digite a cidade" : "Escolha o estado primeiro"}
                className={FIELD}
              />
            )}
          </div>
          <div>
            <label className={LABEL}>Quartos</label>
            <input type="number" value={form.quartos} onChange={e => set("quartos", e.target.value)} min="0" className={FIELD} />
          </div>
          <div>
            <label className={LABEL}>Banheiros</label>
            <input type="number" value={form.banheiros} onChange={e => set("banheiros", e.target.value)} min="0" className={FIELD} />
          </div>
          <div>
            <label className={LABEL}>Vagas de Garagem</label>
            <input type="number" value={form.vagas} onChange={e => set("vagas", e.target.value)} min="0" className={FIELD} />
          </div>
          <div className="col-span-2">
            <label className={LABEL}>Corretor Responsável</label>
            <input
              value={form.corretor}
              onChange={e => set("corretor", e.target.value)}
              placeholder="Nome do corretor"
              list="corretores-imovel-sugeridos"
              className={FIELD}
            />
            <datalist id="corretores-imovel-sugeridos">
              {corretoresNomes.map(nome => <option key={nome} value={nome} />)}
            </datalist>
          </div>
          <div className="col-span-2">
            <label className={LABEL}>Descrição</label>
            <textarea value={form.descricao} onChange={e => set("descricao", e.target.value)} rows={3} placeholder="Descrição do imóvel..." className={`${FIELD} resize-none`} />
          </div>
        </div>

        {Number(form.valor) > 0 && (
          <div className="p-3.5 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-center justify-between text-xs">
            <span className="text-[var(--color-text-muted)]">
              Comissão Imobiliária Estimada ({form.operacao === "Venda" ? "6%" : "1º Aluguel"}):
            </span>
            <span className="font-mono font-black text-blue-500">
              {formatCurrency(form.operacao === "Venda" ? Number(form.valor) * 0.06 : Number(form.valor))}
            </span>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ─── DETAIL DRAWER ────────────────────────────────────────────────────────────
function ImovelDetailDrawer({ im, onClose, onEdit, onDelete }: {
  im: Imovel;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-md bg-[var(--color-surface)] border-l border-white/10 flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className={`h-36 bg-gradient-to-br ${tipoGradient(im.tipo)} flex items-end relative shrink-0`}>
          <div className="absolute top-3 right-3">
            <button onClick={onClose} className="p-1.5 rounded-lg bg-black/30 hover:bg-black/50 text-white"><X className="w-4 h-4" /></button>
          </div>
          <div className="p-5">
            <div className="flex gap-2 mb-2">
              <span className={`text-[10px] font-black px-2.5 py-1 rounded-full border ${statusColor(im.status)}`}>{im.status}</span>
              <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-black/30 text-slate-300">{im.tipo}</span>
              {im.operacao === "Locação" && <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-violet-500/30 text-violet-300">Locação</span>}
            </div>
            <h2 className="font-black text-white text-sm leading-tight">{im.titulo}</h2>
            <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5"><MapPin className="w-3 h-3" />{im.bairro}, {im.cidade}</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Valor e visitas */}
          <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
            <div>
              <p className="text-2xl font-black text-white">{fmtValor(im)}</p>
              <p className="text-[10px] text-slate-500">{im.operacao}</p>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-1.5 justify-end">
                <Eye className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-sm font-bold text-white">{im.visitas}</span>
              </div>
              <p className="text-[10px] text-slate-500">visitas</p>
            </div>
          </div>

          {/* Características */}
          <div className="px-6 py-4 border-b border-white/5">
            <p className={LABEL}>Características</p>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div className="bg-white/5 rounded-xl p-3 flex items-center gap-2">
                <Home className="w-4 h-4 text-slate-500" />
                <div>
                  <p className="text-[9px] text-slate-500">Área</p>
                  <p className="text-sm font-bold text-white">{im.area} m²</p>
                </div>
              </div>
              {im.quartos > 0 && (
                <div className="bg-white/5 rounded-xl p-3 flex items-center gap-2">
                  <Bed className="w-4 h-4 text-slate-500" />
                  <div>
                    <p className="text-[9px] text-slate-500">Quartos</p>
                    <p className="text-sm font-bold text-white">{im.quartos}</p>
                  </div>
                </div>
              )}
              {im.banheiros > 0 && (
                <div className="bg-white/5 rounded-xl p-3 flex items-center gap-2">
                  <Bath className="w-4 h-4 text-slate-500" />
                  <div>
                    <p className="text-[9px] text-slate-500">Banheiros</p>
                    <p className="text-sm font-bold text-white">{im.banheiros}</p>
                  </div>
                </div>
              )}
              {im.vagas > 0 && (
                <div className="bg-white/5 rounded-xl p-3 flex items-center gap-2">
                  <Car className="w-4 h-4 text-slate-500" />
                  <div>
                    <p className="text-[9px] text-slate-500">Vagas</p>
                    <p className="text-sm font-bold text-white">{im.vagas}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Corretor */}
          <div className="px-6 py-4 border-b border-white/5">
            <p className={LABEL}>Corretor Responsável</p>
            <div className="flex items-center gap-3 mt-2 p-3 bg-white/5 rounded-xl">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white font-black text-xs shrink-0">
                {im.corretor.split(" ").map(n => n[0]).join("").slice(0,2)}
              </div>
              <div>
                <p className="text-sm font-bold text-white">{im.corretor}</p>
                <p className="text-[10px] text-slate-500">Corretor responsável</p>
              </div>
            </div>
          </div>

          {/* Descrição */}
          {im.descricao && (
            <div className="px-6 py-4 border-b border-white/5">
              <p className={LABEL}>Descrição</p>
              <p className="text-sm text-slate-300 leading-relaxed mt-2">{im.descricao}</p>
            </div>
          )}

          {/* Ações rápidas */}
          <div className="px-6 py-4">
            <p className={LABEL}>Ações Rápidas</p>
            <div className="space-y-2 mt-2">
              <button
                onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/imovel/${im.id}`); toast.success("Link copiado!"); }}
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-all"
              >
                <Copy className="w-4 h-4 text-slate-500" />
                <span className="text-sm text-slate-300">Copiar link do imóvel</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-500 ml-auto" />
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/5 flex gap-2">
          <Button onClick={onEdit} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-xl gap-2">
            <Edit2 className="w-3.5 h-3.5" /> Editar
          </Button>
          <Button
            onClick={() => { onDelete(); onClose(); }}
            variant="ghost"
            className="px-4 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}


// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
function rowToImovel(r: any): Imovel {
  return {
    id: r.id, titulo: r.titulo, tipo: r.tipo, operacao: r.operacao,
    status: r.status, valor: Number(r.valor), bairro: r.bairro ?? "",
    cidade: r.cidade ?? "", area: Number(r.area), quartos: r.quartos,
    banheiros: r.banheiros, vagas: r.vagas, corretor: r.corretor ?? "",
    visitas: r.visitas ?? 0, descricao: r.descricao ?? "", created_at: r.created_at,
  };
}

export default function Imoveis() {
  // Supabase (imobiliario_imoveis) é a única fonte — sem cache local nem
  // gravação otimista silenciosa: erro de escrita agora aparece pro usuário.
  const { formatCurrency } = useLocalization();
  const { activeTenantId } = useAuth();
  const [imoveis, setImoveis] = useState<Imovel[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [tipoFilter, setTipoFilter] = useState("Todos");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [operacaoFilter, setOperacaoFilter] = useState("Todos");
  const [cidadeFilter, setCidadeFilter] = useState("");
  const [corretorFilter, setCorretorFilter] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showForm, setShowForm] = useState(false);
  const [editImovel, setEditImovel] = useState<Imovel | null>(null);
  const [selectedImovel, setSelectedImovel] = useState<Imovel | null>(null);
  // Baixo (auditoria 2026-09-21): o campo "corretor" era texto livre, sem
  // vínculo com imobiliario_corretores — nome digitado diferente do
  // cadastrado fazia a página pública do imóvel nunca achar o contato do
  // corretor. Lista real pra sugerir (datalist) o nome exato cadastrado.
  const [corretoresNomes, setCorretoresNomes] = useState<string[]>([]);

  const refetch = () => {
    if (!supabase || !activeTenantId) { setLoading(false); return; }
    supabase.from("imobiliario_imoveis").select("*").eq("tenant_id", activeTenantId).order("created_at", { ascending: false }).then(({ data, error }) => {
      if (error) toast.error(`Erro ao carregar imóveis: ${friendlyError(error)}`);
      else if (data) setImoveis(data.map(rowToImovel));
      setLoading(false);
    });
    supabase.from("imobiliario_corretores").select("nome").eq("tenant_id", activeTenantId).eq("status", "Ativo").then(({ data }) => {
      if (data) setCorretoresNomes(data.map((c: any) => c.nome));
    });
  };

  useEffect(() => { refetch(); }, [activeTenantId]);

  const filtered = imoveis.filter(i => {
    const q = search.toLowerCase();
    return (
      (i.titulo.toLowerCase().includes(q) || i.bairro.toLowerCase().includes(q) || i.corretor.toLowerCase().includes(q)) &&
      (tipoFilter === "Todos" || i.tipo === tipoFilter) &&
      (statusFilter === "Todos" || i.status === statusFilter) &&
      (operacaoFilter === "Todos" || i.operacao === operacaoFilter) &&
      (!cidadeFilter || i.cidade === cidadeFilter) &&
      (!corretorFilter || i.corretor === corretorFilter)
    );
  });

  const cidadesList = Array.from(new Set(imoveis.map(i => i.cidade).filter(Boolean))).sort();
  const corretoresFiltroList = Array.from(new Set(imoveis.map(i => i.corretor).filter(Boolean))).sort();

  const handleSave = async (form: any) => {
    if (!supabase || !activeTenantId) { toast.error("Não foi possível conectar ao servidor."); return; }
    const { data, error } = await supabase.from("imobiliario_imoveis").insert({ ...form, visitas: 0, tenant_id: activeTenantId }).select().maybeSingle();
    if (error) { toast.error(`Erro ao cadastrar imóvel: ${friendlyError(error)}`); return; }
    if (data) setImoveis(prev => [rowToImovel(data), ...prev]);
    toast.success("Imóvel cadastrado com sucesso!");
  };

  const handleEdit = async (form: any) => {
    if (!editImovel) return;
    if (!supabase) { toast.error("Não foi possível conectar ao servidor."); return; }
    const { error } = await supabase.from("imobiliario_imoveis").update(form).eq("id", editImovel.id);
    if (error) { toast.error(`Erro ao atualizar imóvel: ${friendlyError(error)}`); return; }
    const updated = { ...editImovel, ...form };
    setImoveis(prev => prev.map(i => i.id === editImovel.id ? updated : i));
    if (selectedImovel?.id === editImovel.id) setSelectedImovel(updated);
    toast.success("Imóvel atualizado com sucesso!");
    setEditImovel(null);
  };

  const handleDelete = async (id: string) => {
    const alvo = imoveis.find(i => i.id === id);
    if (!(await confirmDialog({
      title: "Excluir imóvel",
      description: `Excluir ${alvo?.titulo || "este imóvel"}? Essa ação não pode ser desfeita.`,
    }))) return;
    if (!supabase) { toast.error("Não foi possível conectar ao servidor."); return; }
    const { error } = await supabase.from("imobiliario_imoveis").delete().eq("id", id);
    if (error) { toast.error(`Erro ao remover imóvel: ${friendlyError(error)}`); return; }
    setImoveis(prev => prev.filter(i => i.id !== id));
    toast.success("Imóvel removido.");
  };

  const disponiveis = filtered.filter(i => i.status === "Disponível").length;
  const vendidos = filtered.filter(i => i.status === "Vendido").length;
  const vgvTotal = filtered.filter(i => i.operacao === "Venda").reduce((s, i) => s + i.valor, 0);
  const totalVisitas = filtered.reduce((s, i) => s + i.visitas, 0);

  return (
    <PageContainer
      title="Imóveis"
      description="Gerencie o portfólio completo de imóveis disponíveis, vendidos e locados."
      actions={
        <div className="flex items-center gap-2">
          <Link
            to="/app/crm/pipeline?nicho=imobiliario"
            className="h-9 px-3.5 text-xs font-bold gap-1.5 inline-flex items-center rounded-xl bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] hover:border-[var(--color-primary-blue)] text-[var(--color-text-primary)] transition-all"
          >
            <Columns3 className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" /> Ver Pipeline CRM
          </Link>
          <Button onClick={() => setShowForm(true)} className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs">
            <Plus className="w-3.5 h-3.5" /> Novo Imóvel
          </Button>
        </div>
      }
    >
      {showForm && <ImovelFormModal onClose={() => setShowForm(false)} onSave={handleSave} corretoresNomes={corretoresNomes} />}
      {editImovel && <ImovelFormModal onClose={() => setEditImovel(null)} onSave={handleEdit} initial={editImovel} corretoresNomes={corretoresNomes} />}
      {selectedImovel && (
        <ImovelDetailDrawer
          im={selectedImovel}
          onClose={() => setSelectedImovel(null)}
          onEdit={() => { setEditImovel(selectedImovel); setSelectedImovel(null); }}
          onDelete={() => handleDelete(selectedImovel.id)}
        />
      )}

      <KpiFilterCard
        id="imobImoveis"
        kpis={[
          { label: "Disponíveis", value: disponiveis, icon: Package, tone: "primary" },
          { label: "Vendidos", value: vendidos, icon: TrendingUp, tone: "success" },
          { label: "VGV Portfólio", value: `R$ ${(vgvTotal / 1e6).toFixed(1)}M`, icon: DollarSign, tone: "warning" },
          { label: "Total Visitas", value: totalVisitas, icon: Eye, tone: "info" },
        ]}
        activeCount={(search.trim() ? 1 : 0) + (tipoFilter !== "Todos" ? 1 : 0) + (statusFilter !== "Todos" ? 1 : 0) + (operacaoFilter !== "Todos" ? 1 : 0) + (cidadeFilter ? 1 : 0) + (corretorFilter ? 1 : 0)}
        onClear={() => { setSearch(""); setTipoFilter("Todos"); setStatusFilter("Todos"); setOperacaoFilter("Todos"); setCidadeFilter(""); setCorretorFilter(""); }}
      >
        <FilterBar>
          <FilterSearch value={search} onChange={setSearch} placeholder="Buscar imóvel, bairro, corretor..." />
          <FilterSelect icon={Home} value={tipoFilter} onChange={setTipoFilter} allValue="Todos" allLabel="Todos os tipos" options={TIPOS.slice(1)} />
          <FilterSelect icon={Package} value={statusFilter} onChange={setStatusFilter} allValue="Todos" allLabel="Todos os status" options={STATUS_LIST.slice(1)} />
          <FilterSelect icon={DollarSign} value={operacaoFilter} onChange={setOperacaoFilter} allValue="Todos" allLabel="Venda e locação" options={OPERACOES.slice(1)} />
          <FilterSelect icon={MapPin} value={cidadeFilter} onChange={setCidadeFilter} options={cidadesList} allLabel="Todas as cidades" />
          <FilterSelect icon={User} value={corretorFilter} onChange={setCorretorFilter} options={corretoresFiltroList} allLabel="Todos os corretores" />
          <div className="flex bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-[var(--radius-control)] p-1 gap-1">
            <button onClick={() => setViewMode("grid")} className={`p-1.5 rounded-lg transition-all cursor-pointer ${viewMode === "grid" ? "bg-[var(--color-primary-blue)]/15 text-[var(--color-primary-blue)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"}`}>
              <Grid3x3 className="w-4 h-4" />
            </button>
            <button onClick={() => setViewMode("list")} className={`p-1.5 rounded-lg transition-all cursor-pointer ${viewMode === "list" ? "bg-[var(--color-primary-blue)]/15 text-[var(--color-primary-blue)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"}`}>
              <List className="w-4 h-4" />
            </button>
          </div>
        </FilterBar>
      </KpiFilterCard>

      <div className="mt-4" />
      <p className="text-[10px] text-slate-600 font-bold mb-4">{filtered.length} imóvel(is) encontrado(s)</p>

      {/* Grid View */}
      {viewMode === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(im => (
            <div
              key={im.id}
              onClick={() => setSelectedImovel(im)}
              className="bg-[var(--color-surface-elevated)]/80 border border-white/5 rounded-2xl overflow-hidden hover:border-blue-500/20 transition-all cursor-pointer group shadow-lg"
            >
              <div className={`h-40 bg-gradient-to-br ${tipoGradient(im.tipo)} flex items-center justify-center relative`}>
                <Building2 className="w-12 h-12 text-white/10" />
                <div className="absolute top-3 left-3">
                  <span className={`text-[9px] font-black px-2.5 py-1 rounded-full border ${statusColor(im.status)}`}>{im.status}</span>
                </div>
                <div className="absolute top-3 right-3 flex gap-1.5">
                  <span className="text-[9px] font-black px-2 py-1 rounded-full bg-black/40 text-slate-300">{im.tipo}</span>
                  {im.operacao === "Locação" && <span className="text-[9px] font-black px-2 py-1 rounded-full bg-violet-500/20 text-violet-300">Aluguel</span>}
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[var(--color-surface-elevated)] to-transparent" />
                <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-4 text-slate-500 text-[10px]" onClick={e => e.stopPropagation()}>
                  <button onClick={() => setEditImovel(im)} className="p-1.5 rounded-lg bg-black/30 hover:bg-black/60 text-white transition-all opacity-0 group-hover:opacity-100">
                    <Edit2 className="w-3 h-3" />
                  </button>
                  <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/imovel/${im.id}`); toast.success("Link copiado!"); }} className="p-1.5 rounded-lg bg-black/30 hover:bg-black/60 text-white transition-all opacity-0 group-hover:opacity-100">
                    <Copy className="w-3 h-3" />
                  </button>
                  <button onClick={() => handleDelete(im.id)} className="p-1.5 rounded-lg bg-black/30 hover:bg-red-500/20 text-red-400 transition-all opacity-0 group-hover:opacity-100">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
              <div className="p-4">
                <p className="font-black text-white text-sm leading-snug">{im.titulo}</p>
                <p className="text-[10px] text-slate-500 flex items-center gap-1 mt-1"><MapPin className="w-3 h-3" />{im.bairro}, {im.cidade}</p>
                <div className="flex items-center gap-3 text-[10px] text-slate-500 mt-2">
                  {im.quartos > 0 && <span className="flex items-center gap-1"><Bed className="w-3 h-3" />{im.quartos}</span>}
                  {im.banheiros > 0 && <span className="flex items-center gap-1"><Bath className="w-3 h-3" />{im.banheiros}</span>}
                  {im.vagas > 0 && <span className="flex items-center gap-1"><Car className="w-3 h-3" />{im.vagas}</span>}
                  <span className="flex items-center gap-1"><Home className="w-3 h-3" />{im.area}m²</span>
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
                  <p className="font-black text-white text-sm">{fmtValor(im)}</p>
                  <span className="text-[9px] text-slate-500 flex items-center gap-1"><Eye className="w-3 h-3" />{im.visitas} visitas</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* List View */
        <div className="space-y-2">
          {filtered.map(im => (
            <div
              key={im.id}
              onClick={() => setSelectedImovel(im)}
              className="flex items-center gap-4 p-4 bg-[var(--color-surface-elevated)]/80 border border-white/5 rounded-xl hover:border-blue-500/20 transition-all cursor-pointer group"
            >
              <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${tipoGradient(im.tipo)} flex items-center justify-center shrink-0`}>
                <Building2 className="w-6 h-6 text-white/30" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-white text-sm">{im.titulo}</p>
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${statusColor(im.status)}`}>{im.status}</span>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-slate-500 mt-1">
                  <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{im.bairro}</span>
                  {im.quartos > 0 && <span className="flex items-center gap-1"><Bed className="w-3 h-3" />{im.quartos}q</span>}
                  <span className="flex items-center gap-1"><Home className="w-3 h-3" />{im.area}m²</span>
                  <span>Corretor: <span className="text-slate-300 font-bold">{im.corretor}</span></span>
                </div>
              </div>
              <div className="text-right shrink-0 mr-2">
                <p className="font-black text-white text-sm">{fmtValor(im)}</p>
                <p className="text-[9px] text-slate-500 flex items-center gap-1 justify-end"><Eye className="w-3 h-3" />{im.visitas} visitas</p>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                <button onClick={() => setEditImovel(im)} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all">
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => handleDelete(im.id)} className="p-2 rounded-lg bg-white/5 hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-all">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors shrink-0" />
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="text-center py-20 text-slate-500">
          <Building2 className="w-12 h-12 mx-auto mb-3 opacity-20 animate-pulse" />
          <p className="font-bold">Carregando imóveis...</p>
        </div>
      ) : filtered.length === 0 && (
        <EmptyState
          icon={Building2}
          title={imoveis.length === 0 ? "Nenhum imóvel cadastrado" : "Nenhum imóvel encontrado"}
          description={imoveis.length === 0 ? "Cadastre o primeiro imóvel do portfólio." : "Ajuste os filtros para ver outros imóveis."}
          action={imoveis.length === 0 ? (
            <Button onClick={() => setShowForm(true)} className="h-9 px-4 text-xs font-bold gap-1.5 bg-blue-600 hover:bg-blue-700">
              <Plus className="w-3.5 h-3.5" /> Novo Imóvel
            </Button>
          ) : undefined}
        />
      )}
    </PageContainer>
  );
}
