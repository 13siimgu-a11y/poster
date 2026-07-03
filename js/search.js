export function searchProducts(products, query) {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
        return products;
    }

    return products.filter((product) => (
        product.name.toLowerCase().includes(normalizedQuery)
        || product.sku.toLowerCase().includes(normalizedQuery)
        || product.description.toLowerCase().includes(normalizedQuery)
    ));
}
