# Briefing para revisão jurídica: S.P.Y. (spycrm.com.br)

Documento para o advogado que vai revisar os Termos de Uso e a Política de Privacidade antes do lançamento comercial. Textos em produção: https://www.spycrm.com.br/termos e https://www.spycrm.com.br/privacidade (fontes: `src/pages/landing/pages/termosContent.ts` e `privacidadeContent.ts`). Última revisão dos Termos: 6/11/2026.

## 1. O que é o produto (30 segundos)

Plataforma SaaS multiempresa de CRM e operação (leads, propostas, contratos, financeiro, tarefas) com uma assistente de IA (Aurora) e integração com WhatsApp. Cada empresa cliente (tenant) tem dados isolados. O S.P.Y. cobra mensalidade das empresas; as empresas usam a plataforma para falar com os clientes delas.

## 2. Papéis na LGPD (como está escrito hoje)

- **Controlador:** dados de visitantes do site e de cadastro/acesso dos usuários.
- **Operador:** dados que a empresa cliente insere sobre os próprios leads, clientes e conversas. A empresa cliente é a controladora.

**Pergunta 1:** essa divisão está correta para o modelo real? Existe necessidade de um contrato de operador (DPA) separado, assinado por cada cliente, ou os Termos bastam?

## 3. Ponto crítico: WhatsApp por conexão não oficial

- A integração usa um gateway próprio (WAHA, engine GOWS) com leitura de QR Code, como o WhatsApp Web. **Não é a API oficial da Meta (WhatsApp Business Platform).**
- Risco: o WhatsApp pode limitar ou banir números sem aviso, e o uso de automação pode violar os termos do WhatsApp.
- Hoje há cerca de 8 sessões conectadas em 2 empresas, com milhares de mensagens por semana.

Cláusulas já escritas:
- **Termos, seção 2:** aviso de conexão não oficial e de risco de banimento.
- **Termos, seção 4:** a empresa cliente é a única responsável pelas mensagens que envia (base legal, opção de sair, regras do WhatsApp, LGPD e CDC).
- **Termos, seção 10:** exclusão de responsabilidade por banimento de número e perda de conversas.

**Perguntas:**
2. Já implementamos aceite explícito: o QR só aparece depois de a pessoa marcar "Entendi o risco e concordo com o aviso dos Termos", e o sistema grava quem aceitou e quando (`whatsapp_instances.risk_accepted_at` / `risk_accepted_by`). Esse registro e o texto do checkbox são suficientes como prova de ciência, ou o advogado quer outro formato?
3. A exclusão de responsabilidade da seção 10 é válida diante do CDC, se o cliente for consumidor final ou pequena empresa?
4. Vender essa integração sabendo do risco de violação dos termos do WhatsApp expõe o S.P.Y. a alguma responsabilidade própria?

## 4. Inteligência artificial (Aurora)

- Mensagens e dados necessários são enviados a provedores de IA (a Política cita Google Gemini e Groq).
- Política, seção 5 e 6: descreve o uso e os suboperadores.

**Perguntas:**
5. É necessário listar cada provedor de IA pelo nome, ou "como Google Gemini e Groq" é suficiente?
6. Há necessidade de informar decisão automatizada (art. 20 da LGPD)? A Aurora apenas sugere e responde, e não decide por si só.

## 5. Transferência internacional

- O banco de dados (Supabase) está na região **us-west-2 (EUA)**. A hospedagem é na Vercel. Os provedores de IA também processam fora do Brasil.
- Política, seção 7: texto genérico ("cláusulas contratuais e fornecedores com padrões reconhecidos").

**Perguntas:**
7. O texto atende aos arts. 33 a 36 da LGPD, ou precisa citar o mecanismo específico (cláusulas-padrão da ANPD)?

## 6. Lacunas que só o dono do negócio preenche

- **Razão social e CNPJ estão vazios** nos Termos e na Política (`COMPANY` em `termosContent.ts`). Os documentos hoje não identificam quem é o fornecedor.
- **Encarregado (DPO) e canal para titulares:** confirmar se a seção "Fale com a gente" informa e-mail do encarregado.
- **Foro e lei aplicável** (seção 13): confirmar a comarca desejada.
- **Preços, prazos, multa e fidelidade:** os Termos remetem à proposta/contrato (seção 7). Revisar o modelo de contrato comercial que acompanha.

## 7. Outros pontos para checar

- **Dados sensíveis:** os Termos dizem que o S.P.Y. não os solicita, e que a empresa cliente responde se os inserir (Política, seção 2).
- **Retenção e exclusão ao fim do contrato** (Política, seção 8): prazo definido?
- **Cookies:** apenas armazenamento essencial no navegador (Política, seção 11).
- **Menores:** Política, seção 12.
- **Google APIs (Agenda/Tarefas/Meet):** a seção 3 da Política segue a política de dados do usuário do Google (Limited Use). Se o app for verificado pelo Google, o texto precisa continuar idêntico ao exigido.

## 8. O que NÃO foi testado juridicamente

Os textos foram escritos e revisados quanto à coerência interna e ao encaixe com o funcionamento do sistema. **Não houve parecer de advogado.** Tudo acima é lista de perguntas, não conclusão.
