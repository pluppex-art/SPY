import type { ChatbotFlow, FlowNode } from "./types";

export interface FlowIssue {
  level: "error" | "warning";
  nodeId?: string;
  message: string;
}

const VAR_NAME = /^[a-z][a-z0-9_]{0,30}$/;

function targets(node: FlowNode): (string | null | undefined)[] {
  switch (node.type) {
    case "menu":
      return node.options.map((o) => o.next);
    case "message":
    case "media":
    case "question":
    case "create_lead":
      return [node.next];
    default:
      return [];
  }
}

/** Confere o fluxo antes de salvar/ativar: erros bloqueiam a ativação, avisos só alertam. */
export function validateFlow(flow: ChatbotFlow): FlowIssue[] {
  const issues: FlowIssue[] = [];
  const nodes = flow.nodes ?? {};
  const ids = Object.keys(nodes);

  if (ids.length === 0) return [{ level: "error", message: "O fluxo está vazio. Adicione pelo menos uma mensagem." }];
  if (!flow.start || !nodes[flow.start]) {
    issues.push({ level: "error", message: "Defina qual é o primeiro passo do fluxo." });
  }

  for (const node of Object.values(nodes)) {
    const label = node.id;
    switch (node.type) {
      case "message":
        if (!node.text?.trim()) issues.push({ level: "error", nodeId: label, message: "Mensagem sem texto." });
        break;
      case "menu":
        if (!node.text?.trim()) issues.push({ level: "error", nodeId: label, message: "O menu precisa de um texto de apresentação." });
        if (node.options.length < 2) issues.push({ level: "error", nodeId: label, message: "O menu precisa de pelo menos 2 opções." });
        if (node.options.length > 10) issues.push({ level: "error", nodeId: label, message: "O menu aceita no máximo 10 opções." });
        if (node.options.some((o) => !o.label.trim())) issues.push({ level: "error", nodeId: label, message: "Há opção de menu sem texto." });
        if (node.options.some((o) => !o.next)) issues.push({ level: "warning", nodeId: label, message: "Há opção do menu sem destino — a conversa termina ali." });
        if (node.variable && !VAR_NAME.test(node.variable)) issues.push({ level: "error", nodeId: label, message: "Nome de variável inválido (use letras minúsculas, números e _)." });
        break;
      case "question":
        if (!node.text?.trim()) issues.push({ level: "error", nodeId: label, message: "Pergunta sem texto." });
        if (!VAR_NAME.test(node.variable ?? "") || node.variable === "telefone") {
          issues.push({ level: "error", nodeId: label, message: "Nome de variável inválido ou reservado (use letras minúsculas, números e _; 'telefone' é reservado)." });
        }
        break;
      case "media":
        if (!/^https?:\/\//i.test(node.url ?? "")) issues.push({ level: "error", nodeId: label, message: "A mídia precisa de uma URL pública (http/https)." });
        break;
      default:
        break;
    }
    if (node.type === "message" || node.type === "media" || node.type === "question" || node.type === "create_lead") {
      if (!node.next) issues.push({ level: "warning", nodeId: label, message: "Sem próximo passo — a conversa termina aqui." });
    }
    for (const t of targets(node)) {
      if (t && !nodes[t]) issues.push({ level: "error", nodeId: label, message: "Aponta para um passo que não existe mais." });
    }
  }

  // Passos inalcançáveis a partir do início.
  if (flow.start && nodes[flow.start]) {
    const seen = new Set<string>();
    const stack = [flow.start];
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id) || !nodes[id]) continue;
      seen.add(id);
      for (const t of targets(nodes[id])) if (t) stack.push(t);
    }
    for (const id of ids) {
      if (!seen.has(id)) issues.push({ level: "warning", nodeId: id, message: "Passo solto: nenhum caminho do início chega até ele." });
    }
    // Ciclo sem espera (só message/media/create_lead) trava o bot — o motor corta em 50 passos.
    const inReportedCycle = new Set<string>();
    for (const id of seen) {
      if (inReportedCycle.has(id)) continue;
      const walk = new Set<string>();
      let cur: string | null | undefined = id;
      while (cur && nodes[cur] && ["message", "media", "create_lead"].includes(nodes[cur].type)) {
        if (walk.has(cur)) {
          issues.push({ level: "error", nodeId: cur, message: "Ciclo de mensagens sem pergunta no meio: o bot ficaria repetindo sem esperar resposta." });
          walk.forEach((w) => inReportedCycle.add(w));
          break;
        }
        walk.add(cur);
        cur = targets(nodes[cur])[0];
      }
    }
  }
  return issues;
}

export function hasBlockingIssues(issues: FlowIssue[]): boolean {
  return issues.some((i) => i.level === "error");
}
