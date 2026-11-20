import { useState, useRef, useEffect, useMemo } from "react";
import { PageContainer } from "../../components/PageContainer";
import { Button } from "../../components/ui/button";
import {
  CheckCircle2, AlertCircle, RefreshCw, Upload, FileText,
  Building2, ArrowRight, ShieldCheck, Sparkles, Check, X,
  ArrowDownLeft, ArrowUpRight, Landmark, Link2
} from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import { Card } from "../../components/ui/card";
import { FilterBar, FilterSearch, FilterSelect, FilterChips } from "../../components/ui/kpi-filter-card";
import { FinanceKpiFilter } from "./components/FinanceKpiFilter";
import { toast } from "sonner";
import { useAuth } from "../../contexts/AuthContext";
import { useData } from "../../contexts/DataContext";
import { supabase } from "../../lib/supabase";
import { friendlyError } from "../../lib/friendlyError";

import { HelpTip } from "../../components/ui/help-tip";
import { SecaoCard } from "./components/SecaoCard";
import { useConexaoBanco, estadoDaConexao } from "./hooks/useConexaoBanco";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { Link } from "react-router-dom";
type ExtratoItem = {
  id: string;
  data: string;
  descricao: string;
  documento: string;
  valor: number;
  tipo: "credito" | "debito";
  banco: string;
  conciliado: boolean;
  matchSugerido?: string;
};

// Parser de OFX (SGML tag-based, o formato que praticamente todo banco
// brasileiro exporta) — extrai cada bloco <STMTTRN>...</STMTTRN> e lê
// TRNTYPE/DTPOSTED/TRNAMT/NAME/MEMO por regex. Não é um parser SGML completo
// (não resolve entidades nem valida DTD), mas cobre o que os extratos reais
// exportam: tags de um nível, sem aninhamento dentro de STMTTRN.
function parseOfx(text: string, bancoLabel: string): ExtratoItem[] {
  const items: ExtratoItem[] = [];
  const blocks = text.match(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi) || [];
  const tagValue = (block: string, tag: string): string | null => {
    const m = new RegExp(`<${tag}>([^<\\r\\n]*)`, "i").exec(block);
    return m ? m[1].trim() : null;
  };
  for (const block of blocks) {
    const trnamt = tagValue(block, "TRNAMT");
    const dtposted = tagValue(block, "DTPOSTED");
    const name = tagValue(block, "NAME") || tagValue(block, "MEMO") || "Movimentação importada";
    const trntype = tagValue(block, "TRNTYPE");
    if (!trnamt || !dtposted) continue;
    const valorNum = parseFloat(trnamt);
    if (isNaN(valorNum)) continue;
    // DTPOSTED vem como AAAAMMDD[HHMMSS][[-3:BRT]] — só os 8 primeiros dígitos importam.
    const y = dtposted.slice(0, 4), m = dtposted.slice(4, 6), d = dtposted.slice(6, 8);
    const dataFormatada = y && m && d ? `${d}/${m}/${y}` : new Date().toLocaleDateString("pt-BR");
    const tipo: "credito" | "debito" = trntype?.toUpperCase() === "DEBIT" ? "debito" : trntype?.toUpperCase() === "CREDIT" ? "credito" : valorNum < 0 ? "debito" : "credito";
    items.push({
      id: `ofx_${Date.now()}_${items.length}`,
      data: dataFormatada,
      descricao: name,
      documento: tagValue(block, "FITID") || "-",
      valor: Math.abs(valorNum),
      tipo,
      banco: bancoLabel,
      conciliado: false,
    });
  }
  return items;
}

// Parser simples de CSV de extrato: espera colunas
// data,descricao,valor[,tipo] (tipo opcional — inferido pelo sinal do valor
// quando ausente).
function parseExtratoCsv(text: string, bancoLabel: string): ExtratoItem[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const items: ExtratoItem[] = [];
  for (const line of lines) {
    const cols = line.split(/[,;]/).map(c => c.trim().replace(/^"|"$/g, ""));
    if (cols.length < 3) continue;
    const [dataRaw, descricao, valorRaw, tipoRaw] = cols;
    const valorNum = parseFloat(valorRaw.replace(/\./g, "").replace(",", "."));
    if (!descricao || isNaN(valorNum)) continue;
    const tipo: "credito" | "debito" =
      tipoRaw?.toLowerCase().startsWith("d") ? "debito"
      : tipoRaw?.toLowerCase().startsWith("c") ? "credito"
      : valorNum < 0 ? "debito" : "credito";
    items.push({
      id: `tx_${Date.now()}_${items.length}`,
      data: dataRaw || new Date().toLocaleDateString("pt-BR"),
      descricao,
      documento: "-",
      valor: Math.abs(valorNum),
      tipo,
      banco: bancoLabel,
      conciliado: false,
    });
  }
  return items;
}

export default function FinanceiroConciliacao() {
  const { activeTenantId } = useAuth();
  const { financeEntries, financeBankAccounts } = useData() as any;

  const [extrato, setExtrato] = useState<ExtratoItem[]>([]);
  // Sobe o contador para recarregar o extrato depois que a conexão com o banco importar movimentações.
  const [recarga, setRecarga] = useState(0);
  const conexao = useConexaoBanco(() => setRecarga((n) => n + 1));
  const conexoesDa = (contaId: string) => (conexao.status?.connections ?? []).filter((x) => x.conta_bancaria_id === contaId);
  const itensConectados = [...new Set((conexao.status?.connections ?? []).map((x) => x.item_id))];
  const ocupado = conexao.ocupado !== null;
  // Conta do extrato que está sendo importado: o nome dela passa a ser o "banco" de cada linha importada.
  const contasAtivas = useMemo(() => (financeBankAccounts as any[]).filter((c) => !c.arquivada), [financeBankAccounts]);
  const [contaExtratoId, setContaExtratoId] = useState("");
  const contaExtrato = contasAtivas.find((c) => c.id === contaExtratoId) ?? null;
  const bancoLabel = contaExtrato ? contaExtrato.nome : "Conta Importada";

  const [busca, setBusca] = useState("");
  const [situacaoFilter, setSituacaoFilter] = useState("");
  const [tipoFilter, setTipoFilter] = useState("");
  const extratoFiltrado = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return extrato.filter(i => {
      if (situacaoFilter === "conciliado" && !i.conciliado) return false;
      if (situacaoFilter === "pendente" && i.conciliado) return false;
      if (tipoFilter && i.tipo !== tipoFilter) return false;
      if (!q) return true;
      return (i.descricao || "").toLowerCase().includes(q) || (i.documento || "").toLowerCase().includes(q) || (i.banco || "").toLowerCase().includes(q);
    });
  }, [extrato, busca, situacaoFilter, tipoFilter]);

  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!supabase || !activeTenantId) return;
    let cancelled = false;
    (async () => {
      // Pagina em blocos de 1000 (limite do PostgREST) para não cortar extratos grandes.
      const data: any[] = [];
      let error: any = null;
      for (let from = 0; ; from += 1000) {
        const res = await supabase!
          .from("finance_extratos_importados")
          .select("*")
          .eq("tenant_id", activeTenantId)
          .order("created_at", { ascending: false })
          .order("id")
          .range(from, from + 999);
        if (res.error) { error = res.error; break; }
        data.push(...(res.data || []));
        if ((res.data || []).length < 1000) break;
      }
      if (cancelled) return;
      if (error) {
        toast.error("Erro ao carregar extrato importado: " + friendlyError(error));
        return;
      }
      const mapped: ExtratoItem[] = (data || []).map((row: any) => ({
        id: row.id,
        data: row.data,
        descricao: row.descricao,
        documento: row.documento,
        valor: row.valor,
        tipo: row.tipo,
        banco: row.banco,
        conciliado: row.conciliado,
        matchSugerido: row.match_sugerido,
      }));
      setExtrato(mapped);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTenantId, recarga]);

  const conciliados = extrato.filter(e => e.conciliado).length;
  const pendentes = extrato.filter(e => !e.conciliado).length;
  const statusChartData = useMemo(
    () => [
      { name: "Conciliados", value: conciliados, fill: "var(--color-success)" },
      { name: "Pendentes", value: pendentes, fill: "var(--color-warning)" },
    ].filter(d => d.value > 0),
    [conciliados, pendentes]
  );

  // Concilia comparando cada lançamento do extrato com os lançamentos
  // financeiros reais (mesmo valor, tolerância de 1 centavo, ainda não usado
  // como match de outro item) — não é mais um "toggle tudo pra true".
  const handleConciliarAuto = () => {
    setIsProcessing(true);
    setTimeout(() => {
      const usedEntryIds = new Set<string>();
      let matched = 0;
      setExtrato(prev =>
        prev.map(item => {
          if (item.conciliado) return item;
          const entry = (financeEntries || []).find(fe =>
            !usedEntryIds.has(fe.id) &&
            Math.abs(Number(fe.value) - item.valor) < 0.01 &&
            (item.tipo === "credito" ? fe.type === "Receber" : fe.type === "Pagar")
          );
          if (!entry) return item;
          usedEntryIds.add(entry.id);
          matched++;
          if (supabase) {
            supabase
              .from("finance_extratos_importados")
              .update({ conciliado: true, match_sugerido: entry.description })
              .eq("id", item.id)
              .then(({ error }) => {
                if (error) console.error("Erro ao persistir conciliação automática:", error);
              });
          }
          return { ...item, conciliado: true, matchSugerido: entry.description };
        })
      );
      setIsProcessing(false);
      if (matched > 0) {
        toast.success(`${matched} transação(ões) conciliada(s) automaticamente com o financeiro.`);
      } else {
        toast.info("Nenhum lançamento financeiro correspondente foi encontrado para conciliar.");
      }
    }, 600);
  };

  const handleManualMatch = async (id: string) => {
    if (supabase) {
      const { error } = await supabase
        .from("finance_extratos_importados")
        .update({ conciliado: true })
        .eq("id", id);
      if (error) {
        toast.error("Erro ao conciliar transação: " + friendlyError(error));
        return;
      }
    }
    setExtrato(prev =>
      prev.map(item => (item.id === id ? { ...item, conciliado: true } : item))
    );
    toast.success("Transação conciliada com sucesso!");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isOfx = file.name.toLowerCase().endsWith(".ofx") || file.name.toLowerCase().endsWith(".qfx");

    toast.loading(`Processando arquivo "${file.name}"...`, { id: "ofx-import" });
    const reader = new FileReader();
    reader.onload = async () => {
      const text = String(reader.result || "");
      const newItems = isOfx ? parseOfx(text, bancoLabel) : parseExtratoCsv(text, bancoLabel);
      if (newItems.length === 0) {
        toast.error(
          isOfx
            ? `Não foi possível reconhecer transações OFX em "${file.name}" — confira se é um arquivo OFX válido (com blocos <STMTTRN>).`
            : `Não foi possível reconhecer lançamentos em "${file.name}". Confira o formato (data,descrição,valor).`,
          { id: "ofx-import" }
        );
      } else if (!supabase || !activeTenantId) {
        toast.error("Não foi possível salvar o extrato: conexão com o banco de dados indisponível.", { id: "ofx-import" });
      } else {
        const { error } = await supabase.from("finance_extratos_importados").insert(
          newItems.map(it => ({
            id: it.id,
            tenant_id: activeTenantId,
            data: it.data,
            descricao: it.descricao,
            documento: it.documento,
            valor: it.valor,
            tipo: it.tipo,
            banco: it.banco,
            conciliado: it.conciliado,
          }))
        );
        if (error) {
          toast.error(`Erro ao salvar extrato importado: ${friendlyError(error)}`, { id: "ofx-import" });
        } else {
          setExtrato(prev => [...newItems, ...prev]);
          toast.success(`Arquivo "${file.name}" importado! ${newItems.length} transação(ões) identificada(s).`, { id: "ofx-import" });
        }
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    };
    reader.onerror = () => {
      toast.error(`Falha ao ler o arquivo "${file.name}".`, { id: "ofx-import" });
      if (fileInputRef.current) fileInputRef.current.value = "";
    };
    reader.readAsText(file);
  };

  return (
    <PageContainer
      title="Conciliação Bancária & OFX"
      description="Importe o extrato do banco (OFX ou Excel) e o sistema concilia sozinho as transações do banco com as do sistema."
      actions={
        <Button
          onClick={handleConciliarAuto}
          disabled={isProcessing || pendentes === 0}
          className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs bg-[var(--color-primary-blue)] !text-white hover:opacity-95"
        >
          <Sparkles className="w-3.5 h-3.5" /> {isProcessing ? "Processando..." : "Conciliar Automaticamente (IA)"}
        </Button>
      }
    >
      <div className="space-y-4">
      <FinanceKpiFilter
        id="finConciliacao"
        className="mb-6"
        kpis={[
          { label: "Lançamentos Conciliados", value: conciliados, icon: CheckCircle2, tone: "success", hint: "Conferidos e sincronizados com extrato" },
          { label: "Pendentes de Match", value: pendentes, icon: AlertCircle, tone: "warning", hint: "Aguardando conferência ou aceite por IA" },
          { label: "Lançamentos Importados", value: extrato.length, icon: Building2, tone: "primary", hint: "Via upload de extrato CSV/OFX" },
        ]}
        activeCount={(busca ? 1 : 0) + (situacaoFilter ? 1 : 0) + (tipoFilter ? 1 : 0)}
        onClear={() => { setBusca(""); setSituacaoFilter(""); setTipoFilter(""); }}
      >
        <FilterBar>
          <FilterSearch value={busca} onChange={setBusca} placeholder="Buscar por descrição, documento ou banco..." />
          <FilterSelect
            icon={ArrowDownLeft}
            value={tipoFilter}
            onChange={setTipoFilter}
            options={[{ value: "credito", label: "Créditos" }, { value: "debito", label: "Débitos" }]}
            allLabel="Créditos e débitos"
          />
          <FilterChips
            value={situacaoFilter}
            onChange={setSituacaoFilter}
            options={[{ value: "pendente", label: "Pendentes" }, { value: "conciliado", label: "Conciliados" }]}
          />
        </FilterBar>
      </FinanceKpiFilter>

      {statusChartData.length > 0 && (
        <SecaoCard titulo="Conciliados x Pendentes" className="bg-[var(--color-surface)] border border-[var(--color-border-default)] shadow-xs mb-6">
          <div className="h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusChartData} dataKey="value" nameKey="name" innerRadius={35} outerRadius={60} paddingAngle={2}>
                  {statusChartData.map((entry, index) => <Cell key={index} fill={entry.fill} />)}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-control)" }} itemStyle={{ fontSize: "11px" }} />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </SecaoCard>
      )}

      {conexao.widget}

      <SecaoCard titulo={`Contas e conexão com o banco — ${contasAtivas.length} conta(s)`} icon={Landmark} semPadding className="mb-6"
        direita={itensConectados.length > 0 ? <Button size="sm" variant="outline" onClick={() => conexao.sincronizar()} disabled={ocupado}><RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${conexao.ocupado?.startsWith("sync") ? "animate-spin" : ""}`} />Sincronizar tudo</Button> : undefined}>
        {contasAtivas.length === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm text-[var(--color-text-muted)]">
            <span>Cadastre a conta do banco para importar o extrato dela e conciliar.</span>
            <Link to="/app/financeiro/bancos"><Button size="sm">Cadastrar conta</Button></Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border-default)] text-left text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">
                  <th className="px-4 py-2 font-semibold">Conta</th><th className="px-3 py-2 font-semibold">Conexão</th>
                  <th className="px-3 py-2 font-semibold">Último extrato</th><th className="px-3 py-2 text-right font-semibold">A conciliar</th><th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {contasAtivas.map((c: any) => {
                  const itens = extrato.filter((i) => i.banco === c.nome);
                  const ultima = itens.map((i) => i.data).sort().slice(-1)[0];
                  return (
                    <tr key={c.id} className="border-b border-[var(--color-border-default)] last:border-0">
                      <td className="px-4 py-2.5"><p className="font-semibold">{c.nome}</p><p className="text-xs text-[var(--color-text-muted)]">{[c.banco, c.agencia && `ag. ${c.agencia}`, c.numero_conta && `cc ${c.numero_conta}`].filter(Boolean).join(" · ") || "Sem dados bancários"}</p></td>
                      <td className="px-3 py-2.5">
                        {(() => {
                          const con = conexoesDa(c.id)[0];
                          if (!con) return <span className="inline-flex rounded-full bg-slate-500/15 px-2 py-0.5 text-xs font-semibold text-slate-600">Manual</span>;
                          const est = estadoDaConexao(con);
                          const cor = est.tom === "ok" ? "bg-emerald-500/15 text-emerald-600" : est.tom === "aviso" ? "bg-amber-500/15 text-amber-600" : "bg-red-500/15 text-red-600";
                          return (
                            <>
                              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${cor}`}>{est.texto}</span>
                              <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">{con.connector_name ?? "Banco"}{con.last_sync_at ? ` · sincronizada ${new Date(con.last_sync_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}</p>
                              {con.last_error && <p className="mt-0.5 max-w-[16rem] text-[11px] text-red-600">{con.last_error}</p>}
                            </>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-2.5 text-[var(--color-text-muted)]">{ultima ? String(ultima).split("-").reverse().join("/") : "nenhum importado"}</td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{itens.filter((i) => !i.conciliado).length}</td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex justify-end gap-1.5">
                          <Button size="sm" variant="outline" onClick={() => { setContaExtratoId(c.id); setTimeout(() => fileInputRef.current?.click(), 0); }}><Upload className="mr-1.5 h-3.5 w-3.5" />Importar extrato</Button>
                          {(() => {
                            const con = conexoesDa(c.id)[0];
                            if (!con) {
                              const pronto = !!conexao.status?.configured;
                              return (
                                <Button size="sm" disabled={!pronto || ocupado} onClick={() => conexao.conectar(c.id)} title={pronto ? "Conectar esta conta ao banco automaticamente" : "A conexão automática ainda não foi ativada neste servidor (faltam as chaves do Pluggy)"}>
                                  <Link2 className="mr-1.5 h-3.5 w-3.5" />Conectar
                                </Button>
                              );
                            }
                            const est = estadoDaConexao(con);
                            return (
                              <>
                                {est.precisaReconectar
                                  ? <Button size="sm" disabled={ocupado} onClick={() => conexao.conectar(c.id, con.item_id)}><Link2 className="mr-1.5 h-3.5 w-3.5" />Reconectar</Button>
                                  : <Button size="sm" variant="outline" disabled={ocupado} onClick={() => conexao.sincronizar(con.item_id)}><RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${conexao.ocupado === `sync:${con.item_id}` ? "animate-spin" : ""}`} />Sincronizar</Button>}
                                <Button size="sm" variant="ghost" disabled={ocupado} aria-label="Desconectar do banco" title="Desconectar do banco"
                                  onClick={async () => { if (await confirmDialog({ title: "Desconectar do banco", description: `Parar de sincronizar "${c.nome}"? As movimentações já importadas continuam na Conciliação.` })) conexao.desconectar(con.item_id); }}>
                                  <X className="h-4 w-4" />
                                </Button>
                              </>
                            );
                          })()}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-[var(--color-border-default)] px-4 py-2.5 text-xs text-[var(--color-text-muted)]">
          {conexao.status?.configured ? "Conectando a conta ao banco, as movimentações chegam sozinhas. Sem conexão, o extrato continua entrando por arquivo (OFX ou CSV) baixado no app do banco." : "A conexão automática com os bancos ainda não foi ativada neste servidor (faltam as chaves do Pluggy). Enquanto isso, o extrato entra por arquivo (OFX ou CSV) baixado no app do banco."}
        </p>
      </SecaoCard>

      {/* Upload Zone */}
      <div className="p-8 border-2 border-dashed border-[var(--color-border-default)] rounded-2xl bg-[var(--color-surface)] text-center mb-6 hover:border-[var(--color-primary-blue)] transition-colors">
        <input
          ref={fileInputRef}
          type="file"
          accept=".ofx,.csv,.txt"
          onChange={handleFileUpload}
          className="hidden"
        />
        <Upload className="w-10 h-10 mx-auto mb-2 text-[var(--color-primary-blue)] opacity-80" />
        <h4 className="text-xs font-bold text-[var(--color-text-primary)] mb-1">Importar Arquivo OFX ou Extrato CSV <HelpTip label="Sobre Importar Arquivo OFX ou Extrato CSV">Envie o extrato oficial do banco (arquivo OFX ou CSV) para conferir os lançamentos do sistema com o que realmente passou na conta. É a conciliação bancária.</HelpTip></h4>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="px-4 py-2 bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] hover:bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)] text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer"
        >
          Selecionar Arquivo OFX / CSV
        </button>
        {contasAtivas.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs text-[var(--color-text-muted)]">
            <label htmlFor="conta-extrato">Extrato da conta:</label>
            <select id="conta-extrato" value={contaExtratoId} onChange={(e) => setContaExtratoId(e.target.value)} className="h-8 rounded-md border border-[var(--color-border-default)] bg-[var(--color-surface-sunken)] px-2 text-xs">
              <option value="">Não informar</option>
              {contasAtivas.map((c: any) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Transactions List */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-2xl overflow-hidden shadow-xs">
        <div className="p-4 border-b border-[var(--color-border-subtle)] flex items-center justify-between">
          <h4 className="text-xs font-bold text-[var(--color-text-primary)] uppercase tracking-wider">
            Movimentações do Extrato Bancário
          </h4>
          <span className="text-[11px] text-[var(--color-text-muted)] font-mono">
            {conciliados} de {extrato.length} conciliadas
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)]/60 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                <th className="px-5 py-3">Data</th>
                <th className="px-4 py-3">Banco</th>
                <th className="px-5 py-3">Descrição do Lançamento</th>
                <th className="px-4 py-3">Correspondência Sugerida (Sistema)</th>
                <th className="px-4 py-3 text-right">Valor</th>
                <th className="px-5 py-3 text-right"><span className="inline-flex items-center gap-1">Ação<HelpTip label="O que o botão faz">Aprovar Match: confirma a correspondência sugerida entre a linha do extrato e o lançamento do sistema e marca como conciliado.</HelpTip></span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-subtle)]">
              {extratoFiltrado.map(item => (
                <tr key={item.id} className="hover:bg-[var(--color-surface-sunken)]/40 transition-colors">
                  <td className="px-5 py-3.5 font-mono text-[var(--color-text-muted)]">{item.data}</td>
                  <td className="px-4 py-3.5 font-medium text-[var(--color-text-primary)]">{item.banco}</td>
                  <td className="px-5 py-3.5">
                    <span className="font-bold text-[var(--color-text-primary)] block">{item.descricao}</span>
                    <span className="text-[10px] font-mono text-[var(--color-text-muted)]">{item.documento}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    {item.matchSugerido ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--color-text-primary)] bg-[var(--color-surface-sunken)] px-2 py-0.5 rounded-lg border border-[var(--color-border-subtle)]">
                        <Sparkles className="w-3 h-3 text-warning" /> {item.matchSugerido}
                      </span>
                    ) : (
                      <span className="text-[10px] text-[var(--color-text-muted)]">Nenhum match automático</span>
                    )}
                  </td>
                  <td className={`px-4 py-3.5 text-right font-mono font-bold ${
                    item.tipo === "credito" ? "text-success" : "text-danger"
                  }`}>
                    {item.tipo === "credito" ? "+ " : "- "}
                    R$ {item.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    {item.conciliado ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase text-success bg-success/10 px-2.5 py-1 rounded-full border border-success/20">
                        <Check className="w-3 h-3" /> Conciliado
                      </span>
                    ) : (
                      <button
                        onClick={() => handleManualMatch(item.id)}
                        className="px-2.5 py-1 rounded-lg bg-[var(--color-primary-blue)] hover:opacity-90 !text-white text-[11px] font-bold transition-all inline-flex items-center gap-1"
                      >
                        Aprovar Match
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </div>
    </PageContainer>
  );
}
