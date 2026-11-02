# Revisão de segurança — ILYC

**Data:** 24/10/2026
**Escopo:** código Next.js/Supabase, configuração de headers, APIs administrativas, upload de imagens, migrations versionadas e respostas da implantação pública `landing-page-ilyc.vercel.app`.
**Limite:** revisão estática e probes HTTP sem sessão. Não tive acesso ao painel da Vercel nem ao estado efetivamente aplicado do banco; as policies foram revisadas nos arquivos de migration.

## Resultado

Não encontrei uma rota administrativa acessível sem sessão nem alertas conhecidos nas dependências auditadas. As rotas de conteúdo e usuários responderam `401` sem autenticação na produção. O banco usa RLS nas tabelas de conteúdo e bucket privado conforme as migrations do repositório.

## Achados

### SEC-01 — CSP ausente — Baixa, defesa em profundidade

- **Evidência:** `next.config.ts` configura headers de segurança, mas não `Content-Security-Policy`. A landing legada tem scripts e estilos inline, o que exige uma política compatível.
- **Impacto:** se uma falha de injeção de conteúdo surgir no futuro, o navegador não terá CSP para limitar a execução de scripts e o carregamento de recursos.
- **Correção recomendada:** testar `Content-Security-Policy-Report-Only` numa implantação e depois adotar CSP por nonce/hash, evitando liberar scripts inline de forma ampla.
- **Estado:** `Content-Security-Policy-Report-Only` configurada no projeto com as origens do próprio app, do Supabase e das fontes Google usadas pela landing. Essa política não bloqueia recursos; violações aparecem no console do navegador. CSP efetiva com nonce/hash continua pendente de análise das violações, especialmente dos scripts inline de hidratação do Next.

### SEC-02 — Limite de frequência para ações de e-mail — Baixa

- **Evidência:** as rotas de convite e reset de senha exigem papel `admin` e validação de origem. Foi implementado um rate limit compartilhado e atômico no Postgres: 10 ações por hora e 30 por dia por administrador e por tipo de ação.
- **Impacto:** uma conta administrativa comprometida poderia disparar muitos convites ou resets e consumir a cota do provedor de e-mail.
- **Correção:** migration `20261024230000_admin_email_rate_limit.sql` cria os contadores, limita execução da função ao `service_role` e registra tentativas/resultados sem armazenar e-mails. Respostas limitadas retornam `429` e `Retry-After`.
- **Estado:** código pronto; a migration ainda precisa ser aplicada no Supabase para os envios voltarem a funcionar. A aplicação falha fechada se o rate limit ou o registro de auditoria não estiver disponível.
- **Mitigação atual:** a operação continua restrita a admins autenticados; o endpoint não é público.

### SEC-03 — Sessão Supabase compartilhada na conversa — Alta, ação operacional

- **Evidência:** um cURL anterior nesta conversa continha cookie de sessão com access e refresh token.
- **Impacto:** quem obtiver esse valor enquanto válido pode tentar reutilizar a sessão daquele usuário.
- **Ação recomendada:** encerrar sessões ativas desse usuário no Supabase Auth e autenticar novamente. Não reutilizar o cookie do cURL.
- **Nota:** este achado diz respeito a credencial compartilhada na conversa, não a uma exposição encontrada no site público.

## Controles verificados

- As APIs administrativas de conteúdo e usuários responderam `401` sem sessão na implantação.
- A autorização do servidor valida o usuário atual no Supabase e o papel em `app_metadata`; gestão de usuários requer `admin`.
- Escritas administrativas verificam origem; mídia valida papel, tamanho, tipo MIME e assinatura binária e restringe caminhos gerados pelo servidor.
- O bucket `ilyc-portfolio` é privado nas migrations. RLS está habilitada nas tabelas de conteúdo; policies concedem leitura pública somente para conteúdo publicado e gestão a `admin`/`editor`.
- `.env*` está no `.gitignore`; apenas `.env.example` pode ser versionado. `SUPABASE_SECRET_KEY` é lida num módulo `server-only`.
- `npm audit` encontrou **0 vulnerabilidades conhecidas** nas 447 dependências resolvidas (27 produção, 383 desenvolvimento e 88 opcionais), nesta execução.
- O cabeçalho CSP está somente em modo `Report-Only`; ele não bloqueia recursos e não envia relatórios para armazenamento remoto. Inspecionar as violações no console durante uma implantação.
- A resposta pública da API usa `Cache-Control: no-store`; conteúdo não publicado não é enviado em produção.
- Headers presentes na produção durante a inspeção: `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `X-Frame-Options: SAMEORIGIN` e `Permissions-Policy`.
- HSTS e CSP `Report-Only` estão configurados localmente; a implantação ainda precisa ser atualizada para esses dois headers chegarem à produção.

## Alteração de URL

- `/ilyc-landing-page-select-ensaio.html` redireciona permanentemente para `/`.
- O preview interno usa `/landing`, reescrito para o HTML existente.
- A URL `.html` antiga continua como entrada compatível e encaminha visitantes para a raiz.

## Verificações executadas

- `npm audit --json`: 0 vulnerabilidades conhecidas.
- `npm run lint`: passou.
- `npx tsc --noEmit`: passou após regenerar os tipos de rota do Next com `next typegen`.
- `git diff --check`: passou.
- Produção: `/` e o HTML antigo responderam `200` antes da alteração local; `/api/admin/content` e `/api/admin/users` responderam `401` sem sessão.
- Local: `/` e `/landing` responderam `200`; o arquivo `.html` respondeu `308` para `/`; as duas APIs administrativas responderam `401`.

## Pendências operacionais

- Publicar as mudanças para o redirecionamento valer na Vercel e confirmar os headers após o deploy.
- Confirmar no Supabase Dashboard que as migrations/policies do banco correspondem ao repositório.
- Confirmar HSTS e CSP `Report-Only` após o deploy.
- Aplicar `20261024230000_admin_email_rate_limit.sql` no Supabase antes de testar convite/reset autenticados.
- Revisar violações CSP no console da implantação e depois planejar CSP com nonce/hash; habilitar MFA para administradores.
