import { createLog } from "./logs.js";
import { api } from "./apiClient.js";
import { idsEqual } from "./apiPersistence.js";
import { storage, STORAGE_KEYS } from "./storage.js";
import { checkUser, persistCurrentUser } from "./auth.js";
import { updateUser } from "./users.js";

export const BUSINESS_TYPES = [
    ["restaurant", "Ресторан"],
    ["cafe", "Кафе"],
    ["bar", "Бар"],
    ["coffee", "Кофейня"],
    ["pizza", "Пиццерия"],
    ["sushi", "Суши"],
    ["hookah", "Кальянная"],
    ["canteen", "Столовая"],
    ["bakery", "Пекарня"],
    ["confectionery", "Кондитерская"],
    ["fastfood", "Фастфуд"],
    ["club", "Ночной клуб"],
    ["other", "Другое"],
];

export function loadCompanies() {
    return storage.get(STORAGE_KEYS.companies, []);
}

export function saveCompanies(companies) {
    return storage.set(STORAGE_KEYS.companies, companies);
}

export function loadCompany(companyId) {
    return loadCompanies().find((company) => idsEqual(company.id, companyId)) || null;
}

export function saveCompany(company) {
    const companies = loadCompanies();
    const companyIndex = companies.findIndex((item) => idsEqual(item.id, company.id));

    if (companyIndex === -1) {
        companies.push(company);
    } else {
        companies[companyIndex] = company;
    }

    saveCompanies(companies);
    return company;
}

export function createCompany(ownerId, companyData) {
    const companies = loadCompanies();
    const now = new Date().toISOString();
    const company = {
        id: companies.length ? Math.max(...companies.map((item) => Number(item.id))) + 1 : 1,
        ownerId: Number(ownerId),
        name: companyData.name || "",
        legalName: companyData.legalName || "",
        businessType: companyData.businessType || "restaurant",
        description: companyData.description || "",
        logo: companyData.logo || "",
        banner: companyData.banner || "",
        address: {
            country: companyData.country || "",
            city: companyData.city || "",
            street: companyData.street || "",
            postalCode: companyData.postalCode || "",
        },
        contacts: {
            phone: companyData.phone || "",
            email: companyData.email || "",
            website: companyData.website || "",
            instagram: companyData.instagram || "",
            facebook: companyData.facebook || "",
            telegram: companyData.telegram || "",
        },
        settings: {
            language: companyData.language || "ru",
            timezone: companyData.timezone || "",
            currency: companyData.currency || "USD",
            dateFormat: companyData.dateFormat || "DD.MM.YYYY",
            timeFormat: companyData.timeFormat || "24h",
            tax: Number(companyData.tax ?? 18),
            pricesIncludeTax: companyData.pricesIncludeTax !== false,
            notifications: {
                email: true,
                telegram: false,
                push: true,
            },
            workingHours: {
                opensAt: "09:00",
                closesAt: "22:00",
                days: ["Пн", "Вт", "Ср", "Чт", "Пт"],
            },
        },
        qrCode: "",
        createdAt: now,
        updatedAt: now,
    };

    company.qrCode = generateQRCode(company);
    saveCompany(company);
    const updatedOwner = updateUser(ownerId, { companyId: company.id });
    const currentUser = checkUser();

    if (currentUser && Number(currentUser.id) === Number(ownerId)) {
        persistCurrentUser(updatedOwner);
    }

    createLog("Создал заведение", { companyId: company.id, name: company.name, ownerId });
    return company;
}

export async function loadCurrentCompanyFromApi() {
    const company = await api.get("/companies/current");
    if (!company) {
        return null;
    }

    return saveCompany(normalizeApiCompany(company));
}

export async function createCompanyApi(companyData) {
    const company = await api.post("/companies", toApiCompanyPayload(companyData));
    const normalizedCompany = saveCompany(normalizeApiCompany(company));
    const currentUser = checkUser();

    if (currentUser) {
        persistCurrentUser({
            ...currentUser,
            companyId: normalizedCompany.id,
        });
    }

    return normalizedCompany;
}

function toApiCompanyPayload(companyData) {
    return {
        name: companyData.name || "",
        legalName: companyData.legalName || "",
        businessType: companyData.businessType || "restaurant",
        description: companyData.description || "",
        logo: companyData.logo || "",
        banner: companyData.banner || "",
        address: {
            country: companyData.country || "",
            city: companyData.city || "",
            street: companyData.street || "",
            postalCode: companyData.postalCode || "",
        },
        contacts: {
            phone: companyData.phone || "",
            email: companyData.email || "",
            website: companyData.website || "",
            instagram: companyData.instagram || "",
            facebook: companyData.facebook || "",
            telegram: companyData.telegram || "",
        },
        settings: {
            language: companyData.language || "ru",
            timezone: companyData.timezone || "",
            currency: companyData.currency || "USD",
            dateFormat: companyData.dateFormat || "DD.MM.YYYY",
            timeFormat: companyData.timeFormat || "24h",
            tax: Number(companyData.tax ?? 18),
            pricesIncludeTax: companyData.pricesIncludeTax !== false,
            notifications: {
                email: true,
                telegram: false,
                push: true,
            },
            workingHours: {
                opensAt: "09:00",
                closesAt: "22:00",
                days: ["Пн", "Вт", "Ср", "Чт", "Пт"],
            },
        },
    };
}

function normalizeApiCompany(company) {
    return {
        ...company,
        address: company.address || {},
        contacts: company.contacts || {},
        settings: {
            currency: "USD",
            language: "ru",
            ...(company.settings || {}),
        },
        qrCode: company.qrCode || generateQRCode(company),
    };
}

export function updateCompany(companyId, patch) {
    const company = loadCompany(companyId);

    if (!company) {
        return null;
    }

    const updatedCompany = {
        ...company,
        ...patch,
        address: {
            ...company.address,
            ...(patch.address || {}),
        },
        contacts: {
            ...company.contacts,
            ...(patch.contacts || {}),
        },
        settings: {
            ...company.settings,
            ...(patch.settings || {}),
        },
        updatedAt: new Date().toISOString(),
    };

    updatedCompany.qrCode = generateQRCode(updatedCompany);
    saveCompany(updatedCompany);
    createLog("Обновил заведение", { companyId: updatedCompany.id, name: updatedCompany.name });
    return updatedCompany;
}

export function deleteCompany(companyId) {
    const company = loadCompany(companyId);

    if (!company) {
        return false;
    }

    saveCompanies(loadCompanies().filter((item) => !idsEqual(item.id, companyId)));
    createLog("Удалил заведение", { companyId: company.id, name: company.name });
    return true;
}

export function generateQRCode(company) {
    const payload = `POS-POSTER-COMPANY:${company.id}:${company.name}`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(payload)}`;
}
