import { useMemo, useState } from "react";
import { toast } from "sonner";
import { FileSpreadsheet, ArrowDownCircle, ArrowUpCircle, CalendarClock, AlertTriangle, Wallet, MessageCircle, Copy } from "lucide-react";
import { exportarXlsx, dataParaArquivo } from "../../lib/exportXlsx";
import { PageContainer } from "../../components/PageContainer";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { FinanceKpiGrid } from "./components/FinanceKpiGrid";
import { kpiSimples } from "./components/kpiSimples";
import { useLocalization } from "../../contexts/LocalizationContext";
import { useAuth } from "../../contexts/AuthContext";
import { LegendaStatusFinanceiro, StatusFinanceiroBadge } from "./components/StatusFinanceiroBadge";
import { hojeISO, statusDoLancamento, useFinanceEntriesResumo } from "./hooks/useFinanceEntriesResumo";
import { SecaoCard } from "./components/SecaoCard";
import { FinanceiroFilterBar } from "./components/FinanceiroFilterBar";
import { useFinanceiroFiltro } from "./FinanceiroFilterContext";
import { BotaoRelatorio } from "../../components/relatorio/BotaoRelatorio";

const soma = (xs: { value: number }[]) => xs.reduce((a, x) => a + x.value, 0);
const dataBR = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");

/**
 * Central de Resumo — o "quanto tenho, quanto entrou, quanto saiu, o que vence"
 * numa tela só, mais o texto pronto para mandar no WhatsApp. Funciona para
 * qualquer tipo de empresa: tudo vem dos lançamentos já feitos.
 */
export default function FinanceiroCentralResumo() {
  const { rows, loading, erro, hoje } = useFinanceEntriesResumo();
  const { formatCurrency: brl } = useLocalization();
  const { user } = useAuth();
  const { periodoFrom, periodoTo } = useFinanceiroFiltro();

  const r = useMemo(() => {
    // Entradas e saídas do período do filtro padrão (datas em AAAA-MM-DD); em aberto e previsão seguem a situação de hoje.
    const doMes = rows.filter((l) => !!l.date && (!periodoFrom || l.date >= periodoFrom) && (!periodoTo || l.date <= periodoTo));
    const entradas = soma(doMes.filter((l) => l.type === "Receber" && l.status === "Pago"));
    const saidas = soma(doMes.filter((l) => l.type === "Pagar" && l.status === "Pago"));
    const pagarAberto = rows.filter((l) => l.type === "Pagar" && l.status !== "Pago");
    const receberAberto = rows.filter((l) => l.type === "Receber" && l.status !== "Pago");
    const vencidosPagar = pagarAberto.filter((l) => statusDoLancamento(l, hoje) === "Atrasado");
    const aVencerPagar = pagarAberto.filter((l) => statusDoLancamento(l, hoje) !== "Atrasado");
    const vencidosReceber = receberAberto.filter((l) => statusDoLancamento(l, hoje) === "Atrasado");
    const proximos = [...pagarAberto]
      .sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"))
      .slice(0, 8);
    const somarDias = (n: number) => {
      const d = new Date();
      d.setDate(d.getDate() + n);
      return hojeISO(d);
    };
    // Previsão: tudo que está em aberto (inclui o que já venceu) com vencimento até o horizonte.
    const previsao = [30, 60, 90].map((dias) => {
      const limite = somarDias(dias);
      const entra = soma(receberAberto.filter((l) => !l.date || l.date <= limite));
      const sai = soma(pagarAberto.filter((l) => !l.date || l.date <= limite));
      return { dias, entra, sai, saldo: entra - sai };
    });
    return {
      previsao,
      entradas,
      saidas,
      saldoMes: entradas - saidas,
      totalPagar: soma(pagarAberto),
      vencidosPagar: soma(vencidosPagar),
      qtdVencidosPagar: vencidosPagar.length,
      aVencerPagar: soma(aVencerPagar),
      totalReceber: soma(receberAberto),
      vencidosReceber: soma(vencidosReceber),
      proximos,
    };
  }, [rows, hoje, periodoFrom, periodoTo]);

  const textoGerado = useMemo(() => {
    const [a, m, d] = hoje.split("-");
    return [
      `*Resumo financeiro — ${d}/${m}/${a}*`,
      ``,
      `Entradas no período (recebido): ${brl(r.entradas)}`,
      `Saídas no período (pago): ${brl(r.saidas)}`,
      `Saldo do período: ${brl(r.saldoMes)}`,
      ``,
      ...r.previsao.map((p) => `Previsão ${p.dias} dias: entra ${brl(p.entra)} / sai ${brl(p.sai)} → ${p.saldo < 0 ? "déficit" : "sobra"} ${brl(Math.abs(p.saldo))}`),
      ``,
      `A receber: ${brl(r.totalReceber)} (vencido: ${brl(r.vencidosReceber)})`,
      `Total a pagar: ${brl(r.totalPagar)}`,
      `  • Vencido: ${brl(r.vencidosPagar)} (${r.qtdVencidosPagar} conta${r.qtdVencidosPagar === 1 ? "" : "s"})`,
      `  • A vencer: ${brl(r.aVencerPagar)}`,
      ...(r.proximos.length
        ? [``, `*Próximos vencimentos:*`, ...r.proximos.map((l) => `• ${dataBR(l.date)} — ${l.description} — ${brl(l.value)}`)]
        : []),
    ].join("\n");
  }, [r, hoje, brl]);
  // O texto pode ser editado antes de enviar; enquanto não mexerem, acompanha os números.
  const [editado, setEditado] = useState<string | null>(null);
  const texto = editado ?? textoGerado;

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("Resumo copiado.");
    } catch {
      toast.error("Não foi possível copiar. Selecione o texto e copie manualmente.");
    }
  };
  const exportar = async () => {
    try {
      await exportarXlsx(`resumo-financeiro-${dataParaArquivo()}`, [
        {
          nome: "Resumo",
          colunas: [{ titulo: "Indicador", largura: 34 }, { titulo: "Valor", tipo: "moeda" }],
          linhas: [
            ["Entradas do período (recebido)", r.entradas], ["Saídas do período (pago)", r.saidas], ["Saldo do período", r.saldoMes],
            ["A receber (em aberto)", r.totalReceber], ["A receber em atraso", r.vencidosReceber],
            ["Total a pagar", r.totalPagar], ["A pagar vencido", r.vencidosPagar], ["A pagar a vencer", r.aVencerPagar],
            ...r.previsao.map((p) => [`Previsão ${p.dias} dias (entra − sai)`, p.saldo]),
          ],
        },
        {
          nome: "Próximos vencimentos",
          colunas: [{ titulo: "Vencimento", tipo: "data" }, { titulo: "Descrição", largura: 40 }, { titulo: "Fornecedor", largura: 28 }, { titulo: "Valor", tipo: "moeda" }, { titulo: "Status", largura: 12 }],
          linhas: r.proximos.map((l) => [l.date, l.description, l.counterparty, l.value, statusDoLancamento(l, hoje)]),
        },
      ]);
      toast.success("Planilha gerada.");
    } catch {
      toast.error("Não foi possível gerar a planilha.");
    }
  };
  const abrirWhatsApp = () => window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener");

  return (
    <PageContainer
      title="Central de Resumo"
      breadcrumb={[{ label: "Financeiro", path: "/app/financeiro/dashboard" }, { label: "Central de Resumo" }]}
      description={`Visão rápida do caixa${user?.name ? `, ${user.name.split(" ")[0]}` : ""}: o que entrou, o que saiu e o que vence.`}
      actions={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <FinanceiroFilterBar />
          <BotaoRelatorio area="financeiro" periodo={{ de: periodoFrom, ate: periodoTo }} />
          <Button variant="outline" onClick={exportar}><FileSpreadsheet className="mr-2 h-4 w-4" />Planilha</Button>
          <Button variant="outline" onClick={copiar}><Copy className="mr-2 h-4 w-4" />Copiar</Button>
          <Button onClick={abrirWhatsApp}><MessageCircle className="mr-2 h-4 w-4" />Gerar resumo para WhatsApp</Button>
        </div>
      }
    >
      <div className="space-y-4 max-w-[1700px] mx-auto pb-12">
      {erro && <Card className="p-4 text-sm text-red-600">{erro}</Card>}

      <FinanceKpiGrid
        cards={[
          kpiSimples("Entradas do período", loading ? "…" : brl(r.entradas), ArrowUpCircle, "Recebimentos pagos"),
          kpiSimples("Saídas do período", loading ? "…" : brl(r.saidas), ArrowDownCircle, "Pagamentos feitos"),
          kpiSimples("Saldo do período", loading ? "…" : brl(r.saldoMes), Wallet, "Entradas − saídas", r.saldoMes < 0),
          kpiSimples("Previsão 30 dias", loading ? "…" : `${r.previsao[0].saldo < 0 ? "Déficit " : "Sobra "}${brl(Math.abs(r.previsao[0].saldo))}`, CalendarClock, "Entra − sai até 30 dias", r.previsao[0].saldo < 0),
          kpiSimples("Total a pagar", loading ? "…" : brl(r.totalPagar), CalendarClock, `A vencer: ${brl(r.aVencerPagar)}`),
          kpiSimples("Vencido a pagar", loading ? "…" : brl(r.vencidosPagar), AlertTriangle, `${r.qtdVencidosPagar} conta(s)`, r.vencidosPagar > 0),
          kpiSimples("A receber", loading ? "…" : brl(r.totalReceber), ArrowUpCircle, "Pendente + atrasado"),
          kpiSimples("Recebimentos em atraso", loading ? "…" : brl(r.vencidosReceber), AlertTriangle, "Vencidos e não pagos", r.vencidosReceber > 0),
        ]}
      />

      <SecaoCard titulo="Previsão de caixa (30, 60 e 90 dias)">
        <p className="mb-3 text-xs text-[var(--color-text-muted)]">Entradas e saídas em aberto que vencem até cada data (inclui o que já venceu e não foi pago). Não considera o saldo atual das contas.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {r.previsao.map((p) => (
            <div key={p.dias} className="rounded-lg border border-[var(--color-border-default)] p-3 text-sm">
              <p className="mb-1 font-semibold">Próximos {p.dias} dias</p>
              <p className="text-emerald-600">Entra: {brl(p.entra)}</p>
              <p className="text-red-600">Sai: {brl(p.sai)}</p>
              <p className={`mt-1 font-bold ${p.saldo < 0 ? "text-red-600" : "text-emerald-600"}`}>
                {p.saldo < 0 ? "Déficit" : "Sobra"}: {brl(Math.abs(p.saldo))}
              </p>
            </div>
          ))}
        </div>
      </SecaoCard>

      <SecaoCard titulo="Próximos vencimentos (contas a pagar)">
        {r.proximos.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">{loading ? "Carregando…" : "Nenhuma conta a pagar em aberto."}</p>
        ) : (
          <ul className="divide-y divide-[var(--color-border-default)]">
            {r.proximos.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{l.description}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">{dataBR(l.date)}{l.counterparty ? ` · ${l.counterparty}` : ""}</p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusFinanceiroBadge status={statusDoLancamento(l, hoje)} />
                  <span className="font-semibold tabular-nums">{brl(l.value)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SecaoCard>

      <SecaoCard titulo="Texto do resumo (editável, vai para o WhatsApp)">
        <textarea
          value={texto}
          onChange={(e) => setEditado(e.target.value)}
          rows={Math.min(24, texto.split("\n").length + 1)}
          aria-label="Texto do resumo, editável"
          className="w-full resize-y rounded-lg border border-[var(--color-border-default)] bg-transparent p-3 text-xs font-mono leading-relaxed"
        />
        {editado !== null && (
          <button type="button" onClick={() => setEditado(null)} className="mt-2 text-xs text-[var(--color-primary-blue)] bg-transparent border-none cursor-pointer p-0">
            Restaurar texto automático
          </button>
        )}
      </SecaoCard>

      <LegendaStatusFinanceiro />
      </div>
    </PageContainer>
  );
}
