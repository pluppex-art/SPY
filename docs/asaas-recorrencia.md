# Cobrança recorrente no cartão (Asaas)

O checkout tem dois modos para o plano mensal:

- **Um mês por vez:** Pix no checkout, 30 dias de uso, aviso de renovação.
- **Recorrente no cartão:** o primeiro mês e a implantação continuam no Pix. Depois da confirmação, o cliente
  cadastra o cartão na página do Asaas, e a primeira cobrança no cartão é no fim do período já pago.

Sem fidelidade: o cliente cancela em **Liberar módulos › Cobrança da assinatura** e usa até o fim do que pagou.
O plano anual é pago de uma vez por Pix. O cartão nunca passa pelo S.P.Y.

**Enquanto as variáveis abaixo não existirem, a opção não aparece em lugar nenhum.**

## Configuração

Teste primeiro no ambiente de testes do Asaas (sandbox, conta separada). A integração foi escrita a partir da
documentação e **ainda não foi testada contra o Asaas**.

1. No painel do Asaas, gere a chave de API.
2. Na Vercel (produção), cadastre:
   - `ASAAS_API_KEY`: a chave.
   - `ASAAS_WEBHOOK_TOKEN`: um segredo novo e longo, criado por você. Não use a chave de API.
   - `ASAAS_ENV=sandbox`: só nos testes; remova para produção.
3. No Asaas, crie o webhook:
   - URL `https://www.spycrm.com.br/api/billing/webhook/asaas`
   - Token de autenticação: o mesmo de `ASAAS_WEBHOOK_TOKEN`.
   - Eventos: `PAYMENT_CREATED`, `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`,
     `PAYMENT_CREDIT_CARD_CAPTURE_REFUSED`, `SUBSCRIPTION_CREATED`, `SUBSCRIPTION_INACTIVATED`, `SUBSCRIPTION_DELETED`.
4. Peça ao Asaas a **tokenização de cartão** em produção. Sem ela, mudar o valor de uma assinatura (quando o
   cliente compra um adicional) pode ser recusado; a equipe recebe um aviso para ajustar no painel.
5. Faça um novo deploy.

## O que conferir no teste

- O botão abre a página do cartão e, depois dela, a assinatura da empresa passa a "asaas".
- O pagamento confirmado anda o vencimento **um** mês.
- Cancelar pelo sistema remove a assinatura no Asaas sem bloquear a empresa.
- Comprar um adicional muda o valor da assinatura.
