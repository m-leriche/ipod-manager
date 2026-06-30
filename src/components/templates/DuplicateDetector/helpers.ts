export const qualityLabel = (score: number): string => {
  if (score >= 100) return "Lossless";
  if (score >= 50) return "High";
  if (score >= 25) return "Good";
  return "Low";
};
