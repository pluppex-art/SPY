import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, DollarSign, Gift, HandCoins, Handshake, MessageCircle, Repeat, Users, Wallet, Download } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { friendlyError } from "../../lib/friendlyError";
import { useAuth } from "../../contexts/AuthContext";
import { useLocalization } from "../../contexts/LocalizationContext";
import { Button } from "../../components/ui/button";
import { CadastroFinanceiro, type ApiCadastro } from "./components/CadastroFinanceiro";
import { SecaoCard } from "./components/SecaoCard";
import { hojeISO, useFinanceEntriesResumo } from "./hooks/useFinanceEntriesResumo";

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();
const soma = (xs: any[], k: string) => xs.reduce((a, x) => a + (Number(x[k]) || 0), 0);
const dataBR = (iso?: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");
const unicos = (xs: (string | null | undefined)[]) => Array.from(new Set(xs.map((x) => String(x ?? "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR"));
const diasAtras = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return hojeISO(d); };

/** Nomes de quem já está cadastrado como funcionário (Financeiro) ou colaborador (RH) — autocompletar de "Pessoa". */
async function sugestoesFuncionarios(tenantId: string) {
  const [f, c] = await Promise.all([
    supabase!.from("finance_funcionarios").select("nome").eq("tenant_id", tenantId).limit(500),
    supabase!.from("colaboradores").select("nome").eq("tenant_id", tenantId).limit(500),
  ]);
  return { pessoa: unicos([...(f.data || []).map((x: any) => x.nome), ...(c.data || []).map((x: any) => x.nome)]) };
}
/** Funcionários + clientes/fornecedores que já aparecem nos lançamentos — autocompletar de "Pessoa / empresa". */
async function sugestoesPessoasEEmpresas(tenantId: string) {
  const base = await sugestoesFuncionarios(tenantId);
  const { data } = await supabase!.from("finance_entries").select("counterparty").eq("tenant_id", tenantId).not("counterparty", "is", null).limit(1000);
  return { pessoa: unicos([...base.pessoa, ...(data || []).map((x: any) => x.counterparty)]) };
}
async function sugestoesClientes(tenantId: string) {
  const { data } = await supabase!.from("finance_entries").select("counterparty").eq("tenant_id", tenantId).eq("type", "Receber").not("counterparty", "is", null).limit(1000);
  return { cliente: unicos((data || []).map((x: any) => x.counterparty)) };
}

// ═════════════════════════════ Histórico de cobranças ═════════════════════════════

interface ClienteEmAtraso { cliente: string; valor: number; qtd: number; diasMaior: number; vencimentoMaisAntigo: string }

/** Cobrança: cada contato feito, quem precisa ser cobrado agora e os retornos combinados. */
export function FinanceiroHistoricoCobrancas() {
  const { rows, hoje } = useFinanceEntriesResumo();
  const { formatCurrency: brl } = useLocalization();

  // Quem está em atraso nos lançamentos (a receber vencido), por cliente.
  const emAtraso = useMemo<ClienteEmAtraso[]>(() => {
    const m = new Map<string, ClienteEmAtraso>();
    for (const l of rows) {
      if (l.type !== "Receber" || l.status === "Pago" || !l.date || l.date >= hoje || !l.counterparty) continue;
      const dias = Math.round((new Date(hoje).getTime() - new Date(l.date).getTime()) / 86400000);
      const a = m.get(l.counterparty) ?? { cliente: l.counterparty, valor: 0, qtd: 0, diasMaior: 0, vencimentoMaisAntigo: l.date };
      a.valor += l.value; a.qtd += 1; a.diasMaior = Math.max(a.diasMaior, dias);
      if (l.date < a.vencimentoMaisAntigo) a.vencimentoMaisAntigo = l.date;
      m.set(l.counterparty, a);
    }
    return [...m.values()].sort((a, b) => b.valor - a.valor);
  }, [rows, hoje]);

  const modelo = (c: ClienteEmAtraso) =>
    `Olá, ${c.cliente}! Tudo bem? Identificamos ${c.qtd > 1 ? `${c.qtd} pendências` : "uma pendência"} de ${brl(c.valor)} em aberto desde ${dataBR(c.vencimentoMaisAntigo)}. Podemos ajudar a regularizar? Qual a melhor data para o pagamento?`;

  // Retornos combinados que já venceram e ainda não tiveram um contato depois.
  const retornosPendentes = (linhas: any[]) =>
    linhas.filter((l) => l.proximo_contato && l.proximo_contato <= hoje && !linhas.some((o) => o !== l && norm(o.cliente) === norm(l.cliente) && o.data_contato >= l.proximo_contato));
  const semCobrancaRecente = (linhas: any[]) => {
    const recentes = new Set(linhas.filter((l) => l.data_contato >= diasAtras(7)).map((l) => norm(l.cliente)));
    return emAtraso.filter((c) => !recentes.has(norm(c.cliente)));
  };

  const acima = (linhas: any[], api: ApiCadastro) => {
    const pend = retornosPendentes(linhas);
    const sem = semCobrancaRecente(linhas);
    return (
      <div className="grid gap-4 xl:grid-cols-2">
        <SecaoCard titulo={`Cobrar agora — ${sem.length} cliente(s) em atraso sem contato nos últimos 7 dias`} icon={AlertTriangle} semPadding>
          {sem.length === 0 ? (
            <p className="p-4 text-sm text-emerald-600"><CheckCircle2 className="mr-1.5 inline h-4 w-4" />Todos os clientes em atraso foram contatados na última semana.</p>
          ) : (
            <ul className="divide-y divide-[var(--color-border-default)]">
              {sem.slice(0, 8).map((c) => (
                <li key={c.cliente} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{c.cliente}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">{c.qtd} título(s) · atraso de até {c.diasMaior} dia(s)</p>
                  </div>
                  <span className="whitespace-nowrap font-semibold tabular-nums text-rose-600">{brl(c.valor)}</span>
                  <Button size="sm" variant="outline" onClick={() => api.novo({ cliente: c.cliente, valor_cobrado: c.valor.toFixed(2).replace(".", ","), canal: "WhatsApp", mensagem: modelo(c) })}>
                    <MessageCircle className="mr-1.5 h-3.5 w-3.5" />Cobrar
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </SecaoCard>
        <SecaoCard titulo={`Retornos combinados — ${pend.length} para fazer`} icon={CalendarClock} semPadding>
          {pend.length === 0 ? (
            <p className="p-4 text-sm text-[var(--color-text-muted)]">Nenhum retorno vencido. Ao registrar uma cobrança, informe o "Próximo contato" para ele aparecer aqui.</p>
          ) : (
            <ul className="divide-y divide-[var(--color-border-default)]">
              {pend.slice(0, 8).map((l) => (
                <li key={l.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{l.cliente}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">Retornar em {dataBR(l.proximo_contato)}{l.resultado ? ` · último: ${l.resultado}` : ""}</p>
                  </div>
                  {Number(l.valor_cobrado) > 0 && <span className="whitespace-nowrap font-semibold tabular-nums">{brl(Number(l.valor_cobrado))}</span>}
                  <Button size="sm" variant="outline" onClick={() => api.novo({ cliente: l.cliente, valor_cobrado: Number(l.valor_cobrado || 0).toFixed(2).replace(".", ",") })}>Registrar retorno</Button>
                </li>
              ))}
            </ul>
          )}
        </SecaoCard>
      </div>
    );
  };

  return (
    <CadastroFinanceiro
      tabela="finance_cobranca_historico"
      titulo="Histórico de Cobranças"
      descricao="Cada contato de cobrança feito com o cliente, quem precisa ser cobrado agora e os retornos combinados."
      nomeItem="cobrança"
      ordenarPor="data_contato"
      campoStatus="canal"
      sugestoes={sugestoesClientes}
      acima={acima}
      resumos={[
        { label: "Contatos no mês", icon: MessageCircle, calcula: (l) => l.filter((x) => String(x.data_contato).startsWith(hoje.slice(0, 7))).length, sub: (l) => `${l.length} no total` },
        { label: "Clientes em atraso", icon: AlertTriangle, tone: emAtraso.length ? "danger" : "default", calcula: () => emAtraso.length, sub: () => `${brl(emAtraso.reduce((a, c) => a + c.valor, 0))} em aberto` },
        { label: "Sem cobrança há 7 dias", icon: Clock, tone: "warning", calcula: (l) => semCobrancaRecente(l).length, sub: () => "em atraso e sem contato" },
        { label: "Retornos para fazer", icon: CalendarClock, tone: "warning", calcula: (l) => retornosPendentes(l).length, sub: () => "combinados e vencidos" },
      ]}
      campos={[
        { key: "cliente", label: "Cliente", tipo: "text", obrigatorio: true },
        { key: "canal", label: "Canal", tipo: "select", opcoes: ["WhatsApp", "E-mail", "Ligação", "Presencial"] },
        { key: "data_contato", label: "Data do contato", tipo: "date" },
        { key: "valor_cobrado", label: "Valor cobrado", tipo: "money" },
        { key: "resultado", label: "Resultado", tipo: "text", ajuda: "Ex.: prometeu pagar sexta, sem resposta, contestou o valor." },
        { key: "proximo_contato", label: "Próximo contato", tipo: "date", padrao: "", ajuda: "Opcional. Quando preencher, o retorno aparece em \"Retornos combinados\"." },
        { key: "responsavel", label: "Quem cobrou", tipo: "text", naLista: false },
        { key: "mensagem", label: "Mensagem / observação", tipo: "textarea" },
      ]}
    />
  );
}

// ═════════════════════════════ Adiantamentos ═════════════════════════════

/** Quanto ainda falta descontar: parcelas que restam × valor da parcela (zero se já foi descontado). */
const saldoAdiantamento = (a: any) => {
  if (a.status === "Descontado") return 0;
  const p = Math.max(1, Number(a.parcelas) || 1);
  return (Number(a.valor) || 0) * Math.max(0, p - (Number(a.parcelas_descontadas) || 0)) / p;
};

/** Pessoas: adiantamentos, vales e empréstimos de funcionários e sócios, com desconto em parcelas. */
export function FinanceiroAdiantamentos() {
  const { formatCurrency: brl } = useLocalization();
  const acima = (linhas: any[]) => {
    const porPessoa = new Map<string, { pessoa: string; qtd: number; saldo: number; parcela: number }>();
    for (const a of linhas) {
      const s = saldoAdiantamento(a);
      if (s <= 0) continue;
      const g = porPessoa.get(a.pessoa) ?? { pessoa: a.pessoa, qtd: 0, saldo: 0, parcela: 0 };
      g.qtd += 1; g.saldo += s; g.parcela += (Number(a.valor) || 0) / Math.max(1, Number(a.parcelas) || 1);
      porPessoa.set(a.pessoa, g);
    }
    const lista = [...porPessoa.values()].sort((a, b) => b.saldo - a.saldo);
    return (
      <SecaoCard titulo={`Saldo a descontar por pessoa — ${lista.length} pessoa(s)`} icon={Users} semPadding>
        {lista.length === 0 ? (
          <p className="p-4 text-sm text-[var(--color-text-muted)]">Ninguém com saldo em aberto.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border-default)] text-left text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">
                  <th className="px-4 py-2 font-semibold">Pessoa</th><th className="px-4 py-2 font-semibold">Adiantamentos</th>
                  <th className="px-4 py-2 text-right font-semibold">Desconto por mês</th><th className="px-4 py-2 text-right font-semibold">Saldo a descontar</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((g) => (
                  <tr key={g.pessoa} className="border-b border-[var(--color-border-default)] last:border-0">
                    <td className="px-4 py-2 font-semibold">{g.pessoa}</td>
                    <td className="px-4 py-2">{g.qtd}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{brl(g.parcela)}</td>
                    <td className="px-4 py-2 text-right font-semibold tabular-nums text-amber-600">{brl(g.saldo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SecaoCard>
    );
  };
  return (
    <CadastroFinanceiro
      tabela="finance_adiantamentos"
      titulo="Adiantamentos"
      descricao="Adiantamentos, vales e empréstimos a funcionários ou sócios, e como serão descontados (à vista ou em parcelas na folha)."
      nomeItem="adiantamento"
      masc
      ordenarPor="data_adiantamento"
      campoStatus="status"
      sugestoes={sugestoesFuncionarios}
      acima={acima}
      resumos={[
        { label: "Saldo a descontar", icon: HandCoins, tone: "warning", moeda: true, calcula: (l) => l.reduce((a, x) => a + saldoAdiantamento(x), 0), sub: (l) => `${l.filter((x) => saldoAdiantamento(x) > 0).length} adiantamento(s) em aberto` },
        { label: "Já descontado", icon: CheckCircle2, tone: "success", moeda: true, calcula: (l) => soma(l, "valor") - l.reduce((a, x) => a + saldoAdiantamento(x), 0) },
        { label: "Pessoas com saldo", icon: Users, calcula: (l) => new Set(l.filter((x) => saldoAdiantamento(x) > 0).map((x) => norm(x.pessoa))).size },
        { label: "Desconto mensal previsto", icon: Repeat, moeda: true, calcula: (l) => l.filter((x) => saldoAdiantamento(x) > 0).reduce((a, x) => a + (Number(x.valor) || 0) / Math.max(1, Number(x.parcelas) || 1), 0), sub: () => "soma das parcelas do mês" },
      ]}
      campos={[
        { key: "pessoa", label: "Pessoa", tipo: "text", obrigatorio: true },
        { key: "tipo", label: "Tipo", tipo: "select", opcoes: ["Adiantamento", "Vale", "Empréstimo"] },
        { key: "valor", label: "Valor", tipo: "money" },
        { key: "data_adiantamento", label: "Data", tipo: "date" },
        { key: "parcelas", label: "Parcelas do desconto", tipo: "int", padrao: 1, ajuda: "Em quantas folhas será descontado. 1 = tudo de uma vez." },
        { key: "parcelas_descontadas", label: "Parcelas já descontadas", tipo: "int", padrao: 0 },
        { key: "desconto_em", label: "Primeiro desconto em", tipo: "text", ajuda: "Ex.: Folha de dezembro." },
        { key: "forma_pagamento", label: "Forma de pagamento", tipo: "select", opcoes: ["Pix", "Transferência", "Dinheiro", "Cartão"], naLista: false },
        { key: "status", label: "Situação", tipo: "select", opcoes: ["Em aberto", "Descontado"] },
        { key: "observacao", label: "Observação", tipo: "textarea" },
      ]}
    />
  );
}

// ═════════════════════════════ Acordos, descontos e permutas ═════════════════════════════

/** Pessoas: acordos de pagamento, descontos concedidos e permutas, com parcelas e contrapartida. */
export function FinanceiroAcordos() {
  const { formatCurrency: brl } = useLocalization();
  const hoje = hojeISO();
  const ativos = (l: any[]) => l.filter((x) => x.status !== "Cancelado");
  const desconto = (x: any) => Math.max(0, (Number(x.valor_original) || 0) - (Number(x.valor) || 0));

  const acima = (linhas: any[]) => {
    const por = (tipo: string) => ativos(linhas).filter((x) => x.tipo === tipo);
    const cartoes = [
      { tipo: "Acordo", icon: Handshake, texto: "Pagamentos combinados", valor: soma(por("Acordo"), "valor") },
      { tipo: "Desconto", icon: DollarSign, texto: "Total concedido em desconto", valor: por("Desconto").reduce((a, x) => a + (desconto(x) || Number(x.valor) || 0), 0) },
      { tipo: "Permuta", icon: Gift, texto: "Valor trocado por serviços/produtos", valor: soma(por("Permuta"), "valor") },
    ];
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {cartoes.map((c) => (
          <SecaoCard key={c.tipo} titulo={`${c.tipo}s`} icon={c.icon}>
            <p className="text-2xl font-black tabular-nums">{brl(c.valor)}</p>
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{por(c.tipo).length} registro(s) · {c.texto}</p>
          </SecaoCard>
        ))}
      </div>
    );
  };

  return (
    <CadastroFinanceiro
      tabela="finance_acordos"
      titulo="Acordos, Descontos e Permutas"
      descricao="Acordos de pagamento, descontos concedidos e permutas com clientes, funcionários, parceiros e fornecedores."
      nomeItem="acordo"
      masc
      ordenarPor="data_acordo"
      campoStatus="status"
      sugestoes={sugestoesPessoasEEmpresas}
      acima={acima}
      resumos={[
        { label: "Em andamento", icon: Handshake, tone: "warning", moeda: true, calcula: (l) => soma(l.filter((x) => x.status === "Em andamento"), "valor"), sub: (l) => `${l.filter((x) => x.status === "Em andamento").length} acordo(s)` },
        { label: "Descontos concedidos", icon: DollarSign, moeda: true, calcula: (l) => ativos(l).reduce((a, x) => a + desconto(x), 0), sub: () => "valor original − valor do acordo" },
        { label: "Permutas a entregar", icon: Gift, tone: "warning", calcula: (l) => l.filter((x) => x.tipo === "Permuta" && x.status === "Em andamento" && !x.entregue).length },
        { label: "Vencem em 30 dias", icon: CalendarClock, calcula: (l) => l.filter((x) => x.status === "Em andamento" && x.data_vencimento && x.data_vencimento >= hoje && x.data_vencimento <= diasAtras(-30)).length, sub: () => "acordos em andamento" },
      ]}
      campos={[
        { key: "pessoa", label: "Pessoa / empresa", tipo: "text", obrigatorio: true },
        { key: "contraparte_tipo", label: "Quem é", tipo: "select", opcoes: ["Cliente", "Funcionário", "Parceiro", "Fornecedor"], naLista: false },
        { key: "tipo", label: "Tipo", tipo: "select", opcoes: ["Acordo", "Desconto", "Permuta"] },
        { key: "valor_original", label: "Valor original", tipo: "money", naLista: false, ajuda: "Antes do desconto. Deixe em branco se não houver." },
        { key: "valor", label: "Valor do acordo", tipo: "money" },
        { key: "parcelas", label: "Parcelas", tipo: "int", padrao: 1, naLista: false },
        { key: "data_acordo", label: "Data do acordo", tipo: "date" },
        { key: "data_vencimento", label: "Vencimento", tipo: "date", padrao: "" },
        { key: "contrapartida", label: "Contrapartida (permuta)", tipo: "text", naLista: false, ajuda: "O que a outra parte entrega em troca. Ex.: 2 stands no evento." },
        { key: "entregue", label: "Contrapartida entregue", tipo: "bool", naLista: false },
        { key: "status", label: "Situação", tipo: "select", opcoes: ["Em andamento", "Concluído", "Cancelado"] },
        { key: "descricao", label: "Descrição", tipo: "textarea" },
      ]}
    />
  );
}

// ═════════════════════════════ Funcionários e salários ═════════════════════════════

/** Traz para o Financeiro quem já está cadastrado no RH (nome, cargo e admissão), sem duplicar. */
function ImportarDoRH({ linhas, api }: { linhas: any[]; api: ApiCadastro }) {
  const { activeTenantId: tenantId } = useAuth();
  const [colabs, setColabs] = useState<any[]>([]);
  const [importando, setImportando] = useState(false);
  useEffect(() => {
    if (!supabase || !tenantId) return;
    supabase.from("colaboradores").select("id,nome,cargo,data_admissao,status").eq("tenant_id", tenantId).limit(1000).then(({ data }) => setColabs(data || []));
  }, [tenantId]);
  const jaTem = new Set(linhas.map((l) => norm(l.nome)));
  const faltam = colabs.filter((c) => c.nome && !jaTem.has(norm(c.nome)));
  if (faltam.length === 0) return null;

  const importar = async () => {
    if (!supabase || !tenantId) return;
    setImportando(true);
    const novos = faltam.map((c) => ({ tenant_id: tenantId, nome: c.nome, cargo: c.cargo || null, data_admissao: c.data_admissao || null, colaborador_id: c.id, status: String(c.status || "").toLowerCase().startsWith("inativ") ? "Desligado" : "Ativo" }));
    const { error } = await supabase.from("finance_funcionarios").insert(novos);
    setImportando(false);
    if (error) return toast.error(friendlyError(error));
    toast.success(`${novos.length} pessoa(s) trazida(s) do RH. Agora é só informar o salário de cada uma.`);
    api.recarregar();
  };

  return (
    <SecaoCard titulo="Equipe do RH ainda fora do financeiro" icon={Users}>
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-sm text-[var(--color-text-muted)]">
          {faltam.length} pessoa(s) cadastrada(s) no RH ainda não estão aqui: {faltam.slice(0, 5).map((c) => c.nome).join(", ")}{faltam.length > 5 ? "…" : ""}.
        </p>
        <Button onClick={importar} disabled={importando}><Download className="mr-2 h-4 w-4" />{importando ? "Importando…" : "Trazer do RH"}</Button>
      </div>
    </SecaoCard>
  );
}

/** Pessoas: cadastro de funcionários com contrato, salário e dia de pagamento (base da Folha de Pagamento). */
export function FinanceiroFuncionarios() {
  const ativos = (l: any[]) => l.filter((x) => x.status === "Ativo");
  return (
    <CadastroFinanceiro
      tabela="finance_funcionarios"
      titulo="Funcionários e Salários"
      descricao="Cadastro da equipe para o financeiro: contrato, salário base, dia e chave Pix do pagamento. É a base da Folha de Pagamento."
      nomeItem="funcionário"
      masc
      ordenarPor="nome"
      campoStatus="status"
      acima={(linhas, api) => <ImportarDoRH linhas={linhas} api={api} />}
      resumos={[
        { label: "Funcionários ativos", icon: Users, calcula: (l) => ativos(l).length, sub: (l) => `${l.length} cadastrado(s) no total` },
        { label: "Folha mensal (salários base)", icon: Wallet, tone: "warning", moeda: true, calcula: (l) => soma(ativos(l), "salario_base") },
        { label: "Salário médio", icon: DollarSign, moeda: true, calcula: (l) => (ativos(l).length ? soma(ativos(l), "salario_base") / ativos(l).length : 0) },
        { label: "Sem salário informado", icon: AlertTriangle, tone: "danger", calcula: (l) => ativos(l).filter((x) => !(Number(x.salario_base) > 0)).length, sub: () => "ativos com salário zerado" },
      ]}
      campos={[
        { key: "nome", label: "Nome", tipo: "text", obrigatorio: true },
        { key: "cargo", label: "Cargo", tipo: "text" },
        { key: "tipo_contrato", label: "Contrato", tipo: "select", opcoes: ["CLT", "PJ", "Estágio", "Autônomo", "Sócio"] },
        { key: "salario_base", label: "Salário base", tipo: "money" },
        { key: "dia_pagamento", label: "Dia do pagamento", tipo: "int", padrao: 5 },
        { key: "chave_pix", label: "Chave Pix", tipo: "text", naLista: false },
        { key: "data_admissao", label: "Admissão", tipo: "date", padrao: "", naLista: false },
        { key: "status", label: "Situação", tipo: "select", opcoes: ["Ativo", "Afastado", "Desligado"] },
        { key: "observacao", label: "Observação", tipo: "textarea" },
      ]}
    />
  );
}
