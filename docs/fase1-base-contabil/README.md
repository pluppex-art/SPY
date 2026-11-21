# Fase 1 — Base contábil (desenho)

**Status:** proposta para decisão. **Nada foi aplicado ao banco de produção.** Só houve leitura (`SELECT`) em 21/11/2026.
**O que há nesta pasta:** este documento e quatro migrações propostas em `migracoes/` (M1 a M4). Elas ficam aqui de
propósito, e **não** em `supabase/migrations/`, para ninguém aplicar por engano.

---

## 0. Em uma página

1. O financeiro hoje **não sabe qual venda gerou qual dinheiro**, não separa **quando o dinheiro entrou** de quando venceu,
   e o DRE **não tem CMV, EBITDA nem resultado financeiro**. A base para corrigir isso cabe em **seis colunas novas de
   categoria e cinco de lançamento**, sem tabela paralela e sem tocar em nenhum dado antigo.
2. Toda linha antiga continua exatamente como está. A regra nova vale só para o que for gravado **depois**. A marca é a
   coluna `origem_registro`: `NULL` = legado. Os relatórios gerenciais passam a ler só o que não é legado, com um botão para
   incluir o legado.
3. Quatro migrações pequenas, na ordem **M1 → M2 → M3 → M4**, cada uma com "desfazer". Elas foram **testadas num banco
   descartável** (ver seção 5), mas **não** na produção.
4. **Três pontos do briefing não batem com o código e com o banco** (seção 1.2). O mais importante: o DRE **não** é uma
   função única usada por tela e servidor, ele está escrito **duas vezes**.
5. As decisões que dependem de você estão na seção 7 (dez itens curtos).

---

## 1. O que eu verifiquei, o que encontrei de diferente e o que não verifiquei

### 1.1 Verificado (fonte entre parênteses)

| Fato | Fonte |
|---|---|
| `finance_entries.date` é **texto** (vencimento). `date_normalized` é coluna **gerada** a partir dele. `competencia_date` existe, é comum (não gerada) e fica vazia em 5 linhas. | `information_schema`, `pg_attribute` |
| Não há `CHECK` de `status` nem de `type`. Existem **2 linhas** no vocabulário antigo (`type='Receita'`, `status='Recebido'`). | `pg_constraint`, `SELECT` |
| Há índice único parcial `(proposal_id, description)` e `id` é texto, **chave primária global** (não é por empresa). | `pg_indexes`; comentário em `server.ts:2474` |
| Triggers de `finance_entries`: `trg_guard_finance_period_lock` (só **UPDATE/DELETE**), `trg_external_payment_received` (INSERT/UPDATE), `trg_permission_log_financeiro`, `trg_spy_touch_updated_at`. | `pg_trigger` |
| O bloqueio de período olha o **vencimento** (`date_normalized`), só de lançamento já `Pago`, e **deixa passar quem não é usuário logado** (service role, N8N, rotinas). | `pg_get_functiondef` |
| `trg_external_payment_received` dispara o evento "Pagamento Recebido" para **qualquer** lançamento que vira `Pago`, **inclusive despesa paga** (`type='Pagar'`). | `pg_get_functiondef` |
| `finalizar_venda` grava **um** lançamento de receita pelo total (`id = 'venda_<uuid>'`, categoria só em texto `'Vendas'`, **sem** `category_id`, `competencia_date`, `conta_bancaria_id`), ignora `venda_pagamentos` e grava o caminho de volta em `vendas.finance_entry_id`. | `pg_get_functiondef`; `20261207_pdv_alinhamento.sql` |
| `estornar_venda` já existe: lança uma saída `type='Pagar'`, categoria texto `'Estornos'`; no crediário **ainda não recebido, apaga o lançamento**. | `20261207_pdv_alinhamento.sql` |
| `venda_items` já tem `custo_unitario`, `valor_desconto` e campos de comissão. Em `src/pages/varejo/Vendas.tsx`, `custo_unitario` **não aparece** (a tela não o grava). | `information_schema`; `grep` |
| `compras.fornecedor` é **texto** (sem chave para `varejo_fornecedores`) e `compras` não gera conta a pagar. | `information_schema` |
| A API `/api/v1/finance-entries` (chave de API, usada pelo `sync-to-spy` da To Na Pista) grava com service role, aceita `competencia_date` e `conta_bancaria_id` e preenche `competencia_date = date` se faltar. | `server.ts:2825-2846`, comentário em `server.ts:2606` |
| Contagens de hoje: 4.619 lançamentos; 4.607 sem conta bancária; 27 sem `category_id`; 5 sem competência; 3 vindos do PDV (`id like 'venda_%'`). Categorias: 45 (38 de receita, 7 de despesa, 5 empresas), 43 sem subtipo. | `SELECT` |

### 1.2 Onde o briefing não bate com o que está no código e no banco

1. **"Função única de DRE usada pela tela e pelo servidor" — não é bem assim.** A tela usa `calcularDRE`
   (`financeEngine.ts`), mas a rota `GET /api/finance/dre-summary` (`server.ts:1388`) **reescreve a mesma conta inline**.
   Além disso, a tela filtra por `date` (texto convertido) e o servidor por `date_normalized`. Qualquer mudança no DRE tem
   que ser feita **nos dois lugares**, ou os dois precisam passar a usar o mesmo módulo (proposta na seção 4).
2. **"A venda não tem coluna que ligue ao financeiro" — tem, mas só de um lado.** `vendas.finance_entry_id` aponta da venda
   para **um** lançamento. Falta o caminho inverso (`finance_entries.venda_id`) e a ligação de **uma venda para vários**
   lançamentos (pagamento misto, parcelas). Hoje a divisão do "Misto" fica só em `venda_pagamentos` e o financeiro recebe
   um único valor.
3. **Estorno hoje entra como despesa.** O lançamento `'Estornos'` é `type='Pagar'` sem `category_id`, então o DRE atual o
   classifica como **despesa variável** (`dreTipoDe` cai nesse padrão). O correto é reduzir a receita (dedução). Só vale
   para vendas novas, pela regra de não mexer no legado.

### 1.3 Não verifiquei (e o que fazer)

- **Fluxos do N8N.** Não tenho acesso a eles. A seção 6.3 lista o que alguém precisa conferir lá.
- **Menu do financeiro com 45 itens**, **o total de migrações (a pasta tem 257 arquivos)**, tamanho do código e demais números do briefing que não estão na
  tabela acima.
- **Quem escuta** o evento "Pagamento Recebido" (`dispatch_external_integration_event`) e se há fluxo que dependa dele.
- **Telas abertas no navegador** e **políticas de acesso por cargo** (só li o código).

---

## 2. Plano de contas padrão (dois níveis, preso ao DRE)

**Nível 1 = grupo (linha fixa do DRE). Nível 2 = conta.** A empresa só **renomeia** as contas padrão e **cria contas
novas dentro de um grupo**. Ela nunca escolhe a linha do DRE: a conta **herda** a do grupo (garantido por gatilho).

| Cód. | Grupo (linha do DRE) | Contas padrão (nível 2) |
|---|---|---|
| 1 | **Receita bruta** | 1.01 Venda de produtos · 1.02 Venda de serviços · 1.03 Mensalidades e contratos recorrentes · 1.04 Outras receitas operacionais |
| 2 | **Deduções da receita** | 2.01 Impostos sobre vendas (DAS, ICMS, ISS, PIS/COFINS) · 2.02 Devoluções e estornos de vendas · 2.03 Descontos concedidos |
| 3 | **CMV / CSP** | 3.01 Custo das mercadorias vendidas · 3.02 Custo dos serviços prestados · 3.03 Fretes sobre compras · 3.04 Embalagens e insumos diretos |
| 4 | **Despesas comerciais** | 4.01 Marketing e anúncios · 4.02 Comissões · 4.03 Frete e entrega de vendas · 4.04 Taxas de cartão e meios de pagamento · 4.05 Brindes e eventos |
| 5 | **Despesas administrativas** | 5.01 Aluguel e condomínio · 5.02 Energia, água e internet · 5.03 Software e assinaturas · 5.04 Contabilidade e jurídico · 5.05 Material de escritório · 5.06 Manutenção · 5.07 Seguros · 5.08 Veículos e combustível · 5.09 Outras |
| 6 | **Despesas com pessoal** | 6.01 Salários · 6.02 Encargos · 6.03 Benefícios · 6.04 Pró-labore · 6.05 Férias e 13º · 6.06 Terceirizados e freelancers · 6.07 Treinamento |
| 7 | **Depreciação e amortização** | 7.01 Depreciação · 7.02 Amortização |
| 8 | **Resultado financeiro** | 8.01 Receitas financeiras · 8.02 Juros e multas pagos · 8.03 Tarifas bancárias · 8.04 IOF |
| 9 | **IRPJ e CSLL** | 9.01 IRPJ · 9.02 CSLL |
| 10 | **Fora do resultado (não entra no DRE)** | 10.01 Empréstimos recebidos · 10.02 Pagamento de empréstimos (principal) · 10.03 Aportes de sócios · 10.04 Retiradas de sócios / distribuição de lucros · 10.05 Investimentos e compra de imobilizado · 10.06 Compra de mercadoria para estoque |

Total: 10 grupos e 46 contas. Regras que valem por trás da tabela:

- **CMV de mercadoria não vem de pagamento.** Compra de mercadoria vai para `10.06` (fora do DRE: é estoque). O custo entra
  no DRE **na venda**, calculado de `venda_items.quantidade × custo_unitario`. Assim a compra não conta duas vezes. `3.02`
  (serviços) e `3.03/3.04` continuam sendo lançados à mão. **Risco:** hoje o PDV não grava `custo_unitario` (seção 1.1);
  sem isso o CMV sai zerado e o lucro inflado (decisão 3).
- **Simples Nacional:** o DAS entra em `2.01` e `9.01/9.02` ficam sem uso. Lucro presumido ou real usa as duas (decisão 1).
- **Estorno de venda** vai em `2.02` e **reduz a receita** (hoje vira despesa, seção 1.2).
- **Depreciação** não é caixa: ver `afeta_caixa` na decisão 5.
- **Plano padrão só é aplicado por chamada explícita**, empresa por empresa (`finance_aplicar_plano_padrao`). As empresas atuais
  não recebem nada sozinhas, e os lançamentos antigos continuam com as categorias antigas.

---

## 3. Campos novos

### 3.1 Em `finance_categories` (migração M1)

`parent_id`, `codigo`, `linha_dre` (10 valores fixos), `nivel` (1 ou 2), `padrao`, `ativa`. As colunas antigas `tipo` e
`subtipo` **ficam** (o legado e o DRE antigo continuam lendo).

### 3.2 Em `finance_entries` (migrações M2 e M4)

| Campo | Regra |
|---|---|
| `data_pagamento` (date) | Dia em que o dinheiro **de fato** se moveu. Preenchida ao baixar (se vier vazia, usa o vencimento). É a data do **fluxo de caixa** e do bloqueio de período para baixas. |
| `venda_id` (uuid → `vendas`) | Venda de origem. **Uma venda pode ter vários lançamentos** (pagamento misto, parcelas). Gatilho confere que a venda é **da mesma empresa**. Substitui, na Fase 2, o caminho único `vendas.finance_entry_id` (que fica até lá). |
| `origem_registro` | `spy` (usuário na tela/PDV), `api` (service role: N8N, rotinas), `importacao` (planilha, OFX, Pluggy), `externo` (sistema de terceiros). **`NULL` = legado.** Sem `DEFAULT` de propósito: assim as linhas antigas não são alteradas. Quem grava sem usuário logado vira `api` automaticamente. |
| `nao_operacional` | Empréstimo, aporte, retirada, investimento. Fica `true` sozinho quando a categoria é do grupo 10. O DRE ignora esses lançamentos (eles aparecem só no fluxo de caixa). |
| `estorno_de` (→ `finance_entries`) | Lançamento que este estorno desfaz. **Só um estorno por pagamento** (índice único) e **só de pagamento confirmado**. |
| Conta bancária na baixa (**M4**, separada) | Para `origem_registro='spy'`, `Pago` exige `conta_bancaria_id` e `data_pagamento`. Para `api` e `importacao` **não barra** (para não quebrar o N8N). Esses casos viram um relatório de "baixas sem conta". |

Regras adicionais do gatilho de M2:

- **Pagamento confirmado não se edita, se estorna** (nas linhas da regra nova): não muda valor, tipo, status, data de
  pagamento, conta, competência, categoria nem venda. **Descrição, observações e etiquetas ainda mudam.** O botão atual
  "Voltar para A Vencer" (Cobranças e listas) deixa de valer e vira "Estornar".
- `competencia_date` é preenchida sempre (vencimento, se vier vazia). **Linha antiga nunca "migra" para a regra nova.**
- Os gatilhos atuais (período bloqueado, "Pagamento Recebido", permissão do módulo, `updated_at`) continuam.
- **RLS:** não muda. A política atual `tenant_isolation` cobre as colunas novas.

---

## 4. O DRE completo e como `calcularDRE` muda

```
 Receita bruta                      (grupo 1)            ← Receber, competência
 (−) Deduções                       (grupo 2)            ← impostos, devoluções/estornos, descontos
 = Receita líquida
 (−) CMV / CSP                      (grupo 3)            ← mercadoria: calculado na venda; serviços: lançado
 = Lucro bruto
 (−) Despesas comerciais            (grupo 4)
 (−) Despesas administrativas       (grupo 5)
 (−) Despesas com pessoal           (grupo 6)
 = EBITDA                                                ← antes de depreciação, juros e impostos
 (−) Depreciação e amortização      (grupo 7)
 = Resultado operacional (EBIT)
 (+/−) Resultado financeiro         (grupo 8)
 = Lucro antes do IR/CSLL
 (−) IRPJ e CSLL                    (grupo 9)
 = Lucro líquido
 ─ Fora do resultado (grupo 10): só no fluxo de caixa, nunca no DRE
```

**O que muda hoje → depois** (ver `src/pages/finance/lib/financeEngine.ts`):

| Hoje | Depois |
|---|---|
| Filtra por `date` (vencimento) na tela e por `date_normalized` no servidor. | Filtra por **`competencia_date`** nos dois (índice novo em M2). Para linha legada, cai em `date_normalized`. |
| "Lucro bruto" = receita − impostos. | **Lucro bruto = receita líquida − CMV**. Impostos passam a ser dedução. |
| Despesa vai para uma de 4 linhas (`subtipo`); sem subtipo vira "variável". | A linha vem de `linha_dre` da categoria. Sem categoria na regra nova = **não entra e vira pendência** (o gatilho de M2 não barra, a tela avisa). |
| Toda entrada (`Receber`) conta como receita. | Só conta o que for do grupo 1 (e 8.01 no financeiro). Entrada em `nao_operacional` é ignorada. |
| Sem CMV, EBITDA, depreciação nem resultado financeiro. | As cinco linhas novas. CMV de mercadoria vem de `venda_items` (decisão 3). |
| Estorno = despesa variável. | Estorno reduz a receita (conta 2.02). |
| Regime "pago" = `status === 'Pago'` por vencimento. | Regime "caixa" usa **`data_pagamento`**. |
| Duas implementações (tela e servidor). | **Um módulo compartilhado** importado pela tela e pelo servidor (proposta). O servidor passaria a chamar o mesmo código, com teste. |

**Legado:** o DRE antigo continua funcionando para as linhas legadas (botão "incluir legado"). Para o legado, os relatórios
mostram o mesmo número de hoje, só com a mesma limitação de hoje.

---

## 5. Migrações propostas

| Arquivo | O que faz | Depende de | Risco |
|---|---|---|---|
| `M1_plano_de_contas.sql` | Colunas novas em `finance_categories`, regras (herança da linha, padrão protegido) e a função `finance_aplicar_plano_padrao` (**não roda sozinha**). | nada | Baixo. Aditiva. |
| `M2_finance_entries_campos.sql` | Cinco colunas, quatro índices, `finance_parse_date`, gatilho `finance_entries_regra_v2`. | M1 | Médio: o gatilho passa a rodar em **todo** insert/update de `finance_entries` (inclusive N8N). |
| `M3_bloqueio_de_periodo.sql` | O bloqueio também vale para INSERT pago e usa `data_pagamento` na regra nova. **Mantém** a exceção de service role/N8N. | M2 | Baixo/médio. |
| `M4_exigir_conta_na_baixa.sql` | Exige conta e data de pagamento ao baixar pela tela/PDV. | M2 + **telas e `finalizar_venda` ajustadas** | **Alto se aplicada antes das telas**: a tela de baixa passa a dar erro. |

Todas têm RLS inalterada (nenhuma tabela nova), índices e um bloco **DESFAZER** no fim do arquivo.

### O que eu testei (e o que não)

Montei um **banco descartável em memória** (PGlite) com o formato de `finance_entries`, `finance_categories`, `vendas`,
período bloqueado e o gatilho de bloqueio atual, copiados do que li na produção. Apliquei M1 a M4, rodei as situações
abaixo e depois **desfiz na ordem inversa**. Resultado: **todas as 34 verificações passaram**.

- Plano padrão cria 10 grupos e 46 contas; segunda chamada cria 0; outra empresa não recebe nada.
- Conta nova herda a linha do grupo; plano padrão só renomeia/inativa; não existe 3º nível; grupo de outra empresa é recusado.
- Lançamentos antigos ficaram **idênticos** depois de M1 e M2.
- Gravação sem usuário vira `api`, com `data_pagamento` e competência preenchidas; usuário logado vira `spy`; categoria do grupo 10 marca não operacional.
- Pagamento confirmado: não altera valor, não volta para "A Vencer"; a descrição ainda muda. Estorno: um por pagamento; não estorna o que não foi pago; venda inexistente é recusada; linha antiga não muda para a regra nova.
- Período bloqueado: INSERT pago por usuário é barrado; pendente passa; N8N/service role passa (como hoje).
- M4: baixa sem conta pela tela é recusada; pelo N8N passa.
- **Desfazer** devolve as colunas originais e o **mesmo comportamento** do bloqueio de hoje (o texto da função fica reformatado).

**O que isso NÃO prova:** o banco de teste **não é a produção**. Não passaram por ele a RLS real, os outros gatilhos reais
(permissão do módulo, "Pagamento Recebido"), nem o volume de 4,6 mil linhas. Antes de aplicar: rodar numa **branch do
Supabase** com cópia dos dados.

### Ordem sugerida de aplicação

1. M1 (sem efeito visível). 2. M2 (nasce o campo de origem). 3. Telas e `finalizar_venda` enviando conta/data/categoria.
4. M4. 5. M3. 6. Aplicar o plano padrão empresa por empresa, quando a empresa quiser. **Cada passo pode ser desfeito sozinho.**

---

## 6. O que seria afetado (a conferir)

### 6.1 Telas e código do navegador

`FinanceiroDRE.tsx`, `FinanceiroRelatorios.tsx`, `financeEngine.ts` (DRE, saldos, previsto×realizado), `financeDates.ts`,
`GenericFinanceiroList.tsx` (criar/baixar/editar; categoria e conta obrigatórias), `FinanceiroCobrancas.tsx` ("Liquidada" e
"voltar para A Vencer" viram baixa e estorno), `FinanceiroComissoes.tsx` e `FinanceiroFolha.tsx` (gravam lançamentos),
`FinanceiroContatos.tsx`, `FinanceiroGestao.tsx`, `FinanceiroOrcamentos.tsx` (orçamento por categoria), `FinanceiroPessoas.tsx`,
`TagSelect.tsx`, hooks `useFinanceEntriesList`, `useFinanceEntriesResumo`, `useFinanceTransacoesList`, `useIndicadores`,
`DataContext.tsx` (insert na linha 3267 e carga completa do financeiro no navegador), `StrategicalView.tsx`,
`revenueMetrics.ts`, `saleCalculator.ts`, `TimelineSection.tsx` (histórico de vendas pelo `id` do lançamento),
`AdminBillingTab.tsx`/`AdminSaaS.tsx`.

### 6.2 Servidor e banco

- `server.ts`: `GET /api/finance/dre-summary` (reescreve a conta e filtra por `date_normalized`), `GET` de listagem com cache
  (`finance-entries-list`), `POST /api/v1/finance-entries` (**chave de API**, usada pelo `sync-to-spy`),
  `server/acquisition.ts` (custo de marketing lendo a **categoria em texto**, por `ilike`; manter o texto da categoria
  gravado), `server/agendamento.ts` (grava `tnp_fat_` e `agd_` com `category_id`), `financialReportPdf.ts`,
  `notificationCron.ts`.
- SQL: `finalizar_venda` (um lançamento pelo total, sem conta e sem categoria), `estornar_venda`
  (`'Estornos'` como despesa; apaga o crediário pendente), as funções de `20260924_b_tenant_scope_definer_functions.sql`
  e `20261013_repoint_verticals_to_products.sql` que **inserem** em `finance_entries`, o gatilho
  `trg_external_payment_received`, a conciliação (Pluggy/OFX) quando cria lançamento (precisa marcar `importacao`, conta e
  `data_pagamento`).

### 6.3 Fluxos do N8N (não consegui ver; alguém precisa conferir)

1. Qualquer fluxo que faz **INSERT/UPDATE direto** em `finance_entries` (nó do Supabase): com M2 ele passa a ser `api` e a
   receber `data_pagamento` e `competencia_date` automáticos. **Confirmar** que nenhum depende de editar um lançamento já
   `Pago` (a regra nova bloqueia isso nas linhas novas).
2. Fluxos que chamam `POST /api/v1/finance-entries`: nada muda no contrato (campos novos opcionais).
3. Fluxos que **escutam "Pagamento Recebido"**: hoje o evento sai também para despesa paga e passaria a sair também no
   estorno (que é `Pagar`/`Pago`). Decidir se o gatilho deve filtrar `type='Receber'`.
4. Fluxos que **leem** `finance_entries` e somam por `category` (texto), por `date` ou por `status`: o significado de
   `date` não muda, mas as contas novas têm nomes diferentes dos antigos.
5. Fluxos que cancelam venda: devem usar `estornar_venda`, nunca apagar o lançamento.

---

## 7. Decisões que dependem de você

1. **Regime tributário padrão:** Simples Nacional (DAS em Deduções; sem linha de IRPJ/CSLL) ou lucro presumido/real? Uma
   configuração por empresa, ou fixo?
2. **Taxa de cartão:** despesa comercial (proposto) ou resultado financeiro?
3. **CMV de mercadoria:** calculado na venda pelo custo do produto (proposto). E se o produto não tiver custo cadastrado:
   avisar, bloquear a venda ou aceitar custo zero?
4. **Estorno:** reduz a receita (proposto). No crediário não recebido, o estorno **apaga** o lançamento hoje. Manter ou
   marcar como cancelado para preservar o histórico?
5. **Depreciação:** aceitar um campo `afeta_caixa` (falso = só no DRE, sem conta bancária), que **não** estava na sua lista?
6. **N8N e período bloqueado:** manter que service role/N8N **não** são barrados (proposto, para não quebrar fluxos) ou
   passar a barrar?
7. **Conta bancária:** obrigatória na baixa **pela tela/PDV** (M4) e **não** para API/importação (proposto). Quem decide a
   conta do PDV: uma conta "Caixa" (tipo `CARTEIRA`) por empresa?
8. **Um DRE só:** módulo TypeScript compartilhado entre tela e servidor (proposto) ou função SQL no banco?
9. **Bloqueio de período:** por data de pagamento nas baixas (proposto) ou por competência?
10. **Plano padrão para empresas que já existem:** oferecer só a quem pedir (proposto) ou também como assistente na tela?

---

## 8. Riscos principais

- **M2 roda em todo gravar.** Se um fluxo grava algo que o gatilho recusa (por exemplo, editar um `Pago` novo), ele passa a
  dar erro. Mitigação: aplicar em branch com dados copiados e acompanhar os logs.
- **M4 antes das telas quebra a baixa.** Por isso fica separada e depende de ajuste prévio.
- **Sem custo no item da venda o CMV sai zerado**, e o lucro aparece maior do que é (decisão 3).
- **Duas implementações do DRE** continuam sendo um risco até a decisão 8 ser implantada.
- **O banco de teste não é a produção** (seção 5).
