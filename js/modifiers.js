import { updateProduct } from "./products.js";

export function addModifier(product, modifier) {
    const modifiers = [
        ...(product.modifiers || []),
        {
            id: Date.now(),
            name: modifier.name,
            options: modifier.options || [],
            price: Number(modifier.price || 0),
        },
    ];

    return updateProduct(product.id, { modifiers });
}

export function removeModifier(product, modifierId) {
    return updateProduct(product.id, {
        modifiers: (product.modifiers || []).filter((modifier) => Number(modifier.id) !== Number(modifierId)),
    });
}
