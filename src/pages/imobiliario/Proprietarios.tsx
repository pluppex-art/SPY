import { useState, useEffect } from "react";
import { PageContainer } from "../../components/PageContainer";
import { Button } from "../../components/ui/button";
import {
  Users, Plus, Search, Phone, Mail, Home,
  Building2, MessageSquare, Trash2, X
} from "lucide-react";
import { KpiFilterCard, FilterBar, FilterSearch, FilterChips } from "../../components/ui/kpi-filter-card";
import { Modal } from "../../components/ui/modal";
import { toast } from "sonner";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";
import { confirmDialog } from "../../components/ui/confirm-dialog";

interface ProprietarioItem {
  id: string;
  nome: string;
  telefone: string;
  email: string;
  imoveisCount: number;
  tipo: "Pessoa Física" | "Pessoa Jurídica";
  status: "Ativo" | "Inativo";
}

function rowToProprietario(row: any): ProprietarioItem {
  return {
    id: row.id,
    nome: row.nome,
    telefone: row.telefone || "",
    email: row.email || "",
    imoveisCount: row.imoveis_count ?? 0,
    tipo: row.tipo,
    status: row.status,
  };
}

export default function Proprietarios() {
  const { activeTenantId } = useAuth();

  const [proprietarios, setProprietarios] = useState<ProprietarioItem[]>([]);

  useEffect(() => {
    if (!supabase || !activeTenantId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("imobiliario_proprietarios")
        .select("*")
        .eq("tenant_id", activeTenantId)
        .order("created_at", { ascending: false });
      if (!cancelled && !error && data) {
        setProprietarios(data.map(rowToProprietario));
      }
    })();
    return () => { cancelled = true; };
  }, [activeTenantId]);

  const [search, setSearch] = useState("");
  const [tipoFilter, setTipoFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  // Form state
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [tipo, setTipo] = useState<ProprietarioItem["tipo"]>("Pessoa Física");
  const [imoveisCount, setImoveisCount] = useState("1");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) {
      toast.error("Informe o nome do proprietário.");
      return;
    }
    if (!supabase || !activeTenantId) {
      toast.error("Sem conexão com o banco de dados.");
      return;
    }

    const { data, error } = await supabase
      .from("imobiliario_proprietarios")
      .insert({
        tenant_id: activeTenantId,
        nome: nome.trim(),
        telefone: telefone.trim(),
        email: email.trim(),
        tipo,
        imoveis_count: parseInt(imoveisCount, 10) || 1,
        status: "Ativo",
      })
      .select()
      .maybeSingle();

    if (error || !data) {
      toast.error("Erro ao cadastrar proprietário.");
      return;
    }

    setProprietarios(prev => [rowToProprietario(data), ...prev]);
    toast.success("Proprietário cadastrado com sucesso!");
    setModalOpen(false);

    setNome("");
    setTelefone("");
    setEmail("");
    setImoveisCount("1");
  };

  const handleDelete = async (id: string) => {
    if (!supabase) return;
    const proprietario = proprietarios.find(p => p.id === id);
    if (!(await confirmDialog({
      title: "Excluir proprietário",
      description: `Excluir "${proprietario?.nome || "este proprietário"}"? Essa ação não pode ser desfeita.`,
    }))) return;
    const { error } = await supabase.from("imobiliario_proprietarios").delete().eq("id", id);
    if (error) { toast.error("Erro ao remover proprietário."); return; }
    setProprietarios(prev => prev.filter(p => p.id !== id));
    toast.info("Proprietário removido.");
  };

  const filtered = proprietarios.filter(p =>
    (p.nome.toLowerCase().includes(search.toLowerCase()) ||
    p.email.toLowerCase().includes(search.toLowerCase()) ||
    p.telefone.includes(search)) &&
    (!tipoFilter || p.tipo === tipoFilter)
  );

  return (
    <PageContainer
      title="Gestão de Proprietários"
      description="Cadastro, documentos de posse e imóveis vinculados a locadores e proprietários vendedores."
      actions={
        <Button onClick={() => setModalOpen(true)} className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs">
          <Plus className="w-3.5 h-3.5" /> Novo Proprietário
        </Button>
      }
    >
      <KpiFilterCard
        id="imobProprietarios"
        kpis={[
          { label: "Proprietários", value: filtered.length, icon: Users, tone: "primary" },
          { label: "Imóveis Vinculados", value: filtered.reduce((s, p) => s + p.imoveisCount, 0), icon: Home, tone: "success" },
          { label: "Pessoas Jurídicas", value: filtered.filter(p => p.tipo === "Pessoa Jurídica").length, icon: Building2, tone: "accent" },
          { label: "Com Telefone", value: filtered.filter(p => p.telefone.trim()).length, icon: Phone, tone: "warning" },
        ]}
        activeCount={(search.trim() ? 1 : 0) + (tipoFilter ? 1 : 0)}
        onClear={() => { setSearch(""); setTipoFilter(""); }}
      >
        <FilterBar>
          <FilterSearch value={search} onChange={setSearch} placeholder="Buscar por nome, e-mail ou telefone..." />
          <FilterChips value={tipoFilter} onChange={setTipoFilter} options={["Pessoa Física", "Pessoa Jurídica"]} />
        </FilterBar>
      </KpiFilterCard>

      <div className="mt-4" />

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {filtered.map(p => (
          <div key={p.id} className="p-5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border-default)] hover:border-[var(--color-primary-blue)]/50 transition-all flex flex-col justify-between gap-3 shadow-2xs">
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-[var(--color-text-muted)]">
                  {p.tipo}
                </span>
                <Button size="sm" variant="ghost" onClick={() => handleDelete(p.id)} className="h-7 w-7 p-0 text-red-500 hover:bg-red-500/10 rounded-lg">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>

              <h4 className="text-sm font-bold text-[var(--color-text-primary)]">{p.nome}</h4>
              <div className="space-y-1 text-xs text-[var(--color-text-muted)] mt-2">
                <p className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-amber-500" /> {p.telefone || "Telefone não informado"}</p>
                <p className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 text-blue-500" /> {p.email || "E-mail não informado"}</p>
                <p className="flex items-center gap-1.5"><Home className="w-3.5 h-3.5 text-emerald-500" /> {p.imoveisCount} imóvel(is) cadastrado(s)</p>
              </div>
            </div>

            <div className="pt-3 border-t border-[var(--color-border-subtle)] flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500">
                {p.status}
              </span>
              <Button size="sm" variant="outline" onClick={() => toast.success(`Abrindo imóveis de ${p.nome}`)} className="h-8 text-xs font-bold rounded-xl">
                Ver Imóveis
              </Button>
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="col-span-full p-8 text-center text-xs text-[var(--color-text-muted)] bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-2xl">
            Nenhum proprietário encontrado.
          </div>
        )}
      </div>

      {/* Standardized Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        maxWidth="max-w-md"
        title={
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] flex items-center justify-center shrink-0">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--color-text-primary)]">Cadastrar Proprietário</h3>
              <p className="text-xs text-[var(--color-text-muted)]">Dados cadastrais e contato do locador / vendedor</p>
            </div>
          </div>
        }
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <Button
              type="button"
              variant="outline"
              onClick={() => setModalOpen(false)}
              className="h-9 px-4 text-xs font-semibold"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="form-proprietario"
              className="h-9 px-4 text-xs font-semibold bg-[var(--color-primary-blue)] hover:bg-[var(--color-primary-blue)]/90 text-white"
            >
              Cadastrar Proprietário
            </Button>
          </div>
        }
      >
        <form id="form-proprietario" onSubmit={handleCreate} className="space-y-3.5 py-1">
          <div>
            <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Nome / Razão Social</label>
            <input
              type="text"
              required
              placeholder="Nome completo ou Razão Social"
              value={nome}
              onChange={e => setNome(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Tipo</label>
              <select
                value={tipo}
                onChange={e => setTipo(e.target.value as any)}
                className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
              >
                <option value="Pessoa Física">Pessoa Física</option>
                <option value="Pessoa Jurídica">Pessoa Jurídica</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Qtd. Imóveis</label>
              <input
                type="number"
                min="1"
                value={imoveisCount}
                onChange={e => setImoveisCount(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Telefone / WhatsApp</label>
              <input
                type="text"
                placeholder="(11) 90000-0000"
                value={telefone}
                onChange={e => setTelefone(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">E-mail</label>
              <input
                type="email"
                placeholder="contato@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
              />
            </div>
          </div>
        </form>
      </Modal>
    </PageContainer>
  );
}
