/**
 * Motor do chatbot por regras — função pura: (fluxo, configurações, estado da conversa, mensagem
 * recebida) → (ações a executar, novo estado). Sem rede, sem banco, sem IA.
 *
 * O MESMO arquivo é usado em três lugares (por isso é puro e sem imports de runtime):
 *   1. workflow n8n "[SPY] Chatbot - Motor" — gerado por scripts/build-chatbot-engine.mjs
 *   2. simulador de conversa no editor do SPY
 *   3. testes (tests/chatbot/engine.test.ts)
 */
import {
  DEFAULT_SETTINGS,
  type ChatbotAction,
  type ChatbotFlow,
  type ChatbotSettings,
  type EngineResult,
  type FlowNode,
  type MenuNode,
  type QuestionNode,
  type SessionState,
  type ValidationKind,
} from "./types";

const MAX_STEPS = 50; // trava contra ciclos message → message sem espera
const MAX_VAR_LENGTH = 500;
const VAR_NAME = /^[a-z][a-z0-9_]{0,30}$/;

/** minúsculas, sem acento, sem pontuação nas pontas, espaços colapsados. */
export function normalizeText(input: string): string {
  return String(input ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^[\s.,;:!?¿¡-]+|[\s.,;:!?¿¡-]+$/g, "")
    .trim();
}

export function mergeSettings(raw: Partial<ChatbotSettings> | null | undefined): ChatbotSettings {
  const s = { ...DEFAULT_SETTINGS, ...(raw ?? {}) };
  const list = (v: unknown, fallback: string[]) =>
    Array.isArray(v) ? v.map((x) => normalizeText(String(x))).filter(Boolean) : fallback;
  return {
    ...s,
    restart_keywords: list(raw?.restart_keywords, DEFAULT_SETTINGS.restart_keywords),
    handoff_keywords: list(raw?.handoff_keywords, DEFAULT_SETTINGS.handoff_keywords),
    session_timeout_minutes: Number(s.session_timeout_minutes) > 0 ? Number(s.session_timeout_minutes) : DEFAULT_SETTINGS.session_timeout_minutes,
    handoff_timeout_hours: Number(s.handoff_timeout_hours) > 0 ? Number(s.handoff_timeout_hours) : DEFAULT_SETTINGS.handoff_timeout_hours,
  };
}

/** Troca {{variavel}} pelo valor coletado (vazio se ainda não existe). */
export function interpolate(text: string, vars: Record<string, string>): string {
  return String(text ?? "").replace(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/gi, (_m, name: string) => vars[name.toLowerCase()] ?? "");
}

export function menuText(node: MenuNode, vars: Record<string, string>): string {
  const lines = node.options.map((o, i) => `${i + 1}. ${interpolate(o.label, vars)}`);
  return `${interpolate(node.text, vars)}\n\n${lines.join("\n")}`.trim();
}

function matchOption(node: MenuNode, input: string): number {
  const norm = normalizeText(input);
  if (!norm) return -1;
  const num = /^(\d{1,2})$/.exec(norm);
  if (num) {
    const idx = Number(num[1]) - 1;
    return idx >= 0 && idx < node.options.length ? idx : -1;
  }
  const exact = node.options.findIndex((o) => normalizeText(o.label) === norm);
  if (exact >= 0) return exact;
  if (norm.length >= 3) {
    const partial = node.options.map((o, i) => (normalizeText(o.label).includes(norm) ? i : -1)).filter((i) => i >= 0);
    if (partial.length === 1) return partial[0];
  }
  return -1;
}

/** Valida e normaliza a resposta; `null` = inválida. */
export function validateAnswer(kind: ValidationKind, input: string): string | null {
  const value = String(input ?? "").trim();
  if (!value) return null;
  switch (kind) {
    case "email": {
      const v = value.toLowerCase();
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? v.slice(0, MAX_VAR_LENGTH) : null;
    }
    case "phone": {
      const digits = value.replace(/\D/g, "");
      return digits.length >= 10 && digits.length <= 13 ? digits : null;
    }
    case "number":
      return /^-?\d+([.,]\d+)?$/.test(value) ? value.replace(",", ".") : null;
    case "text":
    default:
      return value.slice(0, MAX_VAR_LENGTH);
  }
}

function setVar(vars: Record<string, string>, name: string | undefined, value: string) {
  const key = String(name ?? "").toLowerCase();
  if (VAR_NAME.test(key) && key !== "telefone") vars[key] = value.slice(0, MAX_VAR_LENGTH);
}

export interface EngineInput {
  flow: ChatbotFlow;
  settings?: Partial<ChatbotSettings> | null;
  /** Estado salvo da conversa; `null` = primeira mensagem deste contato. */
  session: SessionState | null;
  /** Texto recebido ("" para mídia/áudio, que o bot não interpreta). */
  text: string;
  /** Telefone do contato (só dígitos) — fica disponível como {{telefone}}. */
  phone: string;
  /** Epoch ms — injetado para o motor continuar puro e testável. */
  now: number;
}

export function runChatbot(input: EngineInput): EngineResult {
  const { flow, session, text, phone, now } = input;
  const settings = mergeSettings(input.settings);
  const nowIso = new Date(now).toISOString();
  const norm = normalizeText(text);
  const nodes = flow?.nodes ?? {};

  const touch = (s: SessionState): SessionState => ({ ...s, vars: { ...s.vars }, last_input_at: nowIso });

  if (!flow?.start || !nodes[flow.start]) {
    return { actions: [], session: touch(session ?? { status: "finished", current_node: null, vars: { telefone: phone } }), note: "fluxo_vazio" };
  }

  const lastInput = session?.last_input_at ? Date.parse(session.last_input_at) : NaN;
  const idleMs = Number.isFinite(lastInput) ? now - lastInput : 0;

  // Humano assumiu: o bot não fala. Só volta sozinho depois de um período sem nenhuma mensagem.
  if (session?.status === "handoff" && idleMs <= settings.handoff_timeout_hours * 3_600_000) {
    return { actions: [], session: touch(session), note: "handoff_silencio" };
  }

  const timedOut = !!session && session.status === "active" && idleMs > settings.session_timeout_minutes * 60_000;
  const wantsRestart = !!session && settings.restart_keywords.includes(norm);
  const mustRestart = !session || session.status !== "active" || timedOut || wantsRestart;

  const actions: ChatbotAction[] = [];
  let state: SessionState;
  let entry: string | null;

  if (mustRestart) {
    state = { status: "active", current_node: null, vars: { telefone: phone }, lead_created: false, last_input_at: nowIso };
    entry = flow.start;
  } else {
    state = touch(session!);
    state.vars.telefone = phone;

    if (settings.handoff_keywords.includes(norm)) {
      actions.push({ kind: "send_text", text: interpolate(settings.handoff_text, state.vars) });
      actions.push({ kind: "handoff", reason: "keyword", vars: { ...state.vars } });
      state.status = "handoff";
      state.current_node = null;
      return { actions, session: state };
    }

    const current: FlowNode | undefined = state.current_node ? nodes[state.current_node] : undefined;
    if (!current || (current.type !== "menu" && current.type !== "question")) {
      // Estado inconsistente (nó removido no editor): recomeça do início em vez de travar o contato.
      state = { status: "active", current_node: null, vars: { telefone: phone }, lead_created: false, last_input_at: nowIso };
      entry = flow.start;
    } else if (current.type === "menu") {
      const idx = matchOption(current, text);
      if (idx < 0) {
        actions.push({
          kind: "send_text",
          text: `${interpolate(current.invalid_text || settings.invalid_menu_text, state.vars)}\n\n${menuText(current, state.vars)}`,
        });
        return { actions, session: state };
      }
      const option = current.options[idx];
      setVar(state.vars, current.variable, interpolate(option.label, state.vars));
      entry = option.next ?? null;
    } else {
      const q: QuestionNode = current;
      const value = validateAnswer(q.validation, text);
      if (value === null) {
        actions.push({ kind: "send_text", text: interpolate(q.error_text || settings.invalid_input_text, state.vars) });
        return { actions, session: state };
      }
      setVar(state.vars, q.variable, value);
      entry = q.next ?? null;
    }
  }

  return advance(nodes, entry, state, actions);
}

function advance(nodes: ChatbotFlow["nodes"], entry: string | null, state: SessionState, actions: ChatbotAction[]): EngineResult {
  let id = entry;
  let steps = 0;

  while (id) {
    if (++steps > MAX_STEPS) {
      state.status = "finished";
      state.current_node = null;
      return { actions, session: state, note: "loop" };
    }
    const node = nodes[id];
    if (!node) {
      state.status = "finished";
      state.current_node = null;
      return { actions, session: state, note: "no_ausente" };
    }

    switch (node.type) {
      case "message":
        if (node.text?.trim()) actions.push({ kind: "send_text", text: interpolate(node.text, state.vars) });
        id = node.next ?? null;
        break;
      case "media":
        if (node.url?.trim()) {
          actions.push({
            kind: "send_media",
            media_kind: node.kind,
            url: node.url.trim(),
            caption: node.caption ? interpolate(node.caption, state.vars) : undefined,
            filename: node.filename || undefined,
          });
        }
        id = node.next ?? null;
        break;
      case "menu":
        actions.push({ kind: "send_text", text: menuText(node, state.vars) });
        state.status = "active";
        state.current_node = node.id;
        return { actions, session: state };
      case "question":
        actions.push({ kind: "send_text", text: interpolate(node.text, state.vars) });
        state.status = "active";
        state.current_node = node.id;
        return { actions, session: state };
      case "create_lead":
        if (!state.lead_created) {
          actions.push({ kind: "create_lead", vars: { ...state.vars } });
          state.lead_created = true;
        }
        id = node.next ?? null;
        break;
      case "handoff":
        if (node.text?.trim()) actions.push({ kind: "send_text", text: interpolate(node.text, state.vars) });
        actions.push({ kind: "handoff", reason: "node", vars: { ...state.vars } });
        state.status = "handoff";
        state.current_node = null;
        return { actions, session: state };
      case "end":
        if (node.text?.trim()) actions.push({ kind: "send_text", text: interpolate(node.text, state.vars) });
        state.status = "finished";
        state.current_node = null;
        return { actions, session: state };
    }
  }

  // Acabou o caminho sem um nó "end": considera a conversa concluída.
  state.status = "finished";
  state.current_node = null;
  return { actions, session: state };
}
