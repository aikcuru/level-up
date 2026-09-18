"use strict";

const XP_PER_LEVEL = 100;
const API_BASE_PATH = "/api/v1";
const APP_TIME_ZONE = "Asia/Irkutsk";
const MIN_CALENDAR_YEAR = 1;
const MAX_CALENDAR_YEAR = 9999;
const FILTER_ALL = "all";
const FILTER_WITHOUT_SUBJECT = "__without_subject__";
const FILTER_SUBJECT_PREFIX = "subject:";
const MAIN_TAB_NAMES = Object.freeze(["tasks", "calendar", "archive"]);
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
const CALENDAR_MONTH_NAMES = Object.freeze([
  "январь",
  "февраль",
  "март",
  "апрель",
  "май",
  "июнь",
  "июль",
  "август",
  "сентябрь",
  "октябрь",
  "ноябрь",
  "декабрь",
]);
const CALENDAR_MONTH_NAMES_GENITIVE = Object.freeze([
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
]);
const CALENDAR_NAVIGATION_LABELS = Object.freeze({
  month: Object.freeze({
    previous: "Предыдущий месяц",
    next: "Следующий месяц",
  }),
  week: Object.freeze({
    previous: "Предыдущая неделя",
    next: "Следующая неделя",
  }),
  day: Object.freeze({
    previous: "Предыдущий день",
    next: "Следующий день",
  }),
});
const CALENDAR_MODE_LABELS = Object.freeze({
  month: "Месяц",
  week: "Неделя",
});
const CALENDAR_WEEKDAY_NAMES = Object.freeze([
  "Пн",
  "Вт",
  "Ср",
  "Чт",
  "Пт",
  "Сб",
  "Вс",
]);
const BASE_SUBJECT_ORDER = Object.freeze([
  "Русский язык",
  "Математика",
  "История",
  "Физика",
]);
const BASE_SUBJECT_COLORS = Object.freeze({
  "русский язык": "#F2D6D0",
  математика: "#D8E7F2",
  история: "#E9DDB9",
  физика: "#DED9F1",
  "без предмета": "#E6DED5",
});
const ADDITIONAL_SUBJECT_COLORS = Object.freeze([
  "#D6E4D5",
  "#F0D8E6",
  "#D9E8DF",
  "#EAD5C7",
  "#D7E0EE",
  "#E4D8C7",
]);
const TODAY_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const elements = {
  authLoading: document.querySelector("#auth-loading"),
  loginPanel: document.querySelector("#login-panel"),
  loginForm: document.querySelector("#login-form"),
  loginInput: document.querySelector("#login-input"),
  passwordInput: document.querySelector("#password-input"),
  loginError: document.querySelector("#login-error"),
  loginSubmit: document.querySelector("#login-submit"),
  mainInterface: document.querySelector("#main-interface"),
  mainTabs: [...document.querySelectorAll("[data-main-tab]")],
  profileGreeting: document.querySelector("#profile-title"),
  logoutButton: document.querySelector("#logout-button"),
  settingsButton: document.querySelector("#settings-button"),
  settingsPanel: document.querySelector("#settings-panel"),
  subjectForm: document.querySelector("#subject-form"),
  subjectNameInput: document.querySelector("#subject-name-input"),
  subjectNameError: document.querySelector("#subject-name-error"),
  subjectsList: document.querySelector("#subjects-list"),
  taskForm: document.querySelector("#task-form"),
  taskFormHeading: document.querySelector("#task-form-heading"),
  taskFormContext: document.querySelector("#task-form-context"),
  taskFormSubmit: document.querySelector("#task-form-submit"),
  taskFormCancel: document.querySelector("#task-form-cancel"),
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
  calendar: document.querySelector(".calendar"),
  calendarModeLabel: document.querySelector(".calendar__title-line .eyebrow"),
  calendarMonthLabel: document.querySelector("#calendar-month"),
  calendarPrevious: document.querySelector("#calendar-previous"),
  calendarPreviousLabel: document.querySelector(
    "#calendar-previous .calendar__control-label--desktop",
  ),
  calendarToday: document.querySelector("#calendar-today"),
  calendarNext: document.querySelector("#calendar-next"),
  calendarNextLabel: document.querySelector(
    "#calendar-next .calendar__control-label--desktop",
  ),
  calendarLegend: document.querySelector("#calendar-legend"),
  calendarGrid: document.querySelector("#calendar-grid"),
  calendarSelectedDate: document.querySelector("#calendar-selected-date"),
  calendarSelectedTasks: document.querySelector("#calendar-selected-tasks"),
  calendarSelectedEmpty: document.querySelector("#calendar-selected-empty"),
  calendarTaskTooltip: document.querySelector("#calendar-task-tooltip"),
};

let appState = createEmptyState();
let csrfToken = null;
let currentUser = null;
let authRequestPending = false;
let mutationPending = false;
let activeMainTab = "tasks";
let activeTasksExpanded = true;
let editingTaskId = null;
let editingTaskVersionAtOpen = null;
const initialCalendarToday = getLocalTodayParts();
let calendarMode = "month";
let selectedCalendarDate = toCalendarDateKey(initialCalendarToday);
let calendarTooltipTrigger = null;
let calendarTooltipTaskId = null;
let calendarTooltipCloseTimer = null;

function createEmptyState() {
  return {
    profile: {
      userId: "",
      displayName: "",
      totalXp: 0,
      level: 1,
    },
    subjects: [],
    tasks: [],
    syncVersion: 0,
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeForComparison(value) {
  return value.trim().toLocaleLowerCase("ru-RU");
}

function getAllSubjects() {
  return appState.subjects;
}

function getSubjectById(subjectId) {
  if (subjectId === null) {
    return null;
  }

  return appState.subjects.find((subject) => subject.id === subjectId) ?? null;
}

function parseCalendarDate(value) {
  if (typeof value !== "string") {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const isValid =
    isValidCalendarDateParts({ year, month, day });

  return isValid ? { year, month, day } : null;
}

function isValidCalendarDate(value) {
  return parseCalendarDate(value) !== null;
}

function isValidServerUtcTimestamp(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
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
  const parts = Object.fromEntries(
    TODAY_FORMATTER.formatToParts(date).map(({ type, value }) => [type, value]),
  );

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
  };
}

function getCalendarDayIndex({ year, month, day }) {
  const adjustedYear = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(adjustedYear / 400);
  const yearOfEra = adjustedYear - era * 400;
  const adjustedMonth = month + (month > 2 ? -3 : 9);
  const dayOfYear =
    Math.floor((153 * adjustedMonth + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 +
    Math.floor(yearOfEra / 4) -
    Math.floor(yearOfEra / 100) +
    dayOfYear;

  return era * 146097 + dayOfEra;
}

function getCalendarDateFromDayIndex(dayIndex) {
  const minDayIndex = getCalendarDayIndex({
    year: MIN_CALENDAR_YEAR,
    month: 1,
    day: 1,
  });
  const maxDayIndex = getCalendarDayIndex({
    year: MAX_CALENDAR_YEAR,
    month: 12,
    day: 31,
  });

  if (
    !Number.isSafeInteger(dayIndex) ||
    dayIndex < minDayIndex ||
    dayIndex > maxDayIndex
  ) {
    return null;
  }

  const era = Math.floor(dayIndex / 146097);
  const dayOfEra = dayIndex - era * 146097;
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36524) -
      Math.floor(dayOfEra / 146096)) /
      365,
  );
  let year = yearOfEra + era * 400;
  const dayOfYear =
    dayOfEra -
    (365 * yearOfEra +
      Math.floor(yearOfEra / 4) -
      Math.floor(yearOfEra / 100));
  const adjustedMonth = Math.floor((5 * dayOfYear + 2) / 153);
  const day =
    dayOfYear - Math.floor((153 * adjustedMonth + 2) / 5) + 1;
  const month = adjustedMonth + (adjustedMonth < 10 ? 3 : -9);

  year += month <= 2 ? 1 : 0;
  return { year, month, day };
}

function addCalendarDays(parts, dayDelta) {
  if (
    !isValidCalendarDateParts(parts) ||
    !Number.isSafeInteger(dayDelta)
  ) {
    return null;
  }

  const targetDayIndex = getCalendarDayIndex(parts) + dayDelta;

  return getCalendarDateFromDayIndex(targetDayIndex);
}

function addCalendarMonths(parts, monthDelta) {
  if (
    !isValidCalendarDateParts(parts) ||
    !Number.isSafeInteger(monthDelta)
  ) {
    return null;
  }

  const targetMonthIndex =
    (parts.year - MIN_CALENDAR_YEAR) * 12 + parts.month - 1 + monthDelta;
  const maxMonthIndex =
    (MAX_CALENDAR_YEAR - MIN_CALENDAR_YEAR + 1) * 12 - 1;

  if (
    !Number.isSafeInteger(targetMonthIndex) ||
    targetMonthIndex < 0 ||
    targetMonthIndex > maxMonthIndex
  ) {
    return null;
  }

  const year = Math.floor(targetMonthIndex / 12) + MIN_CALENDAR_YEAR;
  const month = (targetMonthIndex % 12) + 1;
  const day = Math.min(parts.day, getDaysInMonth(year, month));

  return { year, month, day };
}

function getCalendarWeekMonday(parts) {
  if (!isValidCalendarDateParts(parts)) {
    return null;
  }

  const dayIndex = getCalendarDayIndex(parts);
  const daysSinceMonday = ((dayIndex + 2) % 7 + 7) % 7;

  return getCalendarDateFromDayIndex(dayIndex - daysSinceMonday);
}

function getCalendarWeekDates(parts) {
  const monday = getCalendarWeekMonday(parts);

  if (!monday) {
    return [];
  }

  return CALENDAR_WEEKDAY_NAMES.map((_, dayOffset) =>
    addCalendarDays(monday, dayOffset),
  );
}

function formatCalendarWeekRange(startParts, endParts) {
  if (
    !isValidCalendarDateParts(startParts) ||
    !isValidCalendarDateParts(endParts)
  ) {
    return "";
  }

  const startMonthName = CALENDAR_MONTH_NAMES_GENITIVE[startParts.month - 1];
  const endMonthName = CALENDAR_MONTH_NAMES_GENITIVE[endParts.month - 1];

  if (
    startParts.year === endParts.year &&
    startParts.month === endParts.month
  ) {
    return `${startParts.day}–${endParts.day} ${startMonthName} ${startParts.year}`;
  }

  if (startParts.year === endParts.year) {
    return `${startParts.day} ${startMonthName} — ${endParts.day} ${endMonthName} ${startParts.year}`;
  }

  return `${startParts.day} ${startMonthName} ${startParts.year} — ${endParts.day} ${endMonthName} ${endParts.year}`;
}

function getCalendarDateAfterPeriodChange(parts, periodDelta) {
  if (!Number.isSafeInteger(periodDelta)) {
    return null;
  }

  if (calendarMode === "month") {
    return addCalendarMonths(parts, periodDelta);
  }

  if (calendarMode === "week") {
    return addCalendarDays(parts, periodDelta * 7);
  }

  if (calendarMode === "day") {
    return addCalendarDays(parts, periodDelta);
  }

  return null;
}

function canChangeCalendarPeriod(periodDelta) {
  const selectedParts = parseCalendarDate(selectedCalendarDate);

  return (
    selectedParts !== null &&
    getCalendarDateAfterPeriodChange(selectedParts, periodDelta) !== null
  );
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

function toCalendarDateKey({ year, month, day }) {
  return [year, month, day]
    .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, "0"))
    .join("-");
}

function getDaysInMonth(year, month) {
  const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const isLeapYear =
    year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

  return month === 2 && isLeapYear ? 29 : days[month - 1];
}

function isValidCalendarDateParts(value) {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const { year, month, day } = value;

  return (
    Number.isInteger(year) &&
    year >= MIN_CALENDAR_YEAR &&
    year <= MAX_CALENDAR_YEAR &&
    Number.isInteger(month) &&
    month >= 1 &&
    month <= 12 &&
    Number.isInteger(day) &&
    day >= 1 &&
    day <= getDaysInMonth(year, month)
  );
}

function getMondayFirstOffset(year, month) {
  const dayIndex = getCalendarDayIndex({ year, month, day: 1 });

  return ((dayIndex + 2) % 7 + 7) % 7;
}

function formatFullCalendarDate({ year, month, day }) {
  return `${day} ${CALENDAR_MONTH_NAMES_GENITIVE[month - 1]} ${year} года`;
}

function getSubjectLabel(subjectId) {
  return getSubjectById(subjectId)?.name ?? "Без предмета";
}

function getSubjectColor(subjectId) {
  const normalizedSubject = normalizeForComparison(getSubjectLabel(subjectId));
  const baseColor = BASE_SUBJECT_COLORS[normalizedSubject];

  if (baseColor) {
    return baseColor;
  }

  let hash = 0;

  for (const character of normalizedSubject) {
    hash = (hash * 31 + character.codePointAt(0)) >>> 0;
  }

  return ADDITIONAL_SUBJECT_COLORS[hash % ADDITIONAL_SUBJECT_COLORS.length];
}

function isTaskOverdueForCalendar(task, todayKey) {
  return task.status === "active" && task.currentDeadline < todayKey;
}

function compareActiveTasks(left, right) {
  if (left.currentDeadline !== right.currentDeadline) {
    return left.currentDeadline < right.currentDeadline ? -1 : 1;
  }

  if (left.createdAt !== right.createdAt) {
    return left.createdAt > right.createdAt ? -1 : 1;
  }

  if (left.id !== right.id) {
    return left.id > right.id ? -1 : 1;
  }

  return 0;
}

function getSortedActiveTasks(tasks) {
  return [...tasks].sort(compareActiveTasks);
}

function getCalendarTasksForRange(startDateKey, endDateKey) {
  if (
    !isValidCalendarDate(startDateKey) ||
    !isValidCalendarDate(endDateKey) ||
    startDateKey > endDateKey
  ) {
    return [];
  }

  return getSortedActiveTasks(
    appState.tasks.filter(
      (task) =>
        task.status === "active" &&
        task.currentDeadline >= startDateKey &&
        task.currentDeadline <= endDateKey,
    ),
  );
}

function groupCalendarTasksByDate(tasks) {
  const tasksByDate = new Map();

  for (const task of tasks) {
    const dateTasks = tasksByDate.get(task.currentDeadline) ?? [];

    dateTasks.push(task);
    tasksByDate.set(task.currentDeadline, dateTasks);
  }

  return tasksByDate;
}

function getLegendSubjects(tasks) {
  const subjectsByNormalizedName = new Map();

  for (const task of tasks) {
    const label = getSubjectLabel(task.subjectId);
    const normalizedLabel = normalizeForComparison(label);

    if (!subjectsByNormalizedName.has(normalizedLabel)) {
      subjectsByNormalizedName.set(normalizedLabel, task.subjectId);
    }
  }

  const baseIndexes = new Map(
    BASE_SUBJECT_ORDER.map((subject, index) => [
      normalizeForComparison(subject),
      index,
    ]),
  );

  return [...subjectsByNormalizedName.values()].sort((left, right) => {
    const leftLabel = getSubjectLabel(left);
    const rightLabel = getSubjectLabel(right);
    const leftNormalized = normalizeForComparison(leftLabel);
    const rightNormalized = normalizeForComparison(rightLabel);
    const leftIsWithoutSubject = left === null;
    const rightIsWithoutSubject = right === null;

    if (leftIsWithoutSubject !== rightIsWithoutSubject) {
      return leftIsWithoutSubject ? 1 : -1;
    }

    const leftBaseIndex = baseIndexes.get(leftNormalized);
    const rightBaseIndex = baseIndexes.get(rightNormalized);

    if (leftBaseIndex !== undefined || rightBaseIndex !== undefined) {
      if (leftBaseIndex === undefined) {
        return 1;
      }

      if (rightBaseIndex === undefined) {
        return -1;
      }

      return leftBaseIndex - rightBaseIndex;
    }

    return leftLabel.localeCompare(rightLabel, "ru-RU");
  });
}

function renderCalendarLegend(tasks, emptyText) {
  const subjects = getLegendSubjects(tasks);

  if (subjects.length === 0) {
    const empty = document.createElement("p");

    empty.className = "calendar-legend__empty";
    empty.textContent = emptyText;
    elements.calendarLegend.replaceChildren(empty);
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const subject of subjects) {
    const item = document.createElement("span");
    const swatch = document.createElement("span");
    const label = document.createElement("span");
    const subjectLabel = getSubjectLabel(subject);

    item.className = "calendar-legend__item";
    swatch.className = "calendar-legend__swatch";
    swatch.style.backgroundColor = getSubjectColor(subject);
    swatch.setAttribute("aria-hidden", "true");
    label.textContent = subjectLabel;
    item.append(swatch, label);
    fragment.append(item);
  }

  elements.calendarLegend.replaceChildren(fragment);
}

function isCalendarDesktopView() {
  return window.matchMedia("(min-width: 768px)").matches;
}

function cancelCalendarTooltipClose() {
  if (calendarTooltipCloseTimer !== null) {
    window.clearTimeout(calendarTooltipCloseTimer);
    calendarTooltipCloseTimer = null;
  }
}

function closeCalendarTaskTooltip() {
  cancelCalendarTooltipClose();
  calendarTooltipTrigger?.removeAttribute("aria-describedby");
  calendarTooltipTrigger = null;
  calendarTooltipTaskId = null;
  elements.calendarTaskTooltip.hidden = true;
  elements.calendarTaskTooltip.replaceChildren();
  elements.calendarTaskTooltip.style.removeProperty("left");
  elements.calendarTaskTooltip.style.removeProperty("top");
}

function positionCalendarTaskTooltip() {
  if (
    elements.calendarTaskTooltip.hidden ||
    calendarTooltipTrigger === null ||
    !calendarTooltipTrigger.isConnected ||
    !isCalendarDesktopView()
  ) {
    return;
  }

  const viewportGap = 12;
  const triggerGap = 8;
  const triggerRect = calendarTooltipTrigger.getBoundingClientRect();
  const tooltipRect = elements.calendarTaskTooltip.getBoundingClientRect();
  const spaceBelow = window.innerHeight - triggerRect.bottom - viewportGap;
  const spaceAbove = triggerRect.top - viewportGap;
  let top = triggerRect.bottom + triggerGap;

  if (spaceBelow < tooltipRect.height + triggerGap && spaceAbove > spaceBelow) {
    top = triggerRect.top - tooltipRect.height - triggerGap;
  }

  top = Math.min(
    Math.max(top, viewportGap),
    Math.max(viewportGap, window.innerHeight - tooltipRect.height - viewportGap),
  );

  let left = triggerRect.left;

  if (left + tooltipRect.width > window.innerWidth - viewportGap) {
    left = triggerRect.right - tooltipRect.width;
  }

  left = Math.min(
    Math.max(left, viewportGap),
    Math.max(viewportGap, window.innerWidth - tooltipRect.width - viewportGap),
  );

  elements.calendarTaskTooltip.style.left = `${Math.round(left)}px`;
  elements.calendarTaskTooltip.style.top = `${Math.round(top)}px`;
}

function createCalendarTooltipContent(task) {
  const deadlineState = getDeadlineState(task);
  const fragment = document.createDocumentFragment();
  const title = document.createElement("h3");
  const statuses = document.createElement("div");
  const activeStatus = document.createElement("span");
  const details = document.createElement("dl");

  title.className = "calendar-task-tooltip__title";
  title.textContent = task.title;
  statuses.className = "calendar-task-tooltip__statuses";
  activeStatus.className = "task-badge";
  activeStatus.textContent = "Активная";
  statuses.append(activeStatus);

  if (deadlineState.kind === "overdue") {
    const overdueStatus = document.createElement("span");

    overdueStatus.className = "task-badge task-badge--overdue";
    overdueStatus.textContent = "Просрочено";
    statuses.append(overdueStatus);
  }

  details.className = "calendar-task-tooltip__details";
  details.append(
    createTaskDetail("Направление", task.direction),
    createTaskDetail("Предмет", getSubjectLabel(task.subjectId)),
    createTaskDetail("Дедлайн", formatCalendarDate(task.currentDeadline)),
    createTaskDetail(
      "Срок",
      deadlineState.message,
      ["task-card__detail--term", `task-card__detail--${deadlineState.kind}`],
    ),
    createTaskDetail("Сложность", DIFFICULTY_LABELS[task.difficulty]),
    createTaskDetail("Награда", `${task.xpReward} XP`),
  );
  fragment.append(title, statuses, details);

  if (task.postponementCount > 0) {
    const postponements = document.createElement("p");

    postponements.className = "calendar-task-tooltip__postponements";
    postponements.textContent = `Переносов дедлайна: ${task.postponementCount}`;
    fragment.append(postponements);
  }

  return fragment;
}

function openCalendarTaskTooltip(trigger, task) {
  if (!isCalendarDesktopView()) {
    closeCalendarTaskTooltip();
    return;
  }

  cancelCalendarTooltipClose();

  if (calendarTooltipTrigger !== trigger) {
    closeCalendarTaskTooltip();
  }

  calendarTooltipTrigger = trigger;
  calendarTooltipTaskId = task.id;
  elements.calendarTaskTooltip.replaceChildren(
    createCalendarTooltipContent(task),
  );
  elements.calendarTaskTooltip.hidden = false;
  trigger.setAttribute("aria-describedby", elements.calendarTaskTooltip.id);
  positionCalendarTaskTooltip();
}

function scheduleCalendarTooltipClose() {
  cancelCalendarTooltipClose();
  calendarTooltipCloseTimer = window.setTimeout(() => {
    calendarTooltipCloseTimer = null;

    const pointerRemainsInside =
      calendarTooltipTrigger?.matches(":hover") ||
      elements.calendarTaskTooltip.matches(":hover");
    const focusRemainsInside =
      calendarTooltipTrigger?.contains(document.activeElement) ||
      elements.calendarTaskTooltip.contains(document.activeElement);

    if (!pointerRemainsInside && !focusRemainsInside) {
      closeCalendarTaskTooltip();
    }
  }, 80);
}

function updateCalendarTaskTabStops() {
  const tabIndex = isCalendarDesktopView() ? 0 : -1;

  for (const pill of elements.calendarGrid.querySelectorAll(".calendar-task")) {
    pill.tabIndex = tabIndex;
  }

  if (tabIndex < 0) {
    closeCalendarTaskTooltip();
  }
}

function handleCalendarViewportChange() {
  updateCalendarTaskTabStops();

  if (isCalendarDesktopView()) {
    positionCalendarTaskTooltip();
  }
}

function createCalendarTaskPill(task, todayKey) {
  const pill = document.createElement("span");
  const title = document.createElement("span");
  const subjectLabel = getSubjectLabel(task.subjectId);
  const isOverdue = isTaskOverdueForCalendar(task, todayKey);

  pill.className = "calendar-task";
  pill.dataset.taskId = task.id;
  pill.tabIndex = isCalendarDesktopView() ? 0 : -1;
  pill.style.backgroundColor = getSubjectColor(task.subjectId);
  title.className = "calendar-task__title";
  title.textContent = task.title;

  if (isOverdue) {
    const overdueMark = document.createElement("span");

    pill.classList.add("calendar-task--overdue");
    overdueMark.className = "calendar-task__overdue-mark";
    overdueMark.textContent = "!";
    overdueMark.setAttribute("aria-hidden", "true");
    pill.append(overdueMark);
  }

  pill.append(title);
  pill.setAttribute(
    "aria-label",
    `${task.title}, ${subjectLabel}${isOverdue ? ", Просрочено" : ""}`,
  );
  pill.addEventListener("mouseenter", () =>
    openCalendarTaskTooltip(pill, task),
  );
  pill.addEventListener("mouseleave", scheduleCalendarTooltipClose);
  pill.addEventListener("focus", () => openCalendarTaskTooltip(pill, task));
  pill.addEventListener("blur", scheduleCalendarTooltipClose);
  pill.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeCalendarTaskTooltip();
    }
  });
  return pill;
}

function createCalendarDayButton(parts, tasks, todayKey) {
  const dateKey = toCalendarDateKey(parts);
  const fullDate = formatFullCalendarDate(parts);
  const isToday = dateKey === todayKey;
  const isSelected = dateKey === selectedCalendarDate;
  const cell = document.createElement("div");
  const button = document.createElement("button");
  const topline = document.createElement("span");
  const number = document.createElement("span");
  const labels = [];

  cell.className = "calendar-day";
  cell.dataset.date = dateKey;
  cell.setAttribute("aria-selected", String(isSelected));
  button.className = "calendar-day__button";
  button.type = "button";
  button.setAttribute("aria-selected", String(isSelected));
  topline.className = "calendar-day__topline";
  number.className = "calendar-day__number";
  number.textContent = String(parts.day);
  topline.append(number);

  if (isToday) {
    const todayLabel = document.createElement("span");

    cell.classList.add("calendar-day--today");
    button.setAttribute("aria-current", "date");
    todayLabel.className = "calendar-day__today-label";
    todayLabel.textContent = "Сегодня";
    topline.append(todayLabel);
    labels.push("Сегодня");
  }

  if (isSelected) {
    const selectedLabel = document.createElement("span");

    selectedLabel.className = "calendar-day__selected-label";
    selectedLabel.textContent = "Выбран";
    topline.append(selectedLabel);
    labels.push("Выбранный день");
  }

  button.append(topline);
  cell.append(button);

  if (tasks.length > 0) {
    const tasksWrapper = document.createElement("span");
    const count = document.createElement("span");

    tasksWrapper.className = "calendar-day__tasks";

    for (const task of tasks.slice(0, 3)) {
      tasksWrapper.append(createCalendarTaskPill(task, todayKey));
    }

    cell.append(tasksWrapper);

    if (tasks.length > 3) {
      const more = document.createElement("span");

      more.className = "calendar-day__more";
      more.textContent = `+ ещё ${tasks.length - 3}`;
      cell.append(more);
    }

    count.className = "calendar-day__count";
    count.textContent = String(tasks.length);
    count.setAttribute(
      "aria-label",
      `Активных задач: ${tasks.length}`,
    );
    button.append(count);
  }

  const tasksLabel =
    tasks.length === 0 ? "активных задач нет" : `активных задач: ${tasks.length}`;
  button.setAttribute(
    "aria-label",
    [fullDate, ...labels, tasksLabel].join(", "),
  );
  cell.addEventListener("click", (event) => {
    if (event.target.closest(".calendar-task")) {
      return;
    }

    selectedCalendarDate = dateKey;
    renderCalendar();
  });
  return cell;
}

function createCalendarWeekDay(parts, tasks, todayKey, weekdayIndex) {
  const dateKey = toCalendarDateKey(parts);
  const fullDate = formatFullCalendarDate(parts);
  const weekdayName = CALENDAR_WEEKDAY_NAMES[weekdayIndex];
  const isToday = dateKey === todayKey;
  const isSelected = dateKey === selectedCalendarDate;
  const cell = document.createElement("div");
  const button = document.createElement("button");
  const topline = document.createElement("span");
  const heading = document.createElement("span");
  const weekday = document.createElement("span");
  const date = document.createElement("span");
  const statuses = document.createElement("span");
  const labels = [];

  cell.className = "calendar-day calendar-week-day";
  cell.dataset.date = dateKey;
  cell.setAttribute("aria-selected", String(isSelected));
  button.className = "calendar-day__button calendar-week-day__button";
  button.type = "button";
  button.setAttribute("aria-selected", String(isSelected));
  topline.className = "calendar-day__topline calendar-week-day__topline";
  heading.className = "calendar-week-day__heading";
  weekday.className = "calendar-week-day__weekday";
  weekday.textContent = weekdayName;
  date.className = "calendar-week-day__date";
  date.textContent = `${parts.day} ${CALENDAR_MONTH_NAMES_GENITIVE[parts.month - 1]}`;
  statuses.className = "calendar-week-day__statuses";
  heading.append(weekday, date);
  topline.append(heading);

  if (isToday) {
    const todayLabel = document.createElement("span");

    cell.classList.add("calendar-day--today");
    button.setAttribute("aria-current", "date");
    todayLabel.className = "calendar-day__today-label";
    todayLabel.textContent = "Сегодня";
    statuses.append(todayLabel);
    labels.push("Сегодня");
  }

  if (isSelected) {
    const selectedLabel = document.createElement("span");

    selectedLabel.className = "calendar-day__selected-label";
    selectedLabel.textContent = "Выбран";
    statuses.append(selectedLabel);
    labels.push("Выбранный день");
  }

  if (labels.length > 0) {
    topline.append(statuses);
  }

  button.append(topline);
  cell.append(button);

  if (tasks.length > 0) {
    const tasksWrapper = document.createElement("span");

    tasksWrapper.className = "calendar-day__tasks";

    for (const task of tasks) {
      tasksWrapper.append(createCalendarTaskPill(task, todayKey));
    }

    cell.append(tasksWrapper);
  }

  const tasksLabel =
    tasks.length === 0 ? "активных задач нет" : `активных задач: ${tasks.length}`;

  button.setAttribute(
    "aria-label",
    [weekdayName, fullDate, ...labels, tasksLabel].join(", "),
  );
  cell.addEventListener("click", (event) => {
    if (event.target.closest(".calendar-task")) {
      return;
    }

    selectedCalendarDate = dateKey;
    renderCalendar();
  });
  return cell;
}

function createUnavailableCalendarWeekDay(weekdayIndex) {
  const cell = document.createElement("div");
  const weekday = document.createElement("span");
  const unavailable = document.createElement("span");
  const weekdayName = CALENDAR_WEEKDAY_NAMES[weekdayIndex];

  cell.className =
    "calendar-day calendar-week-day calendar-week-day--unavailable";
  cell.setAttribute("aria-disabled", "true");
  cell.setAttribute("aria-label", `${weekdayName}, дата недоступна`);
  weekday.className = "calendar-week-day__weekday";
  weekday.textContent = weekdayName;
  unavailable.className = "calendar-week-day__unavailable-label";
  unavailable.textContent = "Недоступно";
  cell.append(weekday, unavailable);
  return cell;
}

function createCalendarDayOverviewTask(task, todayParts) {
  const deadlineState = getDeadlineState(task, todayParts);
  const item = document.createElement("article");
  const heading = document.createElement("div");
  const marker = document.createElement("span");
  const title = document.createElement("h4");
  const details = document.createElement("p");

  item.className = "calendar-day-task";
  heading.className = "calendar-day-task__heading";
  marker.className = "calendar-day-task__marker";
  marker.style.backgroundColor = getSubjectColor(task.subjectId);
  marker.setAttribute("aria-hidden", "true");
  title.className = "calendar-day-task__title";
  title.textContent = task.title;
  details.className = "calendar-day-task__details";
  details.textContent = `${task.direction} · ${getSubjectLabel(task.subjectId)} · ${deadlineState.message}`;
  heading.append(marker, title);
  item.append(heading, details);

  if (deadlineState.kind === "overdue") {
    const overdue = document.createElement("p");

    item.classList.add("calendar-day-task--overdue");
    overdue.className = "calendar-day-task__overdue-text";
    overdue.textContent = "Просрочено";
    item.append(overdue);
  }

  return item;
}

function renderCalendarDayOverview(todayParts) {
  const selectedParts = parseCalendarDate(selectedCalendarDate);
  const selectedTasks = getSortedActiveTasks(
    appState.tasks.filter(
      (task) =>
        task.status === "active" &&
        task.currentDeadline === selectedCalendarDate,
    ),
  );
  const fragment = document.createDocumentFragment();

  elements.calendarSelectedDate.textContent = `Задачи на ${formatFullCalendarDate(selectedParts)}`;

  for (const task of selectedTasks) {
    fragment.append(createCalendarDayOverviewTask(task, todayParts));
  }

  elements.calendarSelectedTasks.replaceChildren(fragment);
  elements.calendarSelectedEmpty.hidden = selectedTasks.length > 0;
}

function updateCalendarNavigation() {
  const labels = CALENDAR_NAVIGATION_LABELS[calendarMode];

  if (!labels) {
    return;
  }

  elements.calendarPrevious.disabled = !canChangeCalendarPeriod(-1);
  elements.calendarNext.disabled = !canChangeCalendarPeriod(1);
  elements.calendarPrevious.setAttribute("aria-label", labels.previous);
  elements.calendarNext.setAttribute("aria-label", labels.next);
  elements.calendarPreviousLabel.textContent = labels.previous;
  elements.calendarNextLabel.textContent = labels.next;
}

function renderMonthCalendar(visibleDate, todayKey) {
  const { year: visibleYear, month: visibleMonth } = visibleDate;
  const daysInMonth = getDaysInMonth(visibleYear, visibleMonth);
  const firstDateKey = toCalendarDateKey({
    year: visibleYear,
    month: visibleMonth,
    day: 1,
  });
  const lastDateKey = toCalendarDateKey({
    year: visibleYear,
    month: visibleMonth,
    day: daysInMonth,
  });
  const monthTasks = getCalendarTasksForRange(firstDateKey, lastDateKey);
  const tasksByDate = groupCalendarTasksByDate(monthTasks);

  elements.calendarMonthLabel.textContent = `${CALENDAR_MONTH_NAMES[visibleMonth - 1]} ${visibleYear}`;
  renderCalendarLegend(monthTasks, "В этом месяце активных задач нет");

  const leadingEmptyCells = getMondayFirstOffset(visibleYear, visibleMonth);
  const totalCells = Math.ceil((leadingEmptyCells + daysInMonth) / 7) * 7;
  const fragment = document.createDocumentFragment();

  for (let cellIndex = 0; cellIndex < totalCells; cellIndex += 1) {
    const day = cellIndex - leadingEmptyCells + 1;

    if (day < 1 || day > daysInMonth) {
      const emptyCell = document.createElement("div");

      emptyCell.className = "calendar__empty-cell";
      emptyCell.setAttribute("aria-hidden", "true");
      fragment.append(emptyCell);
      continue;
    }

    const parts = { year: visibleYear, month: visibleMonth, day };
    const dateKey = toCalendarDateKey(parts);

    fragment.append(
      createCalendarDayButton(
        parts,
        tasksByDate.get(dateKey) ?? [],
        todayKey,
      ),
    );
  }

  elements.calendarGrid.replaceChildren(fragment);
}

function renderWeekCalendar(selectedParts, todayKey) {
  const weekDates = getCalendarWeekDates(selectedParts);
  const validWeekDates = weekDates.filter((parts) => parts !== null);

  if (validWeekDates.length === 0) {
    elements.calendarGrid.replaceChildren();
    return;
  }

  const firstDateKey = toCalendarDateKey(validWeekDates[0]);
  const lastDateKey = toCalendarDateKey(
    validWeekDates[validWeekDates.length - 1],
  );
  const weekTasks = getCalendarTasksForRange(firstDateKey, lastDateKey);
  const tasksByDate = groupCalendarTasksByDate(weekTasks);
  const fragment = document.createDocumentFragment();

  elements.calendarMonthLabel.textContent = formatCalendarWeekRange(
    validWeekDates[0],
    validWeekDates[validWeekDates.length - 1],
  );
  renderCalendarLegend(weekTasks, "На этой неделе активных задач нет");

  for (let weekdayIndex = 0; weekdayIndex < weekDates.length; weekdayIndex += 1) {
    const parts = weekDates[weekdayIndex];

    if (!parts) {
      fragment.append(createUnavailableCalendarWeekDay(weekdayIndex));
      continue;
    }

    const dateKey = toCalendarDateKey(parts);

    fragment.append(
      createCalendarWeekDay(
        parts,
        tasksByDate.get(dateKey) ?? [],
        todayKey,
        weekdayIndex,
      ),
    );
  }

  elements.calendarGrid.replaceChildren(fragment);
}

function renderCalendar() {
  closeCalendarTaskTooltip();

  const selectedParts = parseCalendarDate(selectedCalendarDate);

  if (!selectedParts) {
    return;
  }

  if (calendarMode !== "month" && calendarMode !== "week") {
    calendarMode = "month";
  }

  const todayParts = getLocalTodayParts();
  const todayKey = toCalendarDateKey(todayParts);

  elements.calendar.dataset.calendarMode = calendarMode;
  elements.calendarModeLabel.textContent = CALENDAR_MODE_LABELS[calendarMode];
  elements.calendarGrid.setAttribute(
    "aria-label",
    calendarMode === "week" ? "Дни недели" : "Дни месяца",
  );
  updateCalendarNavigation();

  if (calendarMode === "week") {
    renderWeekCalendar(selectedParts, todayKey);
  } else {
    renderMonthCalendar(selectedParts, todayKey);
  }

  updateCalendarTaskTabStops();
  renderCalendarDayOverview(todayParts);
}

function changeCalendarPeriod(periodDelta) {
  const selectedDate = parseCalendarDate(selectedCalendarDate);
  const nextDate = selectedDate
    ? getCalendarDateAfterPeriodChange(selectedDate, periodDelta)
    : null;

  if (!nextDate) {
    return;
  }

  selectedCalendarDate = toCalendarDateKey(nextDate);
  renderCalendar();
}

function showCalendarToday() {
  const todayParts = getLocalTodayParts();

  selectedCalendarDate = toCalendarDateKey(todayParts);
  renderCalendar();
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

class ApiError extends Error {
  constructor(status, data, message = "Ошибка запроса") {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

function getApiErrorMessage(error, fallback) {
  if (!(error instanceof ApiError)) {
    return fallback;
  }

  if (error.status === 0) {
    return "Не удалось связаться с сервером. Проверьте соединение и повторите попытку.";
  }

  if (error.status === 401) {
    return "Сессия завершена. Войдите снова.";
  }

  if (error.status === 403) {
    return "Сервер отклонил запрос. Обновите страницу и повторите попытку.";
  }

  if (error.status === 409) {
    return "Данные изменились в другом месте. Загружена актуальная версия.";
  }

  if (error.status === 422) {
    return "Проверьте заполненные данные.";
  }

  return fallback;
}

function requireReauthentication() {
  csrfToken = null;
  currentUser = null;
  showLogin("Сессия завершена. Войдите снова, чтобы продолжить.");
}

async function apiRequest(
  path,
  { method = "GET", body, withCsrf = false, handleUnauthorized = true } = {},
) {
  const headers = { Accept: "application/json" };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (withCsrf) {
    if (!csrfToken) {
      requireReauthentication();
      throw new ApiError(401, null, "Отсутствует CSRF-токен");
    }

    headers["X-CSRF-Token"] = csrfToken;
  }

  let response;

  try {
    response = await fetch(`${API_BASE_PATH}${path}`, {
      method,
      headers,
      credentials: "same-origin",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    throw new ApiError(0, null, error.message);
  }

  let data = null;

  if (response.status !== 204) {
    const contentType = response.headers.get("content-type") ?? "";

    data = contentType.includes("application/json")
      ? await response.json().catch(() => null)
      : await response.text().catch(() => "");
  }

  if (!response.ok) {
    if (response.status === 401 && handleUnauthorized) {
      requireReauthentication();
    }

    throw new ApiError(response.status, data);
  }

  return data;
}

function adaptServerState(value) {
  const profile = value?.profile;
  const subjectsAreValid =
    Array.isArray(value?.subjects) &&
    value.subjects.every(
      (subject) =>
        isPlainObject(subject) &&
        typeof subject.id === "string" &&
        typeof subject.name === "string" &&
        typeof subject.normalizedName === "string" &&
        typeof subject.isSystem === "boolean" &&
        Number.isInteger(subject.version),
    );
  const subjectIds = subjectsAreValid
    ? new Set(value.subjects.map((subject) => subject.id))
    : new Set();
  const tasksAreValid =
    Array.isArray(value?.tasks) &&
    value.tasks.every(
      (task) =>
        isPlainObject(task) &&
        typeof task.id === "string" &&
        typeof task.title === "string" &&
        DIRECTIONS.includes(task.direction) &&
        (task.subjectId === null || subjectIds.has(task.subjectId)) &&
        Object.hasOwn(DIFFICULTY_REWARDS, task.difficulty) &&
        Number.isFinite(task.xpReward) &&
        (task.status === "active" || task.status === "completed") &&
        isValidCalendarDate(task.originalDeadline) &&
        isValidCalendarDate(task.currentDeadline) &&
        Number.isInteger(task.postponementCount) &&
        typeof task.xpAwarded === "boolean" &&
        Number.isInteger(task.version) &&
        isValidServerUtcTimestamp(task.createdAt),
    );

  if (
    !isPlainObject(value) ||
    !isPlainObject(profile) ||
    typeof profile.userId !== "string" ||
    (profile.displayName !== null && typeof profile.displayName !== "string") ||
    !Number.isFinite(profile.totalXp) ||
    !Number.isInteger(profile.level) ||
    !subjectsAreValid ||
    !tasksAreValid ||
    !Number.isInteger(value.syncVersion)
  ) {
    throw new ApiError(0, value, "Сервер вернул некорректное состояние");
  }

  return {
    profile: { ...profile },
    subjects: value.subjects.map((subject) => ({ ...subject })),
    tasks: value.tasks.map((task) => ({ ...task })),
    syncVersion: value.syncVersion,
  };
}

async function loadServerState() {
  appState = adaptServerState(await apiRequest("/state"));
  renderAllServerState();
  return appState;
}

function setMutationPending(isPending) {
  mutationPending = isPending;
  elements.subjectForm.querySelector('button[type="submit"]').disabled = isPending;
  elements.taskFormSubmit.disabled = isPending;
  elements.taskFormCancel.disabled = isPending;

  for (const button of document.querySelectorAll(".task-card__action-button")) {
    button.disabled = isPending;
  }
}

function getProfileProgress(profile) {
  const xpInsideLevel = profile.totalXp % XP_PER_LEVEL;

  return {
    xpInsideLevel,
    xpToNextLevel: XP_PER_LEVEL - xpInsideLevel,
    progressPercent: xpInsideLevel,
  };
}

function showLoginError(message) {
  elements.loginError.textContent = message;
  elements.loginError.hidden = false;
  elements.loginInput.setAttribute("aria-invalid", "true");
  elements.passwordInput.setAttribute("aria-invalid", "true");
}

function clearLoginError() {
  elements.loginError.textContent = "";
  elements.loginError.hidden = true;
  elements.loginInput.removeAttribute("aria-invalid");
  elements.passwordInput.removeAttribute("aria-invalid");
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
  const actions = document.createElement("div");

  card.className = "task-card";
  header.className = "task-card__header";
  title.className = "task-card__title";
  badges.className = "task-card__badges";
  statusBadge.className = "task-badge";
  details.className = "task-card__details";
  actions.className = "task-card__actions";

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
    createTaskDetail("Предмет", getSubjectLabel(task.subjectId)),
    createTaskDetail("Дедлайн", formatCalendarDate(task.currentDeadline)),
    createTaskDetail(
      "Срок",
      deadlineState.message,
      ["task-card__detail--term", `task-card__detail--${deadlineState.kind}`],
    ),
    createTaskDetail("Сложность", DIFFICULTY_LABELS[task.difficulty]),
    createTaskDetail("Награда", `${task.xpReward} XP`),
  );

  card.append(header, details);

  if (task.postponementCount > 0) {
    const postponements = document.createElement("p");

    postponements.className = "task-card__postponements";
    postponements.textContent = `Переносов дедлайна: ${task.postponementCount}`;
    card.append(postponements);
  }

  if (task.status === "active") {
    const completeButton = document.createElement("button");
    const editButton = document.createElement("button");

    completeButton.className =
      "task-card__action-button task-card__complete-button";
    completeButton.type = "button";
    completeButton.disabled = mutationPending;
    completeButton.textContent = "Выполнено";
    completeButton.addEventListener("click", () => completeTask(task.id));
    editButton.className =
      "task-card__action-button task-card__edit-button";
    editButton.type = "button";
    editButton.disabled = mutationPending;
    editButton.textContent = "Редактировать";
    editButton.addEventListener("click", () => startEditingTask(task.id));
    actions.append(completeButton, editButton);
  }

  const deleteButton = document.createElement("button");

  deleteButton.className = "task-card__action-button task-card__delete-button";
  deleteButton.type = "button";
  deleteButton.disabled = mutationPending;
  deleteButton.textContent = "Удалить";
  deleteButton.addEventListener("click", () => deleteTask(task.id));
  actions.append(deleteButton);
  card.append(actions);

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
    (subjectFilter === FILTER_WITHOUT_SUBJECT && task.subjectId === null) ||
    (subjectFilter.startsWith(FILTER_SUBJECT_PREFIX) &&
      task.subjectId === subjectFilter.slice(FILTER_SUBJECT_PREFIX.length));

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

function closeEditingForTask(taskId) {
  if (editingTaskId !== taskId) {
    return;
  }

  setTaskFormCreateMode({ resetForm: true });
  setTaskFormPanelOpen(false);
  hideTaskFormStatus();
}

async function completeTask(taskId) {
  if (mutationPending) {
    return false;
  }

  const task = appState.tasks.find((candidate) => candidate.id === taskId);

  if (!task || task.status !== "active" || task.xpAwarded !== false) {
    return false;
  }

  setMutationPending(true);
  hideTaskFormStatus();

  try {
    await apiRequest(`/tasks/${encodeURIComponent(task.id)}/complete`, {
      method: "POST",
      body: { version: task.version },
      withCsrf: true,
    });
    closeEditingForTask(taskId);
    await loadServerState();
    return true;
  } catch (error) {
    if (error.status === 409) {
      await reloadAfterConflict();
    } else if (error.status !== 401) {
      showTaskFormStatus(
        getApiErrorMessage(error, "Не удалось выполнить задачу"),
        true,
      );
    }

    return false;
  } finally {
    setMutationPending(false);
  }
}

function getDeleteConfirmationMessage(task) {
  if (task.status === "completed") {
    return `Удалить выполненную задачу «${task.title}»? Будет вычтено ${task.xpReward} XP.`;
  }

  return `Удалить задачу «${task.title}»?`;
}

async function deleteTask(taskId) {
  if (mutationPending) {
    return false;
  }

  const task = appState.tasks.find((candidate) => candidate.id === taskId);

  if (!task || !window.confirm(getDeleteConfirmationMessage(task))) {
    return false;
  }

  setMutationPending(true);
  hideTaskFormStatus();

  try {
    await apiRequest(`/tasks/${encodeURIComponent(task.id)}`, {
      method: "DELETE",
      body: { version: task.version },
      withCsrf: true,
    });
    closeEditingForTask(taskId);
    await loadServerState();
    return true;
  } catch (error) {
    if (error.status === 409) {
      await reloadAfterConflict();
    } else if (error.status !== 401) {
      showTaskFormStatus(
        getApiErrorMessage(error, "Не удалось удалить задачу"),
        true,
      );
    }

    return false;
  } finally {
    setMutationPending(false);
  }
}

function renderTaskLists() {
  const statusFilter = elements.statusFilter.value;
  const directionFilter = elements.directionFilter.value;
  const subjectFilter = elements.subjectFilter.value;
  const todayParts = getLocalTodayParts();
  const activeTasks = getSortedActiveTasks(
    appState.tasks.filter(
      (task) =>
        task.status === "active" &&
        taskMatchesFilters(
          task,
          statusFilter,
          directionFilter,
          subjectFilter,
          todayParts,
        ),
    ),
  );
  const completedTasks = appState.tasks.filter(
    (task) => task.status === "completed",
  );
  const hasActiveTasks = appState.tasks.some((task) => task.status === "active");
  const hasCompletedTasks = appState.tasks.some(
    (task) => task.status === "completed",
  );

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
    hasVisibleActiveTasks && !activeTasksExpanded;
  updateFiltersResetButton();
  renderCalendar();
}

function renderSubjects() {
  const fragment = document.createDocumentFragment();

  for (const subject of getAllSubjects()) {
    const item = document.createElement("li");
    item.textContent = subject.name;
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
    options.push(
      createOption(`${FILTER_SUBJECT_PREFIX}${subject.id}`, subject.name),
    );
  }

  elements.subjectFilter.replaceChildren(...options);

  const availableValues = new Set([
    FILTER_ALL,
    FILTER_WITHOUT_SUBJECT,
    ...getAllSubjects().map(
      (subject) => `${FILTER_SUBJECT_PREFIX}${subject.id}`,
    ),
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
    options.push(createOption(subject.id, subject.name));
  }

  elements.taskSubjectSelect.replaceChildren(...options);
  elements.taskSubjectSelect.disabled = !directionIsSelected;
  elements.taskSubjectSelect.required = subjectIsRequired;
  elements.subjectRequiredMarker.hidden = !subjectIsRequired;

  if (directionIsSelected && getSubjectById(previousSubject)) {
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

function setTaskFormCreateMode({ resetForm = false } = {}) {
  editingTaskId = null;
  editingTaskVersionAtOpen = null;
  elements.taskFormHeading.textContent = "Новая задача";
  elements.taskFormContext.textContent = "";
  elements.taskFormContext.hidden = true;
  elements.taskFormSubmit.textContent = "Добавить задачу";
  elements.taskFormCancel.hidden = true;

  if (resetForm) {
    elements.taskForm.reset();
    clearTaskErrors();
    updateSubjectField();
    updateDifficultyPreview();
  }
}

function cancelTaskEditing({ closePanel = true } = {}) {
  setTaskFormCreateMode({ resetForm: true });
  hideTaskFormStatus();

  if (closePanel) {
    setTaskFormPanelOpen(false);
  }
}

function startEditingTask(taskId) {
  const task = appState.tasks.find(
    (candidate) => candidate.id === taskId && candidate.status === "active",
  );

  if (!task) {
    return;
  }

  editingTaskId = task.id;
  editingTaskVersionAtOpen = task.version;
  clearTaskErrors();
  hideTaskFormStatus();
  elements.taskForm.reset();
  elements.taskFormHeading.textContent = "Редактирование задачи";
  elements.taskFormContext.textContent = `Редактируется: ${task.title}`;
  elements.taskFormContext.hidden = false;
  elements.taskFormSubmit.textContent = "Сохранить изменения";
  elements.taskFormCancel.hidden = false;
  elements.taskTitleInput.value = task.title;
  elements.taskDirectionSelect.value = task.direction;
  updateSubjectField();
  elements.taskSubjectSelect.value = task.subjectId ?? "";
  elements.taskDifficultySelect.value = task.difficulty;
  elements.taskDeadlineInput.value = task.currentDeadline;
  updateDifficultyPreview();
  setActiveTasksExpanded(true);
  setTaskFormPanelOpen(true);
  elements.taskTitleInput.focus();
}

async function handleSubjectSubmit(event) {
  event.preventDefault();

  if (mutationPending) {
    return;
  }

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
    (subject) => normalizeForComparison(subject.name) === normalizedName,
  );

  if (subjectExists) {
    showFieldError(
      elements.subjectNameInput,
      elements.subjectNameError,
      "Такой предмет уже существует",
    );
    return;
  }

  setMutationPending(true);

  try {
    await apiRequest("/subjects", {
      method: "POST",
      body: { name: subjectName },
      withCsrf: true,
    });
    await loadServerState();
    elements.subjectNameInput.value = "";
  } catch (error) {
    if (error.status !== 401) {
      showFieldError(
        elements.subjectNameInput,
        elements.subjectNameError,
        getApiErrorMessage(error, "Не удалось сохранить предмет"),
      );
    }
  } finally {
    setMutationPending(false);
  }
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
  } else if (subject.length > 0 && !getSubjectById(subject)) {
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

async function reloadAfterConflict() {
  await loadServerState();
  setTaskFormCreateMode({ resetForm: true });
  setTaskFormPanelOpen(false);
  showTaskFormStatus(
    "Задача изменилась в другом месте. Актуальные данные загружены; откройте редактирование снова.",
    true,
  );
}

async function saveEditedTask(values) {
  const currentTask = appState.tasks.find(
    (task) => task.id === editingTaskId && task.status === "active",
  );

  if (!currentTask || !Number.isInteger(editingTaskVersionAtOpen)) {
    showTaskFormStatus("Не удалось найти активную задачу", true);
    return;
  }

  const nextSubjectId = values.subject || null;
  const payload = { version: editingTaskVersionAtOpen };
  const changedFields = {
    title: values.title,
    direction: values.direction,
    subjectId: nextSubjectId,
    difficulty: values.difficulty,
    deadline: values.deadline,
  };

  for (const [field, value] of Object.entries(changedFields)) {
    const currentValue = field === "deadline"
      ? currentTask.currentDeadline
      : currentTask[field];

    if (value !== currentValue) {
      payload[field] = value;
    }
  }

  setMutationPending(true);

  try {
    await apiRequest(`/tasks/${encodeURIComponent(currentTask.id)}`, {
      method: "PATCH",
      body: payload,
      withCsrf: true,
    });
    await loadServerState();
    setTaskFormCreateMode({ resetForm: true });
    setTaskFormPanelOpen(false);
    showTaskFormStatus("Изменения сохранены");
  } catch (error) {
    if (error.status === 409) {
      await reloadAfterConflict();
    } else if (error.status !== 401) {
      showTaskFormStatus(
        getApiErrorMessage(error, "Не удалось сохранить изменения"),
        true,
      );
    }
  } finally {
    setMutationPending(false);
  }
}

async function handleTaskSubmit(event) {
  event.preventDefault();

  if (mutationPending) {
    return;
  }

  hideTaskFormStatus();

  const { isValid, values } = validateTaskForm();

  if (!isValid) {
    return;
  }

  if (editingTaskId !== null) {
    await saveEditedTask(values);
    return;
  }

  const payload = {
    title: values.title,
    direction: values.direction,
    subjectId: values.subject || null,
    difficulty: values.difficulty,
    deadline: values.deadline,
  };
  setMutationPending(true);

  try {
    await apiRequest("/tasks", {
      method: "POST",
      body: payload,
      withCsrf: true,
    });
    await loadServerState();
    elements.taskForm.reset();
    updateSubjectField();
    updateDifficultyPreview();
    setActiveTasksExpanded(true);
    renderTaskLists();
    setTaskFormPanelOpen(false);
    showTaskFormStatus("Задача сохранена");
  } catch (error) {
    if (error.status !== 401) {
      showTaskFormStatus(
        getApiErrorMessage(error, "Не удалось сохранить задачу"),
        true,
      );
    }
  } finally {
    setMutationPending(false);
  }
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
  if (editingTaskId !== null) {
    cancelTaskEditing({ closePanel: false });
    setTaskFormPanelOpen(true);
    elements.taskTitleInput.focus();
    return;
  }

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

function setActiveMainTab(tabName, { moveFocus = false } = {}) {
  if (!MAIN_TAB_NAMES.includes(tabName)) {
    return;
  }

  activeMainTab = tabName;
  closeCalendarTaskTooltip();
  setSettingsPanelOpen(false);

  for (const tab of elements.mainTabs) {
    const isActive = tab.dataset.mainTab === tabName;
    const panelId = tab.getAttribute("aria-controls");
    const panel = document.querySelector(`#${panelId}`);

    tab.setAttribute("aria-selected", String(isActive));
    tab.tabIndex = isActive ? 0 : -1;
    panel.hidden = !isActive;

    if (isActive && moveFocus) {
      tab.focus();
    }
  }
}

function handleMainTabClick(event) {
  setActiveMainTab(event.currentTarget.dataset.mainTab);
}

function handleMainTabKeydown(event) {
  const currentIndex = MAIN_TAB_NAMES.indexOf(
    event.currentTarget.dataset.mainTab,
  );
  let nextIndex = null;

  if (event.key === "ArrowLeft") {
    nextIndex = (currentIndex - 1 + MAIN_TAB_NAMES.length) % MAIN_TAB_NAMES.length;
  } else if (event.key === "ArrowRight") {
    nextIndex = (currentIndex + 1) % MAIN_TAB_NAMES.length;
  } else if (event.key === "Home") {
    nextIndex = 0;
  } else if (event.key === "End") {
    nextIndex = MAIN_TAB_NAMES.length - 1;
  }

  if (nextIndex === null) {
    return;
  }

  event.preventDefault();
  setActiveMainTab(MAIN_TAB_NAMES[nextIndex], { moveFocus: true });
}

function handleDocumentKeydown(event) {
  if (event.key !== "Escape") {
    return;
  }

  let focusTarget = null;

  if (activeMainTab === "tasks") {
    if (!elements.taskFormPanel.hidden) {
      if (editingTaskId !== null) {
        cancelTaskEditing();
      } else {
        setTaskFormPanelOpen(false);
      }
      focusTarget = elements.taskFormToggle;
    }

    if (!elements.filtersPanel.hidden) {
      setFiltersPanelOpen(false);
      focusTarget ??= elements.filtersToggle;
    }
  }

  if (!elements.settingsPanel.hidden) {
    setSettingsPanelOpen(false);
    focusTarget ??= elements.settingsButton;
  }

  focusTarget?.focus();
}

function showAuthLoading() {
  elements.authLoading.hidden = false;
  elements.loginPanel.hidden = true;
  elements.mainInterface.hidden = true;
  elements.profileGreeting.hidden = true;
  elements.settingsButton.hidden = true;
  elements.logoutButton.hidden = true;
  setSettingsPanelOpen(false);
}

function showLogin(message = "") {
  elements.authLoading.hidden = true;
  elements.loginPanel.hidden = false;
  elements.mainInterface.hidden = true;
  elements.profileGreeting.hidden = true;
  elements.settingsButton.hidden = true;
  elements.logoutButton.hidden = true;
  setSettingsPanelOpen(false);

  if (message) {
    showLoginError(message);
  }
}

function showMainInterface() {
  elements.authLoading.hidden = true;
  elements.loginPanel.hidden = true;
  elements.mainInterface.hidden = false;
  elements.profileGreeting.hidden = false;
  elements.settingsButton.hidden = false;
  elements.logoutButton.hidden = false;
}

function renderProfile() {
  const { profile } = appState;
  const { xpInsideLevel, xpToNextLevel, progressPercent } =
    getProfileProgress(profile);

  elements.profileName.textContent = profile.displayName || "пользователь";
  elements.profileLevel.textContent = String(profile.level);
  elements.profileTotalXp.textContent = String(profile.totalXp);
  elements.profileXpToNext.textContent = String(xpToNextLevel);
  elements.profileProgressText.textContent = `${xpInsideLevel} из 100 XP`;
  elements.profileProgress.value = progressPercent;
  elements.profileProgress.textContent = `${progressPercent}%`;
  elements.profileProgress.setAttribute("aria-valuenow", String(progressPercent));
  elements.profileProgress.setAttribute(
    "aria-valuetext",
    `${xpInsideLevel} из 100 XP`,
  );
}

function renderAllServerState() {
  renderSubjects();
  renderSubjectFilterOptions();
  updateSubjectField();
  updateDifficultyPreview();
  renderProfile();
  renderTaskLists();
}

function setAuthRequestPending(isPending) {
  authRequestPending = isPending;
  elements.loginSubmit.disabled = isPending;
  elements.loginInput.disabled = isPending;
  elements.passwordInput.disabled = isPending;
  elements.logoutButton.disabled = isPending;
}

async function handleLoginSubmit(event) {
  event.preventDefault();

  if (authRequestPending) {
    return;
  }

  const login = elements.loginInput.value.trim();
  const password = elements.passwordInput.value;

  clearLoginError();

  if (!login || !password) {
    showLoginError("Введите логин и пароль");
    return;
  }

  setAuthRequestPending(true);
  let credentialsAccepted = false;

  try {
    const auth = await apiRequest("/auth/login", {
      method: "POST",
      body: { login, password },
      handleUnauthorized: false,
    });

    csrfToken = auth.csrfToken;
    currentUser = auth;
    credentialsAccepted = true;
    await loadServerState();
    setActiveMainTab("tasks");
    elements.passwordInput.value = "";
    clearLoginError();
    showMainInterface();
  } catch (error) {
    const message = error.status === 401 && !credentialsAccepted
      ? "Неверный логин или пароль"
      : getApiErrorMessage(error, "Не удалось войти. Повторите попытку.");

    showLogin(message);
  } finally {
    setAuthRequestPending(false);
  }
}

async function restoreSession() {
  showAuthLoading();

  try {
    currentUser = await apiRequest("/auth/me", {
      handleUnauthorized: false,
    });
    const csrf = await apiRequest("/auth/csrf", {
      method: "POST",
      handleUnauthorized: false,
    });

    csrfToken = csrf.csrfToken;
    await loadServerState();
    showMainInterface();
  } catch (error) {
    csrfToken = null;
    currentUser = null;
    showLogin(
      error.status === 401
        ? ""
        : getApiErrorMessage(error, "Не удалось проверить сессию."),
    );
  }
}

async function handleLogout() {
  if (authRequestPending || mutationPending) {
    return;
  }

  setAuthRequestPending(true);

  try {
    await apiRequest("/auth/logout", {
      method: "POST",
      withCsrf: true,
    });
    csrfToken = null;
    currentUser = null;
    appState = createEmptyState();
    setTaskFormCreateMode({ resetForm: true });
    setTaskFormPanelOpen(false);
    setFiltersPanelOpen(false);
    setActiveMainTab("tasks");
    elements.loginForm.reset();
    clearLoginError();
    showLogin();
  } catch (error) {
    if (error.status !== 401) {
      showTaskFormStatus(
        getApiErrorMessage(error, "Не удалось выйти. Повторите попытку."),
        true,
      );
    }
  } finally {
    setAuthRequestPending(false);
  }
}

async function initializeApp() {
  elements.loginForm.addEventListener("submit", handleLoginSubmit);
  elements.loginForm.addEventListener("input", clearLoginError);
  elements.logoutButton.addEventListener("click", handleLogout);
  for (const tab of elements.mainTabs) {
    tab.addEventListener("click", handleMainTabClick);
    tab.addEventListener("keydown", handleMainTabKeydown);
  }
  elements.settingsButton.addEventListener("click", toggleSettingsPanel);
  elements.taskFormToggle.addEventListener("click", toggleTaskFormPanel);
  elements.taskFormCancel.addEventListener("click", () => cancelTaskEditing());
  elements.filtersToggle.addEventListener("click", toggleFiltersPanel);
  elements.filtersResetButton.addEventListener("click", resetFilters);
  elements.activeListToggle.addEventListener("click", toggleActiveTasks);
  elements.calendarTaskTooltip.addEventListener(
    "mouseenter",
    cancelCalendarTooltipClose,
  );
  elements.calendarTaskTooltip.addEventListener(
    "mouseleave",
    scheduleCalendarTooltipClose,
  );
  elements.calendarTaskTooltip.addEventListener(
    "focusin",
    cancelCalendarTooltipClose,
  );
  elements.calendarTaskTooltip.addEventListener(
    "focusout",
    scheduleCalendarTooltipClose,
  );
  elements.calendarTaskTooltip.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeCalendarTaskTooltip();
    }
  });
  elements.calendarPrevious.addEventListener("click", () =>
    changeCalendarPeriod(-1),
  );
  elements.calendarToday.addEventListener("click", showCalendarToday);
  elements.calendarNext.addEventListener("click", () => changeCalendarPeriod(1));
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
  window.addEventListener("resize", handleCalendarViewportChange);
  window.addEventListener("scroll", positionCalendarTaskTooltip, true);

  updateSubjectField();
  updateDifficultyPreview();
  setActiveMainTab("tasks");
  await restoreSession();
}

initializeApp();
