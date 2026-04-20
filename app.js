// ===== GAME GLITZ — app.js =====

// =====================
// DATA
// =====================

const GAMES = [
  {
    id: 1,
    title: "Stellar Odyssey: Reborn",
    platform: "PS5 / Xbox",
    genre: "action",
    price: 59.99,
    originalPrice: null,
    rating: 4.9,
    reviews: 2841,
    badge: "new",
    emoji: "🌌",
    bgGradient: "linear-gradient(135deg, #1a1a2e, #16213e)",
    featured: true,
    isNew: true,
  },
  {
    id: 2,
    title: "Dragon's Wrath IV",
    platform: "PC / PS5",
    genre: "rpg",
    price: 49.99,
    originalPrice: 69.99,
    rating: 4.7,
    reviews: 5210,
    badge: "sale",
    emoji: "⚔️",
    bgGradient: "linear-gradient(135deg, #0d2a1a, #1a0d2e)",
    featured: true,
    isNew: false,
  },
  {
    id: 3,
    title: "Turbo Rush 2025",
    platform: "All Platforms",
    genre: "racing",
    price: 39.99,
    originalPrice: null,
    rating: 4.5,
    reviews: 1340,
    badge: "hot",
    emoji: "🏎️",
    bgGradient: "linear-gradient(135deg, #1a0a0a, #2e1a0d)",
    featured: true,
    isNew: true,
  },
  {
    id: 4,
    title: "Shadow Protocol",
    platform: "PC / Xbox",
    genre: "shooter",
    price: 44.99,
    originalPrice: 59.99,
    rating: 4.6,
    reviews: 3890,
    badge: "sale",
    emoji: "🎯",
    bgGradient: "linear-gradient(135deg, #0a1a0a, #1a2e0d)",
    featured: true,
    isNew: false,
  },
  {
    id: 5,
    title: "Kingdom Eternal",
    platform: "PC",
    genre: "strategy",
    price: 34.99,
    originalPrice: null,
    rating: 4.4,
    reviews: 920,
    badge: "new",
    emoji: "🏰",
    bgGradient: "linear-gradient(135deg, #2e1a0d, #1a0d0a)",
    featured: true,
    isNew: true,
  },
  {
    id: 6,
    title: "Neon Fighter Zero",
    platform: "Switch / PS5",
    genre: "action",
    price: 29.99,
    originalPrice: 49.99,
    rating: 4.3,
    reviews: 4120,
    badge: "sale",
    emoji: "👊",
    bgGradient: "linear-gradient(135deg, #1a0a2e, #2e0a1a)",
    featured: false,
    isNew: false,
  },
  {
    id: 7,
    title: "FIFA Galaxy Edition",
    platform: "All Platforms",
    genre: "sports",
    price: 54.99,
    originalPrice: null,
    rating: 4.2,
    reviews: 8750,
    badge: null,
    emoji: "⚽",
    bgGradient: "linear-gradient(135deg, #0a200a, #0a0a20)",
    featured: false,
    isNew: true,
  },
  {
    id: 8,
    title: "Mystic Realm Online",
    platform: "PC",
    genre: "rpg",
    price: 0,
    originalPrice: null,
    rating: 4.1,
    reviews: 15420,
    badge: null,
    emoji: "🧙",
    bgGradient: "linear-gradient(135deg, #0a1030, #1a0a30)",
    featured: false,
    isNew: true,
  },
  {
    id: 9,
    title: "Galactic Warfare 6",
    platform: "PS5 / Xbox",
    genre: "shooter",
    price: 64.99,
    originalPrice: null,
    rating: 4.8,
    reviews: 11200,
    badge: "preorder",
    emoji: "🚀",
    bgGradient: "linear-gradient(135deg, #050518, #0a0a25)",
    featured: false,
    isNew: true,
  },
  {
    id: 10,
    title: "Pixel Dungeon Heroes",
    platform: "Switch / PC",
    genre: "rpg",
    price: 19.99,
    originalPrice: 39.99,
    rating: 4.5,
    reviews: 6780,
    badge: "sale",
    emoji: "🗡️",
    bgGradient: "linear-gradient(135deg, #200a20, #0a0a20)",
    featured: false,
    isNew: false,
  },
  {
    id: 11,
    title: "Motocross Xtreme",
    platform: "PS5 / Xbox",
    genre: "racing",
    price: 44.99,
    originalPrice: null,
    rating: 4.3,
    reviews: 2100,
    badge: null,
    emoji: "🏍️",
    bgGradient: "linear-gradient(135deg, #201000, #100a00)",
    featured: false,
    isNew: false,
  },
  {
    id: 12,
    title: "Zombie Siege: Last Stand",
    platform: "All Platforms",
    genre: "action",
    price: 24.99,
    originalPrice: 49.99,
    rating: 4.0,
    reviews: 3410,
    badge: "sale",
    emoji: "🧟",
    bgGradient: "linear-gradient(135deg, #100500, #0a1000)",
    featured: false,
    isNew: false,
  },
];

const BADGES = {
  new: { label: "New", class: "badge-new" },
  sale: { label: "Sale", class: "badge-sale" },
  hot: { label: "Hot", class: "badge-hot" },
  preorder: { label: "Pre-Order", class: "badge-preorder" },
};

// =====================
// CART STATE
// =====================

let cart = JSON.parse(localStorage.getItem("gg_cart") || "[]");

function saveCart() {
  localStorage.setItem("gg_cart", JSON.stringify(cart));
}

function getCartTotal() {
  return cart.reduce((sum, item) => sum + item.price * item.qty, 0);
}

function getCartItemCount() {
  return cart.reduce((sum, item) => sum + item.qty, 0);
}

function addToCart(gameId) {
  const game = GAMES.find((g) => g.id === gameId);
  if (!game) return;

  const existing = cart.find((i) => i.id === gameId);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({ id: game.id, title: game.title, platform: game.platform, price: game.price, emoji: game.emoji, qty: 1 });
  }
  saveCart();
  updateCartUI();
  showToast(`✅ "${game.title}" added to cart!`, "success");
}

function removeFromCart(gameId) {
  cart = cart.filter((i) => i.id !== gameId);
  saveCart();
  updateCartUI();
  renderCartSidebar();
}

function updateQty(gameId, delta) {
  const item = cart.find((i) => i.id === gameId);
  if (!item) return;
  item.qty = Math.max(1, item.qty + delta);
  saveCart();
  updateCartUI();
  renderCartSidebar();
}

function clearCart() {
  cart = [];
  saveCart();
  updateCartUI();
  renderCartSidebar();
}

// =====================
// CART UI
// =====================

function updateCartUI() {
  const count = getCartItemCount();
  document.querySelectorAll("#cartCount").forEach((el) => {
    el.textContent = count;
    el.classList.toggle("visible", count > 0);
  });
}

function renderCartSidebar() {
  const list = document.getElementById("cartItemsList");
  const footer = document.getElementById("cartFooter");
  if (!list) return;

  if (cart.length === 0) {
    list.innerHTML = `
      <div class="cart-empty">
        <div class="cart-empty-icon">🛒</div>
        <p style="font-size:1rem; font-weight:600;">Your cart is empty</p>
        <p style="font-size:0.85rem;">Start shopping to fill it up!</p>
        <a href="products.html" class="btn btn-primary btn-sm" onclick="closeCart()">Browse Games</a>
      </div>`;
    if (footer) footer.style.display = "none";
    return;
  }

  list.innerHTML = cart
    .map(
      (item) => `
      <div class="cart-item">
        <div class="cart-item-img">${item.emoji}</div>
        <div class="cart-item-info">
          <div class="cart-item-title">${escHtml(item.title)}</div>
          <div class="cart-item-platform">${escHtml(item.platform)}</div>
          <div class="cart-item-controls">
            <button class="qty-btn" onclick="updateQty(${item.id}, -1)">−</button>
            <span class="qty-value">${item.qty}</span>
            <button class="qty-btn" onclick="updateQty(${item.id}, 1)">+</button>
          </div>
        </div>
        <div class="cart-item-price">
          ${item.price === 0 ? '<span style="color:var(--success)">Free</span>' : `<span>$${(item.price * item.qty).toFixed(2)}</span>`}
          <button class="remove-item-btn" onclick="removeFromCart(${item.id})">✕ Remove</button>
        </div>
      </div>`
    )
    .join("");

  const subtotal = getCartTotal();
  const subtotalEl = document.getElementById("cartSubtotal");
  const totalEl = document.getElementById("cartTotal");
  if (subtotalEl) subtotalEl.textContent = `$${subtotal.toFixed(2)}`;
  if (totalEl) totalEl.textContent = `$${subtotal.toFixed(2)}`;

  const countEl = document.getElementById("cartItemCount");
  if (countEl) countEl.textContent = `(${getCartItemCount()} item${getCartItemCount() !== 1 ? "s" : ""})`;

  if (footer) footer.style.display = "block";
}

function openCart() {
  document.getElementById("cartSidebar")?.classList.add("open");
  document.getElementById("cartOverlay")?.classList.add("open");
  document.body.style.overflow = "hidden";
  renderCartSidebar();
}

function closeCart() {
  document.getElementById("cartSidebar")?.classList.remove("open");
  document.getElementById("cartOverlay")?.classList.remove("open");
  document.body.style.overflow = "";
}

// =====================
// PRODUCT RENDERING
// =====================

function getFeaturedGames() {
  return GAMES.filter((g) => g.featured).slice(0, 4);
}

function getNewReleases() {
  return GAMES.filter((g) => g.isNew).slice(0, 4);
}

function renderProductCard(game) {
  const badgeHtml = game.badge
    ? `<span class="badge ${BADGES[game.badge].class}">${BADGES[game.badge].label}</span>`
    : "";

  const priceHtml =
    game.price === 0
      ? `<span class="price-free">Free</span>`
      : `<div class="price-wrap">
          <span class="price-current">$${game.price.toFixed(2)}</span>
          ${game.originalPrice ? `<span class="price-original">$${game.originalPrice.toFixed(2)}</span>` : ""}
        </div>`;

  const stars = "★".repeat(Math.round(game.rating)) + "☆".repeat(5 - Math.round(game.rating));

  return `
    <div class="product-card" data-id="${game.id}" data-genre="${game.genre}">
      <div class="product-image-wrap">
        <div class="product-placeholder" style="background: ${game.bgGradient};">${game.emoji}</div>
        <div class="product-badges">${badgeHtml}</div>
        <div class="product-actions-overlay">
          <button class="btn btn-primary btn-sm" style="flex:1" onclick="addToCart(${game.id})">🛒 Add to Cart</button>
          <button class="wishlist-btn" onclick="toggleWishlist(this, ${game.id})" title="Add to Wishlist">♡</button>
        </div>
      </div>
      <div class="product-body">
        <div class="product-platform">${escHtml(game.platform)}</div>
        <div class="product-title">${escHtml(game.title)}</div>
        <div class="product-rating">
          <span class="stars">${stars}</span>
          <span class="rating-num">${game.rating} (${game.reviews.toLocaleString()})</span>
        </div>
        <div class="product-footer">
          ${priceHtml}
          <button class="add-to-cart-btn" onclick="addToCart(${game.id})">
            🛒 <span>${game.price === 0 ? "Get Free" : "Add"}</span>
          </button>
        </div>
      </div>
    </div>`;
}

function renderProducts(games, container) {
  if (!container) return;
  if (games.length === 0) {
    container.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 60px 0; color: var(--text-muted);">
      <div style="font-size:3rem; margin-bottom:12px;">🔍</div>
      <p style="font-size:1rem;">No games found. Try adjusting your filters.</p>
    </div>`;
    return;
  }
  container.innerHTML = games.map(renderProductCard).join("");
}

function toggleWishlist(btn, gameId) {
  btn.classList.toggle("active");
  btn.textContent = btn.classList.contains("active") ? "♥" : "♡";
  const game = GAMES.find((g) => g.id === gameId);
  if (game) {
    showToast(
      btn.classList.contains("active")
        ? `❤️ "${game.title}" added to wishlist`
        : `💔 "${game.title}" removed from wishlist`,
      "success"
    );
  }
}

// =====================
// PRODUCTS PAGE
// =====================

let currentFilters = {
  genre: [],
  platform: [],
  maxPrice: 100,
  search: "",
  sort: "featured",
  onSale: false,
};

function applyFilters() {
  let results = [...GAMES];

  if (currentFilters.onSale) {
    results = results.filter((g) => g.badge === "sale" || g.originalPrice);
  }
  if (currentFilters.genre.length > 0) {
    results = results.filter((g) => currentFilters.genre.includes(g.genre));
  }
  if (currentFilters.platform.length > 0) {
    results = results.filter((g) =>
      currentFilters.platform.some((p) => g.platform.toLowerCase().includes(p.toLowerCase()))
    );
  }
  if (currentFilters.search) {
    const q = currentFilters.search.toLowerCase();
    results = results.filter(
      (g) =>
        g.title.toLowerCase().includes(q) ||
        g.genre.toLowerCase().includes(q) ||
        g.platform.toLowerCase().includes(q)
    );
  }
  results = results.filter((g) => g.price <= currentFilters.maxPrice || g.price === 0);

  switch (currentFilters.sort) {
    case "price-asc":
      results.sort((a, b) => a.price - b.price);
      break;
    case "price-desc":
      results.sort((a, b) => b.price - a.price);
      break;
    case "rating":
      results.sort((a, b) => b.rating - a.rating);
      break;
    case "new":
      results.sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0));
      break;
    default:
      results.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
  }

  return results;
}

function initProductsPage() {
  const grid = document.getElementById("productsGrid");
  const countEl = document.getElementById("resultsCount");
  if (!grid) return;

  const params = new URLSearchParams(window.location.search);
  if (params.get("category")) currentFilters.genre = [params.get("category")];
  if (params.get("sale") === "true") currentFilters.onSale = true;
  if (params.get("sort")) currentFilters.sort = params.get("sort");
  if (params.get("search")) currentFilters.search = params.get("search");
  if (params.get("platform")) currentFilters.platform = [params.get("platform")];

  function refresh() {
    const results = applyFilters();
    renderProducts(results, grid);
    if (countEl) countEl.textContent = `${results.length} game${results.length !== 1 ? "s" : ""} found`;

    // Sync filter checkboxes
    document.querySelectorAll(".filter-option[data-genre]").forEach((el) => {
      el.classList.toggle("checked", currentFilters.genre.includes(el.dataset.genre));
    });
    document.querySelectorAll(".filter-option[data-platform]").forEach((el) => {
      el.classList.toggle("checked", currentFilters.platform.includes(el.dataset.platform));
    });
  }

  // Genre filters
  document.querySelectorAll(".filter-option[data-genre]").forEach((el) => {
    el.addEventListener("click", () => {
      const g = el.dataset.genre;
      const idx = currentFilters.genre.indexOf(g);
      if (idx === -1) currentFilters.genre.push(g);
      else currentFilters.genre.splice(idx, 1);
      refresh();
    });
  });

  // Platform filters
  document.querySelectorAll(".filter-option[data-platform]").forEach((el) => {
    el.addEventListener("click", () => {
      const p = el.dataset.platform;
      const idx = currentFilters.platform.indexOf(p);
      if (idx === -1) currentFilters.platform.push(p);
      else currentFilters.platform.splice(idx, 1);
      refresh();
    });
  });

  // Price range
  const priceSlider = document.getElementById("priceSlider");
  const priceLabel = document.getElementById("priceLabel");
  if (priceSlider) {
    priceSlider.addEventListener("input", () => {
      currentFilters.maxPrice = Number(priceSlider.value);
      if (priceLabel) priceLabel.textContent = `$${priceSlider.value}`;
      refresh();
    });
  }

  // Sort
  const sortSelect = document.getElementById("sortSelect");
  if (sortSelect) {
    sortSelect.value = currentFilters.sort;
    sortSelect.addEventListener("change", () => {
      currentFilters.sort = sortSelect.value;
      refresh();
    });
  }

  // Search
  const searchInput = document.getElementById("pageSearch");
  if (searchInput) {
    searchInput.value = currentFilters.search;
    searchInput.addEventListener("input", () => {
      currentFilters.search = searchInput.value;
      refresh();
    });
  }

  // Clear filters
  const clearBtn = document.getElementById("clearFilters");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      currentFilters = { genre: [], platform: [], maxPrice: 100, search: "", sort: "featured", onSale: false };
      if (priceSlider) { priceSlider.value = 100; if (priceLabel) priceLabel.textContent = "$100"; }
      if (sortSelect) sortSelect.value = "featured";
      if (searchInput) searchInput.value = "";
      refresh();
    });
  }

  refresh();
}

// =====================
// CART PAGE
// =====================

function initCartPage() {
  const container = document.getElementById("cartPageItems");
  if (!container) return;
  renderCartPage();
}

function renderCartPage() {
  const container = document.getElementById("cartPageItems");
  const emptyMsg = document.getElementById("cartPageEmpty");
  const orderCard = document.getElementById("orderSummary");
  if (!container) return;

  if (cart.length === 0) {
    container.innerHTML = "";
    if (emptyMsg) emptyMsg.style.display = "block";
    if (orderCard) orderCard.style.display = "none";
    return;
  }
  if (emptyMsg) emptyMsg.style.display = "none";
  if (orderCard) orderCard.style.display = "block";

  container.innerHTML = cart
    .map(
      (item) => `
      <div class="cart-page-item">
        <div class="cart-page-img">${item.emoji}</div>
        <div class="cart-page-info">
          <h4>${escHtml(item.title)}</h4>
          <span>${escHtml(item.platform)}</span>
        </div>
        <div class="cart-page-qty">
          <button class="qty-btn" onclick="updateQtyPage(${item.id}, -1)">−</button>
          <span class="qty-value">${item.qty}</span>
          <button class="qty-btn" onclick="updateQtyPage(${item.id}, 1)">+</button>
        </div>
        <div class="cart-page-price" style="display:flex; flex-direction:column; align-items:flex-end; gap:6px;">
          <span>${item.price === 0 ? '<span style="color:var(--success)">Free</span>' : `$${(item.price * item.qty).toFixed(2)}`}</span>
          <button class="remove-item-btn" onclick="removeFromCartPage(${item.id})">✕ Remove</button>
        </div>
      </div>`
    )
    .join("");

  updateOrderSummary();
}

function updateQtyPage(id, delta) {
  updateQty(id, delta);
  renderCartPage();
}

function removeFromCartPage(id) {
  removeFromCart(id);
  renderCartPage();
}

function clearCartPage() {
  if (confirm("Clear your entire cart?")) {
    clearCart();
    renderCartPage();
  }
}

function updateOrderSummary() {
  const subtotal = getCartTotal();
  const tax = subtotal * 0.08;
  const total = subtotal + tax;
  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setEl("summarySubtotal", `$${subtotal.toFixed(2)}`);
  setEl("summaryTax", `$${tax.toFixed(2)}`);
  setEl("summaryShipping", "Free");
  setEl("summaryTotal", `$${total.toFixed(2)}`);
  const countEl = document.getElementById("cartPageCount");
  if (countEl) countEl.textContent = `${getCartItemCount()} item${getCartItemCount() !== 1 ? "s" : ""}`;
}

function applyCoupon() {
  const input = document.getElementById("couponInput");
  if (!input) return;
  const code = input.value.trim().toUpperCase();
  const codes = { GLITZ10: 10, GAMER20: 20, SAVE15: 15 };
  if (codes[code]) {
    showToast(`🎉 Coupon applied! ${codes[code]}% discount`, "success");
  } else {
    showToast("❌ Invalid coupon code", "error");
  }
}

// =====================
// TOAST
// =====================

function showToast(msg, type = "success") {
  const container = document.getElementById("toastContainer");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${type === "success" ? "✅" : "❌"}</span><span class="toast-msg">${escHtml(msg)}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// =====================
// COUNTDOWN TIMER
// =====================

function startCountdown(seconds) {
  let remaining = seconds;
  const tick = () => {
    const h = Math.floor(remaining / 3600);
    const m = Math.floor((remaining % 3600) / 60);
    const s = remaining % 60;
    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = String(val).padStart(2, "0"); };
    setEl("cd-hours", h);
    setEl("cd-minutes", m);
    setEl("cd-seconds", s);
    if (remaining > 0) { remaining--; setTimeout(tick, 1000); }
  };
  tick();
}

// =====================
// NEWSLETTER
// =====================

function handleNewsletter(e) {
  e.preventDefault();
  const input = e.target.querySelector("input");
  showToast(`📧 Thanks! You're subscribed with ${input.value}`, "success");
  input.value = "";
}

// =====================
// UTILITIES
// =====================

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// =====================
// NAVBAR INIT
// =====================

function initNavbar() {
  const cartBtn = document.getElementById("cartBtn");
  if (cartBtn) cartBtn.addEventListener("click", openCart);

  const hamburgerBtn = document.getElementById("hamburgerBtn");
  const mobileMenu = document.getElementById("mobileMenu");
  if (hamburgerBtn && mobileMenu) {
    hamburgerBtn.addEventListener("click", () => {
      mobileMenu.classList.toggle("open");
    });
  }

  updateCartUI();
}

// =====================
// BOOT
// =====================

document.addEventListener("DOMContentLoaded", () => {
  initNavbar();
  initProductsPage();
  initCartPage();
});
