export function filterProducts(products, filters = {}) {
    return products.filter((product) => {
        const matchesCategory = !filters.categoryId || Number(product.categoryId) === Number(filters.categoryId);
        const matchesStatus = !filters.status || product.status === filters.status;
        const matchesAvailability = !filters.availability
            || (filters.availability === "low" ? product.quantity <= product.minQuantity : product.quantity > 0);
        const matchesTag = !filters.tag || product.tags.includes(filters.tag);
        const matchesMinPrice = !filters.minPrice || Number(product.price) >= Number(filters.minPrice);
        const matchesMaxPrice = !filters.maxPrice || Number(product.price) <= Number(filters.maxPrice);

        return matchesCategory && matchesStatus && matchesAvailability && matchesTag && matchesMinPrice && matchesMaxPrice;
    });
}

export function sortProducts(products, sortBy = "createdAt") {
    return [...products].sort((left, right) => {
        if (sortBy === "name") {
            return left.name.localeCompare(right.name);
        }

        if (sortBy === "price") {
            return Number(left.price) - Number(right.price);
        }

        if (sortBy === "category") {
            return Number(left.categoryId) - Number(right.categoryId);
        }

        if (sortBy === "popular") {
            return Number(right.popular) - Number(left.popular);
        }

        return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    });
}
