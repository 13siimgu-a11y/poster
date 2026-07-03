import { updateCompany } from "./company.js";
import { changeCurrency } from "./currency.js";

export function changeLanguage(company, language) {
    return {
        ...company,
        settings: {
            ...company.settings,
            language,
        },
        updatedAt: new Date().toISOString(),
    };
}

export function updateContacts(companyId, contacts) {
    return updateCompany(companyId, { contacts });
}

export function updateSettings(companyId, settings) {
    return updateCompany(companyId, { settings });
}

export function applyCurrency(companyId, company, currency) {
    return updateCompany(companyId, changeCurrency(company, currency));
}
