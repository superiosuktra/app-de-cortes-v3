export type VideoFormat =
  | 'split_screen'
  | 'dynamic_reframe'
  | 'speaker_left'
  | 'speaker_right'
  | 'speaker_center'
  | 'vertical_blur'
  | 'vertical_crop'
  | 'original'
  | 'square';

export type SubtitleTheme =
  | 'clean'
  | 'none'
  | 'hormozi'
  | 'beast'
  | 'cyberpunk'
  | 'submagic'
  | 'minimalist';

export interface SmartFramingConfig {
  speaker1X: number; // 0..100 horizontal center for Speaker 1 (Host/Left)
  speaker1Y: number; // 0..100 vertical center for Speaker 1
  speaker2X: number; // 0..100 horizontal center for Speaker 2 (Guest/Right)
  speaker2Y: number; // 0..100 vertical center for Speaker 2
  zoom: number; // 1.0..1.8 zoom multiplier
  detectedFacesCount?: number;
  aiInsight?: string;
}

export interface VideoInfo {
  videoId: string;
  videoUrl: string;
  title: string;
  author: string;
  thumbnail: string;
  fallbackThumbnail?: string;
}

export interface ViralCut {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  viralityScore: number;
  hook: string;
  payoff: string;
  neuromarketingTrigger: string;
  viralityAnalysis: string;
  recommendedFormat: VideoFormat;
  activeSpeaker?: string;
  subtitleTheme?: SubtitleTheme;
  framing?: SmartFramingConfig;
  caption: {
    youtube: string;
    instagram: string;
    tiktok: string;
    kwai?: string;
    facebook?: string;
    linkedin?: string;
  };
  intent?: CutIntent;
  hashtags: string[];
  overlaySubtitlesSample?: string[];
  partBadge?: string;
  teaserOffsetSec?: number;
  teaserDurationSec?: number;
  teaserStartTime?: string;
  teaserEndTime?: string;
  teaserText?: string;
  retentionStrategyOption?: 1 | 2 | 3;
  removeSilence?: boolean;
  autoBRoll?: boolean;
  category?: string;
  renderStatus?: 'pending' | 'queued' | 'rendering' | 'completed' | 'failed';
  renderProgress?: number;
  renderError?: string;
  previewUrl?: string;
  downloadUrl?: string;
  fileSize?: number;
  videoFilePath?: string;
}

export interface ClipGenerationConfig {
  targetCount: number;
  minDuration: number;
  maxDuration: number;
  language: string;
  topic?: string;
  style?: string;
  platform?: SocialPlatform;
  avoidDuplicates?: boolean;
  includeIntro?: boolean;
  includeStorytelling?: boolean;
  includeControversialMoments?: boolean;
  includeEducationalMoments?: boolean;
  includeHumor?: boolean;
  includeQuestions?: boolean;
  includeCallsToAction?: boolean;
}

export interface BatchRenderJob {
  id: string;
  type: 'render' | 'zip';
  status: 'queued' | 'downloading' | 'transcribing' | 'analyzing' | 'rendering' | 'packaging' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  currentStep?: string;
  totalItems: number;
  completedItems: number;
  failedItems: number;
  itemIds: string[];
  zipDownloadUrl?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookConfig {
  discordWebhookUrl?: string;
  telegramBotToken?: string;
  telegramChatId?: string;
  notifyOnCutReady?: boolean;
  notifyOnPostSuccess?: boolean;
}

export interface TrendingVideo {
  title: string;
  channel: string;
  videoId: string;
  url: string;
  duration?: string;
  viralityScore: number;
  reason: string;
  suggestedThemes?: string[];
}

export interface SavedCut {
  id: string;
  videoTitle: string;
  videoUrl: string;
  cutTitle: string;
  startTime: string;
  endTime: string;
  durationSeconds: number;
  format: VideoFormat;
  viralityScore: number;
  caption: string;
  hashtags: string[];
  createdAt: string;
}

export type CutIntent =
  | 'viral_hook'
  | 'comedy'
  | 'controversy'
  | 'storytelling'
  | 'educational'
  | 'motivational';

export interface BrandKit {
  id: string;
  name: string;
  watermarkText?: string;
  watermarkPosition: 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right' | 'center_top';
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  socialHandle?: string;
  introBadgeText?: string;
  outroCallToAction?: string;
}

export interface AiProviderConfig {
  provider: 'gemini' | 'ollama' | 'openai' | 'anthropic';
  ollamaEndpoint: string;
  ollamaModel: string;
  activeModel: string;
  openaiApiKey?: string;
  anthropicApiKey?: string;
  status?: 'connected' | 'disconnected' | 'testing';
  latencyMs?: number;
}

export interface LiveStreamChannel {
  id: string;
  platform: 'twitch' | 'youtube' | 'kick';
  channelName: string;
  channelUrl: string;
  avatar: string;
  isLive: boolean;
  streamTitle?: string;
  viewerCount?: number;
  lastChecked: string;
  autoClipEnabled: boolean;
  minDurationMinutes: number;
  targetIntent: CutIntent;
  lastProcessedVodId?: string;
}

export interface PlatformCredentials {
  youtube: {
    accessToken: string;
    refreshToken?: string;
    clientId?: string;
    clientSecret?: string;
    channelTitle?: string;
    customUrl?: string;
    avatar?: string;
    verifiedAt?: string;
    cookies?: string;
    status: 'connected' | 'disconnected' | 'error';
  };
  instagram: {
    accessToken: string;
    businessAccountId?: string;
    appId?: string;
    appSecret?: string;
    accountName?: string;
    avatar?: string;
    verifiedAt?: string;
    status: 'connected' | 'disconnected' | 'error';
  };
  tiktok: {
    accessToken: string;
    clientKey?: string;
    clientSecret?: string;
    displayName?: string;
    avatar?: string;
    verifiedAt?: string;
    status: 'connected' | 'disconnected' | 'error';
  };
  facebook?: {
    accessToken: string;
    pageId?: string;
    pageName?: string;
    avatar?: string;
    verifiedAt?: string;
    status: 'connected' | 'disconnected' | 'error';
  };
  linkedin?: {
    accessToken: string;
    personUrn?: string;
    organizationUrn?: string;
    accountName?: string;
    avatar?: string;
    verifiedAt?: string;
    status: 'connected' | 'disconnected' | 'error';
  };
  kwai?: {
    accessToken: string;
    appId?: string;
    appSecret?: string;
    accountName?: string;
    avatar?: string;
    verifiedAt?: string;
    status: 'connected' | 'disconnected' | 'error';
  };
  brandKit?: BrandKit;
  aiConfig?: AiProviderConfig;
  webhooks?: WebhookConfig;
}

export type QueueItemStatus = 'pending' | 'posting' | 'published' | 'failed' | 'paused';
export type SocialPlatform = 'youtube' | 'instagram' | 'tiktok' | 'kwai' | 'facebook' | 'linkedin';

export interface QueueItem {
  id: string;
  cutId: string;
  videoTitle: string;
  videoUrl: string;
  cutTitle: string;
  startTime: string;
  endTime: string;
  durationSeconds: number;
  format: VideoFormat;
  viralityScore: number;
  hook: string;
  payoff?: string;
  caption: {
    youtube: string;
    instagram: string;
    tiktok: string;
    kwai?: string;
    facebook?: string;
    linkedin?: string;
  };
  hashtags: string[];
  platforms: SocialPlatform[];
  scheduledFor: string; // ISO date string or formatted
  status: QueueItemStatus;
  publishedAt?: string;
  publishedVideoUrl?: string;
  publishedVideoId?: string;
  publishedAccounts?: { platform: SocialPlatform; account: string; videoUrl?: string; videoId?: string }[];
  error?: string;
  logs?: string[];
  createdAt: string;
}

export interface AutoPostSettings {
  autoEnqueueOnGenerate: boolean; // Automate queueing upon video generation
  isActive: boolean; // Running / Paused
  intervalMinutes: number; // Interval between consecutive posts (e.g., 5, 15, 30)
  targetPlatforms: {
    youtube: boolean;
    instagram: boolean;
    tiktok: boolean;
    kwai?: boolean;
    facebook?: boolean;
    linkedin?: boolean;
  };
  defaultPrivacy: 'public' | 'unlisted' | 'private';
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  picture?: string;
}
