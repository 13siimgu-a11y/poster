import { loadCategories } from "./categories.js";
import { loadCompany } from "./company.js";
import { loadIngredients } from "./ingredients.js";
import { checkLowStock } from "./inventory.js";
import { loadReceipts } from "./pos.js";
import { loadProducts } from "./products.js";
import { loadProcurementDashboard } from "./procurementStatistics.js";
import { loadPurchaseOrders } from "./purchaseOrders.js";
import { loadStaffDashboard } from "./staffDashboard.js";
import { loadEmployees } from "./employees.js";

export function loadContext({ companyId, user, currentView }) {
    const company = loadCompany(companyId);
    const products = loadProducts(companyId);
    const categories = loadCategories(companyId);
    const ingredients = loadIngredients(companyId);

    return {
        companyId,
        currentView,
        user: {
            id: user.id,
            username: user.username,
            role: user.role,
        },
        company,
        summary: {
            products: products.length,
            categories: categories.length,
            ingredients: ingredients.length,
            lowStock: checkLowStock(companyId).length,
            openReceipts: loadReceipts(companyId, "open").length,
            employees: loadEmployees(companyId).length,
            purchaseOrders: loadPurchaseOrders(companyId).length,
        },
        pageData: getPageData(currentView, companyId),
    };
}

function getPageData(currentView, companyId) {
    if (currentView === "menu") {
        return {
            products: loadProducts(companyId),
            categories: loadCategories(companyId),
        };
    }

    if (currentView === "warehouse") {
        return {
            ingredients: loadIngredients(companyId),
            lowStock: checkLowStock(companyId),
        };
    }

    if (currentView === "procurement") {
        return {
            dashboard: loadProcurementDashboard(companyId),
            orders: loadPurchaseOrders(companyId),
        };
    }

    if (currentView === "staff") {
        return {
            dashboard: loadStaffDashboard(companyId),
            employees: loadEmployees(companyId),
        };
    }

    if (currentView === "pos") {
        return {
            openReceipts: loadReceipts(companyId, "open"),
            heldReceipts: loadReceipts(companyId, "held"),
        };
    }

    return {};
}
