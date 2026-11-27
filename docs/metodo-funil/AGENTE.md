# Método do funil · Passo 1: o Agente Secreto move o lead

**Situação:** em 27/11/2026 a migração foi aplicada (conferida) e o agente da Pluppex publicado, às 17:59. O funil de teste foi desligado a pedido: o método vai para o funil comercial que já existe. Nenhum funil está com o método ligado, então o agente se comporta como antes.

Direção definida: o vendedor não escreve nota nem move lead. O agente faz isso; o vendedor recebe o aviso de repescagem e chama o cliente.

## O que foi preparado

| Parte | Onde | Situação |
|---|---|---|
| Função `spy_agente` | [20261231_metodo_funil_agente.sql](../../supabase/migrations/20261231_metodo_funil_agente.sql) | Aplicada |
| Passos novos no `[PLUPPEX AI OS] Agente Secreto` | n8n, versão `4e16c53a-2683-4748-a11d-84f8c7020461` | Publicada |
| Versão anterior (para voltar) | `673f307a-fb40-45ef-b1c6-ffddf74c7d9b` | Guardada |

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

## Próximos passos

1. Definir o que cada coluna do funil comercial significa no método e confirmar.
2. Permitir que o agente continue andando entre colunas do mesmo significado (hoje, em funil com o método, ele só muda quando o significado muda).
3. Marcar os tipos, ligar o método no funil e dar a situação aos leads atuais sem prazos retroativos.
4. Repassar o fluxo às cópias dos clientes (Luminar primeiro).

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
