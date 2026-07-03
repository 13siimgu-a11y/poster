const API_BASE_URL = "/api";
const ACCESS_TOKEN_KEY = "posPosterAccessToken";

function getAccessToken() {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
}

function setAccessToken(token) {
    if (!token) {
        localStorage.removeItem(ACCESS_TOKEN_KEY);
        return;
    }

    localStorage.setItem(ACCESS_TOKEN_KEY, token);
}

async function request(path, options = {}, retry = true) {
    const headers = new Headers(options.headers || {});
    const token = getAccessToken();

    if (token) {
        headers.set("Authorization", `Bearer ${token}`);
    }

    if (options.body && !(options.body instanceof FormData)) {
        headers.set("Content-Type", "application/json");
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
        credentials: "include",
        ...options,
        headers,
        body: options.body && !(options.body instanceof FormData)
            ? JSON.stringify(options.body)
            : options.body,
    });

    if (response.status === 401 && retry) {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
            return request(path, options, false);
        }
    }

    if (response.status === 204) {
        return null;
    }

    const data = await response.json().catch(() => null);
    if (!response.ok) {
        throw new Error(data?.error || "API request failed");
    }

    return data;
}

async function refreshAccessToken() {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include",
    });

    if (!response.ok) {
        setAccessToken(null);
        return false;
    }

    const data = await response.json();
    setAccessToken(data.accessToken);
    return true;
}

export const api = {
    isEnabled() {
        return Boolean(window.POS_POSTER_API_ENABLED);
    },
    setAccessToken,
    get(path) {
        return request(path);
    },
    post(path, body) {
        return request(path, { method: "POST", body });
    },
    patch(path, body) {
        return request(path, { method: "PATCH", body });
    },
    delete(path) {
        return request(path, { method: "DELETE" });
    },
    upload(path, formData) {
        return request(path, { method: "POST", body: formData });
    },
};
