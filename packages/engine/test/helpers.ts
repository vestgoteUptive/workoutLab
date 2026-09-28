import type { Area, AreaBalance, BalanceResult } from "../src/index.js";

export function areaOf(result: BalanceResult, area: Area): AreaBalance {
  const found = result.areas.find((a) => a.area === area);
  if (!found) throw new Error(`area ${area} missing from balance()`);
  return found;
}

export function orderOf(result: BalanceResult): Area[] {
  return result.areas.map((a) => a.area);
}

export const ZERO_DAYS: number[] = new Array<number>(14).fill(0);
