import React, { useState, useEffect } from 'react';
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { toast } from "sonner";
import { formatCNPJ, validateCNPJ } from "../../lib/utils";
import { CheckCircle2, AlertTriangle, Building2, Save, Globe, Mail, Phone, MapPin, Upload, Loader2, ImageOff } from "lucide-react";
import { useData } from "../../contexts/DataContext";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";

type CnpjStatus = "idle" | "checking" | "active" | "inactive" | "invalid";

interface EmpresaDados {
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  inscricaoEstadual: string;
  endereco: string;
  emailContato: string;
  telefoneContato: string;
  website: string;
  logoUrl?: string;
  // Perfil que a Júlia (IA de vendas) usa para conversar sobre a empresa — lido ao vivo pelo n8n.
  ia_nome_comercial?: string;
  ia_nome_agente?: string;
  ia_sobre?: string;
  ia_publico?: string;
  ia_fundadores?: string;
  ia_historia?: string;
  ia_metodo?: string;
  ia_diferenciais?: string;
  ia_horario?: string;
  ia_faq?: string;
}

const CAMPOS_IA: { key: keyof EmpresaDados; label: string; hint: string; rows: number }[] = [
  { key: "ia_nome_agente", label: "Nome do agente de vendas", hint: "Como o agente se apresenta aos clientes (ex.: Júlia, Marina, Beto). Se vazio, usa Júlia.", rows: 1 },
  { key: "ia_nome_comercial", label: "Como a IA chama a empresa", hint: "Nome curto usado na apresentação (ex.: Pluppex). Se vazio, usa o Nome Fantasia.", rows: 1 },
  { key: "ia_sobre", label: "O que é a empresa", hint: "Em poucas frases: o que faz, o que vende, em que cidade/região atua.", rows: 3 },
  { key: "ia_publico", label: "Quem são os clientes", hint: "Perfil de quem compra e o problema que chega até vocês.", rows: 2 },
  { key: "ia_fundadores", label: "Fundadores e equipe", hint: "Quem são os responsáveis e por que isso gera confiança (ex.: nome, trajetória).", rows: 3 },
  { key: "ia_historia", label: "História", hint: "Como a empresa nasceu e o que já entregou.", rows: 3 },
  { key: "ia_metodo", label: "Método / modelo de trabalho", hint: "Como funciona o processo, etapas e o que o cliente recebe.", rows: 3 },
  { key: "ia_diferenciais", label: "Diferenciais", hint: "Por que escolher esta empresa e não outra.", rows: 2 },
  { key: "ia_horario", label: "Horário e canais de atendimento", hint: "Quando e por onde a equipe atende.", rows: 2 },
  { key: "ia_faq", label: "Perguntas frequentes", hint: "Dúvidas comuns e as respostas oficiais.", rows: 4 },
];

const SETTING_KEY = "empresa_dados";

const DEFAULT_EMPRESA: EmpresaDados = {
  razaoSocial: "",
  nomeFantasia: "",
  cnpj: "",
  inscricaoEstadual: "",
  endereco: "",
  emailContato: "",
  telefoneContato: "",
  website: "",
  logoUrl: "",
};

export default function ConfigEmpresaDados() {
  const { appSettings, saveAppSetting } = useData();
  const { activeTenantId } = useAuth();
  const [empresa, setEmpresa] = useState<EmpresaDados>(DEFAULT_EMPRESA);
  const [hydrated, setHydrated] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Hidrata uma única vez quando os dados reais do tenant chegam do Supabase
  // (appSettings começa vazio até o fetch inicial do DataContext resolver).
  useEffect(() => {
    if (hydrated) return;
    const saved = appSettings?.[SETTING_KEY];
    if (saved) { setEmpresa(saved); setHydrated(true); }
  }, [appSettings, hydrated]);

  const [cnpjStatus, setCnpjStatus] = useState<{ status: CnpjStatus; message?: string }>({ status: "idle" });
  const [isSaving, setIsSaving] = useState(false);

  const handleCnpjChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCNPJ(e.target.value);
    setEmpresa((prev) => ({ ...prev, cnpj: formatted }));
    const digits = formatted.replace(/\D/g, "");
    if (digits.length === 14) {
      setCnpjStatus({ status: "checking" });
      try {
        const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
        if (resp.ok) {
          const data = await resp.json();
          const isActive = data.situacao_cadastral === 2;
          setCnpjStatus({ status: isActive ? "active" : "inactive", message: data.descricao_situacao_cadastral });
          
          setEmpresa((prev) => {
            const parts = [
              data.logradouro && data.numero ? `${data.logradouro}, ${data.numero}` : data.logradouro,
              data.bairro,
              data.municipio && data.uf ? `${data.municipio} - ${data.uf}` : "",
              data.cep ? `CEP ${data.cep}` : "",
            ].filter(Boolean);

            const next = {
              ...prev,
              razaoSocial: data.razao_social || prev.razaoSocial,
              nomeFantasia: data.nome_fantasia || data.razao_social || prev.nomeFantasia,
              emailContato: data.email || prev.emailContato,
              telefoneContato: data.ddd_telefone_1 || prev.telefoneContato,
              endereco: parts.length ? parts.join(", ") : prev.endereco,
            };
            return next;
          });
          toast.success("Dados sincronizados com a Receita Federal!");
        } else {
          const err = await resp.json().catch(() => ({}));
          setCnpjStatus({ status: "invalid", message: err.message || "CNPJ não encontrado." });
        }
      } catch {
        setCnpjStatus({ status: "invalid", message: "Falha na conexão com a Receita." });
      }
    } else {
      setCnpjStatus({ status: "idle" });
    }
  };

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !supabase) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("A logo deve ter no máximo 2MB.");
      return;
    }
    setUploadingLogo(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${activeTenantId || "sem-tenant"}/logo-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const next = { ...empresa, logoUrl: data.publicUrl };
      setEmpresa(next);
      await saveAppSetting(SETTING_KEY, next);
      toast.success("Logo da empresa atualizada — já aparece no cabeçalho dos contratos.");
    } catch (err: any) {
      toast.error(`Falha ao enviar a logo: ${err.message || err}`);
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleRemoveLogo = async () => {
    const next = { ...empresa, logoUrl: "" };
    setEmpresa(next);
    await saveAppSetting(SETTING_KEY, next);
    toast.info("Logo removida.");
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!empresa.nomeFantasia.trim()) {
      toast.error("O Nome Fantasia é obrigatório.");
      return;
    }

    setIsSaving(true);
    await saveAppSetting(SETTING_KEY, empresa);
    setIsSaving(false);
    toast.success("Dados da empresa salvos e atualizados com sucesso!");
  };

  return (
    <div className="space-y-6 max-w-4xl animate-in fade-in duration-300 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)] flex items-center gap-2">
            Dados da Empresa <Building2 className="w-5 h-5 text-[var(--color-primary-blue)]" />
          </h1>
          <p className="text-sm text-[var(--color-text-muted)]">Gerencie informações cadastrais, fiscais e de contato da sua organização.</p>
        </div>
        <Button 
          onClick={() => handleSave()} 
          disabled={isSaving} 
          className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs shrink-0"
        >
          <Save className="w-3.5 h-3.5" /> {isSaving ? "Salvando..." : "Salvar Alterações"}
        </Button>
      </div>

      <Card className="p-6 space-y-6 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 pb-4 border-b border-[var(--color-border-subtle)]">
            <div className="w-20 h-20 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-sunken)] flex items-center justify-center overflow-hidden shrink-0">
              {empresa.logoUrl ? (
                <img src={empresa.logoUrl} alt="Logo da empresa" className="w-full h-full object-contain p-1.5" />
              ) : (
                <ImageOff className="w-6 h-6 text-[var(--color-text-faint)]" />
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[var(--color-text-muted)] block">Logo da Empresa</label>
              <p className="text-[11px] text-[var(--color-text-muted)] max-w-md">
                Usada no cabeçalho de propostas e contratos gerados pelo sistema. PNG ou JPG, até 2MB.
              </p>
              <div className="flex items-center gap-2 pt-1">
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-sunken)] hover:bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)] cursor-pointer transition-all">
                  {uploadingLogo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  {uploadingLogo ? "Enviando..." : empresa.logoUrl ? "Trocar Logo" : "Enviar Logo"}
                  <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={handleLogoChange} disabled={uploadingLogo} />
                </label>
                {empresa.logoUrl && (
                  <button
                    type="button"
                    onClick={handleRemoveLogo}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-sunken)] hover:bg-danger/10 hover:border-danger/30 hover:text-danger text-[var(--color-text-muted)] transition-all cursor-pointer"
                  >
                    Remover
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[var(--color-text-muted)]">Razão Social *</label>
              <input
                type="text"
                value={empresa.razaoSocial}
                onChange={(e) => setEmpresa({ ...empresa, razaoSocial: e.target.value })}
                className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3.5 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] transition-all font-medium"
                placeholder="Razão Social completa"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[var(--color-text-muted)]">Nome Fantasia *</label>
              <input
                type="text"
                value={empresa.nomeFantasia}
                onChange={(e) => setEmpresa({ ...empresa, nomeFantasia: e.target.value })}
                className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3.5 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] transition-all font-medium"
                placeholder="Nome Fantasia da marca"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[var(--color-text-muted)] flex items-center justify-between">
                <span>CNPJ *</span>
                <span className="text-[10px] text-[var(--color-primary-blue)] font-mono">
                  Sync Automático BrasilAPI
                </span>
              </label>
              <input
                type="text"
                value={empresa.cnpj}
                onChange={handleCnpjChange}
                maxLength={18}
                className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3.5 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] font-mono transition-all"
                placeholder="00.000.000/0001-00"
                required
              />
              <div className="min-h-[16px]">
                {cnpjStatus.status === "checking" && (
                  <p className="text-xs text-[var(--color-text-muted)] flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary-blue)] animate-pulse" /> Buscando dados na Receita...
                  </p>
                )}
                {cnpjStatus.status === "active" && (
                  <p className="text-xs text-success font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> CNPJ Ativo — dados preenchidos
                  </p>
                )}
                {cnpjStatus.status === "inactive" && (
                  <p className="text-xs text-warning font-bold flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> {cnpjStatus.message}
                  </p>
                )}
                {cnpjStatus.status === "invalid" && (
                  <p className="text-xs text-danger font-bold flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> {cnpjStatus.message}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[var(--color-text-muted)]">Inscrição Estadual (IE)</label>
              <input 
                type="text" 
                value={empresa.inscricaoEstadual}
                onChange={(e) => setEmpresa({ ...empresa, inscricaoEstadual: e.target.value })}
                className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3.5 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] font-mono transition-all" 
                placeholder="000.000.000.000" 
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[var(--color-text-muted)] flex items-center gap-1.5">
                <Mail className="w-3 h-3 text-[var(--color-text-faint)]" /> E-mail de Contato
              </label>
              <input
                type="email"
                value={empresa.emailContato}
                onChange={(e) => setEmpresa({ ...empresa, emailContato: e.target.value })}
                className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3.5 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] transition-all font-medium"
                placeholder="contato@empresa.com"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[var(--color-text-muted)] flex items-center gap-1.5">
                <Phone className="w-3 h-3 text-[var(--color-text-faint)]" /> Telefone / SAC
              </label>
              <input
                type="text"
                value={empresa.telefoneContato}
                onChange={(e) => setEmpresa({ ...empresa, telefoneContato: e.target.value })}
                className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3.5 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] transition-all font-mono"
                placeholder="(00) 0000-0000"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[var(--color-text-muted)] flex items-center gap-1.5">
                <Globe className="w-3 h-3 text-[var(--color-text-faint)]" /> Website Institucional
              </label>
              <input
                type="url"
                value={empresa.website}
                onChange={(e) => setEmpresa({ ...empresa, website: e.target.value })}
                className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3.5 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] transition-all font-medium"
                placeholder="https://suaempresa.com.br"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[var(--color-text-muted)] flex items-center gap-1.5">
              <MapPin className="w-3 h-3 text-[var(--color-text-faint)]" /> Endereço Completo
            </label>
            <input
              type="text"
              value={empresa.endereco}
              onChange={(e) => setEmpresa({ ...empresa, endereco: e.target.value })}
              className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3.5 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] transition-all font-medium"
              placeholder="Logradouro, Número - Bairro, Cidade - UF, CEP"
            />
          </div>

          <div className="pt-4 border-t border-[var(--color-border-subtle)] space-y-3">
            <div>
              <h3 className="text-sm font-bold text-[var(--color-text-primary)]">Perfil da empresa para a IA</h3>
              <p className="text-[11px] text-[var(--color-text-muted)]">
                A IA usa estes textos para falar sobre a empresa com os clientes. Escreva como explicaria a um vendedor novo. O que não estiver aqui
                (nem em Produtos) ela não inventa: diz que a equipe confirma. Ela lê na próxima conversa, sem precisar de mais nada.
              </p>
            </div>
            {CAMPOS_IA.map((c) => (
              <div key={c.key} className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--color-text-muted)]">{c.label}</label>
                <textarea
                  rows={c.rows}
                  value={(empresa[c.key] as string) || ""}
                  onChange={(e) => setEmpresa({ ...empresa, [c.key]: e.target.value })}
                  placeholder={c.hint}
                  className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3.5 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] transition-all font-medium resize-y"
                />
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-[var(--color-border-subtle)] flex justify-end">
            <Button 
              type="submit" 
              disabled={isSaving} 
              className="h-9 px-5 text-xs font-bold gap-1.5 shadow-xs"
            >
              <Save className="w-3.5 h-3.5" /> {isSaving ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
