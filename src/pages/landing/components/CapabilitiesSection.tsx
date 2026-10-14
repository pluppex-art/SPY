import { rv } from "../reveal";
import { ProductShot } from "./ProductShot";
import {
  Columns3,
  Radar,
  FileText,
  Users,
  Mail,
  Zap,
  CalendarDays,
  CheckSquare,
  Wallet,
  BarChart3,
  FolderOpen,
  UserCog,
} from "lucide-react";

const FLOW = [
  ["Lead", "Entra por formulário, WhatsApp ou cadastro."],
  ["Proposta", "Gerada a partir do lead, com o catálogo de produtos."],
  ["Contrato", "Acompanhado até a assinatura."],
  ["Financeiro", "Ao assinar, a fatura e o lançamento já nascem no financeiro."],
];

const GROUPS = [
  {
    title: "Vender",
    intro: "O núcleo do sistema: o ciclo comercial do primeiro contato ao contrato.",
    items: [
      [Columns3, "Leads & Pipeline", "Funil de vendas com o histórico de cada lead."],
      [Radar, "Radar", "Oportunidades que pedem ação do time."],
      [FileText, "Propostas Comerciais", "Do orçamento ao contrato, no mesmo lugar."],
      [Users, "Base de Clientes", "Quem já comprou, com o histórico completo."],
    ],
  },
  {
    title: "Atender",
    intro: "A rotina da equipe no dia a dia.",
    items: [
      [Mail, "Mensageria omnichannel", "Conversas com clientes dentro do CRM."],
      [Zap, "Automações", "Regras que cuidam do que é repetitivo."],
      [CalendarDays, "Agenda e reuniões", "Calendário geral e salas de reunião."],
      [CheckSquare, "Tarefas e projetos", "O que cada pessoa precisa entregar."],
    ],
  },
  {
    title: "Controlar",
    intro: "A visão do gestor sobre o resultado.",
    items: [
      [Wallet, "Financeiro", "Contas a pagar e a receber, DRE e comissões."],
      [BarChart3, "BI e relatórios", "Indicadores, performance do SDR e relatórios executivos."],
      [FolderOpen, "Catálogo de produtos", "Produtos e serviços usados nas propostas."],
      [UserCog, "Equipe e RH", "Colaboradores e permissões de acesso."],
    ],
  },
] as const;

export function CapabilitiesSection() {
  return (
    <section id="recursos" className="sp-section" aria-labelledby="sp-recursos-title">
      <div className="sp-wrap">
        <h2 id="sp-recursos-title" className="sp-h2" {...rv()}>
          O ciclo comercial inteiro, ligado de ponta a ponta.
        </h2>
        <p className="sp-lede" {...rv(1)}>
          Vendas, atendimento e financeiro compartilham a mesma base de dados. O que acontece no pipeline chega ao
          financeiro sem digitar duas vezes.
        </p>

        <ol className="sp-flow" aria-label="Ciclo comercial">
          {FLOW.map(([name, text], i) => (
            <li key={name} {...rv(i)}>
              <strong>{name}</strong>
              <span>{text}</span>
            </li>
          ))}
        </ol>

        <div className="sp-groups">
          {GROUPS.map((g, i) => (
            <div className="sp-group" key={g.title} {...rv(i)}>
              <h3>{g.title}</h3>
              <p>{g.intro}</p>
              <dl>
                {g.items.map(([Icon, name, desc]) => (
                  <div key={name}>
                    <dt>
                      <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
                      {name}
                    </dt>
                    <dd>{desc}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>

        <ProductShot slot="financeiro" className="sp-shot--wide" alt="Painel financeiro do S.P.Y." />
      </div>
    </section>
  );
}
