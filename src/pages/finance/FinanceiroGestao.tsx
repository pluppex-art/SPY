import { AlertTriangle, CheckCircle2, Clock, Wallet, Target, Gift, Plane, PiggyBank, Users } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { fetchAllRows } from "../../lib/pgrst";
import { CadastroFinanceiro, type ResumoCadastro } from "./components/CadastroFinanceiro";
import { saldoDaConta, transferenciasDaConta, type FinanceEntryLike } from "./lib/financeEngine";

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

interface BaseLanc extends FinanceEntryLike {
  tags: string[];
  conta_bancaria_id: string | null;
}

/** Lançamentos, contas e transferências do tenant — base para ligar metas e reservas ao dinheiro real. */
async function carregarBase(tenantId: string) {
  const entries = (
    await fetchAllRows<any>(() => supabase!.from("finance_entries").select("id,type,status,value,category,tags,date_normalized,conta_bancaria_id").eq("tenant_id", tenantId).order("id"))
  ).map((r) => ({ ...r, value: Number(r.value) || 0, date: r.date_normalized || "", tags: r.tags || [] })) as BaseLanc[];
  const [{ data: contas }, { data: transfers }] = await Promise.all([
    supabase!.from("finance_bank_accounts").select("id,nome,saldo_inicial,sinal_saldo_inicial").eq("tenant_id", tenantId).eq("arquivada", false),
    supabase!.from("finance_transfers").select("valor,pago,conta_origem_id,conta_destino_id").eq("tenant_id", tenantId),
  ]);
  return { entries, contas: contas || [], transfers: (transfers || []) as any[] };
}

/** Lançamento "pertence" ao nome quando a categoria ou alguma tag tem o mesmo nome (sem diferenciar maiúsculas). */
const casaComNome = (e: BaseLanc, nome: string) => norm(e.category) === norm(nome) || e.tags.some((t) => norm(t) === norm(nome));

async function enriquecerMetas(linhas: any[], tenantId: string) {
  const { entries } = await carregarBase(tenantId);
  return linhas.map((m) => {
    const doMes = entries.filter((e) => e.type === "Receber" && e.date.startsWith(m.mes));
    if (m.tipo === "Geral") {
      return { ...m, valor_realizado: doMes.filter((e) => e.status === "Pago").reduce((a, e) => a + e.value, 0), _auto: "recebimentos pagos do mês" };
    }
    if (m.tipo === "Produto" || m.tipo === "Projeto") {
      const casam = doMes.filter((e) => casaComNome(e, m.nome));
      if (casam.length) {
        return { ...m, valor_realizado: casam.filter((e) => e.status === "Pago").reduce((a, e) => a + e.value, 0), _auto: `${casam.length} lançamento(s) de "${m.nome}"` };
      }
    }
    return m; // Vendedor, ou sem lançamento com esse nome no mês: vale o digitado
  });
}

async function enriquecerReservas(linhas: any[], tenantId: string) {
  const { entries, contas, transfers } = await carregarBase(tenantId);
  return linhas.map((r) => {
    if (r.tipo === "Operacional") {
      const conta = contas.find((c: any) => norm(c.nome) === norm(r.nome));
      if (conta) {
        const { recebidas, enviadas } = transferenciasDaConta(transfers, conta.id);
        const saldo = saldoDaConta({
          saldoInicial: Number(conta.saldo_inicial) || 0,
          sinalSaldoInicial: conta.sinal_saldo_inicial,
          entriesDaConta: entries.filter((e) => e.conta_bancaria_id === conta.id),
          transferenciasRecebidasPagas: recebidas,
          transferenciasEnviadasPagas: enviadas,
        });
        return { ...r, saldo_atual: saldo, _auto: `conta "${conta.nome}"` };
      }
    }
    const casam = entries.filter((e) => casaComNome(e, r.nome));
    if (r.tipo === "Projeto/Evento" && casam.length) {
      const pagos = casam.filter((e) => e.status === "Pago");
      const saldo = pagos.filter((e) => e.type === "Receber").reduce((a, e) => a + e.value, 0) - pagos.filter((e) => e.type === "Pagar").reduce((a, e) => a + e.value, 0);
      return { ...r, saldo_atual: saldo, _auto: "recebido − pago do projeto" };
    }
    if (r.tipo === "Comprometida") {
      const abertos = casam.filter((e) => e.type === "Pagar" && e.status !== "Pago");
      if (abertos.length) return { ...r, saldo_atual: abertos.reduce((a, e) => a + e.value, 0), _auto: `${abertos.length} conta(s) a pagar` };
    }
    return r;
  });
}


const soma = (xs: any[], k: string) => xs.reduce((a, x) => a + (Number(x[k]) || 0), 0);
const so = (xs: any[], k: string, v: string) => xs.filter((x) => x[k] === v);

/** Cobrança: promessas de pagamento (data e valor combinados com o cliente). */
export function FinanceiroPromessas() {
  const resumos: ResumoCadastro[] = [
    { label: "Prometido (pendente)", icon: Clock, tone: "warning", moeda: true, calcula: (l) => soma(so(l, "status", "Pendente"), "valor"), sub: (l) => `${so(l, "status", "Pendente").length} promessa(s)` },
    { label: "Vencidas sem pagamento", icon: AlertTriangle, tone: "danger", moeda: true, calcula: (l) => soma(so(l, "status", "Pendente").filter((x) => x.data_prometida < new Date().toISOString().slice(0, 10)), "valor") },
    { label: "Cumpridas", icon: CheckCircle2, tone: "success", moeda: true, calcula: (l) => soma(so(l, "status", "Cumprida"), "valor") },
    { label: "Quebradas", icon: AlertTriangle, tone: "danger", calcula: (l) => so(l, "status", "Quebrada").length },
  ];
  return (
    <CadastroFinanceiro
      tabela="finance_promessas"
      titulo="Promessas de Pagamento"
      descricao="Registre o que o cliente prometeu pagar (data e valor) e acompanhe se cumpriu."
      nomeItem="promessa"
      ordenarPor="data_prometida"
      campoStatus="status"
      resumos={resumos}
      campos={[
        { key: "cliente", label: "Cliente", tipo: "text", obrigatorio: true },
        { key: "valor", label: "Valor prometido", tipo: "money" },
        { key: "data_prometida", label: "Data prometida", tipo: "date", obrigatorio: true },
        { key: "status", label: "Status", tipo: "select", opcoes: ["Pendente", "Cumprida", "Quebrada"] },
        { key: "observacao", label: "Observação", tipo: "textarea" },
      ]}
    />
  );
}

/** Entradas: patrocínios e contrapartidas. */
export function FinanceiroPatrocinios() {
  return (
    <CadastroFinanceiro
      tabela="finance_patrocinios"
      titulo="Patrocínios"
      descricao="Patrocinadores, valores combinados e recebidos, e as contrapartidas a entregar. Permutas (pagamento em troca de produto ou serviço) ficam em Acordos e Permutas."
      nomeItem="patrocínio"
      masc
      campoStatus="status"
      progresso={{ atual: "valor_recebido", total: "valor_total", label: "Recebido" }}
      resumos={[
        { label: "Valor fechado", icon: Gift, moeda: true, calcula: (l) => soma(l.filter((x) => x.status !== "Cancelado" && x.status !== "Negociando"), "valor_total") },
        { label: "Já recebido", icon: CheckCircle2, tone: "success", moeda: true, calcula: (l) => soma(l, "valor_recebido") },
        { label: "A receber", icon: Wallet, tone: "warning", moeda: true, calcula: (l) => soma(l.filter((x) => x.status !== "Cancelado"), "valor_total") - soma(l.filter((x) => x.status !== "Cancelado"), "valor_recebido") },
        { label: "Contrapartidas pendentes", icon: AlertTriangle, tone: "danger", calcula: (l) => l.filter((x) => !x.entregue && (x.status === "Fechado" || x.status === "Recebido")).length },
      ]}
      campos={[
        { key: "patrocinador", label: "Patrocinador", tipo: "text", obrigatorio: true },
        { key: "projeto", label: "Projeto / evento", tipo: "text" },
        { key: "valor_total", label: "Valor total", tipo: "money" },
        { key: "valor_recebido", label: "Valor recebido", tipo: "money" },
        { key: "status", label: "Status", tipo: "select", opcoes: ["Negociando", "Fechado", "Recebido", "Cancelado"] },
        { key: "entregue", label: "Contrapartidas entregues", tipo: "bool" },
        { key: "contrapartidas", label: "Contrapartidas", tipo: "textarea" },
      ]}
    />
  );
}

/** Custos: viagens e eventos (orçado x gasto, prestação de contas). */
export function FinanceiroViagens() {
  return (
    <CadastroFinanceiro
      tabela="finance_viagens"
      titulo="Viagens e Eventos"
      descricao="Planejamento de viagens e eventos: orçamento, gasto e prestação de contas."
      nomeItem="viagem"
      ordenarPor="data_inicio"
      progresso={{ atual: "valor_gasto", total: "valor_orcado", label: "Gasto / orçado" }}
      resumos={[
        { label: "Orçado", icon: Plane, moeda: true, calcula: (l) => soma(l, "valor_orcado") },
        { label: "Gasto", icon: Wallet, tone: "warning", moeda: true, calcula: (l) => soma(l, "valor_gasto") },
        { label: "Estouro de orçamento", icon: AlertTriangle, tone: "danger", calcula: (l) => l.filter((x) => Number(x.valor_gasto) > Number(x.valor_orcado)).length },
        { label: "Prestação de contas pendente", icon: Clock, calcula: (l) => l.filter((x) => !x.prestacao_contas).length },
      ]}
      campos={[
        { key: "nome", label: "Viagem / evento", tipo: "text", obrigatorio: true },
        { key: "destino", label: "Destino", tipo: "text" },
        { key: "data_inicio", label: "Data de início", tipo: "date" },
        { key: "valor_orcado", label: "Valor orçado", tipo: "money" },
        { key: "valor_gasto", label: "Valor gasto", tipo: "money" },
        { key: "prestacao_contas", label: "Prestação de contas feita", tipo: "bool" },
        { key: "observacao", label: "Observação", tipo: "textarea" },
      ]}
    />
  );
}

/** Geral: metas e resultados por produto, vendedor ou projeto. */
export function FinanceiroMetas() {
  return (
    <CadastroFinanceiro
      tabela="finance_metas"
      titulo="Metas e Resultados"
      descricao="Meta do mês por produto, vendedor ou projeto, comparada com o realizado."
      nomeItem="meta"
      ordenarPor="mes"
      campoStatus="tipo"
      progresso={{ atual: "valor_realizado", total: "valor_meta", label: "Atingido" }}
      enriquecer={enriquecerMetas}
      dicaOrigem='Como o "realizado" é calculado: em meta de Geral, soma os recebimentos pagos do mês. Em Produto ou Projeto, soma os recebimentos pagos do mês cuja categoria ou tag tem o mesmo nome da meta. Sem lançamento com esse nome (e em Vendedor), vale o valor digitado.' 
      resumos={[
        { label: "Meta total", icon: Target, moeda: true, calcula: (l) => soma(l, "valor_meta") },
        { label: "Realizado", icon: CheckCircle2, tone: "success", moeda: true, calcula: (l) => soma(l, "valor_realizado") },
        { label: "Falta atingir", icon: Wallet, tone: "warning", moeda: true, calcula: (l) => Math.max(0, soma(l, "valor_meta") - soma(l, "valor_realizado")) },
        { label: "Metas batidas", icon: Users, calcula: (l) => l.filter((x) => Number(x.valor_meta) > 0 && Number(x.valor_realizado) >= Number(x.valor_meta)).length },
      ]}
      campos={[
        { key: "nome", label: "Meta (produto, vendedor ou projeto)", tipo: "text", obrigatorio: true },
        { key: "tipo", label: "Tipo", tipo: "select", opcoes: ["Produto", "Vendedor", "Projeto", "Geral"] },
        { key: "mes", label: "Mês", tipo: "month", obrigatorio: true },
        { key: "valor_meta", label: "Valor da meta", tipo: "money" },
        { key: "valor_realizado", label: "Valor realizado", tipo: "money" },
      ]}
    />
  );
}

/** Geral: reservas financeiras. */
export function FinanceiroReservas() {
  return (
    <CadastroFinanceiro
      tabela="finance_reservas"
      titulo="Reservas Financeiras"
      descricao="Reserva operacional, reservas por projeto/evento e valores comprometidos: meta e saldo atual."
      nomeItem="reserva"
      campoStatus="tipo"
      progresso={{ atual: "saldo_atual", total: "valor_meta", label: "Saldo / meta" }}
      enriquecer={enriquecerReservas}
      dicaOrigem='Como o saldo é calculado: Operacional usa o saldo real da conta bancária com o mesmo nome da reserva. Projeto/Evento usa recebido − pago dos lançamentos com categoria ou tag de mesmo nome. Comprometida soma as contas a pagar em aberto com esse nome. Sem correspondência, vale o valor digitado.' 
      resumos={[
        { label: "Saldo reservado", icon: PiggyBank, tone: "success", moeda: true, calcula: (l) => soma(l, "saldo_atual") },
        { label: "Meta das reservas", icon: Target, moeda: true, calcula: (l) => soma(l, "valor_meta") },
        { label: "Falta completar", icon: Wallet, tone: "warning", moeda: true, calcula: (l) => Math.max(0, soma(l, "valor_meta") - soma(l, "saldo_atual")) },
      ]}
      campos={[
        { key: "nome", label: "Reserva", tipo: "text", obrigatorio: true },
        { key: "tipo", label: "Tipo", tipo: "select", opcoes: ["Operacional", "Projeto/Evento", "Comprometida"] },
        { key: "valor_meta", label: "Meta", tipo: "money" },
        { key: "saldo_atual", label: "Saldo atual", tipo: "money" },
        { key: "observacao", label: "Observação", tipo: "textarea" },
      ]}
    />
  );
}
