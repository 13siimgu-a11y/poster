import { formatMoney } from "./currency.js";
import { changePrice as updateProductPrice } from "./products.js";

export function changePrice(productId, price) {
    return updateProductPrice(productId, price);
}

export function formatProductPrice(product, company) {
    return formatMoney(product.price || 0, company.settings.currency);
}

export function getAveragePrice(products) {
    if (!products.length) {
        return 0;
    }

    return products.reduce((sum, product) => sum + Number(product.price || 0), 0) / products.length;
}
