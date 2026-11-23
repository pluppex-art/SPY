import { useEffect, useState } from "react";
import { Calculator, Loader2 } from "lucide-react";
import { Modal } from "../../../components/ui/modal";
import { Button } from "../../../components/ui/button";
import { apiFetch } from "../../../lib/apiClient";
import { formatBRL } from "../../../lib/dinheiro";
import { Field, ModalTitle, inputCls } from "./ModalKit";

type Linha = { label: string; value: number; kind?: string };

/** Salário líquido de um funcionário (INSS, IRRF, dependentes e pensão), já com o salário base preenchido. */
export function CalculoSalarioModal({ aberto, onClose, nome, salario }: { aberto: boolean; onClose: () => void; nome: string; salario: number }) {
  const [dependentes, setDependentes] = useState("0");
  const [pensao, setPensao] = useState("0");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [saida, setSaida] = useState<any>(null);

  useEffect(() => { if (aberto) { setDependentes("0"); setPensao("0"); setSaida(null); setErro(null); } }, [aberto, salario]);

  async function calcular() {
    setCarregando(true); setErro(null); setSaida(null);
    try {
      const q = new URLSearchParams({ salario: String(salario || 0), dependentes: dependentes || "0", pensao: pensao || "0" });
      const r = await apiFetch(`/api/br/trabalhista/salario-liquido?${q.toString()}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(j.error || "Não foi possível calcular agora."); return; }
      setSaida(j);
    } catch { setErro("Não foi possível calcular agora."); } finally { setCarregando(false); }
  }

  const linhas: Linha[] = Array.isArray(saida?.resultado?.lines) ? saida.resultado.lines : [];
  return (
    <Modal isOpen={aberto} onClose={onClose} maxWidth="max-w-lg" title={<ModalTitle icon={Calculator} title="Salário líquido" subtitle={nome} />}>
      <div className="space-y-4">
        <p className="text-sm text-[var(--color-text-muted)]">Salário base: <strong className="text-[var(--color-text-primary)]">{formatBRL(salario || 0)}</strong></p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Dependentes"><input className={inputCls()} inputMode="numeric" value={dependentes} onChange={(e) => setDependentes(e.target.value)} /></Field>
          <Field label="Pensão alimentícia (R$)"><input className={inputCls()} inputMode="decimal" value={pensao} onChange={(e) => setPensao(e.target.value)} /></Field>
        </div>
        <Button onClick={calcular} disabled={carregando || !(salario > 0)}>
          {carregando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />} Calcular
        </Button>
        {!(salario > 0) && <p className="text-xs text-[var(--color-warning)]">Cadastre o salário base do funcionário para calcular.</p>}
        {erro && <p className="text-sm text-[var(--color-danger)]">{erro}</p>}
        {linhas.length > 0 && (
          <div className="divide-y divide-[var(--color-border-default)]">
            {linhas.map((l, i) => (
              <div key={i} className="flex justify-between py-2 text-sm">
                <span>{l.label}</span>
                <span className={l.kind === "debit" ? "text-[var(--color-danger)]" : ""}>{formatBRL(Math.abs(Number(l.value) || 0))}</span>
              </div>
            ))}
            {saida?.resultado?.total && (
              <div className="flex justify-between py-2 text-base font-bold"><span>{saida.resultado.total.label}</span><span>{formatBRL(Number(saida.resultado.total.value) || 0)}</span></div>
            )}
          </div>
        )}
        <p className="text-[11px] text-[var(--color-text-muted)]">Informativo: não substitui o eSocial nem a orientação de um contador.</p>
      </div>
    </Modal>
  );
}
