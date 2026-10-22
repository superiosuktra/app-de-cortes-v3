import React, { useState } from 'react';
import {
  X,
  Copy,
  Check,
  ExternalLink,
  ShieldAlert,
  Film,
  FileText,
  Sparkles,
  HelpCircle,
  Video,
} from 'lucide-react';

interface TikTokReviewGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenLegalModal: (tab: 'privacy' | 'terms' | 'hosting') => void;
}

export const TikTokReviewGuideModal: React.FC<TikTokReviewGuideModalProps> = ({
  isOpen,
  onClose,
  onOpenLegalModal,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentUrl =
    typeof window !== 'undefined'
      ? window.location.origin
      : 'https://ais-pre-ltudgifgehf3xcxgif3v3g-181386880351.us-east1.run.app';

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const fields = [
    {
      id: 'app-name',
      label: 'App Name (Nome do Aplicativo)',
      note: '⚠️ NUNCA use a palavra "TikTok" no nome, o TikTok rejeita automaticamente por violação de marca registrada!',
      value: 'ViralShorts Studio AI',
    },
    {
      id: 'app-desc',
      label: 'App Description (Descrição do Aplicativo em Inglês)',
      note: 'Explicação clara do propósito de edição e publicação para o revisor.',
      value:
        'ViralShorts Studio AI is a creator video editing platform that analyzes long-form podcasts and interviews to extract high-retention 9:16 short clips. Creators can customize dynamic subtitles, title overlays, and seamlessly publish vertical video cuts directly to their TikTok feed with optimized captions and hashtags.',
    },
    {
      id: 'app-category',
      label: 'App Category (Categoria)',
      note: 'Selecione uma das seguintes opções no menu suspenso do portal:',
      value: 'Creator Tools  OU  Video / Photo Editing',
    },
    {
      id: 'website-url',
      label: 'Website / App URL (URL do Aplicativo)',
      note: 'O link oficial de acesso ao seu app web.',
      value: currentUrl,
    },
    {
      id: 'privacy-url',
      label: 'Privacy Policy URL (Política de Privacidade)',
      note: 'Obrigatório! O revisor vai clicar para verificar.',
      value: `${currentUrl}/privacy`,
      hasLegalView: 'privacy' as const,
    },
    {
      id: 'terms-url',
      label: 'Terms of Service URL (Termos de Serviço)',
      note: 'Obrigatório para aprovação da Content Posting API.',
      value: `${currentUrl}/terms`,
      hasLegalView: 'terms' as const,
    },
    {
      id: 'redirect-uri',
      label: 'Redirect URI / Callback URL',
      note: 'URL de retorno autorizada para o fluxo OAuth.',
      value: `${currentUrl}/auth/callback/tiktok`,
    },
    {
      id: 'scope-video-upload',
      label: 'Justification for "video.upload" (Por que precisa do escopo)',
      note: 'Cole no campo de justificativa da permissão de upload:',
      value:
        'This scope is required to upload the user-edited 9:16 vertical video cut from our web editor to the creator’s TikTok account.',
    },
    {
      id: 'scope-video-publish',
      label: 'Justification for "video.publish" (Por que precisa do escopo)',
      note: 'Cole no campo de justificativa da permissão de publicação:',
      value:
        'This scope allows the creator to finalize and publish the video directly to their TikTok feed as a post, along with their custom generated caption and hashtags, with a single click.',
    },
    {
      id: 'scope-user-info',
      label: 'Justification for "user.info.basic"',
      note: 'Cole no campo de justificativa de perfil:',
      value:
        'Required to display the authenticated user’s TikTok display name and profile picture inside the dashboard, confirming the destination channel before posting.',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-4xl bg-[#12131d] border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-zinc-800 flex items-center justify-between bg-[#161725]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 font-black text-sm">
              TT
            </div>
            <div>
              <h3 className="text-lg font-black text-white">
                Guia Completo: O que Colocar na Revisão do TikTok
              </h3>
              <p className="text-xs text-zinc-400">
                Textos aprovados em inglês, links oficiais e instruções para o TikTok for Developers
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

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Important Rules Alert */}
          <div className="p-4 bg-amber-950/30 border border-amber-600/40 rounded-2xl flex items-start gap-3 text-xs text-amber-200">
            <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1.5 flex-1">
              <p className="font-bold text-amber-300">⚠️ 2 Regras Cruciais para Ser Aprovado no TikTok:</p>
              <ul className="list-disc pl-4 space-y-1 text-zinc-300">
                <li>
                  <strong>Regra 1:</strong> NUNCA coloque a palavra &quot;TikTok&quot; no nome do seu aplicativo (ex: &quot;TikTok Cutter&quot; é reprovado na hora). Use &quot;ViralShorts Studio AI&quot; ou seu próprio nome.
                </li>
                <li>
                  <strong>Regra 2 (Política de Privacidade):</strong> O revisor do TikTok precisa conseguir abrir os links de <strong>Privacy Policy</strong> e <strong>Terms of Service</strong>. Como este editor de teste (<code className="text-amber-300">ais-dev</code>) pede login da sua conta Google, links diretos de dev não abrem para o TikTok. Clique no botão abaixo para ver como gerar seu link 100% público no Google Sites ou GitHub Pages em 2 minutos!
                </li>
              </ul>
              <button
                onClick={() => onOpenLegalModal('hosting')}
                className="mt-2 px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 hover:text-white font-bold transition inline-flex items-center gap-1.5"
              >
                <span>🚀 Ver Guia de Hospedagem Gratuita & Baixar Arquivos HTML</span>
              </button>
            </div>
          </div>

          {/* Video Demo Instructions Box */}
          <div className="p-4 bg-[#181928] border border-purple-500/30 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-2">
                <Video className="w-4 h-4 text-purple-400" />
                Como Gravar o Vídeo de Demonstração (Demo Video obrigatório)
              </span>
              <span className="text-[10px] text-pink-400 font-bold uppercase">Muito Cobrado</span>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              O TikTok exige um link de vídeo (grave no <strong>Loom</strong> gratuito ou suba como <strong>Não Listado no YouTube</strong> de 60 a 90 segundos). Mostre apenas:
            </p>

            <ol className="list-decimal pl-5 text-xs text-zinc-300 space-y-1 font-sans">
              <li>Você no app clicando em um corte no editor 9:16.</li>
              <li>Clicando na aba &quot;Publicar&quot; e selecionando a rede TikTok.</li>
              <li>A tela de login/consentimento OAuth do TikTok aparecendo para autorizar.</li>
              <li>A confirmação do corte pronto para ser publicado no feed.</li>
            </ol>
          </div>

          {/* Form Fields Accordion */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
              Campos do Formulário de Cadastro & Revisão:
            </h4>

            <div className="space-y-3">
              {fields.map((field) => (
                <div
                  key={field.id}
                  className="p-4 bg-[#0e0f17] border border-zinc-800 rounded-2xl space-y-2 hover:border-zinc-700 transition"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-white">{field.label}</span>
                    <div className="flex items-center gap-1.5">
                      {field.hasLegalView && (
                        <button
                          onClick={() => onOpenLegalModal(field.hasLegalView)}
                          className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-950/60 text-purple-300 border border-purple-800/40 hover:bg-purple-900/60 transition"
                        >
                          Ver Página Legal
                        </button>
                      )}
                      <button
                        onClick={() => handleCopy(field.value, field.id)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-semibold transition"
                      >
                        {copiedId === field.id ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        <span>{copiedId === field.id ? 'Copiado!' : 'Copiar'}</span>
                      </button>
                    </div>
                  </div>

                  <p className="text-[11px] text-zinc-400">{field.note}</p>

                  <div className="p-2.5 bg-black/70 rounded-xl border border-zinc-800 font-mono text-[11px] text-emerald-400 break-all select-all leading-relaxed">
                    {field.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-zinc-800 bg-[#161725] flex items-center justify-between">
          <a
            href="https://developers.tiktok.com"
            target="_blank"
            rel="noreferrer"
            className="text-xs font-bold text-cyan-400 hover:text-cyan-300 inline-flex items-center gap-1.5"
          >
            <span>Ir para o Portal TikTok for Developers</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:opacity-90 text-white text-xs font-bold transition shadow-md shadow-cyan-900/40"
          >
            Entendi, Fechar Guia
          </button>
        </div>

      </div>
    </div>
  );
};
