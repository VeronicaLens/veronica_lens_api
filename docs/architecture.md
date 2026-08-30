# Arquitetura e responsabilidades

O VeronicaLens usa dois repositórios independentes. Não há monorepo nem dependência por caminho
de arquivos entre app e API.

```text
React Native app
  |-- autenticação ---------------------> Supabase Auth
  |-- operações de domínio + JWT ------> Node.js API
                                            |-- regras e autorização
                                            |-- cliente do usuário + JWT --> Postgres/Storage + RLS
                                            `-- cliente administrativo ---> operações privilegiadas
```

## Aplicativo mobile

Responsável por:

- UI, navegação e acessibilidade.
- Câmera, sensores e permissões do dispositivo.
- Cache local e armazenamento seguro da sessão.
- Autenticação com Supabase Auth usando somente a publishable key.
- Envio do JWT como bearer token para a API.
- Apresentação de erros e estados retornados pelos serviços.

O app não implementa autorização definitiva, regras administrativas ou acesso com secret key.

## API Node.js

Responsável por:

- Regras de negócio e validação definitiva.
- Autorização de operações de domínio.
- Integrações externas, planejamento e notificações.
- Operações administrativas sensíveis e auditoria.
- Contrato HTTP versionado em `/api/v1`.
- Criação de clientes Supabase no contexto do usuário para preservar RLS.

### Arquitetura MSC

Cada domínio é organizado por módulo:

```text
Route -> Middleware/Schema -> Controller -> Service -> Model -> Supabase
```

- Route associa endpoint e middlewares.
- Schema valida body, params e query.
- Controller traduz HTTP e não contém regra de negócio.
- Service aplica regra de negócio e autorização.
- Model encapsula consultas e persistência.
- O Service não recebe objetos `Request` ou `Response`.
- O Controller não acessa Supabase ou Model diretamente.

## Supabase

Responsável por:

- Auth e emissão de JWTs.
- Postgres e integridade relacional.
- Storage privado.
- Grants e Row Level Security.
- Migrations e seeds versionados no repositório da API.

## Acesso por tipo de dado

| Operação                              | Caminho permitido                                  |
| ------------------------------------- | -------------------------------------------------- |
| Login, cadastro e renovação de sessão | App -> Supabase Auth                               |
| Dados do perfil e domínio             | App -> API -> Supabase com JWT do usuário          |
| Regras derivadas e integrações        | App -> API                                         |
| Upload futuro de imagem               | App -> URL assinada/autorizada pela API -> Storage |
| Consulta administrativa               | Admin -> API -> Supabase, com auditoria            |
| Migrations e configuração             | CI/CLI da API -> Supabase                          |

O app não consulta tabelas de domínio diretamente. O acesso direto ao Supabase no app fica
restrito a Auth e, quando implementado, transferências de Storage previamente autorizadas pela
API.

## Perfis e isolamento

Há dois perfis:

- `user`: acessa somente os próprios dados.
- `admin`: pode consultar todos os dados quando uma operação administrativa explícita permitir.

Não há compartilhamento entre usuários. Toda tabela pertencente a usuário deve ter `user_id`, e
suas policies devem combinar `to authenticated` com ownership. A checagem de admin usa claims
controladas pela aplicação em `app_metadata`; `user_metadata` nunca é fonte de autorização.

O acesso administrativo continua limitado por endpoint, método, validação, policy e auditoria.
Admin não recebe acesso a senhas, tokens de terceiros, SQL arbitrário ou migrations.

## Chaves Supabase

- A publishable key pode estar no app e na API; grants e RLS limitam seu alcance.
- A secret key/service role existe somente no backend ou ambiente seguro de CI.
- Operações comuns devem usar o cliente contextualizado pelo JWT do usuário.
- O cliente administrativo é criado somente no ponto em que uma operação privilegiada o exige.
- Secrets nunca são gravados no Git, logs ou respostas HTTP.

## Contrato entre repositórios

App e API evoluem independentemente. A integração ocorre por contrato HTTP, não por código
compartilhado. Mudanças incompatíveis exigem nova versão da API ou período de compatibilidade para
que o app publicado continue funcionando.
