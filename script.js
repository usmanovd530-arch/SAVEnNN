// Подсветка текущего раздела фиксированной навигации.
const navLinks = [...document.querySelectorAll(".side-nav__link")];
const navSections = navLinks
  .map((link) => document.querySelector(link.getAttribute("href")))
  .filter(Boolean);

if ("IntersectionObserver" in window) {
  const navObserver = new IntersectionObserver((entries) => {
    const visibleSections = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
    if (!visibleSections.length) return;

    navLinks.forEach((link) => {
      const active = link.getAttribute("href") === `#${visibleSections[0].target.id}`;
      link.classList.toggle("is-active", active);
      if (active) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
  }, { rootMargin: "-25% 0px -45% 0px", threshold: [0, .15, .4, .7] });

  navSections.forEach((section) => navObserver.observe(section));
}

// Плавное появление карточек при прокрутке.
const revealItems = document.querySelectorAll(".reveal");
if ("IntersectionObserver" in window) {
  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: .12 });
  revealItems.forEach((item) => revealObserver.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add("is-visible"));
}

// Звёздный курсор и лёгкий параллакс декора выключены на мобильных и reduced-motion.
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
const cursor = document.querySelector(".cursor-star");
const parallaxItems = document.querySelectorAll("[data-parallax]");

if (!reduceMotion && finePointer) {
  window.addEventListener("pointermove", (event) => {
    cursor.style.transform = `translate3d(${event.clientX + 9}px, ${event.clientY + 9}px, 0)`;
    parallaxItems.forEach((item) => {
      const strength = Number(item.dataset.parallax) || 0;
      const shiftX = (event.clientX - window.innerWidth / 2) * strength;
      const shiftY = (event.clientY - window.innerHeight / 2) * strength;
      item.style.setProperty("--shift-x", `${shiftX.toFixed(1)}px`);
      item.style.setProperty("--shift-y", `${shiftY.toFixed(1)}px`);
    });
  }, { passive: true });
}

const STEAM_ID = "76561199057153166";

function firstTagText(xml, selectors) {
  for (const selector of selectors) {
    const node = xml.querySelector(selector);
    const value = node && node.textContent.trim();
    if (value) return value;
  }
  return "";
}

function setAvatar(url, name) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !parsed.hostname.endsWith("steamstatic.com")) return;
    const image = document.createElement("img");
    image.src = parsed.href;
    image.alt = `Аватар Steam-профиля ${name}`;
    image.referrerPolicy = "no-referrer";
    image.addEventListener("error", () => {
      image.src = "https://avatars.fastly.steamstatic.com/8f1c2898a2cba3a58b4aea30e70e91304a3fdf5d_full.jpg";
    }, { once: true });
    const avatar = document.getElementById("avatar");
    const frame = avatar.querySelector(".profile-avatar__frame");
    avatar.replaceChildren(image, frame);
  } catch {
    // Сохраняем встроенную аватарку, если Steam вернул некорректный адрес.
  }
}

function renderGames(games) {
  const grid = document.getElementById("games-grid");
  grid.replaceChildren();

  games.forEach((game, index) => {
    const card = document.createElement(game.url ? "a" : "article");
    card.className = "game-card reveal is-visible";
    if (game.url) {
      card.href = game.url;
      card.target = "_blank";
      card.rel = "noopener noreferrer";
      card.setAttribute("aria-label", `Открыть Steam: ${game.name}`);
    }

    const image = document.createElement("img");
    image.className = "game-card__art";
    image.src = game.image;
    image.alt = `Обложка ${game.name}`;
    image.loading = "lazy";
    image.addEventListener("error", () => {
      image.removeAttribute("src");
      image.alt = `Обложка игры ${game.name} недоступна`;
    }, { once: true });

    const body = document.createElement("div");
    body.className = "game-card__body";
    const indexLabel = document.createElement("span");
    indexLabel.className = "game-card__index";
    indexLabel.textContent = `${String(index + 1).padStart(2, "0")} / RECENT`;

    const title = document.createElement("h3");
    title.textContent = game.name;

    const hours = document.createElement("div");
    hours.className = "game-card__hours";
    const recent = document.createElement("span");
    recent.textContent = game.recent || "—";
    const recentLabel = document.createElement("small");
    recentLabel.textContent = "2 недели";
    recent.append(recentLabel);
    const total = document.createElement("span");
    total.textContent = game.total || "—";
    const totalLabel = document.createElement("small");
    totalLabel.textContent = "всего";
    total.append(totalLabel);
    hours.append(recent, total);
    body.append(indexLabel, title, hours);
    card.append(image, body);
    grid.append(card);
  });
}

async function fetchThroughProxy(url) {
  const proxies = [
    (target) => `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`,
    (target) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(target)}`
  ];
  let lastError;

  for (const makeProxyUrl of proxies) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);
    try {
      const response = await fetch(makeProxyUrl(url), { signal: controller.signal });
      if (!response.ok) throw new Error(`Прокси вернул HTTP ${response.status}`);
      const body = await response.text();
      if (!body || /cloudflare|error 522/i.test(body.slice(0, 500))) throw new Error("Прокси временно недоступен");
      return body;
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError || new Error("Не удалось связаться с прокси");
}

async function updateSteamProfile() {
  const loadMessage = document.getElementById("load-message");

  try {
    const profileUrl = `https://steamcommunity.com/profiles/${STEAM_ID}/?xml=1`;
    const source = await fetchThroughProxy(profileUrl);
    const xml = new DOMParser().parseFromString(source, "application/xml");
    if (xml.querySelector("parsererror") || !xml.querySelector("profile")) {
      throw new Error("Steam вернул некорректный XML профиля");
    }

    const name = firstTagText(xml, ["steamID"]);
    const avatar = firstTagText(xml, ["avatarFull", "avatarMedium", "avatarIcon"]);
    const state = firstTagText(xml, ["onlineState"]).toLowerCase();
    const gameNow = firstTagText(xml, ["in-game-game-name"]);
    const summary = firstTagText(xml, ["summary"]);

    if (name) {
      const title = document.getElementById("hero-title");
      title.textContent = name;
      title.dataset.text = name;
      document.title = `${name} // Steam profile`;
      setAvatar(avatar, name);
    }
    if (summary) {
      document.getElementById("profile-summary").textContent = summary;
    }

    const status = gameNow
      ? `В игре: ${gameNow}`
      : state.includes("online")
        ? "В сети"
        : state.includes("offline")
          ? "Не в сети"
          : "";
    if (status) {
      document.getElementById("player-status").textContent = status;
      document.getElementById("status-dot").classList.toggle("is-offline", !gameNow && state.includes("offline"));
    }

    const games = Array.from(xml.querySelectorAll("mostPlayedGames mostPlayedGame"))
      .map((node) => {
        const rawUrl = firstTagText(node, ["gameLink"]);
        const appId = rawUrl.match(/\/app\/(\d+)(?:\/|$)/)?.[1];
        let safeUrl = "";
        try {
          const parsed = new URL(rawUrl);
          if (parsed.protocol === "https:" && parsed.hostname === "steamcommunity.com") safeUrl = parsed.href;
        } catch {
          // Карточка остаётся без ссылки, если Steam вернул некорректный адрес.
        }

        return {
          name: firstTagText(node, ["gameName"]),
          image: appId
            ? `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`
            : firstTagText(node, ["gameLogo", "gameLogoSmall", "gameIcon"]),
          url: safeUrl,
          recent: firstTagText(node, ["hoursPlayed"]) ? `${firstTagText(node, ["hoursPlayed"])} ч.` : "",
          total: firstTagText(node, ["hoursOnRecord"]) ? `${firstTagText(node, ["hoursOnRecord"])} ч.` : ""
        };
      })
      .filter((game) => game.name && game.image);
    if (games.length) renderGames(games);

    loadMessage.textContent = "Публичный профиль Steam обновлён.";
  } catch (error) {
    console.error("Не удалось обновить профиль Steam:", error);
    loadMessage.textContent = "Показаны сохранённые данные профиля; обновление Steam временно недоступно.";
  }

  try {
    const badgesUrl = `https://steamcommunity.com/profiles/${STEAM_ID}/badges/`;
    const badgeHtml = await fetchThroughProxy(badgesUrl);
    const badgeDocument = new DOMParser().parseFromString(badgeHtml, "text/html");
    const level = badgeDocument.querySelector(".friendPlayerLevelNum")?.textContent.trim();
    if (/^\d+$/.test(level || "")) {
      document.getElementById("hero-level").textContent = level;
      document.getElementById("level-value").textContent = level;
    }
  } catch (error) {
    console.error("Не удалось обновить уровень Steam:", error);
  }
}

document.getElementById("current-year").textContent = String(new Date().getFullYear());
updateSteamProfile();
