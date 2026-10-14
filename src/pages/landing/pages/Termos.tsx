import { Link } from "react-router-dom";
import { InstitutionalPage } from "./InstitutionalPage";
import type { Sec } from "./InstitutionalPage";

/** Dados da empresa contratada. Campos vazios são omitidos. */
const COMPANY = {
  razaoSocial: "",
  cnpj: "",
};

const LAST_UPDATE = "14 de outubro de 2026";

const SECTIONS: Sec[] = [
  {
    id: "aceitacao",
    title: "1. Aceitação dos termos",
    blocks: [
      { type: "p", text: "Estes Termos de Uso regulam o acesso e a utilização do S.P.Y. e de suas páginas públicas. Ao acessar o site, enviar um formulário ou usar a plataforma, você declara que leu e concorda com estes Termos e com a Política de Privacidade. Se você utiliza o S.P.Y. em nome de uma empresa, declara ter poderes para vinculá-la." },
      { type: "p", text: "Se não concordar com algum ponto, não utilize o serviço." },
    ],
  },
  {
    id: "servico",
    title: "2. Descrição do serviço",
    blocks: [
      { type: "p", text: "O S.P.Y. é uma plataforma de gestão comercial e operacional multiempresa. Reúne CRM e pipeline de vendas, propostas e contratos, agenda e tarefas, financeiro e outros módulos, incluindo módulos específicos por segmento, além da Aurora, uma assistente de inteligência artificial." },
      { type: "p", text: "Os módulos disponíveis para cada empresa dependem do plano e das condições combinadas na proposta ou no contrato. Funcionalidades podem ser evoluídas, ajustadas ou descontinuadas ao longo do tempo." },
    ],
  },
  {
    id: "cadastro",
    title: "3. Cadastro e conta",
    blocks: [
      { type: "p", text: "O acesso à plataforma é concedido pela equipe do S.P.Y. durante a implantação, em ambiente próprio de cada empresa. Você se compromete a:" },
      { type: "ul", items: [
        "fornecer informações verdadeiras e mantê-las atualizadas;",
        "guardar suas credenciais com sigilo e não compartilhá-las;",
        "comunicar imediatamente qualquer uso não autorizado da sua conta;",
        "gerenciar, no caso da empresa cliente, quem tem acesso ao ambiente e com quais permissões.",
      ] },
      { type: "p", text: "A empresa cliente responde pelas ações realizadas por seus usuários na plataforma." },
    ],
  },
  {
    id: "uso",
    title: "4. Uso permitido e proibido",
    blocks: [
      { type: "p", text: "Você pode usar o S.P.Y. para as atividades comerciais e operacionais legítimas da sua empresa. É proibido:" },
      { type: "ul", items: [
        "usar o serviço para fins ilícitos ou que violem direitos de terceiros;",
        "inserir dados pessoais sem ter base legal adequada para tratá-los;",
        "tentar acessar áreas, contas ou dados de outras empresas, ou burlar controles de segurança e limites de uso;",
        "copiar, revender, fazer engenharia reversa ou criar obras derivadas da plataforma, salvo se a lei permitir;",
        "enviar mensagens em massa não solicitadas ou praticar qualquer abuso dos canais conectados.",
      ] },
      { type: "p", text: "O descumprimento pode levar à suspensão do acesso, sem prejuízo de outras medidas cabíveis." },
    ],
  },
  {
    id: "dados",
    title: "5. Dados e privacidade",
    blocks: [
      { type: "p", text: <>O tratamento de dados pessoais segue a nossa <Link to="/privacidade">Política de Privacidade</Link>. Em relação aos dados que a empresa cliente insere na plataforma, como leads, clientes, propostas e lançamentos financeiros, a empresa cliente é a controladora e define as finalidades do tratamento. O S.P.Y. atua como operador, tratando esses dados apenas para prestar o serviço contratado.</> },
      { type: "p", text: "Cabe à empresa cliente informar seus titulares e manter a base legal adequada para os dados que registra." },
    ],
  },
  {
    id: "ia",
    title: "6. Uso de inteligência artificial",
    blocks: [
      { type: "p", text: "A Aurora e os demais recursos de IA geram respostas, resumos, classificações e sugestões a partir dos dados da sua empresa. Esse conteúdo pode conter imprecisões e deve ser revisado por uma pessoa antes de orientar decisões importantes." },
      { type: "ul", items: [
        "o uso de IA está sujeito a um teto definido por empresa;",
        "a empresa pode, opcionalmente, utilizar a sua própria chave de API de provedor compatível;",
        "a empresa escolhe quais agentes de IA ficam ligados no seu ambiente.",
      ] },
    ],
  },
  {
    id: "contratacao",
    title: "7. Contratação e pagamento",
    blocks: [
      { type: "p", text: "As condições comerciais, como plano, valores, implantação, forma e data de pagamento, são definidas na proposta e no contrato firmados com a empresa cliente. Em caso de divergência, prevalecem as condições do contrato." },
      { type: "p", text: "Valores apresentados em páginas públicas têm caráter informativo e podem ser atualizados. Condições adicionais de cancelamento, reajuste e demais obrigações financeiras constam do contrato aplicável." },
    ],
  },
  {
    id: "disponibilidade",
    title: "8. Disponibilidade e suporte",
    blocks: [
      { type: "p", text: "Trabalhamos para manter o serviço disponível e seguro, mas não garantimos que ele será ininterrupto ou livre de erros. Manutenções, atualizações e falhas de terceiros, como provedores de infraestrutura, internet e integrações, podem causar indisponibilidades." },
      { type: "p", text: "O suporte é prestado pela equipe do S.P.Y. pelos canais informados à empresa cliente, conforme o que foi contratado." },
    ],
  },
  {
    id: "propriedade",
    title: "9. Propriedade intelectual",
    blocks: [
      { type: "p", text: "O S.P.Y., sua marca, código, interface, documentação e demais elementos pertencem ao S.P.Y. ou a seus licenciantes. O contrato concede à empresa cliente apenas o direito de uso da plataforma durante a vigência, de forma não exclusiva e intransferível." },
      { type: "p", text: "Os dados e conteúdos que a empresa cliente insere permanecem de sua titularidade." },
    ],
  },
  {
    id: "responsabilidade",
    title: "10. Limitação de responsabilidade",
    blocks: [
      { type: "p", text: "Na extensão permitida pela lei, o S.P.Y. não responde por danos indiretos, lucros cessantes ou perdas decorrentes de uso inadequado da plataforma, de decisões tomadas com base em conteúdo gerado por IA, de falhas de serviços de terceiros ou de informações incorretas inseridas pelo usuário." },
      { type: "p", text: "Nada nestes Termos limita responsabilidades que não possam ser limitadas por lei, nem direitos assegurados pelo Código de Defesa do Consumidor, quando aplicável." },
    ],
  },
  {
    id: "vigencia",
    title: "11. Vigência e rescisão",
    blocks: [
      { type: "p", text: "Estes Termos vigoram enquanto você acessar o site ou utilizar a plataforma. A relação contratual com a empresa cliente segue o prazo e as condições de rescisão previstos no contrato firmado." },
      { type: "p", text: "Podemos suspender ou encerrar o acesso em caso de violação destes Termos ou do contrato. Após o encerramento, os dados são tratados conforme a Política de Privacidade e o que foi combinado em contrato." },
    ],
  },
  {
    id: "alteracoes",
    title: "12. Alterações dos termos",
    blocks: [
      { type: "p", text: "Podemos atualizar estes Termos para refletir mudanças no serviço ou na legislação. A data da última atualização fica no topo desta página, e mudanças relevantes serão comunicadas por meios adequados. O uso continuado após a atualização indica concordância com a nova versão." },
    ],
  },
  {
    id: "foro",
    title: "13. Legislação e foro",
    blocks: [
      { type: "p", text: "Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o Foro da Comarca da sede da Contratada para dirimir quaisquer dúvidas ou litígios oriundos destes Termos, com renúncia expressa a qualquer outro, por mais privilegiado que seja." },
    ],
  },
  {
    id: "contato",
    title: "14. Contato",
    blocks: [
      { type: "p", text: <>Dúvidas sobre estes Termos? Fale com a gente pela <Link to="/contato">página de contato</Link>.</> },
      ...(COMPANY.razaoSocial || COMPANY.cnpj
        ? [{ type: "p" as const, text: <>{COMPANY.razaoSocial}{COMPANY.razaoSocial && COMPANY.cnpj ? " — " : ""}{COMPANY.cnpj ? `CNPJ ${COMPANY.cnpj}` : ""}</> }]
        : []),
    ],
  },
];

export default function Termos() {
  return (
    <InstitutionalPage
      metaTitle="Termos de Uso — S.P.Y."
      metaDescription="Condições de uso do S.P.Y., plataforma de gestão comercial e operacional multiempresa com a assistente de IA Aurora."
      title="Termos de Uso"
      intro="As regras para usar o S.P.Y. e as páginas públicas do site, escritas de forma direta."
      updated={LAST_UPDATE}
      sections={SECTIONS}
    />
  );
}
