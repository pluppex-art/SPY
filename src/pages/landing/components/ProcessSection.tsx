import { rv } from "../reveal";
const STEPS = [
  ["Conversa inicial", "Você conta como vende hoje pelo formulário e a equipe entende o seu segmento."],
  ["Ambiente configurado", "Criamos a empresa no S.P.Y. e ligamos os módulos que fazem sentido para o seu negócio."],
  ["Integrações", "Conectamos o que você já usa, como WhatsApp e Google Agenda, pela Central de Integrações."],
  ["Equipe em operação", "Usuários e permissões definidos, e o time passa a vender e a lançar dentro do sistema."],
];

export function ProcessSection() {
  return (
    <section id="implantacao" className="sp-section" aria-labelledby="sp-impl-title">
      <div className="sp-wrap">
        <h2 id="sp-impl-title" className="sp-h2" {...rv()}>
          Como é implantar o S.P.Y.
        </h2>
        <p className="sp-lede" {...rv(1)}>Um processo acompanhado, em quatro etapas. O prazo depende do tamanho e do segmento da operação.</p>
        <ol className="sp-steps">
          {STEPS.map(([title, text], i) => (
            <li key={title} {...rv(i)}>
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
