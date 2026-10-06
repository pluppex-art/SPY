// Catálogo da Central de Conexões (contas ligadas por login/OAuth), agrupado por plataforma.
// `live: true` = fluxo funcional hoje; os demais aparecem como "em breve" e já têm lugar reservado,
// então adicionar um serviço novo é só ligar o `live` e implementar o provedor no backend.
//
// Não confundir com src/lib/integrationCatalog.ts (aplicativos por chave de API, na Central de Aplicativos).

export interface ConnectionService {
  id: string;
  name: string;
  description: string;
  live: boolean;
}

export interface ConnectionGroup {
  id: "google" | "meta" | "comunicacao";
  title: string;
  services: ConnectionService[];
}

export const CONNECTION_GROUPS: ConnectionGroup[] = [
  {
    id: "google",
    title: "Google",
    services: [
      { id: "calendar", name: "Google Calendar", description: "Agenda e compromissos. A Aurora responde sobre os seus horários.", live: true },
      { id: "tasks", name: "Google Tasks", description: "Listas e tarefas, com pendentes, concluídas e atrasadas.", live: true },
      { id: "gmail", name: "Gmail", description: "E-mails ligados aos seus contatos e negócios.", live: false },
      { id: "drive", name: "Google Drive", description: "Arquivos e documentos da empresa.", live: false },
      { id: "sheets", name: "Google Sheets", description: "Planilhas como fonte de dados.", live: false },
      { id: "contacts", name: "Google Contacts", description: "Agenda de contatos para o CRM.", live: false },
    ],
  },
  {
    id: "meta",
    title: "Meta",
    services: [
      { id: "instagram", name: "Instagram", description: "Mensagens e perfil comercial.", live: false },
      { id: "facebook", name: "Facebook", description: "Páginas e conversas.", live: false },
      { id: "meta-ads", name: "Meta Ads", description: "Campanhas e resultados dos anúncios.", live: false },
    ],
  },
  {
    id: "comunicacao",
    title: "Comunicação",
    services: [
      { id: "whatsapp", name: "WhatsApp", description: "Conversas com clientes (hoje configurado em Mensageria).", live: false },
    ],
  },
];
