# Landing Page Ilyc

Monólito em Next.js para a landing pública, o portal administrativo e as rotas de servidor. A base usa TypeScript e App Router; o Supabase será a camada de autenticação, dados e arquivos.

## Requisitos e execução

- Node.js 20.9 ou superior
- npm

```bash
npm install
npm run dev
```

Abra http://localhost:3000. A página `/admin/login` inicia a sessão; `/admin` é o editor da landing e `/admin/usuarios` é a gestão de acessos exclusiva para administradores.

## Ambiente Supabase

1. Copie `.env.example` para `.env.local`.
2. Preencha `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` com os valores do projeto Supabase. No ambiente local deste projeto, esses valores já foram configurados e a conexão com Auth foi verificada.
3. `NEXT_PUBLIC_SITE_URL` define a URL pública do ambiente. No `.env.local`, use `http://localhost:3000`; na Vercel, configure a URL de produção com HTTPS. Em deploys de preview da Vercel, o app usa `VERCEL_URL` se a variável explícita estiver vazia. Permita `/auth/confirm` em Authentication > URL Configuration no Supabase para cada ambiente.
4. `SUPABASE_SECRET_KEY` é necessária para a gestão de usuários do Auth Admin API e para a operação pontual descrita abaixo. Ela deve ficar somente em `.env.local` durante desenvolvimento e como variável de servidor na Vercel, sem prefixo `NEXT_PUBLIC_`.

O Next.js já carrega arquivos de ambiente. Não é necessário instalar `dotenv`. O `.gitignore` exclui `.env.local` e os demais arquivos `.env*`, mantendo apenas o `.env.example` sem valores secretos.

A URL e a chave *publishable* são identificadores públicos do projeto; a segurança dos dados depende de RLS e das verificações no servidor. Nunca coloque `SUPABASE_SECRET_KEY`, `service_role` ou outra chave secreta em variável `NEXT_PUBLIC_*`. A role `admin` ou `editor` é lida de `app_metadata`, que precisa ser atribuída por um processo confiável no servidor/Supabase, nunca pelo formulário ou pelo navegador.

Sem as variáveis Supabase, o projeto compila, mas o admin fica fechado com mensagem de configuração e as APIs protegidas respondem sem expor conteúdo. A conexão Auth já foi confirmada; login de uma conta e permissões dependem da criação da conta e da atribuição confiável da role.

## Modelo de conteúdo e permissões

A migração inicial está em `supabase/migrations/20261024143000_initial_content_schema.sql`. Ela prepara:

- `site_settings` para os textos, contatos e imagens da apresentação;
- `portfolio_projects` e `portfolio_images` para criar, ordenar, publicar e ocultar ensaios;
- `process_steps` para as etapas do atendimento;
- `faq_items` para perguntas e respostas futuras;
- o bucket privado `ilyc-portfolio` para fotos.

O editor em `/admin` organiza o conteúdo nas seções existentes do HTML: Início, Ensaios e fotos, Sobre, Como funciona e Contato. Permite editar textos, incluir ou remover ensaios, enviar/remover fotos, ordenar itens e controlar sua publicação. Cada seção tem uma prévia ao vivo do rascunho; ela não grava até a pessoa salvar. A landing pública consulta do servidor as configurações e os itens publicados; fotos privadas são exibidas por URLs temporárias. O HTML inicial segue em `public/ilyc-landing-page-select-ensaio.html` como estrutura e referência visual. A tabela `faq_items` permanece no esquema como estrutura futura, sem adicionar uma seção à landing deste MVP.

### Fluxo manual de migrations

Para este MVP, não vamos adicionar ORM nem ferramenta de migrations. Cada mudança de banco fica registrada como um novo arquivo SQL em `supabase/migrations/`, com prefixo de data e descrição curta. Depois de aplicada, uma migration não deve ser editada; ajustes futuros entram em outro arquivo. A execução será feita manualmente no Supabase quando for solicitada, e o histórico versionado no projeto servirá como registro do que foi alterado.

Para aplicar uma migration manualmente:

1. Abra o projeto correto no Dashboard do Supabase e entre em **SQL Editor**.
2. Crie uma consulta nova e copie o conteúdo integral do arquivo SQL ainda não aplicado em `supabase/migrations/`.
3. Revise se o projeto selecionado é o de desenvolvimento correto e execute a consulta.
4. Confira o resultado antes de marcar a migration como aplicada. Mantenha o arquivo original no repositório como histórico.

Não execute novamente uma migration já aplicada. A chave publishable usada pelo app não serve para executar DDL; essa operação exige o acesso autorizado ao Dashboard.

`supabase/migrations/20261024190000_photo_crop_settings.sql` foi aplicada no Supabase em 24/10/2026. Ela adiciona posição e zoom das imagens, com valores padrão centralizados para as fotos existentes.

`supabase/migrations/20261024210000_portfolio_image_fit_mode.sql` adiciona a escolha por foto de ensaio entre preencher o quadro com corte ou mostrar a imagem inteira. Mantenha o histórico de execução do Supabase alinhado com os arquivos de migration antes de publicar uma alteração que dependa deles.

RLS fica habilitado em todas as tabelas. Visitantes só leem conteúdo publicado; `admin` e `editor` podem editar conteúdo. As fotos ficam em bucket privado e só são servidas por URLs temporárias para ensaios publicados. Os privilégios SQL são revogados e concedidos explicitamente antes das políticas RLS.

As roles vêm de `app_metadata.role`, definido por uma operação confiável no Supabase. O cliente web não pode se promover. Como o valor está no JWT, mudanças de role passam a valer para a sessão quando o token for renovado; para o MVP, não guardaremos dados sensíveis dos clientes neste banco.

O projeto informa que esta migração já foi aplicada. A conexão pública confirmou que as cinco tabelas existem; a leitura sem role autorizada retorna zero linhas, como esperado pelas políticas. A confirmação direta dos flags/policies no catálogo do Postgres pode ser feita com `supabase/verification/check_rls_status.sql` no SQL Editor.

### Atribuição inicial da role admin

A tela Authentication > Users cria a conta, mas não é necessariamente onde se configura o papel da aplicação. O projeto exige `app_metadata.role`, e essa claim só pode ser atualizada por uma operação administrativa confiável. Para a configuração inicial, adicione a chave secreta do projeto em `SUPABASE_SECRET_KEY` no `.env.local` (não a compartilhe no chat nem a use no browser) e execute `npm run admin:grant -- email@exemplo.com`. O script encontra exatamente esse usuário, mostra uma confirmação no terminal e adiciona `role: admin` preservando os outros campos de `app_metadata`. Depois, encerre e inicie uma nova sessão para receber um JWT atualizado.

### Gestão de usuários no portal

`/admin/usuarios` fica disponível apenas para `admin`. A lista, convites, reset de senha e exclusão usam rotas que revalidam autenticação, role e origem no servidor. O usuário convidado cria sua senha em `/admin/definir-senha`; o administrador envia um link de recuperação, sem visualizar ou escolher a senha de outra pessoa. A exclusão exige confirmação, não permite apagar a própria conta e mantém ao menos um admin. O servidor retorna somente e-mail, papel e estado do usuário; a chave secreta nunca vai ao navegador.

Para que o link do e-mail abra a criação/redefinição de senha, ajuste os templates **Invitation** e **Reset Password** em Authentication > Email Templates. No link de cada template, use o URL redirecionado pelo app e o token hash:

- Invitation: `{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=invite`
- Reset Password: `{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=recovery`

O redirecionamento já leva para `/auth/confirm?next=%2Fadmin%2Fdefinir-senha`; a rota valida o token no servidor, grava a sessão em cookie e então abre o formulário. Mantenha as URLs `http://localhost:3000/auth/confirm` e `https://SEU-DOMINIO/auth/confirm` permitidas no Supabase. Os links anteriores enviados antes dessa alteração podem continuar levando ao login; envie um novo convite ou reset após atualizar os templates.

Convites por e-mail dependem da configuração de e-mail do Supabase. O provedor SMTP padrão é limitado a destinatários que pertencem à organização do projeto e tem limite de envio; para convidar pessoas externas, configure um SMTP próprio. O callback dinâmico `/auth/confirm` e os domínios de desenvolvimento, produção e preview precisam estar permitidos na configuração de Auth do projeto.

## Verificação de acesso

`src/lib/server/admin-auth.ts` consulta o usuário atual com `supabase.auth.getUser()` em cada ação privilegiada e aceita somente `app_metadata.role` igual a `admin` ou `editor`. Isso faz uma troca de papel valer sem esperar o JWT antigo expirar. Conteúdo exige uma dessas duas roles; gestão de usuários exige `admin`. As mutações também verificam a origem da chamada. A proteção não depende de esconder botões na interface.

## Preparação para Vercel

- Configure na Vercel `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` e `NEXT_PUBLIC_SITE_URL`. A chave secreta deve ser cadastrada como variável de ambiente de servidor, nunca com prefixo `NEXT_PUBLIC_`.
- Em produção, a API pública só retorna conteúdo quando `site_settings.is_published` estiver verdadeiro. Enquanto não publicado, a landing exibe uma mensagem de site em preparação sem revelar rascunhos. O preview de rascunhos permanece disponível no ambiente local.
- As fotos publicadas são assinadas em lote; as respostas seguem sem cache por conter URLs temporárias.
- Os uploads via API aceitam arquivos de imagem até 4 MB e checam o tamanho do corpo antes de interpretar o multipart, respeitando o limite de 4,5 MB de uma Vercel Function. Para imagens maiores, planejar upload direto ao Supabase Storage com autorização temporária.
- `next.config.ts` define `nosniff`, `Referrer-Policy`, `Permissions-Policy` e `X-Frame-Options: SAMEORIGIN` para preservar o preview do admin em iframe. CSP fica para uma etapa de observação/teste, porque a página de referência usa CSS e scripts inline.
- Antes do deploy, confirme as migrations do Supabase, a URL de retorno de convite, e-mail/SMTP e o estado publicado do conteúdo. As rotas de dados e conteúdo continuam dependentes das variáveis do servidor.

## Estrutura

```text
src/
  app/
    (admin)/admin/     # Páginas administrativas protegidas por layout
    (auth)/admin/login/# Login público, fora do layout protegido
    api/admin/          # Endpoints com autenticação e autorização
    api/health/         # Health check também protegido
    page.tsx            # Landing pública
  components/admin/     # Editor de conteúdo, usuários, login e sessão
  components/landing/   # Landing dinâmica ligada ao conteúdo publicado
  lib/server/           # Regras de acesso e origem executadas só no servidor
  lib/supabase/         # Clientes de navegador, servidor e atualização de sessão
  proxy.ts              # Atualiza a sessão Supabase no Next.js 16
public/                 # HTML original disponível como preview visual
reference/              # Cópia de referência do HTML recebido
```

## Scripts

- `npm run dev` inicia o ambiente local.
- `npm run lint` verifica o código com ESLint.
- `npm run build` gera a versão de produção.
- `npm run start` serve a versão de produção localmente.

> A estrutura visual original é o esqueleto da landing e lê as configurações publicadas no Supabase. A página mantém uma tela de carregamento até receber o conteúdo, sem mostrar os placeholders do HTML. Para o portal carregar dados, o Supabase precisa estar configurado, as migrations aplicadas, e a conta autenticada precisa ter `app_metadata.role` definida como `admin` ou `editor`.

## Git Flow

O repositório usa um fluxo simples baseado em `main` e `develop`:

- `main`: versão estável pronta para produção. Alterações chegam por pull request de uma branch `release/*` ou `hotfix/*`.
- `develop`: integração do próximo ciclo. É a base para novas funcionalidades, correções e branches de release.
- `feature/<nome>`: novas funcionalidades, abertas a partir de `develop` e integradas de volta por pull request.
- `bugfix/<nome>`: correções comuns, abertas a partir de `develop` e integradas de volta por pull request.
- `release/<versao>`: preparação de uma versão a partir de `develop`; depois de validada, integrar em `main` e atualizar `develop`.
- `hotfix/<nome>`: correção urgente aberta a partir de `main`; integrar em `main` e também em `develop`.

Exemplo para começar uma funcionalidade:

```bash
git switch develop
git pull origin develop
git switch -c feature/nome-da-funcionalidade
```

Ao concluir, publique a branch e abra um pull request para `develop`:

```bash
git push -u origin feature/nome-da-funcionalidade
```

Não envie `.env.local`, chaves privadas, tokens, arquivos `.next/` ou `node_modules/` ao repositório. O `.env.example` lista as variáveis necessárias com os valores vazios para preenchimento local.
