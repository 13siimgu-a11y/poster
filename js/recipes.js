import { loadIngredients, updateIngredient } from "./ingredients.js";
import { logStockMovement } from "./stockMovements.js";
import { storage, STORAGE_KEYS } from "./storage.js";
import { convertUnits } from "./units.js";

export function loadRecipes(companyId = null) {
    const recipes = storage.get(STORAGE_KEYS.recipes, []);
    return companyId ? recipes.filter((recipe) => Number(recipe.companyId) === Number(companyId)) : recipes;
}

export function createRecipe(companyId, productId, ingredients = []) {
    const recipes = storage.get(STORAGE_KEYS.recipes, []);
    const recipe = {
        id: recipes.length ? Math.max(...recipes.map((item) => Number(item.id))) + 1 : 1,
        companyId: Number(companyId),
        productId: Number(productId),
        ingredients,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };

    storage.set(STORAGE_KEYS.recipes, [...recipes, recipe]);
    return recipe;
}

export function updateRecipe(recipeId, ingredients) {
    const recipes = storage.get(STORAGE_KEYS.recipes, []);
    const index = recipes.findIndex((recipe) => Number(recipe.id) === Number(recipeId));

    if (index === -1) {
        return null;
    }

    recipes[index] = {
        ...recipes[index],
        ingredients,
        updatedAt: new Date().toISOString(),
    };

    storage.set(STORAGE_KEYS.recipes, recipes);
    return recipes[index];
}

export function removeRecipe(recipeId) {
    storage.set(STORAGE_KEYS.recipes, storage.get(STORAGE_KEYS.recipes, []).filter((recipe) => Number(recipe.id) !== Number(recipeId)));
}

export function consumeIngredients(companyId, orderItems, userId = 0) {
    const recipes = loadRecipes(companyId);
    const ingredients = loadIngredients(companyId);
    const warnings = [];

    orderItems.forEach((item) => {
        const recipe = recipes.find((entry) => Number(entry.productId) === Number(item.productId));

        if (!recipe) {
            return;
        }

        recipe.ingredients.forEach((recipeItem) => {
            const ingredient = ingredients.find((entry) => Number(entry.id) === Number(recipeItem.ingredientId));

            if (!ingredient) {
                return;
            }

            const required = convertUnits(Number(recipeItem.quantity) * Number(item.quantity || 1), recipeItem.unit, ingredient.unit);
            const nextQuantity = ingredient.quantity - required;

            if (nextQuantity < 0) {
                warnings.push(`${ingredient.name}: недостаточно остатка`);
            }

            const updated = updateIngredient(ingredient.id, { quantity: Math.max(0, nextQuantity) });
            logStockMovement(companyId, ingredient.id, {
                type: "sale",
                quantity: -Math.abs(required),
                reason: `Продажа: ${item.name}`,
                userId,
                balanceAfter: updated.quantity,
            });
        });
    });

    return warnings;
}
