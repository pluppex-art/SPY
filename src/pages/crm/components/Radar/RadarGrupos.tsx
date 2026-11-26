import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Pencil, Trash2, Users, Info, Lock, Eye } from "lucide-react";
import { toast } from "sonner";
import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { Modal } from "../../../../components/ui/modal";
import { EmptyState } from "../../../../components/ui/empty-state";
import { confirmDialog } from "../../../../components/ui/confirm-dialog";
import { useData } from "../../../../contexts/DataContext";
import { apiFetch } from "../../../../lib/apiClient";
import { inputCls, selectCls } from "../../../finance/components/ModalKit";
import { cn } from "../../../../lib/utils";

interface Grupo { group_chat_id: string; group_name: string; vendedor_colaborador_id: string; vendedor_nome?: string; vendedor_phone?: string; ativo: boolean }
const VAZIO: Grupo = { group_chat_id: "", group_name: "", vendedor_colaborador_id: "", ativo: true };
const rotulo = "text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)]";
const normalizar = (g: any): Grupo => ({ ...VAZIO, ...g, vendedor_colaborador_id: g?.vendedor_colaborador_id ?? "" });

/**
 * Grupos do Radar: cadastro dos grupos de WhatsApp que o Radar de oportunidades acompanha. O Radar só LÊ (nunca escreve no grupo);
 * quando acha uma oportunidade cria o lead e avisa o vendedor responsável por mensagem privada.
 */
export function RadarGrupos() {
  const { colaboradores } = useData();
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [contratado, setContratado] = useState(true);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [edicao, setEdicao] = useState<{ indice: number | null; g: Grupo } | null>(null);
  const [salvando, setSalvando] = useState(false);

  const equipe = useMemo(() => (colaboradores as any[]).filter((c) => c.id && c.nome).sort((a, b) => String(a.nome).localeCompare(String(b.nome))), [colaboradores]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await apiFetch("/api/radar/grupos");
        const j = await r.json().catch(() => ({}));
        if (!vivo) return;
        if (!r.ok) { setErro(j?.error || "Não foi possível carregar os grupos."); return; }
        setContratado(j.contratado !== false);
        setGrupos((j.grupos || []).map(normalizar));
      } catch { if (vivo) setErro("Não foi possível carregar os grupos."); }
      finally { if (vivo) setCarregando(false); }
    })();
    return () => { vivo = false; };
  }, []);

  async function gravar(proximos: Grupo[], mensagem: string): Promise<boolean> {
    setSalvando(true);
    try {
      const r = await apiFetch("/api/radar/grupos", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ grupos: proximos }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(j?.error || "Não foi possível salvar."); return false; }
      setGrupos((j.grupos || proximos).map(normalizar));
      toast.success(mensagem);
      return true;
    } catch { toast.error("Não foi possível salvar."); return false; }
    finally { setSalvando(false); }
  }

  if (carregando) return <div className="grid place-items-center py-16"><Loader2 className="w-5 h-5 animate-spin text-[var(--color-text-faint)]" /></div>;
  if (erro) return <Card className="p-5 text-sm text-rose-600">{erro}</Card>;
  if (!contratado) return <EmptyState icon={Lock} title="Radar não contratado" description="Este módulo não está ativo na sua empresa. Fale com o suporte para ativar." />;

  const g = edicao?.g;
  const idRepetido = !!g && grupos.some((x, i) => x.group_chat_id === g.group_chat_id.trim() && i !== edicao!.indice);
  const podeSalvar = !!g && g.group_name.trim() && /@g\.us$/.test(g.group_chat_id.trim()) && !!g.vendedor_colaborador_id && !idRepetido;

  return (
    <div className="space-y-4">
      <Card className="p-4 flex items-start gap-3 bg-[var(--color-primary-blue)]/5 border-[var(--color-primary-blue)]/20">
        <Info className="w-4 h-4 text-[var(--color-primary-blue)] shrink-0 mt-0.5" />
        <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
          Cadastre os grupos de WhatsApp que o Radar deve acompanhar. Ele <strong>só lê</strong> e nunca envia mensagem no grupo: quando alguém demonstra interesse de compra, o Radar cria a oportunidade e avisa o vendedor responsável por mensagem privada.
          O <strong>id do grupo</strong> termina em <code>@g.us</code>; peça à equipe técnica para listá-lo. Mensagens de grupos que não estão aqui são ignoradas, e um grupo não pode ser do Radar e do Agente Secreto interno ao mesmo tempo.
        </p>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-black uppercase tracking-wider text-[var(--color-text-primary)]">{grupos.length} {grupos.length === 1 ? "grupo cadastrado" : "grupos cadastrados"}</h3>
        <Button onClick={() => setEdicao({ indice: null, g: { ...VAZIO } })} className="text-xs font-bold gap-2"><Plus className="w-4 h-4" /> Novo grupo</Button>
      </div>

      {grupos.length === 0 ? (
        <EmptyState icon={Users} title="Nenhum grupo cadastrado" description="Cadastre o primeiro grupo para o Radar começar a acompanhar." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {grupos.map((x, i) => (
            <Card key={x.group_chat_id} className={cn("p-4 space-y-3", !x.ativo && "opacity-60")}>
              <div className="min-w-0">
                <p className="text-sm font-black text-[var(--color-text-primary)] truncate">{x.group_name}</p>
                <p className="text-[10px] font-mono text-[var(--color-text-faint)] truncate">{x.group_chat_id}</p>
              </div>
              <div className="text-xs text-[var(--color-text-muted)]">
                <span className="text-[var(--color-text-faint)]">Vendedor: </span>
                <strong className="text-[var(--color-text-primary)]">{x.vendedor_nome || equipe.find((c) => String(c.id) === x.vendedor_colaborador_id)?.nome || "não definido"}</strong>
                {x.vendedor_phone ? <span className="font-mono ml-1.5">· {x.vendedor_phone}</span> : <span className="text-amber-600 font-semibold ml-1.5">· sem WhatsApp cadastrado: não será avisado</span>}
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1 text-[10px] font-semibold text-[var(--color-text-faint)]"><Eye className="w-3 h-3" />Só leitura{!x.ativo && <span className="text-amber-600 font-black uppercase ml-2">Pausado</span>}</span>
                <div className="flex items-center gap-1">
                  <button type="button" aria-label={`Editar ${x.group_name}`} onClick={() => setEdicao({ indice: i, g: normalizar(x) })} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)] cursor-pointer border-none bg-transparent"><Pencil className="w-3.5 h-3.5" /></button>
                  <button type="button" aria-label={`Remover ${x.group_name}`} onClick={async () => { if (await confirmDialog({ title: "Remover grupo?", description: `“${x.group_name}” deixa de ser acompanhado pelo Radar.`, confirmLabel: "Remover" })) await gravar(grupos.filter((_, k) => k !== i), "Grupo removido."); }} className="p-1.5 rounded-lg hover:bg-danger/10 text-danger cursor-pointer border-none bg-transparent"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal isOpen={!!edicao} onClose={() => setEdicao(null)} maxWidth="max-w-lg" title={edicao?.indice === null ? "Novo grupo" : "Editar grupo"} description="Grupo de WhatsApp acompanhado pelo Radar e o vendedor que recebe as oportunidades."
        footer={<div className="flex justify-end gap-2 w-full"><Button variant="ghost" onClick={() => setEdicao(null)}>Cancelar</Button><Button disabled={!podeSalvar || salvando} onClick={async () => {
          if (!edicao || !g) return;
          const novo = { ...g, group_chat_id: g.group_chat_id.trim(), group_name: g.group_name.trim() };
          const lista = edicao.indice === null ? [...grupos, novo] : grupos.map((x, i) => (i === edicao.indice ? { ...x, ...novo } : x));
          if (await gravar(lista, "Grupo salvo.")) setEdicao(null);
        }}>{salvando ? "Salvando…" : "Salvar"}</Button></div>}>
        {g && (
          <div className="space-y-4">
            <div className="space-y-1.5"><label className={rotulo}>Nome do grupo</label><input className={inputCls()} value={g.group_name} maxLength={80} onChange={(e) => setEdicao({ ...edicao!, g: { ...g, group_name: e.target.value } })} placeholder="Ex.: Comunidade de clientes" /></div>
            <div className="space-y-1.5">
              <label className={rotulo}>Id do grupo (termina em @g.us)</label>
              <input className={inputCls()} value={g.group_chat_id} disabled={edicao!.indice !== null} onChange={(e) => setEdicao({ ...edicao!, g: { ...g, group_chat_id: e.target.value } })} placeholder="120363000000000000@g.us" />
              {g.group_chat_id && !/@g\.us$/.test(g.group_chat_id.trim()) && <p className="text-[11px] text-rose-500">O id de um grupo termina em @g.us.</p>}
              {idRepetido && <p className="text-[11px] text-rose-500">Esse grupo já está cadastrado.</p>}
            </div>
            <div className="space-y-1.5">
              <label className={rotulo}>Vendedor responsável</label>
              <select className={selectCls()} value={g.vendedor_colaborador_id} onChange={(e) => setEdicao({ ...edicao!, g: { ...g, vendedor_colaborador_id: e.target.value } })}>
                <option value="">Escolha o vendedor…</option>
                {equipe.map((c) => <option key={c.id} value={String(c.id)}>{c.nome}</option>)}
              </select>
              <p className="text-[11px] text-[var(--color-text-faint)]">As oportunidades deste grupo vão para este vendedor, no WhatsApp cadastrado no perfil dele.</p>
            </div>
            <label className="flex items-center gap-2 text-xs text-[var(--color-text-primary)] cursor-pointer"><input type="checkbox" checked={g.ativo} onChange={(e) => setEdicao({ ...edicao!, g: { ...g, ativo: e.target.checked } })} className="w-4 h-4 accent-[var(--color-primary-blue)]" />Acompanhar este grupo (desmarque para pausar)</label>
          </div>
        )}
      </Modal>
    </div>
  );
}
