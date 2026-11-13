import type { ChatbotFlow, FlowNode, FlowNodeType } from "./types";

export interface ChatbotTemplate {
  id: string;
  name: string;
  description: string;
  flow: ChatbotFlow;
}

/** Id curto e único dentro do fluxo (ex.: "menu_3"). */
export function newNodeId(flow: ChatbotFlow, type: FlowNodeType): string {
  let n = Object.keys(flow.nodes).length + 1;
  while (flow.nodes[`${type}_${n}`]) n += 1;
  return `${type}_${n}`;
}

export const NODE_LABEL: Record<FlowNodeType, string> = {
  message: "Mensagem",
  menu: "Menu de opções",
  question: "Pergunta",
  media: "Imagem / arquivo",
  create_lead: "Criar lead no CRM",
  handoff: "Passar para humano",
  end: "Encerrar",
};

export function createNode(flow: ChatbotFlow, type: FlowNodeType, position: { x: number; y: number }): FlowNode {
  const id = newNodeId(flow, type);
  switch (type) {
    case "message":
      return { id, type, text: "Olá! Como posso ajudar?", next: null, position };
    case "menu":
      return {
        id,
        type,
        text: "Escolha uma opção:",
        options: [
          { id: `${id}_o1`, label: "Opção 1", next: null },
          { id: `${id}_o2`, label: "Opção 2", next: null },
        ],
        position,
      };
    case "question":
      return { id, type, text: "Qual é o seu nome?", variable: "nome", validation: "text", next: null, position };
    case "media":
      return { id, type, kind: "document", url: "", caption: "", next: null, position };
    case "create_lead":
      return { id, type, next: null, position };
    case "handoff":
      return { id, type, text: "Vou chamar um atendente para continuar com você. Aguarde um instante.", position };
    case "end":
      return { id, type, text: "Obrigado pelo contato! Se precisar, é só chamar.", position };
  }
}

const basico: ChatbotFlow = {
  start: "boas_vindas",
  nodes: {
    boas_vindas: { id: "boas_vindas", type: "message", text: "Olá! 👋 Bem-vindo(a). Eu sou o assistente virtual da empresa.", next: "menu" },
    menu: {
      id: "menu",
      type: "menu",
      text: "Como posso ajudar?",
      options: [
        { id: "menu_o1", label: "Quero um orçamento", next: "pergunta_nome" },
        { id: "menu_o2", label: "Saber mais sobre a empresa", next: "sobre" },
        { id: "menu_o3", label: "Falar com um atendente", next: "humano" },
      ],
    },
    sobre: { id: "sobre", type: "message", text: "Escreva aqui uma apresentação curta da sua empresa, horário de atendimento e endereço.", next: "menu" },
    pergunta_nome: { id: "pergunta_nome", type: "question", text: "Ótimo! Qual é o seu nome?", variable: "nome", validation: "text", next: "pergunta_email" },
    pergunta_email: {
      id: "pergunta_email",
      type: "question",
      text: "Obrigado, {{nome}}! Qual é o seu melhor e-mail?",
      variable: "email",
      validation: "email",
      error_text: "Esse e-mail não parece válido. Pode digitar de novo?",
      next: "pergunta_interesse",
    },
    pergunta_interesse: { id: "pergunta_interesse", type: "question", text: "O que você gostaria de orçar?", variable: "interesse", validation: "text", next: "lead" },
    lead: { id: "lead", type: "create_lead", next: "fim" },
    fim: { id: "fim", type: "end", text: "Perfeito, {{nome}}! Recebemos seu pedido e um especialista vai falar com você em breve. 🙂" },
    humano: { id: "humano", type: "handoff", text: "Certo! Já estou chamando um atendente. Aguarde um instante." },
  },
};

const vazio: ChatbotFlow = {
  start: "boas_vindas",
  nodes: {
    boas_vindas: { id: "boas_vindas", type: "message", text: "Olá! Como posso ajudar?", next: null },
  },
};

export const CHATBOT_TEMPLATES: ChatbotTemplate[] = [
  { id: "basico", name: "Atendimento + captação de lead", description: "Boas-vindas, menu, coleta de nome/e-mail/interesse, cria o lead no CRM e opção de falar com atendente.", flow: basico },
  { id: "vazio", name: "Em branco", description: "Só uma mensagem de boas-vindas. Monte o resto do zero.", flow: vazio },
];
