import { loadCompanies, loadCompany } from "./company.js";
import { ROLES } from "./roles.js";

export function getUserCompany(user) {
    if (!user?.companyId) {
        return null;
    }

    return loadCompany(user.companyId);
}

export function getVisibleCompanies(user) {
    if (user?.role === ROLES.superAdmin) {
        return loadCompanies();
    }

    const company = getUserCompany(user);
    return company ? [company] : [];
}

export function canManageCompany(user, company) {
    if (!user || !company) {
        return false;
    }

    return user.role === ROLES.superAdmin || Number(company.ownerId) === Number(user.id);
}
