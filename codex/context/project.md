# Contexto do projeto

## Visão e objetivo

Landing Page Ilyc é um sistema monolítico pequeno para a fotógrafa dona do site. Seu objetivo principal é apresentar o portfólio e transformar visitantes em clientes. A landing pública é a principal porta de entrada do negócio e deve receber atenção especial em qualidade visual, conteúdo, velocidade, experiência mobile, acessibilidade e SEO.

O portal `/admin` é uma ferramenta interna para a fotógrafa e sua equipe gerenciarem o conteúdo e os acessos. Ele é importante para manter a landing atualizada, mas a experiência que os clientes encontram na landing é o foco principal do produto.

## Arquitetura atual

A aplicação é um monólito Next.js com renderização no servidor para as páginas e rotas de API usadas pelo admin/editor. A landing pública e o portal administrativo compartilham a mesma aplicação e implantação. As rotas de API concentram operações administrativas e de edição; a autorização precisa continuar sendo validada no servidor.

Tecnologias atuais:

- Next.js 16 com App Router, React e TypeScript.
- Supabase Auth, Postgres e Storage como infraestrutura atual.
- A landing pública está em `src/app/page.tsx` e nos componentes de `src/components/landing/`.
- O portal administrativo e autenticação ficam em `src/components/admin/` e nas rotas de `src/app/`.
- Acesso privilegiado e integração Supabase ficam em `src/lib/server/` e `src/lib/supabase/`.
- SQL versionado fica em `supabase/migrations/`; verificações e documentação relacionadas ficam em `supabase/`.
- O HTML recebido como base visual está em `public/ilyc-landing-page-select-ensaio.html` e `reference/`.

Consulte `README.md` para instruções operacionais atualizadas, variáveis de ambiente, permissões, migrations e deploy. Se este resumo divergir do código ou do README, confirme o estado atual antes de alterar.

## Direção futura de infraestrutura

O Supabase é a solução usada hoje, não uma decisão permanente de produto. Está nos planos melhorar a infraestrutura, hospedar a aplicação em outro provedor e substituir o banco/serviços BaaS por uma solução própria ou diferente.

Ao implementar funcionalidades, mantenha as responsabilidades de negócio compreensíveis e evite espalhar dependências específicas do Supabase pela interface e pelas regras do produto. Prefira manter integrações e operações específicas de infraestrutura em pontos identificáveis para facilitar uma migração futura. Faça isso de forma proporcional: não crie camadas ou abstrações especulativas antes de haver uma necessidade concreta.

## Limites conhecidos

- Roles da aplicação são `admin` e `editor`, mantidas em `app_metadata.role` por processo confiável.
- O navegador não deve receber a chave secreta do Supabase nem poder atribuir roles.
- As fotos do portfólio ficam em bucket privado; o acesso público usa URLs temporárias assinadas.
- As migrations aplicadas são históricas: não reescreva uma migration já aplicada; adicione outra para mudanças futuras.
- O conteúdo público depende do estado publicado e das políticas RLS descritas no README.
