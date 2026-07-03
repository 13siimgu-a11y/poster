export function initNavbar() {
    const header = document.getElementById("header");
    const burger = document.getElementById("burger");
    const nav = document.getElementById("nav");
    const headerActions = document.getElementById("headerActions");

    const setHeaderState = () => {
        header.classList.toggle("is-scrolled", window.scrollY > 18);
    };

    const closeMenu = () => {
        burger.classList.remove("is-active");
        nav.classList.remove("is-open");
        headerActions.classList.remove("is-open");
        burger.setAttribute("aria-expanded", "false");
        document.body.classList.remove("menu-open");
    };

    const toggleMenu = () => {
        const isOpen = burger.classList.toggle("is-active");
        nav.classList.toggle("is-open", isOpen);
        headerActions.classList.toggle("is-open", isOpen);
        burger.setAttribute("aria-expanded", String(isOpen));
        document.body.classList.toggle("menu-open", isOpen);
    };

    setHeaderState();
    window.addEventListener("scroll", setHeaderState);
    burger.addEventListener("click", toggleMenu);

    nav.querySelectorAll("a").forEach((link) => {
        link.addEventListener("click", closeMenu);
    });

    headerActions.addEventListener("click", (event) => {
        if (event.target.closest("button")) {
            closeMenu();
        }
    });

    window.addEventListener("resize", () => {
        if (window.innerWidth > 900) {
            closeMenu();
        }
    });
}
