import { useState, useEffect } from "react";
import { PageContainer } from "../../components/PageContainer";
import { Button } from "../../components/ui/button";
import {
  Car, Plus, Search, Gauge, Fuel, Settings2, Calendar, Eye, Edit2, Trash2,
  X, Palette, DollarSign, Grid3x3, List, TrendingUp, Package,
  ChevronRight, Landmark, ArrowRightLeft, HandCoins, Banknote, Columns3,
} from "lucide-react";
import { Card } from "../../components/ui/card";
import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect } from "../../components/ui/kpi-filter-card";
import { toast } from "sonner";
import { supabase } from "../../lib/supabase";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { Modal } from "../../components/ui/modal";
import { VeiculoFinanciamentoModal } from "./components/VeiculoFinanciamentoModal";
import { Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { friendlyError } from "../../lib/friendlyError";

type Veiculo = {
  id: string;
  marca: string;
  modelo: string;
  anoFabricacao: number;
  anoModelo: number;
  km: number;
  placa: string;
  cor: string;
  combustivel: "Flex" | "Gasolina" | "Diesel" | "Elétrico" | "Híbrido";
  cambio: "Manual" | "Automático" | "CVT";
  valor: number;
  status: "Disponível" | "Vendido" | "Reservado" | "Em Preparação";
  vendedor: string;
  visitas: number;
  descricao: string;
  isConsignado: boolean;
  consignanteNome: string;
  consignanteTelefone: string;
  comissaoPercentual: number | null;
  repasseRealizado: boolean;
  created_at?: string;
};

const COMBUSTIVEIS = ["Todos", "Flex", "Gasolina", "Diesel", "Elétrico", "Híbrido"];
const CAMBIOS = ["Manual", "Automático", "CVT"];
const STATUS_LIST = ["Todos", "Disponível", "Reservado", "Vendido", "Em Preparação"];

const FIELD = "w-full bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-xl px-3.5 py-2.5 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-faint)] focus:outline-none focus:border-blue-500/50";
const SELECT = "w-full bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-xl px-3.5 py-2.5 text-xs font-bold text-[var(--color-text-primary)] focus:outline-none focus:border-blue-500/50";
const LABEL = "text-[10px] font-black text-[var(--color-text-faint)] uppercase tracking-wider mb-1.5 block";

const statusColor = (s: string) => {
  if (s === "Disponível") return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
  if (s === "Vendido") return "bg-blue-500/10 text-blue-400 border-blue-500/20";
  if (s === "Reservado") return "bg-amber-500/10 text-amber-400 border-amber-500/20";
  return "bg-violet-500/10 text-violet-400 border-violet-500/20"; // Em Preparação
};

const combustivelGradient = (combustivel: string) => {
  const map: Record<string, string> = {
    Flex: "from-blue-900/40 to-blue-800/10",
    Gasolina: "from-amber-900/40 to-amber-800/10",
    Diesel: "from-slate-900/40 to-slate-800/10",
    Elétrico: "from-emerald-900/40 to-emerald-800/10",
    Híbrido: "from-cyan-900/40 to-cyan-800/10",
  };
  return map[combustivel] ?? "from-violet-900/40 to-violet-800/10";
};

const fmtValor = (v: Veiculo) =>
  v.valor >= 1e6 ? `R$ ${(v.valor / 1e6).toFixed(1)}M` : `R$ ${(v.valor / 1000).toFixed(0)}k`;

const fmtKm = (km: number) => `${km.toLocaleString("pt-BR")} km`;

// ─── FORM MODAL ───────────────────────────────────────────────────────────────
function VeiculoFormModal({ onClose, onSave, initial }: {
  onClose: () => void;
  onSave: (d: any) => void;
  initial?: Partial<Veiculo>;
}) {
  const anoAtual = new Date().getFullYear();
  const [form, setForm] = useState({
    marca: initial?.marca ?? "",
    modelo: initial?.modelo ?? "",
    ano_fabricacao: String(initial?.anoFabricacao ?? anoAtual),
    ano_modelo: String(initial?.anoModelo ?? anoAtual),
    km: String(initial?.km ?? "0"),
    placa: initial?.placa ?? "",
    cor: initial?.cor ?? "",
    combustivel: initial?.combustivel ?? "Flex",
    cambio: initial?.cambio ?? "Manual",
    valor: String(initial?.valor ?? ""),
    status: initial?.status ?? "Disponível",
    vendedor: initial?.vendedor ?? "",
    descricao: initial?.descricao ?? "",
    is_consignado: initial?.isConsignado ?? false,
    consignante_nome: initial?.consignanteNome ?? "",
    consignante_telefone: initial?.consignanteTelefone ?? "",
    comissao_percentual: String(initial?.comissaoPercentual ?? "10"),
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const isEdit = Boolean(initial?.id);

  const handleSave = () => {
    if (!form.marca.trim() || !form.modelo.trim()) { toast.error("Marca e modelo são obrigatórios"); return; }
    onSave({
      ...form,
      ano_fabricacao: Number(form.ano_fabricacao) || null,
      ano_modelo: Number(form.ano_modelo) || null,
      km: Number(form.km) || 0,
      valor: Number(form.valor) || 0,
      comissao_percentual: form.is_consignado ? (Number(form.comissao_percentual) || 0) : null,
      consignante_nome: form.is_consignado ? form.consignante_nome : null,
      consignante_telefone: form.is_consignado ? form.consignante_telefone : null,
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
            <Car className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-black text-[var(--color-text-primary)]">
              {isEdit ? "Editar Veículo" : "Novo Veículo no Estoque"}
            </h3>
            <p className="text-xs text-[var(--color-text-muted)]">
              {isEdit ? "Atualize as informações do veículo" : "Cadastre um novo veículo ao catálogo da concessionária"}
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
            {isEdit ? "Salvar Alterações" : "Cadastrar Veículo"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3.5">
          <div>
            <label className={LABEL}>Marca *</label>
            <input value={form.marca} onChange={e => set("marca", e.target.value)} placeholder="Ex: Honda" className={FIELD} />
          </div>
          <div>
            <label className={LABEL}>Modelo *</label>
            <input value={form.modelo} onChange={e => set("modelo", e.target.value)} placeholder="Ex: Civic EXL" className={FIELD} />
          </div>
          <div>
            <label className={LABEL}>Ano Fabricação</label>
            <input type="number" value={form.ano_fabricacao} onChange={e => set("ano_fabricacao", e.target.value)} className={FIELD} />
          </div>
          <div>
            <label className={LABEL}>Ano Modelo</label>
            <input type="number" value={form.ano_modelo} onChange={e => set("ano_modelo", e.target.value)} className={FIELD} />
          </div>
          <div>
            <label className={LABEL}>KM</label>
            <input type="number" value={form.km} onChange={e => set("km", e.target.value)} placeholder="45000" className={FIELD} />
          </div>
          <div>
            <label className={LABEL}>Placa</label>
            <input value={form.placa} onChange={e => set("placa", e.target.value)} placeholder="ABC-1D23" className={FIELD} />
          </div>
          <div>
            <label className={LABEL}>Cor</label>
            <input value={form.cor} onChange={e => set("cor", e.target.value)} placeholder="Prata" className={FIELD} />
          </div>
          <div>
            <label className={LABEL}>Combustível</label>
            <select value={form.combustivel} onChange={e => set("combustivel", e.target.value)} className={SELECT}>
              {COMBUSTIVEIS.filter(c => c !== "Todos").map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL}>Câmbio</label>
            <select value={form.cambio} onChange={e => set("cambio", e.target.value)} className={SELECT}>
              {CAMBIOS.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL}>Valor de Venda (R$)</label>
            <input type="number" value={form.valor} onChange={e => set("valor", e.target.value)} placeholder="85000" className={FIELD} />
          </div>
          <div>
            <label className={LABEL}>Status</label>
            <select value={form.status} onChange={e => set("status", e.target.value)} className={SELECT}>
              {STATUS_LIST.filter(s => s !== "Todos").map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL}>Vendedor Responsável</label>
            <input value={form.vendedor} onChange={e => set("vendedor", e.target.value)} placeholder="Nome do vendedor" className={FIELD} />
          </div>
          <div className="col-span-2">
            <label className={LABEL}>Descrição & Opcionais</label>
            <textarea value={form.descricao} onChange={e => set("descricao", e.target.value)} rows={3} placeholder="Descrição do veículo, opcionais, estado de conservação..." className={`${FIELD} resize-none`} />
          </div>
        </div>

        <div className="pt-3 border-t border-[var(--color-border-subtle)]">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_consignado}
              onChange={e => setForm(f => ({ ...f, is_consignado: e.target.checked }))}
              className="w-4 h-4 accent-blue-600 rounded"
            />
            <span className="text-xs font-bold text-[var(--color-text-primary)] flex items-center gap-1.5">
              <HandCoins className="w-3.5 h-3.5 text-amber-500" /> Veículo Consignado (de terceiro, venda por comissão)
            </span>
          </label>
          {form.is_consignado && (
            <div className="grid grid-cols-2 gap-3.5 mt-3 p-3.5 bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-xl">
              <div>
                <label className={LABEL}>Nome do Consignante</label>
                <input value={form.consignante_nome} onChange={e => set("consignante_nome", e.target.value)} placeholder="Ex: José da Silva" className={FIELD} />
              </div>
              <div>
                <label className={LABEL}>Telefone do Consignante</label>
                <input value={form.consignante_telefone} onChange={e => set("consignante_telefone", e.target.value)} placeholder="(11) 99999-0000" className={FIELD} />
              </div>
              <div className="col-span-2">
                <label className={LABEL}>Comissão da Concessionária (%)</label>
                <input type="number" min="0" max="100" value={form.comissao_percentual} onChange={e => set("comissao_percentual", e.target.value)} className={FIELD} />
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

type Financiamento = {
  id: string;
  cliente: string;
  valor_entrada: number;
  valor_financiado: number;
  parcelas: number;
  banco_financeira: string | null;
  status: "Em Análise" | "Aprovado" | "Recusado" | "Documentação Pendente";
  veiculo_troca_descricao: string | null;
  created_at: string;
};

const financiamentoStatusColor = (s: string) => {
  if (s === "Aprovado") return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
  if (s === "Recusado") return "bg-red-500/10 text-red-400 border-red-500/20";
  if (s === "Documentação Pendente") return "bg-amber-500/10 text-amber-400 border-amber-500/20";
  return "bg-blue-500/10 text-blue-400 border-blue-500/20"; // Em Análise
};

// ─── DETAIL DRAWER ────────────────────────────────────────────────────────────
function VeiculoDetailDrawer({ v, onClose, onEdit, onDelete, onRepasseRegistrado }: {
  v: Veiculo;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRepasseRegistrado: (id: string) => void;
}) {
  const { activeTenantId } = useAuth();
  const [financiamentos, setFinanciamentos] = useState<Financiamento[]>([]);
  const [showFinanciamentoModal, setShowFinanciamentoModal] = useState(false);
  const [repassando, setRepassando] = useState(false);

  const refetchFinanciamentos = () => {
    if (!supabase || !activeTenantId) return;
    supabase.from("veiculo_financiamentos").select("*").eq("veiculo_id", v.id).eq("tenant_id", activeTenantId).order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) toast.error(`Erro ao carregar financiamentos: ${friendlyError(error)}`);
        else if (data) setFinanciamentos(data as Financiamento[]);
      });
  };

  useEffect(() => { refetchFinanciamentos(); }, [v.id, activeTenantId]);

  const handleSaveFinanciamento = async (data: any) => {
    if (!supabase || !activeTenantId) { toast.error("Não foi possível conectar ao servidor."); return; }
    const { error } = await supabase.from("veiculo_financiamentos").insert({ ...data, veiculo_id: v.id, tenant_id: activeTenantId });
    if (error) { toast.error(`Erro ao registrar financiamento: ${friendlyError(error)}`); return; }
    toast.success("Solicitação de financiamento registrada!");
    refetchFinanciamentos();
  };

  const handleRegistrarRepasse = async () => {
    if (!supabase) return;
    setRepassando(true);
    const { error } = await supabase.rpc("registrar_repasse_consignacao", { p_veiculo_id: v.id });
    setRepassando(false);
    if (error) { toast.error(`Erro ao registrar repasse: ${friendlyError(error)}`); return; }
    toast.success("Repasse registrado no financeiro (Contas a Pagar).");
    onRepasseRegistrado(v.id);
  };

  const handleUpdateFinanciamentoStatus = async (id: string, status: string) => {
    if (!supabase) return;
    const { error } = await supabase.from("veiculo_financiamentos").update({ status }).eq("id", id);
    if (error) { toast.error(`Erro ao atualizar status: ${friendlyError(error)}`); return; }
    setFinanciamentos(prev => prev.map(f => f.id === id ? { ...f, status: status as Financiamento["status"] } : f));
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-md bg-[var(--color-surface)] border-l border-white/10 flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className={`h-36 bg-gradient-to-br ${combustivelGradient(v.combustivel)} flex items-end relative shrink-0`}>
          <div className="absolute top-3 right-3">
            <button onClick={onClose} className="p-1.5 rounded-lg bg-black/30 hover:bg-black/50 text-white"><X className="w-4 h-4" /></button>
          </div>
          <div className="p-5">
            <div className="flex gap-2 mb-2">
              <span className={`text-[10px] font-black px-2.5 py-1 rounded-full border ${statusColor(v.status)}`}>{v.status}</span>
              <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-black/30 text-slate-300">{v.combustivel}</span>
            </div>
            <h2 className="font-black text-white text-sm leading-tight">{v.marca} {v.modelo}</h2>
            <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5"><Calendar className="w-3 h-3" />{v.anoFabricacao}/{v.anoModelo}</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Valor e visitas */}
          <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
            <div>
              <p className="text-2xl font-black text-white">{fmtValor(v)}</p>
              <p className="text-[10px] text-slate-500">à vista</p>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-1.5 justify-end">
                <Eye className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-sm font-bold text-white">{v.visitas}</span>
              </div>
              <p className="text-[10px] text-slate-500">test-drives</p>
            </div>
          </div>

          {/* Características */}
          <div className="px-6 py-4 border-b border-white/5">
            <p className={LABEL}>Características</p>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div className="bg-white/5 rounded-xl p-3 flex items-center gap-2">
                <Gauge className="w-4 h-4 text-slate-500" />
                <div>
                  <p className="text-[9px] text-slate-500">KM</p>
                  <p className="text-sm font-bold text-white">{fmtKm(v.km)}</p>
                </div>
              </div>
              <div className="bg-white/5 rounded-xl p-3 flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-slate-500" />
                <div>
                  <p className="text-[9px] text-slate-500">Câmbio</p>
                  <p className="text-sm font-bold text-white">{v.cambio}</p>
                </div>
              </div>
              <div className="bg-white/5 rounded-xl p-3 flex items-center gap-2">
                <Fuel className="w-4 h-4 text-slate-500" />
                <div>
                  <p className="text-[9px] text-slate-500">Combustível</p>
                  <p className="text-sm font-bold text-white">{v.combustivel}</p>
                </div>
              </div>
              {v.cor && (
                <div className="bg-white/5 rounded-xl p-3 flex items-center gap-2">
                  <Palette className="w-4 h-4 text-slate-500" />
                  <div>
                    <p className="text-[9px] text-slate-500">Cor</p>
                    <p className="text-sm font-bold text-white">{v.cor}</p>
                  </div>
                </div>
              )}
            </div>
            {v.placa && <p className="text-[10px] text-slate-500 mt-2">Placa: <span className="text-slate-300 font-bold">{v.placa}</span></p>}
          </div>

          {/* Vendedor */}
          <div className="px-6 py-4 border-b border-white/5">
            <p className={LABEL}>Vendedor Responsável</p>
            <div className="flex items-center gap-3 mt-2 p-3 bg-white/5 rounded-xl">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white font-black text-xs shrink-0">
                {v.vendedor.split(" ").map(n => n[0]).join("").slice(0, 2)}
              </div>
              <div>
                <p className="text-sm font-bold text-white">{v.vendedor}</p>
                <p className="text-[10px] text-slate-500">Vendedor responsável</p>
              </div>
            </div>
          </div>

          {/* Descrição */}
          {v.descricao && (
            <div className="px-6 py-4 border-b border-white/5">
              <p className={LABEL}>Descrição</p>
              <p className="text-sm text-slate-300 leading-relaxed mt-2">{v.descricao}</p>
            </div>
          )}

          {/* Financiamento */}
          <div className="px-6 py-4">
            <div className="flex items-center justify-between mb-2">
              <p className={LABEL}>Financiamento & Troca</p>
              <button
                onClick={() => setShowFinanciamentoModal(true)}
                className="text-[10px] font-black uppercase text-blue-400 hover:text-blue-300 flex items-center gap-1"
              >
                <Landmark className="w-3 h-3" /> Solicitar
              </button>
            </div>
            {financiamentos.length === 0 ? (
              <p className="text-xs text-slate-500">Nenhuma solicitação de financiamento para este veículo ainda.</p>
            ) : (
              <div className="space-y-2 mt-2">
                {financiamentos.map(f => (
                  <div key={f.id} className="p-3 bg-white/5 rounded-xl">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-bold text-white">{f.cliente}</span>
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${financiamentoStatusColor(f.status)}`}>{f.status}</span>
                    </div>
                    <div className="text-[10px] text-slate-500 flex flex-wrap gap-x-3">
                      <span>Entrada: R$ {f.valor_entrada.toLocaleString("pt-BR")}</span>
                      <span>Financiado: R$ {f.valor_financiado.toLocaleString("pt-BR")} em {f.parcelas}x</span>
                      {f.banco_financeira && <span>{f.banco_financeira}</span>}
                    </div>
                    {f.veiculo_troca_descricao && (
                      <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-1">
                        <ArrowRightLeft className="w-2.5 h-2.5" /> Troca: {f.veiculo_troca_descricao}
                      </div>
                    )}
                    {f.status === "Em Análise" && (
                      <div className="flex gap-1.5 mt-2">
                        <button onClick={() => handleUpdateFinanciamentoStatus(f.id, "Aprovado")} className="px-2 py-0.5 text-[9px] font-extrabold uppercase bg-emerald-500/10 text-emerald-400 rounded hover:bg-emerald-500/20">Aprovar</button>
                        <button onClick={() => handleUpdateFinanciamentoStatus(f.id, "Recusado")} className="px-2 py-0.5 text-[9px] font-extrabold uppercase bg-red-500/10 text-red-400 rounded hover:bg-red-500/20">Recusar</button>
                        <button onClick={() => handleUpdateFinanciamentoStatus(f.id, "Documentação Pendente")} className="px-2 py-0.5 text-[9px] font-extrabold uppercase bg-amber-500/10 text-amber-400 rounded hover:bg-amber-500/20">Doc. Pendente</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Consignação */}
          {v.isConsignado && (
            <div className="px-6 py-4 border-t border-white/5">
              <p className={LABEL}>Consignação</p>
              <div className="mt-2 p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl space-y-1.5">
                <div className="flex items-center gap-2 text-sm font-bold text-white">
                  <HandCoins className="w-4 h-4 text-amber-400" /> {v.consignanteNome || "Consignante não identificado"}
                </div>
                <div className="text-[10px] text-slate-500 flex flex-wrap gap-x-3">
                  {v.consignanteTelefone && <span>{v.consignanteTelefone}</span>}
                  <span>Comissão da loja: {v.comissaoPercentual ?? 0}%</span>
                  <span>Repasse ao consignante: R$ {(v.valor * (1 - (v.comissaoPercentual ?? 0) / 100)).toLocaleString("pt-BR")}</span>
                </div>
                {v.repasseRealizado ? (
                  <div className="flex items-center gap-1.5 text-[10px] font-black text-emerald-400 uppercase mt-1">
                    <Banknote className="w-3 h-3" /> Repasse já registrado no financeiro
                  </div>
                ) : v.status === "Vendido" ? (
                  <button
                    onClick={handleRegistrarRepasse}
                    disabled={repassando}
                    className="mt-1.5 px-3 py-1.5 text-[10px] font-extrabold uppercase bg-amber-500/10 text-amber-400 rounded-lg hover:bg-amber-500/20 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <Banknote className="w-3 h-3" /> {repassando ? "Registrando..." : "Registrar Repasse ao Consignante"}
                  </button>
                ) : (
                  <p className="text-[10px] text-slate-600 mt-1">Repasse fica disponível após o veículo ser marcado como Vendido.</p>
                )}
              </div>
            </div>
          )}
        </div>

        {showFinanciamentoModal && (
          <VeiculoFinanciamentoModal
            veiculoValor={v.valor}
            veiculoNome={`${v.marca} ${v.modelo}`}
            onClose={() => setShowFinanciamentoModal(false)}
            onSave={handleSaveFinanciamento}
          />
        )}

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
function rowToVeiculo(r: any): Veiculo {
  return {
    id: r.id, marca: r.marca, modelo: r.modelo,
    anoFabricacao: r.ano_fabricacao, anoModelo: r.ano_modelo, km: Number(r.km ?? 0),
    placa: r.placa ?? "", cor: r.cor ?? "", combustivel: r.combustivel, cambio: r.cambio,
    valor: Number(r.valor), status: r.status, vendedor: r.vendedor ?? "",
    visitas: r.visitas ?? 0, descricao: r.descricao ?? "", created_at: r.created_at,
    isConsignado: r.is_consignado ?? false, consignanteNome: r.consignante_nome ?? "",
    consignanteTelefone: r.consignante_telefone ?? "", comissaoPercentual: r.comissao_percentual ?? null,
    repasseRealizado: r.repasse_realizado ?? false,
  };
}

export default function Veiculos() {
  // Supabase (imobiliario_veiculos) é a única fonte — sem cache local nem
  // gravação otimista silenciosa: erro de escrita aparece pro usuário.
  const { activeTenantId } = useAuth();
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [combustivelFilter, setCombustivelFilter] = useState("Todos");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [marcaFilter, setMarcaFilter] = useState("");
  const [cambioFilter, setCambioFilter] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showForm, setShowForm] = useState(false);
  const [editVeiculo, setEditVeiculo] = useState<Veiculo | null>(null);
  const [selectedVeiculo, setSelectedVeiculo] = useState<Veiculo | null>(null);

  const refetch = () => {
    if (!supabase || !activeTenantId) { setLoading(false); return; }
    supabase.from("imobiliario_veiculos").select("*").eq("tenant_id", activeTenantId).order("created_at", { ascending: false }).then(({ data, error }) => {
      if (error) toast.error(`Erro ao carregar veículos: ${friendlyError(error)}`);
      else if (data) setVeiculos(data.map(rowToVeiculo));
      setLoading(false);
    });
  };

  useEffect(() => { refetch(); }, [activeTenantId]);

  const filtered = veiculos.filter(v => {
    const q = search.toLowerCase();
    return (
      (v.marca.toLowerCase().includes(q) || v.modelo.toLowerCase().includes(q) || v.vendedor.toLowerCase().includes(q) || v.placa.toLowerCase().includes(q)) &&
      (combustivelFilter === "Todos" || v.combustivel === combustivelFilter) &&
      (statusFilter === "Todos" || v.status === statusFilter) &&
      (!marcaFilter || v.marca === marcaFilter) &&
      (!cambioFilter || v.cambio === cambioFilter)
    );
  });

  const marcasList = Array.from(new Set(veiculos.map(v => v.marca).filter(Boolean))).sort();

  const handleSave = async (form: any) => {
    if (!supabase || !activeTenantId) { toast.error("Não foi possível conectar ao servidor."); return; }
    const { data, error } = await supabase.from("imobiliario_veiculos").insert({ ...form, visitas: 0, tenant_id: activeTenantId }).select().maybeSingle();
    if (error) { toast.error(`Erro ao cadastrar veículo: ${friendlyError(error)}`); return; }
    if (data) setVeiculos(prev => [rowToVeiculo(data), ...prev]);
    toast.success("Veículo cadastrado com sucesso!");
  };

  const handleEdit = async (form: any) => {
    if (!editVeiculo) return;
    if (!supabase) { toast.error("Não foi possível conectar ao servidor."); return; }
    const { error } = await supabase.from("imobiliario_veiculos").update(form).eq("id", editVeiculo.id);
    if (error) { toast.error(`Erro ao atualizar veículo: ${friendlyError(error)}`); return; }
    const updated = rowToVeiculo({ ...form, id: editVeiculo.id, visitas: editVeiculo.visitas, created_at: editVeiculo.created_at });
    setVeiculos(prev => prev.map(v => v.id === editVeiculo.id ? updated : v));
    if (selectedVeiculo?.id === editVeiculo.id) setSelectedVeiculo(updated);
    toast.success("Veículo atualizado com sucesso!");
    setEditVeiculo(null);
  };

  const handleDelete = async (id: string) => {
    const alvo = veiculos.find(v => v.id === id);
    if (!(await confirmDialog({
      title: "Excluir veículo",
      description: `Excluir ${alvo ? `${alvo.marca} ${alvo.modelo}` : "este veículo"}? Essa ação não pode ser desfeita.`,
    }))) return;
    if (!supabase) { toast.error("Não foi possível conectar ao servidor."); return; }
    const { error } = await supabase.from("imobiliario_veiculos").delete().eq("id", id);
    if (error) { toast.error(`Erro ao remover veículo: ${friendlyError(error)}`); return; }
    setVeiculos(prev => prev.filter(v => v.id !== id));
    toast.success("Veículo removido.");
  };

  const disponiveis = filtered.filter(v => v.status === "Disponível").length;
  const vendidos = filtered.filter(v => v.status === "Vendido").length;
  const valorTotal = filtered.filter(v => v.status === "Disponível").reduce((s, v) => s + v.valor, 0);
  const totalVisitas = filtered.reduce((s, v) => s + v.visitas, 0);

  return (
    <PageContainer
      title="Veículos"
      description="Gerencie o estoque completo de veículos disponíveis, reservados e vendidos."
      actions={
        <div className="flex items-center gap-2">
          <Link
            to="/app/crm/pipeline?nicho=automotivo"
            className="h-9 px-3.5 text-xs font-bold gap-1.5 inline-flex items-center rounded-xl bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] hover:border-[var(--color-primary-blue)] text-[var(--color-text-primary)] transition-all"
          >
            <Columns3 className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" /> Ver Pipeline CRM
          </Link>
          <Button onClick={() => setShowForm(true)} className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs">
            <Plus className="w-3.5 h-3.5" /> Novo Veículo
          </Button>
        </div>
      }
    >
      {showForm && <VeiculoFormModal onClose={() => setShowForm(false)} onSave={handleSave} />}
      {editVeiculo && <VeiculoFormModal onClose={() => setEditVeiculo(null)} onSave={handleEdit} initial={editVeiculo} />}
      {selectedVeiculo && (
        <VeiculoDetailDrawer
          v={selectedVeiculo}
          onClose={() => setSelectedVeiculo(null)}
          onEdit={() => { setEditVeiculo(selectedVeiculo); setSelectedVeiculo(null); }}
          onDelete={() => handleDelete(selectedVeiculo.id)}
          onRepasseRegistrado={(id) => {
            setVeiculos(prev => prev.map(v => v.id === id ? { ...v, repasseRealizado: true } : v));
            setSelectedVeiculo(prev => prev && prev.id === id ? { ...prev, repasseRealizado: true } : prev);
          }}
        />
      )}

      <KpiFilterCard
        id="imobVeiculos"
        kpis={[
          { label: "Disponíveis", value: disponiveis, icon: Package, tone: "primary" },
          { label: "Vendidos", value: vendidos, icon: TrendingUp, tone: "success" },
          { label: "Estoque (R$)", value: `R$ ${(valorTotal / 1e6).toFixed(1)}M`, icon: DollarSign, tone: "warning" },
          { label: "Total Test-Drives", value: totalVisitas, icon: Eye, tone: "info" },
        ]}
        activeCount={(search.trim() ? 1 : 0) + (combustivelFilter !== "Todos" ? 1 : 0) + (statusFilter !== "Todos" ? 1 : 0) + (marcaFilter ? 1 : 0) + (cambioFilter ? 1 : 0)}
        onClear={() => { setSearch(""); setCombustivelFilter("Todos"); setStatusFilter("Todos"); setMarcaFilter(""); setCambioFilter(""); }}
      >
        <FilterBar>
          <FilterSearch value={search} onChange={setSearch} placeholder="Buscar marca, modelo, vendedor, placa..." />
          <FilterSelect icon={Car} value={marcaFilter} onChange={setMarcaFilter} options={marcasList} allLabel="Todas as marcas" />
          <FilterSelect icon={Fuel} value={combustivelFilter} onChange={setCombustivelFilter} allValue="Todos" allLabel="Todos os combustíveis" options={COMBUSTIVEIS.slice(1)} />
          <FilterSelect icon={Settings2} value={cambioFilter} onChange={setCambioFilter} allLabel="Todos os câmbios" options={CAMBIOS} />
          <FilterSelect icon={Package} value={statusFilter} onChange={setStatusFilter} allValue="Todos" allLabel="Todos os status" options={STATUS_LIST.slice(1)} />
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
      <p className="text-[10px] text-slate-600 font-bold mb-4">{filtered.length} veículo(s) encontrado(s)</p>

      {/* Grid View */}
      {viewMode === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(v => (
            <div
              key={v.id}
              onClick={() => setSelectedVeiculo(v)}
              className="bg-[var(--color-surface-elevated)]/80 border border-white/5 rounded-2xl overflow-hidden hover:border-blue-500/20 transition-all cursor-pointer group shadow-lg"
            >
              <div className={`h-40 bg-gradient-to-br ${combustivelGradient(v.combustivel)} flex items-center justify-center relative`}>
                <Car className="w-12 h-12 text-white/10" />
                <div className="absolute top-3 left-3 flex gap-1.5">
                  <span className={`text-[9px] font-black px-2.5 py-1 rounded-full border ${statusColor(v.status)}`}>{v.status}</span>
                  {v.isConsignado && <span className="text-[9px] font-black px-2.5 py-1 rounded-full border bg-amber-500/10 text-amber-400 border-amber-500/20">Consignado</span>}
                </div>
                <div className="absolute top-3 right-3 flex gap-1.5">
                  <span className="text-[9px] font-black px-2 py-1 rounded-full bg-black/40 text-slate-300">{v.combustivel}</span>
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[var(--color-surface-elevated)] to-transparent" />
                <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-4 text-slate-500 text-[10px]" onClick={e => e.stopPropagation()}>
                  <button onClick={() => setEditVeiculo(v)} className="p-1.5 rounded-lg bg-black/30 hover:bg-black/60 text-white transition-all opacity-0 group-hover:opacity-100">
                    <Edit2 className="w-3 h-3" />
                  </button>
                  <button onClick={() => handleDelete(v.id)} className="p-1.5 rounded-lg bg-black/30 hover:bg-red-500/20 text-red-400 transition-all opacity-0 group-hover:opacity-100">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
              <div className="p-4">
                <p className="font-black text-white text-sm leading-snug">{v.marca} {v.modelo}</p>
                <p className="text-[10px] text-slate-500 flex items-center gap-1 mt-1"><Calendar className="w-3 h-3" />{v.anoFabricacao}/{v.anoModelo}</p>
                <div className="flex items-center gap-3 text-[10px] text-slate-500 mt-2">
                  <span className="flex items-center gap-1"><Gauge className="w-3 h-3" />{fmtKm(v.km)}</span>
                  <span className="flex items-center gap-1"><Settings2 className="w-3 h-3" />{v.cambio}</span>
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
                  <p className="font-black text-white text-sm">{fmtValor(v)}</p>
                  <span className="text-[9px] text-slate-500 flex items-center gap-1"><Eye className="w-3 h-3" />{v.visitas} test-drives</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* List View */
        <div className="space-y-2">
          {filtered.map(v => (
            <div
              key={v.id}
              onClick={() => setSelectedVeiculo(v)}
              className="flex items-center gap-4 p-4 bg-[var(--color-surface-elevated)]/80 border border-white/5 rounded-xl hover:border-blue-500/20 transition-all cursor-pointer group"
            >
              <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${combustivelGradient(v.combustivel)} flex items-center justify-center shrink-0`}>
                <Car className="w-6 h-6 text-white/30" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-white text-sm">{v.marca} {v.modelo}</p>
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${statusColor(v.status)}`}>{v.status}</span>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-slate-500 mt-1">
                  <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{v.anoFabricacao}/{v.anoModelo}</span>
                  <span className="flex items-center gap-1"><Gauge className="w-3 h-3" />{fmtKm(v.km)}</span>
                  <span>Vendedor: <span className="text-slate-300 font-bold">{v.vendedor}</span></span>
                </div>
              </div>
              <div className="text-right shrink-0 mr-2">
                <p className="font-black text-white text-sm">{fmtValor(v)}</p>
                <p className="text-[9px] text-slate-500 flex items-center gap-1 justify-end"><Eye className="w-3 h-3" />{v.visitas} test-drives</p>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                <button onClick={() => setEditVeiculo(v)} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all">
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => handleDelete(v.id)} className="p-2 rounded-lg bg-white/5 hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-all">
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
          <Car className="w-12 h-12 mx-auto mb-3 opacity-20 animate-pulse" />
          <p className="font-bold">Carregando veículos...</p>
        </div>
      ) : filtered.length === 0 && (
        <div className="text-center py-20 text-slate-500">
          <Car className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="font-bold">Nenhum veículo encontrado</p>
          <p className="text-sm mt-1">Ajuste os filtros ou cadastre um novo veículo.</p>
        </div>
      )}
    </PageContainer>
  );
}
