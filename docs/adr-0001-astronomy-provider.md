# ADR 0001 — Provider de dados astronômicos

- Status: aceito
- Data: 2026-09-05
- História: VRLENS-41

## Contexto e dados obrigatórios

O MVP precisa manter o aplicativo independente do formato de qualquer fornecedor. Os dados mínimos
por funcionalidade são:

| Funcionalidade    | Dados obrigatórios                                                               |
| ----------------- | -------------------------------------------------------------------------------- |
| Busca e catálogo  | ID estável, nome, tipo e aliases; RA/Dec quando o objeto for fixo                |
| Guia e planejador | instante UTC, localização/elevacão do observador, RA/Dec, altitude e azimute     |
| Eventos           | tipo, objetos envolvidos, início, pico e fim opcionais, título e local aplicável |

## Alternativas avaliadas

| Candidato                    | Cobertura e formato                                                                | Autenticação e limites                                                                                    | Avaliação                                                                                                      |
| ---------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| NASA/JPL Horizons            | Planetas, luas, asteroides, cometas e espaçonaves; JSON contendo tabelas texto/CSV | API pública sem conta; não publica quota/SLA, serviço best-effort                                         | Selecionado para lookup e efemérides do Sistema Solar pela precisão, estabilidade de IDs e fonte institucional |
| AstronomyAPI                 | Posições de corpos, fases e imagens; JSON                                          | Basic Auth com application ID/secret; documentação alerta para 429 e 504 sem quota pública determinística | Não selecionado como dependência principal do MVP; maior acoplamento comercial e segredo adicional             |
| CDS SIMBAD TAP               | Estrelas e objetos de céu profundo; VOTable/CSV via TAP/ADQL                       | Consulta pública; exige ADQL e política cuidadosa de volume                                               | Complemento futuro para catálogo amplo; excessivo para o catálogo curado inicial                               |
| Catálogo e Astro Core locais | Objetos curados e cálculos determinísticos, sem rede                               | Sem autenticação ou limite                                                                                | Fallback e fonte inicial para estrelas/objetos de céu profundo; dados precisam ser versionados                 |

## Decisão

1. Usar NASA/JPL Horizons como fonte externa primária para busca e efemérides do Sistema Solar.
2. Manter um catálogo local curado para estrelas e objetos de céu profundo necessários ao MVP.
3. Consumir fornecedores somente pela porta `AstronomyProvider`; controllers, serviços e UI nunca
   recebem payloads da JPL.
4. Implementar RA/Dec para Alt/Az e geração de eventos no Astro Core, separadamente do provider.
5. Não expor chamadas ao fornecedor diretamente ao aplicativo mobile; a API Node.js é a fronteira.

O adapter inicial cobre lookup e posição aparente. O método de eventos pertence ao contrato neutro e
será atendido pelo provider composto com o Astro Core na história correspondente.

## Fluxo real validado

Em 2026-09-05 foi feita uma consulta HTTPS sem credenciais ao endpoint
`/api/horizons.api`, solicitando Marte (`COMMAND=499`) em 2026-09-06 00:00 UTC para São Paulo
(-23.5505, -46.6333, 760 m). A resposta identificou `NASA/JPL Horizons API`, delimitou uma linha
válida entre `$$SOE` e `$$EOE` e retornou RA/Dec, azimute e elevação. O mesmo formato é coberto pelo
teste automatizado do adapter.

## Indisponibilidade e fallback

- Aplicar timeout curto, retry com backoff e circuit breaker na camada de composição.
- Reutilizar respostas cacheadas somente dentro do intervalo temporal para o qual foram calculadas.
- Para catálogo, usar a cópia local versionada quando a busca externa falhar.
- Para eventos já calculados, servir o cache ainda válido e indicar a data de atualização.
- Sem cache válido, retornar erro tipado de indisponibilidade; nunca fabricar coordenadas.
- Não registrar URL completa se futuramente ela contiver credenciais.

## Referências oficiais

- https://ssd-api.jpl.nasa.gov/doc/horizons.html
- https://ssd-api.jpl.nasa.gov/doc/horizons_lookup.html
- https://ssd.jpl.nasa.gov/horizons/
- https://docs.astronomyapi.com/
- https://docs.astronomyapi.com/endpoints/bodies/positions
- https://docs.astronomyapi.com/known-issues
