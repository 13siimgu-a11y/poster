import { readFileAsDataUrl } from "./upload.js";

export async function uploadImage(file) {
    return readFileAsDataUrl(file);
}

export async function uploadGallery(files) {
    const fileList = Array.from(files || []).filter((file) => file.size > 0);
    return Promise.all(fileList.map(uploadImage));
}

export function removeGalleryImage(images, index) {
    return images.filter((_, imageIndex) => imageIndex !== index);
}
