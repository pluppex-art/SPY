/** Reenviar a própria campanha: escolher o grupo e, se quiser, trocar o assunto. Não cria outra campanha. */
import { useEffect, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Modal } from "../../../components/ui/modal";
import { cn } from "../../../lib/utils";
import type { Campanha } from "./CampanhasEmail";
import { OpcaoDeContagem } from "./OpcaoDeContagem";

export type GrupoReenvio = "todos" | "nao_abriram" | "clicaram" | "falhas";

export function ReenviarCampanha({ campanha, onFechar, onEditar, onConfirmar }: {
  campanha: Campanha | null;
  onFechar: () => void;
  onEditar: (c: Campanha) => void;
  /** Devolve se o reenvio começou. `assunto` só vem quando mudou. */
  onConfirmar: (c: Campanha, quem: GrupoReenvio, mudancas: { subject?: string; rastrear?: boolean }) => Promise<boolean>;
}) {
  const [quem, setQuem] = useState<GrupoReenvio>("todos");
  const [assunto, setAssunto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [contar, setContar] = useState(true);
  useEffect(() => {
    if (!campanha) return;
    setQuem(campanha.failed > 0 ? "falhas" : "todos"); setAssunto(campanha.subject); setEnviando(false); setContar(!campanha.sem_rastreio);
  }, [campanha?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!campanha) return null;

  const c = campanha;
  const semAbrir = Math.max(0, c.sent - (c.opened || 0));
  const grupos: { id: GrupoReenvio; titulo: string; detalhe: string; ha: boolean }[] = [
    { id: "todos", titulo: "Todo mundo", detalhe: `${c.total} pessoa(s) da campanha`, ha: c.total > 0 },
    { id: "nao_abriram", titulo: "Quem não abriu", detalhe: `cerca de ${semAbrir} pessoa(s)`, ha: semAbrir > 0 && !c.sem_rastreio },
    { id: "clicaram", titulo: "Quem clicou", detalhe: `${c.clicked || 0} pessoa(s)`, ha: (c.clicked || 0) > 0 },
    { id: "falhas", titulo: "Só as falhas", detalhe: `${c.failed} envio(s)`, ha: c.failed > 0 },
  ];
  const confirmar = async () => {
    setEnviando(true);
    const novo = assunto.trim() && assunto.trim() !== c.subject ? assunto.trim() : undefined;
    if (await onConfirmar(c, quem, { ...(novo ? { subject: novo } : {}), ...(contar === !c.sem_rastreio ? {} : { rastrear: contar }) })) onFechar();
    else setEnviando(false);
  };

  return (
    <Modal isOpen onClose={() => !enviando && onFechar()} title="Reenviar campanha" maxWidth="max-w-lg"
      footer={<>
        <Button variant="ghost" onClick={() => onEditar(c)} disabled={enviando} className="h-9 px-3 text-xs mr-auto">Editar o conteúdo</Button>
        <Button variant="outline" onClick={onFechar} disabled={enviando} className="h-9 px-3 text-xs">Cancelar</Button>
        <Button onClick={() => void confirmar()} disabled={enviando || !assunto.trim()} className="h-9 px-4 text-xs font-bold gap-1.5">{enviando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Reenviar agora</Button>
      </>}>
      <div className="space-y-4">
        <fieldset className="m-0 p-0 border-0 space-y-2">
          <legend className="mb-2 text-[11px] font-bold text-[var(--color-text-muted)]">Para quem</legend>
          {grupos.filter((g) => g.ha).map((g) => (
            <label key={g.id} className={cn("flex items-center gap-3 rounded-xl border p-3 cursor-pointer", quem === g.id ? "border-[var(--color-primary-blue)] bg-[var(--color-primary-blue)]/10" : "border-[var(--color-border-default)]")}>
              <input type="radio" name="grupo-reenvio" checked={quem === g.id} onChange={() => setQuem(g.id)} />
              <span className="text-xs font-bold text-[var(--color-text-primary)]">{g.titulo}</span>
              <span className="ml-auto text-[11px] text-[var(--color-text-muted)]">{g.detalhe}</span>
            </label>
          ))}
        </fieldset>
        <label className="flex flex-col gap-1 text-[11px] font-bold text-[var(--color-text-muted)]">Assunto (mude se quiser)
          <input value={assunto} onChange={(e) => setAssunto(e.target.value)} maxLength={200} className="h-9 px-3 rounded-xl text-xs font-medium border border-[var(--color-border-default)] bg-[var(--color-surface)] text-[var(--color-text-primary)]" />
        </label>
        <OpcaoDeContagem ligada={contar} onMudar={setContar} />
        <p className="text-[11px] text-[var(--color-text-muted)]">O reenvio acontece nesta mesma campanha. Quem saiu da lista não recebe. Mantenha a página aberta até terminar.</p>
      </div>
    </Modal>
  );
}
