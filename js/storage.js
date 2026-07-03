export const STORAGE_KEYS = {
    users: "posPosterUsers",
    currentUser: "currentUser",
    plans: "posPosterPlans",
    logs: "posPosterLogs",
    settings: "posPosterSettings",
    companies: "posPosterCompanies",
    categories: "posPosterCategories",
    products: "posPosterProducts",
    receipts: "posPosterReceipts",
    cashRegisters: "posPosterCashRegisters",
    halls: "posPosterHalls",
    tables: "posPosterTables",
    tableOrders: "posPosterTableOrders",
    reservations: "posPosterReservations",
    kitchenOrders: "posPosterKitchenOrders",
    kitchenArchive: "posPosterKitchenArchive",
    ingredients: "posPosterIngredients",
    recipes: "posPosterRecipes",
    stockMovements: "posPosterStockMovements",
    inventoryAudits: "posPosterInventoryAudits",
    suppliers: "posPosterSuppliers",
    purchaseOrders: "posPosterPurchaseOrders",
    supplierReturns: "posPosterSupplierReturns",
    employees: "posPosterEmployees",
    positions: "posPosterPositions",
    staffShifts: "posPosterStaffShifts",
    staffSchedules: "posPosterStaffSchedules",
    staffHistory: "posPosterStaffHistory",
    customers: "posPosterCustomers",
    aiConversations: "posPosterAIConversations",
};

export const storage = {
    get(key, fallback = null) {
        const rawValue = localStorage.getItem(key);

        if (!rawValue) {
            return fallback;
        }

        try {
            return JSON.parse(rawValue);
        } catch {
            return fallback;
        }
    },

    set(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
        return value;
    },

    remove(key) {
        localStorage.removeItem(key);
    },
};
