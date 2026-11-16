import { describe, expect, it } from 'vitest';
import { jobIdFromUrl, normalizeBossChatUrl, sameJobUrl } from './browser-tab';

describe('job tab matching', () => {
  it('matches the same Boss job across query parameters', () => {
    const saved = 'https://www.zhipin.com/job_detail/abc123.html?from=search';
    const opened = 'https://www.zhipin.com/job_detail/abc123.html?securityId=token';

    expect(jobIdFromUrl(saved)).toBe('abc123.html');
    expect(sameJobUrl(saved, opened)).toBe(true);
  });

  it('does not match unrelated jobs or non-job pages', () => {
    expect(
      sameJobUrl(
        'https://www.zhipin.com/job_detail/abc123.html',
        'https://www.zhipin.com/job_detail/def456.html',
      ),
    ).toBe(false);
    expect(
      sameJobUrl('https://www.zhipin.com/web/geek/jobs', 'https://www.zhipin.com/web/geek/jobs'),
    ).toBe(false);
  });

  it('normalizes explicit Boss conversation URLs without dropping the chat id', () => {
    expect(normalizeBossChatUrl('/web/geek/chat?id=encrypted-boss-id&source=notice')).toBe(
      'https://www.zhipin.com/web/geek/chat?id=encrypted-boss-id&source=notice',
    );
    expect(normalizeBossChatUrl('https://example.com/web/geek/chat?id=wrong-host')).toBeNull();
    expect(normalizeBossChatUrl('https://www.zhipin.com/web/geek/jobs')).toBeNull();
  });
});
