import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Logo } from "../../components/ui/Logo";
import { FooterSection } from "./FooterSection";
import { LpThemeProvider, useLpTheme } from "./theme/LpThemeContext";
import { FONT_BODY, FONT_DISPLAY } from "./shared";
import type { LpTheme } from "./theme/LP_THEMES";

/**
 * Dados da empresa responsável. Preencha quando quiser exibi-los na página —
 * campos vazios são omitidos (a página orienta o contato pelo formulário do site).
 */
const COMPANY = {
  razaoSocial: "",
  cnpj: "",
  emailPrivacidade: "",
};

const LAST_UPDATE = "6 de outubro de 2026";
const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Archivo:wght@600;700;800;900&display=swap";
const VALID_THEMES: LpTheme["id"][] = ["blue", "purple", "orange", "green"];

type Block = { type: "p"; text: ReactNode } | { type: "ul"; items: ReactNode[] };
interface Sec { id: string; title: string; blocks: Block[] }

const contatoTexto = COMPANY.emailPrivacidade
  ? <>pelo e-mail <a className="underline underline-offset-2 font-semibold" href={`mailto:${COMPANY.emailPrivacidade}`}>{COMPANY.emailPrivacidade}</a> ou pelo formulário de contato do site</>
  : <>pelo <Link className="underline underline-offset-2 font-semibold" to="/lp#contato">formulário de contato do site</Link></>;

const SECTIONS: Sec[] = [
  {
    id: "quem-somos",
    title: "1. Quem somos e quais são os nossos papéis",
    blocks: [
      { type: "p", text: "O S.P.Y. é uma plataforma de gestão comercial e operacional (CRM, propostas, contratos, agenda, tarefas, financeiro e assistente de inteligência artificial chamada Aurora), disponibilizada em spycrm.com.br. Esta Política explica como tratamos dados pessoais, em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD)." },
      { type: "p", text: "Atuamos em dois papéis distintos:" },
      { type: "ul", items: [
        <><strong>Controlador</strong> dos dados de visitantes do nosso site e dos dados de cadastro e acesso dos usuários da plataforma (por exemplo, nome, e-mail e registros de login).</>,
        <><strong>Operador</strong> dos dados que as empresas clientes inserem na plataforma sobre os seus próprios leads, clientes, contatos, propostas, reuniões, tarefas e mensagens. Nesse caso, a empresa cliente é a controladora e define as finalidades; nós tratamos os dados apenas para prestar o serviço contratado.</>,
      ] },
    ],
  },
  {
    id: "dados",
    title: "2. Quais dados tratamos",
    blocks: [
      { type: "p", text: "Dependendo de como você interage com o S.P.Y., podemos tratar as categorias abaixo:" },
      { type: "ul", items: [
        <><strong>Visitantes do site:</strong> nome, empresa, WhatsApp, e-mail e as informações que você escolher nos enviar em formulários de contato.</>,
        <><strong>Usuários da plataforma:</strong> nome, e-mail, credenciais de acesso (a senha é gerenciada por serviço de autenticação, nunca armazenada em texto aberto), cargo e departamento, empresa à qual pertence, preferências de uso e registros de atividade e de acesso.</>,
        <><strong>Dados inseridos pelas empresas clientes:</strong> informações de leads, clientes e seus contatos, histórico de relacionamento, propostas e contratos, lançamentos financeiros, reuniões (inclusive notas, transcrições e relatórios), tarefas e conversas de canais conectados, como o WhatsApp.</>,
        <><strong>Dados técnicos:</strong> endereço IP, tipo de navegador e dispositivo, datas e horários de acesso, necessários para segurança, prevenção a fraudes e funcionamento do serviço.</>,
        <><strong>Dados de contas conectadas:</strong> quando você autoriza a conexão com o Google (Agenda e Tarefas), tratamos os eventos e as tarefas necessários para sincronizar com a plataforma, dentro das permissões que você concedeu.</>,
      ] },
      { type: "p", text: "Não solicitamos dados pessoais sensíveis (art. 5º, II, da LGPD) como requisito para usar o S.P.Y. Se uma empresa cliente optar por registrar esse tipo de informação, ela é responsável por ter a base legal adequada." },
    ],
  },
  {
    id: "finalidades",
    title: "3. Para que usamos os dados e em quais bases legais",
    blocks: [
      { type: "ul", items: [
        <><strong>Prestar o serviço e executar o contrato</strong> (art. 7º, V): criar e manter contas, autenticar usuários, operar os módulos da plataforma, sincronizar integrações e dar suporte.</>,
        <><strong>Cumprir obrigações legais e regulatórias</strong> (art. 7º, II): guardar registros de acesso e dados fiscais e de cobrança, quando aplicável.</>,
        <><strong>Legítimo interesse</strong> (art. 7º, IX): garantir a segurança da plataforma, prevenir fraudes e abusos, medir o desempenho do serviço e melhorá-lo, sempre respeitando os seus direitos e expectativas.</>,
        <><strong>Consentimento</strong> (art. 7º, I): quando você nos pede contato comercial ou autoriza integrações opcionais, como Google e WhatsApp. Você pode revogá-lo a qualquer momento.</>,
        <><strong>Cobrança e pagamentos</strong>: processar assinaturas e conciliar pagamentos por meio de provedores de pagamento.</>,
      ] },
    ],
  },
  {
    id: "ia",
    title: "4. Inteligência artificial (Aurora)",
    blocks: [
      { type: "p", text: "Os recursos da Aurora — como resumos de reuniões, análise de leads, sugestões de próximos passos e respostas automáticas — enviam o conteúdo estritamente necessário a provedores de modelos de linguagem para gerar a resposta. Esse processamento ocorre sob a configuração da empresa cliente (por exemplo, apenas quando há um agente ativo) e dentro dos limites de uso definidos para cada conta." },
      { type: "p", text: "As sugestões e classificações geradas por IA, incluindo estimativas como pontuação de lead ou sentimento, são apoio à decisão e podem conter imprecisões. Você pode solicitar a revisão de decisões tomadas exclusivamente com base em tratamento automatizado (art. 20 da LGPD) pelos nossos canais de contato." },
    ],
  },
  {
    id: "compartilhamento",
    title: "5. Com quem compartilhamos",
    blocks: [
      { type: "p", text: "Não vendemos dados pessoais. Compartilhamos informações apenas quando necessário para operar o serviço, com prestadores que atuam como suboperadores, sob obrigações de confidencialidade e segurança:" },
      { type: "ul", items: [
        "Infraestrutura, banco de dados e autenticação (Supabase) e hospedagem da aplicação (Vercel);",
        "Provedores de inteligência artificial usados pela Aurora (como Google Gemini e Groq);",
        "Provedores de pagamento (como Mercado Pago), para cobrança e conciliação;",
        "Integrações que você ativa: Google Agenda e Google Tarefas, gateway de WhatsApp e videoconferência (Jitsi);",
        "Fontes tipográficas carregadas do Google Fonts nas páginas públicas, o que pode expor seu endereço IP a esse serviço.",
      ] },
      { type: "p", text: "Também podemos compartilhar dados para cumprir ordem legal ou regulatória, ou para a defesa de direitos em processos. Dentro de cada empresa cliente, os dados ficam isolados dos demais clientes e são acessados apenas por usuários autorizados pela própria empresa." },
    ],
  },
  {
    id: "internacional",
    title: "6. Transferência internacional",
    blocks: [
      { type: "p", text: "Alguns dos nossos prestadores podem processar dados em servidores fora do Brasil. Nesses casos, adotamos as salvaguardas previstas nos arts. 33 e seguintes da LGPD, como cláusulas contratuais e a escolha de fornecedores com padrões reconhecidos de segurança e privacidade." },
    ],
  },
  {
    id: "retencao",
    title: "7. Por quanto tempo guardamos os dados",
    blocks: [
      { type: "p", text: "Mantemos os dados pelo tempo necessário para cumprir as finalidades descritas nesta Política, durante a vigência do contrato e pelos prazos legais de guarda (por exemplo, obrigações fiscais e de registro de acesso). Os dados inseridos pela empresa cliente são mantidos conforme as instruções dela; ao encerrar a conta, eles podem ser excluídos ou anonimizados mediante solicitação, ressalvadas as hipóteses de guarda obrigatória." },
    ],
  },
  {
    id: "direitos",
    title: "8. Seus direitos como titular",
    blocks: [
      { type: "p", text: "Nos termos do art. 18 da LGPD, você pode solicitar, a qualquer momento:" },
      { type: "ul", items: [
        "confirmação da existência de tratamento e acesso aos seus dados;",
        "correção de dados incompletos, inexatos ou desatualizados;",
        "anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em desconformidade;",
        "portabilidade dos dados, observados os segredos comercial e industrial;",
        "informação sobre com quem compartilhamos os seus dados;",
        "revogação do consentimento e eliminação dos dados tratados com base nele;",
        "revisão de decisões automatizadas e oposição a tratamentos baseados em legítimo interesse.",
      ] },
      { type: "p", text: <>Se os seus dados foram inseridos por uma empresa que usa o S.P.Y. (por exemplo, você é lead ou cliente dela), a controladora é essa empresa — dirija o pedido a ela. Nós a apoiamos com ferramentas dentro da plataforma, como busca, exportação e anonimização de registros por titular e registro de consentimentos. Para os demais casos, fale com a gente {contatoTexto}. Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).</> },
    ],
  },
  {
    id: "seguranca",
    title: "9. Como protegemos os dados",
    blocks: [
      { type: "p", text: "Adotamos medidas técnicas e organizacionais proporcionais ao risco, entre elas:" },
      { type: "ul", items: [
        "tráfego protegido por HTTPS/TLS;",
        "isolamento lógico dos dados de cada empresa cliente no banco de dados, com regras de acesso por empresa;",
        "controle de acesso por perfil e autenticação de usuários;",
        "registros de auditoria de ações relevantes e limites de requisição contra abuso;",
        "segregação de credenciais de integrações e acesso restrito a segredos de servidor.",
      ] },
      { type: "p", text: "Nenhum sistema é totalmente imune a incidentes. Em caso de incidente de segurança que possa gerar risco ou dano relevante, comunicaremos os afetados e a ANPD nos termos do art. 48 da LGPD." },
    ],
  },
  {
    id: "cookies",
    title: "10. Cookies e armazenamento no navegador",
    blocks: [
      { type: "p", text: "Usamos apenas armazenamento essencial: manter sua sessão após o login, lembrar preferências como o tema de cores e proteger a aplicação. Nas páginas públicas não utilizamos cookies de publicidade nem ferramentas de rastreamento de terceiros. Você pode limpar o armazenamento do navegador a qualquer momento, o que pode exigir novo login." },
    ],
  },
  {
    id: "criancas",
    title: "11. Crianças e adolescentes",
    blocks: [
      { type: "p", text: "O S.P.Y. é destinado a empresas e profissionais e não é dirigido a menores de 18 anos. Não coletamos intencionalmente dados de crianças e adolescentes." },
    ],
  },
  {
    id: "alteracoes",
    title: "12. Alterações desta Política",
    blocks: [
      { type: "p", text: "Podemos atualizar esta Política para refletir mudanças no serviço ou na legislação. A data da última atualização está sempre no topo desta página; mudanças relevantes serão comunicadas por meios adequados." },
    ],
  },
  {
    id: "contato",
    title: "13. Fale com a gente",
    blocks: [
      { type: "p", text: <>Dúvidas, pedidos de titulares ou questões de privacidade: fale conosco {contatoTexto}.</> },
      ...(COMPANY.razaoSocial || COMPANY.cnpj
        ? [{ type: "p" as const, text: <>{COMPANY.razaoSocial}{COMPANY.razaoSocial && COMPANY.cnpj ? " — " : ""}{COMPANY.cnpj ? `CNPJ ${COMPANY.cnpj}` : ""}</> }]
        : []),
    ],
  },
];

function usePrivacySeo() {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = "Política de Privacidade — S.P.Y.";
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const created = !meta;
    if (!meta) { meta = document.createElement("meta"); meta.name = "description"; document.head.appendChild(meta); }
    const prevDesc = meta.getAttribute("content");
    meta.setAttribute("content", "Como o S.P.Y. coleta, usa, compartilha e protege dados pessoais, em conformidade com a LGPD, e como exercer seus direitos como titular.");
    const font = document.createElement("link");
    font.rel = "stylesheet"; font.href = FONTS_HREF;
    document.head.appendChild(font);
    const prevHtml = document.documentElement.style.backgroundColor;
    const prevBody = document.body.style.backgroundColor;
    document.documentElement.style.backgroundColor = "#FFFFFF";
    document.body.style.backgroundColor = "#FFFFFF";
    window.scrollTo({ top: 0 });
    return () => {
      document.title = prevTitle;
      if (created) meta!.remove(); else if (prevDesc !== null) meta!.setAttribute("content", prevDesc);
      font.remove();
      document.documentElement.style.backgroundColor = prevHtml;
      document.body.style.backgroundColor = prevBody;
    };
  }, []);
}

function Content() {
  const { theme } = useLpTheme();
  const [active, setActive] = useState(SECTIONS[0].id);

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-90px 0px -65% 0px" }
    );
    SECTIONS.forEach((s) => { const el = document.getElementById(s.id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-white text-slate-900 antialiased" style={{ fontFamily: FONT_BODY }}>
      <header className="sticky top-0 z-40 bg-white/85 backdrop-blur-xl border-b border-slate-200">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-5 sm:px-8 h-16">
          <Link to="/lp" className="flex items-center gap-2.5" aria-label="S.P.Y. — página inicial">
            <Logo variant="full" size={30} color={theme.logoColor} />
          </Link>
          <Link to="/lp" className="flex items-center gap-1.5 text-[13px] font-medium text-slate-500 hover:text-slate-900 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Voltar ao site
          </Link>
        </div>
      </header>

      <section className="border-b border-slate-200" style={{ background: `linear-gradient(180deg, ${theme.primaryLight} 0%, #ffffff 100%)` }}>
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-14 sm:py-20">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px] font-semibold" style={{ color: theme.primary, background: "#fff", border: `1px solid ${theme.primary}33` }}>
            <ShieldCheck className="w-4 h-4" /> Privacidade e LGPD
          </div>
          <h1 className="mt-5 text-4xl sm:text-5xl font-black tracking-tight" style={{ fontFamily: FONT_DISPLAY }}>
            Política de Privacidade
          </h1>
          <p className="mt-4 max-w-2xl text-base sm:text-lg text-slate-600 leading-relaxed">
            Transparência sobre quais dados tratamos, por que tratamos e como você mantém o controle sobre eles.
          </p>
          <p className="mt-4 text-[13px] text-slate-500">Última atualização: {LAST_UPDATE}</p>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-12 grid lg:grid-cols-[260px_minmax(0,1fr)] gap-12">
        <aside className="hidden lg:block">
          <nav className="sticky top-24" aria-label="Sumário">
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">Nesta página</p>
            <ul className="space-y-1">
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    onClick={(e) => { e.preventDefault(); document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
                    className={`block px-3 py-1.5 rounded-lg text-[13px] leading-snug transition-colors ${active === s.id ? "font-semibold" : "text-slate-500 hover:text-slate-900"}`}
                    style={active === s.id ? { color: theme.primary, background: theme.primaryLight } : undefined}
                  >
                    {s.title.replace(/^\d+\.\s*/, "")}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        <main className="max-w-3xl">
          {SECTIONS.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-24 pb-10 mb-10 border-b border-slate-100 last:border-0">
              <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight mb-4" style={{ fontFamily: FONT_DISPLAY }}>{s.title}</h2>
              <div className="space-y-4 text-[15px] leading-7 text-slate-600">
                {s.blocks.map((b, i) =>
                  b.type === "p" ? (
                    <p key={i}>{b.text}</p>
                  ) : (
                    <ul key={i} className="space-y-2.5">
                      {b.items.map((it, j) => (
                        <li key={j} className="flex gap-3">
                          <span className="mt-2.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: theme.primary }} />
                          <span>{it}</span>
                        </li>
                      ))}
                    </ul>
                  )
                )}
              </div>
            </section>
          ))}
        </main>
      </div>

      <FooterSection />
    </div>
  );
}

export default function PoliticaPrivacidade() {
  usePrivacySeo();
  const urlTheme = (() => {
    try {
      const p = new URLSearchParams(window.location.search).get("theme");
      return p && VALID_THEMES.includes(p as LpTheme["id"]) ? (p as LpTheme["id"]) : undefined;
    } catch { return undefined; }
  })();
  return (
    <LpThemeProvider initialTheme={urlTheme}>
      <Content />
    </LpThemeProvider>
  );
}
