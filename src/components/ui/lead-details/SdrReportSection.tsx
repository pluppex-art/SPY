import React from "react";
import { Card } from "../card";
import { Button } from "../button";
import { Badge } from "../badge";
import { Brain, Sparkles, Send, Copy, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface SdrReportSectionProps {
  lead: any;
  reportContextOverride: 'auto' | 'normal' | 'educacao' | 'posvenda';
  setReportContextOverride: (val: 'auto' | 'normal' | 'educacao' | 'posvenda') => void;
  leadName: string;
  companyName: string;
  seller: string;
  score: number;
}

export function SdrReportSection({
  lead,
  reportContextOverride,
  setReportContextOverride,
  leadName,
  companyName,
  seller,
  score
}: SdrReportSectionProps) {
  const computedIsEdu = lead.company?.toLowerCase().includes("turma") || 
                       lead.company?.toLowerCase().includes("curso") || 
                       lead.company?.toLowerCase().includes("escola") || 
                       lead.company?.toLowerCase().includes("inscrição") || 
                       lead.company?.toLowerCase().includes("graduação") || 
                       lead.company?.toLowerCase().includes("educação") || 
                       lead.name?.toLowerCase().includes("educação") || 
                       (lead.id === 'sdr1' || lead.id === 'sdr2') || false;

  const computedIsCS = lead.company?.toLowerCase().includes("licença") || 
                      lead.company?.toLowerCase().includes("saas") || 
                      lead.company?.toLowerCase().includes("contrato") || 
                      lead.name?.toLowerCase().includes("suporte") || false;

  const activeMode = reportContextOverride === 'auto' 
    ? (computedIsEdu ? 'educacao' : computedIsCS ? 'posvenda' : 'normal')
    : reportContextOverride;

  const getField = (key: string, fallback: string = 'Não informado') => {
    if (!lead.customFields || !Array.isArray(lead.customFields)) return fallback;
    const field = lead.customFields.find((f: any) => f.name.toLowerCase().includes(key.toLowerCase()));
    return field?.value || fallback;
  };

  const educacaoData = {
    statusTurma: getField('status turma', 'Pendente de Análise'),
    classChoice: getField('curso', 'Não selecionado'),
    presenceInaugural: getField('presença', 'Pendente'),
    onboardingGroup: getField('grupo', 'Pendente'),
    primaryAim: getField('objetivo', 'Não detalhado.'),
    playbook: getField('playbook', 'Coletar mais informações sobre o lead e engajamento nas aulas.'),
    nextStep: getField('proximo passo', 'Agendar ligação de boas vindas.'),
    template: `Olá, ${leadName}! Aqui é o consultor de admissão da S.P.Y.. Nossa IA mapeou seu interesse. Podemos conversar?`
  };

  const csData = {
    npsScore: getField('nps', 'NPS Indefinido'),
    activeUsers: getField('engajamento', 'Aguardando métricas'),
    growthPotential: getField('potencial', 'A ser avaliado.'),
    criticalObjection: getField('objeção', 'Nenhuma registrada.'),
    playbook: getField('playbook cs', 'Acompanhar adoção da plataforma.'),
    nextStep: getField('proximo passo cs', 'Agendar touchpoint.'),
    template: `Olá, ${leadName}! Como estão os resultados na ${companyName || 'sua empresa'}? Gostaríamos de marcar uma breve conversa para revisão estratégica.`
  };

  const normalData = {
    leadScore: lead.scoreIA || 0,
    cargo: getField('cargo', 'Não informado'),
    potencialComercial: getField('tamanho', 'A avaliar'),
    mainDores: getField('dores', 'Aguardando mapeamento de dores.'),
    decididorStatus: getField('decididor', 'A confirmar.'),
    playbook: getField('playbook vendas', 'Qualificar através de metodologia comercial estruturada.'),
    nextStep: getField('proximo passo vendas', 'Agendar qualificação inicial.'),
    template: `Olá, ${leadName}! Tudo bem? Gostaria de entender mais sobre os desafios da ${companyName || 'sua empresa'}. Podemos marcar uma chamada rápida?`
  };

  return (
    <div className="px-5 py-4 space-y-4 animate-in fade-in duration-200">
      <Card className="p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] space-y-4 shadow-sm">
        {/* Report Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] pb-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[var(--color-primary-blue)]/10 border border-[var(--color-primary-blue)]/20 flex items-center justify-center">
              <Brain className="w-5 h-5 text-[var(--color-primary-blue)]" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-[var(--color-text-primary)] uppercase tracking-wider flex items-center gap-2">
                Relatório de Qualificação SDR
              </h4>
              <span className="text-[10px] text-[var(--color-text-faint)] font-medium block">
                Motor de Inteligência S.P.Y. Aurora
              </span>
            </div>
          </div>

          {/* Selector Context options */}
          <div className="bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] p-1 flex items-center gap-1 self-start sm:self-auto">
            {[
              { id: 'auto', label: 'Auto' },
              { id: 'normal', label: 'Vendas' },
              { id: 'educacao', label: 'Edu' },
              { id: 'posvenda', label: 'CS' }
            ].map(m => (
              <button
                key={m.id}
                onClick={() => setReportContextOverride(m.id as any)}
                className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                  activeMode === m.id || (m.id === 'auto' && reportContextOverride === 'auto')
                  ? 'bg-[var(--color-primary-blue)] text-white shadow-sm'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* MODE BANNER */}
        <div className="flex items-center justify-between p-3 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-[var(--radius-control)]">
          <div className="flex items-center gap-2 flex-1 min-w-0 pr-2">
            <span className="w-2 h-2 rounded-full bg-[var(--color-primary-blue)] animate-pulse"></span>
            <div className="text-xs truncate">
              <span className="text-[var(--color-text-muted)] font-medium">Contexto Ativo: </span>
              <span className="text-[var(--color-text-primary)] font-bold">
                {activeMode === 'educacao' ? 'Educação & Matrículas' : 
                 activeMode === 'posvenda' ? 'Pós-Venda & Onboarding' : 
                 'Comercial B2B / Corporativo'}
              </span>
            </div>
          </div>
          <Badge variant="default" dot>Ativo</Badge>
        </div>

        {/* DYNAMIC CONTENT PANELS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-3.5 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-[var(--radius-control)] space-y-2.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-primary-blue)] block border-b border-[var(--color-border-subtle)] pb-1.5">
              Diagnóstico do Lead
            </span>
            
            {activeMode === 'educacao' ? (
              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-[var(--color-text-muted)]">Turma:</span>
                  <span className="text-[var(--color-text-primary)] font-bold">{educacaoData.classChoice}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[var(--color-text-muted)]">Status:</span>
                  <Badge variant="neutral">{educacaoData.statusTurma}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[var(--color-text-muted)]">Presença:</span>
                  <span className="text-[var(--color-text-primary)] font-bold">{educacaoData.presenceInaugural}</span>
                </div>
                <div className="pt-1">
                  <span className="text-[var(--color-text-muted)] block mb-0.5">Objetivo:</span>
                  <p className="text-[var(--color-text-primary)] italic text-[11px]">"{educacaoData.primaryAim}"</p>
                </div>
              </div>
            ) : activeMode === 'posvenda' ? (
              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-[var(--color-text-muted)]">NPS:</span>
                  <span className="text-[var(--color-text-primary)] font-bold">{csData.npsScore}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[var(--color-text-muted)]">Engajamento:</span>
                  <span className="text-[var(--color-text-primary)] font-bold">{csData.activeUsers}</span>
                </div>
                <div className="pt-1">
                  <span className="text-[var(--color-text-muted)] block mb-0.5">Potencial:</span>
                  <p className="text-[var(--color-text-primary)] italic text-[11px]">"{csData.growthPotential}"</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-[var(--color-text-muted)]">Score IA:</span>
                  <span className="text-[var(--color-primary-blue)] font-mono font-bold">{normalData.leadScore}/100</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[var(--color-text-muted)]">Cargo / Perfil:</span>
                  <span className="text-[var(--color-text-primary)] font-bold">{normalData.cargo}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[var(--color-text-muted)]">Porte:</span>
                  <span className="text-[var(--color-text-primary)] font-bold">{normalData.potencialComercial}</span>
                </div>
                <div className="pt-1">
                  <span className="text-[var(--color-text-muted)] block mb-0.5">Dores Mapeadas:</span>
                  <p className="text-[var(--color-text-primary)] italic text-[11px]">"{normalData.mainDores}"</p>
                </div>
              </div>
            )}
          </div>

          <div className="p-3.5 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-[var(--radius-control)] space-y-2.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-primary-blue)] block border-b border-[var(--color-border-subtle)] pb-1.5">
              Playbook & Estratégia
            </span>
            
            <div className="text-xs space-y-2.5">
              <div>
                <span className="text-[var(--color-text-muted)] font-bold text-[10px] block mb-1">Diretriz Recomendada:</span>
                <p className="text-[var(--color-text-primary)] leading-relaxed text-[11px]">
                  {activeMode === 'educacao' ? educacaoData.playbook : 
                   activeMode === 'posvenda' ? csData.playbook : 
                   normalData.playbook}
                </p>
              </div>
              
              <div>
                <span className="text-[var(--color-text-muted)] font-bold text-[10px] block mb-1">Próxima Ação Clave:</span>
                <div className="p-2 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] text-[var(--color-text-primary)] font-bold text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[var(--color-primary-blue)] shrink-0" />
                  <span className="truncate">
                    {activeMode === 'educacao' ? educacaoData.nextStep : 
                     activeMode === 'posvenda' ? csData.nextStep : 
                     normalData.nextStep}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ONE CLICK MENSAGEM */}
        <div className="p-3.5 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-[var(--radius-control)]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-primary-blue)] flex items-center gap-1.5">
              <Send className="w-3.5 h-3.5" /> Abordagem Sugerida
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const txt = activeMode === 'educacao' ? educacaoData.template : 
                            activeMode === 'posvenda' ? csData.template : 
                            normalData.template;
                navigator.clipboard.writeText(txt);
                toast.success("Script de abordagem copiado!");
              }}
              className="text-[10px] h-7 px-2.5 font-bold gap-1"
            >
              <Copy className="w-3 h-3" /> Copiar Script
            </Button>
          </div>
          <p className="text-xs text-[var(--color-text-primary)] italic bg-[var(--color-surface-elevated)] p-3 rounded-[var(--radius-control)] border border-[var(--color-border-default)] leading-relaxed">
            "{activeMode === 'educacao' ? educacaoData.template : 
              activeMode === 'posvenda' ? csData.template : 
              normalData.template}"
          </p>
        </div>
      </Card>
    </div>
  );
}
