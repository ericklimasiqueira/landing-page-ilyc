# Regras de segurança do projeto

- Toda ação administrativa deve validar a sessão e a role no servidor; esconder botões na interface não é autorização.
- Para ações de usuário, revalide a identidade com o mecanismo já usado em `src/lib/server/admin-auth.ts` e exija a role adequada.
- Preserve as verificações de origem nas mutações e os limites de requisição já implementados.
- Nunca aceite role, identidade administrativa ou propriedade de conteúdo como confiável apenas porque veio do navegador.
- Nunca envie `SUPABASE_SECRET_KEY`, `service_role`, cookies de sessão ou tokens ao cliente, logs, exemplos ou respostas de API.
- Preserve RLS e privilégios explícitos nas migrations. Inspecione políticas existentes antes de mudar SQL.
- Use Storage privado e URLs assinadas para fotos protegidas. Não torne o bucket público para simplificar a exibição.
- Não leia nem reproduza valores de `.env.local`. Use `.env.example` para conhecer os nomes das variáveis.
- Alterações que envolvam migrations devem gerar um novo arquivo datado em `supabase/migrations/`; não aplique a migration no serviço remoto sem pedido explícito.
- Em rotas que lidem com convites, recuperação de senha ou administração de usuários, preserve validações e mensagens que não revelem se contas existem além do necessário ao fluxo.
