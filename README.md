# AI Viral Shorts Cutter

Aplicativo profissional para transformar vídeos longos, podcasts, entrevistas e transmissões em cortes verticais (9:16) dinâmicos e otimizados para YouTube Shorts, Instagram Reels, TikTok e Kwai, utilizando inteligência artificial com análise de retenção, visão multimodal e legendagem automática.

---

## 🛠 Requisitos de Sistema

- **Node.js**: v18.0.0 ou superior (suporte nativo a Fetch, ESM e Streams)
- **FFmpeg**: v5.0 ou superior instalado no PATH (`/usr/bin/ffmpeg` ou `ffmpeg`) com `ffprobe`
- **yt-dlp**: binário atualizado instalado no sistema (`/usr/bin/yt-dlp`, `/usr/local/bin/yt-dlp`) ou em `./bin/yt-dlp`

---

## ⚙️ Variáveis de Ambiente (.env)

Copie o arquivo de exemplo para iniciar:

```bash
cp .env.example .env
```

| Variável | Obrigatória | Padrão | Descrição |
| :--- | :--- | :--- | :--- |
| `PORT` | Não | `3000` | Porta HTTP do servidor Express. |
| `NODE_ENV` | Não | `development` | Em `production`, desativa logins demo, bloqueia chamadas locais inseguras de IA e reforça CSP/cookies seguros. |
| `APP_URL` | Não | `http://localhost:3000` | URL pública da aplicação para redirecionamentos OAuth do Google e cookies de sessão. |
| `SQLITE_DB_PATH` | Não | `./data/database.sqlite` | Caminho do banco de dados SQLite persistente (WAL mode e foreign keys ativos). |
| `GEMINI_API_KEY` | Sim (Produção) | — | Chave de API do Google AI Studio para geração de transcrições e identificação de momentos virais. |
| `GEMINI_TEXT_MODEL` | Não | `gemini-3.8-flash` | Modelo de texto padrão do Gemini. |
| `GEMINI_VISION_MODEL` | Não | `gemini-3.8-flash` | Modelo multimodal de visão computacional. |
| `APP_ENCRYPTION_KEY` | Sim (Produção) | — | Chave de 32+ caracteres para criptografia AES-256-GCM de tokens OAuth e hashes de sessão. |
| `GOOGLE_CLIENT_ID` | Recomendado | — | Client ID OAuth 2.0 da Google Cloud Platform para autenticação e publicação no YouTube. |
| `GOOGLE_CLIENT_SECRET`| Recomendado | — | Client Secret OAuth 2.0 da Google Cloud Platform. |
| `MAX_CONCURRENT_FFMPEG` | Não | `2` | Limite de processos concorrentes do FFmpeg via `p-limit` para prevenir sobrecarga de CPU e RAM. |
| `ENABLE_DEMO_LOGIN` | Não | `false` | Exige flag explícita para ativar o modo de demonstração (`/api/auth/demo-login`). Falha fechado se ausente. |

---

## 📦 Instalação e Execução

### Instalação de Dependências

```bash
npm install
```

### Modo de Desenvolvimento

```bash
npm run dev
```

O servidor Express e o cliente Vite serão inicializados em `http://localhost:3000`.

### Build de Produção

```bash
npm run build
npm start
```

O build compila o frontend React com o Vite (com code-splitting automático por rotas/abas) em `dist/` e o servidor Express com `esbuild` em `dist/server.js`.

### Testes e Verificação de Qualidade

```bash
# Executa a suíte de testes de regressão, segurança e concorrência (34 testes)
npm test

# Validação com ESLint e checagem estrita de tipos TypeScript (tsc --noEmit)
npm run lint
```

---

## 🏛 Arquitetura e Engenharia de Software

### 1. Persistência de Dados com SQLite (`better-sqlite3`)
- Substituição do armazenamento JSON em arquivo por SQLite com **WAL mode** (`PRAGMA journal_mode = WAL`), sincronismo normal e constraints de integridade referencial (`PRAGMA foreign_keys = ON; ON DELETE CASCADE`).
- **Mecanismo de Migrações Automáticas**: versionamento via tabela `schema_migrations` executado no boot da aplicação.
- **Backup e Migração Transparente**: importa automaticamente dados legados de `data/database.json` para o banco relacional e preserva uma cópia intacta em `database.json.bak`.
- **Persistência de Fila e Jobs**: jobs de renderização e metadados de cortes concluídos são persistidos na tabela `jobs`, sobrevivendo a reinicializações do servidor.

### 2. Controle de Concorrência e FFmpeg Throttling
- Fila controlada com `p-limit` baseada na variável `MAX_CONCURRENT_FFMPEG` (padrão: 2).
- Timeout de segurança (300 segundos por corte) e expiração automática de jobs inativos há mais de 1 hora.
- Manipulação assíncrona de arquivos via `fs/promises` em todos os manipuladores de requisição HTTP, eliminando bloqueios no event loop do Node.js.
- Remoção das fachadas não utilizadas `server/queue/videoWorker.ts` e `server/queue/videoQueue.ts`.

### 3. Hardening de Segurança (P0)
- **Isolamento Multi-tenant Estrito**: todos os recursos (clipes, jobs, arquivos de upload, zips de lote, projetos e credenciais) possuem vínculo direto com o `userId`. Tentativas de acesso entre usuários ou recursos órfãos retornam `404 Not Found` ou `403 Forbidden`. O fallback inseguro `'default'` foi completamente eliminado.
- **Proteção Completa contra SSRF (`assertSafeOutboundUrl`)**: resolução de DNS ativa antes da requisição (`dns.lookup`), bloqueio rigoroso de IPv4 privado (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8, 169.254.0.0/16), IPv6 loopback (`::1`), formatos alternativos (IP decimal/hexadecimal) e validação salto-a-salto de redirects.
- **Sessões HTTP-Only com Proteção CSRF**: tokens de sessão trafegados via cookies `HttpOnly; Secure; SameSite=Lax` combinados com token CSRF via cabeçalho `x-csrf-token` (estratégia double-submit). O token bruto nunca é exposto no DOM ou localStorage via inline script.
- **Hashes Criptográficos de Sessão**: tokens armazenados exclusivamente como hash SHA-256 no banco de dados.
- **Validação Estrutural de Uploads via `ffprobe`**: arquivos enviados passam por inspeção de cabeçalhos de mídia e streams, limitação de resolução e duração máxima, cota de disco por usuário e geração de nomes seguros no servidor (`crypto.randomBytes`).
- **Rate Limiting por Usuário**: proteção contra DoS e abuso aplicada por `userId` autenticado em rotas intensivas (`/api/batch`, `/api/download-youtube-cut`, `/api/upload-and-cut-short`).

### 4. Qualidade de Código e Tipagem
- TypeScript configurado em `"strict": true`.
- ESLint moderno integrado no pipeline de CI com script `npm run lint`.
- Validação de ambiente centralizada com **Zod** em `server/config.ts`, impedindo o boot em produção caso variáveis críticas estejam ausentes.
- **Logs Estruturados**: sanitização automática em `server/utils/logger.ts`, mascarando chaves de API, senhas, tokens Bearer e cookies.
- **Modularização de Serviços**: extração das funções de transcrição, metadados e legendas para `server/services/transcriptService.ts`.
- **Modularização do Frontend**: decomposição do componente monolítico de configurações em `src/components/settings/` (`AiProviderSettingsCard`, `YouTubeSettingsCard`, `SocialPlatformsSettingsCard`, `WebhookSettingsCard`).

### 5. Front-end, Resiliência e UX
- **Code-Splitting por Rota/Aba**: abas carregadas dinamicamente com `React.lazy` e empacotadas em chunks independentes pelo Vite, reduzindo o bundle inicial em mais de 50%.
- **Skeletons de Carregamento**: fallback fluido com `<TabLoadingSkeleton />` e `<CutsListSkeleton />` durante navegação e processamento de IA.
- **Resiliência e Retry no Cliente**: requisições em `src/utils/api.ts` incorporam repetições com backoff exponencial automático para falhas de rede intermitentes e erros 502/503/504.
- **Estados Vazios Acionáveis**: componente `<EmptyState />` com instruções claras e ações de retorno em todas as etapas do fluxo.
