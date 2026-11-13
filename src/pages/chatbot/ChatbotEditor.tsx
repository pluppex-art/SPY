import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Save, Power, LayoutGrid, MousePointerClick, MessageCircle } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import type { Chatbot, ChatbotPatch } from "../../hooks/useChatbots";
import type { ChatbotFlow, ChatbotSettings, FlowNode, FlowNodeType } from "../../lib/chatbot/types";
import { hasBlockingIssues, validateFlow } from "../../lib/chatbot/validate";
import { withAutoLayout, NODE_WIDTH } from "../../lib/chatbot/layout";
import { createNode, NODE_LABEL } from "../../lib/chatbot/templates";
import { FlowCanvas } from "./FlowCanvas";
import { NodeInspector } from "./NodeInspector";
import { ChatbotSimulator } from "./ChatbotSimulator";
import { ChatbotSettingsPanel } from "./ChatbotSettingsPanel";
import { ChatbotConversations } from "./ChatbotConversations";

const ADD_ORDER: FlowNodeType[] = ["message", "menu", "question", "media", "create_lead", "handoff", "end"];

/** Remove o passo e limpa todo "próximo" que apontava para ele. */
function removeNode(flow: ChatbotFlow, id: string): ChatbotFlow {
  const nodes: ChatbotFlow["nodes"] = {};
  for (const n of Object.values(flow.nodes)) {
    if (n.id === id) continue;
    if (n.type === "menu") nodes[n.id] = { ...n, options: n.options.map((o) => (o.next === id ? { ...o, next: null } : o)) };
    else if (n.type === "handoff" || n.type === "end") nodes[n.id] = n;
    else nodes[n.id] = n.next === id ? { ...n, next: null } : n;
  }
  const start = flow.start === id ? Object.keys(nodes)[0] ?? null : flow.start;
  return { start, nodes };
}

/** Liga o passo recém-criado à primeira saída livre do passo selecionado (menos cliques para montar). */
function connectFrom(flow: ChatbotFlow, fromId: string | null, toId: string): ChatbotFlow {
  const from = fromId ? flow.nodes[fromId] : null;
  if (!from) return flow;
  let updated: FlowNode | null = null;
  if (from.type === "menu") {
    const free = from.options.find((o) => !o.next);
    if (free) updated = { ...from, options: from.options.map((o) => (o.id === free.id ? { ...o, next: toId } : o)) };
  } else if (from.type !== "handoff" && from.type !== "end" && !from.next) {
    updated = { ...from, next: toId };
  }
  return updated ? { ...flow, nodes: { ...flow.nodes, [from.id]: updated } } : flow;
}

interface Props {
  bot: Chatbot;
  readOnly: boolean;
  onBack: () => void;
  onSave: (id: string, patch: ChatbotPatch) => Promise<{ error?: string }>;
  onRefresh: () => void;
}

export function ChatbotEditor({ bot, readOnly, onBack, onSave, onRefresh }: Props) {
  const [name, setName] = useState(bot.name);
  const [description, setDescription] = useState(bot.description);
  const [flow, setFlow] = useState<ChatbotFlow>(() => withAutoLayout(bot.flow));
  const [settings, setSettings] = useState<ChatbotSettings>(bot.settings);
  const [funilId, setFunilId] = useState<string | null>(bot.funilId);
  const [etapaId, setEtapaId] = useState<string | null>(bot.etapaId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const issues = useMemo(() => validateFlow(flow), [flow]);
  const blocking = hasBlockingIssues(issues);
  const selected = selectedId ? flow.nodes[selectedId] : null;

  const dirty = useMemo(
    () =>
      name !== bot.name ||
      description !== bot.description ||
      funilId !== bot.funilId ||
      etapaId !== bot.etapaId ||
      JSON.stringify(settings) !== JSON.stringify(bot.settings) ||
      JSON.stringify(flow) !== JSON.stringify(withAutoLayout(bot.flow)),
    [name, description, funilId, etapaId, settings, flow, bot]
  );

  const save = async (extra: ChatbotPatch = {}): Promise<boolean> => {
    if (!name.trim()) {
      toast.error("Dê um nome ao chatbot.");
      return false;
    }
    if (bot.active && extra.active !== false && blocking) {
      toast.error("Este chatbot está ativo e o fluxo tem erros. Corrija-os (ou desative o chatbot) antes de salvar.");
      return false;
    }
    setSaving(true);
    const r = await onSave(bot.id, { name, description, flow, settings, funilId, etapaId, ...extra });
    setSaving(false);
    if (r.error) {
      toast.error(r.error);
      return false;
    }
    return true;
  };

  const toggleActive = async () => {
    if (!bot.active) {
      if (blocking) return toast.error("Corrija os erros do fluxo antes de ativar.");
      if (!bot.whatsappSession) return toast.error("Conecte um número de WhatsApp (aba Configurações) antes de ativar.");
      if (await save({ active: true })) toast.success("Chatbot ativado. Ele já responde as mensagens do número conectado.");
    } else if (await save({ active: false })) {
      toast.success("Chatbot desativado. Ele não responde mais.");
    }
  };

  const addNode = (type: FlowNodeType) => {
    const nodes = Object.values(flow.nodes);
    const anchor = selected?.position ?? (nodes.length ? nodes.reduce((a, n) => ((n.position?.x ?? 0) > (a.position?.x ?? 0) ? n : a)).position : undefined);
    const position = anchor ? { x: anchor.x + NODE_WIDTH + 70, y: anchor.y } : { x: 0, y: 0 };
    const node = createNode(flow, type, position);
    let next: ChatbotFlow = { ...flow, nodes: { ...flow.nodes, [node.id]: node }, start: flow.start ?? node.id };
    next = connectFrom(next, selectedId, node.id);
    setFlow(next);
    setSelectedId(node.id);
  };

  const rightPanel = selected ? (
    <NodeInspector
      flow={flow}
      node={selected}
      issues={issues.filter((i) => i.nodeId === selected.id)}
      readOnly={readOnly}
      onChange={(n) => setFlow({ ...flow, nodes: { ...flow.nodes, [n.id]: n } })}
      onDelete={() => {
        setFlow(removeNode(flow, selected.id));
        setSelectedId(null);
      }}
      onSetStart={() => setFlow({ ...flow, start: selected.id })}
    />
  ) : null;

  const globalIssues = issues.filter((i) => !i.nodeId);

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <Button variant="outline" size="sm" onClick={onBack} className="self-start">
          <ArrowLeft className="w-4 h-4" /> Chatbots
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-[var(--color-text-primary)] truncate">{name || "Sem nome"}</h2>
          <p className="text-xs text-[var(--color-text-muted)]">
            {bot.active ? "Ativo — respondendo no WhatsApp" : "Inativo — não responde ninguém"}
            {dirty ? " · alterações não salvas" : ""}
          </p>
        </div>
        {!readOnly && (
          <div className="flex gap-2">
            <Button variant={bot.active ? "outline" : "success"} size="sm" onClick={toggleActive} disabled={saving}>
              <Power className="w-4 h-4" /> {bot.active ? "Desativar" : "Ativar"}
            </Button>
            <Button size="sm" onClick={() => save()} disabled={saving || !dirty}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar
            </Button>
          </div>
        )}
      </div>

      {(globalIssues.length > 0 || (blocking && !selected)) && (
        <div className="space-y-1">
          {globalIssues.map((i, idx) => (
            <p key={idx} className="text-xs rounded-md px-3 py-2 bg-rose-500/10 text-rose-600">{i.message}</p>
          ))}
          {blocking && (
            <p className="text-xs rounded-md px-3 py-2 bg-amber-500/10 text-amber-700">
              Há {issues.filter((i) => i.level === "error").length} erro(s) no fluxo — os passos com problema estão com a borda vermelha. Não dá para ativar enquanto houver erro.
            </p>
          )}
        </div>
      )}

      <Tabs defaultValue="fluxo">
        <TabsList>
          <TabsTrigger value="fluxo">Fluxo</TabsTrigger>
          <TabsTrigger value="config">Configurações</TabsTrigger>
          <TabsTrigger value="conversas">Conversas</TabsTrigger>
        </TabsList>

        <TabsContent value="fluxo">
          <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
            <Card className="overflow-hidden">
              {!readOnly && (
                <div className="flex flex-wrap items-center gap-1.5 p-2 border-b border-[var(--color-border-subtle)]">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-faint)] mr-1">Adicionar</span>
                  {ADD_ORDER.map((t) => (
                    <Button key={t} size="xs" variant="outline" onClick={() => addNode(t)}>
                      {NODE_LABEL[t]}
                    </Button>
                  ))}
                  <Button size="xs" variant="ghost" className="ml-auto" onClick={() => setFlow(withAutoLayout(flow, true))} title="Reorganizar os passos automaticamente">
                    <LayoutGrid className="w-3 h-3" /> Organizar
                  </Button>
                </div>
              )}
              <div className="h-[62vh] min-h-[420px]">
                <FlowCanvas flow={flow} issues={issues} selectedId={selectedId} readOnly={readOnly} onSelect={setSelectedId} onChange={setFlow} />
              </div>
              <p className="px-3 py-2 text-[11px] text-[var(--color-text-faint)] border-t border-[var(--color-border-subtle)]">
                Clique num passo para editar · arraste a bolinha da direita até outro passo para ligar · clique numa seta e use Delete/Backspace do teclado para desligar.
              </p>
            </Card>

            <Card className="p-0 overflow-hidden h-fit lg:sticky lg:top-4">
              <Tabs defaultValue={selected ? "passo" : "teste"} key={selected ? "p" : "t"}>
                <TabsList className="m-2">
                  <TabsTrigger value="passo"><MousePointerClick className="w-3.5 h-3.5 mr-1" /> Passo</TabsTrigger>
                  <TabsTrigger value="teste"><MessageCircle className="w-3.5 h-3.5 mr-1" /> Testar</TabsTrigger>
                </TabsList>
                <TabsContent value="passo" className="mt-0 p-3">
                  {rightPanel ?? <p className="text-sm text-[var(--color-text-muted)] py-6 text-center">Selecione um passo no mapa para editar.</p>}
                </TabsContent>
                <TabsContent value="teste" className="mt-0">
                  <ChatbotSimulator flow={flow} settings={settings} />
                </TabsContent>
              </Tabs>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="config">
          <ChatbotSettingsPanel
            bot={bot}
            name={name}
            description={description}
            settings={settings}
            funilId={funilId}
            etapaId={etapaId}
            readOnly={readOnly}
            onName={setName}
            onDescription={setDescription}
            onSettings={setSettings}
            onFunil={(f, e) => {
              setFunilId(f);
              setEtapaId(e);
            }}
            onSessionCreated={onRefresh}
          />
        </TabsContent>

        <TabsContent value="conversas">
          <ChatbotConversations chatbotId={bot.id} flow={flow} readOnly={readOnly} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
