import { useState, useEffect, useMemo } from "react";
import { PageContainer } from "../../components/PageContainer";
import { Button } from "../../components/ui/button";
import {
  Building2, Plus, Search, MapPin, Globe, Phone, Mail,
  TrendingUp, Users, DollarSign, Trash2, ExternalLink,
} from "lucide-react";
import { Card } from "../../components/ui/card";
import { toast } from "sonner";
import { supabase } from "../../lib/supabase";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { useAuth } from "../../contexts/AuthContext";
import { friendlyError } from "../../lib/friendlyError";
import { useIbgeLocalidades } from "../../lib/ibgeLocalidades";
import { useData } from "../../contexts/DataContext";

export default function Empresas() {
  const { activeTenantId } = useAuth();
  const { deleteClienteBase } = useData();
  const [empresas, setEmpresas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [novaEmpresa, setNovaEmpresa] = useState({
    nome: "",
    documento: "",
    industry: "Tecnologia",
    // Sem cidade/estado fixo — nem todo tenant fica em São Paulo.
    cidade: "",
    estado: "",
    email: "",
    phone: "",
  });
  const { estados, municipios, loadingMunicipios } = useIbgeLocalidades(novaEmpresa.estado);

  const fetchEmpresas = async () => {
    setLoading(true);
    if (!supabase || !activeTenantId) {
      setLoading(false);
      return;
    }
    // Sem o filtro de tenant, contas de parceiro (has_tenant_access verdadeiro
    // pra vários tenants) recebiam via RLS linhas de todos os tenants acessíveis.
    const { data, error } = await supabase
      .from("clientes")
      .select("*")
      .eq("tenant_id", activeTenantId)
      .order("name", { ascending: true });

    if (error) {
      toast.error(`Erro ao carregar empresas: ${friendlyError(error)}`);
    } else if (data) {
      setEmpresas(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchEmpresas();
  }, [activeTenantId]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return empresas.filter(e =>
      (e.name ?? "").toLowerCase().includes(q) ||
      (e.industry ?? "").toLowerCase().includes(q) ||
      (e.city ?? "").toLowerCase().includes(q) ||
      (e.documento ?? "").toLowerCase().includes(q)
    );
  }, [empresas, search]);

  const handleSave = async () => {
    if (!novaEmpresa.nome.trim()) {
      toast.error("Nome da empresa é obrigatório.");
      return;
    }
    if (!supabase) return;
    if (!activeTenantId) { toast.error("Tenant não identificado."); return; }

    const { data, error } = await supabase.from("clientes").insert({
      name: novaEmpresa.nome,
      industry: novaEmpresa.industry,
      city: novaEmpresa.cidade,
      state: novaEmpresa.estado.toUpperCase(),
      email: novaEmpresa.email || "contato@empresa.com",
      phone: novaEmpresa.phone || "",
      documento: novaEmpresa.documento || null,
      status: "Ativo",
      tenant_id: activeTenantId,
    }).select().maybeSingle();

    if (error) {
      toast.error(`Erro ao salvar empresa: ${friendlyError(error)}`);
      return;
    }

    toast.success("Empresa cadastrada com sucesso!");
    setShowModal(false);
    setNovaEmpresa({ nome: "", documento: "", industry: "Tecnologia", cidade: "", estado: "", email: "", phone: "" });
    fetchEmpresas();
  };

  const handleDelete = async (id: string, name: string) => {
    if (!(await confirmDialog({
      title: "Excluir Empresa",
      description: `Tem certeza que deseja remover ${name}?`,
    }))) return;

    const ok = await deleteClienteBase(id);
    if (!ok) return;
    toast.success("Empresa removida com sucesso!");
    setEmpresas(prev => prev.filter(e => e.id !== id));
  };

  return (
    <PageContainer
      title="Empresas & Contas B2B"
      description="Diretório corporativo de contas comerciais, filiais e parceiros estratégicos."
      actions={
        <Button onClick={() => setShowModal(true)} className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs">
          <Plus className="w-3.5 h-3.5" /> Nova Empresa
        </Button>
      }
    >
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { icon: Building2, label: "Total de Empresas", val: empresas.length, color: "text-blue-500" },
          { icon: Users, label: "Empresas Ativas", val: empresas.filter(e => e.status === "Ativo").length, color: "text-emerald-500" },
          { icon: MapPin, label: "Cidades Atendidas", val: new Set(empresas.map(e => e.city).filter(Boolean)).size, color: "text-amber-500" },
          { icon: TrendingUp, label: "Segmentos Ativos", val: new Set(empresas.map(e => e.industry).filter(Boolean)).size, color: "text-indigo-500" },
        ].map((k, i) => (
          <Card key={i} className="p-4 bg-[var(--color-surface-elevated)]/40 border border-[var(--color-border-subtle)]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">{k.label}</span>
              <k.icon className={`w-4 h-4 ${k.color}`} />
            </div>
            <p className="text-xl font-black text-[var(--color-text-primary)]">{k.val}</p>
          </Card>
        ))}
      </div>

      {/* Search Bar */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
          <input
            type="text"
            placeholder="Buscar por razão social, CNPJ, segmento ou cidade..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl pl-10 pr-4 py-2 text-xs text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary-blue)]"
          />
        </div>
      </div>

      {/* Grid of Companies */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(emp => (
          <div
            key={emp.id}
            className="p-5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border-default)] hover:border-[var(--color-primary-blue)]/50 transition-all flex flex-col justify-between group shadow-2xs"
          >
            <div>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-500 font-black flex items-center justify-center text-sm shrink-0">
                  <Building2 className="w-5 h-5" />
                </div>
                <button
                  onClick={() => handleDelete(emp.id, emp.name)}
                  className="p-1.5 rounded-lg bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] opacity-0 group-hover:opacity-100 hover:bg-rose-500/10 hover:border-rose-500/25 text-[var(--color-text-muted)] hover:text-rose-500 transition-all"
                  title="Excluir Empresa"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <h4 className="text-sm font-bold text-[var(--color-text-primary)] mb-1 leading-snug truncate">
                {emp.name}
              </h4>
              <p className="text-[11px] font-bold text-[var(--color-primary-blue)] mb-3">
                {emp.industry || "Geral"}
              </p>

              <div className="space-y-1.5 text-xs text-[var(--color-text-muted)]">
                <div className="flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{emp.city ? `${emp.city} - ${emp.state || 'UF'}` : "Local não especificado"}</span>
                </div>
                {emp.documento && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)]">
                      {emp.documento}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-4 mt-4 border-t border-[var(--color-border-subtle)] flex items-center justify-between">
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                emp.status === "Ativo"
                  ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                  : "bg-amber-500/10 text-amber-500 border-amber-500/20"
              }`}>
                {emp.status || "Ativo"}
              </span>

              {emp.phone && (
                <a
                  href={`https://wa.me/55${emp.phone.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-bold text-[var(--color-primary-blue)] hover:underline flex items-center gap-1"
                >
                  Contato <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="py-16 text-center text-[var(--color-text-muted)]">
          <Building2 className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="font-bold">Nenhuma empresa encontrada.</p>
          <p className="text-xs mt-0.5">Cadastre uma nova conta B2B para iniciar o acompanhamento.</p>
        </div>
      )}

      {/* Modal Nova Empresa */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-[var(--color-text-primary)]">Nova Conta / Empresa B2B</h3>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold uppercase text-[var(--color-text-muted)] block mb-1">Razão Social / Nome Fantasia</label>
                <input
                  value={novaEmpresa.nome}
                  onChange={e => setNovaEmpresa({ ...novaEmpresa, nome: e.target.value })}
                  placeholder="Ex: Prime Empreendimentos SA"
                  className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl px-3 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase text-[var(--color-text-muted)] block mb-1">CNPJ / Documento</label>
                  <input
                    value={novaEmpresa.documento}
                    onChange={e => setNovaEmpresa({ ...novaEmpresa, documento: e.target.value })}
                    placeholder="00.000.000/0001-00"
                    className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl px-3 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-[var(--color-text-muted)] block mb-1">Segmento</label>
                  <input
                    value={novaEmpresa.industry}
                    onChange={e => setNovaEmpresa({ ...novaEmpresa, industry: e.target.value })}
                    placeholder="Ex: Imobiliário / Tech"
                    className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl px-3 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] font-bold uppercase text-[var(--color-text-muted)] block mb-1">UF</label>
                  <select
                    value={novaEmpresa.estado}
                    onChange={e => setNovaEmpresa({ ...novaEmpresa, estado: e.target.value, cidade: "" })}
                    className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl px-3 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)] uppercase"
                  >
                    <option value="">...</option>
                    {estados.map((uf) => <option key={uf.sigla} value={uf.sigla}>{uf.sigla}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] font-bold uppercase text-[var(--color-text-muted)] block mb-1">Cidade</label>
                  {novaEmpresa.estado && municipios.length > 0 ? (
                    <select
                      value={novaEmpresa.cidade}
                      onChange={e => setNovaEmpresa({ ...novaEmpresa, cidade: e.target.value })}
                      className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl px-3 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
                    >
                      <option value="">{loadingMunicipios ? "Carregando..." : "Selecione..."}</option>
                      {municipios.map((m) => <option key={m.id} value={m.nome}>{m.nome}</option>)}
                    </select>
                  ) : (
                    <input
                      value={novaEmpresa.cidade}
                      onChange={e => setNovaEmpresa({ ...novaEmpresa, cidade: e.target.value })}
                      placeholder={novaEmpresa.estado ? "Digite a cidade" : "Escolha o estado primeiro"}
                      className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl px-3 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
                    />
                  )}
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase text-[var(--color-text-muted)] block mb-1">Telefone Principal</label>
                <input
                  value={novaEmpresa.phone}
                  onChange={e => setNovaEmpresa({ ...novaEmpresa, phone: e.target.value })}
                  placeholder="(11) 3333-4444"
                  className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl px-3 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-[var(--color-border-subtle)]">
              <Button variant="ghost" onClick={() => setShowModal(false)} className="text-xs">Cancelar</Button>
              <Button onClick={handleSave} className="text-xs font-bold">Salvar Empresa</Button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
