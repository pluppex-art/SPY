import type { ChatbotFlow, FlowNode, FlowNodeType, ValidationKind } from "./types";

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
  save_data: "Salvar dados",
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
    case "save_data":
      return { id, type, target: "implementation", map: [], next: null, position };
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


/** Coleta dos dados de implantação: cada variável tem o MESMO nome do campo do formulário de Implementações. */
const PERGUNTAS_IMPLANTACAO: [string, ValidationKind, string][] = [
  ["razao_social", "text", "Qual é a razão social da empresa?"],
  ["nome_fantasia", "text", "E o nome fantasia?"],
  ["cnpj", "text", "Qual é o CNPJ?"],
  ["segmento", "text", "Em que segmento a empresa atua?"],
  ["operacao_descricao", "text", "Como a operação funciona hoje, do primeiro contato do cliente até a entrega ou cobrança?"],
  ["resp_nome", "text", "Quem é o responsável principal pela implantação?"],
  ["resp_cargo", "text", "Qual o cargo dessa pessoa?"],
  ["resp_whatsapp", "phone", "Qual o WhatsApp do responsável? (com DDD)"],
  ["resp_email", "email", "Qual o e-mail do responsável?"],
  ["qtd_usuarios", "number", "Quantas pessoas vão usar o sistema?"],
  ["usuarios_lista", "text", "Me passe os usuários: nome, e-mail e perfil. Ex.: Maria — maria@empresa.com — Vendedora"],
  ["etapas_funil", "text", "Quais são as etapas do funil de vendas? Ex.: Novo lead → Qualificado → Proposta → Fechado"],
  ["origens_leads", "text", "De onde vêm os leads hoje?"],
  ["meta_mensal", "text", "Qual a meta mensal de vendas?"],
];

function implantacao(): ChatbotFlow {
  const nodes: ChatbotFlow["nodes"] = {
    boas_vindas: { id: "boas_vindas", type: "message", text: "Olá! Sou o assistente de implementação do SPY. Vou fazer algumas perguntas rápidas, uma de cada vez, para deixar tudo pronto para você.", next: PERGUNTAS_IMPLANTACAO[0][0] },
  };
  PERGUNTAS_IMPLANTACAO.forEach(([variable, validation, text], i) => {
    const next = i + 1 < PERGUNTAS_IMPLANTACAO.length ? PERGUNTAS_IMPLANTACAO[i + 1][0] : "salvar";
    nodes[variable] = { id: variable, type: "question", text, variable, validation, next };
  });
  nodes.salvar = { id: "salvar", type: "save_data", target: "implementation", map: PERGUNTAS_IMPLANTACAO.map(([v]) => ({ field: v, variable: v })), next: "fim" };
  nodes.fim = { id: "fim", type: "end", text: "Perfeito, recebi tudo! Nossa equipe já continua a implementação com esses dados." };
  return { start: "boas_vindas", nodes };
}

export const CHATBOT_TEMPLATES: ChatbotTemplate[] = [
  { id: "basico", name: "Atendimento + captação de lead", description: "Boas-vindas, menu, coleta de nome/e-mail/interesse, cria o lead no CRM e opção de falar com atendente.", flow: basico },
  { id: "implantacao", name: "Implantação de cliente (SPY)", description: "Perguntas de cadastro da empresa, responsável e CRM. As respostas preenchem o formulário de Implementações do cliente.", flow: implantacao() },
  { id: "vazio", name: "Em branco", description: "Só uma mensagem de boas-vindas. Monte o resto do zero.", flow: vazio },
];
