# Regra de datas dos relatórios financeiros

Cada relatório usa a data que responde à pergunta dele. Tela e servidor usam a mesma regra (`src/lib/dre/dre.ts` e `src/pages/finance/lib/financeEngine.ts`).

| Pergunta | Regime | Data usada | Quando a coluna está vazia (lançamento antigo) |
|---|---|---|---|
| Quanto a empresa ganhou ou perdeu no período? (DRE, comparativos, resultado previsto) | Competência | `competencia_date` | `date_normalized` |
| Quanto dinheiro entrou e saiu? (entradas e saídas do mês, fluxo de caixa, performance mensal e anual, resultado realizado) | Caixa (só `Pago`) | `data_pagamento` | `date_normalized` |
| O que vence, está atrasado ou entra na agenda? (a vencer, atrasado, previsto 7 e 30 dias, inadimplência) | Vencimento | `date_normalized` | — |
| Período bloqueado para fechamento | Caixa | `data_pagamento` (regra nova) | `date_normalized` |

- A baixa de um lançamento aberto grava `data_pagamento` = dia da baixa (fuso de São Paulo). Lançamento criado já como `Pago` recebe a data do próprio lançamento, preenchida pelo banco (M2).
- Em 21/11/2026 nenhum lançamento tem `data_pagamento` e só 1 tem `competencia_date` diferente de `date_normalized`, então os relatórios mostram hoje os mesmos números de antes.
- Fora desta regra, de propósito: custo de marketing por vencimento no fallback de aquisição (`server/acquisition.ts`) e saldo de conta (não depende de data).
