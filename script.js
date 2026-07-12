"use strict";

const STORAGE_KEY = "levelUpState";
const STATE_VERSION = 1;
const XP_PER_LEVEL = 100;

const elements = {
  welcomePanel: document.querySelector("#welcome-panel"),
  nameForm: document.querySelector("#name-form"),
  nameInput: document.querySelector("#name-input"),
  nameError: document.querySelector("#name-error"),
  mainInterface: document.querySelector("#main-interface"),
  settingsButton: document.querySelector("#settings-button"),
  settingsPanel: document.querySelector("#settings-panel"),
  profileName: document.querySelector("#profile-name"),
  profileLevel: document.querySelector("#profile-level"),
  profileTotalXp: document.querySelector("#profile-total-xp"),
  profileXpToNext: document.querySelector("#profile-xp-to-next"),
  profileProgressText: document.querySelector("#profile-progress-text"),
  profileProgress: document.querySelector("#profile-progress"),
};

let appState = createInitialState();

function createInitialState(name = "") {
  return {
    version: STATE_VERSION,
    profile: {
      name,
      totalXp: 0,
      level: 1,
    },
    additionalSubjects: [],
    tasks: [],
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isValidStoredState(value) {
  if (!isPlainObject(value) || value.version !== STATE_VERSION) {
    return false;
  }

  const { profile, additionalSubjects, tasks } = value;

  if (!isPlainObject(profile)) {
    return false;
  }

  const hasValidName =
    typeof profile.name === "string" && profile.name.trim().length > 0;
  const hasValidTotalXp =
    Number.isFinite(profile.totalXp) && profile.totalXp >= 0;
  const hasValidLevel = Number.isInteger(profile.level) && profile.level >= 1;
  const hasValidSubjects =
    Array.isArray(additionalSubjects) &&
    additionalSubjects.every((subject) => typeof subject === "string");
  const hasValidTasks = Array.isArray(tasks);

  return (
    hasValidName &&
    hasValidTotalXp &&
    hasValidLevel &&
    hasValidSubjects &&
    hasValidTasks
  );
}

function clearStoredState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error("Не удалось очистить повреждённое состояние.", error);
  }
}

function loadState() {
  let rawState;

  try {
    rawState = localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    console.error("Не удалось прочитать сохранённое состояние.", error);
    return createInitialState();
  }

  if (rawState === null) {
    return createInitialState();
  }

  try {
    const parsedState = JSON.parse(rawState);

    if (!isValidStoredState(parsedState)) {
      clearStoredState();
      return createInitialState();
    }

    parsedState.profile.name = parsedState.profile.name.trim();
    return parsedState;
  } catch (error) {
    clearStoredState();
    return createInitialState();
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (error) {
    console.error("Не удалось сохранить состояние.", error);
    return false;
  }
}

function getProfileProgress(profile) {
  const xpInsideLevel = profile.totalXp % XP_PER_LEVEL;

  return {
    xpInsideLevel,
    xpToNextLevel: XP_PER_LEVEL - xpInsideLevel,
  };
}

function showNameError(message) {
  elements.nameError.textContent = message;
  elements.nameError.hidden = false;
  elements.nameInput.setAttribute("aria-invalid", "true");
}

function clearNameError() {
  elements.nameError.textContent = "";
  elements.nameError.hidden = true;
  elements.nameInput.removeAttribute("aria-invalid");
}

function setSettingsPanelOpen(isOpen) {
  elements.settingsPanel.hidden = !isOpen;
  elements.settingsButton.setAttribute("aria-expanded", String(isOpen));
  elements.settingsButton.setAttribute(
    "aria-label",
    isOpen ? "Закрыть настройки" : "Открыть настройки",
  );
}

function toggleSettingsPanel() {
  const isOpen = elements.settingsButton.getAttribute("aria-expanded") === "true";
  setSettingsPanelOpen(!isOpen);
}

function handleDocumentKeydown(event) {
  if (event.key !== "Escape" || elements.settingsPanel.hidden) {
    return;
  }

  setSettingsPanelOpen(false);
  elements.settingsButton.focus();
}

function showWelcome() {
  elements.welcomePanel.hidden = false;
  elements.mainInterface.hidden = true;
  elements.settingsButton.hidden = true;
  setSettingsPanelOpen(false);
}

function showMainInterface() {
  elements.welcomePanel.hidden = true;
  elements.mainInterface.hidden = false;
  elements.settingsButton.hidden = false;
}

function renderProfile() {
  const { profile } = appState;
  const { xpInsideLevel, xpToNextLevel } = getProfileProgress(profile);

  elements.profileName.textContent = profile.name;
  elements.profileLevel.textContent = String(profile.level);
  elements.profileTotalXp.textContent = String(profile.totalXp);
  elements.profileXpToNext.textContent = String(xpToNextLevel);
  elements.profileProgressText.textContent = `${xpInsideLevel} из 100 XP`;
  elements.profileProgress.value = xpInsideLevel;
  elements.profileProgress.textContent = `${xpInsideLevel}%`;
}

function handleNameSubmit(event) {
  event.preventDefault();

  const normalizedName = elements.nameInput.value.trim();

  if (normalizedName.length === 0) {
    showNameError("Введите имя или никнейм");
    elements.nameInput.focus();
    return;
  }

  const nextState = createInitialState(normalizedName);

  if (!saveState(nextState)) {
    showNameError("Не удалось сохранить имя. Проверьте настройки браузера.");
    return;
  }

  appState = nextState;
  clearNameError();
  renderProfile();
  showMainInterface();
}

function initializeApp() {
  appState = loadState();
  elements.nameForm.addEventListener("submit", handleNameSubmit);
  elements.nameInput.addEventListener("input", clearNameError);
  elements.settingsButton.addEventListener("click", toggleSettingsPanel);
  document.addEventListener("keydown", handleDocumentKeydown);

  if (appState.profile.name) {
    renderProfile();
    showMainInterface();
    return;
  }

  showWelcome();
}

initializeApp();
