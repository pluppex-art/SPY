import { useState } from "react";
import { BookOpen, Plus, Save, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { confirmDialog } from "../../../components/ui/confirm-dialog";
import { useAuth } from "../../../contexts/AuthContext";
import { useAiKnowledgeBase, type KnowledgeEntry } from "../../../hooks/useAiKnowledgeBase";

// Limites que o n8n aplica ao ler a base (Júlia SDR, nó "Consolidar Contexto da Empresa"):
// até 4.000 caracteres por entrada e 16.000 no total — o que passar disso é cortado.
const MAX_ENTRY = 4000;
const MAX_TOTAL = 16000;

const SUGESTOES = [
  { title: "Sobre a empresa", hint: "O que a empresa faz, para quem, onde atua, há quanto tempo existe." },
  { title: "Quem somos (fundadores e equipe)", hint: "Quem são os fundadores/responsáveis e a história que gera confiança." },
  { title: "Nosso método / modelo", hint: "Como a empresa trabalha, as etapas do processo, o diferencial." },
  { title: "Como indicar cada produto", hint: "Qual produto indicar para qual necessidade do cliente." },
  { title: "Perguntas frequentes", hint: "Dúvidas comuns dos clientes e as respostas oficiais." },
];

function EntryCard({
  entry,
  onSave,
  onDelete,
  saving,
}: {
  entry: Partial<KnowledgeEntry>;
  onSave: (e: { id?: string; title: string; content: string }) => Promise<boolean>;
  onDelete?: () => void;
  saving: boolean;
}) {
  const [title, setTitle] = useState(entry.title ?? "");
  const [content, setContent] = useState(entry.content ?? "");
  const dirty = title !== (entry.title ?? "") || content !== (entry.content ?? "");
  const tooLong = content.length > MAX_ENTRY;

  return (
    <Card className="p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] space-y-3 shadow-sm">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Título (ex.: Quem somos)"
        className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-lg px-3 py-2 text-sm font-semibold text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary-blue)]"
      />
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={7}
        placeholder="Escreva em linguagem natural. A vendedora (IA) usa este texto como conhecimento da empresa."
        className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary-blue)] resize-y"
      />
      <div className="flex items-center justify-between gap-3">
        <span className={`text-[11px] ${tooLong ? "text-danger font-bold" : "text-[var(--color-text-muted)]"}`}>
          {content.length.toLocaleString("pt-BR")} / {MAX_ENTRY.toLocaleString("pt-BR")} caracteres
        </span>
        <div className="flex items-center gap-2">
          {onDelete && (
            <Button type="button" variant="ghost" size="sm" onClick={onDelete} className="text-danger">
              <Trash2 className="w-3.5 h-3.5" /> Excluir
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            disabled={saving || !dirty || !title.trim() || !content.trim()}
            onClick={async () => {
              const ok = await onSave({ id: entry.id, title: title.trim(), content: content.trim() });
              if (ok && !entry.id) {
                setTitle("");
                setContent("");
              }
            }}
            className="bg-[var(--color-primary-blue)] hover:bg-[var(--color-primary-blue)]/90 text-white font-bold uppercase tracking-wider"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Salvar
          </Button>
        </div>
      </div>
    </Card>
  );
}

/**
 * Configurações → Sistema → Conhecimento da IA. A empresa descreve a si mesma (sobre,
 * fundadores, método, FAQ…) e a Júlia passa a usar isso nas conversas, por tenant. Produtos e
 * materiais/criativos continuam em Produtos (aba Arquivos), e o nome da empresa vem do cadastro do tenant — esta tela cobre só o texto livre que não cabe nesses cadastros.
 */
export function ConfigSistemaConhecimentoIA() {
  const { activeTenantName } = useAuth();
  const { entries, loading, saving, save, remove } = useAiKnowledgeBase();
  const [novo, setNovo] = useState<{ title: string; hint: string } | null>(null);
  const total = entries.reduce((s, e) => s + Math.min(e.content.length, MAX_ENTRY), 0);

  const handleSave = async (e: { id?: string; title: string; content: string }) => {
    const { error } = await save(e);
    if (error) {
      toast.error(`Não foi possível salvar: ${error}`);
      return false;
    }
    toast.success("Conhecimento salvo. A vendedora já usa na próxima conversa.");
    if (!e.id) setNovo(null);
    return true;
  };

  const handleDelete = async (e: KnowledgeEntry) => {
    if (!(await confirmDialog({ title: "Excluir entrada", description: `Excluir "${e.title}"? A vendedora deixa de usar esse conhecimento.` }))) return;
    const { error } = await remove(e.id);
    if (error) toast.error(`Não foi possível excluir: ${error}`);
    else toast.info("Entrada excluída.");
  };

  return (
    <div className="max-w-3xl space-y-6 animate-in fade-in duration-300 pb-12">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)] flex items-center gap-2">
          Conhecimento extra da vendedora <BookOpen className="w-5 h-5 text-[var(--color-primary-blue)]" />
        </h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          Textos livres que a vendedora (IA) também usa para conversar sobre {activeTenantName ?? "a sua empresa"}: regras de venda, como indicar cada produto, casos de sucesso, avisos.
          O perfil da empresa fica em Dados da Empresa e o conhecimento de cada produto fica em Produtos.
        </p>
      </div>

      <Card className="p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] text-xs text-[var(--color-text-muted)] space-y-1">
        <p>
          <b className="text-[var(--color-text-primary)]">Onde cadastrar cada coisa:</b> perfil da empresa (o que é, fundadores, método, FAQ) em Dados da Empresa · o que é cada produto, para quem, benefícios, objeções, preço, duração e criativos em Produtos · o que não couber nesses dois lugares, aqui.
        </p>
        <p>
          Uso: {total.toLocaleString("pt-BR")} de {MAX_TOTAL.toLocaleString("pt-BR")} caracteres. O que passar de {MAX_ENTRY.toLocaleString("pt-BR")} por entrada
          ou de {MAX_TOTAL.toLocaleString("pt-BR")} no total é ignorado pela vendedora.
        </p>
      </Card>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
        </div>
      ) : (
        <div className="space-y-4">
          {entries.map((e) => (
            <EntryCard key={`${e.id}-${e.updatedAt}`} entry={e} saving={saving} onSave={handleSave} onDelete={() => handleDelete(e)} />
          ))}

          {novo && <EntryCard key={novo.title} entry={{ title: novo.title }} saving={saving} onSave={handleSave} />}
          {novo && <p className="text-[11px] text-[var(--color-text-muted)] -mt-2">{novo.hint}</p>}

          <div className="flex flex-wrap gap-2">
            {SUGESTOES.filter((s) => !entries.some((e) => e.title.toLowerCase() === s.title.toLowerCase())).map((s) => (
              <Button key={s.title} type="button" variant="ghost" size="sm" onClick={() => setNovo(s)} className="border border-[var(--color-border-default)] text-[var(--color-text-primary)]">
                <Plus className="w-3.5 h-3.5" /> {s.title}
              </Button>
            ))}
            <Button type="button" variant="ghost" size="sm" onClick={() => setNovo({ title: "", hint: "" })} className="border border-[var(--color-border-default)] text-[var(--color-text-primary)]">
              <Plus className="w-3.5 h-3.5" /> Outro assunto
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
