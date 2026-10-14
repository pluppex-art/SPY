/** Seção de documento institucional. `html` são blocos HTML confiáveis (escritos aqui, nunca vindos de usuário). */
export interface DocSection {
  id: string;
  title: string;
  html: string[];
}
export interface DocContent {
  slug: string;
  metaTitle: string;
  metaDescription: string;
  title: string;
  intro: string;
  updated: string;
  sections: DocSection[];
}
