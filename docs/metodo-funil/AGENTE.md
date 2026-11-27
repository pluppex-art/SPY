# Método do funil · Passo 1: o Agente Secreto move o lead

**Situação:** preparado em 27/11/2026, **para revisar**. Nada publicado e nenhuma migração aplicada.

Direção definida: o vendedor não escreve nota nem move lead. O agente faz isso; o vendedor recebe o aviso de repescagem e chama o cliente.

## O que foi preparado

| Parte | Onde | Situação |
|---|---|---|
| Função `spy_agente` | [20261231_metodo_funil_agente.sql](../../supabase/migrations/20261231_metodo_funil_agente.sql) | Falta rodar no SQL Editor |
| Passos novos no `[PLUPPEX AI OS] Agente Secreto` | n8n, rascunho `4e16c53a-2683-4748-a11d-84f8c7020461` | Falta publicar |
| Publicada hoje (para voltar) | `673f307a-fb40-45ef-b1c6-ffddf74c7d9b` | Em uso |

## O que o agente passa a fazer (só em funil com o método ligado)

| Na conversa | Resultado |
|---|---|
| Primeira mensagem | Aguardando 1º atendimento (5 min) |
| Loja respondeu | Em qualificação |
| Preço enviado | Orçamento enviado |
| Cliente respondeu ao orçamento | Em negociação; quando a loja responde, volta para "Orçamento enviado" |
| Chave Pix, link ou boleto | Aguardando pagamento |
| Comprovante do cliente ou loja confirmando | Venda ganha |
| Vai pesquisar, achou caro, pediu para depois, sem estoque | Repescagem, com aviso ao vendedor |
| Cliente da Repescagem respondeu | Volta à etapa anterior, com aviso |
| Recusa clara | Venda perdida |

- A IA só vale para repescagem e recusa quando copia a fala do cliente que prova o sinal. Na dúvida, nada muda.
- Preço, cobrança e pagamento são reconhecidos por regra, sem depender da IA.
- Uma mensagem já analisada não é aplicada de novo, nem refaz o que foi desfeito.
- No fluxo, a etapa e o status deixam de ser gravados direto nesses funis. Nos outros funis, nada muda.

## Ordem para ligar

1. Rodar a migração no SQL Editor. Esperado: `instalado = true`, `logado_pode_chamar = false`, `sobras = 0`. Ela traz um autoteste de 11 passos que é desfeito no fim; se um passo falhar, nada é aplicado.
2. Publicar o rascunho (com a sua confirmação).
3. Testar com um número de teste na SPY | IA, com o lead no funil de teste.
4. Repassar para o agente da Luminar e ligar o método no funil dela.

## O que ainda não faz

- Repescagem automática após 72h, as 7 tentativas e os alertas de prazo (passo 2).
- Aviso ao vendedor por WhatsApp: por enquanto, só dentro do SPY.
- Nas telas, mover à mão ainda pede nota.
- "Desfazer" uma venda ganha volta a etapa, mas mantém o pagamento registrado.
- Cada mensagem de lead do método faz uma leitura a mais pela IA, o que ocupa mais o servidor dela.

## O que foi conferido

- O código dos três passos novos passou por casos de teste (preço, Pix, comprovante do cliente e comprovante nosso, recusa sem prova, IA fora do ar).
- No n8n: o código gravado é igual ao testado e a versão publicada não mudou.
- **Não executado:** a função no banco (o autoteste roda quando você aplicar) e o fluxo com uma conversa real.
