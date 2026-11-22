# APIs do Brasil escolhidas para o SPY (referência para a Aurora e os agentes)

Lido em 21/11/2026. Cada item diz o que foi **testado de verdade** (chamada real, sem chave) e o que veio **só da documentação**. Onde não deu para confirmar, está escrito "não verificado".
Nenhuma chave é gravada em código: chaves ficam em variável de ambiente no servidor.

## Cálculos trabalhistas: ContaCLT
- Base: `https://contaclt.com/api/v1` · GET · **sem chave** · CORS liberado · uso comercial permitido (cite "ContaCLT (https://contaclt.com/)", licença CC BY 4.0).
- Cache de 1 h no servidor deles; para volume alto, baixar as tabelas em `/dados/` (`regras-2026.json`).
- Só regras de **2026**. Não há férias, 13º, rescisão nem aviso prévio na API (só calculadoras web).

| Rota | Parâmetros | Devolve |
|---|---|---|
| `/salario-liquido` | `salario`, `dependentes`, `pensao` | salário líquido com INSS e IRRF 2026 |
| `/inss` | `salario`, `categoria` (empregado, individual, servico_empresa, simplificado, baixa_renda) | contribuição INSS |
| `/irrf` | `salario`, `dependentes`, `pensao` | IRRF mensal com a redução da Lei 15.270/2025 |
| `/seguro-desemprego` | `salario1`, `salario2`, `salario3`, `solicitacao`, `meses` | valor e nº de parcelas |
| `/saque-aniversario` | `saldo` | valor do saque-aniversário do FGTS |
| `/das-mei` | `atividade`, `mes_abertura`, `faturamento` | DAS do MEI e limite de faturamento |
| `/empregada-domestica` | `salario`, `dependentes`, `filhos`, `vale_transporte` | folha e guia DAE |
| `/tabelas` | nenhum | todas as tabelas do ano |

Testado: `/salario-liquido?salario=3500` → `resultado.net` = 3191,40 (INSS 308,60; IRRF 0). Os formatos de resposta das outras rotas **não foram verificados** (só o envelope comum: `ano`, `regrasAtualizadasEm`, `entrada`, `resultado`). Aviso deles: informativo, não substitui o eSocial nem contador.

## Nota fiscal (NFS-e): emissaoja
- Produção `https://emissaoja.com.br` · sandbox grátis `https://sandbox.emissaoja.com.br` · header `Authorization: Bearer ej_live_…` (sandbox `ej_test_…`).
- Sem certificado digital: a empresa se conecta com **CNPJ + senha do portal do Emissor Nacional** (trate como segredo). Uma conta = uma empresa.
- Plano grátis: **1 nota por mês**. Preços dos outros planos: não lidos. Cidades atendidas: não confirmadas.
- Limites: 60 chamadas/min por chave; emissões 10/min.
- Fluxo: `PUT /v1/empresa/credencial` (cadastra) → `POST /v1/tomadores` (cliente por CNPJ/CPF) → `POST /v1/servicos` → `POST /v1/notas` (header obrigatório `Idempotency-Key`; corpo: `tomador_tipo`, `tomador_id`, `valor`; opcionais `servico_id`, `descricao`, `competencia`) → `GET /v1/emissoes/{id}` (acompanhar) → `GET /v1/notas/{origem}/{id}/pdf` e `/xml`. Cancelar: `POST /v1/notas/{origem}/{id}/cancelar` com `motivo` "1" ou "2".
- Não há webhooks. Só documentação lida; **nada testado** (precisa de chave).

## Fatura e recibo em PDF: FaturaPDF (RapidAPI)
- **Não verificado.** A página do RapidAPI não carregou para leitura automática; faltam endpoints, campos, preços e limites. Precisa abrir a aba de Endpoints no navegador.

## Dados do Banco Central (SGS e PTAX)
- Sem chave. Padrão testado: `https://api.bcb.gov.br/dados/serie/bcdata.sgs.{codigo}/dados/ultimos/{n}?formato=json` → `[{"data":"DD/MM/AAAA","valor":"…"}]` (valor em texto).
- Séries testadas: **432** Selic meta (%a.a.), **433** IPCA mensal (%), **12** CDI diário (%a.d.), **1** dólar venda. Filtro por data (`dataInicial`/`dataFinal`) e janela máxima: não verificados.
- PTAX (Olinda): `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao='MM-DD-AAAA'&$format=json` — respondeu vazio para uma data sem boletim; campos da resposta não verificados.
- Alternativa simples: BrasilAPI `GET /api/taxas/v1` → `[{"nome":"Selic","valor":13.75},{"nome":"CDI",…},{"nome":"IPCA",…}]` (testado).

## Endereço, CEP e geografia
| API | Rota | Estado |
|---|---|---|
| **BrasilAPI CEP v2** | `GET https://brasilapi.com.br/api/cep/v2/{cep}` → `cep, state, city, neighborhood, street, ibge{city,state}, location.coordinates{latitude,longitude}` | **testado** (traz coordenadas) |
| **ViaCEP** | `GET https://viacep.com.br/ws/{cep}/json/` (campos: cep, logradouro, complemento, bairro, localidade, uf, ibge, ddd…) e busca reversa `/ws/{UF}/{cidade}/{logradouro}/json/` (mín. 3 letras; até 50 resultados) | só documentação; já usado no SPY; uso massivo pode ser bloqueado |
| **IBGE localidades** | `GET https://servicodados.ibge.gov.br/api/v1/localidades/estados/{UF}/municipios?orderBy=nome` → `[{id, nome, microrregiao…}]` | **testado**; já usado na Prospecção |
| **IBGE CNAE** | `GET https://servicodados.ibge.gov.br/api/v2/cnae/subclasses/{7 dígitos}` → descrição da atividade, classe, grupo, divisão, seção | **testado** |
| **PontoFato** | `GET https://pontofato.com/api/cep/{cep}` (CEP com lat/lon, setor censitário) e `/api/empresas?cep=` (empresas no CEP, 50 por página); CORS aberto; algumas rotas pagas em crédito | só documentação (parcial) |
| **Postmon** | `GET https://api.postmon.com.br/v1/cep/{cep}` | só documentação; campos não verificados |
| **Cep.la** | — | **fora do ar** (domínio não resolve) |
| **Queimadas INPE** | — | sem API documentada na página lida |

## CNPJ
| API | Rota | Estado |
|---|---|---|
| **apipj** (já integrada na Prospecção) | `GET https://apipj.com.br/v1/cnpj/{cnpj}` e `/v1/busca?cnae=&municipio=` · `Authorization: Bearer apipj_live_…` | docs lidas; busca ainda não testada |
| **BrasilAPI CNPJ** | `GET https://brasilapi.com.br/api/cnpj/v1/{cnpj}` (sem chave; traz sócios com CPF mascarado) | **testado** |
| **ReceitaWS** | `GET https://www.receitaws.com.br/v1/cnpj/{cnpj}` (sem chave; campos `nome, fantasia, situacao, atividade_principal[{code,text}], logradouro, municipio, uf, cep, email, telefone, qsa, capital_social, simples`) | **testado**; o limite de uso não foi confirmado (a página inicial não traz docs) |
| **Radar CNPJ** | `GET https://radar-cnpj.com/api/cnpj/{cnpj}` (cache 6 h) · `/api/busca?q=&tipo=nome\|fantasia\|socio\|telefone\|email\|endereco\|cnae&uf=&page=&pageSize=` · `/api/ref?tipo=cnae\|municipio` · monitoramento `POST /api/me/monitor/watch` | só documentação; sem chave na maioria das rotas; consulta ao vivo 10/dia grátis, depois crédito pago (US$ 0,01 por consulta); sem filtro de município na busca; termos de revenda não lidos |
| **w14n** | `GET https://api.w14n.dev/v1/company/{cnpj}` e `/v1/analytics/cnae/{cnae}/municipalities?state=` | só amostra: cobre agro, mineração e carnes; 10 req/10 s |

## Observações de uso
- Consultas de CNPJ/CEP devolvem **dado público de empresa**; telefone e e-mail de empresa só devem ser usados com base legal (LGPD) e sem disparo em massa (a apipj proíbe isso nos termos).
- Para a Aurora: preferir chamar pelo **servidor do SPY** (proxy), nunca direto do navegador, por causa da CSP do `vercel.json` (`connect-src` só libera viacep, brasilapi e publica.cnpj.ws).
