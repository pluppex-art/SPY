import { useMemo, useState } from "react";
import {
  Brain, Zap, Users, ShoppingBag, Megaphone, Package, Share2,
} from "lucide-react";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { useData } from "../../contexts/DataContext";
import { useLocalization } from "../../contexts/LocalizationContext";
import { parseCurrencyBR } from "../../lib/utils";
import { computeChannelRevenue, computeProductRevenue, buildAuroraAcoes, type DashboardData } from "./revenueInsights";

const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
type Aba = "clientes" | "vendas" | "marketing" | "produtos";

export default function InteligenciaAurora({ dashboard }: { dashboard: DashboardData }) {
  const { contracts, proposals, proposalItems, products, leadActivities } = useData();
  const { leads, salesRanking } = dashboard;
  const { formatCurrency } = useLocalization();
  const [aba, setAba] = useState<Aba>("clientes");

  const leadsAbertos = useMemo(() => (leads as any[]).filter((l) => l.status !== "Fechado" && l.status !== "Perdido"), [leads]);
  const contratosEmRisco = useMemo(() => (contracts as any[]).filter((c) => c.status === "Inadimplente"), [contracts]);
  const oportunidadesRecuperaveis = useMemo(
    () => leadsAbertos.filter((l: any) => (l.scoreIA ?? 0) > 70 && (Number(l.timeIdle) || 0) > 3 && parseCurrencyBR(l.value) > 0),
    [leadsAbertos]
  );
  const recuperavelValue = oportunidadesRecuperaveis.reduce((s: number, l: any) => s + parseCurrencyBR(l.value), 0);
  const propostasSemFollowUp = useMemo(() => (proposals as any[] || []).filter((p) => p.status === "Enviada"), [proposals]);
  const propostasSemFollowUpValue = propostasSemFollowUp.reduce((s, p) => s + parseCurrencyBR(p.valor), 0);
  const auroraAcoes = useMemo(() => buildAuroraAcoes({
    leadsAbertos, oportunidadesRecuperaveis, recuperavelValue, contratosEmRisco, propostasSemFollowUp, propostasSemFollowUpValue,
  }), [leadsAbertos, oportunidadesRecuperaveis, recuperavelValue, contratosEmRisco, propostasSemFollowUp, propostasSemFollowUpValue]);
  const impactoTotal = auroraAcoes.reduce((s, a) => s + a.valor, 0);

  const canais = useMemo(() => computeChannelRevenue(leads), [leads]);
  const produtos = useMemo(() => computeProductRevenue(proposals, proposalItems, products), [proposals, proposalItems, products]);

  // Taxa de conversão geral vs leads com score alto — correlação real, direto dos dados.
  const scoreCorrelacao = useMemo(() => {
    const altos = (leads as any[]).filter((l) => (l.scoreIA ?? 0) > 80);
    const baixos = (leads as any[]).filter((l) => (l.scoreIA ?? 0) <= 80);
    const taxaAlta = altos.length > 0 ? (altos.filter((l) => l.status === "Fechado").length / altos.length) * 100 : 0;
    const taxaBaixa = baixos.length > 0 ? (baixos.filter((l) => l.status === "Fechado").length / baixos.length) * 100 : 0;
    return { taxaAlta: Math.round(taxaAlta * 10) / 10, taxaBaixa: Math.round(taxaBaixa * 10) / 10, amostraAlta: altos.length, amostraBaixa: baixos.length };
  }, [leads]);

  // Melhor dia da semana pra propostas aceitas.
  const melhorDia = useMemo(() => {
    const counts = new Array(7).fill(0);
    (proposals as any[] || []).filter((p) => p.status === "Aceita" && p.created_at).forEach((p) => {
      const d = new Date(p.created_at).getDay();
      if (Number.isFinite(d)) counts[d]++;
    });
    const total = counts.reduce((s, c) => s + c, 0);
    const ranked = counts.map((c, i) => ({ dia: DIAS_SEMANA[i], count: c, pct: total > 0 ? Math.round((c / total) * 1000) / 10 : 0 })).sort((a, b) => b.count - a.count);
    return ranked;
  }, [proposals]);

  // Tempo até o primeiro contato (lead criado -> 1ª atividade) x conversão.
  const tempoPrimeiroContato = useMemo(() => {
    const primeiraAtividade = new Map<string, number>();
    (leadActivities as any[]).forEach((a) => {
      const t = new Date(a.date).getTime();
      if (!Number.isFinite(t)) return;
      const cur = primeiraAtividade.get(a.leadId);
      if (cur === undefined || t < cur) primeiraAtividade.set(a.leadId, t);
    });
    const buckets = [
      { label: "Mesmo dia", min: 0, max: 1, fechados: 0, total: 0 },
      { label: "1-3 dias", min: 1, max: 3, fechados: 0, total: 0 },
      { label: "Acima de 3 dias", min: 3, max: Infinity, fechados: 0, total: 0 },
    ];
    (leads as any[]).forEach((l) => {
      const criado = new Date(l.created_at || "").getTime();
      const primeira = primeiraAtividade.get(l.id);
      if (!Number.isFinite(criado) || primeira === undefined) return;
      const diasAteContato = Math.max(0, (primeira - criado) / 86400000);
      const bucket = buckets.find((b) => diasAteContato >= b.min && diasAteContato < b.max);
      if (!bucket) return;
      bucket.total++;
      if (l.status === "Fechado") bucket.fechados++;
    });
    return buckets.map((b) => ({ ...b, conversao: b.total > 0 ? Math.round((b.fechados / b.total) * 1000) / 10 : 0 }));
  }, [leads, leadActivities]);

  const insights = useMemo(() => {
    const lista: { titulo: string; subtitulo: string; tone: "destructive" | "warning" | "success" | "info" }[] = [];
    const canalTop = [...canais].filter((c) => c.leads >= 3).sort((a, b) => b.conversao - a.conversao)[0];
    const convMedia = canais.reduce((s, c) => s + c.fechados, 0) / Math.max(canais.reduce((s, c) => s + c.leads, 0), 1) * 100;
    if (canalTop && canalTop.conversao > convMedia) {
      lista.push({ titulo: `Leads de ${canalTop.origem} convertem mais`, subtitulo: `Taxa de ${canalTop.conversao}% nesse canal, contra ${Math.round(convMedia * 10) / 10}% de média geral.`, tone: "success" });
    }
    if (scoreCorrelacao.amostraAlta >= 3 && scoreCorrelacao.taxaAlta > scoreCorrelacao.taxaBaixa) {
      lista.push({ titulo: "Score IA alto prevê fechamento", subtitulo: `Leads com Score IA acima de 80 fecham ${scoreCorrelacao.taxaAlta}% das vezes, contra ${scoreCorrelacao.taxaBaixa}% dos demais.`, tone: "success" });
    }
    const diaTop = melhorDia[0];
    if (diaTop && diaTop.count >= 2) {
      lista.push({ titulo: `Propostas aceitas concentram-se em ${diaTop.dia}`, subtitulo: `${diaTop.pct}% das propostas aceitas foram criadas numa ${diaTop.dia}.`, tone: "info" });
    }
    const bucketRapido = tempoPrimeiroContato[0];
    const bucketLento = tempoPrimeiroContato[tempoPrimeiroContato.length - 1];
    if (bucketRapido.total >= 3 && bucketLento.total >= 3 && bucketRapido.conversao > bucketLento.conversao) {
      lista.push({ titulo: "Contato rápido aumenta conversão", subtitulo: `Leads contactados no mesmo dia fecham ${bucketRapido.conversao}%, contra ${bucketLento.conversao}% quando o contato leva mais de 3 dias.`, tone: "warning" });
    }
    if (produtos[0]) {
      lista.push({ titulo: `${produtos[0].produto} lidera em receita`, subtitulo: `Responde por ${produtos[0].pct}% da receita de propostas aceitas no período.`, tone: "info" });
    }
    return lista;
  }, [canais, scoreCorrelacao, melhorDia, tempoPrimeiroContato, produtos]);

  const aprendizados: Record<Aba, { icon: typeof Users; texto: string }[]> = {
    clientes: [
      ...(contratosEmRisco.length > 0 ? [{ icon: Users, texto: `${contratosEmRisco.length} cliente(s) estão inadimplentes agora, somando ${formatCurrency(contratosEmRisco.reduce((s, c) => s + parseCurrencyBR(c.mrr), 0))} em MRR de risco.` }] : []),
      { icon: Users, texto: `Leads com Score IA > 80 fecham ${scoreCorrelacao.taxaAlta}% das vezes (amostra de ${scoreCorrelacao.amostraAlta}), contra ${scoreCorrelacao.taxaBaixa}% dos demais.` },
    ],
    vendas: [
      ...(salesRanking[0] ? [{ icon: ShoppingBag, texto: `${salesRanking[0].name} é quem mais fecha negócios, com ${formatCurrency(salesRanking[0].total)} em vendas.` }] : []),
      { icon: ShoppingBag, texto: `${propostasSemFollowUp.length} proposta(s) aguardam aceite agora, somando ${formatCurrency(propostasSemFollowUpValue)}.` },
    ],
    marketing: canais.slice(0, 2).map((c) => ({ icon: Megaphone, texto: `${c.origem}: ${c.leads} lead(s) captados, ${c.conversao}% de conversão, ticket médio ${formatCurrency(c.ticketMedio)}.` })),
    produtos: produtos.slice(0, 2).map((p) => ({ icon: Package, texto: `${p.produto}: ${formatCurrency(p.receita)} em receita (${p.pct}% do total)${p.margem !== null ? `, margem de ${p.margem}%` : ""}.` })),
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-black text-[var(--color-text-primary)]">Inteligência Aurora</h2>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">O que a Aurora identifica na sua operação, a partir dos seus dados reais.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <Card className="lg:col-span-8 p-6 bg-gradient-to-br from-[var(--color-primary-blue)] to-[var(--color-primary-blue)]/70 border-none text-white">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0"><Brain className="w-5 h-5" /></div>
            <div>
              <p className="text-sm font-black">Aurora</p>
              <p className="text-xs text-white/80">Sua inteligência de receita</p>
            </div>
          </div>
          <p className="text-sm leading-relaxed mb-4">
            Identifiquei <strong>{insights.length} padrão(ões)</strong> na sua operação e <strong>{auroraAcoes.length} ação(ões) prioritária(s)</strong> que podem impactar sua receita em até <strong>{formatCurrency(impactoTotal)}</strong>.
          </p>
          <div className="flex flex-wrap gap-3">
            <div className="bg-white/10 rounded-xl px-4 py-2.5"><p className="text-lg font-black font-mono">{insights.length}</p><p className="text-[9px] uppercase font-bold text-white/70">Padrões identificados</p></div>
            <div className="bg-white/10 rounded-xl px-4 py-2.5"><p className="text-lg font-black font-mono">{auroraAcoes.length}</p><p className="text-[9px] uppercase font-bold text-white/70">Ações sinalizadas</p></div>
            <div className="bg-white/10 rounded-xl px-4 py-2.5"><p className="text-lg font-black font-mono">{formatCurrency(impactoTotal)}</p><p className="text-[9px] uppercase font-bold text-white/70">Impacto potencial</p></div>
          </div>
        </Card>

        <Card className="lg:col-span-4 p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
          <h3 className="text-xs font-black text-[var(--color-text-primary)] uppercase tracking-wider mb-3 flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" /> Melhor dia pra propostas</h3>
          <div className="space-y-2">
            {melhorDia.slice(0, 4).map((d) => (
              <div key={d.dia} className="flex items-center gap-2">
                <span className="text-[10px] text-[var(--color-text-muted)] font-semibold w-16 shrink-0">{d.dia}</span>
                <div className="flex-1 h-1.5 bg-[var(--color-surface-sunken)] rounded-full overflow-hidden">
                  <div className="h-full bg-[var(--color-primary-blue)] rounded-full" style={{ width: `${Math.max(2, d.pct)}%` }} />
                </div>
                <span className="text-[10px] font-bold text-[var(--color-text-primary)] w-8 text-right shrink-0">{d.pct}%</span>
              </div>
            ))}
            {melhorDia.every((d) => d.count === 0) && <p className="text-xs text-[var(--color-text-faint)] italic">Sem propostas aceitas ainda.</p>}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <Card className="lg:col-span-7 overflow-hidden bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
          <div className="p-4 border-b border-[var(--color-border-subtle)] flex items-center justify-between">
            <h3 className="text-xs font-black text-[var(--color-text-primary)] uppercase tracking-wider">Principais Insights Identificados</h3>
            <Badge variant="secondary">{insights.length}</Badge>
          </div>
          <div className="divide-y divide-[var(--color-border-subtle)]">
            {insights.map((ins, i) => (
              <div key={i} className="px-4 py-3 flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-[var(--color-surface-sunken)] flex items-center justify-center text-[10px] font-black text-[var(--color-text-primary)] shrink-0 mt-0.5">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-[var(--color-text-primary)]">{ins.titulo}</p>
                  <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">{ins.subtitulo}</p>
                </div>
                <Badge variant={ins.tone}>{ins.tone === "success" ? "Alto impacto" : ins.tone === "warning" ? "Atenção" : "Oportunidade"}</Badge>
              </div>
            ))}
            {insights.length === 0 && <p className="px-4 py-10 text-center text-[var(--color-text-faint)] text-xs">Ainda não há dado suficiente pra identificar padrões confiáveis.</p>}
          </div>
        </Card>

        <Card className="lg:col-span-5 overflow-hidden bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
          <div className="p-3 border-b border-[var(--color-border-subtle)] flex items-center gap-1">
            {([["clientes", "Clientes", Users], ["vendas", "Vendas", ShoppingBag], ["marketing", "Marketing", Megaphone], ["produtos", "Produtos", Package]] as const).map(([v, label, Icon]) => (
              <button
                key={v}
                onClick={() => setAba(v)}
                className={`px-2.5 py-1.5 text-[10px] font-bold rounded-lg transition-all flex items-center gap-1 ${aba === v ? "bg-[var(--color-primary-blue)] !text-white" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"}`}
              >
                <Icon className="w-3 h-3" /> {label}
              </button>
            ))}
          </div>
          <div className="p-4 space-y-2.5">
            {aprendizados[aba].length === 0 ? (
              <p className="text-xs text-[var(--color-text-faint)] italic">Sem dado suficiente ainda nessa categoria.</p>
            ) : (
              aprendizados[aba].map((a, i) => (
                <div key={i} className="flex items-start gap-2.5 bg-[var(--color-surface-sunken)] rounded-xl px-3.5 py-2.5">
                  <a.icon className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[var(--color-primary-blue)]" />
                  <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">{a.texto}</p>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <Card className="p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
        <h3 className="text-xs font-black text-[var(--color-text-primary)] uppercase tracking-wider mb-4 flex items-center gap-1.5"><Share2 className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" /> Canais com maior conversão</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {canais.slice(0, 6).map((c) => (
            <div key={c.origem} className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] p-3.5">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-[var(--color-text-primary)] truncate">{c.origem}</span>
                <span className="text-xs font-black font-mono text-[var(--color-primary-blue)]">{c.conversao}%</span>
              </div>
              <p className="text-[10px] text-[var(--color-text-faint)]">{c.leads} leads · {c.fechados} fechado{c.fechados === 1 ? "" : "s"} · ticket médio {formatCurrency(c.ticketMedio)}</p>
            </div>
          ))}
          {canais.length === 0 && <p className="text-xs text-[var(--color-text-faint)] italic">Sem leads ainda.</p>}
        </div>
      </Card>
    </div>
  );
}
