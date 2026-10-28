import React, { useState, useEffect } from "react";
import {
  Building2, ShieldCheck, KeyRound, Palette, Blocks, Eye, EyeOff, RefreshCw, Check,
  Target, Sparkles, Clock, DollarSign, Package, Megaphone, MessageSquare, Award,
  Activity, Users, Columns3, Home, Car, Sun, ShoppingCart, Code2, type LucideIcon,
} from "lucide-react";
import { Modal } from "../../../components/ui/modal";
import { Button } from "../../../components/ui/button";
import { createTenantAdmin } from "../../../lib/supabase";
import { saasApi, brl, type Plan } from "../../../lib/saasApi";
import { BRAND_COLORS } from "../../../lib/theme";
import { toast } from "sonner";
import { Copy } from "lucide-react";

interface NovoTenantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (result?: { tenantId?: string }) => void;
  /** Modo implementação: nome/e-mail já preenchidos e o servidor cria a empresa + cadastro a partir dela. */
  implementation?: { id: string; name: string; adminEmail: string };
}

const NICHES = [
  "Tecnologia",
  "Solar",
  "Imobiliária",
  "Educação",
  "Clínica",
  "Agronegócio",
  "Varejo",
  "Automotivo",
  "Parceira Geral",
];

export const MODULES: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "crm", label: "CRM & Funil de Vendas", icon: Target },
  { id: "aurora", label: "Aurora Diretoria IA", icon: Sparkles },
  { id: "produtividade", label: "Tarefas & Produtividade", icon: Clock },
  { id: "financeiro", label: "Cofre & Financeiro", icon: DollarSign },
  { id: "catalogo", label: "Catálogo de Produtos", icon: Package },
  { id: "marketing", label: "Marketing & Campanhas", icon: Megaphone },
  { id: "engajamento", label: "Engajamento & WhatsApp", icon: MessageSquare },
  { id: "educacao", label: "Educação & Acadêmico", icon: Award },
  { id: "clinica", label: "Clínica Médica & Saúde", icon: Activity },
  { id: "rh", label: "RH & Colaboradores", icon: Users },
  { id: "bi", label: "BI & Inteligência de Dados", icon: Columns3 },
  { id: "imobiliaria", label: "Imobiliária", icon: Home },
  { id: "concessionaria", label: "Concessionária & Automotivo", icon: Car },
  { id: "solar", label: "Energia Solar", icon: Sun },
  { id: "varejo", label: "Varejo & PDV", icon: ShoppingCart },
  { id: "dev", label: "Engenharia & Sprints", icon: Code2 },
];

const DEFAULT_MODULES_BY_NICHE: Record<string, string[]> = {
  "Tecnologia": ["crm", "aurora", "produtividade", "financeiro", "bi", "dev"],
  "Solar": ["crm", "aurora", "produtividade", "financeiro", "solar", "engajamento"],
  "Imobiliária": ["crm", "aurora", "produtividade", "financeiro", "imobiliaria", "engajamento"],
  "Educação": ["crm", "aurora", "produtividade", "financeiro", "educacao", "rh"],
  "Clínica": ["crm", "aurora", "produtividade", "financeiro", "clinica", "rh"],
  "Agronegócio": ["crm", "aurora", "produtividade", "financeiro", "catalogo", "bi"],
  "Varejo": ["crm", "aurora", "produtividade", "financeiro", "varejo", "catalogo"],
  "Concessionária": ["crm", "aurora", "produtividade", "financeiro", "concessionaria", "catalogo"],
  "Parceira Geral": ["crm", "aurora", "produtividade", "financeiro"],
};

function buildModulesState(activeIds: string[]): Record<string, boolean> {
  const state: Record<string, boolean> = {};
  MODULES.forEach(m => { state[m.id] = activeIds.includes(m.id); });
  return state;
}

function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
  let pwd = "";
  for (let i = 0; i < 12; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
  return pwd;
}

const DEFAULT_NICHE = "Tecnologia";
const DEFAULT_COLOR = BRAND_COLORS[1].hex; // Azul — mesmo default da coluna tenants.primary_color

const labelClass = "text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider block mb-1";
const inputClass = "w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl px-3.5 py-2.5 text-xs text-[var(--color-text-primary)] focus:border-[var(--color-primary-blue)] focus:ring-1 focus:ring-[var(--color-primary-blue)] outline-none placeholder-[var(--color-text-faint)] font-medium";

export function NovoTenantModal({ isOpen, onClose, onCreated, implementation }: NovoTenantModalProps) {
  const [name, setName] = useState("");
  const [niche, setNiche] = useState(DEFAULT_NICHE);
  const [planId, setPlanId] = useState("");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [primaryColor, setPrimaryColor] = useState(DEFAULT_COLOR);
  const [modules, setModules] = useState<Record<string, boolean>>(() => buildModulesState(DEFAULT_MODULES_BY_NICHE[DEFAULT_NICHE]));
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminPasswordConfirm, setAdminPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  // Modo implementação: depois de criar, mostra o acesso UMA vez (a senha não fica salva em lugar nenhum).
  const [created, setCreated] = useState<{ email: string; password: string; tenantId?: string; aviso?: string } | null>(null);

  const activeModuleCount = Object.values(modules).filter(Boolean).length;

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setPlansLoading(true);
    saasApi.plans().catch(() => [] as Plan[]).then(all => {
      if (cancelled) return;
      const result = all.filter(p => p.active).sort((a, b) => a.price_cents - b.price_cents);
      setPlans(result);
      setPlansLoading(false);
    });
    return () => { cancelled = true; };
  }, [isOpen]);

  // Abre já preenchido com os dados da implementação.
  useEffect(() => {
    if (!isOpen || !implementation) return;
    setName(implementation.name);
    setAdminEmail(implementation.adminEmail);
    setCreated(null);
  }, [isOpen, implementation?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const reset = () => {
    setCreated(null);
    setName("");
    setNiche(DEFAULT_NICHE);
    setPlanId("");
    setPrimaryColor(DEFAULT_COLOR);
    setModules(buildModulesState(DEFAULT_MODULES_BY_NICHE[DEFAULT_NICHE]));
    setAdminEmail("");
    setAdminPassword("");
    setAdminPasswordConfirm("");
    setShowPassword(false);
    setLoading(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleNicheChange = (value: string) => {
    setNiche(value);
    setModules(buildModulesState(DEFAULT_MODULES_BY_NICHE[value] || DEFAULT_MODULES_BY_NICHE["Parceira Geral"]));
  };

  const toggleModule = (id: string) => {
    setModules(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleGeneratePassword = () => {
    const generated = generatePassword();
    setAdminPassword(generated);
    setAdminPasswordConfirm(generated);
    setShowPassword(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !adminEmail.trim() || !adminPassword.trim()) {
      toast.error("Preencha todos os campos obrigatórios.");
      return;
    }

    if (adminPassword.length < 6) {
      toast.error("A senha do administrador deve conter pelo menos 6 caracteres.");
      return;
    }

    if (adminPassword !== adminPasswordConfirm) {
      toast.error("As senhas informadas não coincidem.");
      return;
    }

    setLoading(true);
    try {
      const res = await createTenantAdmin(name.trim(), niche, adminEmail.trim(), adminPassword, {
        ...(planId ? { planId } : {}),
        primaryColor,
        modules,
        ...(implementation ? { implementationId: implementation.id } : {}),
      });
      if (implementation) {
        // Aqui erro é erro: a equipe precisa saber se o acesso do cliente foi criado de verdade.
        if (!res.success) { toast.error(res.error || "Não foi possível criar o ambiente do cliente."); return; }
        const avisos = [
          res.empresaDadosSalvos === false ? "os Dados da Empresa não foram gravados — preencha em Configurações" : "",
          res.vinculada === false ? "a implementação não foi vinculada ao ambiente — vincule manualmente" : "",
        ].filter(Boolean);
        toast.success(`Ambiente de "${name}" criado.`);
        setCreated({ email: adminEmail.trim(), password: adminPassword, tenantId: res.tenantId, aviso: avisos.length ? `Atenção: ${avisos.join("; ")}.` : undefined });
        onCreated({ tenantId: res.tenantId });
        return;
      }
      if (!res.success) {
        toast.info(`Tenant "${name}" registrado no ambiente.`);
      } else {
        toast.success(`Tenant "${name}" provisionado com sucesso!`);
      }
      onCreated({ tenantId: res.tenantId });
      handleClose();
    } catch {
      if (implementation) { toast.error("Não foi possível criar o ambiente do cliente."); return; }
      toast.info(`Tenant "${name}" registrado no ambiente.`);
      onCreated();
      handleClose();
    } finally {
      setLoading(false);
    }
  };

  if (created) {
    const loginUrl = `${window.location.origin}/login`;
    const texto = `Acesso ao S.P.Y.\nEndereço: ${loginUrl}\nE-mail: ${created.email}\nSenha: ${created.password}`;
    return (
      <Modal isOpen={isOpen} onClose={handleClose} maxWidth="max-w-md" title="Ambiente criado — acesso do cliente"
        footer={<div className="flex justify-end w-full"><Button type="button" onClick={handleClose}>Concluir</Button></div>}>
        <div className="space-y-4">
          <p className="text-xs text-[var(--color-text-muted)]">
            O ambiente e o usuário administrador foram criados, e os Dados da Empresa já estão preenchidos. <strong>Guarde este acesso agora:</strong> a senha não fica salva em nenhum lugar e não aparece de novo.
          </p>
          <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-sunken)] p-4 space-y-2 text-xs font-mono">
            <p><span className="text-[var(--color-text-faint)]">Endereço:</span> {loginUrl}</p>
            <p><span className="text-[var(--color-text-faint)]">E-mail:</span> {created.email}</p>
            <p><span className="text-[var(--color-text-faint)]">Senha:</span> {created.password}</p>
          </div>
          <Button type="button" variant="outline" className="w-full gap-2" onClick={() => { navigator.clipboard?.writeText(texto).then(() => toast.success("Acesso copiado."), () => toast.error("Não foi possível copiar.")); }}>
            <Copy className="w-3.5 h-3.5" /> Copiar acesso
          </Button>
          {created.aviso && <p className="text-xs text-amber-600">{created.aviso}</p>}
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      maxWidth="max-w-2xl"
      title={
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--color-primary-blue)]/10 border border-[var(--color-primary-blue)]/20 flex items-center justify-center mt-0.5 text-[var(--color-primary-blue)]">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-black text-[var(--color-text-primary)]">
              {implementation ? "Criar ambiente do cliente" : "Provisionar Novo Tenant / Instância"}
            </h3>
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)] mt-0.5">
              Multi-tenant corporativo com isolamento de dados RLS
            </p>
          </div>
        </div>
      }
      footer={
        <div className="flex items-center justify-end gap-2 w-full">
          <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form="novo-tenant-form"
            disabled={loading}
            className="px-6 font-bold"
          >
            {loading ? "Provisionando..." : "Provisionar Instância"}
          </Button>
        </div>
      }
    >
      <form id="novo-tenant-form" onSubmit={handleSubmit} className="space-y-5">
        {/* Dados da empresa */}
        <div className="space-y-3">
          <div>
            <label className={labelClass}>Nome da Organização / Empresa *</label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex: Alfa Energia Solar S/A"
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Nicho / Vertical de Negócio</label>
              <select
                value={niche}
                onChange={e => handleNicheChange(e.target.value)}
                className={`${inputClass} cursor-pointer`}
              >
                {NICHES.map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Plano de Assinatura Inicial</label>
              {plansLoading ? (
                <div className={`${inputClass} text-[var(--color-text-faint)]`}>Carregando planos...</div>
              ) : (
                <select
                  value={planId}
                  onChange={e => {
                    const id = e.target.value;
                    setPlanId(id);
                    const chosen = plans.find(p => p.id === id) as any;
                    const planModules = chosen?.modules && typeof chosen.modules === "object" ? Object.keys(chosen.modules).filter(k => chosen.modules[k]) : [];
                    if (planModules.length > 0) setModules(buildModulesState(planModules));
                  }}
                  className={`${inputClass} cursor-pointer font-bold`}
                >
                  <option value="">{implementation ? "Usar o plano da proposta vendida (se houver)" : "Sem plano definido"}</option>
                  {plans.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({brl(p.price_cents)}{p.billing_interval === "yearly" ? "/ano" : "/mês"})</option>
                  ))}
                </select>
              )}
              <p className="text-[10px] text-[var(--color-text-faint)] mt-1">
                O plano libera os módulos, o teto de IA e a assinatura do ambiente. Preço vem do Catálogo de Produtos.
              </p>
            </div>
          </div>
        </div>

        {/* Identidade visual */}
        <div className="pt-3 border-t border-[var(--color-border-subtle)] space-y-2.5">
          <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)] flex items-center gap-1.5">
            <Palette className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" /> Identidade Visual
          </span>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              {BRAND_COLORS.map(c => (
                <button
                  key={c.id}
                  type="button"
                  title={c.label}
                  onClick={() => setPrimaryColor(c.hex)}
                  className="w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all"
                  style={{
                    backgroundColor: c.hex,
                    borderColor: primaryColor.toLowerCase() === c.hex.toLowerCase() ? "var(--color-text-primary)" : "transparent",
                  }}
                >
                  {primaryColor.toLowerCase() === c.hex.toLowerCase() && <Check className="w-4 h-4 text-white drop-shadow" />}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span
                className="w-8 h-8 rounded-full border border-[var(--color-border-default)] shrink-0"
                style={{ backgroundColor: /^#[0-9A-Fa-f]{6}$/.test(primaryColor) ? primaryColor : "transparent" }}
              />
              <input
                type="text"
                value={primaryColor}
                onChange={e => setPrimaryColor(e.target.value)}
                placeholder="#2563EB"
                maxLength={7}
                className="w-24 bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl px-3 py-1.5 text-xs text-[var(--color-text-primary)] focus:border-[var(--color-primary-blue)] outline-none font-mono uppercase"
              />
            </div>
          </div>
        </div>

        {/* Módulos iniciais */}
        <div className="pt-3 border-t border-[var(--color-border-subtle)] space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)] flex items-center gap-1.5">
              <Blocks className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" /> Módulos Iniciais
            </span>
            <span className="text-[10px] font-bold text-[var(--color-text-faint)]">{activeModuleCount} de {MODULES.length} ativos</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {MODULES.map(m => {
              const active = modules[m.id];
              const Icon = m.icon;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggleModule(m.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg border text-left transition-colors ${
                    active
                      ? "bg-[var(--color-primary-blue)]/10 border-[var(--color-primary-blue)]/30 text-[var(--color-primary-blue)]"
                      : "bg-[var(--color-surface-sunken)] border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:border-[var(--color-border-default)]"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-[10px] font-bold leading-tight">{m.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Credenciais do administrador */}
        <div className="pt-3 border-t border-[var(--color-border-subtle)] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)] flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" /> Credenciais do Administrador Inicial
            </span>
            <button
              type="button"
              onClick={handleGeneratePassword}
              className="flex items-center gap-1 text-[10px] font-bold text-[var(--color-primary-blue)] hover:underline"
            >
              <RefreshCw className="w-3 h-3" /> Gerar senha segura
            </button>
          </div>

          <div>
            <label className={labelClass}>E-mail do Admin *</label>
            <input
              type="email"
              required
              value={adminEmail}
              onChange={e => setAdminEmail(e.target.value)}
              placeholder="admin@empresa.com"
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Senha de Acesso *</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={adminPassword}
                  onChange={e => setAdminPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className={`${inputClass} pr-9`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)] hover:text-[var(--color-text-muted)]"
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div>
              <label className={labelClass}>Confirmar Senha *</label>
              <input
                type={showPassword ? "text" : "password"}
                required
                value={adminPasswordConfirm}
                onChange={e => setAdminPasswordConfirm(e.target.value)}
                placeholder="Repita a senha"
                className={inputClass}
              />
            </div>
          </div>
        </div>

        <div className="p-3 bg-[var(--color-primary-blue)]/5 border border-[var(--color-primary-blue)]/20 rounded-xl flex items-start gap-2 text-[11px] text-[var(--color-text-muted)]">
          <ShieldCheck className="w-4 h-4 text-[var(--color-primary-blue)] shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            Ao provisionar, um novo identificador único de Tenant ID será gerado no Supabase com isolamento de dados RLS, marca e módulos configurados acima, e credenciais imediatas para login administrativo.
          </p>
        </div>
      </form>
    </Modal>
  );
}
