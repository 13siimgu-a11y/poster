import { generateSku, updateProduct } from "./products.js";

export function addVariant(product, variant) {
    const variants = [
        ...(product.variants || []),
        {
            id: Date.now(),
            name: variant.name,
            price: Number(variant.price || 0),
            weight: Number(variant.weight || 0),
            costPrice: Number(variant.costPrice || 0),
            sku: variant.sku || generateSku(product.companyId),
        },
    ];

    return updateProduct(product.id, { variants });
}

export function removeVariant(product, variantId) {
    return updateProduct(product.id, {
        variants: (product.variants || []).filter((variant) => Number(variant.id) !== Number(variantId)),
    });
}
