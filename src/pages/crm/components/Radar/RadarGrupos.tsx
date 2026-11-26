import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Pencil, Trash2, Users, Bell, MessageCircle, Mail, Info, Lock } from "lucide-react";
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

interface Grupo {
  group_chat_id: string; group_name: string; departamento: string; ativo: boolean;
  responsavel_user_id: string | null; responsavel_nome: string; responsavel_phone: string; responsavel_email: string;
  notificar_sistema: boolean; notificar_whatsapp: boolean; notificar_email: boolean;
  [extra: string]: unknown;
}
interface Depto { id: string; nome: string }

const VAZIO: Grupo = {
  group_chat_id: "", group_name: "", departamento: "marketing", ativo: true, responsavel_user_id: null, responsavel_nome: "",
  responsavel_phone: "", responsavel_email: "", notificar_sistema: true, notificar_whatsapp: true, notificar_email: false,
};
const rotulo = "text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)]";
const normalizar = (g: any): Grupo => ({ ...VAZIO, ...g, responsavel_user_id: g?.responsavel_user_id ?? null, responsavel_nome: g?.responsavel_nome ?? "", responsavel_phone: g?.responsavel_phone ?? "", responsavel_email: g?.responsavel_email ?? "" });

/**
 * Radar de Grupos: cadastro dos grupos de WhatsApp que o Agente Secreto interno acompanha (departamento e responsável de cada um).
 * Só aparece para empresa que contratou o módulo; o servidor confere de novo a cada leitura e gravação.
 */
export function RadarGrupos() {
  const { colaboradores } = useData();
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [contratado, setContratado] = useState(true);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [deptos, setDeptos] = useState<Depto[]>([]);
  const [edicao, setEdicao] = useState<{ indice: number | null; g: Grupo } | null>(null);
  const [salvando, setSalvando] = useState(false);

  const equipe = useMemo(() => (colaboradores as any[]).filter((c) => c.user_id && c.nome).sort((a, b) => String(a.nome).localeCompare(String(b.nome))), [colaboradores]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await apiFetch("/api/radar-grupos");
        const j = await r.json().catch(() => ({}));
        if (!vivo) return;
        if (!r.ok) { setErro(j?.error || "Não foi possível carregar os grupos."); return; }
        setContratado(j.contratado !== false);
        setGrupos((j.grupos || []).map(normalizar));
        setDeptos(j.departamentos || []);
      } catch { if (vivo) setErro("Não foi possível carregar os grupos."); }
      finally { if (vivo) setCarregando(false); }
    })();
    return () => { vivo = false; };
  }, []);

  async function gravar(proximos: Grupo[], mensagem: string): Promise<boolean> {
    setSalvando(true);
    try {
      const r = await apiFetch("/api/radar-grupos", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ grupos: proximos }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(j?.error || "Não foi possível salvar."); return false; }
      setGrupos((j.grupos || proximos).map(normalizar));
      toast.success(mensagem);
      return true;
    } catch { toast.error("Não foi possível salvar."); return false; }
    finally { setSalvando(false); }
  }

  const nomeDepto = (id: string) => deptos.find((d) => d.id === id)?.nome ?? id;
  const escolherResponsavel = (userId: string) => {
    const c = equipe.find((x) => x.user_id === userId);
    setEdicao((e) => {
      if (!e) return e;
      const g = { ...e.g, responsavel_user_id: userId || null, responsavel_nome: c ? String(c.nome) : "" };
      if (c) {
        g.responsavel_phone = e.g.responsavel_phone || String(c.phone || "").replace(/\D/g, "");
        g.responsavel_email = e.g.responsavel_email || String(c.email || "");
      }
      return { ...e, g };
    });
  };

  if (carregando) return <div className="grid place-items-center py-16"><Loader2 className="w-5 h-5 animate-spin text-[var(--color-text-faint)]" /></div>;
  if (erro) return <Card className="p-5 text-sm text-rose-600">{erro}</Card>;
  if (!contratado) return <EmptyState icon={Lock} title="Radar de Grupos não contratado" description="Este módulo é vendido à parte. Fale com o suporte para ativar na sua empresa." />;

  const g = edicao?.g;
  const idRepetido = !!g && grupos.some((x, i) => x.group_chat_id === g.group_chat_id.trim() && i !== edicao!.indice);
  const podeSalvar = !!g && g.group_name.trim() && /@g\.us$/.test(g.group_chat_id.trim()) && !idRepetido;

  return (
    <div className="space-y-4">
      <Card className="p-4 flex items-start gap-3 bg-[var(--color-primary-blue)]/5 border-[var(--color-primary-blue)]/20">
        <Info className="w-4 h-4 text-[var(--color-primary-blue)] shrink-0 mt-0.5" />
        <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
          Cadastre os grupos de WhatsApp que o Agente Secreto deve acompanhar. Quando alguém pedir algo no grupo (um post, uma compra, um ajuste), o agente cria o registro no departamento certo e avisa o responsável.
          O <strong>id do grupo</strong> termina em <code>@g.us</code>; peça à equipe técnica para listá-lo. Mensagens de grupos que não estão aqui são ignoradas.
        </p>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-black uppercase tracking-wider text-[var(--color-text-primary)]">{grupos.length} {grupos.length === 1 ? "grupo cadastrado" : "grupos cadastrados"}</h3>
        <Button onClick={() => setEdicao({ indice: null, g: { ...VAZIO } })} className="text-xs font-bold gap-2"><Plus className="w-4 h-4" /> Novo grupo</Button>
      </div>

      {grupos.length === 0 ? (
        <EmptyState icon={Users} title="Nenhum grupo cadastrado" description="Cadastre o primeiro grupo para o Agente Secreto começar a acompanhar." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {grupos.map((x, i) => (
            <Card key={x.group_chat_id} className={cn("p-4 space-y-3", !x.ativo && "opacity-60")}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-black text-[var(--color-text-primary)] truncate">{x.group_name}</p>
                  <p className="text-[10px] font-mono text-[var(--color-text-faint)] truncate">{x.group_chat_id}</p>
                </div>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] shrink-0">{nomeDepto(x.departamento)}</span>
              </div>
              <div className="text-xs text-[var(--color-text-muted)]">
                <span className="text-[var(--color-text-faint)]">Responsável: </span>
                <strong className="text-[var(--color-text-primary)]">{x.responsavel_nome || "não definido"}</strong>
                {x.responsavel_phone && <span className="font-mono ml-1.5">· {x.responsavel_phone}</span>}
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[10px] font-semibold text-[var(--color-text-faint)]">
                  {x.notificar_sistema && <span className="flex items-center gap-1"><Bell className="w-3 h-3" />Sistema</span>}
                  {x.notificar_whatsapp && <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" />WhatsApp</span>}
                  {x.notificar_email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />E-mail</span>}
                  {!x.ativo && <span className="text-amber-600 font-black uppercase">Pausado</span>}
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" aria-label={`Editar ${x.group_name}`} onClick={() => setEdicao({ indice: i, g: normalizar(x) })} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)] cursor-pointer border-none bg-transparent"><Pencil className="w-3.5 h-3.5" /></button>
                  <button type="button" aria-label={`Remover ${x.group_name}`} onClick={async () => { if (await confirmDialog({ title: "Remover grupo?", description: `“${x.group_name}” deixa de ser acompanhado.`, confirmLabel: "Remover" })) await gravar(grupos.filter((_, k) => k !== i), "Grupo removido."); }} className="p-1.5 rounded-lg hover:bg-danger/10 text-danger cursor-pointer border-none bg-transparent"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal isOpen={!!edicao} onClose={() => setEdicao(null)} maxWidth="max-w-lg" title={edicao?.indice === null ? "Novo grupo" : "Editar grupo"} description="Departamento e responsável de cada grupo do WhatsApp."
        footer={<div className="flex justify-end gap-2 w-full"><Button variant="ghost" onClick={() => setEdicao(null)}>Cancelar</Button><Button disabled={!podeSalvar || salvando} onClick={async () => {
          if (!edicao || !g) return;
          const novo = { ...g, group_chat_id: g.group_chat_id.trim(), group_name: g.group_name.trim() };
          const lista = edicao.indice === null ? [...grupos, novo] : grupos.map((x, i) => (i === edicao.indice ? { ...x, ...novo } : x));
          if (await gravar(lista, "Grupo salvo.")) setEdicao(null);
        }}>{salvando ? "Salvando…" : "Salvar"}</Button></div>}>
        {g && (
          <div className="space-y-4">
            <div className="space-y-1.5"><label className={rotulo}>Nome do grupo</label><input className={inputCls()} value={g.group_name} maxLength={80} onChange={(e) => setEdicao({ ...edicao!, g: { ...g, group_name: e.target.value } })} placeholder="Ex.: Marketing — time" /></div>
            <div className="space-y-1.5">
              <label className={rotulo}>Id do grupo (termina em @g.us)</label>
              <input className={inputCls()} value={g.group_chat_id} disabled={edicao!.indice !== null} onChange={(e) => setEdicao({ ...edicao!, g: { ...g, group_chat_id: e.target.value } })} placeholder="120363000000000000@g.us" />
              {g.group_chat_id && !/@g\.us$/.test(g.group_chat_id.trim()) && <p className="text-[11px] text-rose-500">O id de um grupo termina em @g.us.</p>}
              {idRepetido && <p className="text-[11px] text-rose-500">Esse grupo já está cadastrado.</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><label className={rotulo}>Departamento</label><select className={selectCls()} value={g.departamento} onChange={(e) => setEdicao({ ...edicao!, g: { ...g, departamento: e.target.value } })}>{deptos.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}</select></div>
              <div className="space-y-1.5"><label className={rotulo}>Responsável</label><select className={selectCls()} value={g.responsavel_user_id ?? ""} onChange={(e) => escolherResponsavel(e.target.value)}><option value="">Sem responsável</option>{equipe.map((c) => <option key={c.user_id} value={c.user_id}>{c.nome}</option>)}</select></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><label className={rotulo}>WhatsApp do responsável</label><input className={inputCls()} inputMode="tel" value={g.responsavel_phone} onChange={(e) => setEdicao({ ...edicao!, g: { ...g, responsavel_phone: e.target.value } })} placeholder="11 91234-5678" /></div>
              <div className="space-y-1.5"><label className={rotulo}>E-mail do responsável</label><input className={inputCls()} type="email" value={g.responsavel_email} onChange={(e) => setEdicao({ ...edicao!, g: { ...g, responsavel_email: e.target.value } })} /></div>
            </div>
            <div className="space-y-2">
              <label className={rotulo}>Como avisar o responsável</label>
              <div className="flex flex-wrap gap-4 text-xs text-[var(--color-text-primary)]">
                {([["notificar_sistema", "No sistema"], ["notificar_whatsapp", "Por WhatsApp"], ["notificar_email", "Por e-mail"]] as const).map(([k, rot]) => (
                  <label key={k} className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={!!g[k]} onChange={(e) => setEdicao({ ...edicao!, g: { ...g, [k]: e.target.checked } })} className="w-4 h-4 accent-[var(--color-primary-blue)]" />{rot}</label>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs text-[var(--color-text-primary)] cursor-pointer"><input type="checkbox" checked={g.ativo} onChange={(e) => setEdicao({ ...edicao!, g: { ...g, ativo: e.target.checked } })} className="w-4 h-4 accent-[var(--color-primary-blue)]" />Acompanhar este grupo (desmarque para pausar)</label>
          </div>
        )}
      </Modal>
    </div>
  );
}
