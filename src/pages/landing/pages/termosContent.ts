import type { DocContent } from "./docTypes";

const COMPANY = { razaoSocial: "PLUPPEX DIGITAL MACHINES LTDA - ME", cnpj: "61.542.757/0001-00" };
const company = COMPANY.razaoSocial || COMPANY.cnpj ? `<p>${COMPANY.razaoSocial}${COMPANY.razaoSocial && COMPANY.cnpj ? " — " : ""}${COMPANY.cnpj ? `CNPJ ${COMPANY.cnpj}` : ""}</p>` : "";

export const TERMOS: DocContent = {
  slug: "termos",
  metaTitle: "Termos de Uso — S.P.Y.",
  metaDescription: "Condições de uso do S.P.Y. (spycrm.com.br), plataforma de gestão comercial e operacional multiempresa com a assistente de IA Aurora.",
  title: "Termos de Uso",
  intro: "As regras para usar o S.P.Y. e as páginas públicas do site, escritas de forma direta.",
  updated: "8 de novembro de 2026",
  sections: [
    {
      id: "aceitacao",
      title: "1. Aceitação dos termos",
      html: [
      "<p>Estes Termos de Uso regulam o acesso e a utilização do S.P.Y. e de suas páginas públicas. Ao acessar o site, enviar um formulário ou usar a plataforma, você declara que leu e concorda com estes Termos e com a Política de Privacidade. Se você utiliza o S.P.Y. em nome de uma empresa, declara ter poderes para vinculá-la.</p>",
      "<p>Se não concordar com algum ponto, não utilize o serviço.</p>",
      ],
    },
    {
      id: "servico",
      title: "2. Descrição do serviço",
      html: [
      "<p>O S.P.Y. é uma plataforma de gestão comercial e operacional multiempresa. Reúne CRM e pipeline de vendas, propostas e contratos, agenda e tarefas, financeiro e outros módulos, incluindo módulos específicos por segmento, além da Aurora, uma assistente de inteligência artificial.</p>",
      "<p>Os módulos disponíveis para cada empresa dependem do plano e das condições combinadas na proposta ou no contrato. Funcionalidades podem ser evoluídas, ajustadas ou descontinuadas ao longo do tempo.</p>",
      "<p><strong>Conexão com o WhatsApp.</strong> A integração com o WhatsApp usa uma conexão não oficial, feita por leitura de QR Code (como no WhatsApp Web), e não a API oficial da Meta. Por isso o WhatsApp pode, a seu critério e sem aviso prévio, limitar ou banir números, principalmente em caso de envio em massa, mensagens para quem não conhece o seu número ou denúncias de spam. O S.P.Y. não controla essas decisões e não garante a disponibilidade da conexão. Recomendamos usar a integração para atendimento e relacionamento com pessoas que já têm contato com a empresa, respeitar as regras do WhatsApp e evitar números que não possam ser perdidos.</p>",
      ],
    },
    {
      id: "cadastro",
      title: "3. Cadastro e conta",
      html: [
      "<p>O acesso à plataforma é concedido pela equipe do S.P.Y. durante a implantação, em ambiente próprio de cada empresa. Você se compromete a:</p>",
      "<ul><li>fornecer informações verdadeiras e mantê-las atualizadas;</li><li>guardar suas credenciais com sigilo e não compartilhá-las;</li><li>comunicar imediatamente qualquer uso não autorizado da sua conta;</li><li>gerenciar, no caso da empresa cliente, quem tem acesso ao ambiente e com quais permissões.</li></ul>",
      "<p>A empresa cliente responde pelas ações realizadas por seus usuários na plataforma.</p>",
      ],
    },
    {
      id: "uso",
      title: "4. Uso permitido e proibido",
      html: [
      "<p>Você pode usar o S.P.Y. para as atividades comerciais e operacionais legítimas da sua empresa. É proibido:</p>",
      "<ul><li>usar o serviço para fins ilícitos ou que violem direitos de terceiros;</li><li>inserir dados pessoais sem ter base legal adequada para tratá-los;</li><li>tentar acessar áreas, contas ou dados de outras empresas, ou burlar controles de segurança e limites de uso;</li><li>copiar, revender, fazer engenharia reversa ou criar obras derivadas da plataforma, salvo se a lei permitir;</li><li>enviar mensagens em massa não solicitadas ou praticar qualquer abuso dos canais conectados.</li></ul>",
      "<p><strong>Mensagens enviadas pela sua empresa.</strong> A empresa cliente é a única responsável pelo conteúdo e pelo destino das mensagens que envia pelos canais conectados, inclusive o WhatsApp. Isso inclui ter base legal (como consentimento ou relacionamento prévio) para contatar cada pessoa, oferecer uma forma simples de deixar de receber mensagens, atender prontamente a esse pedido e cumprir as políticas do WhatsApp e a legislação aplicável, como a LGPD e o Código de Defesa do Consumidor.</p>",
      "<p>O descumprimento pode levar à suspensão do acesso, sem prejuízo de outras medidas cabíveis.</p>",
      ],
    },
    {
      id: "dados",
      title: "5. Dados e privacidade",
      html: [
      "<p>O tratamento de dados pessoais segue a nossa <a href=\"/privacidade\">Política de Privacidade</a>. Em relação aos dados que a empresa cliente insere na plataforma, como leads, clientes, propostas e lançamentos financeiros, a empresa cliente é a controladora e define as finalidades do tratamento. O S.P.Y. atua como operador, tratando esses dados apenas para prestar o serviço contratado.</p>",
      "<p>Cabe à empresa cliente informar seus titulares e manter a base legal adequada para os dados que registra.</p>",
      ],
    },
    {
      id: "ia",
      title: "6. Uso de inteligência artificial",
      html: [
      "<p>A Aurora, a assistente de IA da plataforma, gera respostas, resumos, classificações e sugestões a partir dos dados da sua empresa, usando provedores de IA de terceiros (OpenAI, Google Gemini e Groq), conforme a Política de Privacidade. A resposta automática a clientes finais e outras funções de IA fora da Aurora ficam desligadas por padrão. Esse conteúdo pode conter imprecisões e deve ser revisado por uma pessoa antes de orientar decisões importantes.</p>",
      "<ul><li>o uso de IA está sujeito a um teto definido por empresa;</li><li>a empresa pode, opcionalmente, utilizar a sua própria chave de API de provedor compatível;</li><li>a empresa escolhe quais agentes de IA ficam ligados no seu ambiente.</li></ul>",
      ],
    },
    {
      id: "contratacao",
      title: "7. Contratação e pagamento",
      html: [
      "<p><strong>Contratação pelo checkout.</strong> A assinatura pode ser contratada pelo checkout do site: você informa os dados do contratante (nome, telefone, e-mail, CPF ou CNPJ e empresa), aceita estes Termos e a Política de Privacidade, escolhe o plano e paga por <strong>Pix</strong>, anexando o comprovante. O pagamento é <strong>conferido e confirmado manualmente</strong> pela equipe do S.P.Y.; o acesso à plataforma é liberado somente <strong>após essa confirmação</strong>, e os dados de acesso são enviados ao e-mail informado.</p>",
      "<p><strong>Renovação e falta de pagamento.</strong> A assinatura é renovada mensalmente, também por Pix e com confirmação manual (o aviso e o link de renovação são enviados por e-mail, cerca de 5 dias antes do vencimento, no vencimento e após o atraso). Vencido o período sem pagamento, a assinatura passa a constar como em atraso e, após o prazo de carência — padrão de 7 dias corridos, que pode ser ajustado por conta —, o acesso é suspenso. Enquanto suspenso, o uso da plataforma fica bloqueado até a regularização; após o pagamento ser confirmado, o acesso é reativado. Multa, juros, fidelidade, cancelamento e reajuste, quando houver, constam da proposta ou do contrato. [REVISAR pelo advogado: adequação da régua de atraso e suspensão, e do acesso aos dados durante a suspensão.]</p>",
      "<p>As condições comerciais, como plano, valores, implantação, forma e data de pagamento, são definidas na proposta e no contrato firmados com a empresa cliente. Em caso de divergência, prevalecem as condições do contrato.</p>",
      "<p>Valores apresentados em páginas públicas têm caráter informativo e podem ser atualizados. Condições adicionais de cancelamento, reajuste e demais obrigações financeiras constam do contrato aplicável.</p>",
      ],
    },
    {
      id: "disponibilidade",
      title: "8. Disponibilidade e suporte",
      html: [
      "<p>Trabalhamos para manter o serviço disponível e seguro, mas não garantimos que ele será ininterrupto ou livre de erros. Manutenções, atualizações e falhas de terceiros, como provedores de infraestrutura, internet e integrações, podem causar indisponibilidades.</p>",
      "<p>O suporte é prestado pela equipe do S.P.Y. pelos canais informados à empresa cliente, conforme o que foi contratado.</p>",
      ],
    },
    {
      id: "propriedade",
      title: "9. Propriedade intelectual",
      html: [
      "<p>O S.P.Y., sua marca, código, interface, documentação e demais elementos pertencem ao S.P.Y. ou a seus licenciantes. O contrato concede à empresa cliente apenas o direito de uso da plataforma durante a vigência, de forma não exclusiva e intransferível.</p>",
      "<p>Os dados e conteúdos que a empresa cliente insere permanecem de sua titularidade.</p>",
      ],
    },
    {
      id: "responsabilidade",
      title: "10. Limitação de responsabilidade",
      html: [
      "<p>Em especial, o S.P.Y. não responde por limitação, suspensão ou banimento de números de WhatsApp, nem por perda de conversas, contatos ou oportunidades decorrentes disso, uma vez que essas decisões cabem exclusivamente ao WhatsApp e a conexão utilizada não é a oficial (ver seção 2).</p>",
      "<p>Na extensão permitida pela lei, o S.P.Y. não responde por danos indiretos, lucros cessantes ou perdas decorrentes de uso inadequado da plataforma, de decisões tomadas com base em conteúdo gerado por IA, de falhas de serviços de terceiros ou de informações incorretas inseridas pelo usuário.</p>",
      "<p>Nada nestes Termos limita responsabilidades que não possam ser limitadas por lei, nem direitos assegurados pelo Código de Defesa do Consumidor, quando aplicável.</p>",
      ],
    },
    {
      id: "vigencia",
      title: "11. Vigência e rescisão",
      html: [
      "<p>Estes Termos vigoram enquanto você acessar o site ou utilizar a plataforma. A relação contratual com a empresa cliente segue o prazo e as condições de rescisão previstos no contrato firmado.</p>",
      "<p>Podemos suspender ou encerrar o acesso em caso de violação destes Termos ou do contrato. Após o encerramento, os dados são tratados conforme a Política de Privacidade e o que foi combinado em contrato.</p>",
      ],
    },
    {
      id: "alteracoes",
      title: "12. Alterações dos termos",
      html: [
      "<p>Podemos atualizar estes Termos para refletir mudanças no serviço ou na legislação. A data da última atualização fica no topo desta página, e mudanças relevantes serão comunicadas por meios adequados. O uso continuado após a atualização indica concordância com a nova versão.</p>",
      ],
    },
    {
      id: "foro",
      title: "13. Legislação e foro",
      html: [
      "<p>Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o Foro da Comarca da sede da Contratada para dirimir quaisquer dúvidas ou litígios oriundos destes Termos, com renúncia expressa a qualquer outro, por mais privilegiado que seja.</p>",
      ],
    },
    {
      id: "contato",
      title: "14. Contato",
      html: [
      "<p>Dúvidas sobre estes Termos? Fale com a gente pela <a href=\"/contato\">página de contato</a>.</p>",
      company,
      ],
    },
  ],
};
