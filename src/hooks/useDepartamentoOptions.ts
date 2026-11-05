import { useMemo } from "react";
import { useData } from "../contexts/DataContext";

// Departamentos padrão, por bloco da empresa (a ordem é a da lista). Os que já existem em squads entram antes.
export const DEPARTAMENTOS_PADRAO = [
  "Diretoria",
  "Vendas",
  "Marketing",
  "Sucesso do Cliente",
  "Atendimento",
  "Financeiro",
  "Administrativo",
  "RH",
  "Operações",
  "Logística",
  "Compras",
  "Qualidade",
  "Projetos",
  "Implantação",
  "Tecnologia",
  "Produto",
  "Design",
  "Dados e BI",
  "Jurídico",
  "Geral",
];
const DEFAULT_DEPARTAMENTOS = DEPARTAMENTOS_PADRAO;

export function useDepartamentoOptions(): string[] {
  const { squads } = useData();

  return useMemo(() => {
    const fromSquads = Array.from(
      new Set(squads.map((s: any) => s.departamento).filter(Boolean))
    );
    if (fromSquads.length === 0) return DEFAULT_DEPARTAMENTOS;
    return Array.from(new Set([...fromSquads, ...DEFAULT_DEPARTAMENTOS]));
  }, [squads]);
}
