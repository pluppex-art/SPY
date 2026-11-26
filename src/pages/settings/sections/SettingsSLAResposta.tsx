import { useState } from "react";
import { toast } from "sonner";
import { MessageSquareWarning } from "lucide-react";
import { Card } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Switch } from "../../../components/ui/switch";
import { HelpTip } from "../../../components/ui/help-tip";
import { useData } from "../../../contexts/DataContext";
import { SLA_RESPOSTA_KEY, SLA_RESPOSTA_PADRAO, erroSlaResposta, prepararParaSalvar, type SlaResposta } from "../../../lib/slaResposta";

const DIAS = [[1, "Seg"], [2, "Ter"], [3, "Qua"], [4, "Qui"], [5, "Sex"], [6, "Sáb"], [7, "Dom"]] as const;
const CAMPO = "bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-lg p-2 text-sm text-[var(--color-text-primary)] font-mono font-bold";
const BLOCO = "space-y-1.5 bg-[var(--color-surface-sunken)] p-3 border border-[var(--color-border-subtle)] rounded-xl";
const ROTULO = "text-[10px] text-[var(--color-text-muted)] uppercase font-black block";

/** Aviso ao vendedor quando o cliente está esperando resposta no WhatsApp, com rodízio opcional. */
export function SlaRespostaCard() {
  const { appSettings, saveAppSetting } = useData();
  const salvo: SlaResposta | undefined = appSettings?.[SLA_RESPOSTA_KEY];
  const [local, setLocal] = useState<SlaResposta | null>(null);
  const [salvando, setSalvando] = useState(false);
  const c: SlaResposta = local ?? { ...SLA_RESPOSTA_PADRAO, ...(salvo ?? {}) };
  const mudar = (p: Partial<SlaResposta>) => setLocal({ ...c, ...p });
  const numero = (v: string) => Math.max(0, parseInt(v, 10) || 0);

  const salvar = async () => {
    const erro = erroSlaResposta(c);
    if (erro) { toast.error(erro); return; }
    const passaAValer = c.ativo && !c.modoTeste && !(salvo?.ativo && !salvo.modoTeste && salvo.rodizio === c.rodizio);
    if (passaAValer && !window.confirm(
      `Os avisos passam a ir para os VENDEDORES${c.rodizio ? ` e leads sem resposta por ${c.rodizioHoras}h serão TRANSFERIDOS para outro vendedor` : ""}. Confirmar?`)) return;
    setSalvando(true);
    const final = prepararParaSalvar(c, salvo);
    await saveAppSetting(SLA_RESPOSTA_KEY, final);
    setLocal(null);
    setSalvando(false);
    toast.success("Aviso de resposta salvo.");
  };

  return (
    <Card className="p-4 sm:p-6 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-2xl shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] pb-4">
        <h2 className="text-base font-black text-[var(--color-text-primary)] flex items-center gap-2">
          <MessageSquareWarning className="w-5 h-5 text-warning" /> Cliente esperando resposta
          <HelpTip label="Sobre Cliente esperando resposta">Quando o cliente manda mensagem no WhatsApp e o vendedor não responde no prazo, o próprio vendedor é avisado para falar com aquele cliente. Só valem as conversas dos números conectados ao Agente Secreto.</HelpTip>
        </h2>
        <Switch checked={c.ativo} onCheckedChange={(v) => mudar({ ativo: v })} label={c.ativo ? "Ligado" : "Desligado"} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className={BLOCO}>
          <label className={ROTULO} htmlFor="sla-min">Avisar após</label>
          <div className="flex items-center gap-2">
            <input id="sla-min" type="number" min={1} value={c.minutos} onChange={(e) => mudar({ minutos: numero(e.target.value) })} className={`${CAMPO} w-20 text-center`} />
            <span className="text-xs text-[var(--color-text-muted)] font-semibold">minutos</span>
          </div>
        </div>
        <div className={BLOCO}>
          <label className={ROTULO} htmlFor="sla-rep">Repetir a cada</label>
          <div className="flex items-center gap-2">
            <input id="sla-rep" type="number" min={0} value={c.repetirMinutos} onChange={(e) => mudar({ repetirMinutos: numero(e.target.value) })} className={`${CAMPO} w-20 text-center`} />
            <span className="text-xs text-[var(--color-text-muted)] font-semibold">minutos (0 = não)</span>
          </div>
        </div>
        <div className={BLOCO}>
          <label className={ROTULO} htmlFor="sla-max">Máximo de avisos</label>
          <input id="sla-max" type="number" min={1} max={10} value={c.maxAvisos} onChange={(e) => mudar({ maxAvisos: numero(e.target.value) })} className={`${CAMPO} w-20 text-center`} />
        </div>
      </div>

      <div className={BLOCO}>
        <span className={ROTULO}>Horário de atendimento (o prazo só conta dentro dele)</span>
        <div className="flex flex-wrap items-center gap-2">
          <input type="time" aria-label="Início do expediente" value={c.inicio} onChange={(e) => mudar({ inicio: e.target.value })} className={CAMPO} />
          <span className="text-xs text-[var(--color-text-muted)]">até</span>
          <input type="time" aria-label="Fim do expediente" value={c.fim} onChange={(e) => mudar({ fim: e.target.value })} className={CAMPO} />
          <div className="flex flex-wrap gap-1.5">
            {DIAS.map(([d, nome]) => (
              <button key={d} type="button" aria-pressed={c.dias.includes(d)}
                onClick={() => mudar({ dias: c.dias.includes(d) ? c.dias.filter((x) => x !== d) : [...c.dias, d].sort() })}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer border ${c.dias.includes(d) ? "bg-[var(--color-primary-blue)] text-white border-[var(--color-primary-blue)]" : "text-[var(--color-text-muted)] border-[var(--color-border-default)]"}`}>
                {nome}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className={BLOCO}><Switch checked={c.popup} onCheckedChange={(v) => mudar({ popup: v })} label="Pop-up no sistema" /></div>
        <div className={BLOCO}><Switch checked={c.whatsapp} onCheckedChange={(v) => mudar({ whatsapp: v })} label="WhatsApp ao vendedor" description="Enviado pelo número da Aurora." /></div>
        <div className={BLOCO}><Switch checked={c.somenteLeads} onCheckedChange={(v) => mudar({ somenteLeads: v })} label="Só leads em aberto" description="Ignora conversas com quem não é lead em aberto no CRM." /></div>
      </div>

      <div className={BLOCO}>
        <Switch checked={c.rodizio} onCheckedChange={(v) => mudar({ rodizio: v })} label="Rodízio automático"
          description="Passado o prazo sem resposta, o lead vai para outro vendedor ativo no rodízio (Configurações › Rodízio de leads). Os dois são avisados e a troca fica no histórico do lead. A conversa antiga continua no WhatsApp do vendedor anterior; o novo recebe o link para chamar o cliente." />
        {c.rodizio && (
          <div className="flex items-center gap-2 pt-1">
            <span className="text-xs text-[var(--color-text-muted)] font-semibold">Transferir após</span>
            <input type="number" min={0.5} step={0.5} aria-label="Horas até o rodízio" value={c.rodizioHoras} onChange={(e) => mudar({ rodizioHoras: Number(e.target.value) || 0 })} className={`${CAMPO} w-20 text-center`} />
            <span className="text-xs text-[var(--color-text-muted)] font-semibold">horas sem resposta</span>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
        <Switch checked={c.modoTeste} onCheckedChange={(v) => mudar({ modoTeste: v })} label="Modo de teste"
          description="Os avisos vão só para o número abaixo (e para o usuário do sistema com esse telefone). Vendedores não recebem nada e nenhum lead é transferido." />
        {c.modoTeste && (
          <input type="tel" aria-label="Número que recebe os testes" placeholder="DDD + número que recebe os testes" value={c.numeroTeste}
            onChange={(e) => mudar({ numeroTeste: e.target.value })} className={`${CAMPO} w-full sm:w-72`} />
        )}
      </div>

      <div className="flex justify-end">
        <Button onClick={salvar} disabled={salvando} className="h-9 px-4 text-xs font-bold w-full sm:w-auto">Salvar aviso de resposta</Button>
      </div>
    </Card>
  );
}
