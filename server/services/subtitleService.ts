import fs from 'fs';
import path from 'path';
import { TEMP_DIR } from '../config.js';

export interface SubtitleWord {
  word: string;
  start: number;
  end: number;
}

export const generateSrtContent = (words: SubtitleWord[]): string => {
  let srt = '';
  words.forEach((w, index) => {
    const formatTime = (seconds: number) => {
      const date = new Date(seconds * 1000);
      const hh = String(date.getUTCHours()).padStart(2, '0');
      const mm = String(date.getUTCMinutes()).padStart(2, '0');
      const ss = String(date.getUTCSeconds()).padStart(2, '0');
      const ms = String(date.getUTCMilliseconds()).padStart(3, '0');
      return `${hh}:${mm}:${ss},${ms}`;
    };
    srt += `${index + 1}
`;
    srt += `${formatTime(w.start)} --> ${formatTime(w.end)}
`;
    srt += `${w.word}

`;
  });
  return srt;
};

export const saveSrtFile = (words: SubtitleWord[], filename: string): string => {
  const srtPath = path.join(TEMP_DIR, `${filename}.srt`);
  const content = generateSrtContent(words);
  fs.writeFileSync(srtPath, content);
  return srtPath;
};
