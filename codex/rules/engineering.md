# Regras de engenharia

- Leia o `AGENTS.md` da raiz. Para APIs do Next.js, siga a documentação da versão instalada em `node_modules/next/dist/docs/` antes de implementar.
- Inspecione os componentes e padrões existentes antes de criar abstrações ou dependências novas.
- Mantenha mudanças de API alinhadas ao recurso: use `POST` para criação, `PATCH` para alterações parciais dos campos enviados e `DELETE` para remoção. Não envie campos não relacionados nem salve alterações do formulário como efeito colateral de uma troca de foto.
- Mantenha TypeScript estrito e prefira os tipos já definidos no domínio.
- Preserve acessibilidade: controles com rótulos claros, navegação por teclado e estados de foco visíveis.
- Para telas, considere mobile e desktop e reutilize o sistema visual já presente no projeto.
- Ao mexer na landing, trate-a como a principal experiência para clientes: preserve a identidade da fotógrafa, a qualidade das imagens, a clareza da oferta e o caminho até o contato. Considere desempenho, acessibilidade, responsividade e SEO como parte da implementação.
- Admin e editor são ferramentas internas que sustentam a atualização do portfólio; mantenha os fluxos administrativos claros e confiáveis sem deixar que detalhes do painel prejudiquem a experiência pública.
- O sistema é um monólito pequeno. Mantenha uma solução simples e coesa; deixe pontos de integração com a infraestrutura identificáveis, sem criar abstrações prematuras para uma possível troca do Supabase.
- Mantenha dados e segredos no lado do servidor quando possível. Não use `NEXT_PUBLIC_` para segredos.
- Siga os scripts já disponíveis em `package.json`; não instale dependências sem necessidade clara.
- Atualize `README.md` ou os documentos em `codex/` quando o comportamento operacional ou uma decisão permanente mudar.
- Não rode comandos de validação por iniciativa própria; faça isso quando a pessoa pedir testes ou verificação.
