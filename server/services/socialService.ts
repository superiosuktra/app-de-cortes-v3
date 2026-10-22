import { stateManager } from './stateService.js';

/**
 * Verify Instagram Graph API Token
 */
export async function verifyInstagramToken(token: string, userId: string = 'default') {
  const serverCreds = stateManager.getCredentials(userId);
  const rawToken = (token || '').trim();
  const isMasked = !rawToken || rawToken.startsWith('***') || rawToken.includes('••••');
  const cleanToken = isMasked ? (serverCreds.instagram.accessToken || '').trim() : rawToken;
  if (!cleanToken) {
    return { valid: false, error: 'Token não fornecido.' };
  }

  const response = await fetch(
    'https://graph.facebook.com/v19.0/me/accounts?fields=name,instagram_business_account{id,username,name,profile_picture_url}',
    {
      headers: {
        Authorization: `Bearer ${cleanToken}`,
      },
    }
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    return {
      valid: false,
      error:
        err?.error?.message ||
        'Token da Meta inválido ou expirado. Verifique se o token possui as permissões instagram_content_publish e pages_show_list.',
    };
  }

  const data = await response.json();
  const pages = data.data || [];
  const igAccount = pages.find((p: any) => p.instagram_business_account)?.instagram_business_account;

  if (igAccount) {
    const accountName = `@${igAccount.username}`;
    stateManager.updateCredentials(
      {
        instagram: {
          ...serverCreds.instagram,
          accessToken: cleanToken,
          status: 'connected',
          businessAccountId: igAccount.id,
          accountName,
          avatar: igAccount.profile_picture_url,
          verifiedAt: new Date().toLocaleTimeString('pt-BR'),
        },
      },
      userId
    );

    return {
      valid: true,
      accountName,
      avatar: igAccount.profile_picture_url,
      details: `Conectado à Conta Comercial do Instagram (${igAccount.name || igAccount.username}).`,
    };
  }

  return {
    valid: false,
    accountName: pages[0]?.name || 'Página Meta',
    error: 'Página do Facebook encontrada, mas nenhuma Conta Comercial do Instagram está vinculada a ela. Vincule sua conta comercial no Meta Business Suite.',
    details: 'Para publicar Reels, o Instagram exige que o perfil seja Comercial ou de Criador e esteja vinculado à sua Página do Facebook.',
  };
}

/**
 * Verify TikTok Content Posting API Token
 */
export async function verifyTikTokToken(token: string, userId: string = 'default') {
  const serverCreds = stateManager.getCredentials(userId);
  const rawToken = (token || '').trim();
  const isMasked = !rawToken || rawToken.startsWith('***') || rawToken.includes('••••');
  const cleanToken = isMasked ? (serverCreds.tiktok.accessToken || '').trim() : rawToken;
  if (!cleanToken) {
    return { valid: false, error: 'Token não fornecido.' };
  }

  const response = await fetch(
    'https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name',
    {
      headers: {
        Authorization: `Bearer ${cleanToken}`,
      },
    }
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    return {
      valid: false,
      error: err?.error?.message || 'Token do TikTok inválido ou sem escopo video.upload.',
    };
  }

  const data = await response.json();
  const user = data.data?.user;
  const displayName = user?.display_name || 'Conta TikTok';

  stateManager.updateCredentials(
    {
      tiktok: {
        ...serverCreds.tiktok,
        accessToken: cleanToken,
        status: 'connected',
        displayName,
        avatar: user?.avatar_url,
        verifiedAt: new Date().toLocaleTimeString('pt-BR'),
      },
    },
    userId
  );

  return {
    valid: true,
    accountName: displayName,
    avatar: user?.avatar_url,
    details: 'Conexão ativa com o TikTok for Developers (Content Posting API).',
  };
}

/**
 * Post content to Instagram Reels via Graph API
 */
export async function postToInstagram({
  token,
  caption,
  videoUrl,
}: {
  token: string;
  caption?: string;
  videoUrl?: string;
}) {
  const cleanToken = (token || '').trim();
  const igRes = await fetch(
    'https://graph.facebook.com/v19.0/me/accounts?fields=name,instagram_business_account{id,username,name}',
    {
      headers: {
        Authorization: `Bearer ${cleanToken}`,
      },
    }
  );

  if (!igRes.ok) {
    const errData = await igRes.json().catch(() => ({}));
    throw new Error(`Erro Meta Graph API (${igRes.status}): ${errData?.error?.message || igRes.statusText}`);
  }

  const data = await igRes.json();
  const pages = data.data || [];
  const igAccount = pages.find((p: any) => p.instagram_business_account)?.instagram_business_account;

  if (!igAccount) {
    throw new Error('Nenhuma Conta Comercial do Instagram encontrada vinculada às suas páginas da Meta.');
  }

  const accountName = `@${igAccount.username}`;
  const igUserId = igAccount.id;

  // Instagram Graph API requires a publicly reachable URL for Reels media container
  if (!videoUrl || !videoUrl.startsWith('http') || videoUrl.includes('localhost') || videoUrl.includes('127.0.0.1')) {
    throw new Error(
      'A API do Instagram Reels exige uma URL pública de vídeo (https://...) para publicação direta. Faça o download do corte e envie diretamente no app do Instagram ou forneça uma URL pública.'
    );
  }

  // Step 1: Create Media Container
  const containerRes = await fetch(`https://graph.facebook.com/v19.0/${igUserId}/media`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cleanToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      media_type: 'REELS',
      video_url: videoUrl,
      caption: caption || '',
    }),
  });

  const containerData = await containerRes.json();
  if (!containerRes.ok || !containerData.id) {
    throw new Error(
      `Falha ao criar container do Reel no Instagram: ${containerData?.error?.message || containerRes.statusText}`
    );
  }

  const creationId = containerData.id;

  // Step 2: Poll status up to 4 attempts
  let isReady = false;
  for (let i = 0; i < 4; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const statusRes = await fetch(
      `https://graph.facebook.com/v19.0/${creationId}?fields=status_code`,
      {
        headers: {
          Authorization: `Bearer ${cleanToken}`,
        },
      }
    );
    if (statusRes.ok) {
      const statusData = await statusRes.json();
      if (statusData.status_code === 'FINISHED') {
        isReady = true;
        break;
      }
      if (statusData.status_code === 'ERROR') {
        throw new Error('O Instagram encontrou um erro ao processar o vídeo do Reel.');
      }
    }
  }

  // Step 3: Publish container
  if (isReady) {
    const publishRes = await fetch(`https://graph.facebook.com/v19.0/${igUserId}/media_publish`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cleanToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        creation_id: creationId,
      }),
    });
    const publishData = await publishRes.json();
    if (!publishRes.ok || !publishData.id) {
      throw new Error(`Falha ao publicar Reel no Instagram: ${publishData?.error?.message || publishRes.statusText}`);
    }

    return {
      success: true,
      platform: 'instagram' as const,
      account: accountName,
      mediaId: publishData.id,
      message: `Reel publicado com sucesso no Instagram (${accountName})!`,
      publishedAt: new Date().toISOString(),
    };
  }

  return {
    success: true,
    platform: 'instagram' as const,
    account: accountName,
    mediaId: creationId,
    message: `Container do Reel criado no Instagram (${accountName}). O processamento está sendo finalizado pelos servidores da Meta.`,
    publishedAt: new Date().toISOString(),
  };
}

/**
 * Post content to TikTok Content Posting API v2
 */
export async function postToTikTok({
  token,
  caption,
  videoUrl,
}: {
  token: string;
  caption?: string;
  videoUrl?: string;
}) {
  const cleanToken = (token || '').trim();

  // Validate TikTok User identity
  const ttRes = await fetch(
    'https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name',
    {
      headers: { Authorization: `Bearer ${cleanToken}` },
    }
  );

  if (!ttRes.ok) {
    const errData = await ttRes.json().catch(() => ({}));
    throw new Error(`Erro TikTok API (${ttRes.status}): ${errData?.error?.message || ttRes.statusText}`);
  }

  const data = await ttRes.json();
  const userName = data.data?.user?.display_name || 'Conta TikTok';

  // TikTok Content Posting API requires a publicly accessible video URL
  if (!videoUrl || !videoUrl.startsWith('http') || videoUrl.includes('localhost') || videoUrl.includes('127.0.0.1')) {
    throw new Error(
      'A API do TikTok (Content Posting API v2) exige uma URL pública de vídeo (https://...) para publicação automatizada. Faça o download do corte e envie diretamente no app do TikTok ou forneça uma URL pública.'
    );
  }

  const postRes = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cleanToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({
      post_info: {
        title: (caption || 'Shorts Viral').slice(0, 150),
        privacy_level: 'PUBLIC_TO_EVERYONE',
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
      },
      source_info: {
        source: 'PULL_FROM_URL',
        video_url: videoUrl,
      },
    }),
  });

  const postData = await postRes.json();
  if (!postRes.ok || postData?.error?.code !== 'ok') {
    throw new Error(`Falha na API de postagem do TikTok: ${postData?.error?.message || postRes.statusText}`);
  }

  return {
    success: true,
    platform: 'tiktok' as const,
    account: userName,
    publishId: postData?.data?.publish_id,
    message: `Vídeo enviado com sucesso para a fila de publicação do TikTok (@${userName}) via Content Posting API v2!`,
    publishedAt: new Date().toISOString(),
  };
}
