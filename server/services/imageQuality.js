import sharp from 'sharp';

/**
 * Reject near-uniform / extremely low-detail thumbnails (blank gradients, flat colors).
 */
export async function validateGeneratedImageQuality({ mimeType, data }) {
  const buf = Buffer.from(data, 'base64');
  if (buf.length < 512) {
    return { ok: false, reason: 'payload_too_small' };
  }

  try {
    const { data: pix, info } = await sharp(buf)
      .resize(96, 96, { fit: 'inside' })
      .removeAlpha()
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const channels = info.channels || 1;
    const n = pix.length / channels;
    if (n < 4) return { ok: false, reason: 'resize_failed' };

    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < pix.length; i += channels) {
      const v = pix[i];
      sum += v;
      sumSq += v * v;
    }
    const mean = sum / n;
    const variance = sumSq / n - mean * mean;
    const std = Math.sqrt(Math.max(variance, 0));

    // Near-solid frames cluster std dev under ~3–4 on 8-bit grey 96²
    if (std < 3.5) {
      return { ok: false, reason: 'low_detail_or_blank', std: Number(std.toFixed(3)) };
    }

    return { ok: true, std: Number(std.toFixed(3)) };
  } catch (e) {
    return { ok: false, reason: `decode_error:${e.message}` };
  }
}
