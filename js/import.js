export function importProducts(content, format = "csv") {
    if (format !== "csv" || !content.trim()) {
        return [];
    }

    const [headerLine, ...rows] = content.trim().split("\n");
    const headers = headerLine.split(",").map((item) => item.replaceAll('"', ""));

    return rows.map((row) => {
        const values = row.split(",").map((item) => item.replaceAll('"', ""));
        return headers.reduce((product, key, index) => ({
            ...product,
            [key]: values[index] || "",
        }), {});
    });
}
