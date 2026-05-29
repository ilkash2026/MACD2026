export interface RuleRange {
  max?: number;
  min?: number;
  multiplier: number;
}

export interface PricingConfig {
  ranges: RuleRange[];
}

export function calculateInnerPrice(baseOuterPrice: number, occupancy: number, config: PricingConfig): number {
  const range = config.ranges.find((r) => {
    const minOk = r.min === undefined || occupancy >= r.min;
    const maxOk = r.max === undefined || occupancy <= r.max;
    return minOk && maxOk;
  });

  const multiplier = range?.multiplier ?? 1;
  return Number((baseOuterPrice * multiplier).toFixed(2));
}
