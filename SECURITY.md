# Segurança de publicação — Q Oportunidade

## Fluxo de dados

```text
Navegador
  ├─ GET /api/feirao/properties ─┐
  └─ POST /api/leads/imobzi ─────┤
                                 ▼
Rotas fechadas do Next.js → módulos server-only → API oficial do Imobzi
```

O navegador recebe apenas o catálogo serializado campo a campo. URL, método,
headers e corpo enviados ao Imobzi são definidos no servidor. Não existe proxy
genérico nem entrada do cliente capaz de selecionar um endpoint upstream.

## Rotas

| Rota | Acesso | Proteções |
|---|---|---|
| `GET /api/feirao/properties` | Público | catálogo sanitizado, allowlist, cache e limite distribuído de 30/min/IP |
| `POST /api/leads/imobzi` | Público | origem/host, JSON estrito de 4 KB, allowlist, Turnstile, honeypot, tempo mínimo, rate limit e idempotência |
| `GET /api/internal/catalog/sync` | Privado | Bearer, comparação segura e ação única |

## Variáveis necessárias

```dotenv
IMOBZI_API_BASE_URL=
IMOBZI_API_KEY_READ=
IMOBZI_API_KEY_LEADS=
IMOBZI_API_TIMEOUT_MS=
IMOBZI_ALLOWED_HOST=
APP_ALLOWED_ORIGINS=
LEAD_HASH_KEY=
SUPABASE_URL=
SUPABASE_SECRET_KEY=
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
TURNSTILE_HOSTNAMES=
CRON_SECRET=
```

Somente a chave pública do widget Turnstile usa `NEXT_PUBLIC_`. Preview e
produção devem ter credenciais separadas. Produção falha fechada se o
armazenamento distribuído ou as credenciais dedicadas estiverem ausentes.

## Configuração manual obrigatória na Vercel

1. Cadastrar os valores como variáveis sensíveis, com escopo separado para
   Development, Preview e Production. Não fornecer chaves de produção a previews.
2. Definir `APP_ALLOWED_ORIGINS` e `TURNSTILE_HOSTNAMES` apenas com domínios
   exatos; não usar wildcard.
3. Executar a migration em `supabase/migrations` e cadastrar a URL e a Secret
   Key server-side do Supabase. A tabela de segurança permanece em schema privado.
4. Ativar Deployment Protection para Preview e manter somente Production pública.
5. Configurar o Cron para `/api/internal/catalog/sync` com `CRON_SECRET`.
6. Ativar MFA, revisar membros e restringir alterações de variáveis sensíveis.
7. Confirmar HTTPS em todos os subdomínios antes de adicionar `includeSubDomains`
   ou `preload` ao HSTS. Hoje a aplicação envia HSTS sem essas diretivas.

### WAF recomendado

- Ativar Managed Rulesets disponíveis no plano.
- `POST /api/leads/imobzi`: burst de 5 em 15 minutos por IP.
- `GET /api/feirao/properties`: 30 por minuto por IP.
- Bloquear métodos não documentados e automação anômala.
- Observar falsos positivos antes de endurecer limites.

O limite distribuído da aplicação continua obrigatório; o WAF é camada adicional.

## Rotação e incidente

Antes da publicação, revogue qualquer credencial que já tenha estado em frontend,
commit, log ou deployment público. Crie credenciais distintas de leitura e leads,
com privilégio mínimo, cadastre-as somente na Vercel e faça novo deploy.

Em caso de suspeita: desative a credencial no Imobzi, interrompa deployments
afetados, gere novas credenciais, revise logs sem PII, invalide artefatos/caches,
refaça o deploy e documente período e alcance. Apagar o texto do repositório não
recupera uma chave exposta.

## Checklist de validação

- Rodar `npm audit`, `npm run typecheck`, `npm run lint` e `npm run build`.
- Procurar nomes e valores secretos em fonte, HTML, chunks, mapas e logs, sem
  imprimir o valor pesquisado.
- Confirmar no navegador que não há chamada para `api.imobzi.app`.
- Exercitar origem ausente/externa, método errado, JSON inválido, corpo >4 KB,
  campos extras, HTML, telefone/código inválido e código fora da campanha.
- Confirmar `429` e `Retry-After`.
- Testar Turnstile com chaves oficiais de teste.
- Testar timeout, 401/403/404/429/500, resposta grande e não JSON em ambiente
  isolado, sem criar lead real.

## Riscos residuais e bloqueios

- Este diretório não contém `.git`; o histórico remoto e commits removidos devem
  ser verificados no repositório oficial.
- Deployments antigos, logs da Vercel, MFA, membros, WAF, Deployment Protection e
  rotação no Imobzi só podem ser confirmados nos respectivos painéis.
- A CSP precisa de `'unsafe-inline'` para scripts/estilos inline da arquitetura
  atual do Next. `unsafe-eval` não é permitido em produção. Migrar para nonce é
  um endurecimento futuro recomendado.
- Turnstile e o CDN público de imagens são as únicas origens externas previstas
  no navegador; nenhum recebe credencial do Imobzi.

O deploy permanece bloqueado até a verificação do histórico/deployments, rotação
quando aplicável e confirmação das configurações manuais.

## Resultado local em 30/07/2026

- Build de produção e TypeScript: aprovados.
- ESLint: zero erros (há avisos de qualidade legados, sem falha).
- `npm audit`: zero vulnerabilidades em produção e desenvolvimento.
- Bundle público: zero nomes/valores de segredo, zero referência à API do Imobzi
  e zero source maps públicos.
- Fonte: zero variáveis públicas do Imobzi, CORS wildcard ou proxy genérico.
- Cabeçalhos: CSP ativa, HSTS, `nosniff`, Referrer Policy, Permissions Policy,
  COOP e `DENY` confirmados por HTTP.
- Catálogo sanitizado: HTTP 200 em execução local.
- Manipulação: origem externa/ausente 403; método errado 405; JSON, campo extra,
  HTML e código em formato de URL 400; corpo maior que 4 KB 413.
- Rate limit: sexta tentativa no mesmo IP retornou 429 com `Retry-After`. Em
  produção, contadores e reservas atômicas usam funções privadas do Supabase.
- O histórico Git não pôde ser testado porque `.git` não existe neste diretório.
