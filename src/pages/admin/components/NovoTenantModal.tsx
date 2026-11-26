import React, { useState, useEffect, useRef } from "react";
import {
  Building2, ShieldCheck, KeyRound, Palette, Blocks, Eye, EyeOff, RefreshCw, Check,
  Target, Sparkles, Clock, DollarSign, Package, Megaphone, MessageSquare, Award,
  Activity, Users, Columns3, Home, Car, Sun, ShoppingCart, Code2, Bot, ChevronLeft, ChevronRight, Search, type LucideIcon,
} from "lucide-react";
import { Modal } from "../../../components/ui/modal";
import { Button } from "../../../components/ui/button";
import { createTenantAdmin } from "../../../lib/supabase";
import { saasApi, brl, type Plan } from "../../../lib/saasApi";
import { BRAND_COLORS } from "../../../lib/theme";
import { toast } from "sonner";
import { Copy, CalendarCheck, Radar } from "lucide-react";
import { fetchCnpj, formatCnpjMask, isValidCnpj, onlyDigits } from "../../../lib/brLookup";
import { montarFunil } from "../../../lib/modelosDeFunil";
import { FunilInicialStep, funilDoModelo } from "./FunilInicialStep";

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
  { id: "crm", label: "Vendas & Funil de Vendas", icon: Target },
  { id: "aurora", label: "Aurora Diretoria IA", icon: Sparkles },
  { id: "produtividade", label: "Tarefas & Produtividade", icon: Clock },
  { id: "agendamento", label: "Agendamento & Reservas", icon: CalendarCheck },
  { id: "financeiro", label: "Cofre & Financeiro", icon: DollarSign },
  { id: "catalogo", label: "Catálogo de Produtos", icon: Package },
  { id: "marketing", label: "Marketing & Campanhas", icon: Megaphone },
  { id: "engajamento", label: "Engajamento & WhatsApp", icon: MessageSquare },
  { id: "chatbot", label: "Chatbot (agente do cliente)", icon: Bot },
  { id: "educacao", label: "Educação & Acadêmico", icon: Award },
  { id: "clinica", label: "Clínica Médica & Saúde", icon: Activity },
  { id: "rh", label: "RH & Colaboradores", icon: Users },
  { id: "bi", label: "BI & Inteligência de Dados", icon: Columns3 },
  { id: "imobiliaria", label: "Imobiliária", icon: Home },
  { id: "concessionaria", label: "Concessionária & Automotivo", icon: Car },
  { id: "solar", label: "Energia Solar", icon: Sun },
  { id: "varejo", label: "Ponto de Venda", icon: ShoppingCart },
  { id: "dev", label: "Engenharia & Sprints", icon: Code2 },
  { id: "agente_secreto", label: "Agente Secreto de Vendas (vendido à parte)", icon: Radar },
  { id: "agente_interno", label: "Agente Secreto Interno (vendido à parte)", icon: Radar },
];

const DEFAULT_MODULES_BY_NICHE: Record<string, string[]> = {
  "Tecnologia": ["crm", "aurora", "produtividade", "financeiro", "bi", "dev"],
  "Solar": ["crm", "aurora", "produtividade", "financeiro", "solar", "engajamento"],
  "Imobiliária": ["crm", "aurora", "produtividade", "financeiro", "imobiliaria", "engajamento"],
  "Educação": ["crm", "aurora", "produtividade", "financeiro", "educacao", "rh"],
  "Clínica": ["crm", "aurora", "produtividade", "financeiro", "clinica", "rh"],
  "Agronegócio": ["crm", "aurora", "produtividade", "financeiro", "catalogo", "bi"],
  "Varejo": ["crm", "aurora", "produtividade", "financeiro", "varejo", "catalogo"],
  "Automotivo": ["crm", "aurora", "produtividade", "financeiro", "concessionaria", "catalogo"],
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
  for (const n of crypto.getRandomValues(new Uint32Array(12))) pwd += chars[n % chars.length];
  return pwd;
}

const DEFAULT_NICHE = "Tecnologia";
const DEFAULT_COLOR = BRAND_COLORS[1].hex; // Azul — mesmo default da coluna tenants.primary_color

const FUSOS = [
  { id: "America/Sao_Paulo", label: "Brasília (São Paulo)" },
  { id: "America/Cuiaba", label: "Cuiabá" },
  { id: "America/Manaus", label: "Manaus" },
  { id: "America/Rio_Branco", label: "Rio Branco (Acre)" },
  { id: "America/Noronha", label: "Fernando de Noronha" },
];

const PASSOS = ["Empresa", "Funil de vendas", "Plano e módulos", "Acesso"];

const DADOS_VAZIOS = { cnpj: "", razaoSocial: "", telefone: "", endereco: "", site: "" };

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
  const [passo, setPasso] = useState(0);
  const [empresa, setEmpresa] = useState(DADOS_VAZIOS);
  const [fuso, setFuso] = useState(FUSOS[0].id);
  const [buscandoCnpj, setBuscandoCnpj] = useState(false);
  const [funil, setFunil] = useState(() => funilDoModelo("vendas_consultivas"));
  const [adminName, setAdminName] = useState("");
  const [adminPhone, setAdminPhone] = useState("");
  const [iniciarWhatsapp, setIniciarWhatsapp] = useState(false);
  // Depois de criar, mostra o acesso UMA vez (a senha não fica salva em lugar nenhum).
  const [created, setCreated] = useState<{ email: string; password: string; tenantId?: string; aviso?: string; funil?: string } | null>(null);

  // Cada passo começa do topo, com a aba dele visível (no celular as abas rolam de lado).
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    formRef.current?.parentElement?.scrollTo(0, 0);
    formRef.current?.querySelector('[aria-current="step"]')?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [passo]);

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
    setPasso(0);
    setEmpresa(DADOS_VAZIOS);
    setFuso(FUSOS[0].id);
    setFunil(funilDoModelo("vendas_consultivas"));
    setAdminName("");
    setAdminPhone("");
    setIniciarWhatsapp(false);
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

  const buscarCnpj = async () => {
    setBuscandoCnpj(true);
    try {
      const info = await fetchCnpj(empresa.cnpj);
      setEmpresa((atual) => ({
        ...atual,
        razaoSocial: info.razao_social || atual.razaoSocial,
        endereco: [info.endereco, info.cep && !onlyDigits(info.endereco).includes(onlyDigits(info.cep)) ? `CEP ${info.cep}` : ""].filter(Boolean).join(", ") || atual.endereco,
        telefone: atual.telefone || info.telefone,
      }));
      if (!name.trim()) setName(info.nome_fantasia || info.razao_social);
      if (info.situacao && !/ativa/i.test(info.situacao)) toast.warning(`Situação na Receita: ${info.situacao}.`);
      else toast.success("Dados da Receita preenchidos.");
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível consultar o CNPJ.");
    } finally {
      setBuscandoCnpj(false);
    }
  };

  /** O que impede de passar do passo; vazio quando está tudo certo. */
  const problemaDoPasso = (i: number): string => {
    if (i === 0) {
      if (!name.trim()) return "Informe o nome da empresa.";
      if (!implementation && empresa.cnpj && !isValidCnpj(empresa.cnpj)) return "CNPJ inválido — confira os dígitos ou deixe em branco.";
    }
    if (i === 1 && !montarFunil(funil)) return "O funil precisa ter pelo menos uma etapa com nome.";
    if (i === 3) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(adminEmail.trim())) return "Informe um e-mail válido para o administrador.";
      if (adminPassword.length < 8) return "A senha do administrador deve conter pelo menos 8 caracteres.";
      if (adminPassword !== adminPasswordConfirm) return "As senhas informadas não coincidem.";
      if (iniciarWhatsapp && onlyDigits(adminPhone).length < 10) return "Informe o WhatsApp do administrador com DDD.";
    }
    return "";
  };

  const avancar = () => {
    const problema = problemaDoPasso(passo);
    if (problema) { toast.error(problema); return; }
    setPasso((p) => Math.min(p + 1, PASSOS.length - 1));
  };

  const provisionar = async () => {
    for (let i = 0; i < PASSOS.length; i++) {
      const problema = problemaDoPasso(i);
      if (problema) { setPasso(i); toast.error(problema); return; }
    }

    const funilFinal = montarFunil(funil);
    setLoading(true);
    try {
      const res = await createTenantAdmin(name.trim(), niche, adminEmail.trim(), adminPassword, {
        ...(planId ? { planId } : {}),
        primaryColor,
        modules,
        timezone: fuso,
        ...(funilFinal ? { funil: { nome: funilFinal.nome, etapas: funilFinal.etapasConfig } } : {}),
        funilSdr: funil.comSdr,
        ...(implementation
          ? { implementationId: implementation.id }
          : { empresa, adminName: adminName.trim(), adminPhone: adminPhone.trim(), iniciarWhatsapp }),
      });
      // Aqui erro é erro: a equipe precisa saber se o ambiente e o acesso foram criados de verdade.
      if (!res.success) {
        toast.error(res.error || "Não foi possível criar a empresa.", { description: "Se a demora foi grande, confira a lista de empresas antes de tentar de novo." });
        return;
      }
      const avisos = [
        res.empresaDadosSalvos === false ? "os Dados da Empresa não foram gravados — preencha em Configurações" : "",
        res.funilCriado === false ? "o funil não foi criado — crie em Configurações › Funis & etapas" : "",
        implementation && res.vinculada === false ? "a implementação não foi vinculada ao ambiente — vincule manualmente" : "",
      ].filter(Boolean);
      toast.success(`Ambiente de "${name.trim()}" criado.`);
      setCreated({
        email: adminEmail.trim(), password: adminPassword, tenantId: res.tenantId,
        aviso: avisos.length ? `Atenção: ${avisos.join("; ")}.` : undefined,
        funil: res.funilCriado ? [funilFinal?.nome, funil.comSdr ? "Funil SDR IA" : ""].filter(Boolean).join(" e ") : undefined,
      });
      onCreated({ tenantId: res.tenantId });
    } catch {
      toast.error("Não foi possível criar a empresa.");
    } finally {
      setLoading(false);
    }
  };

  if (created) {
    const loginUrl = `${window.location.origin}/login`;
    const texto = `Acesso ao S.P.Y.\nEndereço: ${loginUrl}\nE-mail: ${created.email}\nSenha: ${created.password}`;
    return (
      <Modal isOpen={isOpen} onClose={handleClose} maxWidth="max-w-md" title="Ambiente criado — acesso do cliente" closeOnBackdrop={false}
        footer={<div className="flex justify-end w-full"><Button type="button" onClick={handleClose}>Concluir</Button></div>}>
        <div className="space-y-4">
          <p className="text-xs text-[var(--color-text-muted)]">
            O ambiente e o usuário administrador foram criados{created.funil ? `, com ${created.funil}` : ""}. <strong>Guarde este acesso agora:</strong> a senha não fica salva em nenhum lugar e não aparece de novo.
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
      maxWidth="max-w-3xl"
      closeOnBackdrop={false}
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
        <div className="flex items-center justify-between gap-2 w-full">
          <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
            Cancelar
          </Button>
          <div className="flex items-center gap-2">
            {passo > 0 && (
              <Button type="button" variant="outline" onClick={() => setPasso(passo - 1)} disabled={loading} className="gap-1">
                <ChevronLeft className="w-3.5 h-3.5" /> Voltar
              </Button>
            )}
            {passo < PASSOS.length - 1 ? (
              <Button key="continuar" type="button" onClick={avancar} className="px-6 font-bold gap-1">
                Continuar <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            ) : (
              <Button key="provisionar" type="button" onClick={() => void provisionar()} disabled={loading} className="px-6 font-bold">
                {loading ? "Provisionando..." : "Provisionar Instância"}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <form ref={formRef} onSubmit={(e) => e.preventDefault()} className="space-y-5">
        <ol className="flex items-center gap-1.5 overflow-x-auto scrollbar-none" aria-label="Passos do cadastro">
          {PASSOS.map((titulo, i) => (
            <li key={titulo} className="flex-1 min-w-fit">
              <button type="button" disabled={i > passo || loading} onClick={() => setPasso(i)} aria-current={i === passo ? "step" : undefined}
                className={`w-full text-left border-0 border-b-2 bg-transparent pb-2 px-1 text-[11px] font-black whitespace-nowrap transition-colors ${
                  i === passo ? "border-[var(--color-primary-blue)] text-[var(--color-primary-blue)]"
                    : i < passo ? "border-[var(--color-primary-blue)]/40 text-[var(--color-text-primary)] cursor-pointer"
                      : "border-[var(--color-border-subtle)] text-[var(--color-text-faint)]"}`}>
                {i + 1}. {titulo}
              </button>
            </li>
          ))}
        </ol>

        {passo === 0 && (<>
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
              <p className="text-[10px] text-[var(--color-text-faint)] mt-1">O nicho já marca os módulos mais usados.</p>
            </div>
            <div>
              <label className={labelClass}>Fuso horário</label>
              <select value={fuso} onChange={e => setFuso(e.target.value)} className={`${inputClass} cursor-pointer`}>
                {FUSOS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </div>
          </div>
        </div>

        {implementation ? (
          <p className="text-[11px] text-[var(--color-text-muted)] rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] p-3">
            Razão social, CNPJ, endereço e responsável vêm da ficha de implementação.
          </p>
        ) : (
          <div className="pt-3 border-t border-[var(--color-border-subtle)] space-y-3">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)] block">Dados cadastrais (opcional)</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>CNPJ</label>
                <div className="flex gap-2">
                  <input value={empresa.cnpj} inputMode="numeric" onChange={e => setEmpresa({ ...empresa, cnpj: formatCnpjMask(e.target.value) })} placeholder="00.000.000/0000-00" className={inputClass} />
                  <Button type="button" variant="outline" disabled={buscandoCnpj || onlyDigits(empresa.cnpj).length !== 14} onClick={() => void buscarCnpj()} className="h-auto px-3 text-xs font-bold gap-1.5 shrink-0">
                    <Search className="w-3.5 h-3.5" /> {buscandoCnpj ? "Buscando..." : "Buscar"}
                  </Button>
                </div>
              </div>
              <div>
                <label className={labelClass}>Razão social</label>
                <input value={empresa.razaoSocial} onChange={e => setEmpresa({ ...empresa, razaoSocial: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Telefone da empresa</label>
                <input value={empresa.telefone} onChange={e => setEmpresa({ ...empresa, telefone: e.target.value })} placeholder="(00) 00000-0000" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Site</label>
                <input value={empresa.site} onChange={e => setEmpresa({ ...empresa, site: e.target.value })} placeholder="www.empresa.com.br" className={inputClass} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Endereço</label>
                <input value={empresa.endereco} onChange={e => setEmpresa({ ...empresa, endereco: e.target.value })} placeholder="Rua, número, bairro, cidade - UF" className={inputClass} />
              </div>
            </div>
          </div>
        )}

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

        </>)}

        {passo === 1 && (<>
          <FunilInicialStep valor={funil} onChange={setFunil} />
          {!modules.crm && <p className="text-xs text-amber-600">O módulo Vendas está desligado: o funil só aparece quando ele for ligado.</p>}
        </>)}

        {passo === 2 && (<>
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

        {/* Módulos iniciais */}
        <div className="pt-3 border-t border-[var(--color-border-subtle)] space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)] flex items-center gap-1.5">
              <Blocks className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" /> Módulos Iniciais
            </span>
            <span className="flex items-center gap-3">
              <button type="button" onClick={() => handleNicheChange(niche)} className="text-[10px] font-bold text-[var(--color-primary-blue)] bg-transparent border-0 cursor-pointer hover:underline">Sugeridos do nicho</button>
              <button type="button" onClick={() => setModules(buildModulesState([]))} className="text-[10px] font-bold text-[var(--color-text-muted)] bg-transparent border-0 cursor-pointer hover:underline">Desmarcar todos</button>
              <span className="text-[10px] font-bold text-[var(--color-text-faint)]">{activeModuleCount} de {MODULES.length} ativos</span>
            </span>
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

        </>)}

        {passo === 3 && (<>
        {/* Credenciais do administrador */}
        <div className="space-y-3">
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

          {!implementation && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Nome do administrador</label>
                <input value={adminName} onChange={e => setAdminName(e.target.value)} placeholder="Nome e sobrenome" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>WhatsApp do administrador</label>
                <input value={adminPhone} onChange={e => setAdminPhone(e.target.value)} inputMode="tel" placeholder="(00) 00000-0000" className={inputClass} />
              </div>
            </div>
          )}

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
                  placeholder="Mínimo 8 caracteres"
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

        {implementation ? (
          <p className="text-[11px] text-[var(--color-text-muted)]">O agente de implantação inicia a conversa no WhatsApp do responsável informado na ficha.</p>
        ) : (
          <label className="flex items-start gap-2.5 p-3 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] cursor-pointer">
            <input type="checkbox" checked={iniciarWhatsapp} onChange={e => setIniciarWhatsapp(e.target.checked)} className="mt-0.5 accent-[var(--color-primary-blue)]" />
            <span>
              <span className="block text-xs font-bold text-[var(--color-text-primary)]">Iniciar a conversa de implantação no WhatsApp</span>
              <span className="block text-[11px] text-[var(--color-text-muted)]">O agente de implantação manda mensagem para o número acima assim que a empresa for criada.</span>
            </span>
          </label>
        )}

        {/* Resumo antes de criar */}
        <dl className="rounded-xl border border-[var(--color-border-default)] p-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[11px]">
          {([
            ["Empresa", `${name.trim()} · ${niche}`],
            ["Funil", [montarFunil(funil)?.nome, funil.comSdr ? "Funil SDR IA" : ""].filter(Boolean).join(" e ") || "—"],
            ["Etapas", montarFunil(funil)?.etapas.join(" → ") ?? "—"],
            ["Plano", plans.find(p => p.id === planId)?.name ?? (implementation ? "O da proposta vendida (se houver)" : "Sem plano definido")],
            ["Módulos", MODULES.filter(m => modules[m.id]).map(m => m.label).join(", ") || "Nenhum"],
          ] as [string, string][]).map(([rotulo, valor]) => (
            <React.Fragment key={rotulo}>
              <dt className="font-bold text-[var(--color-text-muted)]">{rotulo}</dt>
              <dd className="m-0 text-[var(--color-text-primary)] break-words">{valor}</dd>
            </React.Fragment>
          ))}
        </dl>

        <div className="p-3 bg-[var(--color-primary-blue)]/5 border border-[var(--color-primary-blue)]/20 rounded-xl flex items-start gap-2 text-[11px] text-[var(--color-text-muted)]">
          <ShieldCheck className="w-4 h-4 text-[var(--color-primary-blue)] shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            Ao provisionar, um novo identificador único de Tenant ID será gerado no Supabase com isolamento de dados RLS, marca, funil e módulos escolhidos, e credenciais imediatas para login administrativo.
          </p>
        </div>
        </>)}
      </form>
    </Modal>
  );
}
