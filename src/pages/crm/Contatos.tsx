import { useState, useEffect, useMemo } from "react";
import { PageContainer } from "../../components/PageContainer";
import { Button } from "../../components/ui/button";
import {
  Users, Plus, Mail, Phone, Building2, Briefcase,
  MessageSquare, Calendar, Trash2, Edit2, ShieldCheck, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../../lib/supabase";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { useAuth } from "../../contexts/AuthContext";
import { friendlyError } from "../../lib/friendlyError";
import { normalizeText } from "../../lib/utils";
import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect, FilterChips } from "../../components/ui/kpi-filter-card";

type Contato = {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  cargo: string;
  empresa: string;
  departamento?: string;
  isDecisor: boolean;
  created_at?: string;
};

type ClienteOption = { id: string; name: string };

const PAGE_SIZE = 50;

export default function Contatos() {
  const { user, activeTenantId } = useAuth();
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [clientes, setClientes] = useState<ClienteOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [cargoFilter, setCargoFilter] = useState("Todos");
  const [empresaFilter, setEmpresaFilter] = useState("");
  const [decisorFilter, setDecisorFilter] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [showModal, setShowModal] = useState(false);
  const [novoContato, setNovoContato] = useState({
    nome: "", email: "", telefone: "", cargo: "", clienteId: "", isDecisor: false,
  });

  const fetchContatos = async () => {
    setLoading(true);
    if (!supabase || !activeTenantId) {
      setLoading(false);
      return;
    }
    // Mesmo motivo do fetchClientes logo abaixo: sem o filtro de tenant,
    // contas de parceiro (has_tenant_access verdadeiro pra vários tenants)
    // recebiam via RLS contatos de todos os tenants acessíveis, não só o
    // ativo na tela. E pagina com .range() — select() sem limite corta
    // silenciosamente em 1000 linhas no PostgREST.
    let all: any[] = [];
    let from = 0;
    const step = 1000;
    let fetchError: any = null;
    while (true) {
      const { data: page, error } = await supabase
        .from("cliente_contatos")
        .select("id, nome, email, telefone, cargo, principal, created_at, clientes(name)")
        .eq("tenant_id", activeTenantId)
        .order("created_at", { ascending: false })
        .range(from, from + step - 1);
      if (error) { fetchError = error; break; }
      if (!page || page.length === 0) break;
      all = all.concat(page);
      if (page.length < step) break;
      from += step;
    }
    const data = all;
    const error = fetchError;

    if (error) {
      console.warn("cliente_contatos fetch notice:", error.message);
    } else if (data) {
      setContatos(data.map((c: any) => ({
        id: c.id,
        nome: c.nome,
        email: c.email || "",
        telefone: c.telefone || "",
        cargo: c.cargo || "Contato",
        empresa: c.clientes?.name || "Empresa Direta",
        isDecisor: !!c.principal,
        created_at: c.created_at,
      })));
    }
    setLoading(false);
  };

  const fetchClientes = async () => {
    if (!supabase || !activeTenantId) return;
    // Sem o filtro de tenant, contas de parceiro (has_tenant_access verdadeiro
    // pra vários tenants) recebiam via RLS clientes de todos os tenants acessíveis.
    const { data, error } = await supabase.from("clientes").select("id, name").eq("tenant_id", activeTenantId).order("name");
    if (error) {
      console.warn("clientes fetch notice:", error.message);
    } else if (data) {
      setClientes(data as ClienteOption[]);
    }
  };

  useEffect(() => {
    fetchContatos();
    fetchClientes();
  }, [activeTenantId]);

  const filtered = useMemo(() => {
    const q = normalizeText(search);
    return contatos.filter((c) => {
      const matchQ =
        normalizeText(c.nome).includes(q) ||
        normalizeText(c.email).includes(q) ||
        normalizeText(c.telefone).includes(q) ||
        normalizeText(c.empresa).includes(q);
      const matchCargo = cargoFilter === "Todos" || c.cargo === cargoFilter;
      const matchEmpresa = !empresaFilter || c.empresa === empresaFilter;
      const matchDecisor = !decisorFilter || (decisorFilter === "decisor" ? c.isDecisor : !c.isDecisor);
      return matchQ && matchCargo && matchEmpresa && matchDecisor;
    });
  }, [contatos, search, cargoFilter, empresaFilter, decisorFilter]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search, cargoFilter, empresaFilter, decisorFilter]);

  const cargosList = useMemo(() => Array.from(new Set(contatos.map(c => c.cargo).filter(Boolean))).sort(), [contatos]);
  const empresasList = useMemo(() => Array.from(new Set(contatos.map(c => c.empresa).filter(Boolean))).sort(), [contatos]);
  const activeCount = (search ? 1 : 0) + (cargoFilter !== "Todos" ? 1 : 0) + (empresaFilter ? 1 : 0) + (decisorFilter ? 1 : 0);
  const clearFilters = () => { setSearch(""); setCargoFilter("Todos"); setEmpresaFilter(""); setDecisorFilter(""); };

  const paged = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);

  const handleSaveContato = async () => {
    if (!novoContato.nome.trim()) {
      toast.error("Nome do contato é obrigatório.");
      return;
    }
    if (!novoContato.clienteId) {
      toast.error("Selecione a empresa/cliente vinculada ao contato.");
      return;
    }
    if (!supabase) {
      toast.error("Supabase não disponível.");
      return;
    }

    const { data, error } = await supabase.from("cliente_contatos").insert({
      cliente_id: novoContato.clienteId,
      nome: novoContato.nome,
      email: novoContato.email,
      telefone: novoContato.telefone,
      cargo: novoContato.cargo || "Contato Comercial",
      principal: novoContato.isDecisor,
    }).select().maybeSingle();

    if (error) {
      toast.error(`Erro ao cadastrar contato: ${friendlyError(error)}`);
      return;
    }

    toast.success("Contato cadastrado com sucesso!");
    setShowModal(false);
    setNovoContato({ nome: "", email: "", telefone: "", cargo: "", clienteId: "", isDecisor: false });
    fetchContatos();
  };

  const handleDelete = async (id: string, nome: string) => {
    if (!(await confirmDialog({
      title: "Excluir Contato",
      description: `Tem certeza que deseja remover ${nome}?`,
    }))) return;

    if (!supabase) return;
    const { error } = await supabase.from("cliente_contatos").delete().eq("id", id);
    if (error) {
      toast.error(`Erro ao excluir: ${friendlyError(error)}`);
      return;
    }
    toast.success("Contato removido!");
    setContatos(prev => prev.filter(c => c.id !== id));
  };

  return (
    <PageContainer
      title="Contatos Comerciais"
      description="Diretório unificado de tomadores de decisão, influenciadores e interlocutores comerciais."
      actions={
        <Button onClick={() => setShowModal(true)} className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs">
          <Plus className="w-3.5 h-3.5" /> Novo Contato
        </Button>
      }
    >
      <KpiFilterCard
        id="crmContatos"
        activeCount={activeCount}
        onClear={clearFilters}
        kpis={[
          { label: "Contatos", value: filtered.length, icon: Users, tone: "primary" },
          { label: "Decisores / C-Level", value: filtered.filter(c => c.isDecisor).length, icon: ShieldCheck, tone: "accent" },
          { label: "Com WhatsApp", value: filtered.filter(c => !!c.telefone).length, icon: Phone, tone: "success" },
          { label: "Com E-mail", value: filtered.filter(c => !!c.email).length, icon: Mail, tone: "info" },
        ]}
      >
        <FilterBar>
          <FilterSearch value={search} onChange={setSearch} placeholder="Buscar por nome, e-mail, telefone ou empresa..." />
          <FilterSelect icon={Building2} value={empresaFilter} onChange={setEmpresaFilter} options={empresasList} allLabel="Todas as empresas" />
          <FilterSelect icon={Briefcase} value={cargoFilter} onChange={setCargoFilter} options={cargosList} allLabel="Todos os cargos" allValue="Todos" />
          <FilterChips value={decisorFilter} onChange={setDecisorFilter} allLabel="Todos" options={[{ value: "decisor", label: "Decisores" }, { value: "outros", label: "Outros" }]} />
        </FilterBar>
      </KpiFilterCard>

      {/* Contacts Table */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)]/60 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                <th className="px-5 py-3">Contato</th>
                <th className="px-4 py-3">Cargo / Perfil</th>
                <th className="px-4 py-3">Empresa</th>
                <th className="px-4 py-3">Canais de Contato</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-subtle)]">
              {paged.map((c) => (
                <tr key={c.id} className="hover:bg-[var(--color-surface-sunken)]/40 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[var(--color-primary-blue)]/10 border border-[var(--color-primary-blue)]/20 text-[var(--color-primary-blue)] font-bold flex items-center justify-center text-xs shrink-0">
                        {c.nome.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-bold text-[var(--color-text-primary)] flex items-center gap-1.5">
                          {c.nome}
                          {c.isDecisor && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] border border-[var(--color-primary-blue)]/20">
                              Decisor
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">{c.email || "Sem e-mail cadastrado"}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 font-medium text-[var(--color-text-primary)]">
                    <div className="flex items-center gap-1.5">
                      <Briefcase className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
                      {c.cargo}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-[var(--color-text-muted)]">
                    <div className="flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5" />
                      {c.empresa}
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      {c.telefone && (
                        <a
                          href={`https://wa.me/55${c.telefone.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 rounded-lg bg-[var(--color-surface-sunken)] hover:bg-[var(--color-primary-blue)]/10 text-[var(--color-text-muted)] hover:text-[var(--color-primary-blue)] transition-colors"
                          title="Conversar no WhatsApp"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                        </a>
                      )}
                      {c.email && (
                        <a
                          href={`mailto:${c.email}`}
                          className="p-1.5 rounded-lg bg-[var(--color-surface-sunken)] hover:bg-[var(--color-primary-blue)]/10 text-[var(--color-text-muted)] hover:text-[var(--color-primary-blue)] transition-colors"
                          title="Enviar E-mail"
                        >
                          <Mail className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <button
                      onClick={() => handleDelete(c.id, c.nome)}
                      className="p-1.5 rounded-lg bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] hover:bg-danger/10 hover:border-danger/25 text-[var(--color-text-muted)] hover:text-danger transition-colors"
                      title="Excluir"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-[var(--color-text-muted)]">
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="font-bold">Nenhum contato encontrado.</p>
                    <p className="text-[11px] mt-0.5">Cadastre tomadores de decisão ou ajuste os filtros.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {visibleCount < filtered.length && (
        <div className="flex justify-center py-4">
          <Button variant="outline" onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}>
            Carregar mais ({filtered.length - visibleCount} restantes)
          </Button>
        </div>
      )}

      {/* Modal Novo Contato */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-[var(--color-text-primary)]">Novo Contato Comercial</h3>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold uppercase text-[var(--color-text-muted)] block mb-1">Nome Completo</label>
                <input
                  value={novoContato.nome}
                  onChange={e => setNovoContato({ ...novoContato, nome: e.target.value })}
                  placeholder="Ex: Carlos Silva"
                  className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl px-3 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase text-[var(--color-text-muted)] block mb-1">E-mail</label>
                  <input
                    value={novoContato.email}
                    onChange={e => setNovoContato({ ...novoContato, email: e.target.value })}
                    placeholder="carlos@empresa.com"
                    className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl px-3 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-[var(--color-text-muted)] block mb-1">Telefone / WhatsApp</label>
                  <input
                    value={novoContato.telefone}
                    onChange={e => setNovoContato({ ...novoContato, telefone: e.target.value })}
                    placeholder="(11) 98765-4321"
                    className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl px-3 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase text-[var(--color-text-muted)] block mb-1">Cargo</label>
                  <input
                    value={novoContato.cargo}
                    onChange={e => setNovoContato({ ...novoContato, cargo: e.target.value })}
                    placeholder="Ex: Diretor de Operações"
                    className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl px-3 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-[var(--color-text-muted)] block mb-1">Empresa</label>
                  <select
                    value={novoContato.clienteId}
                    onChange={e => setNovoContato({ ...novoContato, clienteId: e.target.value })}
                    className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl px-3 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
                  >
                    <option value="">Selecione a empresa</option>
                    {clientes.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 pt-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={novoContato.isDecisor}
                  onChange={e => setNovoContato({ ...novoContato, isDecisor: e.target.checked })}
                  className="rounded border-[var(--color-border-default)] text-[var(--color-primary-blue)] focus:ring-0"
                />
                <span className="text-xs text-[var(--color-text-primary)] font-bold">Tomador de Decisão / Decisor Principal</span>
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-[var(--color-border-subtle)]">
              <Button variant="ghost" onClick={() => setShowModal(false)} className="text-xs">Cancelar</Button>
              <Button onClick={handleSaveContato} className="text-xs font-bold">Salvar Contato</Button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
