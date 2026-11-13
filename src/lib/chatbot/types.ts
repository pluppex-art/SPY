/**
 * Modelo do chatbot por regras (sem IA). O fluxo é um grafo guardado em `chatbots.flow` (jsonb) e
 * executado pelo motor em `engine.ts` — o MESMO código roda no workflow n8n compartilhado, no
 * simulador do editor e nos testes.
 */

export type ValidationKind = "text" | "email" | "phone" | "number";

interface NodeBase {
  id: string;
  /** Só o editor visual usa — o motor ignora. */
  position?: { x: number; y: number };
}

/** Envia um texto e segue para o próximo passo sem esperar resposta. */
export interface MessageNode extends NodeBase {
  type: "message";
  text: string;
  next?: string | null;
}

export interface MenuOption {
  id: string;
  label: string;
  next?: string | null;
}

/** Mostra opções numeradas e espera o contato escolher (pelo número ou pelo texto da opção). */
export interface MenuNode extends NodeBase {
  type: "menu";
  text: string;
  /** Se informado, guarda o texto da opção escolhida nesta variável. */
  variable?: string;
  options: MenuOption[];
  invalid_text?: string;
}

/** Faz uma pergunta, valida a resposta e guarda em uma variável. */
export interface QuestionNode extends NodeBase {
  type: "question";
  text: string;
  variable: string;
  validation: ValidationKind;
  error_text?: string;
  next?: string | null;
}

/** Envia imagem ou documento (PDF, tabela, catálogo) por URL pública. */
export interface MediaNode extends NodeBase {
  type: "media";
  kind: "image" | "document";
  url: string;
  caption?: string;
  filename?: string;
  next?: string | null;
}

/** Cria (ou atualiza) o lead no CRM com tudo que foi coletado até aqui. */
export interface CreateLeadNode extends NodeBase {
  type: "create_lead";
  next?: string | null;
}

export type SaveTargetId = "implementation";

/** Grava variáveis coletadas num registro do SPY (destino escolhido). Cada nó roda uma vez por conversa. */
export interface SaveDataNode extends NodeBase {
  type: "save_data";
  target: SaveTargetId;
  /** Campo do destino ← variável coletada. */
  map: { field: string; variable: string }[];
  /** Destino "implementation": ao gravar, se os dados já bastam, cria o ambiente do cliente e aciona o agente de implementação. */
  provision?: boolean;
  next?: string | null;
}

/** Passa a conversa para um humano: o bot fica em silêncio nesta conversa. */
export interface HandoffNode extends NodeBase {
  type: "handoff";
  text?: string;
}

/** Encerra o fluxo. Uma nova mensagem do contato recomeça do início. */
export interface EndNode extends NodeBase {
  type: "end";
  text?: string;
}

export type FlowNode = MessageNode | MenuNode | QuestionNode | MediaNode | CreateLeadNode | SaveDataNode | HandoffNode | EndNode;
export type FlowNodeType = FlowNode["type"];

export interface ChatbotFlow {
  start: string | null;
  nodes: Record<string, FlowNode>;
}

export interface ChatbotSettings {
  /** Palavras que recomeçam o fluxo do início (comparação sem acento/maiúscula). */
  restart_keywords: string[];
  /** Palavras que chamam um atendente em qualquer ponto do fluxo. */
  handoff_keywords: string[];
  handoff_text: string;
  /** Texto enviado quando a opção do menu/validação não tem texto próprio. */
  invalid_menu_text: string;
  invalid_input_text: string;
  /** Minutos sem mensagem para a conversa ser considerada nova. */
  session_timeout_minutes: number;
  /** Horas de silêncio depois de um handoff até o bot voltar a atender sozinho. */
  handoff_timeout_hours: number;
  /** Telefone (com DDI) avisado quando alguém pede atendimento humano. Opcional. */
  handoff_notify_phone?: string;
}

export const DEFAULT_SETTINGS: ChatbotSettings = {
  restart_keywords: ["menu", "inicio", "recomecar"],
  handoff_keywords: ["atendente", "humano", "falar com atendente"],
  handoff_text: "Certo! Já estou chamando um atendente para continuar com você. Aguarde um instante. 🙂",
  invalid_menu_text: "Não entendi. Responda com o número de uma das opções:",
  invalid_input_text: "Não consegui entender essa resposta. Pode tentar de novo?",
  session_timeout_minutes: 720,
  handoff_timeout_hours: 24,
};

export type SessionStatus = "active" | "handoff" | "finished";

export interface SessionState {
  status: SessionStatus;
  current_node: string | null;
  vars: Record<string, string>;
  lead_created?: boolean;
  /** Nós "Salvar dados" já executados nesta conversa. */
  saved_nodes?: string[];
  /** ISO — quando o contato mandou a última mensagem. */
  last_input_at?: string | null;
}

export type ChatbotAction =
  | { kind: "send_text"; text: string }
  | { kind: "send_media"; media_kind: "image" | "document"; url: string; caption?: string; filename?: string }
  | { kind: "create_lead"; vars: Record<string, string> }
  | { kind: "save_data"; target: SaveTargetId; map: { field: string; variable: string }[]; vars: Record<string, string>; provision?: boolean }
  | { kind: "handoff"; reason: "node" | "keyword"; vars: Record<string, string> };

export interface EngineResult {
  actions: ChatbotAction[];
  session: SessionState;
  /** Por que o motor não respondeu / parou: handoff ativo, fluxo vazio, loop, nó ausente… */
  note?: "handoff_silencio" | "fluxo_vazio" | "loop" | "no_ausente";
}
