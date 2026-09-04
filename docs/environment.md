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

## Falhas e rotação

A API falha antes de abrir a porta quando a configuração obrigatória é inválida, informando apenas
os nomes dos campos. Valores e respostas internas do Supabase não são incluídos em logs ou respostas
HTTP. Após rotacionar uma chave, atualize o secret manager e reinicie as instâncias da API.

## Checklist

- Restringir acesso aos secrets de produção por ambiente.
- Nunca disponibilizar a secret key em builds, logs, comentários ou respostas HTTP.
- Usar o cliente do usuário para operações normais; o cliente administrativo é exceção auditável.
- Revisar histórico e diff do PR para padrões de credenciais antes do merge.
