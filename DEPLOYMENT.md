# Deploy da Ilyc

## Vercel e integração contínua

O projeto é um monólito Next.js conectado à Vercel pelo repositório GitHub. Commits na branch de produção `main` geram um deploy de produção; as demais branches geram previews. A Vercel executa o build do Next.js automaticamente.

Projeto Vercel: https://vercel.com/essoft1/landing-page-ilyc  
Domínio padrão: https://landing-page-ilyc.vercel.app

## Variáveis de ambiente

Cadastrar na Vercel para Production e Preview, sempre usando o painel de Environment Variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY` (segredo exclusivamente de servidor)
- `NEXT_PUBLIC_SITE_URL` (URL pública do ambiente; em produção usar o domínio HTTPS)

Não gravar valores reais no Git, README, issues ou logs. Após alterar uma variável, criar um novo deploy para que o runtime carregue o valor.

## Supabase Auth

Permitir os URLs de callback correspondentes em Authentication > URL Configuration. Em produção, configurar o domínio HTTPS da Vercel e validar os templates de convite e redefinição de senha. Os fluxos de e-mail/SMTP ainda precisam de teste de ponta a ponta em produção.

## Migrations e publicação

Antes de publicar mudanças que dependem de banco, conferir se a migration correspondente está aplicada no projeto Supabase. A landing só apresenta o conteúdo quando `site_settings.is_published` estiver ativo. Validar login, permissões, upload e publicação de fotos, convites e redefinição de senha após o primeiro deploy.

## Git Flow

- `main`: produção; integrar versões revisadas por pull request.
- `develop`: integração; previews automáticos.
- `feature/*` e `bugfix/*`: abrir a partir de `develop` e integrar por pull request.
- `release/*`: validar em preview e integrar em `main`.
- `hotfix/*`: correções urgentes a partir de `main`, depois sincronizar com `develop`.

Nunca enviar `.env.local`, chaves secretas, `.next/` ou `node_modules/` ao repositório.
