import React, { useState, useEffect } from "react";
import {
  Cpu, X, Check, Sparkles, Target, Clock, DollarSign,
  Package, Megaphone, MessageSquare, Award, Activity,
  Users, Columns3, Home, Car, Sun, ShoppingCart, Code2,
  ShieldCheck
} from "lucide-react";
import { Button } from "../../../components/ui/button";
import { useAuth } from "../../../contexts/AuthContext";
import { toast } from "sonner";

interface ModuleConfigModalProps {
  selectedTenant: string | null;
  onClose: () => void;
  onSaved?: () => void;
}

const MODULES_LIST = [
  { id: "crm", title: "CRM & Funil Comercial", desc: "Central de Vendas, leads e rodízio de closers", icon: Target, color: "text-blue-500" },
  { id: "aurora", title: "Aurora Diretoria IA", desc: "Assistente de voz e inteligência de diretoria", icon: Sparkles, color: "text-indigo-500" },
  { id: "produtividade", title: "Tarefas & Produtividade", desc: "Quadro Kanban operacional e follow-ups", icon: Clock, color: "text-cyan-500" },
  { id: "financeiro", title: "Cofre & Financeiro", desc: "Receitas, despesas, DRE e conciliação", icon: DollarSign, color: "text-emerald-500" },
  { id: "catalogo", title: "Catálogo & Produtos", desc: "Estoque de produtos e tabela de preços", icon: Package, color: "text-purple-500" },
  { id: "marketing", title: "Marketing & Campanhas", desc: "Automações, landing pages e formulários", icon: Megaphone, color: "text-amber-500" },
  { id: "engajamento", title: "WhatsApp & Engajamento", desc: "Disparos automáticos e mensageria", icon: MessageSquare, color: "text-rose-500" },
  { id: "educacao", title: "Educação & Acadêmico", desc: "Turmas, matrículas e certificados", icon: Award, color: "text-purple-500" },
  { id: "clinica", title: "Clínica & Saúde", desc: "Prontuários EHR e telemedicina", icon: Activity, color: "text-teal-500" },
  { id: "rh", title: "RH & Equipe", desc: "Colaboradores, organograma e comissões", icon: Users, color: "text-blue-500" },
  { id: "bi", title: "BI & Indicadores", desc: "Dashboards e inteligência analítica", icon: Columns3, color: "text-indigo-500" },
  { id: "imobiliaria", title: "Imobiliária", desc: "Imóveis, corretores, visitas e propostas", icon: Home, color: "text-orange-500" },
  { id: "concessionaria", title: "Concessionária", desc: "Veículos, estoques e consignações", icon: Car, color: "text-amber-600" },
  { id: "solar", title: "Energia Solar", desc: "Análise de fatura por IA e projetos", icon: Sun, color: "text-yellow-500" },
  { id: "varejo", title: "Varejo & PDV", desc: "Venda direta no caixa e catálogo público", icon: ShoppingCart, color: "text-lime-500" },
  { id: "dev", title: "Engenharia & Sprints", desc: "Backlog tech e controle de releases", icon: Code2, color: "text-slate-500" },
];

export function ModuleConfigModal({ selectedTenant, onClose, onSaved }: ModuleConfigModalProps) {
  const { getTenantModules, updateTenantModules } = useAuth();
  const [modules, setModules] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (selectedTenant) {
      const active = getTenantModules(selectedTenant);
      setModules({ ...active });
    }
  }, [selectedTenant]);

  if (!selectedTenant) return null;

  const handleToggle = (id: string) => {
    setModules(prev => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleApplyPreset = (presetName: string) => {
    let preset: Record<string, boolean> = {};
    switch (presetName) {
      case "FULL":
        preset = { crm: true, educacao: true, produtividade: true, financeiro: true, catalogo: true, marketing: true, engajamento: true, rh: true, bi: true, clinica: true, dev: true, imobiliaria: true, concessionaria: true, varejo: true, solar: true, aurora: true };
        break;
      case "SDR":
        preset = { crm: true, educacao: false, produtividade: true, financeiro: false, catalogo: false, marketing: true, engajamento: true, rh: false, bi: true, clinica: false, dev: false, imobiliaria: false, concessionaria: false, varejo: false, solar: false, aurora: true };
        break;
      case "IMOBILIARIA":
        preset = { crm: true, educacao: false, produtividade: true, financeiro: true, catalogo: false, marketing: true, engajamento: true, rh: true, bi: true, clinica: false, dev: false, imobiliaria: true, concessionaria: false, varejo: false, solar: false, aurora: true };
        break;
      case "SOLAR":
        preset = { crm: true, educacao: false, produtividade: true, financeiro: true, catalogo: false, marketing: false, engajamento: true, rh: true, bi: true, clinica: false, dev: false, imobiliaria: false, concessionaria: false, varejo: false, solar: true, aurora: true };
        break;
      case "CLINICA":
        preset = { crm: true, educacao: false, produtividade: true, financeiro: true, catalogo: false, marketing: false, engajamento: true, rh: true, bi: true, clinica: true, dev: false, imobiliaria: false, concessionaria: false, varejo: false, solar: false, aurora: true };
        break;
      default:
        break;
    }
    setModules(preset);
    toast.info("Preset pré-carregado no formulário.");
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateTenantModules(selectedTenant, modules as any);
      toast.success(`Módulos de "${selectedTenant}" salvos com sucesso!`);
      onSaved?.();
      onClose();
    } catch {
      toast.error("Erro ao salvar configuração modular.");
    } finally {
      setSaving(false);
    }
  };

  const activeCount = Object.values(modules).filter(Boolean).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-xs" onClick={onClose} />

      {/* Modal Container */}
      <div className="relative bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-3xl w-full max-w-2xl p-6 overflow-hidden shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex justify-between items-start border-b border-[var(--color-border-default)] pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--color-primary-blue)]/10 border border-[var(--color-primary-blue)]/20 flex items-center justify-center text-[var(--color-primary-blue)]">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-[var(--color-text-primary)]">
                  Módulos de {selectedTenant}
                </h3>
                <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-primary-blue)] bg-[var(--color-primary-blue)]/10 border border-[var(--color-primary-blue)]/20 px-2 py-0.5 rounded-md">
                  {activeCount} de 16 ativos
                </span>
              </div>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                Ative ou desative seções e recursos para a operação desta empresa.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] p-1 rounded-lg hover:bg-[var(--color-surface-sunken)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Quick Presets */}
        <div className="space-y-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-[var(--color-primary-blue)]" /> Presets Rápidos
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            {[
              { id: "FULL", label: "Geral Full (Todos)" },
              { id: "SDR", label: "SDR & Closers" },
              { id: "IMOBILIARIA", label: "Imobiliária" },
              { id: "SOLAR", label: "Energia Solar" },
              { id: "CLINICA", label: "Clínica Saúde" },
            ].map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleApplyPreset(p.id)}
                className="px-2.5 py-1 bg-[var(--color-surface-sunken)] hover:bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-lg text-xs font-bold text-[var(--color-text-primary)] transition-all cursor-pointer"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Modules Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[360px] overflow-y-auto pr-1">
          {MODULES_LIST.map(mod => {
            const isEnabled = modules[mod.id] ?? false;
            const Icon = mod.icon;

            return (
              <div
                key={mod.id}
                onClick={() => handleToggle(mod.id)}
                className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-3 cursor-pointer select-none ${
                  isEnabled
                    ? "bg-[var(--color-primary-blue)]/5 border-[var(--color-primary-blue)]/40 text-[var(--color-text-primary)]"
                    : "bg-[var(--color-surface-sunken)] border-[var(--color-border-subtle)] text-[var(--color-text-muted)] opacity-60 hover:opacity-100"
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`p-1.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border-default)] shrink-0 ${mod.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-bold block truncate">
                      {mod.title}
                    </span>
                    <span className="text-[10px] opacity-80 block truncate">
                      {mod.desc}
                    </span>
                  </div>
                </div>

                <div className="shrink-0">
                  {isEnabled ? (
                    <div className="w-5 h-5 rounded-md bg-[var(--color-primary-blue)] flex items-center justify-center text-white">
                      <Check className="w-3.5 h-3.5" />
                    </div>
                  ) : (
                    <div className="w-5 h-5 rounded-md border border-[var(--color-border-default)] bg-[var(--color-surface)]" />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[var(--color-border-default)] pt-4">
          <span className="text-[11px] text-[var(--color-text-muted)] flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-500" /> Isolamento por Tenant garantido
          </span>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="px-5 font-bold">
              {saving ? "Salvando..." : "Salvar Configuração"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
