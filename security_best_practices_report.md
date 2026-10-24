# Revisão de segurança e desempenho — ILYC

**Data:** 24/10/2026
**Escopo:** Next.js App Router, autenticação Supabase, APIs, uploads e preparação para Vercel.

## Ajustes realizados

- A rota pública agora impede que produção receba conteúdo não publicado e não cria URLs assinadas para esses rascunhos. A landing apresenta estado de preparação sem exibir o HTML-base. No desenvolvimento local, o preview de rascunho segue disponível.
- A autorização privilegiada consulta `auth.getUser()` e o `app_metadata.role` atual em cada operação, evitando manter acesso baseado em papel antigo ainda presente no JWT.
- A API pública e a área administrativa carregam as fotos em lote e agrupam resultados em memória, reduzindo a sequência de queries e chamadas de assinatura individual.
- `next.config.ts` define `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` e `X-Frame-Options: SAMEORIGIN`, preservando o iframe do preview.
- Upload confere `Content-Length` antes de interpretar multipart, limita o arquivo a 4 MB e verifica a assinatura binária do tipo de imagem.
- A Vercel documenta máximo de 4,5 MB para corpo de request e response de Function ([limites de Functions](https://vercel.com/docs/functions/limitations)). Para imagens maiores, a evolução indicada é upload direto ao Supabase Storage com autorização temporária.

## Pendências antes de uma publicação pública

- CSP não foi adicionada: o HTML-base usa scripts e estilos inline. Antes de definir a política, testar em modo `Report-Only` numa implantação para não quebrar a landing.
- Não foi implementado rate limit em memória porque instâncias serverless não compartilham o estado. Um limite confiável e trilha de auditoria precisam de armazenamento compartilhado e uma migration própria.
- Configurar MFA para administradores, SMTP e URL de redirecionamento de convites no Supabase.
- Conferir no Dashboard que as migrations e políticas RLS aplicadas correspondem às versões do projeto.
- Confirmar domínio, variáveis de ambiente e publicação explícita de `site_settings` na Vercel.

## Controles já existentes

- `SUPABASE_SECRET_KEY` é lida por módulo `server-only`, sem prefixo `NEXT_PUBLIC_`.
- `.gitignore` exclui arquivos `.env*`, exceto `.env.example`.
- Rotas administrativas verificam autenticação e papel no servidor; gestão de usuários exige `admin`, edição aceita `admin` e `editor`, e mutações verificam origem same-origin.
- Bucket de imagens privado e RLS permanecem habilitados nas migrations.

## Verificações

- `npm audit --omit=dev --audit-level=moderate`: 0 vulnerabilidades de produção conhecidas na execução anterior.
- `npm run lint`: passou após as alterações.
- `npm run build`: passou após as alterações.
- A implantação Vercel, configuração Auth/MFA e estado atual das policies não foram inspecionados no Dashboard.
