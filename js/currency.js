export const CURRENCIES = {
    USD: {
        code: "USD",
        label: "USD ($)",
        symbol: "$",
    },
    EUR: {
        code: "EUR",
        label: "EUR (€)",
        symbol: "€",
    },
    GEL: {
        code: "GEL",
        label: "GEL (₾)",
        symbol: "₾",
    },
};

export function formatMoney(value, currency = "USD") {
    const symbol = CURRENCIES[currency]?.symbol || "$";
    return `${Number(value).toLocaleString("ru-RU")} ${symbol}`;
}

export function changeCurrency(company, currency) {
    if (!CURRENCIES[currency]) {
        return company;
    }

    return {
        ...company,
        settings: {
            ...company.settings,
            currency,
        },
        updatedAt: new Date().toISOString(),
    };
}
