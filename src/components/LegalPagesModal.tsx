import React, { useState } from 'react';
import {
  X,
  ShieldCheck,
  FileText,
  Check,
  Copy,
  Download,
  ExternalLink,
  Globe,
  AlertTriangle,
  Sparkles,
  BookOpen,
} from 'lucide-react';

interface LegalPagesModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: 'privacy' | 'terms' | 'hosting';
}

export const LegalPagesModal: React.FC<LegalPagesModalProps> = ({
  isOpen,
  onClose,
  defaultTab = 'privacy',
}) => {
  const [activeTab, setActiveTab] = useState<'privacy' | 'terms' | 'hosting'>(defaultTab);
  const [language, setLanguage] = useState<'en' | 'pt'>('en');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentUrl =
    typeof window !== 'undefined'
      ? window.location.origin
      : 'https://ais-pre-ltudgifgehf3xcxgif3v3g-181386880351.us-east1.run.app';

  const privacyUrl = `${currentUrl}/privacy`;
  const termsUrl = `${currentUrl}/terms`;

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  // Helper to trigger direct browser download of standalone, beautiful HTML files
  const handleDownloadHtml = (type: 'privacy' | 'terms') => {
    const isPrivacy = type === 'privacy';
    const filename = isPrivacy ? 'privacy-policy.html' : 'terms-of-service.html';
    const title = isPrivacy ? 'Privacy Policy - ViralShorts Studio AI' : 'Terms of Service - ViralShorts Studio AI';
    const bodyContent = isPrivacy ? PRIVACY_POLICY_EN_HTML : TERMS_OF_SERVICE_EN_HTML;

    const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: #0d0f17;
      color: #e2e8f0;
      line-height: 1.7;
    }
    .wrapper {
      max-width: 820px;
      margin: 0 auto;
      padding: 48px 24px 80px;
    }
    .badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 9999px;
      background: rgba(168, 85, 247, 0.15);
      border: 1px solid rgba(168, 85, 247, 0.4);
      color: #d8b4fe;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 12px;
    }
    h1 {
      font-size: 32px;
      font-weight: 800;
      color: #ffffff;
      margin: 0 0 10px;
    }
    .subtitle {
      color: #94a3b8;
      font-size: 14px;
      margin-bottom: 36px;
      border-bottom: 1px solid #1e293b;
      padding-bottom: 20px;
    }
    h2 {
      font-size: 20px;
      font-weight: 700;
      color: #ffffff;
      margin-top: 36px;
      margin-bottom: 12px;
      border-left: 3px solid #8b5cf6;
      padding-left: 12px;
    }
    p, li {
      color: #cbd5e1;
      font-size: 15px;
    }
    ul, ol {
      padding-left: 24px;
      margin-bottom: 20px;
    }
    li {
      margin-bottom: 8px;
    }
    a {
      color: #60a5fa;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
    .card {
      background: #161b26;
      border: 1px solid #1e293b;
      border-radius: 12px;
      padding: 20px;
      margin: 24px 0;
    }
    footer {
      margin-top: 60px;
      padding-top: 24px;
      border-top: 1px solid #1e293b;
      font-size: 13px;
      color: #64748b;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="badge">Official Legal Document</div>
    <h1>${isPrivacy ? 'Privacy Policy' : 'Terms of Service'}</h1>
    <div class="subtitle">ViralShorts Studio AI • Last Updated: October 2026</div>
    ${bodyContent}
    <footer>
      © 2026 ViralShorts Studio AI. All rights reserved.
    </footer>
  </div>
</body>
</html>`;

    const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-4xl bg-[#12131d] border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-zinc-800 flex items-center justify-between bg-[#161725]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
              {activeTab === 'privacy' ? (
                <ShieldCheck className="w-5 h-5" />
              ) : activeTab === 'terms' ? (
                <FileText className="w-5 h-5" />
              ) : (
                <Globe className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3 className="text-lg font-black text-white">
                Central de Páginas Legais (TikTok, Google & Meta)
              </h3>
              <p className="text-xs text-zinc-400">
                Textos aprovados pelo compliance internacional para cadastro no TikTok for Developers
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher & Action Bar */}
        <div className="px-6 py-3 border-b border-zinc-800/80 bg-[#141522] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('privacy')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === 'privacy'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-900/40'
                  : 'bg-zinc-800/80 text-zinc-400 hover:text-white'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Política de Privacidade</span>
            </button>

            <button
              onClick={() => setActiveTab('terms')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === 'terms'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-900/40'
                  : 'bg-zinc-800/80 text-zinc-400 hover:text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Termos de Serviço</span>
            </button>

            <button
              onClick={() => setActiveTab('hosting')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === 'hosting'
                  ? 'bg-cyan-600 text-white shadow-md shadow-cyan-900/40'
                  : 'bg-zinc-800/80 text-cyan-400 hover:text-white'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Por que o site não abre? (Guia Grátis)</span>
            </button>
          </div>

          {activeTab !== 'hosting' && (
            <div className="flex items-center gap-2">
              {/* Language Switcher */}
              <div className="flex items-center bg-zinc-900 p-1 rounded-lg border border-zinc-800 text-[11px]">
                <button
                  onClick={() => setLanguage('en')}
                  className={`px-2 py-0.5 rounded font-bold transition ${
                    language === 'en' ? 'bg-purple-600 text-white' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  EN (TikTok)
                </button>
                <button
                  onClick={() => setLanguage('pt')}
                  className={`px-2 py-0.5 rounded font-bold transition ${
                    language === 'pt' ? 'bg-purple-600 text-white' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  PT (Traduzido)
                </button>
              </div>

              {/* Download Standalone HTML Button */}
              <button
                onClick={() => handleDownloadHtml(activeTab as 'privacy' | 'terms')}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-600/90 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-sm"
                title="Baixar arquivo HTML autônomo para hospedar no GitHub Pages, Google Sites ou Vercel"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Baixar Arquivo HTML</span>
              </button>

              {/* Copy Plain Text for Google Sites / Notion */}
              <button
                onClick={() =>
                  handleCopy(
                    activeTab === 'privacy'
                      ? language === 'en'
                        ? PRIVACY_POLICY_EN_TEXT
                        : PRIVACY_POLICY_PT_TEXT
                      : language === 'en'
                      ? TERMS_OF_SERVICE_EN_TEXT
                      : TERMS_OF_SERVICE_PT_TEXT,
                    'text-copy'
                  )
                }
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition"
              >
                {copiedId === 'text-copy' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copiedId === 'text-copy' ? 'Texto Copiado!' : 'Copiar Texto'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Informational Callout Bar */}
        <div className="px-6 py-2.5 bg-amber-950/30 border-b border-amber-600/30 flex items-center justify-between text-xs text-amber-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Por que o revisor do TikTok precisa de link público?</strong> O link deste editor (<code className="bg-black/40 px-1 py-0.5 rounded text-amber-300">ais-dev-...</code>) pede login da sua conta Google. Se o TikTok abrir, dá erro ou redirecionamento!
            </span>
          </div>
          <button
            onClick={() => setActiveTab('hosting')}
            className="text-amber-400 underline font-bold hover:text-white shrink-0 ml-3"
          >
            Ver como colocar no ar grátis em 2 min →
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-6 text-xs text-zinc-300 leading-relaxed font-sans">
          {activeTab === 'hosting' ? (
            <div className="space-y-6 max-w-3xl mx-auto">
              <div className="p-5 bg-[#181928] border border-cyan-500/40 rounded-2xl space-y-3">
                <h4 className="text-sm font-bold text-cyan-300 flex items-center gap-2">
                  <Globe className="w-5 h-5 text-cyan-400" />
                  Por que os links deste site não abrem fora do seu computador?
                </h4>
                <p className="text-zinc-300 leading-relaxed">
                  O Google AI Studio roda seu projeto em um endereço de desenvolvimento seguro (chamado <code className="bg-black/50 text-cyan-300 px-1.5 py-0.5 rounded font-mono">ais-dev-...</code>). Esse endereço tem uma <strong>proteção privada do Google</strong> que só abre para você que está logado na sua conta Google.
                </p>
                <p className="text-zinc-300 leading-relaxed">
                  Quando o revisor do TikTok (que está no escritório deles em Cingapura ou nos EUA) tenta abrir o seu link, o Google bloqueia o acesso e pede para ele fazer login na sua conta Google. É exatamente por isso que o TikTok reprova ou o link parece que &quot;não abre&quot;!
                </p>
              </div>

              <h4 className="text-sm font-black text-white uppercase tracking-wider">
                Como resolver em 2 minutos (100% Grátis & Aprovado pelo TikTok):
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Method 1: Google Sites */}
                <div className="p-5 bg-[#0e0f17] border border-zinc-800 rounded-2xl space-y-3 hover:border-purple-500/50 transition">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-sm">Opção 1: Google Sites (Mais Fácil)</span>
                    <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-400 font-bold border border-emerald-800/40">
                      2 Minutos
                    </span>
                  </div>
                  <ol className="list-decimal pl-4 space-y-1.5 text-zinc-400 text-xs">
                    <li>
                      Acesse <a href="https://sites.google.com/new" target="_blank" rel="noreferrer" className="text-cyan-400 underline font-semibold">sites.google.com/new</a> (é de graça).
                    </li>
                    <li>
                      Crie um site em branco chamado <strong>&quot;ViralShorts Studio AI - Legal&quot;</strong>.
                    </li>
                    <li>
                      Clique na aba aqui em cima, clique em <strong>&quot;Copiar Texto&quot;</strong> (em inglês) e cole no seu Google Sites.
                    </li>
                    <li>
                      Clique em <strong>Publicar</strong> e defina o acesso como <strong>Público</strong>.
                    </li>
                    <li>
                      Copie o link público que o Google Sites gerou (ex: <code className="text-emerald-400">https://sites.google.com/view/viralshorts-ai/privacy</code>) e cole no formulário do TikTok!
                    </li>
                  </ol>
                  <a
                    href="https://sites.google.com/new"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-bold text-cyan-400 hover:text-cyan-300 mt-2"
                  >
                    <span>Abrir Google Sites</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                {/* Method 2: GitHub Pages */}
                <div className="p-5 bg-[#0e0f17] border border-zinc-800 rounded-2xl space-y-3 hover:border-purple-500/50 transition">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-sm">Opção 2: Baixar HTML & GitHub Pages</span>
                    <span className="px-2 py-0.5 rounded text-[10px] bg-purple-950 text-purple-400 font-bold border border-purple-800/40">
                      Profissional
                    </span>
                  </div>
                  <ol className="list-decimal pl-4 space-y-1.5 text-zinc-400 text-xs">
                    <li>
                      Clique no botão verde <strong>&quot;Baixar Arquivo HTML&quot;</strong> aqui acima (baixe a Política e os Termos).
                    </li>
                    <li>
                      Crie um repositório público no seu <a href="https://github.com" target="_blank" rel="noreferrer" className="text-cyan-400 underline font-semibold">GitHub</a> chamado <code className="text-purple-300">legal-pages</code>.
                    </li>
                    <li>
                      Faça upload dos 2 arquivos HTML baixados.
                    </li>
                    <li>
                      Em <strong>Settings → Pages</strong>, ative o GitHub Pages.
                    </li>
                    <li>
                      Você terá links públicos como <code className="text-emerald-400">https://seunome.github.io/legal-pages/privacy-policy.html</code> para colocar no TikTok!
                    </li>
                  </ol>
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => handleDownloadHtml('privacy')}
                      className="px-2.5 py-1 rounded-lg bg-emerald-700/80 hover:bg-emerald-600 text-white text-[11px] font-bold"
                    >
                      Baixar privacy-policy.html
                    </button>
                    <button
                      onClick={() => handleDownloadHtml('terms')}
                      className="px-2.5 py-1 rounded-lg bg-emerald-700/80 hover:bg-emerald-600 text-white text-[11px] font-bold"
                    >
                      Baixar terms-of-service.html
                    </button>
                  </div>
                </div>
              </div>

              {/* Method 3: Notion */}
              <div className="p-4 bg-[#141522] border border-zinc-800 rounded-2xl space-y-2 text-xs">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-purple-400" />
                  Opção 3: Notion / Carrd Público
                </span>
                <p className="text-zinc-400">
                  Você também pode criar uma página gratuita no <strong>Notion</strong>, colar o texto da Política de Privacidade e dos Termos de Serviço, e clicar em <strong>&quot;Share to Web&quot; (Compartilhar na Web)</strong>. O TikTok aceita páginas públicas do Notion tranquilamente!
                </p>
              </div>
            </div>
          ) : activeTab === 'privacy' ? (
            <div className="space-y-4 max-w-3xl mx-auto">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <div>
                  <h4 className="text-base font-bold text-white">
                    {language === 'en'
                      ? 'Privacy Policy for ViralShorts Studio AI'
                      : 'Política de Privacidade do ViralShorts Studio AI'}
                  </h4>
                  <p className="text-[11px] text-zinc-400">
                    Application Name: <strong>ViralShorts Studio AI</strong> • Contact:{' '}
                    <strong>erick.moreiradefensoria@gmail.com</strong>
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] bg-purple-950 text-purple-300 font-bold border border-purple-800/40">
                  {language === 'en' ? 'English (Official)' : 'Português'}
                </span>
              </div>

              {language === 'en' ? (
                <div
                  className="space-y-4 text-zinc-300 legal-content"
                  dangerouslySetInnerHTML={{ __html: PRIVACY_POLICY_EN_HTML }}
                />
              ) : (
                <div
                  className="space-y-4 text-zinc-300 legal-content"
                  dangerouslySetInnerHTML={{ __html: PRIVACY_POLICY_PT_HTML }}
                />
              )}
            </div>
          ) : (
            <div className="space-y-4 max-w-3xl mx-auto">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <div>
                  <h4 className="text-base font-bold text-white">
                    {language === 'en'
                      ? 'Terms of Service for ViralShorts Studio AI'
                      : 'Termos de Serviço do ViralShorts Studio AI'}
                  </h4>
                  <p className="text-[11px] text-zinc-400">
                    Application Name: <strong>ViralShorts Studio AI</strong> • Effective: October 2026
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] bg-purple-950 text-purple-300 font-bold border border-purple-800/40">
                  {language === 'en' ? 'English (Official)' : 'Português'}
                </span>
              </div>

              {language === 'en' ? (
                <div
                  className="space-y-4 text-zinc-300 legal-content"
                  dangerouslySetInnerHTML={{ __html: TERMS_OF_SERVICE_EN_HTML }}
                />
              ) : (
                <div
                  className="space-y-4 text-zinc-300 legal-content"
                  dangerouslySetInnerHTML={{ __html: TERMS_OF_SERVICE_PT_HTML }}
                />
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-zinc-800 bg-[#161725] flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px] text-zinc-400">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span>Documentos em conformidade com as diretrizes do TikTok for Developers (2026).</span>
          </div>

          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition shadow-md shadow-purple-900/40"
          >
            Fechar Janela
          </button>
        </div>
      </div>
    </div>
  );
};

// HTML Content Constants
const PRIVACY_POLICY_EN_HTML = `
  <h2>1. Overview & Commitment to Privacy</h2>
  <p>
    ViralShorts Studio AI ("the Application", "we", "our") respects the privacy of video creators and users. This Privacy Policy describes how information is collected, used, and protected when you access our web application, video clipping editor, and social media publishing integrations (including TikTok, YouTube, and Instagram).
  </p>

  <h2>2. TikTok Data & Content Posting API Usage</h2>
  <p>
    When you authorize the Application with your TikTok account via TikTok for Developers, we request specific permissions required solely for publishing short-form video content:
  </p>
  <ul>
    <li><strong>video.upload:</strong> Used solely to upload video clips that you have explicitly created and approved in our editor to your TikTok account.</li>
    <li><strong>video.publish:</strong> Used solely to post the video with your chosen caption, title, and hashtags directly to your TikTok feed upon your command.</li>
    <li><strong>user.info.basic:</strong> Used only to display your TikTok display name and profile picture inside the application dashboard so you can confirm which destination channel is connected.</li>
  </ul>
  <p>
    We do NOT access, read, or download your private direct messages, contacts, payment details, or browsing history.
  </p>

  <h2>3. Data Retention and Deletion</h2>
  <p>
    User authentication tokens (OAuth Access Tokens) are stored locally in your browser session or secure memory for the sole duration of your editing workflow.
  </p>
  <ul>
    <li>You may disconnect your TikTok or YouTube account at any time by clearing your credentials in the Application Settings.</li>
    <li>We do not sell, rent, lease, or monetize your personal credentials or tokens to any third parties or advertising networks.</li>
    <li>Users may request full deletion of their session data by contacting the developer email below.</li>
  </ul>

  <h2>4. Compliance with Platform Guidelines</h2>
  <p>
    Our Service strictly complies with the <a href="https://developers.tiktok.com/doc/terms-of-service" target="_blank" style="color: #60a5fa;">TikTok Developer Terms of Service</a>, <a href="https://developers.google.com/youtube/terms/developer-policies" target="_blank" style="color: #60a5fa;">YouTube API Services Developer Policies</a>, and <a href="https://developers.facebook.com/terms" target="_blank" style="color: #60a5fa;">Meta Platform Terms</a>.
  </p>

  <h2>5. Contact Information</h2>
  <p>
    If you have any questions or requests regarding this Privacy Policy, please contact the developer:
  </p>
  <p>
    <strong>Developer Name:</strong> Erick Moreira<br>
    <strong>Email:</strong> <a href="mailto:erick.moreiradefensoria@gmail.com" style="color: #60a5fa;">erick.moreiradefensoria@gmail.com</a>
  </p>
`;

const PRIVACY_POLICY_PT_HTML = `
  <h2>1. Visão Geral e Compromisso com a Privacidade</h2>
  <p>
    O ViralShorts Studio AI ("o Aplicativo", "nós") respeita a privacidade de criadores de conteúdo e usuários. Esta Política de Privacidade descreve como as informações são coletadas, utilizadas e protegidas ao usar nosso editor de cortes e integrações de publicação (incluindo TikTok, YouTube e Instagram).
  </p>

  <h2>2. Uso da API do TikTok (Content Posting API)</h2>
  <p>
    Ao autorizar o Aplicativo com sua conta do TikTok for Developers, solicitamos permissões estritamente necessárias para o upload de vídeos:
  </p>
  <ul>
    <li><strong>video.upload:</strong> Usado exclusivamente para fazer upload do clipe 9:16 cortado e aprovado por você.</li>
    <li><strong>video.publish:</strong> Usado para publicar o vídeo no seu feed do TikTok junto com o título e legendas que você definiu.</li>
    <li><strong>user.info.basic:</strong> Usado apenas para exibir o nome do seu canal e avatar no painel de configurações para confirmar a conta de destino.</li>
  </ul>

  <h2>3. Armazenamento e Exclusão de Dados</h2>
  <p>
    Seus tokens de acesso OAuth são salvos localmente no armazenamento seguro do seu navegador. Você pode desconectar ou excluir todas as credenciais a qualquer momento na aba de Configurações do app. Não vendemos e não compartilhamos nenhum dado com terceiros.
  </p>

  <h2>4. Contato do Desenvolvedor</h2>
  <p>
    <strong>Responsável:</strong> Erick Moreira<br>
    <strong>E-mail:</strong> <a href="mailto:erick.moreiradefensoria@gmail.com" style="color: #60a5fa;">erick.moreiradefensoria@gmail.com</a>
  </p>
`;

const TERMS_OF_SERVICE_EN_HTML = `
  <h2>1. Acceptance of Terms</h2>
  <p>
    By accessing or using ViralShorts Studio AI ("the Service"), you agree to be legally bound by these Terms of Service. If you do not agree to these terms, you may not use the Service.
  </p>

  <h2>2. Description of the Service</h2>
  <p>
    ViralShorts Studio AI provides video creators with tools to analyze video transcripts, edit vertical 9:16 highlight clips, generate optimized titles, captions, and hashtags, and upload approved media directly to third-party social media platforms including TikTok, YouTube Shorts, and Instagram Reels.
  </p>

  <h2>3. User Responsibilities & Content Ownership</h2>
  <p>
    Users retain full ownership of their original media content. You represent and warrant that:
  </p>
  <ul>
    <li>You own or have acquired all required intellectual property rights and licenses for the media you process and publish.</li>
    <li>Content published via our integration does not violate TikTok Community Guidelines, YouTube Community Guidelines, or Meta Terms of Service.</li>
    <li>You will not use the Service to publish unlawful, harassing, infringing, or malicious content.</li>
  </ul>

  <h2>4. Third-Party Platform Policies</h2>
  <p>
    Your use of third-party features is subject to the respective terms of each platform: TikTok Terms of Service, YouTube Terms of Service, and Meta Terms of Service.
  </p>

  <h2>5. Contact Information</h2>
  <p>
    <strong>Developer Name:</strong> Erick Moreira<br>
    <strong>Email:</strong> <a href="mailto:erick.moreiradefensoria@gmail.com" style="color: #60a5fa;">erick.moreiradefensoria@gmail.com</a>
  </p>
`;

const TERMS_OF_SERVICE_PT_HTML = `
  <h2>1. Aceitação dos Termos</h2>
  <p>
    Ao acessar ou utilizar o ViralShorts Studio AI ("o Serviço"), você concorda em cumprir integralmente estes Termos de Serviço.
  </p>

  <h2>2. Descrição do Serviço</h2>
  <p>
    O ViralShorts Studio AI fornece ferramentas para criadores analisarem transcrições, editarem cortes verticais 9:16, gerarem títulos e legendas magnéticas e publicarem clipes no TikTok, YouTube e Instagram.
  </p>

  <h2>3. Direitos e Responsabilidades do Usuário</h2>
  <p>
    O usuário mantém a total propriedade sobre seus vídeos. O usuário é o único responsável por garantir que o conteúdo não viola direitos autorais de terceiros nem as Diretrizes da Comunidade do TikTok ou YouTube.
  </p>

  <h2>4. Contato</h2>
  <p>
    <strong>Desenvolvedor:</strong> Erick Moreira<br>
    <strong>E-mail:</strong> <a href="mailto:erick.moreiradefensoria@gmail.com" style="color: #60a5fa;">erick.moreiradefensoria@gmail.com</a>
  </p>
`;

const PRIVACY_POLICY_EN_TEXT = `PRIVACY POLICY - ViralShorts Studio AI
Last Updated: October 2026

1. Overview & Commitment to Privacy
ViralShorts Studio AI ("the Application", "we", "our") respects the privacy of video creators and users. This Privacy Policy describes how information is collected, used, and protected when you access our web application, video clipping editor, and social media publishing integrations (including TikTok, YouTube, and Instagram).

2. TikTok Data & Content Posting API Usage
When you authorize the Application with your TikTok account via TikTok for Developers, we request specific permissions required solely for publishing short-form video content:
- video.upload: Used solely to upload video clips that you have explicitly created and approved in our editor to your TikTok account.
- video.publish: Used solely to post the video with your chosen caption, title, and hashtags directly to your TikTok feed upon your command.
- user.info.basic: Used only to display your TikTok display name and profile picture inside the application dashboard so you can confirm which destination channel is connected.
We do NOT access, read, or download your private direct messages, contacts, payment details, or browsing history.

3. Data Retention and Deletion
User authentication tokens (OAuth Access Tokens) are stored locally in your browser session or secure memory for the sole duration of your editing workflow.
You may disconnect your TikTok or YouTube account at any time by clearing your credentials in the Application Settings.
We do not sell, rent, lease, or monetize your personal credentials or tokens to any third parties or advertising networks.

4. Contact Information
Developer: Erick Moreira
Email: erick.moreiradefensoria@gmail.com`;

const PRIVACY_POLICY_PT_TEXT = `POLÍTICA DE PRIVACIDADE - ViralShorts Studio AI
Última Atualização: Outubro de 2026

1. Visão Geral
O ViralShorts Studio AI respeita a privacidade dos criadores de conteúdo. Esta Política descreve o tratamento de dados ao usar o editor e integrações com TikTok, YouTube e Instagram.

2. Uso da API do TikTok
- video.upload: Fazer upload dos cortes aprovados pelo criador.
- video.publish: Publicar o clipe no feed com o título e legendas configuradas.
- user.info.basic: Exibir o nome do canal no painel de configurações.

3. Contato
Desenvolvedor: Erick Moreira
E-mail: erick.moreiradefensoria@gmail.com`;

const TERMS_OF_SERVICE_EN_TEXT = `TERMS OF SERVICE - ViralShorts Studio AI
Last Updated: October 2026

1. Acceptance of Terms
By accessing or using ViralShorts Studio AI, you agree to be bound by these Terms of Service.

2. Description of the Service
ViralShorts Studio AI provides video creators with tools to analyze video transcripts, edit vertical 9:16 highlight clips, and publish content directly to TikTok, YouTube Shorts, and Instagram Reels.

3. User Responsibilities
Users retain full ownership of their original media content and represent that they own or license all rights to the media published.

4. Contact
Developer: Erick Moreira
Email: erick.moreiradefensoria@gmail.com`;

const TERMS_OF_SERVICE_PT_TEXT = `TERMOS DE SERVIÇO - ViralShorts Studio AI
Última Atualização: Outubro de 2026

1. Aceitação dos Termos
Ao utilizar o ViralShorts Studio AI, você concorda com estes termos.

2. Descrição do Serviço
Ferramenta para análise, corte vertical 9:16 e publicação automatizada nas redes sociais.

3. Contato
Desenvolvedor: Erick Moreira
E-mail: erick.moreiradefensoria@gmail.com`;
