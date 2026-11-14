import { describe, expect, it } from 'vitest';
import { RESUME_MATCH_WEIGHTS } from './matching';
import { calculateRankingScore, RANKING_WEIGHTS } from './scoring';

describe('resume-weighted scoring', () => {
  it('keeps resume evidence as the dominant resume-match factor', () => {
    expect(RESUME_MATCH_WEIGHTS.skills + RESUME_MATCH_WEIGHTS.experience).toBe(65);
    expect(RESUME_MATCH_WEIGHTS.title).toBe(20);
    expect(Object.values(RESUME_MATCH_WEIGHTS).reduce((sum, weight) => sum + weight, 0)).toBe(100);
  });

  it('uses 75% resume, 15% company, and 10% city in ranking', () => {
    expect(RANKING_WEIGHTS).toEqual({ resume: 0.75, company: 0.15, city: 0.1 });
    expect(
      calculateRankingScore({
        resumeScore: 80,
        companyScore: 60,
        cityScore: 100,
      }),
    ).toBe(79);
  });

  it('prioritizes a stronger resume match over a higher company signal', () => {
    const strongerResume = calculateRankingScore({
      resumeScore: 92,
      companyScore: 60,
      cityScore: 100,
    });
    const strongerCompany = calculateRankingScore({
      resumeScore: 70,
      companyScore: 90,
      cityScore: 100,
    });

    expect(strongerResume).toBeGreaterThan(strongerCompany);
  });
});
