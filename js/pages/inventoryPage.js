import { loadProducts } from "../products.js";
import {
    addStock,
    checkLowStock,
    createIngredient,
    createRecipe,
    formatInventoryQuantity,
    getInventoryStatistics,
    getStockStatus,
    INGREDIENT_CATEGORIES,
    INVENTORY_UNITS,
    loadIngredients,
    loadInventoryAudits,
    loadRecipes,
    loadStockMovements,
    performInventory,
    writeOffStock,
} from "../inventory.js";

let currentCompany = null;
let currentUser = null;
let helpers = {};
let activeTab = "stock";
let isBound = false;

export function initInventoryPage(context) {
    currentCompany = context.company;
    currentUser = context.user;
    helpers = context;
    bindInventoryEvents();
    renderInventory();
}

function bindInventoryEvents() {
    if (isBound) return;

    document.getElementById("createIngredientButton").addEventListener("click", openIngredientModal);
    document.getElementById("inventorySearch").addEventListener("input", renderInventoryContent);
    document.getElementById("inventoryCategoryFilter").addEventListener("change", renderInventoryContent);
    document.getElementById("inventoryStatusFilter").addEventListener("change", renderInventoryContent);
    document.querySelectorAll("[data-inventory-tab]").forEach((button) => {
        button.addEventListener("click", () => {
            activeTab = button.dataset.inventoryTab;
            document.querySelectorAll("[data-inventory-tab]").forEach((item) => item.classList.remove("is-active"));
            button.classList.add("is-active");
            renderInventoryContent();
        });
    });
    document.querySelectorAll("[data-close-inventory-modal]").forEach((item) => {
        item.addEventListener("click", closeInventoryModal);
    });

    isBound = true;
}

function renderInventory() {
    renderInventoryFilters();
    renderInventoryAlerts();
    renderInventoryStats();
    renderInventoryContent();
}

function renderInventoryFilters() {
    const selected = document.getElementById("inventoryCategoryFilter").value;
    document.getElementById("inventoryCategoryFilter").innerHTML = `
        <option value="">Все категории</option>
        ${INGREDIENT_CATEGORIES.map((category) => `<option value="${category}">${category}</option>`).join("")}
    `;
    document.getElementById("inventoryCategoryFilter").value = selected;
}

function getFilteredIngredients() {
    const query = document.getElementById("inventorySearch").value.trim().toLowerCase();
    const category = document.getElementById("inventoryCategoryFilter").value;
    const status = document.getElementById("inventoryStatusFilter").value;

    return loadIngredients(currentCompany.id).filter((ingredient) => {
        const matchesQuery = !query || ingredient.name.toLowerCase().includes(query) || ingredient.sku.toLowerCase().includes(query);
        const matchesCategory = !category || ingredient.category === category;
        const matchesStatus = !status || getStockStatus(ingredient) === status;
        return matchesQuery && matchesCategory && matchesStatus;
    });
}

function renderInventoryAlerts() {
    const lowStock = checkLowStock(currentCompany.id);
    document.getElementById("inventoryAlerts").innerHTML = lowStock.length ? `
        <div class="inventory-warning">
            <strong>Нужно пополнить склад</strong>
            <span>${lowStock.length} ингредиентов достигли минимального остатка. Проверьте список и создайте закупку у поставщика.</span>
        </div>
    ` : "";
}

function renderInventoryStats() {
    const ingredients = loadIngredients(currentCompany.id);
    const stats = getInventoryStatistics(
        ingredients,
        loadStockMovements(currentCompany.id),
        loadInventoryAudits(currentCompany.id),
    );
    const cards = [
        ["Всего ингредиентов", stats.totalIngredients],
        ["Заканчиваются", stats.lowStock],
        ["Нет в наличии", stats.outOfStock],
        ["Стоимость склада", helpers.formatMoney ? helpers.formatMoney(stats.stockValue) : stats.stockValue.toFixed(2)],
        ["Последнее списание", formatDateLabel(stats.lastWriteOff)],
        ["Последняя инвентаризация", formatDateLabel(stats.lastInventory)],
    ];

    document.getElementById("inventoryStats").innerHTML = cards.map(([label, value]) => `
        <article class="metric-card">
            <span>${label}</span>
            <strong>${helpers.escapeHtml(value)}</strong>
        </article>
    `).join("");
}

function renderInventoryContent() {
    if (activeTab === "stock" || activeTab === "ingredients") {
        renderIngredientsTable();
    }

    if (activeTab === "recipes") {
        renderRecipes();
    }

    if (activeTab === "movements") {
        renderMovements();
    }

    if (activeTab === "audit") {
        renderAudit();
    }

    if (activeTab === "writeoff") {
        renderWriteOff();
    }

    if (activeTab === "units") {
        renderUnits();
    }
}

function renderIngredientsTable() {
    const ingredients = getFilteredIngredients();
    if (!ingredients.length) {
        document.getElementById("inventoryContent").innerHTML = `
            <div class="empty-state empty-state--action">
                <span class="empty-state__icon">📦</span>
                <h3>Ингредиентов пока нет</h3>
                <p>Добавьте основные продукты склада, чтобы отслеживать остатки, списания и себестоимость.</p>
                <button class="primary-btn" id="createFirstIngredientButton" type="button">Добавить первый ингредиент</button>
            </div>
        `;
        document.getElementById("createFirstIngredientButton").addEventListener("click", openIngredientModal);
        return;
    }

    document.getElementById("inventoryContent").innerHTML = `
        <div class="inventory-table-wrap">
            <table class="inventory-table">
                <thead>
                    <tr>
                        <th>Ингредиент</th>
                        <th>Категория</th>
                        <th>Остаток</th>
                        <th>Мин.</th>
                        <th>Себестоимость</th>
                        <th>Стоимость</th>
                        <th>Статус</th>
                        <th>Действия</th>
                    </tr>
                </thead>
                <tbody>
                    ${ingredients.map(renderIngredientRow).join("")}
                </tbody>
            </table>
        </div>
    `;

    document.querySelectorAll("[data-inventory-action]").forEach((button) => {
        button.addEventListener("click", () => handleIngredientAction(button.dataset.inventoryAction, button.dataset.ingredientId));
    });
}

function renderIngredientRow(ingredient) {
    const status = getStockStatus(ingredient);
    const labels = { ok: "🟢 В наличии", low: "🟡 Заканчивается", out: "🔴 Нет в наличии" };
    return `
        <tr>
            <td><strong>${helpers.escapeHtml(ingredient.name)}</strong><br><small>${helpers.escapeHtml(ingredient.sku)}</small></td>
            <td>${helpers.escapeHtml(ingredient.category)}</td>
            <td>${formatInventoryQuantity(ingredient.quantity, ingredient.unit)}</td>
            <td>${formatInventoryQuantity(ingredient.minQuantity, ingredient.unit)}</td>
            <td>${ingredient.costPrice}</td>
            <td>${(ingredient.quantity * ingredient.costPrice).toFixed(2)}</td>
            <td><span class="stock-badge stock-badge--${status}">${labels[status]}</span></td>
            <td>
                <button type="button" data-inventory-action="income" data-ingredient-id="${ingredient.id}">Приход</button>
                <button type="button" data-inventory-action="writeoff" data-ingredient-id="${ingredient.id}">Списание</button>
                <button type="button" data-inventory-action="audit" data-ingredient-id="${ingredient.id}">Инвентаризация</button>
            </td>
        </tr>
    `;
}

function renderRecipes() {
    const recipes = loadRecipes(currentCompany.id);
    const products = loadProducts(currentCompany.id);
    const ingredients = loadIngredients(currentCompany.id);
    document.getElementById("inventoryContent").innerHTML = `
        <button class="primary-btn" id="createRecipeButton" type="button">Создать рецептуру</button>
        <div class="recipe-grid">
            ${recipes.map((recipe) => {
                const product = products.find((item) => Number(item.id) === Number(recipe.productId));
                return `
                    <article class="recipe-card">
                        <h3>${helpers.escapeHtml(product?.name || "Товар удален")}</h3>
                        ${recipe.ingredients.map((item) => {
                            const ingredient = ingredients.find((entry) => Number(entry.id) === Number(item.ingredientId));
                            return `<p>${helpers.escapeHtml(ingredient?.name || "Ингредиент")} — ${formatInventoryQuantity(item.quantity, item.unit)}</p>`;
                        }).join("")}
                    </article>
                `;
            }).join("") || "<p>Рецептур пока нет.</p>"}
        </div>
    `;
    document.getElementById("createRecipeButton").addEventListener("click", openRecipeModal);
}

function renderMovements() {
    const ingredients = loadIngredients(currentCompany.id);
    const movements = loadStockMovements(currentCompany.id);
    document.getElementById("inventoryContent").innerHTML = `
        <div class="inventory-table-wrap">
            <table class="inventory-table">
                <thead><tr><th>Дата</th><th>Ингредиент</th><th>Тип</th><th>Причина</th><th>Количество</th><th>Остаток</th></tr></thead>
                <tbody>
                    ${movements.map((movement) => {
                        const ingredient = ingredients.find((item) => Number(item.id) === Number(movement.ingredientId));
                        return `<tr><td>${formatDateLabel(movement.createdAt)}</td><td>${helpers.escapeHtml(ingredient?.name || "—")}</td><td>${movement.type}</td><td>${helpers.escapeHtml(movement.reason)}</td><td>${movement.quantity}</td><td>${movement.balanceAfter}</td></tr>`;
                    }).join("") || "<tr><td colspan=\"6\">Движений пока нет.</td></tr>"}
                </tbody>
            </table>
        </div>
    `;
}

function renderAudit() {
    document.getElementById("inventoryContent").innerHTML = `
        <div class="empty-state empty-state--action">
            <span class="empty-state__icon">✅</span>
            <h3>Инвентаризация начинается из таблицы остатков</h3>
            <p>Откройте вкладку «Остатки», найдите ингредиент и нажмите «Инвентаризация». Так система сразу подставит нужную позицию.</p>
            <button class="primary-btn" type="button" data-inventory-jump="stock">Перейти к остаткам</button>
        </div>
    `;
    document.querySelector("[data-inventory-jump='stock']").addEventListener("click", () => activateInventoryTab("stock"));
}

function renderWriteOff() {
    document.getElementById("inventoryContent").innerHTML = `
        <div class="empty-state empty-state--action">
            <span class="empty-state__icon">↘</span>
            <h3>Списание выполняется из остатков</h3>
            <p>Найдите ингредиент во вкладке «Остатки» и нажмите «Списание». Это снижает риск ошибиться с товаром.</p>
            <button class="primary-btn" type="button" data-inventory-jump="stock">Перейти к остаткам</button>
        </div>
    `;
    document.querySelector("[data-inventory-jump='stock']").addEventListener("click", () => activateInventoryTab("stock"));
}

function activateInventoryTab(tab) {
    activeTab = tab;
    document.querySelectorAll("[data-inventory-tab]").forEach((item) => {
        item.classList.toggle("is-active", item.dataset.inventoryTab === tab);
    });
    renderInventoryContent();
}

function renderUnits() {
    document.getElementById("inventoryContent").innerHTML = `
        <div class="units-grid">
            ${Object.entries(INVENTORY_UNITS).map(([key, unit]) => `
                <article class="unit-card"><strong>${key}</strong><span>${unit.label}</span><small>base: ${unit.base}</small></article>
            `).join("")}
        </div>
    `;
}

function openIngredientModal() {
    document.getElementById("inventoryModalTitle").textContent = "Добавить ингредиент";
    document.getElementById("inventoryModalBody").innerHTML = `
        <form class="inventory-form" id="ingredientForm">
            <input name="name" placeholder="Название" required>
            <select name="category">${INGREDIENT_CATEGORIES.map((category) => `<option>${category}</option>`).join("")}</select>
            <select name="unit">${Object.entries(INVENTORY_UNITS).map(([key, unit]) => `<option value="${key}">${unit.label}</option>`).join("")}</select>
            <input name="quantity" type="number" min="0" value="0" placeholder="Остаток">
            <input name="minQuantity" type="number" min="0" value="0" placeholder="Минимум">
            <input name="maxQuantity" type="number" min="0" value="0" placeholder="Максимум">
            <input name="costPrice" type="number" min="0" step="0.0001" value="0" placeholder="Себестоимость">
            <button class="primary-btn" type="submit">Сохранить</button>
        </form>
    `;
    document.getElementById("inventoryModal").hidden = false;
    document.getElementById("ingredientForm").addEventListener("submit", (event) => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(event.currentTarget).entries());
        createIngredient(currentCompany.id, { ...data, userId: currentUser.id });
        closeInventoryModal();
        renderInventory();
        helpers.showToast("Ингредиент создан");
    });
}

function openRecipeModal() {
    const products = loadProducts(currentCompany.id);
    const ingredients = loadIngredients(currentCompany.id);
    document.getElementById("inventoryModalTitle").textContent = "Создать рецептуру";
    document.getElementById("inventoryModalBody").innerHTML = `
        <form class="inventory-form" id="recipeForm">
            <select name="productId">${products.map((product) => `<option value="${product.id}">${helpers.escapeHtml(product.name)}</option>`).join("")}</select>
            <select name="ingredientId">${ingredients.map((ingredient) => `<option value="${ingredient.id}">${helpers.escapeHtml(ingredient.name)}</option>`).join("")}</select>
            <input name="quantity" type="number" min="0" step="0.01" value="0" placeholder="Количество">
            <select name="unit">${Object.entries(INVENTORY_UNITS).map(([key, unit]) => `<option value="${key}">${unit.label}</option>`).join("")}</select>
            <button class="primary-btn" type="submit">Создать</button>
        </form>
    `;
    document.getElementById("inventoryModal").hidden = false;
    document.getElementById("recipeForm").addEventListener("submit", (event) => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(event.currentTarget).entries());
        createRecipe(currentCompany.id, data.productId, [{ ingredientId: Number(data.ingredientId), quantity: Number(data.quantity), unit: data.unit }]);
        closeInventoryModal();
        renderInventoryContent();
        helpers.showToast("Рецептура создана");
    });
}

function handleIngredientAction(action, ingredientId) {
    if (action === "income") {
        const quantity = Number(window.prompt("Количество прихода", "0") || 0);
        addStock(ingredientId, quantity, "Приход", currentUser.id);
    }

    if (action === "writeoff") {
        const quantity = Number(window.prompt("Количество списания", "0") || 0);
        const reason = window.prompt("Причина", "Другое") || "Другое";
        writeOffStock(ingredientId, quantity, reason, currentUser.id);
    }

    if (action === "audit") {
        const actual = Number(window.prompt("Фактическое количество", "0") || 0);
        performInventory(currentCompany.id, ingredientId, actual, currentUser.id);
    }

    renderInventory();
}

function closeInventoryModal() {
    document.getElementById("inventoryModal").hidden = true;
}

function formatDateLabel(value) {
    if (!value || value === "—") return "—";
    return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}
