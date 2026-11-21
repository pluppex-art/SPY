# Tabela de preços única — o que existe, o que já puxa certo e o que falta

**Resposta curta:** sim, existem **8 lugares** que guardam o preço de um item de catálogo. Um deles é a tabela certa
(`public.products`, o "Catálogo & Produtos"). Dos outros 7, **4 já são cópias mortas** (dados iguais em `products`, sem uso no
código), **3 são separados por um motivo de negócio**. Fora desses 8, os planos de assinatura do SPY **já puxam o preço de
`products` por gatilho**. O que de fato estava "puxando errado" eram **três coisas pequenas**, que esta entrega corrige.

> **Nada foi aplicado ao banco.** Só leitura (`SELECT`) em 21/11/2026. O SQL está em `migracoes/P1_TUDO_EM_UM.sql`,
> testado num banco descartável, esperando a sua autorização. O código desta entrega **funciona sem o SQL** (ele só fica
> ainda melhor com o SQL).

---

## 1. Os 8 lugares (verificados no banco e no código)

| # | Onde fica o preço | Linhas hoje | Quem usa no código | Situação |
|---|---|---|---|---|
| 1 | **`products`** — `price`, `cost`, `margin`, `commission`, `implementation_fee` | 39 ativos, 5 empresas | 72 arquivos mencionam a tabela (PDV, OS, propostas, compras, imobiliário, automotivo, landing pages…) | **A tabela única (destino).** |
| 2 | `estoque_items.price` (texto, "R$ 35,00") | 2 | **nenhum** | Cópia morta: as 2 linhas **já estão em `products`**, mesmo id, mesmo valor. |
| 3 | `clinica_servicos.valor_particular` | 2 | **nenhum** | Cópia morta: 2 de 2 em `products` (tipo Serviço), valores iguais. |
| 4 | `imobiliario_imoveis.valor` | 2 | só o adaptador `ativosCatalogo.ts`, que **lê `products`** e converte para o formato antigo | Cópia morta: 2 de 2 em `products`, valores iguais. |
| 5 | `imobiliario_veiculos.valor` | 2 | só o adaptador `veiculosCatalogo.ts`, que **lê `products`** | Cópia morta: 2 de 2 em `products`, valores iguais. |
| 6 | `saude_exames_base.valor` e `custo` | 70 (1 empresa) | 6 arquivos (Comparação de Tabelas, Base de Exames) | **Separada de propósito**: é a base para comparar com a tabela de preços de um parceiro. |
| 7 | `fornecedor_catalogo_itens.custo` | 0 (recurso novo) | 3 arquivos (Compras) | **Separada de propósito**: custo **por fornecedor** (um produto pode ter vários). Liga a `products` por `product_id`. |
| 8 | `agendamento_config.preco_dia_util` e `preco_fim_semana` | 2 | `server/agendamento.ts` | **Separada de propósito**: preço da reserva por dia da semana (decisão já tomada: vale o preço do dia da marcação). |

**Fora dos 8:**
- **Planos e créditos do SPY** (`subscription_plans`, `credit_tiers`, `checkout_config`): **já puxam de `products`.** O gatilho
  `sync_plans_from_product` (função lida) copia `price` para `price_cents` quando o produto muda; existe também
  `sync_plan_setup_from_implementation` (só vi o gatilho, não a função). Não precisa unificar nada.
- **`maxdata_produtos`** (155.260 linhas): espelho do ERP Max Data, que continua separado por decisão sua.
- **Cópias no momento da operação** (devem ser cópias mesmo, para o histórico não mudar quando o preço muda):
  `proposal_items.preco_unitario` (17), `venda_items.preco_unitario` (0 do PDV), `ordem_servico_itens.valor_unitario` (8),
  `nota_entrada_itens` (0), `compras.custo_unitario` (4).

## 2. O que NÃO estava puxando certo (e o que esta entrega faz)

| Problema encontrado | Prova | Correção |
|---|---|---|
| **O PDV não gravava o custo no item da venda** (`venda_items.custo_unitario`). Sem isso o CMV do DRE fica zerado. | A tela de vendas não menciona a coluna; o banco não tem item de venda do PDV para conferir. | **Código:** o item do carrinho guarda o custo do cadastro e a venda grava; sem custo cadastrado grava `null` (nunca zero). |
| **A margem era calculada em 5 telas diferentes**, e a **nota de entrada muda o custo no banco sem recalcular a margem** (função `lancar_nota_entrada_estoque`). Hoje 2 de 7 produtos com custo estão com margem errada. | Cópias da conta em `useProdutoForm`, `useLeadDetails`, `ComprasVarejo`, `NotaEntradaDetalhe`; função SQL lida. | **Código:** uma regra só (`src/lib/tabelaPrecos.ts`), usada nas 4 telas. **SQL (P1):** gatilho que recalcula a margem sempre que preço ou custo mudam, inclusive por N8N, API e nota de entrada. |
| **O código de barras morava solto dentro de `type_attributes`** (`barcode` ou `ean`, dependendo da tela). | Leitura do código do PDV e dos cadastros. | **Código:** uma regra só para achar o código (coluna `ean`, depois o JSON antigo). **SQL (P1):** coluna `ean` própria, única por empresa, e coluna `unidade`. |

O que **não** mexi, mas vi: `products` tem colunas de estoque **duplicadas** (`stock`/`stock_min`/`stock_max` e
`currentStock`/`stockMin`/`stockMax`), 8 produtos sem `type` e rótulos de tipo inconsistentes (`aluguel` e `produto` em
minúscula ao lado de `Serviço` e `Físico`). Isso é limpeza de outra fase.

## 3. Como "tudo puxar da tabela única", tela por tela

| Tela | Hoje | Situação |
|---|---|---|
| PDV (Frente de Caixa) | Lê `products.price`; busca por SKU ou código de barras; **agora grava o custo do dia** | ✔ |
| Ordem de Serviço | Ao escolher o item, preenche com `products.price` (editável) | ✔ (já puxava) |
| Compras e Nota de Entrada | Custo vindo da compra/nota; cadastro de produto novo já com preço e custo | ✔ margem agora pela regra única |
| Imobiliário e Automotivo | Já leem `products` (migração de 13/10) | ✔ |
| Planos e créditos do SPY | Gatilho de `products` | ✔ |
| Propostas | Itens guardam o preço no momento | **Não conferi** de onde vem o preço no assistente de nova proposta. |
| Clínica (serviços) | Nenhum arquivo usa `clinica_servicos`; as 2 linhas dela estão em `products`. **Não conferi** de onde as telas da clínica leem o preço do serviço. | ver nota |
| Agendamento | Preço próprio por dia da semana | Separado de propósito (decisão 3) |

## 4. O que foi testado

- `npx tsx --test tests/varejo/tabelaPrecos.test.ts`: regras de margem, custo da venda e código de barras (4 testes).
- **O script `P1_TUDO_EM_UM.sql` foi rodado e desfeito** num banco descartável (PGlite) com o formato de `products` e um gatilho de
  planos de mentira: roda inteiro sem erro, **roda uma segunda vez sem erro e sem mudar nada**, não quebra se uma tabela antiga
  não existir, não falha com EAN repetido (avisa e segue), corrige as margens divergentes sem tocar nas outras, mantém o gatilho de planos
  funcionando e desfaz tudo. Script em
  `migracoes/teste-em-banco-descartavel.mjs`.
- **Não prova nada sobre a produção** (RLS real, outros gatilhos reais além dos dois de planos, volume). Aplicar primeiro em
  branch do Supabase.

## 5. Decisões que dependem de você

1. **Autorizar o script `P1_TUDO_EM_UM.sql`** (colunas `ean` e `unidade`, gatilho da margem, correção da margem de 2 produtos, comentário de "LEGADO" nas 4 tabelas mortas)?
2. **Apagar as 4 tabelas mortas** (`estoque_items`, `clinica_servicos`, `imobiliario_imoveis`, `imobiliario_veiculos`)? Não apago:
   não consigo ver o N8N e algum fluxo pode ainda escrever nelas. Proposta: deixar marcadas como legado por algumas semanas
   e só então apagar.
3. **Agendamento:** manter o preço por dia da semana em `agendamento_config` (proposto) ou virar um produto "Reserva" com os
   dois preços dentro de `products`?
4. **Exames da saúde** (`saude_exames_base`, 70 linhas): manter separada, porque é base de comparação (proposto), ou levar
   para `products` com tipo "Exame"?
5. **Limpeza de `products`** (tipos padronizados, colunas de estoque duplicadas, produtos sem tipo): fazer numa fase própria?
