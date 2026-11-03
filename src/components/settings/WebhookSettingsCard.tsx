import React from 'react';
import { Bell, RefreshCw, Send } from 'lucide-react';

export interface WebhookSettingsCardProps {
  discordWebhookUrl: string;
  setDiscordWebhookUrl: (url: string) => void;
  telegramBotToken: string;
  setTelegramBotToken: (token: string) => void;
  telegramChatId: string;
  setTelegramChatId: (id: string) => void;
  handleTestWebhook: () => Promise<void>;
  isTestingWebhook: boolean;
  webhookFeedback: string;
}

export const WebhookSettingsCard: React.FC<WebhookSettingsCardProps> = ({
  discordWebhookUrl,
  setDiscordWebhookUrl,
  telegramBotToken,
  setTelegramBotToken,
  telegramChatId,
  setTelegramChatId,
  handleTestWebhook,
  isTestingWebhook,
  webhookFeedback,
}) => {
  return (
    <div className="bg-[#141520] border border-zinc-800 hover:border-indigo-500/40 rounded-3xl p-6 sm:p-7 shadow-xl space-y-6 transition-all">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-zinc-800/80">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-indigo-600/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-md">
            <Bell className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-black text-white">Notificações Automáticas via Webhook</h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-950/80 border border-indigo-500/40 text-indigo-300">
                Discord & Telegram
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              Receba alertas em tempo real no seu canal ou grupo quando um corte for processado ou postado
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleTestWebhook}
          disabled={isTestingWebhook || (!discordWebhookUrl && !telegramBotToken)}
          className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 text-white text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-indigo-950/40 cursor-pointer"
        >
          {isTestingWebhook ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Enviando teste...</span>
            </>
          ) : (
            <>
              <Send className="w-3.5 h-3.5" />
              <span>Testar Disparo</span>
            </>
          )}
        </button>
      </div>

      <div className="space-y-4">
        {webhookFeedback && (
          <div className="p-3 bg-zinc-900/90 border border-zinc-700/80 rounded-xl text-xs font-semibold text-zinc-200 animate-fadeIn">
            {webhookFeedback}
          </div>
        )}

        {/* Discord Webhook URL */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-zinc-300 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-indigo-400" />
              Discord Webhook URL
            </span>
            <span className="text-[10px] text-zinc-400">Canal de Texto &gt; Editar Canal &gt; Integrações &gt; Webhooks</span>
          </label>
          <input
            type="url"
            value={discordWebhookUrl}
            onChange={(e) => setDiscordWebhookUrl(e.target.value)}
            placeholder="https://discord.com/api/webhooks/1234567890/abcde..."
            className="w-full px-4 py-2.5 bg-[#0e0f17] border border-zinc-700/80 rounded-xl text-xs font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Telegram Bot */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-zinc-300 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-cyan-400" />
                Telegram Bot Token
              </span>
              <span className="text-[10px] text-zinc-400">@BotFather</span>
            </label>
            <input
              type="text"
              value={telegramBotToken}
              onChange={(e) => setTelegramBotToken(e.target.value)}
              placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ..."
              className="w-full px-4 py-2.5 bg-[#0e0f17] border border-zinc-700/80 rounded-xl text-xs font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-zinc-300 flex items-center justify-between">
              <span>Telegram Chat ID</span>
              <span className="text-[10px] text-zinc-400">@userinfobot ou ID do grupo</span>
            </label>
            <input
              type="text"
              value={telegramChatId}
              onChange={(e) => setTelegramChatId(e.target.value)}
              placeholder="Ex: -100123456789 ou 98765432"
              className="w-full px-4 py-2.5 bg-[#0e0f17] border border-zinc-700/80 rounded-xl text-xs font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
