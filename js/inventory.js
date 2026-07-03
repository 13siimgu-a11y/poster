export {
    addStock,
    createIngredient,
    deleteIngredient,
    INGREDIENT_CATEGORIES,
    loadIngredients,
    updateIngredient,
    writeOffStock,
} from "./ingredients.js";

export {
    createRecipe,
    loadRecipes,
    removeRecipe,
    updateRecipe,
    consumeIngredients,
} from "./recipes.js";

export { loadStockMovements, logStockMovement } from "./stockMovements.js";
export { checkLowStock, getStockStatus } from "./stockAlerts.js";
export { loadInventoryAudits, performInventory } from "./inventoryAudit.js";
export { convertUnits, formatInventoryQuantity, INVENTORY_UNITS } from "./units.js";

export function calculateStockValue(ingredients) {
    return ingredients.reduce((sum, ingredient) => sum + Number(ingredient.quantity || 0) * Number(ingredient.costPrice || 0), 0);
}

export function getInventoryStatistics(ingredients, movements, audits) {
    return {
        totalIngredients: ingredients.length,
        lowStock: ingredients.filter((ingredient) => ingredient.quantity <= ingredient.minQuantity && ingredient.quantity > 0).length,
        outOfStock: ingredients.filter((ingredient) => ingredient.quantity <= 0).length,
        stockValue: calculateStockValue(ingredients),
        lastWriteOff: movements.find((movement) => movement.type === "writeoff")?.createdAt || "—",
        lastInventory: audits[0]?.createdAt || "—",
    };
}
