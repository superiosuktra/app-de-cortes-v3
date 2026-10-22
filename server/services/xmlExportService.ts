/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { parseTimeToSeconds } from './ffmpegService.js';

interface XmlCutData {
  title: string;
  videoTitle?: string;
  videoUrl?: string;
  startTime: string;
  endTime: string;
  durationSeconds?: number;
  hook?: string;
  payoff?: string;
  partBadge?: string;
  sourceFilePath?: string;
}

/**
 * Generates an industry-standard Adobe Premiere Pro / Final Cut Pro 7 XML (xmeml v5)
 * for importing timeline cuts, in/out marks, audio sync, and clip markers into Premiere Pro or DaVinci Resolve.
 */
export function generatePremiereXml(cut: XmlCutData): string {
  const fps = 30;
  const startSec = parseTimeToSeconds(cut.startTime || '00:00');
  const endSec = parseTimeToSeconds(cut.endTime || '00:30');
  const durationSec = cut.durationSeconds || Math.max(1, endSec - startSec);

  const startFrame = Math.round(startSec * fps);
  const endFrame = Math.round(endSec * fps);
  const durationFrames = Math.round(durationSec * fps);

  const safeTitle = (cut.title || 'Corte_Viral')
    .replace(/[<>&'"]/g, (c) => {
      switch (c) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case '\'': return '&apos;';
        case '"': return '&quot;';
        default: return c;
      }
    });

  const safeVideoTitle = (cut.videoTitle || 'Origem_Podcast')
    .replace(/[<>&'"]/g, '');

  const hookMarkerFrame = Math.min(durationFrames, Math.round(3 * fps));
  const climaxMarkerFrame = Math.round(durationFrames * 0.65);

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="5">
  <sequence id="sequence-viral-1">
    <name>${safeTitle} (9x16)</name>
    <duration>${durationFrames}</duration>
    <rate>
      <timebase>${fps}</timebase>
      <ntsc>FALSE</ntsc>
    </rate>
    <media>
      <video>
        <format>
          <samplecharacteristics>
            <width>1080</width>
            <height>1920</height>
            <pixelaspectratio>square</pixelaspectratio>
            <rate>
              <timebase>${fps}</timebase>
              <ntsc>FALSE</ntsc>
            </rate>
          </samplecharacteristics>
        </format>
        <track>
          <clipitem id="clipitem-video-1">
            <name>${safeVideoTitle}</name>
            <duration>${endFrame}</duration>
            <rate>
              <timebase>${fps}</timebase>
              <ntsc>FALSE</ntsc>
            </rate>
            <start>0</start>
            <end>${durationFrames}</end>
            <in>${startFrame}</in>
            <out>${endFrame}</out>
            <file id="file-source-1">
              <name>${safeVideoTitle}.mp4</name>
              <pathurl>${cut.sourceFilePath || cut.videoUrl || 'file://localhost/source.mp4'}</pathurl>
              <rate>
                <timebase>${fps}</timebase>
                <ntsc>FALSE</ntsc>
              </rate>
              <duration>${endFrame + 300}</duration>
              <media>
                <video>
                  <samplecharacteristics>
                    <width>1920</width>
                    <height>1080</height>
                  </samplecharacteristics>
                </video>
                <audio>
                  <samplecharacteristics>
                    <depth>16</depth>
                    <samplerate>48000</samplerate>
                  </samplecharacteristics>
                  <channelcount>2</channelcount>
                </audio>
              </media>
            </file>
          </clipitem>
        </track>
      </video>
      <audio>
        <track>
          <clipitem id="clipitem-audio-1">
            <name>${safeVideoTitle} (Audio L)</name>
            <duration>${endFrame}</duration>
            <rate>
              <timebase>${fps}</timebase>
              <ntsc>FALSE</ntsc>
            </rate>
            <start>0</start>
            <end>${durationFrames}</end>
            <in>${startFrame}</in>
            <out>${endFrame}</out>
            <file id="file-source-1"/>
            <sourcetrack>
              <mediatype>audio</mediatype>
              <trackindex>1</trackindex>
            </sourcetrack>
          </clipitem>
        </track>
        <track>
          <clipitem id="clipitem-audio-2">
            <name>${safeVideoTitle} (Audio R)</name>
            <duration>${endFrame}</duration>
            <rate>
              <timebase>${fps}</timebase>
              <ntsc>FALSE</ntsc>
            </rate>
            <start>0</start>
            <end>${durationFrames}</end>
            <in>${startFrame}</in>
            <out>${endFrame}</out>
            <file id="file-source-1"/>
            <sourcetrack>
              <mediatype>audio</mediatype>
              <trackindex>2</trackindex>
            </sourcetrack>
          </clipitem>
        </track>
      </audio>
    </media>
    <marker>
      <comment>⚡ GANCHO INICIAL: ${cut.hook ? cut.hook.slice(0, 80).replace(/[<>&'"]/g, '') : 'Início de Alto Impacto'}</comment>
      <in>0</in>
      <out>${hookMarkerFrame}</out>
    </marker>
    <marker>
      <comment>🔥 CLÍMAX / PAYOFF: ${cut.payoff ? cut.payoff.slice(0, 80).replace(/[<>&'"]/g, '') : 'Momento Viral'}</comment>
      <in>${climaxMarkerFrame}</in>
      <out>${climaxMarkerFrame + 30}</out>
    </marker>
  </sequence>
</xmeml>`;
}
