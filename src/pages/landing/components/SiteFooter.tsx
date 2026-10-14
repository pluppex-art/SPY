import { Link } from "react-router-dom";

export function SiteFooter() {
  return (
    <footer className="sp-footer">
      <div className="sp-wrap">
        <div className="sp-footer__grid">
          <div className="sp-footer__brand">
            <strong>
              <img src="/logo-icon.png" alt="" width={32} height={32} loading="lazy" />
              S.P.Y.
            </strong>
            <p>CRM e ERP multiempresa, com a Aurora, assistente de IA.</p>
          </div>
          <nav aria-label="Navegação do rodapé">
            <h2>Produto</h2>
            <ul>
              <li><a href="#recursos">O que faz</a></li>
              <li><a href="#aurora">Aurora</a></li>
              <li><a href="#implantacao">Implantação</a></li>
            </ul>
          </nav>
          <nav aria-label="Segmentos">
            <h2>Segmentos</h2>
            <ul>
              <li><Link to="/f/varejo">Varejo</Link></li>
              <li><Link to="/f/automotivo">Automotivo</Link></li>
              <li><Link to="/f/solar">Energia solar</Link></li>
              <li><Link to="/f/imobiliaria">Imobiliária</Link></li>
              <li><Link to="/f/clinica">Clínica</Link></li>
              <li><Link to="/f/educacao">Educação</Link></li>
            </ul>
          </nav>
          <nav aria-label="Acesso">
            <h2>Acesso</h2>
            <ul>
              <li><Link to="/login">Acessar o sistema</Link></li>
              <li><Link to="/f/spy">Implantar o S.P.Y.</Link></li>
              <li><Link to="/privacidade">Política de privacidade</Link></li>
            </ul>
          </nav>
        </div>
        <p className="sp-footer__legal">© {new Date().getFullYear()} S.P.Y. Todos os direitos reservados.</p>
      </div>
    </footer>
  );
}
