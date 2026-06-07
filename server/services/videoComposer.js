import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execFileAsync = promisify(execFile);

/**
 * Merge ordered MP4 clips with FFmpeg concat demuxer.
 * Re-encodes for compatibility when codecs differ (safer than -c copy across Veo variants).
 */
export async function mergeVideoClipsWithFFmpeg(absoluteInputPaths, outputAbsolutePath) {
  if (!absoluteInputPaths.length) {
    throw new Error('mergeVideoClipsWithFFmpeg: no inputs');
  }

  const listPath = `${outputAbsolutePath}.concat.txt`;
  const lines = absoluteInputPaths.map((p) => {
    const abs = path.resolve(p).replace(/\\/g, '/');
    return `file '${abs.replace(/'/g, "'\\''")}'`;
  });
  await fs.writeFile(listPath, lines.join('\n'), 'utf8');

  try {
    await execFileAsync(
      'ffmpeg',
      [
        '-y',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        listPath,
        '-c:v',
        'libx264',
        '-preset',
        'fast',
        '-crf',
        '20',
        '-c:a',
        'aac',
        '-movflags',
        '+faststart',
        outputAbsolutePath,
      ],
      { maxBuffer: 20 * 1024 * 1024 },
    );
  } finally {
    await fs.unlink(listPath).catch(() => {});
  }

  return outputAbsolutePath;
}

export async function assertFfmpegAvailable() {
  try {
    await execFileAsync('ffmpeg', ['-version'], { maxBuffer: 1024 * 1024 });
    return true;
  } catch {
    return false;
  }
}
