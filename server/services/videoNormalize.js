import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const HEIGHT_MAP = {
  '720p': 720,
  '1080p': 1080,
  '4k': 2160,
};

export function resolutionToHeight(resolution) {
  return HEIGHT_MAP[resolution] || 720;
}

/**
 * Normalize a single clip to target height (even), fps, libx264 + aac for concat safety.
 */
export async function normalizeVideoClip(inputAbs, outputAbs, {
  resolution = '720p',
  fps = 24,
} = {}) {
  const h = resolutionToHeight(resolution);

  await execFileAsync(
    'ffmpeg',
    [
      '-y',
      '-i',
      inputAbs,
      '-vf',
      `scale=-2:${h},fps=${fps},format=yuv420p`,
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-crf',
      '20',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-ar',
      '48000',
      '-ac',
      '2',
      '-movflags',
      '+faststart',
      outputAbs,
    ],
    { maxBuffer: 20 * 1024 * 1024 },
  );

  return outputAbs;
}
