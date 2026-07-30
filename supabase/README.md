# Configuração do Supabase

1. No painel do projeto, abra **SQL Editor** e execute integralmente
   `migrations/202607300001_qopp_security.sql`.
2. Em **Project Settings → API Keys**, copie a Project URL e crie/copie uma
   Secret Key server-side.
3. Na Vercel, cadastre em Production:

```dotenv
SUPABASE_URL=https://SEU_PROJECT_REF.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
```

`SUPABASE_SECRET_KEY` deve ser marcada como Sensitive e nunca pode receber o
prefixo `NEXT_PUBLIC_`.

A migration cria somente contadores anônimos e temporários. Nome, telefone,
lead, credencial do Imobzi e conteúdo do catálogo não são persistidos.

Depois de cadastrar as variáveis, faça um novo deployment na Vercel. O endpoint
`/api/feirao/properties` deve deixar de responder 503 e retornar o catálogo.
