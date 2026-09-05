# Autenticação

O aplicativo nunca acessa o Supabase diretamente. Cadastro, login, refresh, logout e recuperação de
senha passam pelos endpoints `/api/v1/auth/*`; somente a API conhece as chaves e o SDK do provedor.

## Fluxos

- `POST /auth/sign-up`: cria a conta. Retorna `201` com sessão ou `202` quando a confirmação de
  e-mail é obrigatória.
- `POST /auth/sign-in`: autentica e retorna access/refresh tokens.
- `POST /auth/refresh`: renova a sessão e rotaciona o refresh token.
- `POST /auth/sign-out`: revoga todas as sessões do usuário autenticado.
- `POST /auth/password/recovery`: sempre retorna uma resposta neutra para não revelar se o e-mail
  está cadastrado.
- `POST /auth/password/update`: troca a senha a partir de um access token autenticado, inclusive o
  token recebido pelo deep link de recuperação.

Erros retornados pelo Supabase são convertidos em códigos públicos estáveis e nunca expõem detalhes
do provedor. Senhas exigem entre 8 e 72 caracteres no contrato da aplicação.

## Configuração de e-mail

Em cada ambiente hospedado, adicione `veronicalens://auth/reset-password` à lista de Redirect URLs
do Supabase Auth. Configure SMTP próprio antes de produção para garantir entrega e limites adequados.
`PASSWORD_RESET_REDIRECT_URL` permite usar um deep link diferente por ambiente.

## Roles e RLS

`public.user_roles` é a fonte de verdade para `user` e `admin`. A migration `auth_role_claims`
sincroniza esse valor em `auth.users.raw_app_meta_data`, que alimenta o JWT usado pelas policies.
`raw_user_meta_data` contém somente atributos editáveis, como nome, e nunca participa de decisões de
autorização.

Mudar uma role não invalida imediatamente um access token já emitido; o usuário precisa renovar a
sessão para receber o claim atualizado. As policies RLS continuam restringindo dados privados por
`auth.uid()`, enquanto admins só recebem acesso global onde há policy explícita.

## Verificação local

Com o Supabase local iniciado e as variáveis locais carregadas:

```bash
npm run supabase:reset
npm run supabase:lint
npm run supabase:test
npm run auth:verify:local
```

O último comando recusa URLs não locais, cria contas temporárias, verifica todos os fluxos e remove
os usuários de teste ao final.
