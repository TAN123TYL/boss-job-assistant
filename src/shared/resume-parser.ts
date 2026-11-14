import { normalizeWhitespace } from './utils';

export type ResumeFormat = 'text' | 'pdf' | 'docx';

export interface ParsedResume {
  text: string;
  format: ResumeFormat;
  warnings: string[];
}

function normalizeResumeText(value: string): string {
  return value
    .replace(/\r\n?/gu, '\n')
    .split('\n')
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean)
    .join('\n')
    .trim();
}

export function detectResumeFormat(fileName: string): ResumeFormat | null {
  if (/\.pdf$/iu.test(fileName)) {
    return 'pdf';
  }
  if (/\.docx$/iu.test(fileName)) {
    return 'docx';
  }
  if (/\.(txt|md|markdown)$/iu.test(fileName)) {
    return 'text';
  }
  return null;
}

async function extractPdfText(file: File): Promise<ParsedResume> {
  const [pdfjs, workerModule] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;
  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({
    data,
    useWorkerFetch: false,
  });
  const document = await loadingTask.promise;
  const pages: string[] = [];
  const warnings: string[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
    if (text.trim()) {
      pages.push(text);
    }
  }

  await loadingTask.destroy();
  const text = normalizeResumeText(pages.join('\n\n'));
  if (text.length < 30) {
    warnings.push('PDF 可提取文字过少，可能是扫描件，需要先进行 OCR。');
  }

  return { text, format: 'pdf', warnings };
}

async function extractDocxText(file: File): Promise<ParsedResume> {
  const mammoth = (await import('mammoth')).default;
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  const text = normalizeResumeText(result.value);
  const warnings =
    result.messages.length > 0 ? result.messages.map((message) => message.message).slice(0, 3) : [];

  if (text.length < 30) {
    warnings.push('DOCX 可提取文字过少，请检查文档内容或另行粘贴。');
  }

  return { text, format: 'docx', warnings };
}

export async function extractResumeText(file: File): Promise<ParsedResume> {
  const format = detectResumeFormat(file.name);

  if (!format) {
    throw new Error('仅支持 PDF、DOCX、TXT 和 Markdown 简历');
  }
  if (format === 'pdf') {
    return extractPdfText(file);
  }
  if (format === 'docx') {
    return extractDocxText(file);
  }

  return {
    text: normalizeResumeText(await file.text()),
    format: 'text',
    warnings: [],
  };
}
