# VeronicaLens API

API Node.js do VeronicaLens, mantida separadamente do aplicativo mobile. O projeto usa
TypeScript, Express e arquitetura modular MSC (Model, Service e Controller).

## Requisitos

- Node.js 24 LTS
- npm 11+

## Configuração

```bash
npm ci
cp .env.example .env
npm run dev
```

No PowerShell, copie o ambiente com `Copy-Item .env.example .env`.

O health check fica disponível em `GET /health`. O alias versionado `GET /api/v1/health` é mantido
para consumidores da API.

`GET /api/v1/connectivity/supabase` executa uma leitura técnica controlada na tabela
`system_status`. A resposta não inclui configuração, credenciais ou detalhes internos do provedor.

## Scripts

- `npm run dev`: inicia a API com recarga automática.
- `npm run build`: gera JavaScript em `dist/`.
- `npm run lint`: executa o ESLint.
- `npm run format`: formata os arquivos.
- `npm run typecheck`: valida os tipos.
- `npm test`: executa os testes uma vez.
- `npm run contract:lint`: valida o contrato OpenAPI versionado.
- `npm run validate`: executa todos os checks usados pelo CI.

## Arquitetura

Consulte a [documentação completa de arquitetura e responsabilidades](docs/architecture.md).
As regras de configuração por ambiente estão em [ambientes e gestão de segredos](docs/environment.md).
O contrato público e seu processo de evolução estão em [contrato HTTP](docs/api-contract.md).

Cada módulo segue o fluxo:

```text
Route -> Middleware/Schema -> Controller -> Service -> Model -> Supabase
```

- Controllers tratam HTTP.
- Services concentram regras de negócio e autorização.
- Models encapsulam persistência e consultas.
- O cliente Supabase do usuário recebe o JWT da requisição e respeita RLS.
- O cliente administrativo usa uma secret key somente em operações privilegiadas no backend.

O Supabase, suas migrations e seeds ficam neste repositório. Consulte a
[estratégia de versionamento do banco](docs/database.md).

## Segurança

- Nunca versione `.env` ou credenciais.
- Nunca envie `SUPABASE_SECRET_KEY` ao aplicativo.
- Papéis de autorização devem vir de `app_metadata`, não de `user_metadata`.
- Toda tabela exposta deve usar grants explícitos e RLS.

## Trabalho no repositório

Consulte as [convenções completas de Git e versionamento](docs/git-conventions.md).

Branches e commits devem conter a chave Jira, por exemplo:

```text
chore/VRLENS-67-api-repository
feat(api): VRLENS-67 create health endpoint
```
