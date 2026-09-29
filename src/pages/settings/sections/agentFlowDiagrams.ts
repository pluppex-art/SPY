/**
 * Diagramas de fluxo dos agentes — visualização somente-leitura, com a estrutura REAL de cada
 * workflow do n8n (nome do nó, tipo, posição e conexões reais), não uma representação inventada.
 * Pra workflows muito grandes (Aurora Core tem quase 300 nós, Júlia tem 90), os nós realmente
 * repetitivos foram agrupados num único nó "N ferramentas..." pra caber na tela sem perder a
 * fidelidade do fluxo principal — mas todo nó mostrado é um nó real, com o nome real. Cada nó
 * também tem uma `description` em linguagem simples (o que ele faz de verdade), porque o nome
 * técnico do n8n sozinho não é suficiente pra quem não construiu o fluxo entender o que acontece.
 *
 * Chave = agent_key (mesmo identificador de FIXED_N8N_PROMPT_KEY em SettingsSistemaAuroraAgentes.tsx).
 * Sem entrada aqui pra uma chave = usa DEFAULT_FLOW (estrutura real de um agente "Diretoria" padrão
 * como CEO AI — Financeiro/Marketing/Organização/Pesquisa/Atendimento/Agente Comercial seguem a
 * mesma forma real, só trocando o nome do agente e das ferramentas específicas).
 */

export interface FlowNode {
  id: string;
  /** Nome real do nó, exatamente como aparece no n8n. */
  name: string;
  /** Tipo real do nó no n8n (ex: "n8n-nodes-base.webhook") — decide o ícone e a cor mostrados. */
  nodeType: string;
  /** O que esse nó faz, em linguagem simples — não é o nome técnico do n8n. */
  description: string;
  position: [number, number];
}

export interface FlowEdge {
  from: string;
  to: string;
  label?: string;
}

export interface AgentFlowDiagram {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

// Estrutura real de um agente "Diretoria" (CEO AI) — Financeiro, Marketing, Organização,
// Pesquisa, Atendimento e Agente Comercial usam exatamente essa mesma forma no n8n hoje.
export const DEFAULT_FLOW: AgentFlowDiagram = {
  nodes: [
    { id: "trigger-sub", name: "Quando Chamado (Sub-workflow)", nodeType: "n8n-nodes-base.executeWorkflowTrigger", description: "Gatilho: recebe o pedido quando a Aurora aciona este agente durante uma conversa.", position: [0, 0] },
    { id: "trigger-direto", name: "Gatilho - Busca Direta (Sem Aurora)", nodeType: "n8n-nodes-base.webhook", description: "Gatilho: recebe o pedido quando alguém busca este agente direto, sem passar pela Aurora.", position: [0, -180] },
    { id: "unificada", name: "Entrada Unificada (Aurora ou Direto)", nodeType: "n8n-nodes-base.code", description: "Junta os dois jeitos de entrada num único formato, pra não duplicar o resto do fluxo.", position: [220, -90] },
    { id: "prompt", name: "Buscar Prompt Customizado", nodeType: "n8n-nodes-base.supabase", description: "Busca as instruções que esta empresa configurou especificamente pra este agente.", position: [440, -90] },
    { id: "agent", name: "Agente de IA", nodeType: "@n8n/n8n-nodes-langchain.agent", description: "O cérebro do agente — lê o pedido e decide o que responder ou fazer.", position: [660, -90] },
    { id: "model", name: "Modelo - Gemini", nodeType: "@n8n/n8n-nodes-langchain.lmChatGoogleGemini", description: "Modelo de IA (Gemini) que gera de fato o texto da resposta.", position: [660, 120] },
    { id: "tools", name: "Ferramentas de apoio", nodeType: "@n8n/n8n-nodes-langchain.toolWorkflow", description: "Ferramentas que o agente pode chamar pra buscar ou alterar dados reais do CRM.", position: [880, 120] },
    { id: "return", name: "Return", nodeType: "n8n-nodes-base.set", description: "Devolve a resposta final pra quem pediu (Aurora ou busca direta).", position: [880, -90] },
    { id: "tokens", name: "Registrar Uso de Tokens", nodeType: "n8n-nodes-base.executeWorkflow", description: "Registra quantos tokens de IA essa chamada gastou, pro controle de consumo do plano.", position: [660, -260] },
  ],
  edges: [
    { from: "trigger-sub", to: "unificada" },
    { from: "trigger-direto", to: "unificada" },
    { from: "unificada", to: "prompt" },
    { from: "prompt", to: "agent" },
    { from: "model", to: "agent", label: "modelo" },
    { from: "tools", to: "agent", label: "ferramenta" },
    { from: "agent", to: "return" },
    { from: "agent", to: "tokens" },
  ],
};

export const AGENT_FLOWS: Record<string, AgentFlowDiagram> = {
  aurora: {
    nodes: [
      { id: "trigger-chat", name: "Gatilho - Chat Aurora", nodeType: "@n8n/n8n-nodes-langchain.chatTrigger", description: "Gatilho: recebe mensagens do chat pessoal da Aurora (widget web).", position: [0, -200] },
      { id: "trigger-waha", name: "Gatilho - WhatsApp Vendedores", nodeType: "n8n-nodes-base.webhook", description: "Gatilho: recebe mensagens do WhatsApp da equipe de vendas.", position: [0, 200] },
      { id: "resolver", name: "Resolver Contexto Aurora", nodeType: "n8n-nodes-base.code", description: "Descobre quem está falando e de qual empresa, a partir do canal recebido.", position: [260, 0] },
      { id: "limite", name: "Chamar Helper Limite Tokens", nodeType: "n8n-nodes-base.executeWorkflow", description: "Confere se essa empresa ainda tem tokens de IA disponíveis no mês.", position: [500, -100] },
      { id: "config", name: "Chamar Helper Config Aurora Tenant", nodeType: "n8n-nodes-base.executeWorkflow", description: "Confere se a Aurora está ativada e quais módulos essa empresa liberou.", position: [500, 100] },
      { id: "model", name: "Google Gemini Chat Model", nodeType: "@n8n/n8n-nodes-langchain.lmChatGoogleGemini", description: "Modelo de IA (Gemini) que gera de fato a fala da Aurora.", position: [740, 260] },
      { id: "memoria", name: "Memória - JARVIS", nodeType: "@n8n/n8n-nodes-langchain.memoryBufferWindow", description: "Lembra o que foi dito nas últimas mensagens dessa mesma conversa.", position: [740, 100] },
      { id: "agent", name: "Aurora", nodeType: "@n8n/n8n-nodes-langchain.agent", description: "A Aurora em si — entende o pedido e decide o que fazer ou responder.", position: [740, -100] },
      { id: "tools", name: "180+ ferramentas (Diretoria, CRM, Agenda, WhatsApp, Aprendizados...)", nodeType: "@n8n/n8n-nodes-langchain.toolWorkflow", description: "Mais de 180 ferramentas reais: CRM, agenda, financeiro, WhatsApp, aprendizados e mais.", position: [980, 100] },
      { id: "tts", name: "Gerar Voz (TTS)", nodeType: "n8n-nodes-base.httpRequest", description: "Transforma o texto da resposta em áudio de voz.", position: [980, -200] },
      { id: "tokens", name: "Registrar Uso de Tokens - Aurora", nodeType: "n8n-nodes-base.executeWorkflow", description: "Registra o consumo de tokens de IA dessa conversa.", position: [980, -350] },
      { id: "resposta", name: "Montar Resposta com Áudio", nodeType: "n8n-nodes-base.set", description: "Monta a resposta final com texto e áudio pra enviar de volta.", position: [1220, -100] },
    ],
    edges: [
      { from: "trigger-chat", to: "resolver" },
      { from: "trigger-waha", to: "resolver" },
      { from: "resolver", to: "limite" },
      { from: "resolver", to: "config" },
      { from: "limite", to: "agent" },
      { from: "config", to: "agent" },
      { from: "model", to: "agent", label: "modelo" },
      { from: "memoria", to: "agent", label: "memória" },
      { from: "tools", to: "agent", label: "ferramenta" },
      { from: "agent", to: "tts" },
      { from: "agent", to: "tokens" },
      { from: "tts", to: "resposta" },
    ],
  },

  sdr: {
    nodes: [
      { id: "trigger-waha", name: "Webhook WAHA v2 (Axis)", nodeType: "n8n-nodes-base.webhook", description: "Gatilho: recebe toda mensagem de WhatsApp que chega no número da Júlia.", position: [0, 100] },
      { id: "trigger-ativo", name: "Gatilho - Disparo Ativo SDR (Aurora)", nodeType: "n8n-nodes-base.executeWorkflowTrigger", description: "Gatilho: recebe o pedido quando a Aurora manda a Júlia contatar alguém primeiro.", position: [0, 320] },
      { id: "interno", name: "É Usuário Interno?", nodeType: "n8n-nodes-base.if", description: "Confere se quem mandou a mensagem é alguém da própria equipe, não um lead.", position: [260, 100] },
      { id: "dedup", name: "Redis - Check Message ID", nodeType: "n8n-nodes-base.redis", description: "Evita processar a mesma mensagem duas vezes se ela chegar duplicada.", position: [500, 100] },
      { id: "debounce", name: "Wait - Debounce 10s", nodeType: "n8n-nodes-base.wait", description: "Espera 10 segundos pra juntar várias mensagens seguidas da mesma pessoa numa só.", position: [740, 100] },
      { id: "pausado", name: "If - Bot Pausado?", nodeType: "n8n-nodes-base.if", description: "Confere se alguém da equipe pausou o robô pra esse contato.", position: [980, 100] },
      { id: "buscarLead", name: "Buscar Lead no Axis", nodeType: "n8n-nodes-base.supabase", description: "Procura se esse contato já é um lead cadastrado no CRM.", position: [1220, 20] },
      { id: "extrairIA", name: "IA - Extrair Dados do Lead v2", nodeType: "@n8n/n8n-nodes-langchain.informationExtractor", description: "Usa IA pra ler a conversa e extrair nome, interesse e outros dados do lead.", position: [1460, 20] },
      { id: "upsertLead", name: "Criar/Atualizar Lead Axis", nodeType: "n8n-nodes-base.supabase", description: "Cria o lead se for novo, ou atualiza os dados se ele já existir.", position: [1700, 20] },
      { id: "roteamento", name: "Calcular Roteamento v2", nodeType: "n8n-nodes-base.code", description: "Decide os próximos passos com base no estágio atual do lead.", position: [1940, -100] },
      { id: "handoff", name: "Handoff Necessário?", nodeType: "n8n-nodes-base.if", description: "Decide se é hora de passar esse lead pra um vendedor humano (Closer).", position: [2180, -100] },
      { id: "closer", name: "Atribuir Closer (Round Robin)", nodeType: "n8n-nodes-base.supabase", description: "Escolhe automaticamente qual vendedor vai assumir esse lead, em rodízio.", position: [2420, -200] },
      { id: "aprendizados", name: "Consultar Aprendizados Compartilhados", nodeType: "n8n-nodes-base.executeWorkflow", description: "Consulta erros e acertos que outros atendimentos já ensinaram à Júlia.", position: [2420, 100] },
      { id: "agent", name: "Agente - Júlia", nodeType: "@n8n/n8n-nodes-langchain.agent", description: "A Júlia em si — conversa com o lead e qualifica o interesse dele.", position: [2660, 100] },
      { id: "notaTool", name: "Adicionar_Nota_Julia", nodeType: "n8n-nodes-base.supabaseTool", description: "Deixa a Júlia registrar uma anotação importante no cadastro do lead.", position: [2660, 300] },
      { id: "resposta", name: "Enviar Resposta WAHA v2", nodeType: "n8n-nodes-base.httpRequest", description: "Envia a resposta da Júlia de volta pro WhatsApp do lead.", position: [2900, 100] },
    ],
    edges: [
      { from: "trigger-waha", to: "interno" },
      { from: "trigger-ativo", to: "roteamento", label: "disparo ativo" },
      { from: "interno", to: "dedup", label: "não" },
      { from: "dedup", to: "debounce" },
      { from: "debounce", to: "pausado" },
      { from: "pausado", to: "buscarLead", label: "não" },
      { from: "buscarLead", to: "extrairIA" },
      { from: "extrairIA", to: "upsertLead" },
      { from: "upsertLead", to: "roteamento" },
      { from: "roteamento", to: "handoff" },
      { from: "handoff", to: "closer", label: "sim" },
      { from: "handoff", to: "aprendizados", label: "não" },
      { from: "closer", to: "aprendizados" },
      { from: "aprendizados", to: "agent" },
      { from: "notaTool", to: "agent", label: "ferramenta" },
      { from: "agent", to: "resposta" },
    ],
  },

  closer: {
    nodes: [
      { id: "trigger-sub", name: "Quando Chamado (Sub-workflow)", nodeType: "n8n-nodes-base.executeWorkflowTrigger", description: "Gatilho: recebe o pedido quando a Aurora aciona o Closer durante uma conversa.", position: [0, 0] },
      { id: "trigger-direto", name: "Gatilho - Busca Direta (Sem Aurora)", nodeType: "n8n-nodes-base.webhook", description: "Gatilho: recebe o pedido quando alguém busca o Closer direto, sem passar pela Aurora.", position: [0, -180] },
      { id: "unificada", name: "Entrada Unificada (Aurora ou Direto)", nodeType: "n8n-nodes-base.code", description: "Junta os dois jeitos de entrada num único formato.", position: [220, -90] },
      { id: "gate", name: "Checar Módulo Closer", nodeType: "n8n-nodes-base.executeWorkflow", description: "Confere se essa empresa contratou o módulo Closer AI.", position: [440, -90] },
      { id: "gateIf", name: "IF - Módulo Closer Habilitado?", nodeType: "n8n-nodes-base.if", description: "Só libera o restante do fluxo se o módulo estiver realmente ativo.", position: [660, -90] },
      { id: "prompt", name: "Buscar Prompt Customizado Closer", nodeType: "n8n-nodes-base.supabase", description: "Busca as instruções de venda customizadas dessa empresa.", position: [880, -180] },
      { id: "recusa", name: "Return Recusa Módulo", nodeType: "n8n-nodes-base.set", description: "Avisa educadamente que esse módulo não está disponível pra essa empresa.", position: [880, 20] },
      { id: "model", name: "Modelo - GPT", nodeType: "@n8n/n8n-nodes-langchain.lmChatGoogleGemini", description: "Modelo de IA que gera os conselhos de negociação do Closer.", position: [1120, 20] },
      { id: "agent", name: "Closer AI", nodeType: "@n8n/n8n-nodes-langchain.agent", description: "O Closer AI — dá conselhos de negociação e fechamento pro vendedor.", position: [1120, -180] },
      { id: "return", name: "Return", nodeType: "n8n-nodes-base.set", description: "Devolve a resposta do Closer pra quem pediu.", position: [1360, -180] },
      { id: "tokens", name: "Registrar Uso de Tokens", nodeType: "n8n-nodes-base.executeWorkflow", description: "Registra o consumo de tokens de IA dessa chamada.", position: [1120, -340] },
    ],
    edges: [
      { from: "trigger-sub", to: "unificada" },
      { from: "trigger-direto", to: "unificada" },
      { from: "unificada", to: "gate" },
      { from: "gate", to: "gateIf" },
      { from: "gateIf", to: "prompt", label: "sim" },
      { from: "gateIf", to: "recusa", label: "não" },
      { from: "prompt", to: "agent" },
      { from: "model", to: "agent", label: "modelo" },
      { from: "agent", to: "return" },
      { from: "agent", to: "tokens" },
    ],
  },

  radar: {
    nodes: [
      { id: "trigger-direto", name: "Gatilho - Busca Direta (Sem Aurora)", nodeType: "n8n-nodes-base.webhook", description: "Gatilho: recebe um pedido de busca de novas empresas/oportunidades.", position: [0, -100] },
      { id: "trigger-grupo", name: "Gatilho - WhatsApp Grupos", nodeType: "n8n-nodes-base.webhook", description: "Gatilho: recebe mensagens de grupos de WhatsApp que a empresa monitora.", position: [0, 300] },
      { id: "normalizarBusca", name: "Normalizar Busca Radar", nodeType: "n8n-nodes-base.code", description: "Organiza os termos da busca antes de consultar o Google Maps.", position: [240, -100] },
      { id: "gate", name: "Checar Módulo Radar", nodeType: "n8n-nodes-base.executeWorkflow", description: "Confere se essa empresa contratou o módulo Radar.", position: [480, -100] },
      { id: "maps", name: "Buscar Empresas no Google Maps", nodeType: "n8n-nodes-base.httpRequest", description: "Busca empresas reais no Google Maps que combinam com a procura.", position: [720, -180] },
      { id: "montarProspects", name: "Montar Prospects Reais", nodeType: "n8n-nodes-base.code", description: "Organiza os resultados do Maps num formato de prospect.", position: [960, -180] },
      { id: "salvarProspect", name: "Salvar Prospect", nodeType: "n8n-nodes-base.dataTable", description: "Salva os prospects encontrados pra consulta depois.", position: [1200, -180] },
      { id: "extrairGrupo", name: "Extrair Payload Grupo", nodeType: "n8n-nodes-base.code", description: "Lê a mensagem recebida no grupo monitorado.", position: [240, 300] },
      { id: "grupoMonitorado", name: "Buscar Grupo Monitorado", nodeType: "n8n-nodes-base.supabase", description: "Confere se esse grupo está mesmo cadastrado pra monitoramento.", position: [480, 300] },
      { id: "gateGrupo", name: "Checar Módulo Radar (Grupo)", nodeType: "n8n-nodes-base.executeWorkflow", description: "Confere de novo se o módulo Radar está ativo pra essa empresa.", position: [720, 300] },
      { id: "classificar", name: "Gemini - Classificar Oportunidade", nodeType: "n8n-nodes-base.httpRequest", description: "Usa IA pra avaliar se essa mensagem é uma oportunidade real de negócio.", position: [960, 300] },
      { id: "eOportunidade", name: "IF - É Oportunidade Real?", nodeType: "n8n-nodes-base.if", description: "Só segue adiante se a IA classificou como oportunidade de verdade.", position: [1200, 300] },
      { id: "criarLead", name: "Executar - Criar Lead Axis (Radar)", nodeType: "n8n-nodes-base.executeWorkflow", description: "Cria um lead novo a partir da oportunidade identificada.", position: [1440, 300] },
      { id: "notificar", name: "Executar - Notificar Vendedor WAHA (Radar)", nodeType: "n8n-nodes-base.executeWorkflow", description: "Avisa o vendedor responsável por WhatsApp sobre a nova oportunidade.", position: [1680, 300] },
    ],
    edges: [
      { from: "trigger-direto", to: "normalizarBusca" },
      { from: "normalizarBusca", to: "gate" },
      { from: "gate", to: "maps" },
      { from: "maps", to: "montarProspects" },
      { from: "montarProspects", to: "salvarProspect" },
      { from: "trigger-grupo", to: "extrairGrupo" },
      { from: "extrairGrupo", to: "grupoMonitorado" },
      { from: "grupoMonitorado", to: "gateGrupo" },
      { from: "gateGrupo", to: "classificar" },
      { from: "classificar", to: "eOportunidade" },
      { from: "eOportunidade", to: "criarLead", label: "sim" },
      { from: "criarLead", to: "notificar" },
    ],
  },

  agente_secreto: {
    nodes: [
      { id: "trigger", name: "Webhook Multi-Tenant (Agente Secreto)", nodeType: "n8n-nodes-base.webhook", description: "Gatilho: recebe mensagens de WhatsApp de qualquer empresa que usa esse agente.", position: [0, 100] },
      { id: "resolverTenant", name: "Resolver Tenant", nodeType: "n8n-nodes-base.supabase", description: "Descobre de qual empresa é esse número de WhatsApp.", position: [240, 100] },
      { id: "tenantEncontrado", name: "If - Tenant Encontrado?", nodeType: "n8n-nodes-base.if", description: "Só segue se a empresa foi identificada com sucesso.", position: [480, 100] },
      { id: "extrairPayload", name: "Extrair Payload e Direção", nodeType: "n8n-nodes-base.code", description: "Separa o conteúdo da mensagem e pra qual lado ela foi (entrada/saída).", position: [720, 20] },
      { id: "eAudio", name: "If - É Áudio?", nodeType: "n8n-nodes-base.if", description: "Confere se a mensagem recebida é um áudio.", position: [960, 20] },
      { id: "transcrever", name: "Transcrever Áudio (Gemini)", nodeType: "@n8n/n8n-nodes-langchain.googleGemini", description: "Transforma o áudio recebido em texto usando IA.", position: [1200, -80] },
      { id: "debounce", name: "Redis - Debounce Check", nodeType: "n8n-nodes-base.redis", description: "Espera um pouco pra juntar mensagens seguidas da mesma pessoa.", position: [1440, 20] },
      { id: "buscarPaciente", name: "Buscar Paciente Existente", nodeType: "n8n-nodes-base.supabase", description: "Procura se essa pessoa já está cadastrada.", position: [1680, 20] },
      { id: "extrairDados", name: "IA - Extrair Dados Paciente", nodeType: "@n8n/n8n-nodes-langchain.informationExtractor", description: "Usa IA pra extrair nome e outros dados da conversa.", position: [1920, 20] },
      { id: "upsertPaciente", name: "Criar/Atualizar Paciente", nodeType: "n8n-nodes-base.supabase", description: "Cria ou atualiza o cadastro dessa pessoa.", position: [2160, 20] },
      { id: "agendamento", name: "If - Agendamento Detectado?", nodeType: "n8n-nodes-base.if", description: "Confere se a conversa menciona marcar ou remarcar um horário.", position: [2400, 20] },
      { id: "criarAgendamento", name: "Criar/Atualizar Agendamento", nodeType: "n8n-nodes-base.supabase", description: "Cria ou atualiza o agendamento identificado.", position: [2640, -80] },
      { id: "notificar", name: "Enviar Notificação Privada", nodeType: "n8n-nodes-base.httpRequest", description: "Avisa a equipe internamente sobre a novidade.", position: [2880, 20] },
    ],
    edges: [
      { from: "trigger", to: "resolverTenant" },
      { from: "resolverTenant", to: "tenantEncontrado" },
      { from: "tenantEncontrado", to: "extrairPayload", label: "sim" },
      { from: "extrairPayload", to: "eAudio" },
      { from: "eAudio", to: "transcrever", label: "sim" },
      { from: "eAudio", to: "debounce", label: "não" },
      { from: "transcrever", to: "debounce" },
      { from: "debounce", to: "buscarPaciente" },
      { from: "buscarPaciente", to: "extrairDados" },
      { from: "extrairDados", to: "upsertPaciente" },
      { from: "upsertPaciente", to: "agendamento" },
      { from: "agendamento", to: "criarAgendamento", label: "sim" },
      { from: "criarAgendamento", to: "notificar" },
      { from: "agendamento", to: "notificar", label: "não" },
    ],
  },

  briefing_diario: {
    nodes: [
      { id: "trigger", name: "Agendamento - Diário 8h", nodeType: "n8n-nodes-base.scheduleTrigger", description: "Gatilho: dispara sozinho todo dia às 8h da manhã.", position: [0, 0] },
      { id: "destinatarios", name: "Buscar Destinatários Briefing", nodeType: "n8n-nodes-base.supabase", description: "Lista quem deve receber o briefing hoje.", position: [240, 0] },
      { id: "loop", name: "Loop - Um Destinatário por Vez", nodeType: "n8n-nodes-base.splitInBatches", description: "Processa um destinatário de cada vez, sem misturar dados de pessoas diferentes.", position: [480, 0] },
      { id: "reunioes", name: "Buscar Reuniões Hoje", nodeType: "n8n-nodes-base.supabase", description: "Busca as reuniões marcadas pra hoje dessa pessoa.", position: [720, -140] },
      { id: "leads", name: "Buscar Leads Abertos", nodeType: "n8n-nodes-base.supabase", description: "Busca os leads em aberto dessa pessoa.", position: [720, 0] },
      { id: "financeiro", name: "Buscar Financeiro Aberto", nodeType: "n8n-nodes-base.supabase", description: "Busca pendências financeiras em aberto.", position: [720, 140] },
      { id: "resumo", name: "Montar Resumo Real do Dia", nodeType: "n8n-nodes-base.code", description: "Junta tudo isso num resumo real do dia.", position: [960, 0] },
      { id: "agent", name: "JARVIS Daily Briefing", nodeType: "@n8n/n8n-nodes-langchain.agent", description: "Escreve o texto do briefing em linguagem natural.", position: [1200, 0] },
      { id: "envio", name: "Enviar - WhatsApp WAHA", nodeType: "n8n-nodes-base.httpRequest", description: "Envia o briefing pelo WhatsApp da pessoa.", position: [1440, 0] },
    ],
    edges: [
      { from: "trigger", to: "destinatarios" },
      { from: "destinatarios", to: "loop" },
      { from: "loop", to: "reunioes" },
      { from: "loop", to: "leads" },
      { from: "loop", to: "financeiro" },
      { from: "reunioes", to: "resumo" },
      { from: "leads", to: "resumo" },
      { from: "financeiro", to: "resumo" },
      { from: "resumo", to: "agent" },
      { from: "agent", to: "envio" },
    ],
  },
};

export function getFlowForAgentKey(agentKey: string): AgentFlowDiagram {
  return AGENT_FLOWS[agentKey] ?? DEFAULT_FLOW;
}
