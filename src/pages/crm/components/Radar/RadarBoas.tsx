import { useMemo, useState } from "react";
import { Flame, TrendingUp, Trophy, Phone, MessageCircle, ExternalLink, Search, Users } from "lucide-react";
import { Card } from "../../../../components/ui/card";
import { Badge } from "../../../../components/ui/badge";
import { HelpTip } from "../../../../components/ui/help-tip";
import { whatsappDigits } from "../../../../lib/utils";
import { SCORE_QUENTE, JANELA_FECHADOS_DIAS, type RadarBoas as DadosBoas, type LeadBom } from "../../../../lib/radarBoas";

interface Props {
  boas: DadosBoas;
  stageNames: Record<string, string>;
  funilNomeByTipo: Record<string, string>;
  formatCurrency: (n: number) => string;
  onAbrir: (leadId: string) => void;
}

const fmtData = (iso?: string | null) => {
  const d = iso ? new Date(iso) : null;
  return d && !isNaN(d.getTime()) ? d.toLocaleDateString("pt-BR") : "—";
};
const iniciais = (nome?: string | null) => {
  const p = (nome || "").trim().split(/\s+/).filter(Boolean);
  return p.length === 0 ? "?" : (p[0][0] + (p[1]?.[0] || "")).toUpperCase();
};

/** Radar — lado bom: negócios quentes, negócios esquentando e o que fechou recentemente. */
export function RadarBoasPainel({ boas, stageNames, funilNomeByTipo, formatCurrency, onAbrir }: Props) {
  const [busca, setBusca] = useState("");
  const [vendedor, setVendedor] = useState("todos");

  const todos: LeadBom[] = useMemo(() => [...boas.quentes, ...boas.esquentando], [boas]);
  const vendedores = useMemo(() => Array.from(new Set(todos.map((r) => r.l.seller).filter(Boolean))).sort() as string[], [todos]);

  const linhas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return todos
      .filter((r) => vendedor === "todos" || r.l.seller === vendedor)
      .filter((r) => !q || [r.l.name, r.l.company, r.l.title, r.l.seller].some((v) => String(v || "").toLowerCase().includes(q)));
  }, [todos, busca, vendedor]);
  const visiveis = linhas.slice(0, 200);

  const cartao = (icone: React.ReactNode, titulo: string, valor: number, sub: string, dica: string) => (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-2">
        {icone}
        <span className="text-xs font-bold text-[var(--color-text-muted)]">{titulo}</span>
        <HelpTip label={`Sobre ${titulo}`}>{dica}</HelpTip>
      </div>
      <div className="text-2xl font-black">{valor}</div>
      <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">{sub}</p>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cartao(
          <Flame className="w-5 h-5 text-orange-500" />, "Quentes", boas.quentes.length,
          `${formatCurrency(boas.valorQuentes)} em jogo`,
          `Negócios em aberto com temperatura quente ou nota da IA de ${SCORE_QUENTE} ou mais. São os que mais merecem a sua atenção agora.`,
        )}
        {cartao(
          <TrendingUp className="w-5 h-5 text-emerald-500" />, "Esquentando", boas.esquentando.length,
          "Mexidos nas últimas 24 horas",
          "Negócios em aberto que tiveram movimento hoje ou ontem, mas ainda não são quentes. Vale dar o próximo passo enquanto há interesse.",
        )}
        {cartao(
          <Trophy className="w-5 h-5 text-[var(--color-primary-blue)]" />, "Fechados recentemente", boas.fechados.length,
          `${formatCurrency(boas.valorFechados)} nos últimos ${JANELA_FECHADOS_DIAS} dias`,
          `Negócios ganhos e atualizados nos últimos ${JANELA_FECHADOS_DIAS} dias. O sistema não guarda a data exata do fechamento, então usa a última atualização do negócio.`,
        )}
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar lead, empresa ou responsável..."
              className="w-full h-10 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-sunken)] pl-9 pr-3 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]/40"
            />
          </div>
          {vendedores.length > 1 && (
            <label className="flex items-center gap-2">
              <Users className="w-4 h-4 text-[var(--color-text-muted)]" />
              <select
                value={vendedor}
                onChange={(e) => setVendedor(e.target.value)}
                aria-label="Filtrar por responsável"
                className="h-10 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-sunken)] px-3 text-xs font-bold text-[var(--color-text-primary)] cursor-pointer"
              >
                <option value="todos">Todos os responsáveis</option>
                {vendedores.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
          )}
          <p className="text-[11px] text-[var(--color-text-muted)] ml-auto">{linhas.length} negócio(s){linhas.length > visiveis.length ? ` (mostrando ${visiveis.length})` : ""}</p>
        </div>

        {visiveis.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)] py-6 text-center">Nenhum negócio quente ou esquentando agora. Quando houver, eles aparecem aqui. 🌱</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="text-[9px] uppercase font-bold text-[var(--color-text-faint)] bg-[var(--color-surface-sunken)]">
                <tr>
                  <th className="px-3 py-2">Cliente</th>
                  <th className="px-3 py-2">Negócio</th>
                  <th className="px-3 py-2">Funil / Etapa</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                  <th className="px-3 py-2 text-right">Nota IA</th>
                  <th className="px-3 py-2">Última atualização</th>
                  <th className="px-3 py-2">Situação</th>
                  <th className="px-3 py-2">Responsável</th>
                  <th className="px-3 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-subtle)]">
                {visiveis.map((r) => {
                  const funilTipo = r.l.pipelineId || "comercial";
                  const funil = funilNomeByTipo[funilTipo] || (funilTipo === "sdr" ? "SDR" : "Comercial");
                  const quente = r.motivo === "quente";
                  return (
                    <tr key={r.l.id} className="hover:bg-[var(--color-surface-sunken)] transition-colors">
                      <td className="px-3 py-2.5 cursor-pointer" onClick={() => onAbrir(r.l.id)}>
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-black shrink-0 text-white ${quente ? "bg-orange-500" : "bg-emerald-500"}`}>{iniciais(r.l.name || r.l.company)}</div>
                          <div className="min-w-0">
                            <div className="font-bold text-[var(--color-text-primary)] truncate max-w-[140px]">{r.l.name || r.l.company || "Sem nome"}</div>
                            <div className="text-[10px] text-[var(--color-text-faint)] truncate max-w-[140px]">{r.l.company || r.l.source || "—"}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-[var(--color-text-muted)] truncate max-w-[130px] cursor-pointer" onClick={() => onAbrir(r.l.id)}>{r.l.title || "—"}</td>
                      <td className="px-3 py-2.5 cursor-pointer" onClick={() => onAbrir(r.l.id)}>
                        <Badge variant="secondary">{funil}</Badge>
                        <div className="text-[10px] text-[var(--color-text-faint)] mt-0.5 truncate max-w-[120px]">↳ {stageNames[r.l.stageId] || "—"}</div>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-right text-[var(--color-text-primary)]">{r.value > 0 ? formatCurrency(r.value) : "—"}</td>
                      <td className="px-3 py-2.5 font-mono text-right font-bold">{r.score > 0 ? r.score : "—"}</td>
                      <td className="px-3 py-2.5 text-[var(--color-text-muted)]">{fmtData(r.l.last_contact_at || r.l.updated_at || r.l.created_at)}</td>
                      <td className="px-3 py-2.5"><Badge variant={quente ? "warning" : "success"}>{quente ? "Quente" : "Esquentando"}</Badge></td>
                      <td className="px-3 py-2.5 text-[var(--color-text-muted)] truncate max-w-[110px]">{r.l.seller || "—"}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          {r.l.phone && (
                            <>
                              <a href={`tel:${r.l.phone}`} onClick={(e) => e.stopPropagation()} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-elevated)] text-[var(--color-text-muted)]" title="Ligar"><Phone className="w-3.5 h-3.5" /></a>
                              <a href={`https://wa.me/${whatsappDigits(r.l.phone)}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-elevated)] text-[var(--color-text-muted)]" title="WhatsApp"><MessageCircle className="w-3.5 h-3.5" /></a>
                            </>
                          )}
                          <button type="button" onClick={() => onAbrir(r.l.id)} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-elevated)] text-[var(--color-text-muted)] cursor-pointer border-none bg-transparent" title="Abrir na Central de Vendas"><ExternalLink className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {boas.fechados.length > 0 && (
        <Card className="p-4 space-y-2">
          <h3 className="text-xs font-black uppercase tracking-wider text-[var(--color-text-primary)] flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" /> Fechados recentemente
          </h3>
          <div className="divide-y divide-[var(--color-border-subtle)]">
            {boas.fechados.slice(0, 10).map((f) => (
              <button key={f.l.id} type="button" onClick={() => onAbrir(f.l.id)} className="w-full flex items-center justify-between gap-3 py-2 text-left cursor-pointer border-none bg-transparent hover:bg-[var(--color-surface-sunken)] px-1 rounded-lg">
                <span className="min-w-0">
                  <span className="block text-xs font-bold text-[var(--color-text-primary)] truncate">{f.l.name || f.l.company || "Sem nome"}</span>
                  <span className="block text-[10px] text-[var(--color-text-faint)] truncate">{f.l.title || f.l.company || "—"} · {f.l.seller || "sem responsável"}</span>
                </span>
                <span className="text-right shrink-0">
                  <span className="block text-xs font-mono font-bold text-emerald-600">{f.value > 0 ? formatCurrency(f.value) : "—"}</span>
                  <span className="block text-[10px] text-[var(--color-text-faint)]">{fmtData(f.quando)}</span>
                </span>
              </button>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
