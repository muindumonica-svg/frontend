import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PRODUCT_IMAGE_ASSETS, PRODUCT_IMAGE_OPTIONS, resolveProductImage } from "./product-images";

describe("resolveProductImage", () => {
  it("uses distinct whole-chicken images for Kienyeji and Broiler", () => {
    expect(resolveProductImage({ name: "Kienyeji Whole Chicken" })).toBe("kienyeji-whole-chicken");
    expect(resolveProductImage({ name: "Whole Kienyeji Chicken" })).toBe("kienyeji-whole-chicken");
    expect(resolveProductImage({ name: "Whole Kienyeji" })).toBe("kienyeji-whole-chicken");
    expect(resolveProductImage({ name: "Whole Broiler Chicken" })).toBe("broiler-whole-chicken");
    expect(resolveProductImage({ name: "Broiler Whole Chicken" })).toBe("broiler-whole-chicken");
    expect(resolveProductImage({ name: "Whole Broiler" })).toBe("broiler-whole-chicken");
    expect(
      resolveProductImage({
        name: "Whole Kienyeji",
        slug: "kienyeji-achicken",
        sku: "BRM-Kienyeji",
        categoryName: "Whole Chicken",
      }),
    ).toBe("kienyeji-whole-chicken");
    expect(resolveProductImage({ name: "Whole Chicken", categoryName: "Broiler" })).toBe(
      "broiler-whole-chicken",
    );
    expect(resolveProductImage({ name: "Whole Chicken" })).toBe("whole-chicken");
  });

  it("lists both specific whole-chicken images first in the product editor", () => {
    expect(PRODUCT_IMAGE_OPTIONS.slice(0, 3)).toEqual([
      "kienyeji-whole-chicken",
      "broiler-whole-chicken",
      "whole-chicken",
    ]);
  });

  it("matches specific cuts before whole-chicken type labels", () => {
    expect(resolveProductImage({ name: "Broiler Chicken Wings" })).toBe("chicken-wings");
    expect(resolveProductImage({ name: "Kienyeji Drumsticks" })).toBe("drumsticks");
    expect(resolveProductImage({ name: "Gizzards Portions" })).toBe("chicken-gizzards-portions");
  });

  it("supports slugs, SKUs and category names", () => {
    expect(resolveProductImage({ slug: "chicken-breast-fillet" })).toBe("chicken-breast");
    expect(resolveProductImage({ sku: "AVOCADO-001" })).toBe("avocado");
    expect(resolveProductImage({ name: "Fresh", categoryName: "Eggs" })).toBe("eggs");
  });

  it("returns no asset for an unmatched product", () => {
    expect(resolveProductImage({ name: "Special item" })).toBeNull();
  });

  it("uses an explicitly selected asset before automatic matching", () => {
    expect(resolveProductImage({ name: "Whole Chicken", imageKey: "kienyeji-whole-chicken" })).toBe(
      "kienyeji-whole-chicken",
    );
  });

  it("references an existing file for every supplied asset", () => {
    for (const asset of Object.values(PRODUCT_IMAGE_ASSETS)) {
      expect(existsSync(resolve(process.cwd(), "public", asset.slice(1))), asset).toBe(true);
    }
  });

  it("uses optimized WebP images for both distinct whole-chicken types", () => {
    expect(PRODUCT_IMAGE_ASSETS["kienyeji-whole-chicken"]).toBe(
      "/assets/products/kienyeji-whole-chicken.webp",
    );
    expect(PRODUCT_IMAGE_ASSETS["broiler-whole-chicken"]).toBe(
      "/assets/products/broiler-whole-chicken.webp",
    );
  });
});
