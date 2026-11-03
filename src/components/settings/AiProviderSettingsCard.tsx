import React from 'react';
import {
  Cpu,
  CheckCircle2,
  Sparkles,
  Laptop,
  Server,
  RefreshCw,
  Activity,
  AlertCircle,
  Key,
  Check,
} from 'lucide-react';
import { AiProviderConfig, PlatformCredentials } from '../../types';

export interface AiProviderSettingsCardProps {
  aiConfig: AiProviderConfig;
  setAiConfig: React.Dispatch<React.SetStateAction<AiProviderConfig>>;
  creds: PlatformCredentials;
  setCreds: React.Dispatch<React.SetStateAction<PlatformCredentials>>;
  onSaveCredentials: (creds: PlatformCredentials) => void;
  geminiApiKey: string;
  setGeminiApiKey: (key: string) => void;
  geminiStatus: {
    configured: boolean;
    model: string;
    testing: boolean;
    message: string;
  };
  handleVerifyGemini: () => Promise<void>;
  isTestingLocalAi: boolean;
  handleTestLocalAi: () => Promise<void>;
  localAiFeedback: {
    success: boolean;
    message: string;
    models?: string[];
  } | null;
}

export const AiProviderSettingsCard: React.FC<AiProviderSettingsCardProps> = ({
  aiConfig,
  setAiConfig,
  creds,
  setCreds,
  onSaveCredentials,
  geminiApiKey,
  setGeminiApiKey,
  geminiStatus,
  handleVerifyGemini,
  isTestingLocalAi,
  handleTestLocalAi,
  localAiFeedback,
}) => {
  return (
    <div className="bg-[#141520] border border-zinc-800 hover:border-cyan-500/40 rounded-3xl p-6 sm:p-7 shadow-xl space-y-6 transition-all">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-zinc-800/80">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-cyan-600/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-md">
            <Cpu className="w-6 h-6 text-cyan-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-black text-white">Motor de Inteligência Artificial</h3>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  aiConfig.provider === 'ollama'
                    ? 'bg-purple-950/80 border border-purple-500/40 text-purple-300'
                    : 'bg-cyan-950/80 border border-cyan-500/40 text-cyan-300'
                }`}
              >
                {aiConfig.provider === 'ollama' ? '100% Local (Ollama)' : 'Google Gemini Cloud'}
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              Alterne entre APIs em nuvem e modelos locais (Llama 3, DeepSeek R1) para redução de custos
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`px-3 py-1 rounded-full text-xs font-extrabold flex items-center gap-1.5 ${
              aiConfig.provider === 'ollama'
                ? localAiFeedback?.success || aiConfig.status === 'connected'
                  ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/40'
                  : 'bg-zinc-800 text-zinc-400 border border-zinc-700/50'
                : geminiStatus.configured
                  ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/40'
                  : 'bg-zinc-800 text-zinc-400 border border-zinc-700/50'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>
              {aiConfig.provider === 'ollama'
                ? aiConfig.latencyMs
                  ? `Local Ativo (${aiConfig.latencyMs}ms)`
                  : 'Ollama Ativo'
                : geminiStatus.configured
                  ? 'Gemini Conectado'
                  : 'Chave Ativa'}
            </span>
          </span>
        </div>
      </div>

      {/* Provider Selection Tabs */}
      <div className="space-y-3">
        <label className="text-xs font-bold text-zinc-300 flex items-center justify-between">
          <span>Selecione o Provedor de IA:</span>
          <span className="text-[10px] text-zinc-500">Alternância instantânea sem reiniciar o servidor</span>
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {/* Option 1: Gemini */}
          <button
            type="button"
            onClick={() => {
              const updated: AiProviderConfig = { ...aiConfig, provider: 'gemini' };
              setAiConfig(updated);
              const newCreds = { ...creds, aiConfig: updated };
              setCreds(newCreds);
              onSaveCredentials(newCreds);
            }}
            className={`p-3.5 rounded-2xl border text-left transition-all ${
              aiConfig.provider === 'gemini'
                ? 'bg-cyan-950/40 border-cyan-400 text-white shadow-lg shadow-cyan-950/40 ring-1 ring-cyan-500/30'
                : 'bg-[#0f1017] border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-black text-white flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                Google Gemini
              </span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-extrabold">
                Recomendado
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 leading-snug">
              Nuvem de ultra-alta velocidade (Gemini 2.5 / 3.8 Flash). Visão multimodal de enquadramento.
            </p>
          </button>

          {/* Option 2: Ollama Local */}
          <button
            type="button"
            onClick={() => {
              const updated: AiProviderConfig = { ...aiConfig, provider: 'ollama' };
              setAiConfig(updated);
              const newCreds = { ...creds, aiConfig: updated };
              setCreds(newCreds);
              onSaveCredentials(newCreds);
            }}
            className={`p-3.5 rounded-2xl border text-left transition-all ${
              aiConfig.provider === 'ollama'
                ? 'bg-purple-950/40 border-purple-400 text-white shadow-lg shadow-purple-950/40 ring-1 ring-purple-500/30'
                : 'bg-[#0f1017] border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-black text-white flex items-center gap-1.5">
                <Laptop className="w-3.5 h-3.5 text-purple-400" />
                Ollama / IA Local
              </span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-extrabold">
                100% Gratuito
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 leading-snug">
              Executa diretamente no hardware local (Llama 3, DeepSeek R1). Custo zero em chamadas.
            </p>
          </button>

          {/* Option 3: Claude / OpenAI */}
          <button
            type="button"
            onClick={() => {
              const updated: AiProviderConfig = { ...aiConfig, provider: 'openai' };
              setAiConfig(updated);
              const newCreds = { ...creds, aiConfig: updated };
              setCreds(newCreds);
              onSaveCredentials(newCreds);
            }}
            className={`p-3.5 rounded-2xl border text-left transition-all ${
              aiConfig.provider === 'openai' || aiConfig.provider === 'anthropic'
                ? 'bg-emerald-950/40 border-emerald-400 text-white shadow-lg shadow-emerald-950/40 ring-1 ring-emerald-500/30'
                : 'bg-[#0f1017] border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-black text-white flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-emerald-400" />
                OpenAI / Claude
              </span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 font-bold">
                Custom API
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 leading-snug">
              Suporte a chaves de terceiros (Anthropic Claude 3.5 Sonnet / OpenAI GPT-4o).
            </p>
          </button>
        </div>
      </div>

      {/* PANEL A: OLLAMA LOCAL CONFIGURATION */}
      {aiConfig.provider === 'ollama' && (
        <div className="space-y-4 p-5 bg-[#0e0f17] border border-purple-500/30 rounded-2xl animate-fadeIn">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <span className="text-xs font-bold text-white flex items-center gap-2">
                <Server className="w-4 h-4 text-purple-400" />
                Configuração do Endpoint & Modelo Local (Ollama)
              </span>
              <p className="text-[11px] text-zinc-400">
                O app fará chamadas diretamente para o daemon do Ollama em execução na sua máquina ou servidor.
              </p>
            </div>
            {aiConfig.latencyMs ? (
              <span className="px-2.5 py-1 rounded-full text-[11px] font-mono font-bold bg-emerald-950/70 text-emerald-300 border border-emerald-500/40 shrink-0">
                ⚡ {aiConfig.latencyMs}ms de latência
              </span>
            ) : null}
          </div>

          {/* Endpoint Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-300 flex items-center justify-between">
              <span>Endpoint de Conexão do Ollama</span>
              <span className="text-[10px] text-zinc-500">Padrão: http://localhost:11434</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={aiConfig.ollamaEndpoint || 'http://localhost:11434'}
                onChange={(e) => {
                  const updated = { ...aiConfig, ollamaEndpoint: e.target.value };
                  setAiConfig(updated);
                }}
                placeholder="http://localhost:11434"
                className="flex-1 bg-zinc-900 border border-zinc-700/80 rounded-xl px-4 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 font-mono"
              />
              <button
                type="button"
                disabled={isTestingLocalAi}
                onClick={handleTestLocalAi}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 text-white text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-purple-950/40 cursor-pointer"
              >
                {isTestingLocalAi ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Testando...</span>
                  </>
                ) : (
                  <>
                    <Activity className="w-3.5 h-3.5" />
                    <span>Testar Conexão Local</span>
                  </>
                )}
              </button>
            </div>
            <p className="text-[10px] text-zinc-500">
              Dica: Se estiver executando via Docker, utilize <code className="text-purple-300">http://host.docker.internal:11434</code> ou o IP local da máquina.
            </p>
          </div>

          {/* Quick Model Selector Pills */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-zinc-300 flex items-center justify-between">
              <span>Seleção Rápida de Modelo Local:</span>
              <span className="text-[10px] text-purple-400">Clique para selecionar</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'llama3:8b', label: 'Meta Llama 3 (8B)', tag: 'Mais Equilibrado' },
                { id: 'deepseek-r1:8b', label: 'DeepSeek R1 (8B)', tag: 'Raciocínio & Ganchos' },
                { id: 'mistral:7b', label: 'Mistral (7B)', tag: 'Alta Velocidade' },
                { id: 'qwen2.5:7b', label: 'Qwen 2.5 (7B)', tag: 'Ótimo em Português' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    const updated = { ...aiConfig, ollamaModel: m.id };
                    setAiConfig(updated);
                    const newCreds = { ...creds, aiConfig: updated };
                    setCreds(newCreds);
                    onSaveCredentials(newCreds);
                  }}
                  className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                    aiConfig.ollamaModel === m.id
                      ? 'bg-purple-600 text-white shadow-md shadow-purple-900/50 border border-purple-400'
                      : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800'
                  }`}
                >
                  <span>{m.label}</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-black/40 text-purple-200">
                    {m.tag}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Custom Model Name Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-300 flex items-center justify-between">
              <span>Nome do Modelo no Ollama</span>
              <span className="text-[10px] text-zinc-500 font-mono">ollama run &lt;modelo&gt;</span>
            </label>
            <input
              type="text"
              value={aiConfig.ollamaModel || 'llama3:8b'}
              onChange={(e) => {
                const updated = { ...aiConfig, ollamaModel: e.target.value };
                setAiConfig(updated);
              }}
              placeholder="Ex: llama3:8b, deepseek-r1:8b, mistral, gemma2:9b"
              className="w-full bg-zinc-900 border border-zinc-700/80 rounded-xl px-4 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 font-mono"
            />
          </div>

          {/* Local Connection Diagnostic Message */}
          {localAiFeedback && (
            <div
              className={`p-3.5 rounded-xl border text-xs space-y-2 ${
                localAiFeedback.success
                  ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
                  : 'bg-red-950/40 border-red-500/50 text-red-200'
              }`}
            >
              <div className="flex items-center gap-2 font-bold">
                {localAiFeedback.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                )}
                <span>{localAiFeedback.message}</span>
              </div>

              {localAiFeedback.models && localAiFeedback.models.length > 0 && (
                <div className="space-y-1.5 pt-1 border-t border-emerald-500/20">
                  <span className="text-[11px] text-zinc-300 block">
                    Modelos instalados detectados no seu Ollama (clique para aplicar):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {localAiFeedback.models.map((mod) => (
                      <button
                        key={mod}
                        type="button"
                        onClick={() => {
                          const updated = { ...aiConfig, ollamaModel: mod };
                          setAiConfig(updated);
                          const newCreds = { ...creds, aiConfig: updated };
                          setCreds(newCreds);
                          onSaveCredentials(newCreds);
                        }}
                        className="px-2 py-1 rounded-lg bg-black/60 hover:bg-purple-900/60 border border-emerald-500/30 text-[11px] text-emerald-300 font-mono transition"
                      >
                        ✓ {mod}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Instructions Guide */}
          <div className="p-3 bg-zinc-950/80 border border-zinc-800/80 rounded-xl text-[11px] text-zinc-400 space-y-1">
            <span className="font-bold text-zinc-200 block">Como rodar o Ollama na sua máquina:</span>
            <ol className="list-decimal list-inside space-y-0.5 pl-1 text-zinc-400">
              <li>
                Instale o Ollama em{' '}
                <a href="https://ollama.com" target="_blank" rel="noreferrer" className="text-purple-400 underline">
                  ollama.com
                </a>
                .
              </li>
              <li>
                No seu terminal, baixe o modelo desejado:{' '}
                <code className="text-purple-300 font-mono">ollama run llama3:8b</code>.
              </li>
              <li>
                Inicie o serviço com: <code className="text-purple-300 font-mono">ollama serve</code> e clique em
                &quot;Testar Conexão Local&quot;.
              </li>
            </ol>
          </div>
        </div>
      )}

      {/* PANEL B: GEMINI CLOUD CONFIGURATION */}
      {aiConfig.provider === 'gemini' && (
        <div className="space-y-4 animate-fadeIn">
          <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-4 text-xs text-zinc-300 space-y-2">
            <div className="flex items-center gap-2 font-bold text-white text-sm">
              <Key className="w-4 h-4 text-cyan-400" />
              <span>Como vincular seu Google AI Studio ao projeto:</span>
            </div>
            <ol className="list-decimal list-inside space-y-1.5 text-zinc-400 pl-1">
              <li>
                Acesse o{' '}
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="text-cyan-400 underline font-semibold"
                >
                  Google AI Studio (aistudio.google.com)
                </a>{' '}
                e entre com sua conta Google.
              </li>
              <li>
                Clique no botão azul <strong>&quot;Create API key&quot;</strong> (é 100% gratuito).
              </li>
              <li>
                Copie a chave gerada (começa com <code className="text-cyan-300 font-mono">AIzaSy...</code>) e cole no
                campo abaixo.
              </li>
            </ol>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-zinc-300 flex items-center justify-between">
              <span>Chave de API do Google AI Studio (GEMINI_API_KEY)</span>
              {geminiStatus.configured && (
                <span className="text-[11px] text-emerald-400 font-normal">Chave ativa no servidor</span>
              )}
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={geminiApiKey}
                onChange={(e) => setGeminiApiKey(e.target.value)}
                placeholder={
                  geminiStatus.configured
                    ? 'Chave já configurada (insira outra para trocar)'
                    : 'Cole sua chave AIzaSy... aqui'
                }
                className="flex-1 bg-zinc-900/90 border border-zinc-700/80 rounded-xl px-4 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500 font-mono"
              />
              <button
                type="button"
                disabled={geminiStatus.testing || (!geminiApiKey.trim() && !geminiStatus.configured)}
                onClick={handleVerifyGemini}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 text-white text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-cyan-950/40 cursor-pointer"
              >
                {geminiStatus.testing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Validando...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Vincular Google Studio</span>
                  </>
                )}
              </button>
            </div>
            {geminiStatus.message && (
              <p
                className={`text-xs font-semibold mt-1.5 ${
                  geminiStatus.message.startsWith('✅') ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {geminiStatus.message}
              </p>
            )}
          </div>
        </div>
      )}

      {/* PANEL C: OPENAI & CLAUDE CUSTOM API CONFIGURATION */}
      {(aiConfig.provider === 'openai' || aiConfig.provider === 'anthropic') && (
        <div className="space-y-4 p-5 bg-[#0e0f17] border border-emerald-500/30 rounded-2xl animate-fadeIn">
          <div className="space-y-1">
            <span className="text-xs font-bold text-white flex items-center gap-2">
              <Server className="w-4 h-4 text-emerald-400" />
              APIs de Terceiros (OpenAI & Anthropic Claude)
            </span>
            <p className="text-[11px] text-zinc-400">
              Informe sua chave de API para direcionar as análises semânticas e geração de legendas para o Claude ou
              GPT.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-300">OpenAI API Key (sk-...)</label>
              <input
                type="password"
                value={aiConfig.openaiApiKey || ''}
                onChange={(e) => {
                  const updated = { ...aiConfig, openaiApiKey: e.target.value };
                  setAiConfig(updated);
                }}
                placeholder="sk-proj-..."
                className="w-full bg-zinc-900 border border-zinc-700/80 rounded-xl px-4 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-300">Anthropic Claude API Key (sk-ant-...)</label>
              <input
                type="password"
                value={aiConfig.anthropicApiKey || ''}
                onChange={(e) => {
                  const updated = { ...aiConfig, anthropicApiKey: e.target.value };
                  setAiConfig(updated);
                }}
                placeholder="sk-ant-..."
                className="w-full bg-zinc-900 border border-zinc-700/80 rounded-xl px-4 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
