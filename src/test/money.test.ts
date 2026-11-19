import { describe, expect, it } from "vitest";
import { money, posMoney, posUnitPriceLabel } from "@/lib/money";

describe("POS money formatting", () => {
  it("displays rounded cashier amounts without decimal places", () => {
    expect(posMoney(1900.2)).toBe("KSh 1,900");
    expect(posMoney(1999.9)).toBe("KSh 2,000");
    expect(posMoney(2000)).toBe("KSh 2,000");
    expect(posMoney(-12.5)).toBe("KSh -13");
  });

  it("hides decimals in configured unit-price labels", () => {
    expect(posUnitPriceLabel("KSh 1900.2 / KG")).toBe("KSh 1,900 / KG");
  });

  it("preserves precision in shared non-POS money formatting", () => {
    expect(money(1900.2)).toBe("KSh 1,900.2");
  });
});
