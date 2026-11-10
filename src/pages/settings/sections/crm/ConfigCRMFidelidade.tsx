import { useEffect, useState } from "react";
import { Award, Plus, Trash2, Info } from "lucide-react";
import { toast } from "sonner";
import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { useData } from "../../../../contexts/DataContext";
import { useAuth } from "../../../../contexts/AuthContext";
import { useFidelidade, type FidelidadeConfig } from "../../../../lib/fidelidade";
import { FidelidadeBadge } from "../../../../components/FidelidadeBadge";

// Configurações › CRM › Fidelidade: define as faixas (Bronze/Prata/Ouro...) pelo número de compras do cliente numa
// janela (mês, 12 meses ou histórico). Genérico para qualquer empresa; os nomes, mínimos e cores são da empresa.

const KEY = "fidelidade_config";
const DEFAULT: FidelidadeConfig = {
  enabled: true, janela: "mes", fonte: "vendas",
  niveis: [{ nome: "Bronze", min: 1, cor: "#b45309" }, { nome: "Prata", min: 3, cor: "#64748b" }, { nome: "Ouro", min: 6, cor: "#ca8a04" }],
};

export function ConfigCRMFidelidade() {
  const { appSettings, saveAppSetting } = useData();
  const { activeTenantId } = useAuth();
  const { data, reload } = useFidelidade(activeTenantId);
  const saved = (appSettings?.[KEY] ?? null) as Partial<FidelidadeConfig> | null;
  const [cfg, setCfg] = useState<FidelidadeConfig>({ ...DEFAULT, ...(saved || {}), niveis: saved?.niveis?.length ? saved.niveis : DEFAULT.niveis });
  useEffect(() => { if (saved) setCfg({ ...DEFAULT, ...saved, niveis: saved.niveis?.length ? saved.niveis : DEFAULT.niveis }); }, [JSON.stringify(saved)]); // eslint-disable-line react-hooks/exhaustive-deps

  const setNivel = (i: number, patch: Partial<FidelidadeConfig["niveis"][number]>) => setCfg((c) => ({ ...c, niveis: c.niveis.map((n, j) => (j === i ? { ...n, ...patch } : n)) }));
  const add = () => setCfg((c) => c.niveis.length >= 6 ? c : ({ ...c, niveis: [...c.niveis, { nome: "Novo nível", min: (c.niveis[c.niveis.length - 1]?.min ?? 0) + 3, cor: "#0ea5e9" }] }));
  const del = (i: number) => setCfg((c) => c.niveis.length <= 1 ? c : ({ ...c, niveis: c.niveis.filter((_, j) => j !== i) }));

  const save = () => {
    const nomes = cfg.niveis.map((n) => n.nome.trim());
    if (nomes.some((n) => !n)) { toast.error("Todo nível precisa de um nome."); return; }
    if (cfg.niveis.some((n) => !Number.isFinite(n.min) || n.min < 1)) { toast.error("O mínimo de compras de cada nível precisa ser 1 ou mais."); return; }
    if (new Set(cfg.niveis.map((n) => n.min)).size !== cfg.niveis.length) { toast.error("Dois níveis não podem ter o mesmo mínimo de compras."); return; }
    saveAppSetting(KEY, { ...cfg, niveis: [...cfg.niveis].sort((a, b) => a.min - b.min).map((n) => ({ ...n, nome: n.nome.trim().slice(0, 30), min: Math.floor(n.min) })) });
    toast.success("Fidelidade salva.");
    setTimeout(() => void reload(), 600);
  };

  const field = "h-9 px-2 rounded-lg text-xs border border-[var(--color-border-default)] bg-[var(--color-surface)] text-[var(--color-text-primary)]";
  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h2 className="text-lg font-black text-[var(--color-text-primary)] flex items-center gap-2"><Award className="w-5 h-5 text-[var(--color-primary-blue)]" /> Fidelidade de clientes</h2>
        <p className="text-xs text-[var(--color-text-muted)] mt-1">Classifique seus clientes em níveis (Bronze, Prata, Ouro...) pelo número de compras. O nível aparece na lista de Clientes e dá para filtrar por ele.</p>
      </div>

      <Card className="p-5 space-y-4">
        <label className="flex items-center gap-2 text-xs font-bold text-[var(--color-text-primary)] cursor-pointer"><input type="checkbox" checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} /> Usar níveis de fidelidade</label>

        <div className="grid sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-[11px] font-bold text-[var(--color-text-muted)]">Contar compras
            <select value={cfg.janela} onChange={(e) => setCfg({ ...cfg, janela: e.target.value as any })} className={field}>
              <option value="mes">No mês atual</option><option value="12m">Nos últimos 12 meses</option><option value="total">Em todo o histórico</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-bold text-[var(--color-text-muted)]">O que é uma compra
            <select value={cfg.fonte} onChange={(e) => setCfg({ ...cfg, fonte: e.target.value as any })} className={field}>
              <option value="vendas">Venda fechada no CRM</option><option value="financeiro">Receita paga no Financeiro</option>
            </select>
          </label>
        </div>
        <p className="flex items-start gap-1.5 text-[11px] text-[var(--color-text-muted)]"><Info className="w-3.5 h-3.5 mt-0.5 shrink-0" /> "No mês" e "12 meses" contam vendas com data de fechamento, que o sistema registra daqui para frente. Para incluir vendas antigas, use "Em todo o histórico".</p>

        <div className="space-y-2">
          <div className="text-[11px] font-black uppercase tracking-wider text-[var(--color-text-faint)]">Níveis (do menor para o maior)</div>
          {cfg.niveis.map((n, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input aria-label="Nome do nível" value={n.nome} maxLength={30} onChange={(e) => setNivel(i, { nome: e.target.value })} className={`${field} w-36`} />
              <span className="text-xs text-[var(--color-text-muted)]">a partir de</span>
              <input aria-label="Mínimo de compras" type="number" min={1} value={n.min} onChange={(e) => setNivel(i, { min: Number(e.target.value) })} className={`${field} w-20`} />
              <span className="text-xs text-[var(--color-text-muted)]">compra(s)</span>
              <input aria-label="Cor" type="color" value={n.cor} onChange={(e) => setNivel(i, { cor: e.target.value })} className="h-9 w-10 rounded-lg border border-[var(--color-border-default)] bg-transparent cursor-pointer" />
              <FidelidadeBadge nivel={n.nome || "—"} cor={n.cor} />
              <button type="button" aria-label="Remover nível" onClick={() => del(i)} disabled={cfg.niveis.length <= 1} className="text-[var(--color-danger)] bg-transparent border-none cursor-pointer disabled:opacity-30"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
          <Button variant="outline" onClick={add} disabled={cfg.niveis.length >= 6} className="h-8 px-3 text-xs gap-1.5"><Plus className="w-3.5 h-3.5" /> Adicionar nível</Button>
        </div>

        <div className="flex justify-end"><Button onClick={save} className="h-9 px-5 text-xs font-bold">Salvar</Button></div>
      </Card>

      {data?.config?.enabled && (
        <Card className="p-5 space-y-2">
          <div className="text-[11px] font-black uppercase tracking-wider text-[var(--color-text-faint)]">Clientes por nível agora</div>
          <div className="flex flex-wrap gap-3">
            {data.resumo.map((n) => <div key={n.nome} className="flex items-center gap-2 text-xs text-[var(--color-text-primary)]"><FidelidadeBadge nivel={n.nome} cor={n.cor} /> <b>{n.clientes.toLocaleString("pt-BR")}</b></div>)}
          </div>
        </Card>
      )}
    </div>
  );
}

export default ConfigCRMFidelidade;
