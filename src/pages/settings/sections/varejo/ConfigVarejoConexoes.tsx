import { ConfigIntegracoesApps } from "../integracoes/ConfigIntegracoesApps";

/** Configuração do módulo Varejo: conexões com o ERP (Max Data). */
export function ConfigVarejoConexoes() {
  return (
    <ConfigIntegracoesApps
      scope={{
        onlyIds: ["maxdata", "maxdata-estoque"],
        title: "Varejo — Conexões",
        subtitle: "Conexões do módulo com a Max Data: notas fiscais e estoque. Cada conexão tem as próprias chaves e é testada separadamente.",
      }}
    />
  );
}
