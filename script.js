"use strict";

const STORAGE_KEY = "levelUpState";
const STATE_VERSION = 1;
const XP_PER_LEVEL = 100;
const DEFAULT_SUBJECTS = Object.freeze(["Русский язык", "Математика"]);
const DIRECTIONS = Object.freeze([
  "Школа",
  "ЕГЭ",
  "Олимпиада",
  "Курс",
  "Поступление",
  "Личные дела",
]);
const REQUIRED_SUBJECT_DIRECTIONS = new Set([
  "Школа",
  "ЕГЭ",
  "Олимпиада",
  "Курс",
]);
const DIFFICULTY_REWARDS = Object.freeze({
  easy: 5,
  medium: 20,
  hard: 50,
});

const elements = {
  welcomePanel: document.querySelector("#welcome-panel"),
  nameForm: document.querySelector("#name-form"),
  nameInput: document.querySelector("#name-input"),
  nameError: document.querySelector("#name-error"),
  mainInterface: document.querySelector("#main-interface"),
  settingsButton: document.querySelector("#settings-button"),
  settingsPanel: document.querySelector("#settings-panel"),
  subjectForm: document.querySelector("#subject-form"),
  subjectNameInput: document.querySelector("#subject-name-input"),
  subjectNameError: document.querySelector("#subject-name-error"),
  subjectsList: document.querySelector("#subjects-list"),
  taskForm: document.querySelector("#task-form"),
  taskTitleInput: document.querySelector("#task-title-input"),
  taskTitleError: document.querySelector("#task-title-error"),
  taskDirectionSelect: document.querySelector("#task-direction-select"),
  taskDirectionError: document.querySelector("#task-direction-error"),
  taskSubjectSelect: document.querySelector("#task-subject-select"),
  taskSubjectError: document.querySelector("#task-subject-error"),
  subjectRequiredMarker: document.querySelector("#subject-required-marker"),
  taskDifficultySelect: document.querySelector("#task-difficulty-select"),
  taskDifficultyError: document.querySelector("#task-difficulty-error"),
  xpPreview: document.querySelector("#xp-preview"),
  taskDeadlineInput: document.querySelector("#task-deadline-input"),
  taskDeadlineError: document.querySelector("#task-deadline-error"),
  taskFormStatus: document.querySelector("#task-form-status"),
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

function normalizeForComparison(value) {
  return value.trim().toLocaleLowerCase("ru-RU");
}

function getAllSubjects(additionalSubjects = appState.additionalSubjects) {
  return [...DEFAULT_SUBJECTS, ...additionalSubjects];
}

function isValidCalendarDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return false;
  }

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(0);

  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function hasValidAdditionalSubjects(additionalSubjects) {
  if (!Array.isArray(additionalSubjects)) {
    return false;
  }

  const normalizedNames = new Set(DEFAULT_SUBJECTS.map(normalizeForComparison));

  return additionalSubjects.every((subject) => {
    if (typeof subject !== "string" || subject.trim().length === 0) {
      return false;
    }

    const normalizedSubject = normalizeForComparison(subject);

    if (normalizedNames.has(normalizedSubject)) {
      return false;
    }

    normalizedNames.add(normalizedSubject);
    return true;
  });
}

function isValidTask(task, availableSubjects) {
  if (!isPlainObject(task)) {
    return false;
  }

  const isKnownSubject =
    typeof task.subject === "string" && availableSubjects.includes(task.subject);
  const subjectIsValid = REQUIRED_SUBJECT_DIRECTIONS.has(task.direction)
    ? isKnownSubject
    : task.subject === null || isKnownSubject;
  const difficultyIsValid = Object.hasOwn(
    DIFFICULTY_REWARDS,
    task.difficulty,
  );
  const statusIsValid = task.status === "active" || task.status === "completed";
  const awardedStateIsValid =
    (task.status === "active" && task.xpAwarded === false) ||
    (task.status === "completed" && task.xpAwarded === true);

  return (
    typeof task.id === "string" &&
    task.id.length > 0 &&
    typeof task.title === "string" &&
    task.title.trim().length > 0 &&
    DIRECTIONS.includes(task.direction) &&
    subjectIsValid &&
    difficultyIsValid &&
    task.xpReward === DIFFICULTY_REWARDS[task.difficulty] &&
    statusIsValid &&
    isValidCalendarDate(task.originalDeadline) &&
    isValidCalendarDate(task.currentDeadline) &&
    Number.isInteger(task.postponementCount) &&
    task.postponementCount >= 0 &&
    awardedStateIsValid &&
    typeof task.createdAt === "string" &&
    !Number.isNaN(Date.parse(task.createdAt))
  );
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
  const hasValidSubjects = hasValidAdditionalSubjects(additionalSubjects);
  const availableSubjects = hasValidSubjects
    ? getAllSubjects(additionalSubjects)
    : [];
  const hasValidTasks =
    Array.isArray(tasks) &&
    tasks.every((task) => isValidTask(task, availableSubjects)) &&
    new Set(tasks.map((task) => task.id)).size === tasks.length;

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

function showFieldError(field, errorElement, message) {
  errorElement.textContent = message;
  errorElement.hidden = false;
  field.setAttribute("aria-invalid", "true");
}

function clearFieldError(field, errorElement) {
  errorElement.textContent = "";
  errorElement.hidden = true;
  field.removeAttribute("aria-invalid");
}

function createOption(value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

function renderSubjects() {
  const fragment = document.createDocumentFragment();

  for (const subject of getAllSubjects()) {
    const item = document.createElement("li");
    item.textContent = subject;
    fragment.append(item);
  }

  elements.subjectsList.replaceChildren(fragment);
}

function updateSubjectField() {
  const direction = elements.taskDirectionSelect.value;
  const previousSubject = elements.taskSubjectSelect.value;
  const subjectIsRequired = REQUIRED_SUBJECT_DIRECTIONS.has(direction);
  const directionIsSelected = DIRECTIONS.includes(direction);
  const firstOptionLabel = subjectIsRequired
    ? "Выберите предмет"
    : "Без предмета";
  const options = [createOption("", firstOptionLabel)];

  for (const subject of getAllSubjects()) {
    options.push(createOption(subject, subject));
  }

  elements.taskSubjectSelect.replaceChildren(...options);
  elements.taskSubjectSelect.disabled = !directionIsSelected;
  elements.taskSubjectSelect.required = subjectIsRequired;
  elements.subjectRequiredMarker.hidden = !subjectIsRequired;

  if (directionIsSelected && getAllSubjects().includes(previousSubject)) {
    elements.taskSubjectSelect.value = previousSubject;
  }

  if (!directionIsSelected) {
    elements.taskSubjectSelect.replaceChildren(
      createOption("", "Сначала направление"),
    );
  }
}

function updateDifficultyPreview() {
  const reward = DIFFICULTY_REWARDS[elements.taskDifficultySelect.value];
  elements.xpPreview.textContent = reward ? `Награда: ${reward} XP` : "Награда: — XP";
}

function clearTaskErrors() {
  clearFieldError(elements.taskTitleInput, elements.taskTitleError);
  clearFieldError(elements.taskDirectionSelect, elements.taskDirectionError);
  clearFieldError(elements.taskSubjectSelect, elements.taskSubjectError);
  clearFieldError(elements.taskDifficultySelect, elements.taskDifficultyError);
  clearFieldError(elements.taskDeadlineInput, elements.taskDeadlineError);
}

function hideTaskFormStatus() {
  elements.taskFormStatus.textContent = "";
  elements.taskFormStatus.hidden = true;
  elements.taskFormStatus.classList.remove("form-status--error");
  elements.taskFormStatus.setAttribute("role", "status");
}

function showTaskFormStatus(message, isError = false) {
  elements.taskFormStatus.textContent = message;
  elements.taskFormStatus.hidden = false;
  elements.taskFormStatus.classList.toggle("form-status--error", isError);
  elements.taskFormStatus.setAttribute("role", isError ? "alert" : "status");
}

function createTaskId() {
  if (
    globalThis.crypto &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }

  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function handleSubjectSubmit(event) {
  event.preventDefault();

  const subjectName = elements.subjectNameInput.value.trim();
  clearFieldError(elements.subjectNameInput, elements.subjectNameError);

  if (subjectName.length === 0) {
    showFieldError(
      elements.subjectNameInput,
      elements.subjectNameError,
      "Введите название предмета",
    );
    return;
  }

  const normalizedName = normalizeForComparison(subjectName);
  const subjectExists = getAllSubjects().some(
    (subject) => normalizeForComparison(subject) === normalizedName,
  );

  if (subjectExists) {
    showFieldError(
      elements.subjectNameInput,
      elements.subjectNameError,
      "Такой предмет уже существует",
    );
    return;
  }

  const nextState = {
    ...appState,
    additionalSubjects: [...appState.additionalSubjects, subjectName],
  };

  if (!saveState(nextState)) {
    showFieldError(
      elements.subjectNameInput,
      elements.subjectNameError,
      "Не удалось сохранить предмет",
    );
    return;
  }

  appState = nextState;
  elements.subjectNameInput.value = "";
  renderSubjects();
  updateSubjectField();
}

function validateTaskForm() {
  clearTaskErrors();

  const title = elements.taskTitleInput.value.trim();
  const direction = elements.taskDirectionSelect.value;
  const subject = elements.taskSubjectSelect.value;
  const difficulty = elements.taskDifficultySelect.value;
  const deadline = elements.taskDeadlineInput.value;
  let isValid = true;

  if (title.length === 0) {
    showFieldError(
      elements.taskTitleInput,
      elements.taskTitleError,
      "Введите название задачи",
    );
    isValid = false;
  }

  if (!DIRECTIONS.includes(direction)) {
    showFieldError(
      elements.taskDirectionSelect,
      elements.taskDirectionError,
      "Выберите направление",
    );
    isValid = false;
  }

  if (REQUIRED_SUBJECT_DIRECTIONS.has(direction) && subject.length === 0) {
    showFieldError(
      elements.taskSubjectSelect,
      elements.taskSubjectError,
      "Выберите предмет",
    );
    isValid = false;
  } else if (subject.length > 0 && !getAllSubjects().includes(subject)) {
    showFieldError(
      elements.taskSubjectSelect,
      elements.taskSubjectError,
      "Выберите существующий предмет",
    );
    isValid = false;
  }

  if (!Object.hasOwn(DIFFICULTY_REWARDS, difficulty)) {
    showFieldError(
      elements.taskDifficultySelect,
      elements.taskDifficultyError,
      "Выберите сложность",
    );
    isValid = false;
  }

  if (!isValidCalendarDate(deadline)) {
    showFieldError(
      elements.taskDeadlineInput,
      elements.taskDeadlineError,
      "Выберите корректный дедлайн",
    );
    isValid = false;
  }

  return {
    isValid,
    values: { title, direction, subject, difficulty, deadline },
  };
}

function handleTaskSubmit(event) {
  event.preventDefault();
  hideTaskFormStatus();

  const { isValid, values } = validateTaskForm();

  if (!isValid) {
    return;
  }

  let id;

  do {
    id = createTaskId();
  } while (appState.tasks.some((task) => task.id === id));

  const task = {
    id,
    title: values.title,
    direction: values.direction,
    subject: values.subject || null,
    difficulty: values.difficulty,
    xpReward: DIFFICULTY_REWARDS[values.difficulty],
    status: "active",
    originalDeadline: values.deadline,
    currentDeadline: values.deadline,
    postponementCount: 0,
    xpAwarded: false,
    createdAt: new Date().toISOString(),
  };
  const nextState = {
    ...appState,
    tasks: [task, ...appState.tasks],
  };

  if (!saveState(nextState)) {
    showTaskFormStatus("Не удалось сохранить задачу", true);
    return;
  }

  appState = nextState;
  elements.taskForm.reset();
  updateSubjectField();
  updateDifficultyPreview();
  showTaskFormStatus("Задача сохранена");
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
  renderSubjects();
  updateSubjectField();
  renderProfile();
  showMainInterface();
}

function initializeApp() {
  appState = loadState();
  elements.nameForm.addEventListener("submit", handleNameSubmit);
  elements.nameInput.addEventListener("input", clearNameError);
  elements.settingsButton.addEventListener("click", toggleSettingsPanel);
  elements.subjectForm.addEventListener("submit", handleSubjectSubmit);
  elements.subjectNameInput.addEventListener("input", () => {
    clearFieldError(elements.subjectNameInput, elements.subjectNameError);
  });
  elements.taskDirectionSelect.addEventListener("change", () => {
    updateSubjectField();
    clearFieldError(elements.taskDirectionSelect, elements.taskDirectionError);
    clearFieldError(elements.taskSubjectSelect, elements.taskSubjectError);
  });
  elements.taskDifficultySelect.addEventListener(
    "change",
    updateDifficultyPreview,
  );
  elements.taskForm.addEventListener("input", hideTaskFormStatus);
  elements.taskForm.addEventListener("submit", handleTaskSubmit);
  document.addEventListener("keydown", handleDocumentKeydown);

  renderSubjects();
  updateSubjectField();
  updateDifficultyPreview();

  if (appState.profile.name) {
    renderProfile();
    showMainInterface();
    return;
  }

  showWelcome();
}

initializeApp();
