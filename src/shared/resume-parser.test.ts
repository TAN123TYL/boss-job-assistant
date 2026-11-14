import { describe, expect, it } from 'vitest';
import { detectResumeFormat } from './resume-parser';

describe('resume format detection', () => {
  it('recognizes supported formats case-insensitively', () => {
    expect(detectResumeFormat('resume.PDF')).toBe('pdf');
    expect(detectResumeFormat('简历.docx')).toBe('docx');
    expect(detectResumeFormat('resume.md')).toBe('text');
    expect(detectResumeFormat('resume.txt')).toBe('text');
  });

  it('rejects unsupported legacy Word files', () => {
    expect(detectResumeFormat('resume.doc')).toBeNull();
  });
});
