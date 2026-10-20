# Ambientes e gestão de segredos

## Desenvolvimento

Copie `.env.example` para `.env`. A publishable key pode ser usada por operações sujeitas a grants
e RLS. A secret key é opcional e deve existir somente quando uma operação administrativa explícita
precisar ignorar RLS.

## Produção

As variáveis são fornecidas pelo secret manager da hospedagem ou por GitHub Environments. Use
credenciais e projetos distintos para desenvolvimento, staging e produção. O arquivo `.env` nunca é
versionado nem enviado como artefato de CI.

Variáveis obrigatórias:

- `NODE_ENV`, `HOST`, `PORT` e `CORS_ORIGIN`.
- `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY`.
- `SUPABASE_SECRET_KEY` somente para processos administrativos autorizados.

## Jobs em segundo plano

Ao iniciar (`npm run dev` ou `npm start`), a API também executa os jobs abaixo, desde que
`SUPABASE_SECRET_KEY` esteja definida e `BACKGROUND_JOBS_ENABLED` não seja `false`:

- **Entrega de notificações**: roda ao iniciar e a cada `NOTIFICATION_DISPATCH_INTERVAL_MINUTES`
  (padrão 5).
- **Sincronização de eventos**: verificada a cada hora; sincroniza quando a última execução bem-sucedida
  tem mais de `EVENT_SYNC_INTERVAL_HOURS` (padrão 24), usando `EVENT_SYNC_LATITUDE`,
  `EVENT_SYNC_LONGITUDE`, `EVENT_SYNC_ELEVATION` e `EVENT_SYNC_DAYS`.

Cada job nunca se sobrepõe a si mesmo e registra falhas em log sem derrubar a API. Os comandos
manuais abaixo continuam disponíveis e carregam o `.env` automaticamente.

## Sincronização de eventos

O workflow `Synchronize astronomical events` executa diariamente e também aceita disparo manual.
O GitHub só executa agendamentos de workflows presentes no branch padrão do repositório.
Configure no repositório da API os GitHub Actions secrets `SUPABASE_URL`,
`SUPABASE_PUBLISHABLE_KEY` e `SUPABASE_SECRET_KEY`. A secret key fica restrita ao job server-side e
nunca é enviada ao aplicativo.

Por padrão, o job sincroniza 31 dias para São Paulo. Um disparo manual pode informar latitude,
longitude, elevação e quantidade de dias. Para executar localmente (no PowerShell, use a forma
`--latitude=-23.5505` para que o valor negativo não seja interpretado como opção):

```bash
npm run events:sync -- --latitude=-23.5505 --longitude=-46.6333 --elevation=760 --days=31
```

Cada tentativa gera uma linha em `astronomical_event_sync_runs`. Falhas registram código e mensagem
sanitizados, mantêm os eventos válidos anteriores e fazem o processo terminar com código diferente
de zero.

## Entrega de notificações

Após sincronizar os eventos, execute o worker de entrega ao menos a cada cinco minutos para avaliar
eventos futuros dentro da antecedência escolhida por cada usuário:

```bash
npm run notifications:dispatch
```

O worker usa a chave administrativa apenas no servidor. Cada par evento/dispositivo é reservado em
`notification_deliveries` antes do envio para evitar duplicatas; falhas individuais são registradas e
não interrompem os demais destinatários. Usuários com alertas ativados que nunca salvaram
preferências recebem os padrões exibidos no app (nascer, trânsito e ocaso, 30 minutos antes).

No Android, o push do Expo depende do Firebase Cloud Messaging: o build precisa do
`google-services.json` (`expo.android.googleServicesFile`) e a chave de conta de serviço FCM V1 deve
estar cadastrada nas credenciais do projeto no EAS.

## Falhas e rotação

A API falha antes de abrir a porta quando a configuração obrigatória é inválida, informando apenas
os nomes dos campos. Valores e respostas internas do Supabase não são incluídos em logs ou respostas
HTTP. Após rotacionar uma chave, atualize o secret manager e reinicie as instâncias da API.

## Deploy no Render

O arquivo `render.yaml` descreve o serviço web gratuito (build `npm ci --include=dev && npm run build`,
start `npm start`, health check `/health`). O build precisa das dependências de desenvolvimento,
incluindo TypeScript e `@types/node`, mesmo com `NODE_ENV=production`. Em um serviço criado
manualmente, configure esse mesmo Build Command no painel do Render.

Os valores `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e `SUPABASE_SECRET_KEY` são `sync: false`:
informe-os no painel do Render. O plano gratuito suspende por inatividade, portanto
`BACKGROUND_JOBS_ENABLED=false` e os jobs precisam de agendamento externo. O workflow diário
existente sincroniza eventos, mas o envio periódico de push ainda precisa ser configurado.

A exclusão de conta (`DELETE /api/v1/profile`) usa a secret key para remover arquivos do Storage e
o usuário em `auth.users`; as demais tabelas são removidas por `on delete cascade`.

## Checklist

- Restringir acesso aos secrets de produção por ambiente.
- Nunca disponibilizar a secret key em builds, logs, comentários ou respostas HTTP.
- Usar o cliente do usuário para operações normais; o cliente administrativo é exceção auditável.
- Revisar histórico e diff do PR para padrões de credenciais antes do merge.
