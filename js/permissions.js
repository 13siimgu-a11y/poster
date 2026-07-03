export const PERMISSIONS = [
    ["menu:view", "Можно просматривать меню"],
    ["menu:edit", "Можно изменять меню"],
    ["sales:create", "Можно оформлять продажи"],
    ["sales:refund", "Можно делать возвраты"],
    ["inventory:manage", "Можно управлять складом"],
    ["finance:view", "Можно просматривать финансы"],
    ["staff:manage", "Можно работать с персоналом"],
    ["settings:edit", "Можно изменять настройки"],
    ["discounts:manage", "Можно управлять скидками"],
    ["shifts:open", "Можно открывать смены"],
    ["shifts:close", "Можно закрывать смены"],
    ["ai:use", "Можно пользоваться AI Assistant"],
];

export const ROLE_PERMISSIONS = {
    admin: PERMISSIONS.map(([key]) => key),
    manager: ["menu:view", "menu:edit", "sales:create", "inventory:manage", "staff:manage", "discounts:manage", "shifts:open", "shifts:close", "ai:use"],
    cashier: ["menu:view", "sales:create", "sales:refund", "discounts:manage", "shifts:open", "shifts:close", "ai:use"],
    waiter: ["menu:view", "sales:create", "shifts:open", "ai:use"],
    kitchen: ["menu:view", "ai:use"],
    bartender: ["menu:view", "sales:create", "inventory:manage", "shifts:open", "ai:use"],
};

export function changePermissions(employee, permissions) {
    return {
        ...employee,
        permissions,
        updatedAt: new Date().toISOString(),
    };
}
