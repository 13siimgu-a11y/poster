export function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        if (!file || file.size === 0) {
            resolve("");
            return;
        }

        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("Не удалось загрузить файл"));
        reader.readAsDataURL(file);
    });
}

export function uploadLogo(file) {
    return readFileAsDataUrl(file);
}

export function uploadBanner(file) {
    return readFileAsDataUrl(file);
}
