import { useState } from 'react';
import {
  AlertTriangle, CheckCircle2, XCircle, TrendingUp, TrendingDown,
  MessageSquare, Target, ShieldAlert, Zap, ClipboardList, Phone, Send,
  ChevronDown, ChevronUp, DollarSign, Clock, Users, BarChart3,
} from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import type { RevenueAnalysis } from '../../../../lib/revenueIntelligence';
import { StatusDot, ScoreBar, RiskBadge, IntensityBadge, SectionCard } from './helpers';

interface ResultsViewProps {
  result: RevenueAnalysis;
  onCreateTask: () => void;
  onReset: () => void;
}

export function ResultsView({ result, onCreateTask, onReset }: ResultsViewProps) {
  const [showWhatsapp, setShowWhatsapp] = useState(false);

  const probColor =
    result.closingProbability >= 70 ? 'text-emerald-400'
    : result.closingProbability >= 40 ? 'text-amber-400'
    : 'text-rose-400';

  function handleCopyWhatsapp() {
    if (!result.whatsappFollowUp) return;
    navigator.clipboard.writeText(result.whatsappFollowUp);
  }

  return (
    <div className="p-6 space-y-4">
      {/* Top stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[var(--color-surface)] border border-white/5 rounded-2xl p-4 text-center">
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1">Prob. Fechamento</p>
          <p className={`text-3xl font-black ${probColor}`}>{result.closingProbability}%</p>
        </div>
        <div className="bg-[var(--color-surface)] border border-white/5 rounded-2xl p-4 text-center">
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1">Temperatura</p>
          <p className={`text-xl font-black uppercase ${
            result.temperature === 'quente' ? 'text-rose-400'
            : result.temperature === 'morno' ? 'text-amber-400'
            : 'text-blue-400'
          }`}>{result.temperature}</p>
        </div>
        <div className="bg-[var(--color-surface)] border border-white/5 rounded-2xl p-4 text-center">
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1">Score BANT</p>
          <p className="text-3xl font-black text-white">{result.bantScore}<span className="text-sm text-slate-500">/8</span></p>
        </div>
      </div>

      {/* Urgent alerts */}
      {result.urgentAlerts.length > 0 && (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 space-y-1.5">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
            <span className="text-[10px] font-black text-rose-400 uppercase tracking-widest">Alertas Urgentes</span>
          </div>
          {result.urgentAlerts.map((a, i) => (
            <p key={i} className="text-xs text-rose-300 flex items-start gap-2">
              <span className="text-rose-500 shrink-0 mt-0.5">▸</span>{a}
            </p>
          ))}
        </div>
      )}

      {/* Executive summary */}
      <SectionCard title="Resumo Executivo" icon={BarChart3}>
        <p className="text-xs text-slate-300 leading-relaxed">{result.executiveSummary}</p>
        {result.managerInsights.length > 0 && (
          <div className="mt-3 space-y-1">
            {result.managerInsights.map((ins, i) => (
              <p key={i} className="text-[10px] text-slate-400 flex items-start gap-2">
                <span className="text-blue-400 shrink-0">•</span>{ins}
              </p>
            ))}
          </div>
        )}
      </SectionCard>

      {/* BANT */}
      <SectionCard title="Análise BANT" icon={Target}>
        <div className="space-y-3">
          {([
            { key: 'budget', label: 'Budget (Orçamento)', icon: DollarSign },
            { key: 'authority', label: 'Authority (Autoridade)', icon: Users },
            { key: 'need', label: 'Need (Necessidade)', icon: Zap },
            { key: 'timeline', label: 'Timeline (Prazo)', icon: Clock },
          ] as const).map(({ key, label, icon: Icon }) => {
            const item = result.bant[key];
            return (
              <div key={key} className="bg-white/[0.02] rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="w-3 h-3 text-slate-500" />
                    <span className="text-[10px] font-black text-white uppercase tracking-wider">{label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] text-slate-500 font-bold">{item.score}/2</span>
                    <StatusDot status={item.status} />
                  </div>
                </div>
                {item.evidence && item.evidence !== 'Não mencionado' ? (
                  <p className="text-[10px] text-slate-400 italic border-l-2 border-blue-500/30 pl-2">"{item.evidence}"</p>
                ) : (
                  <p className="text-[10px] text-slate-600">Não mencionado na transcrição</p>
                )}
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* Call quality + Playbook */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SectionCard title="Qualidade da Ligação" icon={Phone}>
          <div className="space-y-2 mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] text-slate-500 uppercase font-black tracking-wider">Nota Geral</span>
              <span className={`text-lg font-black ${result.callAnalysis.score >= 70 ? 'text-emerald-400' : result.callAnalysis.score >= 40 ? 'text-amber-400' : 'text-rose-400'}`}>
                {result.callAnalysis.score}/100
              </span>
            </div>
            {[
              { label: 'Rapport', val: result.callAnalysis.rapport },
              { label: 'Descoberta', val: result.callAnalysis.needDiscovery },
              { label: 'Investigação', val: result.callAnalysis.investigation },
              { label: 'Clareza', val: result.callAnalysis.presentationClarity },
              { label: 'Objeções', val: result.callAnalysis.objectionHandling },
              { label: 'Fechamento', val: result.callAnalysis.closing },
            ].map(({ label, val }) => (
              <div key={label}>
                <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">{label}</span>
                <ScoreBar value={val} color={val >= 70 ? 'emerald' : val >= 40 ? 'amber' : 'rose'} />
              </div>
            ))}
          </div>
          {result.callAnalysis.strengths.length > 0 && (
            <div className="space-y-1 mt-3">
              <p className="text-[9px] font-black text-emerald-400 uppercase tracking-wider">Pontos Fortes</p>
              {result.callAnalysis.strengths.map((s, i) => (
                <p key={i} className="text-[10px] text-slate-400 flex gap-1.5">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0 mt-0.5" />{s}
                </p>
              ))}
            </div>
          )}
          {result.callAnalysis.weaknesses.length > 0 && (
            <div className="space-y-1 mt-3">
              <p className="text-[9px] font-black text-rose-400 uppercase tracking-wider">Pontos de Melhoria</p>
              {result.callAnalysis.weaknesses.map((w, i) => (
                <p key={i} className="text-[10px] text-slate-400 flex gap-1.5">
                  <TrendingDown className="w-3 h-3 text-rose-500 shrink-0 mt-0.5" />{w}
                </p>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Aderência ao Playbook" icon={ClipboardList}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[9px] text-slate-500 uppercase font-black tracking-wider">Aderência</span>
            <span className={`text-2xl font-black ${result.playbookAnalysis.adherencePercent >= 70 ? 'text-emerald-400' : result.playbookAnalysis.adherencePercent >= 40 ? 'text-amber-400' : 'text-rose-400'}`}>
              {result.playbookAnalysis.adherencePercent}%
            </span>
          </div>
          <div className="space-y-1.5">
            {result.playbookAnalysis.steps.map((step, i) => (
              <div key={i} className="flex items-center gap-2">
                {step.done
                  ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  : <XCircle className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                }
                <span className={`text-[10px] font-medium ${step.done ? 'text-slate-300' : 'text-slate-600'}`}>{step.label}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      {/* Commercial validation */}
      {result.commercialValidation.priceAlert && (
        <SectionCard title="Alerta Comercial" icon={ShieldAlert} className="border-amber-500/20 bg-amber-500/5">
          <div className="space-y-2">
            {result.commercialValidation.issues.map((issue, i) => (
              <p key={i} className="text-xs text-amber-300 flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />{issue}
              </p>
            ))}
            <div className="grid grid-cols-2 gap-3 mt-3">
              {result.commercialValidation.mentionedPrice && (
                <div className="bg-white/5 rounded-xl p-2">
                  <p className="text-[9px] text-slate-500 uppercase font-black">Falado na ligação</p>
                  <p className="text-xs text-white font-bold">{result.commercialValidation.mentionedPrice}</p>
                </div>
              )}
              {result.commercialValidation.officialPrice && (
                <div className="bg-white/5 rounded-xl p-2">
                  <p className="text-[9px] text-slate-500 uppercase font-black">Valor Oficial Vendas</p>
                  <p className="text-xs text-emerald-400 font-bold">{result.commercialValidation.officialPrice}</p>
                </div>
              )}
            </div>
          </div>
        </SectionCard>
      )}

      {/* Objections + Buying signals */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {result.objections.length > 0 && (
          <SectionCard title={`Objeções (${result.objections.length})`} icon={XCircle}>
            <div className="space-y-2">
              {result.objections.map((obj, i) => (
                <div key={i} className="bg-white/[0.02] rounded-xl p-2.5 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-black text-rose-400 uppercase">{obj.category}</span>
                    {obj.handled
                      ? <span className="text-[9px] text-emerald-400 font-bold">✓ Tratada</span>
                      : <span className="text-[9px] text-rose-400 font-bold">⚠ Não tratada</span>
                    }
                  </div>
                  <p className="text-[10px] text-slate-300">"{obj.text}"</p>
                </div>
              ))}
            </div>
          </SectionCard>
        )}
        {result.buyingSignals.length > 0 && (
          <SectionCard title={`Sinais de Compra (${result.buyingSignals.length})`} icon={TrendingUp}>
            <div className="space-y-2">
              {result.buyingSignals.map((sig, i) => (
                <div key={i} className="bg-white/[0.02] rounded-xl p-2.5 space-y-1">
                  <IntensityBadge level={sig.intensity} />
                  <p className="text-[10px] text-slate-300">"{sig.text}"</p>
                </div>
              ))}
            </div>
          </SectionCard>
        )}
      </div>

      {/* Risk + Next action */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SectionCard title="Risco de Perda" icon={ShieldAlert}>
          <div className="flex items-center gap-3 mb-2">
            <RiskBadge level={result.lossRisk.level} />
          </div>
          <p className="text-xs text-slate-400">{result.lossRisk.reason}</p>
        </SectionCard>
        <SectionCard title="Próxima Melhor Ação" icon={Zap} className="border-blue-500/10 bg-blue-500/5">
          <p className="text-sm font-bold text-white">{result.nextBestAction}</p>
        </SectionCard>
      </div>

      {/* Auto task */}
      {result.task && (
        <SectionCard title="Tarefa Detectada" icon={ClipboardList}>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs font-bold text-white">{result.task.title}</p>
              <p className="text-[10px] text-slate-400">{result.task.date} {result.task.time}</p>
              <p className="text-[10px] text-slate-500">{result.task.description}</p>
            </div>
            <Button
              onClick={onCreateTask}
              className="shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-8 px-4 text-[10px] font-black uppercase tracking-wider"
            >
              Criar Tarefa
            </Button>
          </div>
        </SectionCard>
      )}

      {/* WhatsApp follow-up */}
      <SectionCard title="Retomada WhatsApp" icon={MessageSquare}>
        <div className="space-y-3">
          <button
            onClick={() => setShowWhatsapp(v => !v)}
            className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 hover:text-white bg-transparent border-none cursor-pointer p-0 transition-colors"
          >
            {showWhatsapp ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {showWhatsapp ? 'Ocultar mensagem' : 'Ver mensagem sugerida'}
          </button>
          {showWhatsapp && (
            <div className="bg-[#075e54]/10 border border-[#25d366]/20 rounded-xl p-3">
              <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap font-mono">
                {result.whatsappFollowUp}
              </p>
              <Button
                onClick={handleCopyWhatsapp}
                className="mt-3 bg-[#25d366] hover:bg-[#1da851] text-white rounded-xl h-8 px-4 text-[10px] font-black uppercase tracking-wider gap-1.5"
              >
                <Send className="w-3 h-3" /> Copiar Mensagem
              </Button>
            </div>
          )}
        </div>
      </SectionCard>

      <button
        onClick={onReset}
        className="w-full py-2 text-[10px] text-slate-600 hover:text-slate-400 font-bold uppercase tracking-wider border border-dashed border-white/5 hover:border-white/10 rounded-xl transition-all bg-transparent cursor-pointer"
      >
        ← Nova Análise
      </button>
    </div>
  );
}
