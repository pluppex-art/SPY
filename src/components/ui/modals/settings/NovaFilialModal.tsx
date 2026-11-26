import React, { useEffect, useMemo, useState } from "react";
import { Building2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Modal } from "../../modal";
import { ModalFooter, ModalTitle } from "../../../../pages/finance/components/ModalKit";
import { useIbgeLocalidades } from "../../../../lib/ibgeLocalidades";

type FilialPayload = {
  nome: string;
  cnpj: string;
  cidade: string;
  estado: string;
};

interface NovaFilialModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: (payload: FilialPayload) => void;
  /** "cliente": cliente atendido pela empresa (agência, contabilidade, BPO); CNPJ e endereço são opcionais. */
  tipo?: "filial" | "cliente";
}

const onlyDigits = (value: string) => (value || "").replace(/\D+/g, "");

const formatCnpj = (raw: string) => {
  const d = onlyDigits(raw).slice(0, 14);
  // 00.000.000/0000-00
  const p1 = d.slice(0, 2);
  const p2 = d.slice(2, 5);
  const p3 = d.slice(5, 8);
  const p4 = d.slice(8, 12);
  const p5 = d.slice(12, 14);
  if (d.length <= 2) return p1;
  if (d.length <= 5) return `${p1}.${p2}`;
  if (d.length <= 8) return `${p1}.${p2}.${p3}`;
  if (d.length <= 12) return `${p1}.${p2}.${p3}/${p4}`;
  return `${p1}.${p2}.${p3}/${p4}-${p5}`;
};

const normalizeAndValidateCnpj = (value: string) => {
  const digits = onlyDigits(value);
  const ok = digits.length === 14;
  return { digits, ok };
};

type CnpjApiStatus = "idle" | "checking" | "active" | "inactive" | "invalid";

export function NovaFilialModal({ isOpen, onClose, onSave, tipo = "filial" }: NovaFilialModalProps) {
  const ehCliente = tipo === "cliente";
  const [nome, setNome] = useState("");
  const [cnpjInput, setCnpjInput] = useState("");
  const [cidade, setCidade] = useState("");
  const [estado, setEstado] = useState("");
  const [loading, setLoading] = useState(false);
  const [cnpjStatus, setCnpjStatus] = useState<{ status: CnpjApiStatus; message?: string }>({ status: "idle" });
  const { estados, municipios, loadingMunicipios } = useIbgeLocalidades(estado);

  const cnpjNormalized = useMemo(() => normalizeAndValidateCnpj(cnpjInput), [cnpjInput]);

  useEffect(() => {
    if (!isOpen) return;
    setNome("");
    setCnpjInput("");
    setCidade("");
    setEstado("");
    setLoading(false);
    setCnpjStatus({ status: "idle" });
  }, [isOpen]);

  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!isOpen) return;
    setTouched(false);
  }, [isOpen]);

  const handleCnpjChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCnpj(e.target.value);
    setCnpjInput(formatted);
    const digits = formatted.replace(/\D/g, "");
    if (digits.length === 14) {
      setCnpjStatus({ status: "checking" });
      try {
        const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
        if (resp.ok) {
          const data = await resp.json();
          const isActive = data.situacao_cadastral === 2;
          setCnpjStatus({ status: isActive ? "active" : "inactive", message: data.descricao_situacao_cadastral });
          if (!nome && (data.nome_fantasia || data.razao_social)) setNome(data.nome_fantasia || data.razao_social);
          if (data.uf) setEstado(data.uf);
          if (data.municipio) setCidade(data.municipio);
        } else {
          const err = await resp.json().catch(() => ({}));
          setCnpjStatus({ status: "invalid", message: err.message || "CNPJ não encontrado." });
        }
      } catch {
        setCnpjStatus({ status: "invalid", message: "Falha na conexão." });
      }
    } else {
      setCnpjStatus({ status: "idle" });
    }
  };

  const canSubmit = useMemo(() => {
    if (loading) return false;
    if (!nome.trim()) return false;
    if (ehCliente) return !cnpjInput.trim() || cnpjNormalized.ok;
    if (!cidade.trim()) return false;
    if (!estado.trim()) return false;
    if (!cnpjNormalized.ok) return false;
    return true;
  }, [loading, nome, cidade, estado, cnpjInput, ehCliente, cnpjNormalized.ok]);

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setTouched(true);
    if (!canSubmit) return;

    setLoading(true);
    try {
      const payload: FilialPayload = {
        nome: nome.trim(),
        cnpj: cnpjNormalized.digits,
        cidade: cidade.trim(),
        estado: estado.trim(),
      };

      onSave?.(payload);
    } finally {
      setLoading(false);
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-2xl"
      title={<ModalTitle icon={Building2} title={ehCliente ? "Novo cliente" : "Nova filial"} subtitle={ehCliente ? "Cliente que a sua empresa atende: os dados dele ficam separados e entram na visão consolidada." : "Cadastre os dados da unidade."} />}
    >
      <div className="space-y-4">
        <form id="nova-filial-form" onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="filial-nome" className="text-[11px] font-bold text-[var(--color-text-primary)]">
                {ehCliente ? "Nome do cliente" : "Nome da unidade"}
              </label>
              <input
                id="filial-nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder={ehCliente ? "Ex.: Padaria São José" : "Ex.: Clínica Centro / Unidade Zona Sul"}
                className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-lg px-3 py-2 text-xs text-[var(--color-text-primary)] focus:border-[#2563EB] focus:bg-[var(--color-surface)] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 transition-all"
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="filial-cnpj" className="text-[11px] font-bold text-[var(--color-text-primary)]">
                CNPJ
              </label>
              <input
                id="filial-cnpj"
                value={cnpjInput}
                onChange={handleCnpjChange}
                placeholder="00.000.000/0000-00"
                inputMode="numeric"
                className={
                  "w-full bg-[var(--color-surface)] border rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 transition-all " +
                  (touched && !cnpjNormalized.ok
                    ? "border-rose-500/60 focus:ring-rose-500/20"
                    : "border-white/10 focus:border-[#2563EB] focus:ring-[#2563EB]/30")
                }
                required
              />
              <div className="mt-1 min-h-[18px]">
                {cnpjStatus.status === "checking" && (
                  <p className="text-[10px] text-blue-400 animate-pulse font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping" /> Buscando...
                  </p>
                )}
                {cnpjStatus.status === "active" && (
                  <p className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> CNPJ Ativo
                  </p>
                )}
                {cnpjStatus.status === "inactive" && (
                  <p className="text-[10px] text-amber-400 font-bold flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> {cnpjStatus.message}
                  </p>
                )}
                {cnpjStatus.status === "invalid" && (
                  <p className="text-[10px] text-rose-400 font-bold flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> {cnpjStatus.message}
                  </p>
                )}
                {touched && !cnpjNormalized.ok && cnpjStatus.status === "idle" && (
                  <p className="text-[11px] text-rose-400 font-semibold">Informe um CNPJ válido com 14 dígitos.</p>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label htmlFor="filial-estado" className="text-[11px] font-bold text-[var(--color-text-primary)]">
                Estado (UF)
              </label>
              <select
                id="filial-estado"
                value={estado}
                onChange={(e) => { setEstado(e.target.value); setCidade(""); }}
                className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-lg px-3 py-2 text-xs text-[var(--color-text-primary)] focus:border-[#2563EB] focus:bg-[var(--color-surface)] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 transition-all uppercase"
                required
              >
                <option value="">Selecione...</option>
                {estados.map((uf) => <option key={uf.sigla} value={uf.sigla}>{uf.sigla}</option>)}
              </select>
            </div>

            <div className="space-y-2 md:col-span-2">
              <label htmlFor="filial-cidade" className="text-[11px] font-bold text-[var(--color-text-primary)]">
                Cidade
              </label>
              {estado && municipios.length > 0 ? (
                <select
                  id="filial-cidade"
                  value={cidade}
                  onChange={(e) => setCidade(e.target.value)}
                  className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-lg px-3 py-2 text-xs text-[var(--color-text-primary)] focus:border-[#2563EB] focus:bg-[var(--color-surface)] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 transition-all"
                  required
                >
                  <option value="">{loadingMunicipios ? "Carregando..." : "Selecione..."}</option>
                  {municipios.map((m) => <option key={m.id} value={m.nome}>{m.nome}</option>)}
                </select>
              ) : (
                <input
                  id="filial-cidade"
                  value={cidade}
                  onChange={(e) => setCidade(e.target.value)}
                  placeholder={estado ? "Digite a cidade" : "Escolha o estado primeiro"}
                  className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-lg px-3 py-2 text-xs text-[var(--color-text-primary)] focus:border-[#2563EB] focus:bg-[var(--color-surface)] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 transition-all"
                  required
                />
              )}
            </div>
          </div>
          <ModalFooter onCancel={onClose} submitLabel={ehCliente ? "Cadastrar cliente" : "Cadastrar filial"} saving={loading} disabled={!canSubmit} />
        </form>
      </div>
    </Modal>
  );
}

