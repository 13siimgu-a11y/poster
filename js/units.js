export const INVENTORY_UNITS = {
    g: { label: "грамм", base: "g", factor: 1 },
    kg: { label: "килограмм", base: "g", factor: 1000 },
    ml: { label: "миллилитр", base: "ml", factor: 1 },
    l: { label: "литр", base: "ml", factor: 1000 },
    pcs: { label: "штука", base: "pcs", factor: 1 },
    pack: { label: "упаковка", base: "pack", factor: 1 },
    bottle: { label: "бутылка", base: "bottle", factor: 1 },
    box: { label: "коробка", base: "box", factor: 1 },
};

export function convertUnits(quantity, fromUnit, toUnit) {
    const from = INVENTORY_UNITS[fromUnit];
    const to = INVENTORY_UNITS[toUnit];

    if (!from || !to || from.base !== to.base) {
        return Number(quantity);
    }

    return (Number(quantity) * from.factor) / to.factor;
}

export function formatInventoryQuantity(quantity, unit) {
    const label = INVENTORY_UNITS[unit]?.label || unit;
    return `${Number(quantity).toLocaleString("ru-RU")} ${label}`;
}
