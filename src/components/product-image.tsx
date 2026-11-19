import { useState } from "react";
import { Package } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PRODUCT_IMAGE_ASSETS,
  resolveProductImage,
  type ProductImageDescriptor,
} from "@/lib/product-images";

interface ProductImageProps extends ProductImageDescriptor {
  className?: string | undefined;
  alt?: string | undefined;
  loading?: "eager" | "lazy" | undefined;
}

export function ProductImage({ className, alt, loading = "lazy", ...product }: ProductImageProps) {
  const key = resolveProductImage(product);
  const src = key ? PRODUCT_IMAGE_ASSETS[key] : null;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const fallbackSrc = src?.endsWith(".webp") ? src.replace(/\.webp$/, ".png") : null;
  const imageSrc = failedSrc === src && fallbackSrc ? fallbackSrc : src;

  if (!imageSrc || (failedSrc === imageSrc && (!fallbackSrc || imageSrc === fallbackSrc))) {
    return (
      <span
        role="img"
        aria-label={`${alt ?? product.name ?? "Product"} image unavailable`}
        className={cn("flex items-center justify-center bg-muted text-muted-foreground", className)}
      >
        <Package aria-hidden="true" className="h-1/2 w-1/2" />
      </span>
    );
  }

  return (
    <span className={cn("flex items-center justify-center overflow-hidden bg-muted", className)}>
      <img
        src={imageSrc}
        alt={alt ?? product.name ?? "Product"}
        loading={loading}
        decoding="async"
        className="h-full w-full object-contain"
        onError={() => setFailedSrc(imageSrc)}
      />
    </span>
  );
}
