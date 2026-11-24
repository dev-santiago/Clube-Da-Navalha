# Clube da Navalha (Vercel + Neon)

SaaS de agendamento para barbearias. Cada barbearia tem um link próprio (`/b/seu-link`),
painel em `/admin` e os clientes acompanham seus horários em `/cliente`.

## Estrutura

```
api/index.js        entrada da API (função da Vercel) e /api/health
routes/             admin.js, client.js, public.js
lib/                db.js (Neon/Postgres), auth.js (login JWT), utils.js (horários)
scripts/check-db.js testa a conexão com o banco
public/             páginas e estilos (index, admin, barbearia, cliente)
local.js            servidor para rodar no computador
schema.sql          o mesmo SQL que o db.js cria sozinho
```

## Publicar na Vercel com o banco Neon

1. **GitHub:** crie um repositório e envie TODOS os arquivos desta pasta na raiz
   (o `package.json` precisa ficar na raiz, não dentro de outra pasta).
2. **Vercel:** Add New > Project > escolha o repositório.
   - Framework Preset: **Other**
   - Deixe Build Command e Output Directory em branco (o `vercel.json` já define).
   - Clique em Deploy (pode falhar a conexão com o banco neste primeiro deploy, é normal).
3. **Conectar o banco:** na Vercel, abra **Storage**, entre no seu banco Neon
   (por exemplo `neon-aero-ball`), clique em **Connect Project** e escolha este projeto.
   A Vercel cadastra o `DATABASE_URL` sozinha. Use um banco só para este projeto,
   sem reaproveitar o de outro sistema.
4. **Variáveis:** em Settings > Environment Variables, cadastre:
   - `JWT_SECRET`: um texto longo e aleatório (gere com `npm run gen-secret`)
   - `APP_TIMEZONE`: `America/Sao_Paulo`
   - `OWNER_EMAIL` e `OWNER_PASSWORD`: seu e-mail e uma senha exclusiva com pelo menos 12 caracteres para acessar `/owner`
5. **Redeploy:** Deployments > menu do último deploy > Redeploy (variáveis só valem após novo deploy).
6. **Conferir:** abra `https://SEU-SITE.vercel.app/api/health`. O esperado é
   `{"DATABASE_URL":true,"fonte":"DATABASE_URL","JWT_SECRET":true,"banco":"conectado"}`.
7. Abra `/admin`, clique em **Criar conta** e cadastre a barbearia.

### Central privada de cobranças

Configure `OWNER_EMAIL` e `OWNER_PASSWORD` no `.env` local ou nas variáveis da Vercel. Depois abra `/owner` para ver as barbearias, lançar o valor mensal, definir vencimento, enviar a cobrança por WhatsApp e marcar pagamentos. A central não tem cadastro público; use uma senha forte e exclusiva.

As tabelas são criadas sozinhas no primeiro acesso. Se preferir, rode o `schema.sql`
no editor SQL do Neon.

## Rodar no computador

```bash
cp .env.example .env     # preencha DATABASE_URL e JWT_SECRET
npm install
npm run db:check         # confirma a conexão e cria as tabelas
npm start                # http://localhost:3000
```

## Problemas comuns

- `/api/health` mostra `DATABASE_URL: false`: o banco não está conectado a este projeto (passo 3) ou falta Redeploy.
- `JWT_SECRET: false` ou erro ao entrar: cadastre a variável (passo 4) e faça Redeploy.
- `falha ao conectar`: confira se a string do Neon tem `sslmode=require` e se o banco está ativo em Storage.
