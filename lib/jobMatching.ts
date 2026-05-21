/**
 * Job-to-talent matching foundation.
 *
 * Pure scoring function with no external AI dependencies. The current
 * heuristic combines skill overlap, location match, and title-text relevance.
 * Replace with an ML / embedding-based scorer when available.
 */

import { normalizeSearchQuery, scoreTextRelevance, type TalentSearchResult } from "@/lib/talentSearch";

export type JobMatchScore = {
  talentId: string;
  score: number; // 0–100
  reasons: string[];
};

export function scoreJobMatch(
  job: { title: string; required_skills?: string[]; city?: string },
  talent: TalentSearchResult,
): JobMatchScore {
  const reasons: string[] = [];
  let score = 0;
  let weight = 0;

  // Title relevance vs talent name+skills (small contribution)
  if (job.title) {
    const text = [talent.fullName, ...(talent.skills ?? [])].join(" ");
    const titleScore = scoreTextRelevance(text, job.title);
    score += titleScore * 0.2;
    weight += 20;
    if (titleScore >= 50) reasons.push("Texto da vaga relevante");
  }

  // Skill overlap (largest weight)
  if (job.required_skills && job.required_skills.length > 0) {
    const want = new Set(job.required_skills.map(normalizeSearchQuery));
    const have = new Set((talent.skills ?? []).map(normalizeSearchQuery));
    let matched = 0;
    for (const s of want) if (have.has(s)) matched++;
    const skillScore = Math.round((matched / want.size) * 100);
    score += skillScore * 0.5;
    weight += 50;
    if (matched > 0) reasons.push(`${matched}/${want.size} habilidades`);
  }

  // Location match
  if (job.city) {
    const jobCity = normalizeSearchQuery(job.city);
    const talentCity = normalizeSearchQuery(talent.city ?? "");
    const cityScore = jobCity && jobCity === talentCity ? 100 : 0;
    score += cityScore * 0.3;
    weight += 30;
    if (cityScore) reasons.push("Cidade compatível");
  }

  const finalScore = weight === 0 ? 0 : Math.round(score / (weight / 100));

  return {
    talentId: talent.id,
    score: Math.max(0, Math.min(100, finalScore)),
    reasons,
  };
}

// TODO: Replace with ML-based scoring (pgvector embedding similarity).
