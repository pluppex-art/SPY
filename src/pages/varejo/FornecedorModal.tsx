import { useEffect, useState } from "react";
import { Truck } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "../../components/ui/modal";
import { Button } from "../../components/ui/button";
import { HelpTip } from "../../components/ui/help-tip";
import { supabase } from "../../lib/supabase";

export interface FornecedorItem {
  id: string;
  tipoPessoa: "PJ" | "PF";
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  inscricaoEstadual: string;
  categorias: string;
  contato: string;
  telefone: string;
  telefoneSecundario: string;
  email: string;
  site: string;
  cep: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  condicaoPagamento: string;
  formaPagamento: string;
  prazoEntrega: string;
  pedidoMinimo: number | null;
  frete: string;
  dadosBancarios: string;
  observacoes: string;
  ativo: boolean;
}

export function rowToFornecedor(row: any): FornecedorItem {
  return {
    id: row.id,
    tipoPessoa: row.tipo_pessoa === "PF" ? "PF" : "PJ",
    razaoSocial: row.razao_social || "",
    nomeFantasia: row.nome_fantasia || "",
    cnpj: row.cnpj || "",
    inscricaoEstadual: row.inscricao_estadual || "",
    categorias: row.categorias || "",
    contato: row.contato || "",
    telefone: row.telefone || "",
    telefoneSecundario: row.telefone_secundario || "",
    email: row.email || "",
    site: row.site || "",
    cep: row.cep || "",
    endereco: row.endereco || "",
    numero: row.numero || "",
    complemento: row.complemento || "",
    bairro: row.bairro || "",
    cidade: row.cidade || "",
    uf: row.uf || "",
    condicaoPagamento: row.condicao_pagamento || "",
    formaPagamento: row.forma_pagamento || "",
    prazoEntrega: row.prazo_entrega || "",
    pedidoMinimo: row.pedido_minimo != null ? Number(row.pedido_minimo) : null,
    frete: row.frete || "",
    dadosBancarios: row.dados_bancarios || "",
    observacoes: row.observacoes || "",
    ativo: row.ativo !== false,
  };
}

const digits = (v: string) => (v || "").replace(/\D/g, "");

export function formatDoc(v: string): string {
  const d = digits(v);
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return v;
}
export function formatFone(v: string): string {
  const d = digits(v);
  if (d.length === 11) return d.replace(/^(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3");
  if (d.length === 10) return d.replace(/^(\d{2})(\d{4})(\d{4})$/, "($1) $2-$3");
  return v;
}
const formatCep = (v: string) => { const d = digits(v).slice(0, 8); return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d; };

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];
const FORMAS = ["Pix", "Boleto", "Transferência", "Cartão", "Dinheiro", "Cheque"];
const CONDICOES = ["À vista", "7 dias", "14 dias", "21 dias", "28 dias", "30 dias", "30/60 dias", "30/60/90 dias"];

const inputCls =
  "w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]";
const labelCls = "text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5";

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-primary-blue)] mb-2.5 pb-1.5 border-b border-[var(--color-border-subtle)]">{titulo}</h4>
      <div className="grid grid-cols-12 gap-3">{children}</div>
    </section>
  );
}
function Campo({ label, span, obrigatorio, children }: { label: string; span: number; obrigatorio?: boolean; children: React.ReactNode }) {
  const cols: Record<number, string> = { 2: "col-span-12 md:col-span-2", 3: "col-span-12 md:col-span-3", 4: "col-span-12 md:col-span-4", 5: "col-span-12 md:col-span-5", 6: "col-span-12 md:col-span-6", 8: "col-span-12 md:col-span-8", 12: "col-span-12" };
  return (
    <div className={cols[span]}>
      <label className={labelCls}>{label}{obrigatorio && <span className="text-rose-500"> *</span>}</label>
      {children}
    </div>
  );
}

const vazio = (): FornecedorItem => ({
  id: "", tipoPessoa: "PJ", razaoSocial: "", nomeFantasia: "", cnpj: "", inscricaoEstadual: "", categorias: "",
  contato: "", telefone: "", telefoneSecundario: "", email: "", site: "",
  cep: "", endereco: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "",
  condicaoPagamento: "", formaPagamento: "", prazoEntrega: "", pedidoMinimo: null, frete: "",
  dadosBancarios: "", observacoes: "", ativo: true,
});

/**
 * Ficha do fornecedor (cadastro e edição). Usada na tela de Fornecedores e dentro da Nova Ordem de Compra (botão "+").
 * Obrigatório: nome e telefone/WhatsApp. O resto é opcional.
 */
export function FornecedorModal({
  isOpen, onClose, tenantId, onSaved, fornecedor, existentes = [],
}: {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string | null | undefined;
  onSaved: (f: FornecedorItem) => void;
  /** Quando informado, o modal edita este fornecedor. */
  fornecedor?: FornecedorItem | null;
  /** Lista atual, usada para avisar de CNPJ/CPF repetido. */
  existentes?: FornecedorItem[];
}) {
  const [f, setF] = useState<FornecedorItem>(vazio());
  const [pedMin, setPedMin] = useState("");
  const [salvando, setSalvando] = useState(false);
  const set = <K extends keyof FornecedorItem>(k: K, v: FornecedorItem[K]) => setF(prev => ({ ...prev, [k]: v }));

  useEffect(() => {
    if (!isOpen) return;
    const base = fornecedor ? { ...fornecedor } : vazio();
    setF(base);
    setPedMin(base.pedidoMinimo != null ? String(base.pedidoMinimo) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, fornecedor?.id]);

  const buscarCep = async () => {
    const d = digits(f.cep);
    if (d.length !== 8) return;
    try {
      const r = await fetch(`https://viacep.com.br/ws/${d}/json/`);
      const j = await r.json();
      if (j?.erro) return;
      setF(prev => ({
        ...prev,
        endereco: prev.endereco || j.logradouro || "",
        bairro: prev.bairro || j.bairro || "",
        cidade: prev.cidade || j.localidade || "",
        uf: prev.uf || j.uf || "",
      }));
    } catch { /* sem internet ou CEP fora do ar: o usuário preenche à mão */ }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.razaoSocial.trim()) { toast.error("Informe o nome do fornecedor."); return; }
    if (!f.telefone.trim()) { toast.error("Informe o telefone / WhatsApp do fornecedor."); return; }
    if (!supabase || !tenantId) { toast.error("Sem conexão com o banco de dados."); return; }
    const doc = digits(f.cnpj);
    if (doc && existentes.some(x => x.id !== f.id && digits(x.cnpj) === doc)) {
      toast.error(`Já existe um fornecedor com este ${f.tipoPessoa === "PF" ? "CPF" : "CNPJ"}.`);
      return;
    }
    const nulo = (v: string) => v.trim() || null;
    const payload = {
      tipo_pessoa: f.tipoPessoa,
      razao_social: f.razaoSocial.trim(),
      nome_fantasia: nulo(f.nomeFantasia),
      cnpj: doc || null,
      inscricao_estadual: nulo(f.inscricaoEstadual),
      categorias: nulo(f.categorias),
      contato: nulo(f.contato),
      telefone: nulo(f.telefone),
      telefone_secundario: nulo(f.telefoneSecundario),
      email: nulo(f.email),
      site: nulo(f.site),
      cep: digits(f.cep) || null,
      endereco: nulo(f.endereco),
      numero: nulo(f.numero),
      complemento: nulo(f.complemento),
      bairro: nulo(f.bairro),
      cidade: nulo(f.cidade),
      uf: nulo(f.uf),
      condicao_pagamento: nulo(f.condicaoPagamento),
      forma_pagamento: nulo(f.formaPagamento),
      prazo_entrega: nulo(f.prazoEntrega),
      pedido_minimo: pedMin.trim() ? (parseFloat(pedMin.replace(/[^\d.,]/g, "").replace(",", ".")) || null) : null,
      frete: nulo(f.frete),
      dados_bancarios: nulo(f.dadosBancarios),
      observacoes: nulo(f.observacoes),
      ativo: f.ativo,
    };
    setSalvando(true);
    const q = f.id
      ? supabase.from("varejo_fornecedores").update(payload).eq("id", f.id).select().maybeSingle()
      : supabase.from("varejo_fornecedores").insert({ ...payload, tenant_id: tenantId }).select().single();
    const { data, error } = await q;
    setSalvando(false);
    if (error || !data) { toast.error(f.id ? "Erro ao salvar o fornecedor." : "Erro ao cadastrar fornecedor."); return; }
    toast.success(f.id ? "Fornecedor atualizado." : "Fornecedor cadastrado!");
    onSaved(rowToFornecedor(data));
    onClose();
  };

  const docLabel = f.tipoPessoa === "PF" ? "CPF" : "CNPJ";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-4xl"
      title={
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] flex items-center justify-center shrink-0">
            <Truck className="w-4 h-4" />
          </div>
          <h3 className="text-base font-bold text-[var(--color-text-primary)]">
            {fornecedor ? "Editar Fornecedor" : "Novo Fornecedor"} <HelpTip label="Sobre o cadastro">Só nome e telefone são obrigatórios. O resto você completa quando quiser.</HelpTip>
          </h3>
        </div>
      }
      footer={
        <div className="flex items-center justify-between gap-2 w-full">
          <label className="flex items-center gap-2 text-xs font-semibold text-[var(--color-text-primary)] cursor-pointer">
            <input type="checkbox" checked={f.ativo} onChange={e => set("ativo", e.target.checked)} /> Fornecedor ativo
          </label>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={onClose} className="h-9 px-4 text-xs font-semibold">Cancelar</Button>
            <Button type="submit" form="form-fornecedor-modal" disabled={salvando} className="h-9 px-4 text-xs font-semibold bg-[var(--color-primary-blue)] hover:bg-[var(--color-primary-blue)]/90 text-white">
              {salvando ? "Salvando..." : fornecedor ? "Salvar alterações" : "Salvar Fornecedor"}
            </Button>
          </div>
        </div>
      }
    >
      <form id="form-fornecedor-modal" onSubmit={handleSubmit} className="space-y-5 py-1 max-h-[65vh] overflow-y-auto pr-1">
        <Secao titulo="Identificação">
          <Campo label="Tipo" span={2}>
            <select value={f.tipoPessoa} onChange={e => set("tipoPessoa", e.target.value as "PJ" | "PF")} className={inputCls}>
              <option value="PJ">Empresa (PJ)</option>
              <option value="PF">Pessoa (PF)</option>
            </select>
          </Campo>
          <Campo label="Nome / Razão Social" span={6} obrigatorio>
            <input type="text" required placeholder="Ex: Distribuidora Nacional de Peças LTDA" value={f.razaoSocial} onChange={e => set("razaoSocial", e.target.value)} className={inputCls} />
          </Campo>
          <Campo label="Nome Fantasia" span={4}>
            <input type="text" placeholder="Como é conhecido" value={f.nomeFantasia} onChange={e => set("nomeFantasia", e.target.value)} className={inputCls} />
          </Campo>
          <Campo label={docLabel} span={4}>
            <input type="text" inputMode="numeric" placeholder={f.tipoPessoa === "PF" ? "000.000.000-00" : "00.000.000/0001-00"} value={f.cnpj} onChange={e => set("cnpj", e.target.value)} onBlur={() => set("cnpj", formatDoc(f.cnpj))} className={inputCls} />
          </Campo>
          {f.tipoPessoa === "PJ" && (
            <Campo label="Inscrição Estadual" span={4}>
              <input type="text" placeholder="Isento ou número" value={f.inscricaoEstadual} onChange={e => set("inscricaoEstadual", e.target.value)} className={inputCls} />
            </Campo>
          )}
          <Campo label="Linhas / Categorias" span={f.tipoPessoa === "PJ" ? 4 : 8}>
            <input type="text" placeholder="Ex: Acessórios, Cabos" value={f.categorias} onChange={e => set("categorias", e.target.value)} className={inputCls} />
          </Campo>
        </Secao>

        <Secao titulo="Contato">
          <Campo label="Telefone / WhatsApp" span={4} obrigatorio>
            <input type="text" required inputMode="tel" placeholder="(11) 90000-0000" value={f.telefone} onChange={e => set("telefone", e.target.value)} onBlur={() => set("telefone", formatFone(f.telefone))} className={inputCls} />
          </Campo>
          <Campo label="Telefone secundário" span={4}>
            <input type="text" inputMode="tel" placeholder="(11) 3000-0000" value={f.telefoneSecundario} onChange={e => set("telefoneSecundario", e.target.value)} onBlur={() => set("telefoneSecundario", formatFone(f.telefoneSecundario))} className={inputCls} />
          </Campo>
          <Campo label="Nome do Contato" span={4}>
            <input type="text" placeholder="Quem atende" value={f.contato} onChange={e => set("contato", e.target.value)} className={inputCls} />
          </Campo>
          <Campo label="E-mail Comercial" span={6}>
            <input type="email" placeholder="pedidos@empresa.com" value={f.email} onChange={e => set("email", e.target.value)} className={inputCls} />
          </Campo>
          <Campo label="Site" span={6}>
            <input type="text" placeholder="www.empresa.com" value={f.site} onChange={e => set("site", e.target.value)} className={inputCls} />
          </Campo>
        </Secao>

        <Secao titulo="Endereço">
          <Campo label="CEP" span={3}>
            <input type="text" inputMode="numeric" placeholder="00000-000" value={f.cep} onChange={e => set("cep", formatCep(e.target.value))} onBlur={buscarCep} className={inputCls} />
          </Campo>
          <Campo label="Endereço" span={6}>
            <input type="text" placeholder="Rua, avenida..." value={f.endereco} onChange={e => set("endereco", e.target.value)} className={inputCls} />
          </Campo>
          <Campo label="Número" span={3}>
            <input type="text" value={f.numero} onChange={e => set("numero", e.target.value)} className={inputCls} />
          </Campo>
          <Campo label="Complemento" span={4}>
            <input type="text" placeholder="Sala, galpão..." value={f.complemento} onChange={e => set("complemento", e.target.value)} className={inputCls} />
          </Campo>
          <Campo label="Bairro" span={4}>
            <input type="text" value={f.bairro} onChange={e => set("bairro", e.target.value)} className={inputCls} />
          </Campo>
          <Campo label="Cidade" span={3}>
            <input type="text" value={f.cidade} onChange={e => set("cidade", e.target.value)} className={inputCls} />
          </Campo>
          <Campo label="UF" span={2}>
            <select value={f.uf} onChange={e => set("uf", e.target.value)} className={inputCls}>
              <option value="">—</option>
              {UFS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </Campo>
        </Secao>

        <Secao titulo="Condições comerciais">
          <Campo label="Condição de pagamento" span={4}>
            <input type="text" list="cond-pagto-opcoes" placeholder="Ex: 30 dias" value={f.condicaoPagamento} onChange={e => set("condicaoPagamento", e.target.value)} className={inputCls} />
            <datalist id="cond-pagto-opcoes">{CONDICOES.map(c => <option key={c} value={c} />)}</datalist>
          </Campo>
          <Campo label="Forma de pagamento" span={4}>
            <select value={f.formaPagamento} onChange={e => set("formaPagamento", e.target.value)} className={inputCls}>
              <option value="">—</option>
              {FORMAS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </Campo>
          <Campo label="Prazo de entrega" span={4}>
            <input type="text" placeholder="Ex: 3 dias úteis" value={f.prazoEntrega} onChange={e => set("prazoEntrega", e.target.value)} className={inputCls} />
          </Campo>
          <Campo label="Pedido mínimo (R$)" span={4}>
            <input type="text" inputMode="decimal" placeholder="0,00" value={pedMin} onChange={e => setPedMin(e.target.value)} className={inputCls} />
          </Campo>
          <Campo label="Frete" span={8}>
            <input type="text" placeholder="Ex: CIF, grátis acima de R$ 1.000, retirada no local" value={f.frete} onChange={e => set("frete", e.target.value)} className={inputCls} />
          </Campo>
        </Secao>

        <Secao titulo="Financeiro e observações">
          <Campo label="Dados bancários / chave Pix" span={12}>
            <textarea rows={2} placeholder="Banco, agência, conta ou chave Pix para pagamento" value={f.dadosBancarios} onChange={e => set("dadosBancarios", e.target.value)} className={`${inputCls} resize-none`} />
          </Campo>
          <Campo label="Observações" span={12}>
            <textarea rows={3} placeholder="Qualquer informação útil sobre este fornecedor" value={f.observacoes} onChange={e => set("observacoes", e.target.value)} className={`${inputCls} resize-none`} />
          </Campo>
        </Secao>
      </form>
    </Modal>
  );
}
