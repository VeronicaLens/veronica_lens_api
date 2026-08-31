# Convenções de Git e versionamento

Estas convenções se aplicam aos repositórios `veronica_lens_api` e `veronica_lens_app`. Os dois
repositórios mantêm históricos, versões e releases independentes.

## Branch principal

`main` deve permanecer implantável e protegida com:

- Pull request obrigatório.
- Status check `validate` obrigatório.
- Conversas resolvidas antes do merge.
- Force push e exclusão bloqueados.
- Histórico linear.
- Preferência por squash merge.

Mesmo quando houver apenas uma pessoa desenvolvedora, toda mudança passa por PR para preservar
CI, revisão do diff e vínculo com o Jira.

## Branches de trabalho

Crie branches curtas a partir da `main` atualizada:

```text
feature/VRLENS-XX-description
fix/VRLENS-XX-description
chore/VRLENS-XX-description
docs/VRLENS-XX-description
```

Exemplos da Sprint S01:

```text
chore/VRLENS-66-mobile-repository
chore/VRLENS-67-api-repository
chore/VRLENS-68-supabase-versioning
docs/VRLENS-69-git-conventions
docs/VRLENS-70-architecture-responsibilities
```

## Commits

Use Conventional Commits, escopo quando útil e chave Jira obrigatória:

```text
<tipo>(<escopo>): VRLENS-XX descrição imperativa
```

Tipos principais:

- `feat`: nova capacidade.
- `fix`: correção de defeito.
- `chore`: infraestrutura e manutenção.
- `docs`: documentação.
- `test`: testes.
- `refactor`: mudança interna sem alterar comportamento.

Exemplos:

```text
chore(api): VRLENS-67 configure API repository
chore(db): VRLENS-68 define Supabase versioning
docs(architecture): VRLENS-70 document component responsibilities
```

## Pull requests

O título segue `[VRLENS-XX] Descrição`. O corpo deve conter:

- Link ou chave da issue.
- Motivação e resumo do que mudou.
- Passos de validação.
- Riscos, migrations e variáveis novas.
- Evidências visuais quando houver UI.

Antes do merge:

1. Atualize a branch com a `main` quando necessário.
2. Execute `npm run validate`.
3. Revise se há segredos ou dados pessoais no diff.
4. Confirme compatibilidade entre API e app quando o contrato mudar.
5. Faça squash merge e exclua a branch remota.

## Versionamento e releases

Cada repositório usa SemVer:

- `MAJOR`: mudança incompatível.
- `MINOR`: funcionalidade compatível.
- `PATCH`: correção compatível.

Tags seguem `vMAJOR.MINOR.PATCH`. App e API não precisam compartilhar o mesmo número de versão.
Migrations do Supabase acompanham a release da API que depende delas.

Antes da versão `1.0.0`, mudanças de fundação podem incrementar `MINOR`, mas toda quebra de
contrato deve ser destacada no PR e nas notas da release.
