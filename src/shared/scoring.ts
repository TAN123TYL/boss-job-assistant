import { clamp } from './utils';

export const RANKING_WEIGHTS = {
  resume: 0.75,
  company: 0.15,
  city: 0.1,
} as const;

export interface RankingSignals {
  resumeScore: number;
  companyScore: number;
  cityScore: number;
}

export function calculateRankingScore({
  resumeScore,
  companyScore,
  cityScore,
}: RankingSignals): number {
  return Math.round(
    clamp(
      resumeScore * RANKING_WEIGHTS.resume +
        companyScore * RANKING_WEIGHTS.company +
        cityScore * RANKING_WEIGHTS.city,
      0,
      100,
    ),
  );
}
