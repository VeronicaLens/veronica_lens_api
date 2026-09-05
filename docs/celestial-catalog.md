# Catálogo celeste mínimo

O endpoint autenticado `GET /api/v1/catalog/celestial-objects` disponibiliza o catálogo básico do
MVP sem consultar serviços externos. Ele aceita:

- `q`: trecho de nome, identificador ou alias, sem distinção de maiúsculas e acentos;
- `type`: `moon`, `planet`, `star` ou `constellation`;
- `limit`: entre 1 e 50, com padrão 20.

## Estratégias de coordenadas

O campo discriminado `coordinates.kind` impede que posições de naturezas diferentes sejam
confundidas:

- `ephemeris`: Lua e planetas possuem identificador estável do JPL Horizons. Suas coordenadas devem
  ser calculadas para a data, hora e localização do observador; o catálogo não grava uma posição
  rapidamente obsoleta.
- `fixed`: estrelas possuem RA/Dec no epoch J2000. Antes de uma projeção de maior precisão, a camada
  de efeméride deve convertê-las para coordenadas aparentes da data. O formato RA/Dec é diretamente
  consumível pelo Astro Core depois dessa etapa.
- Constelações são regiões oficiais do céu, não corpos pontuais. A coordenada fixa armazenada é
  apenas uma âncora visual aproximada para busca e navegação; desenhos futuros devem usar linhas e
  limites próprios.

## Escopo inicial

O catálogo inclui Lua, os sete planetas além da Terra, doze estrelas brilhantes relevantes para os
dois hemisférios e quatro constelações iniciais. Nomes em português e aliases comuns em português,
inglês ou nomenclatura astronômica são pesquisáveis.

As coordenadas estelares foram curadas no referencial ICRS/J2000 usando o SIMBAD, mantido pelo CDS.
Constelações seguem a nomenclatura reconhecida pela International Astronomical Union.

Referências:

- https://simbad.cds.unistra.fr/simbad/
- https://ssd-api.jpl.nasa.gov/doc/horizons_lookup.html
- https://www.iau.org/public/themes/constellations/
