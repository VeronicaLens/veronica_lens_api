# Versionamento do Supabase

## Decisão

Migrations, configuração local e seeds do Supabase são versionados neste repositório porque o
banco e a API compartilham o mesmo ciclo de desenvolvimento e deploy. Não há um terceiro
repositório de banco.

```text
supabase/
|- config.toml
|- migrations/
`- seed.sql
```

Um repositório de banco só será considerado se surgirem deploy, equipe, permissões ou ciclo de
release independentes.

## Pré-requisitos

- Docker ou runtime compatível.
- Node.js e dependências instaladas com `npm ci`.
- Supabase CLI local, fixada nas `devDependencies`.

Use sempre a CLI instalada no projeto por meio dos scripts npm. Não é necessária instalação
global.

## Ambiente local

Com o Docker Desktop iniciado:

```bash
npm run supabase:start
npm run supabase:status
Copy-Item .env.example .env
npm run supabase:reset
```

Substitua no `.env` apenas os placeholders pelas chaves mostradas por `supabase:status`. O arquivo
`.env` é ignorado pelo Git. Para interromper os serviços locais, execute `npm run supabase:stop`.

Para vincular deliberadamente um ambiente remoto, autentique a CLI e descubra a sintaxe da versão
fixada no projeto antes de executar qualquer comando:

```bash
npx supabase login
npx supabase link --help
```

Nunca versione tokens de acesso, senha do banco, publishable/secret keys reais ou arquivos de
estado gerados em `supabase/.temp/`.

## Fluxo de migrations

1. Atualize a branch local e execute `npm run supabase:reset`.
2. Consulte a sintaxe atual com `npx supabase migration new --help`.
3. Crie a migration com `npx supabase migration new <nome_descritivo>`.
4. Edite o SQL gerado, sem alterar o timestamp do arquivo.
5. Execute `npm run supabase:reset` para recriar o banco desde zero.
6. Execute `npm run supabase:lint` e `npm run supabase:test`.
7. Revise o SQL e faça commit da migration junto do código dependente.

Migrations aplicadas não são reescritas. Correções entram em uma nova migration.

### Organização por responsabilidade

Os arquivos continuam ordenados pelo timestamp criado pela CLI, mas cada nova migration trata uma
única responsabilidade e usa o padrão `<dominio>_<mudanca>`, por exemplo:

- `auth_role_claims`: integração entre Auth, roles e claims confiáveis.
- `observations_add_visibility`: alterações da tabela e policies de observações.
- `learning_add_track_order`: alterações do domínio de aprendizagem.

Uma migration já aplicada pode conter várias tabelas por representar o baseline histórico. Ela não
é dividida retroativamente: novas correções de tabelas, funções, roles, grants ou policies entram em
arquivos pequenos e independentes.

## Grants e RLS

Toda tabela em schema exposto deve, na mesma migration:

- Revogar acessos não necessários de `anon`.
- Conceder privilégios explícitos a `authenticated` somente quando necessários.
- Habilitar Row Level Security.
- Criar policies específicas por operação.
- Usar ownership, como `(select auth.uid()) = user_id`; somente `to authenticated` não autoriza
  acesso a uma linha.
- Usar `using` e `with check` em updates.

Os papéis da aplicação são `user` e `admin`. Decisões de autorização usam `app_metadata`, nunca
`user_metadata`. Dados não são compartilhados: usuários acessam apenas linhas próprias; admins
podem consultar todas as linhas conforme policies explícitas e operações auditadas.

### Armazenamento privado de observações

O bucket `observations` é privado. Cada objeto deve usar o caminho
`<user_id>/<observation_id>/<arquivo>`; as policies de `storage.objects` comparam o primeiro
segmento com `auth.uid()`. A tabela `observation_media` aplica a mesma convenção por constraint,
evitando que metadados de um usuário apontem para o namespace de outro.

O bucket aceita imagens e vídeos suportados até 50 MiB. Downloads devem usar a API autenticada do
Storage ou URLs assinadas geradas pelo backend. A secret key administrativa permanece somente na
API e nunca integra variáveis `EXPO_PUBLIC_*` ou o bundle mobile.

## Seeds

`seed.sql` contém somente inserts determinísticos para desenvolvimento e testes. Não inclua
schema, credenciais, dados pessoais ou dumps de produção. Seeds não são aplicados automaticamente
em produção.

## Cache persistente de eventos

Eventos vindos da JPL usam uma chave estável composta por provider, objeto, tipo, instante e
localização arredondada. A constraint única `(provider, provider_event_key)` permite upsert atômico
e impede duplicidades mesmo quando dois processos tentam sincronizar o mesmo período.

`astronomical_event_sync_runs` registra cobertura, localização, horário, quantidade e estado de cada
execução. A tabela tem RLS habilitado e não concede acesso a `anon` ou `authenticated`; somente o
job server-side usa `service_role` com `select`, `insert` e `update`. Sincronizações não removem
eventos, portanto uma falha não apaga o último cache válido.

## Ambientes remotos

- Use projetos separados para staging e produção quando o deploy for configurado.
- Confira o projeto vinculado antes de qualquer comando remoto.
- Use `supabase db push --dry-run` antes de aplicar migrations.
- Nunca execute `db reset --linked` em produção.
- Não use `--include-seed` em produção.

## Migration técnica inicial

A migration `system_status` cria somente o registro técnico usado para validar a comunicação do
app e da API com o Supabase. A tabela não armazena dados de usuários, aceita apenas o identificador
`supabase` e permite a clientes `anon` e `authenticated` somente leitura protegida por RLS.

As entidades funcionais do domínio devem ser adicionadas em migrations posteriores e independentes.

O [modelo de dados inicial](data-model.md) descreve as entidades, relacionamentos e limites de
acesso implementados para autenticação, aprendizagem, eventos, observações e notificações.
