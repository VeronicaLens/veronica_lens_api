# Contrato HTTP

O arquivo `openapi/openapi.yaml` é a fonte de verdade pública da API `/api/v1`. Ele não importa
tipos do Supabase ou de qualquer outro SDK externo. Nomes JSON usam `camelCase`, datas usam ISO 8601
em UTC e identificadores persistidos usam UUID quando aplicável.

## Evolução

- Mudanças compatíveis adicionam campos opcionais, novos schemas ou novos endpoints e incrementam a
  versão minor do documento.
- Remover ou renomear campos, tornar campo opcional obrigatório, restringir valores existentes ou
  alterar semântica pública é incompatível.
- Mudanças incompatíveis exigem `/api/v2` ou um período documentado no qual as duas versões sejam
  mantidas.
- O endpoint antigo só pode ser removido depois que as versões publicadas do app deixarem de usá-lo.

## Fluxo entre repositórios

1. Alterar e validar `openapi/openapi.yaml` na API.
2. Copiar o documento aprovado para `contracts/openapi.v1.yaml` no app.
3. Executar `npm run contract:generate` no app e versionar os tipos gerados.
4. Abrir PRs relacionados nos dois repositórios e manter compatibilidade até ambos serem publicados.

A CI da API rejeita OpenAPI inválido. A CI do app regenera os tipos e rejeita qualquer diferença em
`src/types/generated`.
