export function exportProducts(products, format = "csv") {
    if (format !== "csv") {
        return {
            format,
            content: "",
            message: "Формат подготовлен архитектурно и будет реализован позже.",
        };
    }

    const header = ["id", "sku", "name", "categoryId", "price", "quantity", "status"];
    const rows = products.map((product) => (
        header.map((key) => `"${String(product[key] ?? "").replaceAll('"', '""')}"`).join(",")
    ));

    return {
        format,
        content: [header.join(","), ...rows].join("\n"),
        message: "CSV экспорт подготовлен.",
    };
}
