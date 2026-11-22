import { useState } from "react";
import { Calculator, Loader2 } from "lucide-react";
import { PageContainer } from "../../components/PageContainer";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { apiFetch } from "../../lib/apiClient";
import { formatBRL } from "../../lib/dinheiro";

type Campo = { nome: string; rotulo: string; dica?: string; opcoes?: { v: string; t: string }[] };
const CALCULOS: { id: string; titulo: string; campos: Campo[] }[] = [
  { id: "salario-liquido", titulo: "Salário líquido", campos: [
    { nome: "salario", rotulo: "Salário bruto (R$)", dica: "3500" }, { nome: "dependentes", rotulo: "Dependentes", dica: "0" }, { nome: "pensao", rotulo: "Pensão alimentícia (R$)", dica: "0" }] },
  { id: "inss", titulo: "INSS", campos: [
    { nome: "salario", rotulo: "Salário (R$)", dica: "3500" },
    { nome: "categoria", rotulo: "Categoria", opcoes: [{ v: "empregado", t: "Empregado" }, { v: "individual", t: "Contribuinte individual" }, { v: "simplificado", t: "Plano simplificado" }, { v: "baixa_renda", t: "Baixa renda" }] }] },
  { id: "irrf", titulo: "IRRF", campos: [
    { nome: "salario", rotulo: "Salário (R$)", dica: "5000" }, { nome: "dependentes", rotulo: "Dependentes", dica: "0" }, { nome: "pensao", rotulo: "Pensão alimentícia (R$)", dica: "0" }] },
  { id: "seguro-desemprego", titulo: "Seguro-desemprego", campos: [
    { nome: "salario1", rotulo: "Salário mês 1 (R$)" }, { nome: "salario2", rotulo: "Salário mês 2 (R$)" }, { nome: "salario3", rotulo: "Salário mês 3 (R$)" },
    { nome: "solicitacao", rotulo: "Nº da solicitação", dica: "1" }, { nome: "meses", rotulo: "Meses trabalhados" }] },
  { id: "saque-aniversario", titulo: "Saque-aniversário (FGTS)", campos: [{ nome: "saldo", rotulo: "Saldo do FGTS (R$)" }] },
  { id: "das-mei", titulo: "DAS do MEI", campos: [
    { nome: "atividade", rotulo: "Atividade", opcoes: [{ v: "servicos", t: "Serviços" }, { v: "comercio", t: "Comércio" }, { v: "misto", t: "Comércio e serviços" }] },
    { nome: "faturamento", rotulo: "Faturamento no ano (R$)" }] },
];
const campo = "h-[38px] rounded-[var(--radius-control)] border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] px-3 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]";

function rotulo(k: string) { return k.replace(/([A-Z])/g, " $1").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()); }
/** Mostra o resultado: linhas prontas (salário líquido) ou os campos do resultado, sem inventar nenhum. */
function Resultado({ r }: { r: any }) {
  const linhas: { label: string; value: number; kind?: string }[] | null = Array.isArray(r?.lines) ? r.lines : null;
  if (linhas) {
    return (
      <div className="divide-y divide-[var(--color-border-default)]">
        {linhas.map((l, i) => (
          <div key={i} className="flex justify-between py-2 text-sm"><span>{l.label}</span>
            <span className={l.kind === "debit" ? "text-[var(--color-danger)]" : ""}>{formatBRL(Math.abs(Number(l.value) || 0))}</span></div>
        ))}
        {r?.total && <div className="flex justify-between py-2 text-base font-bold"><span>{r.total.label}</span><span>{formatBRL(Number(r.total.value) || 0)}</span></div>}
      </div>
    );
  }
  const itens = Object.entries(r ?? {}).filter(([, v]) => typeof v === "number" || typeof v === "string");
  return (
    <div className="divide-y divide-[var(--color-border-default)]">
      {itens.map(([k, v]) => <div key={k} className="flex justify-between py-2 text-sm"><span>{rotulo(k)}</span><span>{String(v)}</span></div>)}
      {!itens.length && <pre className="text-xs overflow-auto">{JSON.stringify(r, null, 2)}</pre>}
    </div>
  );
}

export default function CalculadoraTrabalhista() {
  const [id, setId] = useState(CALCULOS[0].id);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [saida, setSaida] = useState<any>(null);
  const calc = CALCULOS.find((c) => c.id === id)!;

  async function calcular() {
    setCarregando(true); setErro(null); setSaida(null);
    try {
      const q = new URLSearchParams(Object.entries(vals).filter(([k, v]) => v.trim() && calc.campos.some((c) => c.nome === k)));
      const r = await apiFetch(`/api/br/trabalhista/${id}?${q.toString()}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(j.error || "Não foi possível calcular agora."); return; }
      setSaida(j);
    } finally { setCarregando(false); }
  }

  return (
    <PageContainer breadcrumb={[{ label: "Equipe & RH", path: "/app/equipe" }, { label: "Calculadora trabalhista" }]} title="Calculadora trabalhista"
      subtitle="Salário líquido, INSS, IRRF, seguro-desemprego, saque-aniversário e DAS do MEI, com as regras de 2026.">
      <Card className="p-4 mb-4">
        <div className="flex flex-wrap gap-2 mb-4">
          {CALCULOS.map((c) => (
            <button key={c.id} onClick={() => { setId(c.id); setVals({}); setSaida(null); setErro(null); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${id === c.id ? "bg-[var(--color-primary-blue)]/15 text-[var(--color-primary-blue)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"}`}>{c.titulo}</button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {calc.campos.map((c) => (
            <label key={c.nome} className="flex flex-col gap-1 text-xs font-bold text-[var(--color-text-muted)]">{c.rotulo}
              {c.opcoes ? (
                <select className={campo} value={vals[c.nome] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [c.nome]: e.target.value }))}>
                  <option value="">Escolha</option>{c.opcoes.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
                </select>
              ) : (
                <input className={`${campo} w-[160px]`} inputMode="decimal" placeholder={c.dica} value={vals[c.nome] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [c.nome]: e.target.value }))} />
              )}
            </label>
          ))}
          <Button onClick={calcular} disabled={carregando}>{carregando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />} Calcular</Button>
        </div>
      </Card>

      {erro && <Card className="p-4 mb-4 text-sm text-[var(--color-danger)]">{erro}</Card>}
      {saida && (
        <Card className="p-4 max-w-xl">
          <Resultado r={saida.resultado} />
          <p className="mt-3 text-[11px] text-[var(--color-text-muted)]">
            Regras de {saida.ano ?? "2026"}{saida.regrasAtualizadasEm ? ` (atualizadas em ${saida.regrasAtualizadasEm})` : ""}. Conteúdo informativo: não substitui o eSocial nem a orientação de um contador.
            Fonte: <a className="underline" href="https://contaclt.com/" target="_blank" rel="noreferrer">ContaCLT</a>.
          </p>
        </Card>
      )}
    </PageContainer>
  );
}
