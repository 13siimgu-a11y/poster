import { loadIngredients } from "./ingredients.js";

export function checkLowStock(companyId) {
    return loadIngredients(companyId).filter((ingredient) => ingredient.quantity <= ingredient.minQuantity);
}

export function getStockStatus(ingredient) {
    if (ingredient.quantity <= 0) {
        return "out";
    }

    if (ingredient.quantity <= ingredient.minQuantity) {
        return "low";
    }

    return "ok";
}
