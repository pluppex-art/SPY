import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, RefreshCw, Server, Monitor } from "lucide-react";
import { Card } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { supabase } from "../../../lib/supabase";
import { cn } from "../../../lib/utils";

type Linha = {
  id: string; created_at: string; tenant_id: string | null; origem: "web" | "servidor";
  mensagem: string; stack: string | null; url: string | null; navegador: string | null; fingerprint: string;
};
type Grupo = { fingerprint: string; origem: "web" | "servidor"; mensagem: string; stack: string | null; url: string | null; total: number; empresas: number; ultimo: string; primeiro: string };

const PERIODOS = [
  { id: "24h", label: "24 horas", horas: 24 },
  { id: "7d", label: "7 dias", horas: 24 * 7 },
  { id: "30d", label: "30 dias", horas: 24 * 30 },
] as const;

const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/**
 * Erros reais do app (navegador e servidor), agrupados pelo mesmo erro. Vêm de app_error_log, que só o master lê (RLS).
 * Cada erro repetido em rajada é gravado no máximo uma vez por minuto, então "ocorrências" é um piso, não o total exato.
 */
export function AdminErrosTab() {
  const [periodo, setPeriodo] = useState<(typeof PERIODOS)[number]["id"]>("7d");
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [falha, setFalha] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!supabase) return;
    setCarregando(true);
    setFalha(null);
    const desde = new Date(Date.now() - (PERIODOS.find((p) => p.id === periodo)?.horas ?? 168) * 3_600_000).toISOString();
    const { data, error } = await supabase.from("app_error_log").select("*").gte("created_at", desde).order("created_at", { ascending: false }).limit(1000);
    if (error) setFalha("Não foi possível carregar os erros.");
    else setLinhas((data ?? []) as Linha[]);
    setCarregando(false);
  }, [periodo]);

  useEffect(() => { void carregar(); }, [carregar]);

  const grupos = useMemo<Grupo[]>(() => {
    const mapa = new Map<string, Grupo & { _emp: Set<string> }>();
    for (const l of linhas) {
      const g = mapa.get(l.fingerprint);
      if (!g) mapa.set(l.fingerprint, { fingerprint: l.fingerprint, origem: l.origem, mensagem: l.mensagem, stack: l.stack, url: l.url, total: 1, empresas: 0, ultimo: l.created_at, primeiro: l.created_at, _emp: new Set(l.tenant_id ? [l.tenant_id] : []) });
      else { g.total++; g.primeiro = l.created_at; if (l.tenant_id) g._emp.add(l.tenant_id); }
    }
    return [...mapa.values()].map((g) => ({ ...g, empresas: g._emp.size })).sort((a, b) => b.ultimo.localeCompare(a.ultimo));
  }, [linhas]);

  return (
    <div className="space-y-5">
      <Card className="p-5 sm:p-6 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-3xl shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-[var(--color-text-primary)] tracking-tight">Erros do app</h2>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              {carregando ? "Carregando..." : grupos.length === 0 ? "Nenhum erro no período." : `${grupos.length} tipo(s) de erro, ${linhas.length} registro(s) no período.`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl p-0.5">
              {PERIODOS.map((p) => (
                <button key={p.id} type="button" onClick={() => setPeriodo(p.id)}
                  className={cn("px-3 h-9 text-xs font-bold rounded-lg border-none cursor-pointer", periodo === p.id ? "bg-[var(--color-primary-blue)] text-white" : "bg-transparent text-[var(--color-text-muted)]")}>
                  {p.label}
                </button>
              ))}
            </div>
            <Button variant="outline" onClick={carregar} disabled={carregando} className="h-10 gap-2 text-xs font-bold">
              <RefreshCw className={cn("w-3.5 h-3.5", carregando && "animate-spin")} /> Atualizar
            </Button>
          </div>
        </div>
      </Card>

      {falha && <Card className="p-4 border border-rose-500/30 bg-rose-500/5 text-sm text-rose-500">{falha}</Card>}

      {!carregando && !falha && grupos.length === 0 && (
        <Card className="p-8 text-center bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-3xl">
          <p className="text-sm font-bold text-[var(--color-text-primary)]">Tudo calmo por aqui.</p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">Os erros de JavaScript do navegador e as falhas do servidor aparecem nesta lista assim que acontecerem.</p>
        </Card>
      )}

      <div className="space-y-2.5">
        {grupos.map((g) => (
          <Card key={g.fingerprint} className="bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-2xl overflow-hidden">
            <button type="button" onClick={() => setAberto(aberto === g.fingerprint ? null : g.fingerprint)}
              className="w-full text-left p-4 flex items-start gap-3 bg-transparent border-none cursor-pointer">
              <span className={cn("mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0", g.origem === "servidor" ? "bg-violet-500/10 text-violet-500" : "bg-amber-500/10 text-amber-500")}>
                {g.origem === "servidor" ? <Server className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-[var(--color-text-primary)] break-words">{g.mensagem}</span>
                <span className="block text-xs text-[var(--color-text-muted)] mt-1">
                  {g.origem === "servidor" ? "Servidor" : "Navegador"} · {g.total}x · última {quando(g.ultimo)}
                  {g.empresas > 0 ? ` · ${g.empresas} empresa(s)` : ""}{g.url ? ` · ${g.url}` : ""}
                </span>
              </span>
              <ChevronDown className={cn("w-4 h-4 mt-2 text-[var(--color-text-muted)] shrink-0 transition-transform", aberto === g.fingerprint && "rotate-180")} />
            </button>
            {aberto === g.fingerprint && (
              <div className="px-4 pb-4">
                <div className="flex items-center gap-2 text-[11px] text-[var(--color-text-muted)] mb-2"><AlertTriangle className="w-3 h-3" /> Primeira vez no período: {quando(g.primeiro)}</div>
                <pre className="text-[11px] leading-relaxed p-3 rounded-xl bg-[var(--color-surface-sunken)] text-[var(--color-text-secondary)] overflow-x-auto whitespace-pre-wrap break-words">{g.stack || "Sem detalhes técnicos registrados."}</pre>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
