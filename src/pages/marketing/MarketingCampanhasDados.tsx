import { DateRangeFilter } from "../../components/ui/DateRangeFilter";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Inbox, MousePointerClick, Target, TrendingUp } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar } from "recharts";
import { PageContainer } from "../../components/PageContainer";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { EmptyState } from "../../components/ui/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "../../components/ui/table";
import { useData } from "../../contexts/DataContext";
import { canalDoLead } from "../../lib/canalAquisicao";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const CANAIS = [["todos", "Todos os canais"], ["meta", "Meta Ads"], ["google", "Google Ads"], ["outros", "Outros"]] as const;
const isoDia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Dados dos leads por campanha/origem de tráfego: dia da semana, volume e desempenho por origem, com filtro de canal e período. */
export default function MarketingCampanhasDados() {
  const { leads } = useData();
  const [canal, setCanal] = useState<(typeof CANAIS)[number][0]>("todos");
  // Período no seletor padrão do sistema (padrão: últimos 90 dias).
  const [de, setDe] = useState<string | null>(() => isoDia(new Date(Date.now() - 89 * 86_400_000)));
  const [ate, setAte] = useState<string | null>(() => isoDia(new Date()));

  const filtrados = useMemo(() => {
    const ini = de ? new Date(`${de}T00:00:00`).getTime() : 0;
    const fim = ate ? new Date(`${ate}T23:59:59`).getTime() : Infinity;
    return leads.filter((l) => {
      const c = canalDoLead(l as any);
      const grupo = c === "Meta" ? "meta" : c === "Google" || c === "YouTube" ? "google" : "outros";
      if (canal !== "todos" && grupo !== canal) return false;
      if (!ini && fim === Infinity) return true;
      const t = new Date(l.date || (l as any).createdAt || "").getTime();
      return !Number.isNaN(t) && t >= ini && t <= fim;
    });
  }, [leads, canal, de, ate]);

  const totalLeads = filtrados.length;
  const trafficData = useMemo(() => WEEKDAYS.map((day) => ({ name: day, leads: filtrados.filter((l) => { const d = new Date(l.date || (l as any).createdAt || ""); return !Number.isNaN(d.getTime()) && WEEKDAYS[d.getDay()] === day; }).length })), [filtrados]);

  return (
    <PageContainer
      title="Dados de Campanhas"
      subtitle="Como os leads chegam por canal e origem de tráfego. Use os filtros para ver só o Meta Ads, só o Google Ads ou os demais."
      actions={<Link to="/app/marketing/campanhas"><Button variant="outline" className="gap-2 text-xs font-bold"><ArrowLeft className="w-3.5 h-3.5" /> Voltar para Campanhas</Button></Link>}
    >
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex gap-1.5 flex-wrap">{CANAIS.map(([id, rotulo]) => (
          <button key={id} type="button" onClick={() => setCanal(id)} className={`px-3 py-1.5 rounded-full text-xs font-bold border ${canal === id ? "bg-[var(--color-primary-blue)] text-white border-transparent" : "bg-transparent text-[var(--color-text-muted)] border-[var(--color-border-default)]"}`}>{rotulo}</button>))}</div>
        <DateRangeFilter dateFrom={de} setDateFrom={setDe} dateTo={ate} setDateTo={setAte} />
        <span className="text-xs text-[var(--color-text-muted)]">{totalLeads} lead(s) no filtro</span>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <Card className="p-5">
          <h3 className="text-sm font-bold text-[var(--color-text-primary)] uppercase tracking-wider mb-4 flex items-center gap-2">
            <Target className="w-4 h-4 text-[var(--color-primary-blue)]" /> Leads por Dia da Semana
          </h3>
          {totalLeads === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center gap-2 opacity-50">
              <Inbox className="w-8 h-8 text-[var(--color-text-faint)]" />
              <p className="text-xs text-[var(--color-text-muted)] font-medium">Nenhum lead registrado na base.</p>
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trafficData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.15)" vertical={false} />
                  <XAxis dataKey="name" stroke="var(--color-text-faint)" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--color-text-faint)" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--color-surface-elevated)",
                      border: "1px solid var(--color-border-default)",
                      borderRadius: "12px",
                      fontSize: "12px",
                      color: "var(--color-text-primary)",
                      boxShadow: "var(--shadow-panel)",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="leads"
                    stroke="#2563EB"
                    strokeWidth={3}
                    dot={{ r: 4, fill: "#2563EB" }}
                    activeDot={{ r: 6 }}
                    name="Leads"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-bold text-[var(--color-text-primary)] uppercase tracking-wider mb-4 flex items-center gap-2">
            <MousePointerClick className="w-4 h-4 text-[var(--color-primary-blue)]" /> Distribuição de Volume
          </h3>
          {totalLeads === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center gap-2 opacity-50">
              <Inbox className="w-8 h-8 text-[var(--color-text-faint)]" />
              <p className="text-xs text-[var(--color-text-muted)] font-medium">Cadastre leads para visualizar os dados.</p>
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trafficData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.15)" vertical={false} />
                  <XAxis dataKey="name" stroke="var(--color-text-faint)" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--color-text-faint)" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip
                    cursor={{ fill: "rgba(37, 99, 235, 0.05)" }}
                    contentStyle={{
                      backgroundColor: "var(--color-surface-elevated)",
                      border: "1px solid var(--color-border-default)",
                      borderRadius: "12px",
                      fontSize: "12px",
                      color: "var(--color-text-primary)",
                      boxShadow: "var(--shadow-panel)",
                    }}
                  />
                  <Bar dataKey="leads" fill="#2563EB" radius={[6, 6, 0, 0]} name="Leads" maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      {/* Campaigns by Source Table */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b border-[var(--color-border-subtle)] flex justify-between items-center">
          <h3 className="text-sm font-bold text-[var(--color-text-primary)] uppercase tracking-wider flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-500" /> Desempenho por Origem de Tráfego
          </h3>
        </div>

        {totalLeads === 0 ? (
          <EmptyState
            icon={Inbox}
            title="Nenhum lead com origem cadastrada"
            description="Cadastre leads atribuindo fontes de tráfego (Meta Ads, Google, Orgânico) para visualizar métricas comparativas."
            className="border-none rounded-none"
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fonte de Aquisição</TableHead>
                <TableHead>Total de Leads</TableHead>
                <TableHead>Vendas Fechadas</TableHead>
                <TableHead className="text-right">Taxa de Conversão</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(() => {
                let bySourceList: { source: string; leads: number; closed: number }[];
                {
                  const bySource: Record<string, { leads: number; closed: number }> = {};
                  filtrados.forEach((l) => {
                    const src = l.source || "Orgânico / Direto";
                    if (!bySource[src]) bySource[src] = { leads: 0, closed: 0 };
                    bySource[src].leads++;
                    if (l.status === "Fechado") bySource[src].closed++;
                  });
                  bySourceList = Object.entries(bySource)
                    .sort((a, b) => b[1].leads - a[1].leads)
                    .map(([source, data]) => ({ source, ...data }));
                }

                return bySourceList.map((data, i) => {
                  const rate = data.leads > 0 ? Math.round((data.closed / data.leads) * 100) : 0;
                  return (
                    <TableRow key={i}>
                      <TableCell>
                        <span className="font-bold text-[var(--color-text-primary)] text-sm">
                          {data.source}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs font-bold text-[var(--color-primary-blue)]">
                          {data.leads}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
                          {data.closed}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={rate > 20 ? "success" : rate > 0 ? "warning" : "secondary"}>
                          {rate}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                });
              })()}
            </TableBody>
          </Table>
        )}
      </Card>
    </PageContainer>
  );
}
