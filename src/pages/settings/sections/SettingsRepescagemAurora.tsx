import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Hand } from "lucide-react";
import { Card } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Switch } from "../../../components/ui/switch";
import { HelpTip } from "../../../components/ui/help-tip";
import { useData } from "../../../contexts/DataContext";
import { useAuth } from "../../../contexts/AuthContext";
import { apiFetch } from "../../../lib/apiClient";
import { AgenteSecretoQrModal } from "../../../components/AgenteSecretoQrModal";
import { COMO_SAIR, MENSAGEM_REPESCAGEM, REPESCAGEM_KEY, REPESCAGEM_PADRAO, erroRepescagem, prepararRepescagem, type RepescagemAurora } from "../../../lib/repescagemAurora";

const DIAS = [[1, "Seg"], [2, "Ter"], [3, "Qua"], [4, "Qui"], [5, "Sex"], [6, "Sáb"], [7, "Dom"]] as const;
const CAMPO = "bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-lg p-2 text-sm text-[var(--color-text-primary)] font-mono font-bold";
const BLOCO = "space-y-1.5 bg-[var(--color-surface-sunken)] p-3 border border-[var(--color-border-subtle)] rounded-xl";
const ROTULO = "text-[10px] text-[var(--color-text-muted)] uppercase font-black block";
const NOTA = "text-xs text-[var(--color-text-muted)] font-semibold";

/** Número que envia as chamadas: só da Aurora, sem resposta automática. */
function NumeroDaAurora() {
  const { activeTenantId } = useAuth();
  const url = `/api/repescagem/numero?tenantId=${encodeURIComponent(activeTenantId || "")}`;
  const [numero, setNumero] = useState<{ status: string; phone: string | null } | null>(null);
  const [erro, setErro] = useState("");
  const [abrirQr, setAbrirQr] = useState(false);

  const consultar = useCallback(async () => {
    try {
      const r = await apiFetch(url);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(d.error || "Não foi possível consultar o número."); return false; }
      setErro("");
      setNumero(d);
      return d.status === "CONNECTED";
    } catch { setErro("Não foi possível consultar o número."); return false; }
  }, [url]);
  useEffect(() => { setNumero(null); void consultar(); }, [consultar]);

  const desconectar = async () => {
    if (!window.confirm("Desconectar o número da repescagem? A Aurora deixa de chamar clientes até outro número ser conectado.")) return;
    const r = await apiFetch(url, { method: "DELETE" });
    if (!r.ok) { toast.error("Não foi possível desconectar agora."); return; }
    toast.success("Número desconectado.");
    void consultar();
  };
  const ligado = numero?.status === "CONNECTED";

  return (
    <div className={BLOCO}>
      <span className={ROTULO}>Número que a Aurora usa para chamar</span>
      <div className="flex flex-wrap items-center gap-3">
        <strong className={`text-sm ${ligado ? "text-success" : "text-[var(--color-text-muted)]"}`}>
          {erro || (!numero ? "Consultando…" : ligado ? `Conectado${numero.phone ? `: +${numero.phone}` : ""}` : "Nenhum número conectado")}
        </strong>
        {!ligado && <Button onClick={() => setAbrirQr(true)} className="h-8 px-3 text-xs font-bold">Conectar número</Button>}
        {!!numero && numero.status !== "SEM_NUMERO" && <Button variant="ghost" onClick={desconectar} className="h-8 px-3 text-xs font-bold">Desconectar</Button>}
      </div>
      <p className="text-[11px] text-[var(--color-text-muted)]">Use um número separado, que não seja de vendedor nem o da Aurora da equipe. Ele só envia a chamada: quem escrever para ele não recebe resposta, e o vendedor é avisado.</p>
      <AgenteSecretoQrModal open={abrirQr} title="Conectar o número da repescagem" description="Leia o QR code com o WhatsApp do número que será usado só pela Aurora."
        qrUrl={`/api/repescagem/numero/qr?tenantId=${encodeURIComponent(activeTenantId || "")}`}
        onClose={() => { setAbrirQr(false); void consultar(); }} checkConnected={consultar}
        onConnected={() => { setAbrirQr(false); toast.success("Número conectado."); void consultar(); }} />
    </div>
  );
}

/** A Aurora chama o cliente que parou de responder; o vendedor é avisado quando a mensagem chega e quando ele responde. */
export function RepescagemAuroraCard() {
  const { appSettings, saveAppSetting } = useData();
  const salvo: RepescagemAurora | undefined = appSettings?.[REPESCAGEM_KEY];
  const [local, setLocal] = useState<RepescagemAurora | null>(null);
  const [salvando, setSalvando] = useState(false);
  const c: RepescagemAurora = local ?? { ...REPESCAGEM_PADRAO, ...(salvo ?? {}) };
  const mudar = (p: Partial<RepescagemAurora>) => setLocal({ ...c, ...p });
  const numero = (v: string) => Math.max(0, parseInt(v, 10) || 0);

  const salvar = async () => {
    const erro = erroRepescagem(c);
    if (erro) { toast.error(erro); return; }
    const passaAValer = c.ativo && !c.modoTeste && !(salvo?.ativo && !salvo.modoTeste);
    if (passaAValer && !window.confirm(
      "A Aurora passa a enviar mensagens para CLIENTES DE VERDADE, pelo número conectado aqui. Mensagem automática pode levar o WhatsApp a restringir o número. Confirmar?")) return;
    setSalvando(true);
    await saveAppSetting(REPESCAGEM_KEY, prepararRepescagem(c, salvo));
    setLocal(null);
    setSalvando(false);
    toast.success("Repescagem salva.");
  };

  return (
    <Card className="p-4 sm:p-6 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-2xl shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] pb-4">
        <h2 className="text-base font-black text-[var(--color-text-primary)] flex items-center gap-2">
          <Hand className="w-5 h-5 text-warning" /> Repescagem pela Aurora
          <HelpTip label="Sobre a Repescagem pela Aurora">Quando o cliente para de responder, a Aurora manda uma única mensagem por um número só dela, que não conversa. O vendedor recebe um pop-up e um aviso no WhatsApp quando a mensagem chega ao cliente e quando ele responde, para retomar a conversa pelo número dele. Quem responde SAIR ou diz que não quer não é chamado de novo.</HelpTip>
        </h2>
        <Switch checked={c.ativo} onCheckedChange={(v) => mudar({ ativo: v })} label={c.ativo ? "Ligada" : "Desligada"} />
      </div>

      <NumeroDaAurora />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className={BLOCO}>
          <label className={ROTULO} htmlFor="rep-horas">Chamar após</label>
          <div className="flex items-center gap-2">
            <input id="rep-horas" type="number" min={1} value={c.horas} onChange={(e) => mudar({ horas: numero(e.target.value) })} className={`${CAMPO} w-20 text-center`} />
            <span className={NOTA}>horas sem resposta</span>
          </div>
        </div>
        <div className={BLOCO}>
          <label className={ROTULO} htmlFor="rep-limite">Limite por dia</label>
          <div className="flex items-center gap-2">
            <input id="rep-limite" type="number" min={1} max={30} value={c.limiteDia} onChange={(e) => mudar({ limiteDia: numero(e.target.value) })} className={`${CAMPO} w-20 text-center`} />
            <span className={NOTA}>clientes</span>
          </div>
        </div>
        <div className={BLOCO}>
          <label className={ROTULO} htmlFor="rep-intervalo">Mesmo cliente</label>
          <div className="flex items-center gap-2">
            <input id="rep-intervalo" type="number" min={7} value={c.intervaloDias} onChange={(e) => mudar({ intervaloDias: numero(e.target.value) })} className={`${CAMPO} w-20 text-center`} />
            <span className={NOTA}>dias entre chamadas</span>
          </div>
        </div>
      </div>

      <div className={BLOCO}>
        <span className={ROTULO}>Horário de envio</span>
        <div className="flex flex-wrap items-center gap-2">
          <input type="time" aria-label="Início do horário de envio" value={c.inicio} onChange={(e) => mudar({ inicio: e.target.value })} className={CAMPO} />
          <span className="text-xs text-[var(--color-text-muted)]">até</span>
          <input type="time" aria-label="Fim do horário de envio" value={c.fim} onChange={(e) => mudar({ fim: e.target.value })} className={CAMPO} />
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

      <div className={BLOCO}>
        <label className={ROTULO} htmlFor="rep-msg">Mensagem ao cliente</label>
        <textarea id="rep-msg" rows={3} maxLength={600} placeholder={MENSAGEM_REPESCAGEM} value={c.mensagem}
          onChange={(e) => mudar({ mensagem: e.target.value })} className={`${CAMPO} w-full font-sans font-medium`} />
        <p className="text-[11px] text-[var(--color-text-muted)]">Em branco, vai o texto sugerido acima. Use {"{cliente}"}, {"{vendedor}"} e {"{empresa}"}. Se o texto não tiver a palavra SAIR, o sistema acrescenta: “{COMO_SAIR}”</p>
      </div>

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
        <Switch checked={c.modoTeste} onCheckedChange={(v) => mudar({ modoTeste: v })} label="Modo de teste"
          description="Só o número abaixo faz o papel de cliente: converse dele com o WhatsApp de um vendedor, deixe a conversa parada por 5 minutos depois da resposta do vendedor e a Aurora chama. Os avisos vão para o mesmo número. Nenhum cliente nem vendedor recebe nada." />
        {c.modoTeste && (
          <input type="tel" aria-label="Número de teste da repescagem" placeholder="DDD + número de teste" value={c.numeroTeste}
            onChange={(e) => mudar({ numeroTeste: e.target.value })} className={`${CAMPO} w-full sm:w-72`} />
        )}
      </div>

      <p className="text-xs text-[var(--color-text-muted)]">Valem só as conversas dos números conectados ao Agente Secreto, com lead em aberto, paradas há no máximo 15 dias e iniciadas depois de ligar.</p>

      <div className="flex justify-end">
        <Button onClick={salvar} disabled={salvando} className="h-9 px-4 text-xs font-bold w-full sm:w-auto">Salvar repescagem</Button>
      </div>
    </Card>
  );
}
