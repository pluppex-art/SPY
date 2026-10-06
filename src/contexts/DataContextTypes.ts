import { createContext, useContext } from 'react';
import { Lead, Task, Contract, CustomField, LeadScoreTrigger, Squad } from '../types';

export interface LeadActivity {
  id: string;
  leadId: string;
  type: 'Ligação' | 'E-mail' | 'Reunião' | 'Outro';
  title: string;
  description: string;
  date: string;
  seller: string;
  files?: { name: string; size: string; }[];
}

// Espelha as colunas reais de public.notifications (id uuid, tenant_id,
// user_id, title, description, type, link_url, is_read, created_at). Não
// tem mais `category` — a tabela nunca teve essa coluna versionada; os
// mutators (addNotification/markNotificationAsRead/markAllNotificationsAsRead
// em DataContext.tsx) agora persistem de verdade, então o formato aqui
// precisa bater exatamente com o schema.
export interface Notification {
  id: string;
  title: string;
  description: string;
  link_url?: string | null;
  type: 'success' | 'error' | 'info' | 'warning';
  is_read: boolean;
  created_at: string;
}

export interface GlobalWebhook {
  id: string;
  endpoint: string;
  event: string;
  active: boolean;
}

export interface FinanceEntry {
  id: string;
  /** Nome curto do lançamento (título) — o que aparece na lista/cards. */
  description: string;
  category: string;
  status: 'Pago' | 'A Vencer' | 'Atrasado' | 'Pendente';
  value: number;
  type: 'Pagar' | 'Receber';
  date: string;
  is_recurring?: boolean;
  recurring_frequency?: 'semanal' | 'quinzenal' | 'mensal' | 'bimestral' | 'trimestral' | 'semestral' | 'anual' | 'personalizado' | null;
  /** Liga todas as ocorrências geradas pela mesma recorrência — útil pra
   * identificar/gerenciar o grupo depois (ex.: cancelar as futuras). */
  recurring_group_id?: string | null;
  /** Liga este lançamento à proposta que o gerou (AddProdutoLeadModal ou
   * aceite de proposta em syncAcceptedProposal) — permite limpar as cobranças
   * a receber quando a proposta é excluída, sem depender de casar por texto. */
  proposal_id?: string | null;
  /** Vínculo real com finance_categories — `category` (nome) continua
   * gravado por compatibilidade/exibição, mas quem define a linha do DRE é
   * este id. */
  category_id?: string | null;
  centro_custo_id?: string | null;
  tags?: string[];
  competencia_date?: string | null;
  conta_bancaria_id?: string | null;
  numero_documento?: string | null;
  /** Vínculo opcional com um Contato completo (tabela `clientes`, reaproveitada
   * como Cliente/Fornecedor/Funcionário) — `counterparty` (texto livre)
   * continua existindo pra quando não vale a pena cadastrar um contato completo. */
  contato_id?: string | null;
  /** Texto livre com detalhes/observações — separado do `description` (nome
   * curto) porque nem todo lançamento precisa de um texto longo. */
  notes?: string | null;
  /** Forma de pagamento/recebimento (Pix, Boleto, Cartão, etc.). */
  payment_method?: string | null;
  /** Cliente ou fornecedor envolvido no lançamento. */
  counterparty?: string | null;
  /** Parcelamento: valor total dividido em N lançamentos (diferente de
   * recorrente — aqui o valor de cada um é uma FRAÇÃO do total, não o total
   * repetido). Um lançamento nunca é recorrente E parcelado ao mesmo tempo. */
  installment_group_id?: string | null;
  installment_number?: number | null;
  installment_total?: number | null;
  /** Rateio ("Detalhar valor"): liga as N linhas geradas ao dividir um
   * lançamento — cada divisão é um finance_entries independente. */
  division_group_id?: string | null;
}

export type Appointment = {
  id: string;
  time: string;
  patient: string;
  patientId?: string | null;
  drId: string;
  drName: string;
  status: 'Confirmado' | 'Aguardando' | 'Atrasado' | 'Em Atendimento' | 'Finalizado';
  type: 'Consulta' | 'Check-up' | 'Procedimento' | 'Retorno' | 'Teleconsulta';
  room: string;
  specialty: string;
  phone?: string;
  date: string;
  notes?: string;
};

export type Indicacao = {
  id: string;
  referrer_type: 'colaborador' | 'cliente';
  referrer_colaborador_id?: string | null;
  referrer_cliente_id?: string | null;
  referrer_name: string;
  referred_name: string;
  referred_contact?: string | null;
  commission_value: number;
  status: 'Pendente' | 'Aprovada' | 'Paga' | 'Cancelada';
  date_indicated: string;
  date_paid?: string | null;
  notes?: string | null;
  created_at?: string;
};

export interface AuroraAgent {
  id: string;
  tenant_id?: string;
  name: string;
  role?: string;
  description?: string;
  active: boolean;
  workflow?: string;
  permissions?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
  activated_by?: string | null;
  deactivated_at?: string | null;
  last_execution_at?: string | null;
}

export interface Reuniao {
  id: string;
  leadId: string;
  clienteId?: string;
  leadName: string;
  companyName: string;
  leadEmail: string;
  closerName: string;
  closerEmail: string;
  scheduledAt: string;
  durationMinutes: number;
  meetLink: string;
  googleEventId?: string;
  status: 'Agendada' | 'Em Andamento' | 'Concluída' | 'Cancelada';
  pauta?: string;
  relatorio?: string;
  transcricao?: string;
  notas_closer?: string;
  relatorio_ia?: string;
  createdAt: string;
  /** Categoria do compromisso — campo real (coluna `tipo`), usada pela Agenda
   * Comercial pra colorir/filtrar por tipo. Histórico migrado sem pauta
   * identificável foi classificado como 'Outros' (nunca inventado). */
  tipo?: 'Reunião' | 'Demonstração' | 'Follow-up' | 'Fechamento' | 'Outros';
  convidados?: string[];
}

export interface DataContextType {
  leads: Lead[];
  avgWonTicket: number;
  tasks: Task[];
  contracts: Contract[];
  notifications: Notification[];
  leadActivities: LeadActivity[];
  financeEntries: FinanceEntry[];
  appointments: Appointment[];
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  addLead: (lead: Omit<Lead, 'id'>) => void;
  updateLead: (id: string, updates: Partial<Lead>) => void;
  deleteLead: (id: string) => void;
  moveLead: (leadId: string, destStageId: string, index: number) => void;
  addTask: (task: Omit<Task, 'id'>) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  addContract: (contract: Omit<Contract, 'id'>, options?: { silent?: boolean }) => void;
  updateContract: (id: string, updates: Partial<Contract>, options?: { silent?: boolean }) => void;
  deleteContract: (id: string) => void;
  addNotification: (notification: Omit<Notification, 'id' | 'is_read' | 'created_at'>, push?: boolean) => void;
  markNotificationAsRead: (id: string) => void;
  markAllNotificationsAsRead: () => void;
  addLeadActivity: (leadId: string, type: 'Ligação' | 'E-mail' | 'Reunião' | 'Outro', title: string, description: string, seller: string, customDate?: string, files?: { name: string; size: string; }[]) => void;
  sidebarModules: Record<string, boolean>;
  setSidebarModules: (modules: Record<string, boolean>) => void;
  tenantPrimaryColor: string;
  updateTenantPrimaryColor: (hex: string) => Promise<{ success: boolean; error?: string }>;
  saveAppSetting: (key: string, value: any) => Promise<void>;
  appSettings: Record<string, any>;
  // Financeiro (bancos/transferências/centros de custo/anexos/categorias/
  // auditoria), Marketing (automações/formulários/conteúdo) e Educação/Aurora
  // não entram na carga inicial (são módulos de nicho, não usados por toda
  // empresa) — cada tela desses módulos chama isso no mount pra buscar sob
  // demanda, uma única vez (idempotente).
  ensureNicheModulesLoaded: () => void;
  appSettingsLoaded: boolean;
  getSmartInsight: (context: string, data: any) => Promise<string>;
  addFinanceEntry: (entry: Omit<FinanceEntry, 'id'>, options?: { silent?: boolean }) => void;
  deleteFinanceEntry: (id: string) => void;
  updateFinanceEntry: (id: string, updates: Partial<FinanceEntry>) => void;
  addAppointment: (apt: Omit<Appointment, 'id'>) => void;
  updateAppointment: (id: string, updates: Partial<Appointment>) => void;
  deleteAppointment: (id: string) => void;
  simulateNewLeadAssignment: () => void;
  simulateOverdueTask: () => void;
  whatsappWebhookUrl: string;
  setWhatsappWebhookUrl: (url: string) => void;
  customLeadFields: CustomField[];
  setCustomLeadFields: (fields: CustomField[]) => void;
  leadScoreTriggers: LeadScoreTrigger[];
  setLeadScoreTriggers: (triggers: LeadScoreTrigger[]) => void;
  globalWebhooks: GlobalWebhook[];
  addGlobalWebhook: (webhook: Omit<GlobalWebhook, 'id'>) => void;
  updateGlobalWebhook: (id: string, updates: Partial<GlobalWebhook>) => void;
  deleteGlobalWebhook: (id: string) => void;
  toggleGlobalWebhook: (id: string) => void;
  squads: Squad[];
  updateSquad: (id: string, updates: Partial<Squad>) => void;
  addSquad: (squad: Omit<Squad, 'id'>) => void;
  deleteSquad: (id: string) => void;
  funis: any[];
  addFunil: (funil: any) => Promise<void>;
  updateFunil: (id: string, updates: any) => Promise<void>;
  deleteFunil: (id: string) => Promise<void>;
  empresaFiliais: any[];
  addEmpresaFilial: (filial: any) => Promise<void>;
  updateEmpresaFilial: (id: string, updates: any) => Promise<void>;
  deleteEmpresaFilial: (id: string) => Promise<boolean>;
  nichos: any[];
  addNicho: (nicho: any) => Promise<void>;
  updateNicho: (id: string, updates: any) => Promise<void>;
  deleteNicho: (id: string) => Promise<boolean>;
  financeCategories: any[];
  // Retorna a categoria criada (com id) — o formulário de lançamento precisa
  // do id pra já vincular a categoria recém-criada ao lançamento sendo salvo.
  addFinanceCategory: (category: any) => Promise<any>;
  updateFinanceCategory: (id: string, updates: any) => Promise<void>;
  deleteFinanceCategory: (id: string) => Promise<boolean>;
  /** Acha (por nome+tipo) ou cria uma finance_categories e devolve o id — usado
   * pelos fluxos automáticos (AddProdutoLeadModal, aceite de proposta) pra
   * preencher `category_id` de verdade em vez de deixar nulo. */
  resolveFinanceCategoryId: (nome: string, tipo: 'Receita' | 'Despesa') => Promise<string | null>;
  /** Orçamento planejado por categoria+mês ('YYYY-MM') — Financeiro > Orçamentos. */
  financeBudgets: any[];
  upsertFinanceBudget: (categoryId: string, mes: string, valorOrcado: number) => Promise<void>;
  deleteFinanceBudget: (id: string) => Promise<boolean>;
  /** Implantação por cliente fechado — CRM > Implementações (formulário em src/lib/implementationForm.ts). */
  implementations: any[];
  addImplementation: (item: any) => Promise<any>;
  updateImplementation: (id: string, updates: any) => Promise<void>;
  deleteImplementation: (id: string) => Promise<boolean>;
  financeBankAccounts: any[];
  addFinanceBankAccount: (conta: any) => Promise<any>;
  updateFinanceBankAccount: (id: string, updates: any) => Promise<void>;
  deleteFinanceBankAccount: (id: string) => Promise<boolean>;
  setContaPrincipal: (id: string) => Promise<void>;
  financeTransfers: any[];
  addFinanceTransfer: (transferencia: any) => Promise<any>;
  updateFinanceTransfer: (id: string, updates: any) => Promise<void>;
  deleteFinanceTransfer: (id: string) => Promise<boolean>;
  financePeriodLocks: any[];
  addFinancePeriodLock: (lock: any) => Promise<any>;
  deleteFinancePeriodLock: (id: string) => Promise<boolean>;
  financeAuditLog: any[];
  financeCentrosCusto: any[];
  addFinanceCentroCusto: (centro: any) => Promise<any>;
  updateFinanceCentroCusto: (id: string, updates: any) => Promise<void>;
  deleteFinanceCentroCusto: (id: string) => Promise<boolean>;
  financeAttachments: any[];
  addFinanceAttachment: (anexo: any) => Promise<any>;
  deleteFinanceAttachment: (id: string) => Promise<boolean>;
  addClienteBase: (cliente: any) => Promise<any>;
  updateClienteBase: (id: string, updates: any) => Promise<void>;
  deleteClienteBase: (id: string) => Promise<boolean>;
  financeCommissionEntries: any[];
  addFinanceCommissionEntry: (entry: any) => Promise<void>;
  updateFinanceCommissionEntry: (id: string, updates: any) => Promise<void>;
  deleteFinanceCommissionEntry: (id: string) => Promise<boolean>;
  scheduledExports: any[];
  addScheduledExport: (item: any) => Promise<void>;
  updateScheduledExport: (id: string, updates: any) => Promise<void>;
  deleteScheduledExport: (id: string) => Promise<boolean>;
  educationContent: any[];
  addEducationContent: (item: any) => Promise<void>;
  updateEducationContent: (id: string, updates: any) => Promise<void>;
  deleteEducationContent: (id: string) => Promise<boolean>;
  addCertificate: (item: any) => Promise<void>;
  updateCertificate: (id: string, updates: any) => Promise<void>;
  deleteCertificate: (id: string) => Promise<boolean>;

  marketingAutomations: any[];
  setMarketingAutomations: (v: any[]) => void;
  addMarketingAutomation: (v: any) => void;
  updateMarketingAutomation: (id: string, updates: any) => void;
  deleteMarketingAutomation: (id: string) => void;

  marketingContent: any[];
  setMarketingContent: (v: any[]) => void;
  addMarketingContent: (c: any) => void;
  updateMarketingContent: (id: string, updates: any) => void;
  deleteMarketingContent: (id: string) => void;
  marketingCampaigns: any[];
  setMarketingCampaigns: (v: any[]) => void;
  addMarketingCampaign: (c: any) => void;
  updateMarketingCampaign: (id: string, updates: any) => void;
  deleteMarketingCampaign: (id: string) => void;
  marketingLandingPages: any[];
  setMarketingLandingPages: (v: any[]) => void;
  addMarketingLandingPage: (p: any) => void;
  updateMarketingLandingPage: (id: string, updates: any) => void;
  deleteMarketingLandingPage: (id: string) => void;
  marketingForms: any[];
  setMarketingForms: (v: any[]) => void;
  addMarketingForm: (f: any) => void;
  updateMarketingForm: (id: string, updates: any) => void;
  deleteMarketingForm: (id: string) => void;
  products: any[];
  setProducts: (v: any[]) => void;
  addProduct: (p: any) => void;
  updateProduct: (id: string, updates: any) => void;
  deleteProduct: (id: string) => void;
  proposals: any[];
  setProposals: (v: any[]) => void;
  addProposal: (p: any) => void;
  updateProposal: (id: string, updates: any) => void;
  deleteProposal: (id: string) => Promise<boolean>;
  proposalItems: any[];
  createProposalWithItems: (payload: {
    titulo: string;
    cliente: string;
    valor: number;
    validade?: string | null;
    status?: string;
    vendedor: string;
    leadId?: string | null;
    tipo?: 'itens' | 'texto' | 'arquivo';
    conteudoTexto?: string | null;
    linkPdf?: string | null;
    itens?: Array<{ productId?: string | null; descricao: string; quantidade: number; precoUnitario: number; billingType?: 'recurring' | 'one_time'; contractMonths?: number | null }>;
  }) => Promise<string>;
  addItemsToProposal: (proposalId: string, itens: Array<{ productId?: string | null; descricao: string; quantidade: number; precoUnitario: number; billingType?: 'recurring' | 'one_time'; contractMonths?: number | null; frequency?: string | null }>, addedValor: number) => Promise<void>;
  replaceProposalItems: (proposalId: string, removeIds: string[], itens: Array<{ productId?: string | null; descricao: string; quantidade: number; precoUnitario: number; billingType?: 'recurring' | 'one_time'; contractMonths?: number | null; frequency?: string | null }>, valorDelta: number) => Promise<void>;
  editProposalItems: (proposalId: string, edits: Array<{ id: string; quantidade: number; preco_unitario: number }>, removedIds: string[]) => Promise<void>;
  /** Sincroniza contrato + fatura pra uma proposta aceita (chamada tanto no momento
   * do aceite quanto pela reconciliação global — ver DataContext.tsx). Retorna
   * `true` quando criou um contrato novo, `false` quando já existia (ou só
   * atualizou plano/data de término de um existente). */
  syncAcceptedProposal: (prop: any, options?: { silent?: boolean }) => Promise<boolean>;
  certificates: any[];
  setCertificates: (v: any[]) => void;
  turmas: any[];
  setTurmas: (v: any[]) => void;
  addTurma: (t: any) => void;
  updateTurma: (id: string, updates: any) => void;
  deleteTurma: (id: string) => void;
  students: any[];
  setStudents: (v: any[]) => void;
  addStudent: (s: any) => void;
  updateStudent: (id: string, updates: any) => void;
  deleteStudent: (id: string) => void;
  colaboradores: any[];
  setColaboradores: (v: any[]) => void;
  addColaborador: (c: any) => void;
  updateColaborador: (id: string, updates: any) => void;
  deleteColaborador: (id: string) => Promise<boolean>;
  squadMetas: any[];
  setSquadMetas: (v: any[]) => void;
  addSquadMeta: (v: any) => void;
  updateSquadMeta: (id: string, updates: any) => void;
  deleteSquadMeta: (id: string) => void;
  financialGoals: any[];
  cargos: any[];
  setCargos: (v: any[]) => void;
  addCargo: (c: any) => void;
  updateCargo: (id: string, updates: any) => void;
  deleteCargo: (id: string) => void;
  clienteBase: any[];
  setClienteBase: (v: any[]) => void;
  reunioes: Reuniao[];
  /** Resolve pra `undefined` quando o insert real falha (ver createCrudHelper
   * em DataContext.tsx) — usado pelo modal de criação pra só mostrar a tela
   * de sucesso depois de confirmar que o agendamento foi salvo de verdade. */
  addReuniao: (r: Omit<Reuniao, 'id' | 'createdAt'>) => Promise<Reuniao | undefined>;
  updateReuniao: (id: string, updates: Partial<Reuniao>) => void;
  deleteReuniao: (id: string) => void;
  indicacoes: Indicacao[];
  addIndicacao: (i: Omit<Indicacao, 'id' | 'created_at'>) => void;
  updateIndicacao: (id: string, updates: Partial<Indicacao>) => void;
  deleteIndicacao: (id: string) => void;
  auroraAgents: AuroraAgent[];
  addAuroraAgent: (a: Omit<AuroraAgent, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>) => void;
  updateAuroraAgent: (id: string, updates: Partial<AuroraAgent>) => void;
  deleteAuroraAgent: (id: string) => void;
  toggleAuroraAgent: (id: string) => void;
}

export const DataContext = createContext<DataContextType | undefined>(undefined);

export function useData() {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
}
