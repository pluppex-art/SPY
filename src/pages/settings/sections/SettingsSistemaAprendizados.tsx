import { useState } from "react";
import { Sparkles, Plus, Trash2, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { Card } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Switch } from "../../../components/ui/switch";
import { confirmDialog } from "../../../components/ui/confirm-dialog";
import { useAuth } from "../../../contexts/AuthContext";
import { useAiLearnings, type AiLearning } from "../../../hooks/useAiLearnings";

const CATEGORIAS: Record<string, string> = {
  vendas_abordagem: "Abordagem",
  vendas_objecao: "Objeções",
  vendas_fechamento: "Fechamento",
  vendas_qualificacao: "Qualificação",
  vendas_tom: "Tom de voz",
};

function nomeCategoria(c: string): string {
  const base = c.replace("vendas_geral_", "vendas_");
  return CATEGORIAS[base] ?? c.replace(/_/g, " ");
}

function LessonRow({ item, onToggle, onDelete }: { item: AiLearning; onToggle: (v: boolean) => void; onDelete: () => void }) {
  return (
    <div className={`flex items-start gap-3 py-3 border-b border-[var(--color-border-subtle)] last:border-0 ${item.active ? "" : "opacity-60"}`}>
      <Switch size="sm" checked={item.active} onCheckedChange={onToggle} aria-label="Ligar ou desligar esta lição" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[var(--color-text-primary)] leading-snug">{item.content}</p>
        <p className="text-[11px] text-[var(--color-text-muted)] mt-1">
          {nomeCategoria(item.category)} · confiança {item.confidence}% · {new Date(item.createdAt).toLocaleDateString("pt-BR")}
          {item.context ? ` · ${item.context}` : ""}
        </p>
      </div>
      <button type="button" onClick={onDelete} title="Excluir" className="p-1.5 rounded-md text-[var(--color-text-faint)] hover:text-danger hover:bg-danger/10 transition-colors">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function LessonList({ scope, canAdd }: { scope: "empresa" | "plataforma"; canAdd: boolean }) {
  const { items, loading, setActive, remove, add } = useAiLearnings(scope);
  const [texto, setTexto] = useState("");
  const [categoria, setCategoria] = useState("vendas_abordagem");
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (texto.trim().length < 10) return;
    setSaving(true);
    const { error } = await add(texto.trim(), categoria);
    setSaving(false);
    if (error) return toast.error(`Não foi possível salvar: ${error}`);
    setTexto("");
    toast.success("Lição cadastrada. A IA já usa na próxima conversa.");
  };

  const handleDelete = async (i: AiLearning) => {
    if (!(await confirmDialog({ title: "Excluir lição", description: "A IA deixa de usar esta lição. Não dá para desfazer." }))) return;
    const { error } = await remove(i.id);
    if (error) toast.error(`Não foi possível excluir: ${error}`);
  };

  const handleToggle = async (i: AiLearning, v: boolean) => {
    const { error } = await setActive(i.id, v);
    if (error) toast.error(`Não foi possível alterar: ${error}`);
  };

  const ativas = items.filter((i) => i.active).length;

  return (
    <div className="space-y-4">
      {canAdd && (
        <Card className="p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] space-y-2 shadow-sm">
          <label className="text-xs font-bold text-[var(--color-text-muted)]">Ensinar uma lição à IA</label>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={2}
            placeholder='Ex.: "Quando o lead disser que está caro, pergunte quantos leads ele perde por mês antes de falar de preço."'
            className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary-blue)] resize-y"
          />
          <div className="flex items-center justify-between gap-2">
            <select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              className="bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-lg px-2 py-1.5 text-xs text-[var(--color-text-primary)]"
            >
              {Object.entries(CATEGORIAS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <Button type="button" size="sm" disabled={saving || texto.trim().length < 10} onClick={handleAdd} className="bg-[var(--color-primary-blue)] text-white font-bold uppercase tracking-wider">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Adicionar
            </Button>
          </div>
        </Card>
      )}

      <Card className="p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
        <p className="text-[11px] text-[var(--color-text-muted)] mb-2">
          {loading ? "Carregando…" : `${items.length} lições · ${ativas} ativas`}
        </p>
        {!loading && items.length === 0 && (
          <p className="text-sm text-[var(--color-text-muted)] py-4">
            Nenhuma lição ainda. A IA aprende com as conversas todo dia, de madrugada; as primeiras aparecem aqui depois da primeira noite com conversas.
          </p>
        )}
        {items.map((i) => (
          <LessonRow key={i.id} item={i} onToggle={(v) => handleToggle(i, v)} onDelete={() => handleDelete(i)} />
        ))}
      </Card>
    </div>
  );
}

/**
 * Configurações → Sistema → Aprendizado da IA. Lista as lições que a IA de vendas extrai das conversas
 * da empresa todo dia (e as cadastradas à mão) e permite ligar/desligar, excluir e ensinar novas.
 * As lições gerais, que a IA usa entre empresas, são confidenciais: só o master da plataforma as vê.
 */
export function ConfigSistemaAprendizados({ embedded = false }: { embedded?: boolean } = {}) {
  const { user, activeTenantName } = useAuth();
  const [aba, setAba] = useState<"empresa" | "plataforma">("empresa");

  return (
    <div className={embedded ? "space-y-4" : "max-w-3xl space-y-6 animate-in fade-in duration-300 pb-12"}>
      {!embedded && <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)] flex items-center gap-2">
          Aprendizado da IA <Sparkles className="w-5 h-5 text-[var(--color-primary-blue)]" />
        </h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          Todo dia, de madrugada, a IA lê as conversas de {activeTenantName ?? "sua empresa"} e extrai o que funcionou e o que não funcionou. Aqui você vê essas lições,
          desliga as que não fazem sentido e ensina novas. Desligar uma lição faz a IA parar de usá-la na próxima conversa.
        </p>
      </div>}

      {user?.isMaster && (
        <div className="flex gap-2">
          {(["empresa", "plataforma"] as const).map((a) => (
            <Button key={a} type="button" size="sm" variant={aba === a ? "default" : "ghost"} onClick={() => setAba(a)} className="border border-[var(--color-border-default)]">
              {a === "empresa" ? "Desta empresa" : "Entre empresas (interno)"}
            </Button>
          ))}
        </div>
      )}

      {aba === "plataforma" && user?.isMaster ? (
        <>
          <Card className="p-3 bg-warning/10 border border-warning/30 text-xs text-[var(--color-text-primary)] flex items-start gap-2">
            <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              Lições gerais, sem nomes ou dados de clientes, que a IA usa como experiência de todas as empresas. São confidenciais: nenhuma empresa as vê e a IA nunca as cita.
              Esta aba é só para moderar (desligar o que estiver ruim).
            </span>
          </Card>
          <LessonList scope="plataforma" canAdd={false} />
        </>
      ) : (
        <LessonList scope="empresa" canAdd />
      )}
    </div>
  );
}
