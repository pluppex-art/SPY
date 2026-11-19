import { AlertTriangle, CheckCircle2, Clock, Wallet, Target, Gift, Plane, HandCoins, Handshake, PiggyBank, MessageCircle, Users } from "lucide-react";
import { CadastroFinanceiro, type ResumoCadastro } from "./components/CadastroFinanceiro";

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

/** Cobrança: histórico de contatos (WhatsApp, e-mail, ligação). */
export function FinanceiroHistoricoCobrancas() {
  return (
    <CadastroFinanceiro
      tabela="finance_cobranca_historico"
      titulo="Histórico de Cobranças"
      descricao="Cada contato de cobrança feito com o cliente: canal, data, mensagem e resultado."
      nomeItem="cobrança"
      ordenarPor="data_contato"
      campoStatus="canal"
      resumos={[{ label: "Contatos registrados", icon: MessageCircle, calcula: (l) => l.length }]}
      campos={[
        { key: "cliente", label: "Cliente", tipo: "text", obrigatorio: true },
        { key: "canal", label: "Canal", tipo: "select", opcoes: ["WhatsApp", "E-mail", "Ligação", "Presencial"] },
        { key: "data_contato", label: "Data do contato", tipo: "date" },
        { key: "resultado", label: "Resultado", tipo: "text" },
        { key: "mensagem", label: "Mensagem / observação", tipo: "textarea" },
      ]}
    />
  );
}

/** Pessoas: adiantamentos de funcionários e sócios. */
export function FinanceiroAdiantamentos() {
  return (
    <CadastroFinanceiro
      tabela="finance_adiantamentos"
      titulo="Adiantamentos"
      descricao="Valores adiantados a funcionários ou sócios e em qual pagamento serão descontados."
      nomeItem="adiantamento"
      ordenarPor="data_adiantamento"
      campoStatus="status"
      resumos={[
        { label: "Em aberto", icon: HandCoins, tone: "warning", moeda: true, calcula: (l) => soma(so(l, "status", "Em aberto"), "valor"), sub: (l) => `${so(l, "status", "Em aberto").length} adiantamento(s)` },
        { label: "Já descontado", icon: CheckCircle2, tone: "success", moeda: true, calcula: (l) => soma(so(l, "status", "Descontado"), "valor") },
      ]}
      campos={[
        { key: "pessoa", label: "Pessoa", tipo: "text", obrigatorio: true },
        { key: "valor", label: "Valor", tipo: "money" },
        { key: "data_adiantamento", label: "Data", tipo: "date" },
        { key: "desconto_em", label: "Descontar em (ex.: Folha de dezembro)", tipo: "text" },
        { key: "status", label: "Status", tipo: "select", opcoes: ["Em aberto", "Descontado"] },
        { key: "observacao", label: "Observação", tipo: "textarea" },
      ]}
    />
  );
}

/** Pessoas: acordos, descontos e permutas. */
export function FinanceiroAcordos() {
  return (
    <CadastroFinanceiro
      tabela="finance_acordos"
      titulo="Acordos, Descontos e Permutas"
      descricao="Acordos fechados com clientes, funcionários e parceiros, com valor e situação."
      nomeItem="acordo"
      ordenarPor="data_acordo"
      campoStatus="status"
      resumos={[
        { label: "Em andamento", icon: Handshake, tone: "warning", moeda: true, calcula: (l) => soma(so(l, "status", "Em andamento"), "valor"), sub: (l) => `${so(l, "status", "Em andamento").length} acordo(s)` },
        { label: "Concluídos", icon: CheckCircle2, tone: "success", moeda: true, calcula: (l) => soma(so(l, "status", "Concluído"), "valor") },
      ]}
      campos={[
        { key: "pessoa", label: "Pessoa / empresa", tipo: "text", obrigatorio: true },
        { key: "tipo", label: "Tipo", tipo: "select", opcoes: ["Acordo", "Desconto", "Permuta"] },
        { key: "valor", label: "Valor", tipo: "money" },
        { key: "data_acordo", label: "Data", tipo: "date" },
        { key: "status", label: "Status", tipo: "select", opcoes: ["Em andamento", "Concluído", "Cancelado"] },
        { key: "descricao", label: "Descrição", tipo: "textarea" },
      ]}
    />
  );
}

/** Entradas: patrocínios e contrapartidas. */
export function FinanceiroPatrocinios() {
  return (
    <CadastroFinanceiro
      tabela="finance_patrocinios"
      titulo="Patrocínios e Permutas"
      descricao="Patrocinadores, valores combinados e recebidos, e as contrapartidas a entregar."
      nomeItem="patrocínio"
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
