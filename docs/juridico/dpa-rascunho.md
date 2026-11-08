# Contrato de Tratamento de Dados Pessoais (DPA)

> **RASCUNHO — não é aconselhamento jurídico — exige revisão de advogado.**
> Os marcadores **[REVISAR]** indicam escolhas jurídicas que cabem ao advogado. As descrições técnicas refletem o que o sistema faz hoje (revisão de 8/nov/2026); confirmar com a equipe técnica antes de assinar.

## Partes

- **CONTROLADORA:** [REVISAR: razão social, CNPJ e endereço da empresa cliente], doravante "Controladora".
- **OPERADORA:** PLUPPEX DIGITAL MACHINES LTDA - ME, CNPJ 61.542.757/0001-00, [REVISAR: endereço e representante], titular da plataforma S.P.Y. (spycrm.com.br), doravante "Operadora".

Este instrumento integra o contrato/proposta de prestação do serviço S.P.Y. e, havendo conflito sobre proteção de dados, prevalece sobre ele. [REVISAR: hierarquia entre documentos.]

## 1. Objeto e definições

1.1. Este contrato regula o tratamento de dados pessoais pela Operadora, em nome da Controladora, na prestação do serviço S.P.Y. (CRM, propostas e contratos, agenda, tarefas, financeiro, assistente de IA Aurora e integrações), nos termos da Lei nº 13.709/2018 (LGPD). [REVISAR]

1.2. Os termos "dado pessoal", "titular", "controlador", "operador", "tratamento" e "incidente" têm o sentido da LGPD.

1.3. **Dados tratados:** dados de leads, clientes e contatos da Controladora, histórico de relacionamento, propostas, contratos, lançamentos financeiros, reuniões (notas, transcrições), tarefas, conversas de canais conectados (ex.: WhatsApp) e dados de usuários da Controladora (nome, e-mail, registros de acesso). [REVISAR: lista final, categorias de titulares e eventual dado sensível.]

1.4. **Papéis:** a Controladora decide as finalidades e os meios essenciais; a Operadora trata os dados apenas para prestar o serviço contratado. Quanto aos dados de cadastro, cobrança e acesso do próprio contratante, a Operadora atua como controladora, conforme sua Política de Privacidade. [REVISAR]

## 2. Instruções do controlador

2.1. A Operadora tratará os dados somente conforme as instruções documentadas da Controladora: este contrato, o contrato/proposta, a configuração do ambiente e o uso das funcionalidades pelos usuários da Controladora.

2.2. A Operadora informará a Controladora se entender que uma instrução viola a LGPD. [REVISAR]

2.3. A Controladora é responsável por ter base legal para os dados que insere (inclusive para contatar pessoas por canais como o WhatsApp), por informar os titulares e por gerir quem tem acesso ao seu ambiente.

2.4. Recursos de IA fora da Aurora (inclusive resposta automática a clientes finais) ficam desligados por padrão e só tratam dados se a Controladora os ativar.

## 3. Confidencialidade

3.1. A Operadora garante que as pessoas autorizadas a tratar os dados estejam sujeitas a dever de confidencialidade. [REVISAR: forma (contrato de trabalho, NDA).]

3.2. A equipe da Operadora não acessa o conteúdo dos dados da Controladora, exceto para suporte com autorização, investigação de incidente ou abuso, cumprimento de obrigação legal ou em forma agregada/anonimizada. [REVISAR]

## 4. Medidas de segurança

4.1. A Operadora adota medidas técnicas e administrativas proporcionais ao risco, hoje incluindo:

- isolamento lógico dos dados de cada empresa no banco de dados (RLS, Row Level Security, por empresa);
- criptografia em trânsito (HTTPS/TLS);
- controle de acesso por perfil e autenticação de usuários, com autenticação em dois fatores (MFA) **opcional**;
- registros de auditoria de ações relevantes e limites de requisição contra abuso;
- segregação de credenciais de integrações e segredos mantidos apenas no servidor;
- armazenamento privado para arquivos sensíveis (ex.: comprovantes), com acesso por link temporário;
- limite de uso de IA por empresa.

4.2. [REVISAR: incluir ou não criptografia em repouso, backups, política de retenção de logs e plano de continuidade — confirmar com a equipe técnica o que é garantido pelos fornecedores e o que é compromisso contratual.]

## 5. Suboperadores

5.1. A Controladora autoriza a contratação dos suboperadores abaixo, com obrigações equivalentes às deste contrato: [REVISAR: autorização geral ou específica]

| Suboperador | Função | Localização informada |
|---|---|---|
| Supabase | banco de dados, autenticação, armazenamento de arquivos | EUA (região us-west-2) |
| Vercel | hospedagem da aplicação | [REVISAR: confirmar] |
| OpenAI, Google (Gemini), Groq | modelos de IA usados pela Aurora (ordem de tentativa nesta sequência) | [REVISAR: confirmar] |
| n8n | automações e agentes de implantação | [REVISAR: confirmar se nuvem ou hospedagem própria e local] |
| Provedor de e-mail (SMTP) | envio de e-mails do serviço | [REVISAR: identificar provedor e local] |
| WAHA (gateway de WhatsApp, conexão não oficial) | integração de mensagens, quando ativada | [REVISAR: confirmar] |
| Google (Agenda, Tarefas, Meet) | integrações, quando a Controladora as conecta | [REVISAR: confirmar] |

5.2. A Operadora comunicará a inclusão ou substituição de suboperadores com antecedência de [REVISAR: prazo] dias, podendo a Controladora se opor de forma justificada. [REVISAR: consequência da oposição.]

## 6. Transferência internacional

6.1. A Controladora reconhece que há tratamento fora do Brasil, em especial nos Estados Unidos (banco de dados e provedores de IA). A Operadora adotará mecanismo previsto nos arts. 33 e seguintes da LGPD. [REVISAR: mecanismo aplicável (ex.: cláusulas-padrão da ANPD) e verificação de cada fornecedor.]

## 7. Direitos dos titulares

7.1. A Operadora auxiliará a Controladora a atender os pedidos dos titulares (art. 18 da LGPD), com as ferramentas da plataforma (busca, exportação e anonimização por titular, registro de consentimentos).

7.2. Pedidos recebidos diretamente pela Operadora e relativos a dados tratados em nome da Controladora serão encaminhados à Controladora em até [REVISAR: prazo] dias úteis, sem resposta de mérito, salvo determinação legal.

## 8. Incidentes de segurança

8.1. A Operadora comunicará a Controladora, sem demora indevida e em até [REVISAR: prazo, ex.: 48 horas] após tomar ciência de incidente que afete os dados da Controladora, informando, no que for conhecido: natureza, dados e titulares afetados, medidas adotadas e riscos.

8.2. A comunicação à ANPD e aos titulares (art. 48 da LGPD) cabe à Controladora; a Operadora cooperará. [REVISAR: divisão de responsabilidades.]

## 9. Devolução e exclusão

9.1. Encerrado o contrato, a Operadora, a critério da Controladora, devolverá os dados em formato [REVISAR: formato] ou os eliminará em até [REVISAR: prazo] dias, salvo guarda exigida por lei ou necessária ao exercício regular de direitos. [REVISAR]

9.2. Durante suspensão por falta de pagamento, o acesso fica bloqueado e os dados são mantidos; prazo máximo de guarda e momento da exclusão: [REVISAR]. Backups serão eliminados no ciclo regular de [REVISAR: prazo].

## 10. Auditoria e prestação de contas

10.1. A Operadora fornecerá, mediante pedido, informações necessárias para demonstrar conformidade com este contrato. Auditorias presenciais ou por terceiros dependem de aviso prévio de [REVISAR: prazo], sigilo, frequência máxima de [REVISAR] e custo por conta da Controladora. [REVISAR]

## 11. Responsabilidade

11.1. [REVISAR: responsabilidade de cada parte, limites e relação com a cláusula de limitação do contrato principal.]

## 12. Vigência, lei e foro

12.1. Este contrato vigora enquanto durar o tratamento. Lei brasileira; foro: [REVISAR].

Local e data: [REVISAR]

CONTROLADORA: ______________________  OPERADORA: ______________________
