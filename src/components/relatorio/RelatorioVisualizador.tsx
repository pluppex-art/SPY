/**
 * Relatório em tela cheia: áreas e abas com botões (como as planilhas de um Excel), período próprio,
 * download em Excel e impressão/PDF de tudo. Os dados vêm da função `spy_relatorio` do banco.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileSpreadsheet, Printer, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { Button } from "../ui/button";
import { AbasPagina } from "../ui/abas-pagina";
import { buildPresets, DateRangeFilter, thisMonthRange } from "../ui/DateRangeFilter";
import { exportarXlsx, dataParaArquivo } from "../../lib/exportXlsx";
import { dataBR, planilhasDoRelatorio, type AreaId, type Relatorio } from "../../lib/relatorio";
import { friendlyError } from "../../lib/friendlyError";
import { cn } from "../../lib/utils";
import { AbaDoRelatorio, CardsRelatorio } from "./ConteudoRelatorio";

// Sem "Tudo": o relatório cobre no máximo 2 anos.
const ATALHOS = buildPresets().filter((p) => p.label !== "Tudo");

const CSS_IMPRESSAO = `
@media print {
  @page { size: A4 landscape; margin: 10mm; }
  html, body { background: #fff !important; height: auto !important; overflow: visible !important; }
  body > *:not(#spy-relatorio) { display: none !important; }
  #spy-relatorio { position: static !important; height: auto !important; overflow: visible !important; background: #fff !important; }
  #spy-relatorio .spy-rel-cards > div { grid-template-columns: repeat(4, minmax(0, 1fr)) !important; }
  #spy-relatorio * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}`;

export default function RelatorioVisualizador({ areas, periodo, onFechar }: {
  areas: AreaId[];
  periodo?: { de: string | null; ate: string | null };
  onFechar: () => void;
}) {
  const { activeTenantId, activeFilialId } = useAuth();
  // Começa com o período da tela de onde veio; sem período (ou em "Tudo"), vale o mês atual ou os últimos 12 meses.
  const [de, setDe] = useState<string | null>(() => (!periodo ? thisMonthRange().from : periodo.de ?? ATALHOS.find((p) => p.label === "Últimos 12 meses")!.from));
  const [ate, setAte] = useState<string | null>(() => (!periodo ? thisMonthRange().to : periodo.ate ?? thisMonthRange().to));
  const [dados, setDados] = useState<Relatorio | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [areaAtiva, setAreaAtiva] = useState<string>(areas.length > 1 ? "visao" : areas[0] ?? "visao");
  const [abaAtiva, setAbaAtiva] = useState("");
  const [imprimindo, setImprimindo] = useState(false);
  const [baixando, setBaixando] = useState(false);
  const pedido = useRef(0);
  const chaveAreas = areas.join(",");

  const carregar = useCallback(async () => {
    const meu = ++pedido.current;
    if (!supabase || !activeTenantId || !chaveAreas) {
      setCarregando(false);
      setErro(chaveAreas ? "Relatório indisponível: sem conexão com o banco." : "Seu acesso não inclui nenhuma área com relatório.");
      return;
    }
    setCarregando(true);
    setErro("");
    const { data, error } = await supabase.rpc("spy_relatorio", {
      p_tenant: activeTenantId, p_area: chaveAreas, p_inicio: de, p_fim: ate, p_filial: activeFilialId || null,
    });
    if (meu !== pedido.current) return; // chegou depois de outro pedido
    if (error) { setDados(null); setErro(friendlyError(error)); }
    else setDados(data as Relatorio);
    setCarregando(false);
  }, [activeTenantId, activeFilialId, chaveAreas, de, ate]);

  useEffect(() => { void carregar(); }, [carregar]);

  const fechar = useRef(onFechar);
  fechar.current = onFechar;
  useEffect(() => {
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") fechar.current(); };
    window.addEventListener("keydown", tecla);
    return () => { document.body.style.overflow = anterior; window.removeEventListener("keydown", tecla); };
  }, []);

  // Para imprimir, a tela passa a mostrar tudo (todas as áreas e abas), no tema claro.
  useEffect(() => {
    if (!imprimindo) return;
    const html = document.documentElement;
    const escuro = html.classList.contains("dark");
    html.classList.remove("dark");
    const t = window.setTimeout(() => { window.print(); setImprimindo(false); }, 250);
    return () => { window.clearTimeout(t); if (escuro) html.classList.add("dark"); };
  }, [imprimindo]);

  const baixarExcel = async () => {
    if (!dados) return;
    setBaixando(true);
    try { await exportarXlsx(`relatorio-spy-${dataParaArquivo()}`, planilhasDoRelatorio(dados)); }
    catch (e) { toast.error(friendlyError(e)); }
    finally { setBaixando(false); }
  };

  const area = dados?.areas.find((a) => a.id === areaAtiva) ?? (areaAtiva === "visao" ? undefined : dados?.areas[0]);
  const aba = area?.abas.find((b) => b.id === abaAtiva) ?? area?.abas[0];
  const variasAreas = (dados?.areas.length ?? 0) > 1;
  const abrirArea = (id: string) => { setAreaAtiva(id); setAbaAtiva(""); };

  const visaoGeral = (
    <div className="space-y-6">
      {dados?.areas.map((a) => (
        <section key={a.id} className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-black text-[var(--color-text-primary)]">{a.titulo}</h2>
            <button type="button" onClick={() => abrirArea(a.id)} className="print:hidden text-xs font-bold text-[var(--color-primary-blue)] bg-transparent border-0 cursor-pointer hover:underline">Ver detalhes</button>
          </div>
          <CardsRelatorio cards={a.abas[0]?.cards ?? []} />
        </section>
      ))}
    </div>
  );

  return createPortal(
    <div id="spy-relatorio" role="dialog" aria-modal="true" aria-label="Relatório" className="fixed inset-0 z-[105] flex flex-col bg-[var(--color-surface)]">
      <style>{CSS_IMPRESSAO}</style>
      <header className="shrink-0 bg-[var(--color-surface-elevated)] border-b border-[var(--color-border-default)] px-4 md:px-6 pt-3 print:border-0 print:px-0">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
          <div className="min-w-0">
            <h1 className="text-xl font-black text-[var(--color-text-primary)] truncate">
              Relatório{dados ? ` · ${dados.empresa}` : ""}{dados?.filial ? ` · ${dados.filial}` : ""}
            </h1>
            {dados && (
              <p className="text-xs text-[var(--color-text-muted)]">
                {dataBR(dados.periodo.inicio)} a {dataBR(dados.periodo.fim)} · gerado em {new Date(dados.gerado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <DateRangeFilter dateFrom={de} setDateFrom={setDe} dateTo={ate} setDateTo={setAte} presets={ATALHOS} emptyLabel="Período: este mês" />
            <Button variant="outline" onClick={() => void carregar()} disabled={carregando} className="h-9 px-3" title="Atualizar" aria-label="Atualizar">
              <RefreshCw className={cn("w-3.5 h-3.5", carregando && "animate-spin")} />
            </Button>
            <Button variant="outline" onClick={() => void baixarExcel()} disabled={!dados || baixando} className="h-9 px-3 text-xs font-bold gap-1.5" title="Baixar em Excel" aria-label="Baixar em Excel">
              <FileSpreadsheet className="w-3.5 h-3.5" /> <span className="max-sm:hidden">Excel</span>
            </Button>
            <Button variant="outline" onClick={() => setImprimindo(true)} disabled={!dados || imprimindo} className="h-9 px-3 text-xs font-bold gap-1.5" title="Imprimir ou salvar em PDF" aria-label="Imprimir ou salvar em PDF">
              <Printer className="w-3.5 h-3.5" /> <span className="max-sm:hidden">Imprimir / PDF</span>
            </Button>
            <Button onClick={onFechar} className="h-9 px-3 text-xs font-bold gap-1.5" aria-label="Fechar relatório"><X className="w-3.5 h-3.5" /> <span className="max-sm:hidden">Fechar</span></Button>
          </div>
        </div>
        {dados && variasAreas && (
          <nav aria-label="Áreas do relatório" className="flex gap-2 overflow-x-auto scrollbar-none pb-2 print:hidden">
            {[{ id: "visao", titulo: "Visão geral" }, ...dados.areas].map((a) => {
              const ativa = a.id === (area?.id ?? "visao");
              return (
                <button key={a.id} type="button" aria-pressed={ativa} onClick={() => abrirArea(a.id)}
                  className={cn("shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-bold border cursor-pointer transition-colors",
                    ativa ? "bg-[var(--color-primary-blue)] border-[var(--color-primary-blue)] !text-white" : "bg-transparent border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]")}>
                  {a.titulo}
                </button>
              );
            })}
          </nav>
        )}
        {area && aba && <AbasPagina ariaLabel={`Abas de ${area.titulo}`} className="border-b-0" value={aba.id} onChange={setAbaAtiva} abas={area.abas.map((b) => ({ id: b.id, label: b.titulo }))} />}
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 print:overflow-visible print:p-0">
        <div className="max-w-[1600px] mx-auto space-y-4 pb-8">
          {dados?.avisos.map((a) => <p key={a} className="text-xs font-medium rounded-lg px-3 py-2 bg-amber-500/10 text-amber-700 dark:text-amber-400">{a}</p>)}
          {erro ? (
            <p className="py-16 text-center text-sm text-rose-600">{erro}</p>
          ) : !dados ? (
            <p className="py-16 text-center text-sm text-[var(--color-text-muted)]">Montando o relatório…</p>
          ) : dados.areas.length === 0 ? (
            <p className="py-16 text-center text-sm text-[var(--color-text-muted)]">Nenhuma área para mostrar.</p>
          ) : imprimindo ? (
            <div className="space-y-8">
              {variasAreas && visaoGeral}
              {dados.areas.flatMap((a) => a.abas.map((b) => (
                <section key={b.id} className="space-y-3 break-before-page">
                  <h2 className="text-lg font-black text-[var(--color-text-primary)]">{a.titulo} · {b.titulo}</h2>
                  <AbaDoRelatorio aba={b} />
                </section>
              )))}
            </div>
          ) : (
            <div className={cn("transition-opacity", carregando && "opacity-50")}>
              {aba ? <AbaDoRelatorio key={aba.id} aba={aba} /> : visaoGeral}
            </div>
          )}
        </div>
      </main>
    </div>,
    document.body,
  );
}
