export type FuzzConfig = {
  firstSeed: number;
  seedCount: number;
  operationCount: number;
};

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getFuzzConfig(): FuzzConfig {
  const explicitSeed = process.env.DIGEST_FUZZ_SEED;
  return {
    firstSeed: positiveInteger(explicitSeed, 1),
    seedCount:
      explicitSeed === undefined
        ? positiveInteger(process.env.DIGEST_FUZZ_SEEDS, 100)
        : 1,
    operationCount: positiveInteger(process.env.DIGEST_FUZZ_STEPS, 500),
  };
}

export function seededIndex(seed: number): (max: number) => number {
  let state = seed >>> 0;
  return (max: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state % max;
  };
}
