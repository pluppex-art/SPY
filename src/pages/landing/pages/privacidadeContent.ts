import type { DocContent } from "./docTypes";

/**
 * Política de Privacidade do S.P.Y. — texto único usado pela página React e pela versão estática
 * gerada no build (scripts/prerender-static.mjs), para que robôs sem JavaScript (ex.: verificação
 * do Google) vejam o conteúdo completo. Este arquivo não pode importar React nem nada de DOM.
 */

/** Dados da empresa responsável. Campos vazios são omitidos (a página orienta o contato pelo formulário do site). */
const COMPANY = {
  razaoSocial: "",
  cnpj: "",
  emailPrivacidade: "",
};

const LAST_UPDATE = "14 de outubro de 2026";

const contato = COMPANY.emailPrivacidade
  ? `pelo e-mail <a href="mailto:${COMPANY.emailPrivacidade}">${COMPANY.emailPrivacidade}</a> ou pelo <a href="/contato">formulário de contato do site</a>`
  : `pelo <a href="/contato">formulário de contato do site</a>`;

const empresa = COMPANY.razaoSocial || COMPANY.cnpj
  ? `<p>${COMPANY.razaoSocial}${COMPANY.razaoSocial && COMPANY.cnpj ? " — " : ""}${COMPANY.cnpj ? `CNPJ ${COMPANY.cnpj}` : ""}</p>`
  : "";

export const PRIVACIDADE: DocContent = {
  slug: "privacidade",
  metaTitle: "Política de Privacidade — S.P.Y.",
  metaDescription:
    "Como o S.P.Y. (spycrm.com.br) coleta, usa, compartilha e protege dados pessoais, inclusive dados de contas Google (Agenda, Tarefas e Meet), em conformidade com a LGPD e com a Política de Dados do Usuário dos Serviços de API do Google.",
  title: "Política de Privacidade",
  intro: "Transparência sobre quais dados tratamos, por que tratamos e como você mantém o controle sobre eles.",
  updated: LAST_UPDATE,
  sections: [
    {
      id: "quem-somos",
      title: "1. Quem somos e quais são os nossos papéis",
      html: [
        "<p>O S.P.Y. é uma plataforma de gestão comercial e operacional (CRM, propostas, contratos, agenda, tarefas, financeiro e assistente de inteligência artificial chamada Aurora), disponibilizada em <strong>spycrm.com.br</strong>. Esta Política explica como tratamos dados pessoais, em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD).</p>",
        "<p>O serviço responsável por esta página e por este aplicativo é o <strong>S.P.Y. — spycrm.com.br</strong>.</p>",
        empresa,
        "<p>Atuamos em dois papéis distintos:</p>",
        "<ul><li><strong>Controlador</strong> dos dados de visitantes do nosso site e dos dados de cadastro e acesso dos usuários da plataforma (por exemplo, nome, e-mail e registros de login).</li><li><strong>Operador</strong> dos dados que as empresas clientes inserem na plataforma sobre os seus próprios leads, clientes, contatos, propostas, reuniões, tarefas e mensagens. Nesse caso, a empresa cliente é a controladora e define as finalidades; nós tratamos os dados apenas para prestar o serviço contratado.</li></ul>",
      ],
    },
    {
      id: "dados",
      title: "2. Quais dados tratamos",
      html: [
        "<p>Dependendo de como você interage com o S.P.Y., podemos tratar as categorias abaixo:</p>",
        '<ul><li><strong>Visitantes do site:</strong> nome, empresa, WhatsApp, e-mail e as informações que você escolher nos enviar em formulários de contato.</li><li><strong>Usuários da plataforma:</strong> nome, e-mail, credenciais de acesso (a senha é gerenciada por serviço de autenticação, nunca armazenada em texto aberto), cargo e departamento, empresa à qual pertence, preferências de uso e registros de atividade e de acesso.</li><li><strong>Dados inseridos pelas empresas clientes:</strong> informações de leads, clientes e seus contatos, histórico de relacionamento, propostas e contratos, lançamentos financeiros, reuniões (inclusive notas, transcrições e relatórios), tarefas e conversas de canais conectados, como o WhatsApp.</li><li><strong>Dados técnicos:</strong> endereço IP, tipo de navegador e dispositivo, datas e horários de acesso, necessários para segurança, prevenção a fraudes e funcionamento do serviço.</li><li><strong>Dados de contas conectadas:</strong> quando você autoriza a conexão com o Google (Agenda, Tarefas e Meet), tratamos os eventos e as tarefas necessários para sincronizar com a plataforma, dentro das permissões que você concedeu. Veja a seção <a href="#google">Dados de contas Google (Agenda, Tarefas e Meet)</a>.</li></ul>',
        "<p>Não solicitamos dados pessoais sensíveis (art. 5º, II, da LGPD) como requisito para usar o S.P.Y. Se uma empresa cliente optar por registrar esse tipo de informação, ela é responsável por ter a base legal adequada.</p>",
      ],
    },
    {
      id: "google",
      title: "3. Dados de contas Google (Agenda, Tarefas e Meet)",
      html: [
        "<p>Esta seção descreve, de forma específica, como o S.P.Y. acessa, usa, armazena, compartilha e protege os dados de usuários do Google recebidos pelas APIs do Google (Google Calendar, Google Tasks e Google Meet).</p>",
        "<h3>Quando isso se aplica</h3>",
        "<p>Somente se você, de forma opcional, clicar em conectar a sua conta Google em <strong>Configurações → Integrações → Central de Conexões</strong> e aceitar a tela de consentimento do Google. Se você não conectar a sua conta, o S.P.Y. não acessa nenhum dado do Google.</p>",
        "<h3>Quais permissões (escopos) solicitamos e por quê</h3>",
        "<ul><li><strong>calendar.events</strong> (<code>https://www.googleapis.com/auth/calendar.events</code>): criar e atualizar os eventos e as reuniões que você agenda no S.P.Y., inclusive com link do Google Meet.</li><li><strong>calendar.readonly</strong> (<code>https://www.googleapis.com/auth/calendar.readonly</code>): ler os seus calendários e eventos para exibir e sincronizar a sua agenda no S.P.Y.</li><li><strong>meetings.space.created</strong> (<code>https://www.googleapis.com/auth/meetings.space.created</code>): criar as salas do Google Meet das reuniões agendadas pelo S.P.Y.</li><li><strong>tasks.readonly</strong> (<code>https://www.googleapis.com/auth/tasks.readonly</code>): ler, somente leitura, as suas tarefas do Google Tarefas para exibi-las no S.P.Y. Não criamos, alteramos nem apagamos tarefas no Google.</li><li><strong>email</strong> e <strong>profile</strong>: identificar qual conta Google está conectada (nome e e-mail da conta).</li></ul>",
        "<h3>Como usamos os dados do Google</h3>",
        "<p>Usamos esses dados apenas para oferecer os recursos que você pediu: mostrar a sua agenda e as suas tarefas no S.P.Y., criar reuniões com link do Google Meet e permitir que a assistente Aurora responda perguntas sobre a sua própria agenda e as suas próprias tarefas. <strong>Não usamos dados do Google para publicidade, não os vendemos, não criamos perfis a partir deles e não os repassamos a corretores de dados (data brokers).</strong></p>",
        "<h3>Inteligência artificial</h3>",
        "<p>Quando você pergunta à Aurora sobre a sua agenda ou as suas tarefas, enviamos ao provedor de IA configurado para o serviço (por exemplo, Google Gemini ou Groq) apenas os eventos e as tarefas necessários para responder, e somente para gerar a resposta. Não usamos dados de usuários do Google para treinar modelos de IA de uso geral e não permitimos que os provedores o façam com esses dados.</p>",
        "<h3>Armazenamento e proteção</h3>",
        "<p>Os tokens de acesso e de atualização ficam em uma tabela do banco de dados que somente o nosso servidor consegue ler; eles nunca são expostos a navegadores nem a outros usuários. Os eventos e as tarefas sincronizados ficam visíveis apenas para o usuário que conectou a conta, com isolamento por usuário e por empresa. Todo o tráfego ocorre por HTTPS.</p>",
        "<h3>Acesso por pessoas</h3>",
        "<p>A nossa equipe não lê esses dados, exceto: (a) com a sua permissão expressa, para dar suporte; (b) para investigar incidentes de segurança ou abuso; (c) para cumprir obrigação legal; ou (d) em formato agregado e anonimizado.</p>",
        "<h3>Compartilhamento</h3>",
        "<p>Compartilhamos dados do Google apenas com os prestadores de infraestrutura e de IA estritamente necessários para executar o recurso, sob contrato, ou quando a lei exigir.</p>",
        "<h3>Retenção, exclusão e revogação</h3>",
        '<ul><li>Você pode desconectar a sua conta Google a qualquer momento em <strong>Configurações → Integrações → Central de Conexões</strong>. Ao desconectar, revogamos o token no Google, apagamos os tokens de acesso e de atualização armazenados e paramos de sincronizar.</li><li>Os eventos e as tarefas já sincronizados permanecem na sua conta do S.P.Y. enquanto a conta existir e podem ser excluídos mediante solicitação pela <a href="/contato">página de contato</a>, conforme os seus direitos previstos na LGPD.</li><li>Você também pode revogar o acesso diretamente em <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener">myaccount.google.com/permissions</a>.</li></ul>',
        "<h3>Uso Limitado (Limited Use)</h3>",
        '<p>O uso e a transferência, pelo S.P.Y., de informações recebidas das APIs do Google para qualquer outro aplicativo obedecerão à <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener">Política de Dados do Usuário dos Serviços de API do Google</a>, incluindo os requisitos de Uso Limitado.</p>',
        '<p lang="en">S.P.Y.\'s use and transfer to any other app of information received from Google APIs will adhere to <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener">Google API Services User Data Policy</a>, including the Limited Use requirements.</p>',
      ],
    },
    {
      id: "finalidades",
      title: "4. Para que usamos os dados e em quais bases legais",
      html: [
        "<ul><li><strong>Prestar o serviço e executar o contrato</strong> (art. 7º, V): criar e manter contas, autenticar usuários, operar os módulos da plataforma, sincronizar integrações e dar suporte.</li><li><strong>Cumprir obrigações legais e regulatórias</strong> (art. 7º, II): guardar registros de acesso e dados fiscais e de cobrança, quando aplicável.</li><li><strong>Legítimo interesse</strong> (art. 7º, IX): garantir a segurança da plataforma, prevenir fraudes e abusos, medir o desempenho do serviço e melhorá-lo, sempre respeitando os seus direitos e expectativas.</li><li><strong>Consentimento</strong> (art. 7º, I): quando você nos pede contato comercial ou autoriza integrações opcionais, como Google e WhatsApp. Você pode revogá-lo a qualquer momento.</li><li><strong>Cobrança e pagamentos</strong>: processar assinaturas e conciliar pagamentos por meio de provedores de pagamento.</li></ul>",
      ],
    },
    {
      id: "ia",
      title: "5. Inteligência artificial (Aurora)",
      html: [
        "<p>Os recursos da Aurora — como resumos de reuniões, análise de leads, sugestões de próximos passos e respostas automáticas — enviam o conteúdo estritamente necessário a provedores de modelos de linguagem para gerar a resposta. Esse processamento ocorre sob a configuração da empresa cliente (por exemplo, apenas quando há um agente ativo) e dentro dos limites de uso definidos para cada conta.</p>",
        "<p>As sugestões e classificações geradas por IA, incluindo estimativas como pontuação de lead ou sentimento, são apoio à decisão e podem conter imprecisões. Você pode solicitar a revisão de decisões tomadas exclusivamente com base em tratamento automatizado (art. 20 da LGPD) pelos nossos canais de contato.</p>",
      ],
    },
    {
      id: "compartilhamento",
      title: "6. Com quem compartilhamos",
      html: [
        "<p>Não vendemos dados pessoais. Compartilhamos informações apenas quando necessário para operar o serviço, com prestadores que atuam como suboperadores, sob obrigações de confidencialidade e segurança:</p>",
        "<ul><li>Infraestrutura, banco de dados e autenticação (Supabase) e hospedagem da aplicação (Vercel);</li><li>Provedores de inteligência artificial usados pela Aurora (como Google Gemini e Groq);</li><li>Provedores de pagamento (como Mercado Pago), para cobrança e conciliação;</li><li>Integrações que você ativa: Google Agenda e Google Tarefas, gateway de WhatsApp e videoconferência (Jitsi);</li><li>Fontes tipográficas carregadas do Google Fonts nas páginas públicas, o que pode expor seu endereço IP a esse serviço.</li></ul>",
        "<p>Também podemos compartilhar dados para cumprir ordem legal ou regulatória, ou para a defesa de direitos em processos. Dentro de cada empresa cliente, os dados ficam isolados dos demais clientes e são acessados apenas por usuários autorizados pela própria empresa.</p>",
      ],
    },
    {
      id: "internacional",
      title: "7. Transferência internacional",
      html: [
        "<p>Alguns dos nossos prestadores podem processar dados em servidores fora do Brasil. Nesses casos, adotamos as salvaguardas previstas nos arts. 33 e seguintes da LGPD, como cláusulas contratuais e a escolha de fornecedores com padrões reconhecidos de segurança e privacidade.</p>",
      ],
    },
    {
      id: "retencao",
      title: "8. Por quanto tempo guardamos os dados",
      html: [
        "<p>Mantemos os dados pelo tempo necessário para cumprir as finalidades descritas nesta Política, durante a vigência do contrato e pelos prazos legais de guarda (por exemplo, obrigações fiscais e de registro de acesso). Os dados inseridos pela empresa cliente são mantidos conforme as instruções dela; ao encerrar a conta, eles podem ser excluídos ou anonimizados mediante solicitação, ressalvadas as hipóteses de guarda obrigatória. As regras específicas dos dados de contas Google estão na seção <a href=\"#google\">Dados de contas Google</a>.</p>",
      ],
    },
    {
      id: "direitos",
      title: "9. Seus direitos como titular",
      html: [
        "<p>Nos termos do art. 18 da LGPD, você pode solicitar, a qualquer momento:</p>",
        "<ul><li>confirmação da existência de tratamento e acesso aos seus dados;</li><li>correção de dados incompletos, inexatos ou desatualizados;</li><li>anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em desconformidade;</li><li>portabilidade dos dados, observados os segredos comercial e industrial;</li><li>informação sobre com quem compartilhamos os seus dados;</li><li>revogação do consentimento e eliminação dos dados tratados com base nele;</li><li>revisão de decisões automatizadas e oposição a tratamentos baseados em legítimo interesse.</li></ul>",
        `<p>Se os seus dados foram inseridos por uma empresa que usa o S.P.Y. (por exemplo, você é lead ou cliente dela), a controladora é essa empresa — dirija o pedido a ela. Nós a apoiamos com ferramentas dentro da plataforma, como busca, exportação e anonimização de registros por titular e registro de consentimentos. Para os demais casos, fale com a gente ${contato}. Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).</p>`,
      ],
    },
    {
      id: "seguranca",
      title: "10. Como protegemos os dados",
      html: [
        "<p>Adotamos medidas técnicas e organizacionais proporcionais ao risco, entre elas:</p>",
        "<ul><li>tráfego protegido por HTTPS/TLS;</li><li>isolamento lógico dos dados de cada empresa cliente no banco de dados, com regras de acesso por empresa;</li><li>controle de acesso por perfil e autenticação de usuários;</li><li>registros de auditoria de ações relevantes e limites de requisição contra abuso;</li><li>segregação de credenciais de integrações e acesso restrito a segredos de servidor.</li></ul>",
        "<p>Nenhum sistema é totalmente imune a incidentes. Em caso de incidente de segurança que possa gerar risco ou dano relevante, comunicaremos os afetados e a ANPD nos termos do art. 48 da LGPD.</p>",
      ],
    },
    {
      id: "cookies",
      title: "11. Cookies e armazenamento no navegador",
      html: [
        "<p>Usamos apenas armazenamento essencial: manter sua sessão após o login, lembrar preferências como o tema de cores e proteger a aplicação. Nas páginas públicas não utilizamos cookies de publicidade nem ferramentas de rastreamento de terceiros. Você pode limpar o armazenamento do navegador a qualquer momento, o que pode exigir novo login.</p>",
      ],
    },
    {
      id: "criancas",
      title: "12. Crianças e adolescentes",
      html: [
        "<p>O S.P.Y. é destinado a empresas e profissionais e não é dirigido a menores de 18 anos. Não coletamos intencionalmente dados de crianças e adolescentes.</p>",
      ],
    },
    {
      id: "alteracoes",
      title: "13. Alterações desta Política",
      html: [
        "<p>Podemos atualizar esta Política para refletir mudanças no serviço ou na legislação. A data da última atualização está sempre no topo desta página; mudanças relevantes serão comunicadas por meios adequados.</p>",
      ],
    },
    {
      id: "contato",
      title: "14. Fale com a gente",
      html: [
        `<p>Dúvidas, pedidos de titulares ou questões de privacidade: fale conosco ${contato}.</p>`,
        empresa,
      ],
    },
  ],
};
