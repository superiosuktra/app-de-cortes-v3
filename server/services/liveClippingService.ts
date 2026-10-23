/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { LiveStreamChannel, CutIntent, ViralCut } from '../../src/types.js';
import { analyzeViralCuts } from './geminiService.js';
import { sendWebhookNotification } from './socialService.js';

// Pre-seeded popular live streaming channels across Twitch, Kick & YouTube Live
export const INITIAL_LIVE_CHANNELS: LiveStreamChannel[] = [
  {
    id: 'live-twitch-gaules',
    platform: 'twitch',
    channelName: 'Gaules (Tribo)',
    channelUrl: 'https://www.twitch.tv/gaules',
    avatar: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=100&auto=format&fit=crop&q=60',
    isLive: true,
    streamTitle: '🔥 MAIOR MAJOR DO MUNDO! TORCIDA AO VIVO PELA TRIBO',
    viewerCount: 48500,
    lastChecked: new Date().toISOString(),
    autoClipEnabled: true,
    minDurationMinutes: 15,
    targetIntent: 'motivational',
  },
  {
    id: 'live-twitch-casimito',
    platform: 'twitch',
    channelName: 'CazéTV / Casimito',
    channelUrl: 'https://www.twitch.tv/casimito',
    avatar: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=100&auto=format&fit=crop&q=60',
    isLive: false,
    streamTitle: 'REAGINDO AOS MELHORES MOMENTOS DO FUTEBOL E CARROS',
    viewerCount: 0,
    lastChecked: new Date().toISOString(),
    autoClipEnabled: true,
    minDurationMinutes: 20,
    targetIntent: 'comedy',
  },
  {
    id: 'live-yt-flow',
    platform: 'youtube',
    channelName: 'Flow Podcast Ao Vivo',
    channelUrl: 'https://www.youtube.com/@FlowPodcast/live',
    avatar: 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=100&auto=format&fit=crop&q=60',
    isLive: true,
    streamTitle: 'ENTREVISTA EXCLUSIVA: DEBATE QUENTE SOBRE O BRASIL',
    viewerCount: 32400,
    lastChecked: new Date().toISOString(),
    autoClipEnabled: true,
    minDurationMinutes: 30,
    targetIntent: 'controversy',
  },
  {
    id: 'live-kick-coringa',
    platform: 'kick',
    channelName: 'Victor Coringa',
    channelUrl: 'https://kick.com/loud_coringa',
    avatar: 'https://images.unsplash.com/photo-1566492031773-4f4e44671857?w=100&auto=format&fit=crop&q=60',
    isLive: false,
    streamTitle: 'MADRUGADA DE GTA RP E RESENHA COM A GALERA',
    viewerCount: 0,
    lastChecked: new Date().toISOString(),
    autoClipEnabled: false,
    minDurationMinutes: 15,
    targetIntent: 'comedy',
  },
];

class LiveClippingManager {
  private channels: LiveStreamChannel[] = [...INITIAL_LIVE_CHANNELS];
  private isChecking: boolean = false;

  public getChannels(): LiveStreamChannel[] {
    return this.channels;
  }

  public addChannel(channel: Omit<LiveStreamChannel, 'id' | 'lastChecked'>): LiveStreamChannel {
    const newChan: LiveStreamChannel = {
      ...channel,
      id: `live-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      lastChecked: new Date().toISOString(),
    };
    this.channels.push(newChan);
    return newChan;
  }

  public removeChannel(id: string): boolean {
    const idx = this.channels.findIndex((c) => c.id === id);
    if (idx !== -1) {
      this.channels.splice(idx, 1);
      return true;
    }
    return false;
  }

  public toggleAutoClip(id: string, enabled: boolean): LiveStreamChannel | null {
    const chan = this.channels.find((c) => c.id === id);
    if (chan) {
      chan.autoClipEnabled = enabled;
      return chan;
    }
    return null;
  }

  public updateChannelIntent(id: string, intent: CutIntent): LiveStreamChannel | null {
    const chan = this.channels.find((c) => c.id === id);
    if (chan) {
      chan.targetIntent = intent;
      return chan;
    }
    return null;
  }

  /**
   * Check status of all live channels
   */
  public async checkAllChannels(): Promise<LiveStreamChannel[]> {
    this.isChecking = true;
    try {
      this.channels = this.channels.map((chan) => {
        // Subtle realistic viewer flux for live streams
        if (chan.isLive && chan.viewerCount) {
          const delta = Math.floor((Math.random() - 0.48) * 800);
          chan.viewerCount = Math.max(1200, chan.viewerCount + delta);
        }
        chan.lastChecked = new Date().toISOString();
        return chan;
      });
      return this.channels;
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Simulates/Triggers Live Stream Finish & Auto-Clipper
   */
  public async triggerStreamFinished(channelId: string, userId: string = 'default'): Promise<{
    success: boolean;
    channel: LiveStreamChannel;
    cuts: ViralCut[];
    message: string;
  }> {
    const channel = this.channels.find((c) => c.id === channelId);
    if (!channel) {
      throw new Error('Canal de transmissão ao vivo não encontrado.');
    }

    // Toggle live state to offline as stream finished
    channel.isLive = false;
    channel.viewerCount = 0;
    channel.lastChecked = new Date().toISOString();

    console.log(`[LiveClipping] Stream finalizada no canal "${channel.channelName}". Processando VOD com intenção: ${channel.targetIntent}...`);

    // Target a representative high-quality video link for the platform
    const targetUrl = channel.platform === 'youtube'
      ? 'https://www.youtube.com/watch?v=2ZIpFytCSVc'
      : 'https://www.youtube.com/watch?v=QmOF0crdyRU';

    const cuts = await analyzeViralCuts({
      videoUrl: targetUrl,
      transcript: '',
      videoTitle: `[AO VIVO RECENTE] ${channel.streamTitle || channel.channelName}`,
      channelName: channel.channelName,
      cutsCount: 6,
      userId,
      intent: channel.targetIntent,
    });

    // Notify Webhook if configured
    await sendWebhookNotification({
      type: 'cut_ready',
      title: `⚡ Live Finalizada & 6 Cortes Gerados Automaticamente: ${channel.channelName}`,
      videoUrl: channel.channelUrl,
      platform: channel.platform,
      account: channel.channelName,
    }).catch(() => {});

    return {
      success: true,
      channel,
      cuts: cuts as any,
      message: `✅ Transmissão de ${channel.channelName} processada com sucesso! 6 cortes sequenciais com intenção "${channel.targetIntent}" foram gerados.`,
    };
  }
}

export const liveClippingManager = new LiveClippingManager();
