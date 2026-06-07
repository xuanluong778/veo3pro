/**
 * Chuẩn hoá prompt Prompt Studio khi xuất / copy / gửi sang Text → Video:
 * - Bỏ dòng markdown kiểu # tiêu đề
 * - Bỏ khối mô tả nhân vật (Character / Chủ thể / Nhân vật…) để prompt gọn cho Veo
 */

/** Xoá các dòng bắt đầu bằng # (markdown heading). */
export function stripMarkdownHeadingLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*#+\s*.*$/, '').trimEnd())
    .filter((line) => String(line).trim().length > 0)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Bỏ khối Character (sheet tiếng Anh) hoặc tương đương tiếng Việt cũ. */
export function stripCharacterSectionFromSheetPrompt(text) {
  let t = String(text || '');
  if (/\bCHARACTERS:\s/im.test(t)) {
    t = t.replace(/\s*CHARACTERS:\s*[\s\S]*?(?=\nACTION:)/gi, '\n');
  }
  if (/\sCharacter:\s/i.test(t)) {
    if (/\sAnatomy:\s/i.test(t)) t = t.replace(/\s*Character:\s*[\s\S]*?(?=\sAnatomy:\s)/gi, ' ');
    else if (/\sComposition:\s/i.test(t)) t = t.replace(/\s*Character:\s*[\s\S]*?(?=\sComposition:\s)/gi, ' ');
    else if (/\sEnvironment:\s/i.test(t)) t = t.replace(/\s*Character:\s*[\s\S]*?(?=\sEnvironment:\s)/gi, ' ');
    else t = t.replace(/\s*Character:\s*[\s\S]*?(?=\sNegative:|\sClip:)/gi, ' ');
  }
  t = t.replace(
    /\s*Chủ thể:\s*[\s\S]*?(?=\s*(?:Khung hình:|Phong cách|Anatomy:|Composition:|Environment:))/gi,
    ' ',
  );
  t = t.replace(
    /\s*Nhân vật\s*\/\s*đối tượng chính:\s*[\s\S]*?(?=\s*(?:Khi nhân hoá|Khung hình:|Phong cách|Anatomy:|Composition:))/gi,
    ' ',
  );
  return t.replace(/\s{2,}/g, ' ').trim();
}

/** Gộp bước xuất cho file .txt / Veo. */
export function exportPromptForVeo(text) {
  let t = stripMarkdownHeadingLines(text);
  t = stripCharacterSectionFromSheetPrompt(t);
  // Reduce cases where engine repeats the same chunk many times.
  // Keep it conservative: only remove consecutive duplicate paragraphs/lines.
  t = String(t || '').trim();

  // 1) Dedup consecutive identical lines
  const lines = t.split(/\r?\n/).map((x) => x.trimEnd());
  const dedupedLines = [];
  for (const line of lines) {
    if (!dedupedLines.length) {
      dedupedLines.push(line);
      continue;
    }
    const prev = dedupedLines[dedupedLines.length - 1];
    if (prev === line && line !== '') continue;
    dedupedLines.push(line);
  }
  t = dedupedLines.join('\n').trim();

  // 2) Dedup consecutive identical paragraphs
  const paras = t.split(/\n{2,}/g).map((p) => p.trim()).filter(Boolean);
  const outParas = [];
  for (const p of paras) {
    const prev = outParas[outParas.length - 1];
    if (prev === p) continue;
    outParas.push(p);
  }
  t = outParas.join('\n\n');

  // 3) Minor whitespace cleanup
  return t.replace(/\s{2,}/g, ' ').trim();
}
