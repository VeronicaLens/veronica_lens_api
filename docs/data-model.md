# Modelo de dados inicial

## Identidade e autorização

- `profiles`: dados públicos de apresentação vinculados por `id` a `auth.users`.
- `user_roles`: registra somente os papéis `user` e `admin`.
- O papel usado nas policies vem de `app_metadata.role`; `user_metadata` nunca autoriza acesso.
- O trigger de criação de usuário provisiona perfil e papel `user`. Promoção para `admin` é uma
  operação administrativa server-side que deve atualizar o registro e o `app_metadata`.

Tokens já emitidos podem conter claims antigos. Depois de alterar um papel, revogue ou renove a
sessão antes de permitir operações administrativas.

## Aprendizagem

- `learning_tracks`: trilhas ordenadas e publicáveis.
- `lessons`: aulas pertencentes a uma trilha, com slug e posição únicos dentro dela.
- `user_learning_progress`: progresso privado e único por usuário/aula.

Usuários autenticados leem conteúdo publicado. Somente admins podem criar ou alterar o catálogo.
Cada usuário acessa apenas o próprio progresso; admins podem consultar todos os registros.

## Eventos e observações

- `astronomical_events`: catálogo publicável de eventos astronômicos.
- `observations`: anotações privadas de um usuário, opcionalmente associadas a um evento.
- `observation_media`: metadados de mídia. A chave estrangeira composta garante que mídia e
  observação pertençam ao mesmo usuário.

Arquivos binários serão armazenados no Supabase Storage em uma migration específica. Esta tabela
mantém apenas caminho, tipo e metadados.

## Notificações

- `device_push_tokens`: tokens privados por dispositivo, com plataforma e estado ativo.
- `event_preferences`: preferências privadas e únicas por usuário/tipo de evento.

## Segurança

Todas as tabelas usam RLS e grants explícitos. `anon` não recebe acesso às entidades funcionais.
Usuários autenticados operam somente suas linhas; admins podem visualizar todas e administrar os
catálogos conforme policies explícitas. A secret key continua restrita à API.

O seed contém apenas uma trilha, uma aula e um evento fictício determinísticos. Não inclui usuários,
tokens, observações, dados pessoais ou credenciais.
