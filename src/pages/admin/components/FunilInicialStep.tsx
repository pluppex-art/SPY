/** Passo "Funil de vendas" do cadastro de empresa: escolher um modelo e ajustar as etapas antes de criar. */
import { ArrowDown, ArrowUp, Check, Lock, Plus, Trash2 } from "lucide-react";
import { ETAPA_DOT_COLORS, ETAPAS_SISTEMA } from "../../../lib/funilStages";
import { ETAPAS_SDR, MAX_ETAPAS, MODELOS_DE_FUNIL, type EtapaDoFunil } from "../../../lib/modelosDeFunil";
import { cn } from "../../../lib/utils";

export interface FunilEscolhido {
  modelo: string;
  nome: string;
  etapas: (EtapaDoFunil & { chave: string })[];
  comSdr: boolean;
}

let contador = 0;
const comChave = (e: EtapaDoFunil) => ({ ...e, chave: `etapa-${++contador}` });

export function funilDoModelo(id: string, comSdr = false): FunilEscolhido {
  const m = MODELOS_DE_FUNIL.find((x) => x.id === id) ?? MODELOS_DE_FUNIL[0];
  return { modelo: m.id, nome: m.nomeDoFunil, etapas: m.etapas.map(comChave), comSdr };
}

const CORES = Object.keys(ETAPA_DOT_COLORS);
const labelClass = "text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider block mb-1";
const campo = "bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-lg px-3 py-2 text-xs text-[var(--color-text-primary)] focus:border-[var(--color-primary-blue)] outline-none font-medium";
const botaoIcone = "w-8 h-8 shrink-0 flex items-center justify-center rounded-lg border border-[var(--color-border-subtle)] bg-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer disabled:opacity-30 disabled:cursor-default";

function Trilha({ nomes }: { nomes: { nome: string; cor: string }[] }) {
  return (
    <span className="flex flex-wrap gap-1 mt-2">
      {nomes.map((e, i) => (
        <span key={`${e.nome}-${i}`} className="flex items-center gap-1 rounded-full border border-[var(--color-border-subtle)] bg-[var(--color-surface-elevated)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-text-muted)]">
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ETAPA_DOT_COLORS[e.cor] }} />
          {e.nome || "(sem nome)"}
        </span>
      ))}
    </span>
  );
}

export function FunilInicialStep({ valor, onChange }: { valor: FunilEscolhido; onChange: (v: FunilEscolhido) => void }) {
  const etapas = valor.etapas;
  const mudarEtapas = (novas: FunilEscolhido["etapas"]) => onChange({ ...valor, etapas: novas });
  const editar = (chave: string, parte: Partial<EtapaDoFunil>) => mudarEtapas(etapas.map((e) => (e.chave === chave ? { ...e, ...parte } : e)));
  const mover = (i: number, passo: -1 | 1) => {
    const novas = [...etapas];
    [novas[i], novas[i + passo]] = [novas[i + passo], novas[i]];
    mudarEtapas(novas);
  };

  return (
    <div className="space-y-5">
      <div>
        <span className={labelClass}>Modelo de funil</span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {MODELOS_DE_FUNIL.map((o) => {
            const ativo = valor.modelo === o.id;
            return (
              <button key={o.id} type="button" aria-pressed={ativo}
                onClick={() => { if (!ativo) onChange(funilDoModelo(o.id, valor.comSdr)); }}
                className={cn("text-left p-3 rounded-xl border cursor-pointer transition-colors flex flex-col justify-start",
                  ativo ? "border-[var(--color-primary-blue)] bg-[var(--color-primary-blue)]/5" : "border-[var(--color-border-default)] bg-[var(--color-surface-sunken)] hover:border-[var(--color-primary-blue)]/40")}>
                <span className="flex items-center justify-between gap-2">
                  <span className="text-xs font-black text-[var(--color-text-primary)]">{o.titulo}</span>
                  {ativo && <Check className="w-4 h-4 text-[var(--color-primary-blue)] shrink-0" />}
                </span>
                <span className="block mt-1 text-[11px] leading-snug text-[var(--color-text-muted)]">{o.descricao}</span>
                <Trilha nomes={o.etapas} />
              </button>
            );
          })}
        </div>
      </div>

      <div className="pt-3 border-t border-[var(--color-border-subtle)] space-y-3">
        <div>
          <label className={labelClass} htmlFor="funil-nome">Nome do funil</label>
          <input id="funil-nome" value={valor.nome} maxLength={80} onChange={(e) => onChange({ ...valor, nome: e.target.value })} className={cn(campo, "w-full")} />
        </div>

        <div className="space-y-1.5">
          <span className={labelClass}>Etapas (ajuste como quiser)</span>
          {etapas.map((e, i) => (
            <div key={e.chave} className="flex items-center gap-1.5">
              <button type="button" title="Trocar a cor" aria-label={`Trocar a cor da etapa ${i + 1}`}
                onClick={() => editar(e.chave, { cor: CORES[(CORES.indexOf(e.cor) + 1) % CORES.length] })} className={botaoIcone}>
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: ETAPA_DOT_COLORS[e.cor] }} />
              </button>
              <input aria-label={`Nome da etapa ${i + 1}`} value={e.nome} maxLength={40} onChange={(ev) => editar(e.chave, { nome: ev.target.value })} className={cn(campo, "flex-1 min-w-0")} />
              <button type="button" aria-label="Subir etapa" disabled={i === 0} onClick={() => mover(i, -1)} className={botaoIcone}><ArrowUp className="w-3.5 h-3.5" /></button>
              <button type="button" aria-label="Descer etapa" disabled={i === etapas.length - 1} onClick={() => mover(i, 1)} className={botaoIcone}><ArrowDown className="w-3.5 h-3.5" /></button>
              <button type="button" aria-label="Remover etapa" disabled={etapas.length === 1} onClick={() => mudarEtapas(etapas.filter((x) => x.chave !== e.chave))} className={botaoIcone}><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
          <button type="button" disabled={etapas.length >= MAX_ETAPAS}
            onClick={() => mudarEtapas([...etapas, comChave({ nome: "", cor: CORES[etapas.length % CORES.length], iniciarMinimizado: false })])}
            className="flex items-center gap-1 text-[11px] font-bold text-[var(--color-primary-blue)] bg-transparent border-0 cursor-pointer hover:underline disabled:opacity-40 py-1">
            <Plus className="w-3.5 h-3.5" /> Adicionar etapa
          </button>
        </div>

        <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--color-text-faint)]">
          <Lock className="w-3 h-3" /> Entram sozinhas no fim: {ETAPAS_SISTEMA.map((s) => s.nome).join(", ")}.
        </p>
      </div>

      <label className="flex items-start gap-2.5 p-3 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] cursor-pointer">
        <input type="checkbox" checked={valor.comSdr} onChange={(e) => onChange({ ...valor, comSdr: e.target.checked })} className="mt-0.5 accent-[var(--color-primary-blue)]" />
        <span>
          <span className="block text-xs font-bold text-[var(--color-text-primary)]">Criar também o funil de pré-vendas (SDR IA)</span>
          <span className="block text-[11px] text-[var(--color-text-muted)]">Funil separado para qualificar o contato antes de passar ao vendedor.</span>
          {valor.comSdr && <Trilha nomes={ETAPAS_SDR} />}
        </span>
      </label>
    </div>
  );
}
