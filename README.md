# AI Viral Shorts Cutter

Aplicativo profissional para transformar vídeos longos, podcasts, entrevistas e transmissões em cortes verticais (9:16) dinâmicos e otimizados para YouTube Shorts, Instagram Reels, TikTok e Kwai, utilizando inteligência artificial com análise de retenção e legendagem automática.

---

## 🛠 Requisitos de Sistema

- **Node.js**: v18.0.0 ou superior (suporte nativo a Fetch e Streams)
- **FFmpeg**: v5.0 ou superior instalado no PATH (`/usr/bin/ffmpeg` ou `ffmpeg`)
- **yt-dlp**: binário atualizado instalado no sistema (`/usr/bin/yt-dlp`, `/usr/local/bin/yt-dlp`) ou em `./bin/yt-dlp`

---

## ⚙️ Variáveis de Ambiente (.env)

Copie o arquivo de exemplo para iniciar:

```bash
cp .env.example .env
```

| Variável | Obrigatória | Descrição |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | Sim (Produção) | Chave de API do Google AI Studio para geração de transcrições, identificação de ganchos virais e visão computacional multimodal de enquadramento. |
| `APP_ENCRYPTION_KEY` | Sim (Produção) | Chave de 32 bytes (ou passphrase longa) utilizada para criptografia em repouso AES-256-GCM de tokens OAuth, chaves e cookies no banco de dados. |
| `NODE_ENV` | Não (`development` por padrão) | Quando definido como `production`, desativa logins de demonstração, bloqueia chamadas locais inseguras de IA e reforça CSP e segurança. |
| `APP_URL` | Não (`http://localhost:3000` por padrão) | URL pública da aplicação para redirecionamentos OAuth do Google. |
| `GOOGLE_CLIENT_ID` | Recomendado | ID de cliente OAuth 2.0 da Google Cloud Platform para autenticação de usuários e publicação direta no YouTube. |
| `GOOGLE_CLIENT_SECRET` | Recomendado | Client Secret OAuth 2.0 da Google Cloud Platform. |
| `PORT` | Não (`3000` por padrão) | Porta HTTP do servidor Express. |

---

## 📦 Instalação e Execução

### Modo de Desenvolvimento

```bash
npm install
npm run dev
```

O servidor Express e o cliente Vite serão inicializados em `http://localhost:3000`.

### Build de Produção

```bash
npm run build
npm start
```

O comando de build compila o frontend React com o Vite em `dist/` e o servidor Express com `esbuild` em `dist/server.js`.

### Testes e Verificação de Tipos

```bash
# Executar suíte de testes unitários
npm test

# Validação rigorosa de tipagem TypeScript
npm run lint
```

---

## 🔒 Arquitetura de Segurança e Hardening (P0–P3)

1. **Autenticação Segura**: Sessões com tokens Bearer / `x-session-token`, expurgo periódico de sessões expiradas no SQLite/JSON Store e proteção total de rotas privadas sem fallback para usuário 'default'.
2. **Prevenção de Vazamento de Credenciais**: Endpoints de configuração retornam apenas representações mascaradas via allowlist, impedindo a exposição de tokens de acesso, refresh tokens ou cookies.
3. **Persistência Atômica**: Gravações com escrita atômica via arquivo temporário + renomeação (`.tmp` → `.json`), com criação de backup prévio (`.bak`).
4. **Proteção contra Injeção de Comandos**: Validação estrita de URLs do YouTube (`normalizeSafeYouTubeUrl`), rejeição de metacaracteres de shell e uso do delimitador `--` em comandos de linha.
5. **Mitigação de SSRF**: Restrição estrita de endpoints de teste de modelos locais (Ollama), bloqueando redes privadas e serviços de metadados em produção.
