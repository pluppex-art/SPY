import { Link } from "react-router-dom";
import { ShoppingCart, Car, Sun, Building2, Stethoscope, GraduationCap, ArrowRight } from "lucide-react";

const NICHES = [
  { icon: ShoppingCart, name: "Varejo", to: "/f/varejo", mods: "Frente de Caixa (PDV), estoque, fornecedores, pedidos de compra e notas de entrada.", text: "Venda no balcão e controle de compras no mesmo sistema do CRM." },
  { icon: Car, name: "Concessionária e automotivo", to: "/f/automotivo", mods: "Captações, avaliações de usados, consignações, trocas e repasses, test-drives.", text: "O giro de veículos novos e usados acompanhado lead a lead." },
  { icon: Sun, name: "Energia solar", to: "/f/solar", mods: "Projetos, vistorias técnicas, análise de fatura e kWp, instalações, homologações e manutenções.", text: "Da análise da fatura ao pós-venda da instalação." },
  { icon: Building2, name: "Imobiliária", to: "/f/imobiliaria", mods: "Proprietários, captações, empreendimentos, corretores e visitas agendadas.", text: "Imóveis, corretores e visitas organizados junto ao funil." },
  { icon: Stethoscope, name: "Clínica e saúde", to: "/f/clinica", mods: "Agenda médica, pacientes, prontuários, telemedicina, faturamento clínico e BI.", text: "Atendimento e faturamento da clínica no mesmo ambiente." },
  { icon: GraduationCap, name: "Educação e cursos", to: "/f/educacao", mods: "Turmas, alunos, banco de conteúdo, certificados e mensalidades.", text: "Da captação do aluno à mensalidade." },
];

export function NichesSection() {
  return (
    <section id="nichos" className="sp-section" aria-labelledby="sp-nichos-title">
      <div className="sp-wrap">
        <h2 id="sp-nichos-title" className="sp-h2">
          Módulos prontos para o seu segmento.
        </h2>
        <p className="sp-lede">
          Além do CRM e do financeiro, cada empresa liga os módulos do seu nicho. Cada link abaixo abre o formulário de
          contato daquele segmento.
        </p>

        <div className="sp-niches">
          {NICHES.map(({ icon: Icon, name, to, mods, text }) => (
            <article className="sp-niche" key={name}>
              <h3>
                <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
                {name}
              </h3>
              <div>
                <p>{text}</p>
                <p className="sp-niche__mods" style={{ marginTop: 8 }}>
                  {mods}
                </p>
              </div>
              <Link to={to} className="sp-link" aria-label={`Falar sobre o segmento ${name}`}>
                Falar sobre este segmento
                <ArrowRight size={16} strokeWidth={1.75} aria-hidden="true" />
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
