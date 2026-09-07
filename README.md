# Bolo com Café — Sistema de Registro e Controle

Projeto web com **dois acessos**:
- **Vendas**: Registro de Vendas
- **Gestão**: Registro de Vendas + Controle

Os dois módulos usam a mesma tabela no Supabase e recebem atualizações em tempo real.

## Estrutura
- `index.html` — página principal
- `styles.css` — identidade visual baseada na logomarca
- `app.js` — login, tabela de vendas, dashboard e realtime
- `supabase.sql` — banco, perfis, permissões e realtime
- `public/logo-bolo-com-cafe.jpeg` — logomarca

## Colunas do Registro de Vendas
1. Data
2. Cliente
3. Canal do pedido
4. Bolo inteiro — sabor
5. Preço
6. Bolo no pote — sabor
7. Preço
8. Fatia — sabor
9. Preço
10. Cookies (P ou G)
11. Preço
12. Observações
13. Ações

## Sabores cadastrados

### Bolo inteiro
Baeta; Banana; Banana com doce de leite; Branco; Brownie Maluco; Cenoura;
Cenoura Supreme; Chocolate; Chocolatudo; Choconinho; Churros; Cocada;
Formigueiro; Frutas Vermelhas; Laranja; Limão Siciliano; Limão siciliano com amora;
Macaxeira Caramelizada; Milho Cremoso; Ninho; Paçoca; Queijadinha;
Queijo com goiabada; Bolo de Noiva.

### Fatias
Brownie Maluco; Bolo de Noiva; Laranja; Limão Siciliano; Cenoura; Brownie.

### Bolo no pote
Oreo; Dois amores; Chocolate; Ovomaltine.

### Cookies
Pequeno; Grande.

## Configuração rápida

### 1) Supabase
Crie um projeto no Supabase e execute o arquivo `supabase.sql` em:
**SQL Editor > New query**

### 2) Usuários
Em **Authentication > Users**, crie os usuários de Vendas e Gestão.

Todo novo usuário começa como `vendas`.

Para transformar um usuário em Gestão:
```sql
update public.profiles
set role = 'gestao', name = 'Nome da Gestora'
where id = 'UUID_DO_USUARIO';
```

### 3) Credenciais do frontend
Abra `app.js` e substitua:
```js
const SUPABASE_URL = "COLE_AQUI_SUA_SUPABASE_URL";
const SUPABASE_ANON_KEY = "COLE_AQUI_SUA_SUPABASE_ANON_KEY";
```

Use somente a **Anon/Public key** no frontend. Nunca coloque a `service_role` no navegador.

### 4) Rodar localmente
Como o projeto usa módulos ES, rode com um servidor estático.
Exemplo:
```bash
python -m http.server 8080
```
Depois abra:
`http://localhost:8080`

Também pode publicar no Vercel/Netlify/Cloudflare Pages como site estático.

## Como o Controle é alimentado
A tabela `sales` é a fonte única.
Quando Vendas cria ou altera um pedido:
1. o dado é salvo no Supabase;
2. o Supabase Realtime envia a alteração;
3. o Controle refaz automaticamente os indicadores.

Não há duplicação de dados entre as duas áreas.

## Observação
A estrutura permite acrescentar depois:
- quantidades por item;
- cadastro de preços padrão;
- exportação PDF/Excel;
- filtros por canal;
- relatório anual;
- metas mensais.
