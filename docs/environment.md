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

## Sincronização de eventos

O workflow `Synchronize astronomical events` executa diariamente e também aceita disparo manual.
Configure no repositório da API os GitHub Actions secrets `SUPABASE_URL`,
`SUPABASE_PUBLISHABLE_KEY` e `SUPABASE_SECRET_KEY`. A secret key fica restrita ao job server-side e
nunca é enviada ao aplicativo.

Por padrão, o job sincroniza 31 dias para São Paulo. Um disparo manual pode informar latitude,
longitude, elevação e quantidade de dias. Para executar localmente:

```bash
npm run events:sync -- --latitude -23.5505 --longitude -46.6333 --elevation 760 --days 31
```

Cada tentativa gera uma linha em `astronomical_event_sync_runs`. Falhas registram código e mensagem
sanitizados, mantêm os eventos válidos anteriores e fazem o processo terminar com código diferente
de zero.

## Falhas e rotação

A API falha antes de abrir a porta quando a configuração obrigatória é inválida, informando apenas
os nomes dos campos. Valores e respostas internas do Supabase não são incluídos em logs ou respostas
HTTP. Após rotacionar uma chave, atualize o secret manager e reinicie as instâncias da API.

## Checklist

- Restringir acesso aos secrets de produção por ambiente.
- Nunca disponibilizar a secret key em builds, logs, comentários ou respostas HTTP.
- Usar o cliente do usuário para operações normais; o cliente administrativo é exceção auditável.
- Revisar histórico e diff do PR para padrões de credenciais antes do merge.
