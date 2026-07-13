"use strict";

const STORAGE_KEY = "levelUpState";
const STATE_VERSION = 1;
const XP_PER_LEVEL = 100;
const FILTER_ALL = "all";
const FILTER_WITHOUT_SUBJECT = "__without_subject__";
const FILTER_SUBJECT_PREFIX = "subject:";
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
const DIFFICULTY_LABELS = Object.freeze({
  easy: "Простая",
  medium: "Средняя",
  hard: "Сложная",
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
  taskFormToggle: document.querySelector("#task-form-toggle"),
  taskFormPanel: document.querySelector("#task-form-panel"),
  filtersToggle: document.querySelector("#filters-toggle"),
  filtersPanel: document.querySelector("#filters-panel"),
  statusFilter: document.querySelector("#status-filter"),
  directionFilter: document.querySelector("#direction-filter"),
  subjectFilter: document.querySelector("#subject-filter"),
  filtersResetButton: document.querySelector("#filters-reset-button"),
  activeListToggle: document.querySelector("#active-list-toggle"),
  activeTasksContent: document.querySelector("#active-tasks-content"),
  activeTasksList: document.querySelector("#active-tasks-list"),
  activeTasksEmpty: document.querySelector("#active-tasks-empty"),
  completedTasksSection: document.querySelector("#completed-tasks-section"),
  completedTasksList: document.querySelector("#completed-tasks-list"),
  completedTasksEmpty: document.querySelector("#completed-tasks-empty"),
  profileName: document.querySelector("#profile-name"),
  profileLevel: document.querySelector("#profile-level"),
  profileTotalXp: document.querySelector("#profile-total-xp"),
  profileXpToNext: document.querySelector("#profile-xp-to-next"),
  profileProgressText: document.querySelector("#profile-progress-text"),
  profileProgress: document.querySelector("#profile-progress"),
};

let appState = createInitialState();
let activeTasksExpanded = true;

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

function parseCalendarDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(0);

  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);

  const isValid =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;

  return isValid ? { year, month, day } : null;
}

function isValidCalendarDate(value) {
  return parseCalendarDate(value) !== null;
}

function formatCalendarDate(value) {
  const parts = parseCalendarDate(value);

  if (!parts) {
    return "—";
  }

  return [parts.day, parts.month, parts.year]
    .map((part, index) => String(part).padStart(index === 2 ? 4 : 2, "0"))
    .join(".");
}

function getLocalTodayParts(date = new Date()) {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  };
}

function getCalendarDayIndex({ year, month, day }) {
  return Date.UTC(year, month - 1, day) / 86400000;
}

function getDayWord(value) {
  const absoluteValue = Math.abs(value);
  const lastTwoDigits = absoluteValue % 100;
  const lastDigit = absoluteValue % 10;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
    return "дней";
  }

  if (lastDigit === 1) {
    return "день";
  }

  if (lastDigit >= 2 && lastDigit <= 4) {
    return "дня";
  }

  return "дней";
}

function getDeadlineState(task, todayParts = getLocalTodayParts()) {
  if (task.status === "completed") {
    return { kind: "completed", label: "Выполнено", message: "Выполнено" };
  }

  const deadlineParts = parseCalendarDate(task.currentDeadline);
  const daysDifference =
    getCalendarDayIndex(deadlineParts) - getCalendarDayIndex(todayParts);

  if (daysDifference < 0) {
    const overdueDays = Math.abs(daysDifference);

    return {
      kind: "overdue",
      label: "Просрочено",
      message: `Просрочено на ${overdueDays} ${getDayWord(overdueDays)}`,
    };
  }

  if (daysDifference === 0) {
    return { kind: "today", label: "Сегодня", message: "Сегодня" };
  }

  return {
    kind: "upcoming",
    label: "Срок впереди",
    message:
      daysDifference === 1
        ? "Остался 1 день"
        : `Осталось ${daysDifference} ${getDayWord(daysDifference)}`,
  };
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

function createTaskDetail(label, value, extraClasses = []) {
  const wrapper = document.createElement("div");
  const term = document.createElement("dt");
  const description = document.createElement("dd");

  wrapper.className = "task-card__detail";

  if (typeof extraClasses === "string") {
    extraClasses = [extraClasses];
  }

  if (extraClasses.length > 0) {
    wrapper.classList.add(...extraClasses);
  }

  term.textContent = label;
  description.textContent = value;
  wrapper.append(term, description);
  return wrapper;
}

function createTaskCard(task, todayParts) {
  const deadlineState = getDeadlineState(task, todayParts);
  const card = document.createElement("article");
  const header = document.createElement("div");
  const title = document.createElement("h3");
  const badges = document.createElement("div");
  const statusBadge = document.createElement("span");
  const details = document.createElement("dl");

  card.className = "task-card";
  header.className = "task-card__header";
  title.className = "task-card__title";
  badges.className = "task-card__badges";
  statusBadge.className = "task-badge";
  details.className = "task-card__details";

  if (task.status === "completed") {
    card.classList.add("task-card--completed");
    statusBadge.classList.add("task-badge--completed");
  }

  if (deadlineState.kind === "overdue") {
    const overdueBadge = document.createElement("span");

    card.classList.add("task-card--overdue");
    overdueBadge.className = "task-badge task-badge--overdue";
    overdueBadge.textContent = "Просрочено";
    badges.append(overdueBadge);
  }

  title.textContent = task.title;
  statusBadge.textContent = task.status === "completed" ? "Выполнена" : "Активная";
  badges.append(statusBadge);
  header.append(title, badges);

  details.append(
    createTaskDetail("Направление", task.direction),
    createTaskDetail("Предмет", task.subject ?? "Без предмета"),
    createTaskDetail("Дедлайн", formatCalendarDate(task.currentDeadline)),
    createTaskDetail(
      "Срок",
      deadlineState.message,
      ["task-card__detail--term", `task-card__detail--${deadlineState.kind}`],
    ),
    createTaskDetail("Сложность", DIFFICULTY_LABELS[task.difficulty]),
    createTaskDetail("Награда", `${task.xpReward} XP`),
  );

  if (task.postponementCount > 0) {
    const postponements = document.createElement("p");

    postponements.className = "task-card__postponements";
    postponements.textContent = `Переносов дедлайна: ${task.postponementCount}`;
    card.append(header, details, postponements);
    return card;
  }

  card.append(header, details);
  return card;
}

function taskMatchesFilters(
  task,
  statusFilter,
  directionFilter,
  subjectFilter,
  todayParts,
) {
  const deadlineState = getDeadlineState(task, todayParts);
  const matchesStatus =
    statusFilter === FILTER_ALL ||
    task.status === statusFilter ||
    (statusFilter === "overdue" &&
      task.status === "active" &&
      deadlineState.kind === "overdue");
  const matchesDirection =
    directionFilter === FILTER_ALL || task.direction === directionFilter;
  const matchesSubject =
    subjectFilter === FILTER_ALL ||
    (subjectFilter === FILTER_WITHOUT_SUBJECT && task.subject === null) ||
    (subjectFilter.startsWith(FILTER_SUBJECT_PREFIX) &&
      task.subject === subjectFilter.slice(FILTER_SUBJECT_PREFIX.length));

  return matchesStatus && matchesDirection && matchesSubject;
}

function renderTaskList(
  listElement,
  emptyElement,
  tasks,
  hasTasksOfStatus,
  label,
  todayParts,
) {
  const fragment = document.createDocumentFragment();

  for (const task of tasks) {
    fragment.append(createTaskCard(task, todayParts));
  }

  listElement.replaceChildren(fragment);
  emptyElement.hidden = tasks.length > 0;
  emptyElement.textContent = hasTasksOfStatus
    ? `По выбранным фильтрам ${label} задач нет.`
    : `${label[0].toUpperCase()}${label.slice(1)} задач пока нет.`;
}

function updateActiveListToggle() {
  elements.activeListToggle.textContent = activeTasksExpanded ? "−" : "+";
  elements.activeListToggle.setAttribute(
    "aria-expanded",
    String(activeTasksExpanded),
  );
  elements.activeListToggle.setAttribute(
    "aria-label",
    activeTasksExpanded
      ? "Свернуть активные задачи"
      : "Развернуть активные задачи",
  );
}

function setActiveTasksExpanded(isExpanded) {
  activeTasksExpanded = isExpanded;
  updateActiveListToggle();

  if (!elements.activeListToggle.hidden) {
    elements.activeTasksContent.hidden = !activeTasksExpanded;
  }
}

function toggleActiveTasks() {
  setActiveTasksExpanded(!activeTasksExpanded);
}

function updateFiltersResetButton() {
  elements.filtersResetButton.disabled =
    elements.statusFilter.value === FILTER_ALL &&
    elements.directionFilter.value === FILTER_ALL &&
    elements.subjectFilter.value === FILTER_ALL;
}

function resetFilters() {
  elements.statusFilter.value = FILTER_ALL;
  elements.directionFilter.value = FILTER_ALL;
  elements.subjectFilter.value = FILTER_ALL;
  renderTaskLists();
}

function renderTaskLists() {
  const statusFilter = elements.statusFilter.value;
  const directionFilter = elements.directionFilter.value;
  const subjectFilter = elements.subjectFilter.value;
  const todayParts = getLocalTodayParts();
  const filteredTasks = appState.tasks.filter((task) =>
    taskMatchesFilters(
      task,
      statusFilter,
      directionFilter,
      subjectFilter,
      todayParts,
    ),
  );
  const activeTasks = filteredTasks.filter((task) => task.status === "active");
  const completedTasks = filteredTasks.filter(
    (task) => task.status === "completed",
  );
  const hasActiveTasks = appState.tasks.some((task) => task.status === "active");
  const hasCompletedTasks = appState.tasks.some(
    (task) => task.status === "completed",
  );

  elements.completedTasksSection.hidden =
    statusFilter === "active" || statusFilter === "overdue";

  renderTaskList(
    elements.activeTasksList,
    elements.activeTasksEmpty,
    activeTasks,
    hasActiveTasks,
    "активных",
    todayParts,
  );
  renderTaskList(
    elements.completedTasksList,
    elements.completedTasksEmpty,
    completedTasks,
    hasCompletedTasks,
    "выполненных",
    todayParts,
  );

  const hasVisibleActiveTasks = activeTasks.length > 0;

  elements.activeListToggle.hidden = !hasVisibleActiveTasks;
  updateActiveListToggle();
  elements.activeTasksContent.hidden =
    statusFilter === "completed" ||
    (hasVisibleActiveTasks && !activeTasksExpanded);
  updateFiltersResetButton();
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

function renderSubjectFilterOptions() {
  const previousValue = elements.subjectFilter.value || FILTER_ALL;
  const options = [
    createOption(FILTER_ALL, "Все предметы"),
    createOption(FILTER_WITHOUT_SUBJECT, "Без предмета"),
  ];

  for (const subject of getAllSubjects()) {
    options.push(createOption(`${FILTER_SUBJECT_PREFIX}${subject}`, subject));
  }

  elements.subjectFilter.replaceChildren(...options);

  const availableValues = new Set([
    FILTER_ALL,
    FILTER_WITHOUT_SUBJECT,
    ...getAllSubjects().map((subject) => `${FILTER_SUBJECT_PREFIX}${subject}`),
  ]);
  elements.subjectFilter.value = availableValues.has(previousValue)
    ? previousValue
    : FILTER_ALL;
  updateFiltersResetButton();
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
  elements.xpPreview.textContent = reward ? `${reward} XP` : "— XP";
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
  renderSubjectFilterOptions();
  updateSubjectField();
  renderTaskLists();
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
  setActiveTasksExpanded(true);
  renderTaskLists();
  setTaskFormPanelOpen(false);
  showTaskFormStatus("Задача сохранена");
}

function setControlledPanelOpen(button, panel, isOpen) {
  panel.hidden = !isOpen;
  button.setAttribute("aria-expanded", String(isOpen));
}

function setTaskFormPanelOpen(isOpen) {
  setControlledPanelOpen(
    elements.taskFormToggle,
    elements.taskFormPanel,
    isOpen,
  );
}

function setFiltersPanelOpen(isOpen) {
  setControlledPanelOpen(
    elements.filtersToggle,
    elements.filtersPanel,
    isOpen,
  );
}

function toggleTaskFormPanel() {
  const shouldOpen = elements.taskFormPanel.hidden;

  if (shouldOpen) {
    hideTaskFormStatus();
  }

  setTaskFormPanelOpen(shouldOpen);
}

function toggleFiltersPanel() {
  setFiltersPanelOpen(elements.filtersPanel.hidden);
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
  if (event.key !== "Escape") {
    return;
  }

  let focusTarget = null;

  if (!elements.taskFormPanel.hidden) {
    setTaskFormPanelOpen(false);
    focusTarget = elements.taskFormToggle;
  }

  if (!elements.filtersPanel.hidden) {
    setFiltersPanelOpen(false);
    focusTarget ??= elements.filtersToggle;
  }

  if (!elements.settingsPanel.hidden) {
    setSettingsPanelOpen(false);
    focusTarget ??= elements.settingsButton;
  }

  focusTarget?.focus();
}

function showWelcome() {
  elements.welcomePanel.hidden = false;
  elements.mainInterface.hidden = true;
  elements.settingsButton.hidden = true;
  setSettingsPanelOpen(false);
  setTaskFormPanelOpen(false);
  setFiltersPanelOpen(false);
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
  renderSubjectFilterOptions();
  updateSubjectField();
  renderProfile();
  renderTaskLists();
  showMainInterface();
}

function initializeApp() {
  appState = loadState();
  elements.nameForm.addEventListener("submit", handleNameSubmit);
  elements.nameInput.addEventListener("input", clearNameError);
  elements.settingsButton.addEventListener("click", toggleSettingsPanel);
  elements.taskFormToggle.addEventListener("click", toggleTaskFormPanel);
  elements.filtersToggle.addEventListener("click", toggleFiltersPanel);
  elements.filtersResetButton.addEventListener("click", resetFilters);
  elements.activeListToggle.addEventListener("click", toggleActiveTasks);
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
  elements.statusFilter.addEventListener("change", renderTaskLists);
  elements.directionFilter.addEventListener("change", renderTaskLists);
  elements.subjectFilter.addEventListener("change", renderTaskLists);
  document.addEventListener("keydown", handleDocumentKeydown);

  renderSubjects();
  renderSubjectFilterOptions();
  updateSubjectField();
  updateDifficultyPreview();
  renderTaskLists();

  if (appState.profile.name) {
    renderProfile();
    showMainInterface();
    return;
  }

  showWelcome();
}

initializeApp();
