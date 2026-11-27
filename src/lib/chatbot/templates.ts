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
  create_lead: "Criar lead em Vendas",
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


/**
 * Coleta dos dados de implantação, em 5 partes, para a equipe reorganizar no editor se quiser.
 * Cada variável tem o MESMO nome do campo do formulário de Implementações. O bot se apresenta pelo próprio
 * nome ({{bot_nome}} = nome do chatbot = responsável pela implementação), pula o que o SPY já sabe do cliente
 * e aceita "não sei" nas perguntas opcionais. O WhatsApp do responsável é o próprio número da conversa ({{telefone}}).
 * No fim mostra um resumo para o cliente conferir antes de gravar. Nunca pede senha.
 */
function implantacao(): ChatbotFlow {
  const nodes: ChatbotFlow["nodes"] = {};
  const add = (n: FlowNode) => { nodes[n.id] = n; };
  const fala = (id: string, text: string, next: string) => add({ id, type: "message", text, next });
  // Opcional aceita "não sei"; as exigidas para criar o ambiente (tenantReadiness) insistem.
  const pergunta = (variable: string, text: string, next: string, extra: { validation?: ValidationKind; obrigatoria?: boolean; erro?: string; id?: string } = {}) =>
    add({ id: extra.id ?? variable, type: "question", text, variable, validation: extra.validation ?? "text", skip_if_known: true, allow_unknown: !extra.obrigatoria, error_text: extra.erro, next });
  // O texto de cada opção é o valor gravado: precisa ser igual ao do formulário.
  const menu = (variable: string, text: string, opcoes: [string, string][]) =>
    add({ id: variable, type: "menu", text, variable, skip_if_known: true, options: opcoes.map(([label, next], i) => ({ id: `${variable}_${i + 1}`, label, next })) });
  const simNao = (variable: string, text: string, sim: string, nao: string = sim) => menu(variable, text, [["Sim", sim], ["Não", nao]]);

  fala("boas_vindas", "Oi! Aqui é {{bot_nome}}, responsável pela implementação de vocês no S.P.Y. 🙂\n\n*Como funciona a implementação:*\n1️⃣ Diagnóstico (esta conversa)\n2️⃣ Criação do ambiente, funil e permissões\n3️⃣ Integrações e importação de dados\n4️⃣ Aurora, agentes e WhatsApp de cada pessoa\n5️⃣ Treinamento e 30 dias de acompanhamento\n\nEsta parte leva uns 5 minutos. No que for opcional, pode responder *não sei*. 🔒 Nunca pedimos senha por aqui.", "parte_empresa");

  fala("parte_empresa", "*Parte 1 de 5 · Sua empresa* 🏢", "nome_fantasia");
  pergunta("nome_fantasia", "Como se chama a empresa?", "razao_social", { obrigatoria: true });
  pergunta("razao_social", "E a razão social?", "cnpj", { obrigatoria: true });
  pergunta("cnpj", "Qual é o CNPJ?", "endereco", { obrigatoria: true });
  pergunta("endereco", "Qual o endereço da empresa? (rua, número, bairro, cidade e CEP)", "segmento", { obrigatoria: true });
  pergunta("segmento", "Em que segmento a empresa atua?", "operacao_descricao");
  pergunta("operacao_descricao", "Conte em poucas linhas como a operação funciona hoje, do primeiro contato do cliente até a cobrança.", "parte_estrutura");

  // Várias unidades, vários clientes ou várias empresas: cada caso é organizado de um jeito.
  fala("parte_estrutura", "*Parte 2 de 5 · Estrutura* 🧩", "estrutura");
  menu("estrutura", "Como é a estrutura de vocês?", [
    ["Uma empresa só", "parte_pessoas"],
    ["Matriz com filiais", "info_filiais"],
    ["Atendo vários clientes", "info_clientes"],
    ["Empresas separadas", "info_separadas"],
  ]);
  fala("info_filiais", "Dentro do seu ambiente cada filial fica separada: leads, tarefas, propostas, contratos, produtos, agenda, equipe e financeiro. Um seletor no menu mostra uma filial ou todas juntas. A base de clientes e o WhatsApp são compartilhados.", "unidades");
  pergunta("estrutura_detalhes", "Quais são as filiais? Mande o nome e a cidade de cada uma.", "parte_pessoas", { id: "unidades" });
  fala("info_clientes", "Para agência, contabilidade ou BPO: cada cliente atendido fica separado dentro do seu ambiente, com seletor no menu, calendário de conteúdo e banco de arquivos próprios. O WhatsApp é compartilhado.", "carteira");
  pergunta("estrutura_detalhes", "Quais clientes você vai gerenciar no sistema? Pode mandar os nomes.", "parte_pessoas", { id: "carteira" });
  fala("info_separadas", "Cada empresa separada ganha o *próprio ambiente*: dados, usuários e mensalidade não se misturam. Nesta conversa criamos o primeiro; os outros a equipe cria com você.", "outras_empresas");
  pergunta("estrutura_detalhes", "Quais são as outras empresas? Mande o nome e o CNPJ de cada uma.", "parte_pessoas", { id: "outras_empresas" });

  fala("parte_pessoas", "*Parte 3 de 5 · Pessoas e vendas* 👥", "resp_nome");
  pergunta("resp_nome", "Com quem eu falo? Me diga seu nome completo.", "resp_cargo", { obrigatoria: true });
  pergunta("resp_cargo", "Qual é o seu cargo?", "resp_email");
  pergunta("resp_email", "Qual o seu melhor e-mail? É nele que chega o acesso ao sistema.", "qtd_usuarios", { validation: "email", obrigatoria: true, erro: "Esse e-mail não parece válido. Pode digitar de novo?" });
  pergunta("qtd_usuarios", "Quantas pessoas vão usar o sistema? (só o número)", "usuarios_lista", { validation: "number", erro: "Mande só o número de pessoas, por exemplo: 5" });
  pergunta("usuarios_lista", "Mande o nome, o e-mail e a função de cada pessoa, tudo em uma mensagem. Se preferir enviar depois, responda *depois*.", "etapas_funil");
  pergunta("etapas_funil", "Quais são as etapas do funil de vendas? Ex.: Novo lead → Proposta → Fechado", "origens_leads");
  pergunta("origens_leads", "De onde vêm os leads hoje? (Instagram, indicação, anúncios…)", "meta_mensal");
  pergunta("meta_mensal", "Qual é a meta mensal de vendas? (em reais)", "importar_base");
  simNao("importar_base", "Vocês têm uma base de clientes ou leads para importar?", "importar_base_origem", "parte_integracoes");
  pergunta("importar_base_origem", "Onde está essa base? (planilha, outro sistema…)", "parte_integracoes");

  fala("parte_integracoes", "*Parte 4 de 5 · Integrações* 🔌", "whats_usa");
  simNao("whats_usa", "Vocês vão usar o WhatsApp no sistema?", "whats_tipo", "meta_usa");
  menu("whats_tipo", "Que tipo de WhatsApp é?", [["WhatsApp Business (app)", "whats_numero"], ["API oficial (Meta)", "whats_numero"], ["Ainda não sei", "whats_numero"]]);
  pergunta("whats_numero", "Qual número principal será conectado? (com DDD)", "meta_usa", { validation: "phone", erro: "Mande o número com DDD, por exemplo: 63 99999-8888" });
  simNao("meta_usa", "Vocês anunciam no Facebook ou Instagram (Meta Ads)?", "meta_conta_id", "google_usa");
  pergunta("meta_conta_id", "Se souber, qual é o ID da conta de anúncios? (só o número)", "google_usa");
  simNao("google_usa", "Usam Google Ads ou Google Analytics?", "agenda_usa");
  simNao("agenda_usa", "Usam o Google Agenda para marcar reuniões?", "parte_aurora");

  fala("parte_aurora", "*Parte 5 de 5 · Aurora, a inteligência do sistema* 🤖", "ia_tom");
  menu("ia_tom", "Que tom a inteligência artificial deve usar?", [["Formal", "ia_horario"], ["Consultivo", "ia_horario"], ["Descontraído", "ia_horario"]]);
  pergunta("ia_horario", "Qual é o horário de atendimento de vocês?", "info_mensalidade");

  fala("info_mensalidade", "💳 *Sobre a mensalidade*\n• O sistema avisa nos *15 dias antes* do vencimento.\n• Sem o pagamento na data, o acesso é bloqueado e volta quando o pagamento é conferido. Os dados ficam guardados.\n• Com 45 dias de atraso, a conta pode ser encerrada e excluída, com cópia de segurança antes.", "conferir");

  // Resumo antes de gravar. Cada correção pergunta de novo só aquele dado e volta para cá.
  const correcoes: [string, string, string, string, ValidationKind][] = [
    ["Corrigir razão social", "corrigir_razao", "razao_social", "Qual é a razão social correta?", "text"],
    ["Corrigir CNPJ", "corrigir_cnpj", "cnpj", "Qual é o CNPJ correto?", "text"],
    ["Corrigir endereço", "corrigir_endereco", "endereco", "Qual é o endereço correto?", "text"],
    ["Corrigir meu nome", "corrigir_nome", "resp_nome", "Qual é o seu nome completo?", "text"],
    ["Corrigir e-mail", "corrigir_email", "resp_email", "Qual é o e-mail correto?", "email"],
  ];
  add({
    id: "conferir", type: "menu",
    text: "📋 *Confira antes de eu salvar*\n\nEmpresa: {{nome_fantasia}}\nRazão social: {{razao_social}}\nCNPJ: {{cnpj}}\nEndereço: {{endereco}}\nEstrutura: {{estrutura}}\nResponsável: {{resp_nome}}\nE-mail: {{resp_email}}",
    options: [
      { id: "conferir_ok", label: "Está tudo certo", next: "salvar" },
      ...correcoes.map(([label, id]) => ({ id: `conferir_${id}`, label, next: id })),
      { id: "conferir_equipe", label: "Falar com a equipe", next: "salvar_antes_de_chamar" },
    ],
  });
  for (const [, id, variable, text, validation] of correcoes) add({ id, type: "question", text, variable, validation, next: "conferir" });

  const map = [
    "nome_fantasia", "razao_social", "cnpj", "endereco", "segmento", "operacao_descricao", "estrutura", "estrutura_detalhes",
    "resp_nome", "resp_cargo", "resp_email", "qtd_usuarios", "usuarios_lista", "etapas_funil", "origens_leads", "meta_mensal",
    "importar_base", "importar_base_origem", "whats_usa", "whats_tipo", "whats_numero", "meta_usa", "meta_conta_id", "google_usa",
    "agenda_usa", "ia_tom", "ia_horario",
  ].map((v) => ({ field: v, variable: v }));
  map.push({ field: "resp_whatsapp", variable: "telefone" });

  add({ id: "salvar", type: "save_data", target: "implementation", map, provision: true, next: "fim" });
  add({ id: "fim", type: "end", text: "Pronto, recebi tudo! 🎉\n\n*Próximos passos:*\n✅ Com os dados completos, você recebe por e-mail o link para criar sua senha.\n✅ A equipe configura funil, permissões e integrações.\n✅ Depois vêm o WhatsApp de cada pessoa, o treinamento e 30 dias de acompanhamento.\n\nQualquer dúvida, é só chamar por aqui." });
  // Quem pede a equipe no resumo não perde o que já respondeu (grava sem criar o ambiente).
  add({ id: "salvar_antes_de_chamar", type: "save_data", target: "implementation", map, next: "equipe" });
  add({ id: "equipe", type: "handoff", text: "Certo! Guardei suas respostas e vou chamar alguém da equipe para ajustar com você. 🙂" });
  return { start: "boas_vindas", nodes };
}

export const CHATBOT_TEMPLATES: ChatbotTemplate[] = [
  { id: "basico", name: "Atendimento + captação de lead", description: "Boas-vindas, menu, coleta de nome/e-mail/interesse, cria o lead em Vendas e opção de falar com atendente.", flow: basico },
  { id: "implantacao", name: "Implantação de cliente (SPY)", description: "Em 5 partes: empresa, estrutura (filiais, clientes ou várias empresas), pessoas e vendas, integrações e Aurora. Explica a implementação e a mensalidade, mostra um resumo e preenche o formulário de Implementações.", flow: implantacao() },
  { id: "vazio", name: "Em branco", description: "Só uma mensagem de boas-vindas. Monte o resto do zero.", flow: vazio },
];
