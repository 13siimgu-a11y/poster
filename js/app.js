import { initNavbar } from "./navbar.js";
import {
    checkUser,
    initializeAuthSystem,
    login,
    logout,
    register,
    resetPassword,
    setNotificationHandler,
} from "./auth.js";
import { canAccessAdmin, shouldOpenWorkspace } from "./roles.js";

const modalMap = new Map();
let notificationTimer = null;
let countersStarted = false;

document.addEventListener("DOMContentLoaded", () => {
    initializeAuthSystem();
    initNavbar();
    cacheModals();
    bindModalTriggers();
    bindAuthForms();
    initRevealAnimations();
    initCounters();
    initTestimonials();
    setNotificationHandler(showNotification);
    renderUserState(checkUser());
});

window.addEventListener("load", () => {
    const preloader = document.getElementById("preloader");
    setTimeout(() => {
        preloader.classList.add("is-hidden");
    }, 450);
});

function cacheModals() {
    document.querySelectorAll(".modal").forEach((modal) => {
        modalMap.set(modal.id, modal);
    });
}

export function openModal(modalId) {
    const modal = modalMap.get(modalId);

    if (!modal) {
        return;
    }

    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");

    const firstInput = modal.querySelector("input");
    if (firstInput) {
        setTimeout(() => firstInput.focus(), 120);
    }
}

export function closeModal(modalElement) {
    const modal = typeof modalElement === "string" ? modalMap.get(modalElement) : modalElement;

    if (!modal) {
        return;
    }

    if (modal.contains(document.activeElement)) {
        document.activeElement.blur();
    }

    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    modal.querySelector("form")?.reset();

    const hasOpenModal = [...modalMap.values()].some((item) => item.classList.contains("is-open"));
    document.body.classList.toggle("modal-open", hasOpenModal);
}

export function showNotification(message, type = "success") {
    const notification = document.getElementById("notification");

    clearTimeout(notificationTimer);
    notification.textContent = message;
    notification.classList.toggle("is-error", type === "error");
    notification.classList.add("is-visible");

    notificationTimer = setTimeout(() => {
        notification.classList.remove("is-visible");
    }, 3200);
}

function bindModalTriggers() {
    document.addEventListener("click", (event) => {
        const openButton = event.target.closest("[data-open-modal]");
        const closeButton = event.target.closest("[data-close-modal]");

        if (openButton) {
            openModal(openButton.dataset.openModal);
        }

        if (closeButton) {
            closeModal(closeButton.closest(".modal"));
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") {
            return;
        }

        modalMap.forEach((modal) => {
            if (modal.classList.contains("is-open")) {
                closeModal(modal);
            }
        });
    });
}

function bindAuthForms() {
    const registerForm = document.getElementById("registerForm");
    const loginForm = document.getElementById("loginForm");
    const resetPasswordForm = document.getElementById("resetPasswordForm");

    registerForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const user = await register(new FormData(registerForm));

        if (user) {
            closeModal("registerModal");
            openModal("loginModal");
        }
    });

    loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const user = await login(new FormData(loginForm));

        if (user) {
            closeModal("loginModal");
            renderUserState(user);

            if (canAccessAdmin(user)) {
                window.location.href = "admin.html";
            } else if (shouldOpenWorkspace(user)) {
                window.location.href = "workspace.html";
            } else {
                window.location.href = "dashboard.html";
            }
        }
    });

    resetPasswordForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const email = new FormData(resetPasswordForm).get("email");
        const result = await resetPassword(String(email || ""));

        if (!result) {
            return;
        }

        loginForm.elements.username.value = result.username || result.email;
        loginForm.elements.password.value = result.temporaryPassword;
        document.getElementById("resetPasswordResult").hidden = false;
        document.getElementById("resetPasswordResult").innerHTML = `
            <strong>Новый пароль создан</strong>
            <p>Мы уже вставили его в форму входа.</p>
            <code>${escapeHtml(result.temporaryPassword)}</code>
            <button class="btn btn--primary btn--full" type="button" id="openLoginAfterReset">Войти с новым паролем</button>
        `;
        document.getElementById("openLoginAfterReset").addEventListener("click", () => {
            closeModal("resetPasswordModal");
            openModal("loginModal");
        });
    });
}

function renderUserState(user) {
    const headerActions = document.getElementById("headerActions");

    if (!user) {
        headerActions.innerHTML = `
            <button class="btn btn--ghost" type="button" data-open-modal="loginModal">Войти</button>
            <button class="btn btn--primary" type="button" data-open-modal="registerModal">Регистрация</button>
        `;
        return;
    }

    headerActions.innerHTML = `
        <span class="welcome-text">Добро пожаловать, ${escapeHtml(user.username)}</span>
        ${canAccessAdmin(user)
            ? '<a class="btn btn--primary" href="admin.html">Админка</a>'
            : `<a class="btn btn--primary" href="${shouldOpenWorkspace(user) ? "workspace.html" : "dashboard.html"}">${shouldOpenWorkspace(user) ? "Рабочее место" : "Личный кабинет"}</a>`}
        <button class="btn btn--ghost" type="button" id="logoutButton">Выйти</button>
    `;

    document.getElementById("logoutButton").addEventListener("click", async () => {
        await logout();
        renderUserState(null);
    });
}

function initRevealAnimations() {
    const revealItems = document.querySelectorAll(".reveal");

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add("is-visible");
                observer.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.16,
    });

    revealItems.forEach((item) => observer.observe(item));
}

function initCounters() {
    const statsSection = document.querySelector(".stats-grid");

    if (!statsSection) {
        return;
    }

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting && !countersStarted) {
                countersStarted = true;
                animateCounters();
                observer.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.35,
    });

    observer.observe(statsSection);
}

function animateCounters() {
    document.querySelectorAll("[data-counter]").forEach((counter) => {
        const target = Number(counter.dataset.counter);
        const hasDecimal = !Number.isInteger(target);
        const duration = 1500;
        const startTime = performance.now();

        const tick = (currentTime) => {
            const progress = Math.min((currentTime - startTime) / duration, 1);
            const easedProgress = 1 - Math.pow(1 - progress, 3);
            const currentValue = target * easedProgress;

            counter.textContent = hasDecimal ? currentValue.toFixed(1) : Math.round(currentValue).toString();

            if (progress < 1) {
                requestAnimationFrame(tick);
            } else {
                counter.textContent = hasDecimal ? target.toFixed(1) : target.toString();
            }
        };

        requestAnimationFrame(tick);
    });
}

function initTestimonials() {
    const track = document.getElementById("testimonialTrack");
    const controls = document.querySelectorAll("#sliderControls button");
    let activeIndex = 0;

    const setSlide = (index) => {
        activeIndex = index;
        track.style.transform = `translateX(-${activeIndex * 100}%)`;
        controls.forEach((button, buttonIndex) => {
            button.classList.toggle("is-active", buttonIndex === activeIndex);
        });
    };

    controls.forEach((button, index) => {
        button.addEventListener("click", () => setSlide(index));
    });

    setInterval(() => {
        setSlide((activeIndex + 1) % controls.length);
    }, 5500);
}

function escapeHtml(value) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
