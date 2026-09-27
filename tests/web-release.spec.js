const { test, expect } = require("@playwright/test");
const stateFixture = require("./fixtures/state.json");

const LOCAL_ORIGIN = "http://127.0.0.1:4173";
const API_PREFIX = "/api/v1";
const TEST_CSRF_TOKEN = "test-csrf-token";
const TEST_LOGIN = "test-user";
const TEST_PASSWORD = "test-password";
const TEST_SESSION_EXPIRES_AT = "2099-01-01T00:00:00.000Z";
const DIRECTIONS = new Set([
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
const SYSTEM_SUBJECT_ORDER = new Map([
  ["Русский язык", 0],
  ["Математика", 1],
]);

const STATIC_API_ROUTES = new Map([
  ["GET /api/v1/auth/me", "authMe"],
  ["POST /api/v1/auth/csrf", "authCsrf"],
  ["POST /api/v1/auth/login", "authLogin"],
  ["POST /api/v1/auth/logout", "authLogout"],
  ["GET /api/v1/state", "getState"],
  ["POST /api/v1/subjects", "createSubject"],
  ["POST /api/v1/tasks", "createTask"],
]);

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createMockState() {
  return deepClone(stateFixture);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function createSyntheticUser(profile) {
  return {
    userId: profile.userId,
    login: TEST_LOGIN,
    accountType: "personal",
    setupRequired: false,
    displayName: profile.displayName,
    sessionExpiresAt: TEST_SESSION_EXPIRES_AT,
  };
}

function createApiMockController({ state = createMockState(), authenticated = true } = {}) {
  const mockState = deepClone(state);
  const controller = {
    state: mockState,
    auth: {
      authenticated,
      currentUser: createSyntheticUser(mockState.profile),
    },
    credentials: {
      login: TEST_LOGIN,
      password: TEST_PASSWORD,
    },
    csrfToken: authenticated ? TEST_CSRF_TOKEN : null,
    requests: [],
    unexpectedRequests: [],
    errors: [],
    routeOverrides: new Map(),
    subjectSequence: 1,
    taskSequence: 1,
    timestampSequence: 0,
  };

  controller.setRouteOverride = (method, pathname, handler) => {
    if (typeof handler !== "function") {
      throw new TypeError("Route override must be a function.");
    }

    controller.routeOverrides.set(`${method.toUpperCase()} ${pathname}`, handler);
  };
  controller.clearRouteOverride = (method, pathname) => {
    controller.routeOverrides.delete(`${method.toUpperCase()} ${pathname}`);
  };
  controller.assertNoUnexpectedRequests = () => {
    expect(
      controller.unexpectedRequests,
      JSON.stringify(controller.unexpectedRequests, null, 2),
    ).toEqual([]);
  };

  return controller;
}

function getApiRoute(method, pathname) {
  const staticRoute = STATIC_API_ROUTES.get(`${method} ${pathname}`);

  if (staticRoute) {
    return { name: staticRoute };
  }

  const completeMatch = /^\/api\/v1\/tasks\/([^/]+)\/complete$/.exec(pathname);

  if (method === "POST" && completeMatch) {
    const taskId = decodePathSegment(completeMatch[1]);

    if (taskId === null) {
      return null;
    }

    return {
      name: "completeTask",
      taskId,
    };
  }

  const taskMatch = /^\/api\/v1\/tasks\/([^/]+)$/.exec(pathname);

  if (taskMatch && (method === "PATCH" || method === "DELETE")) {
    const taskId = decodePathSegment(taskMatch[1]);

    if (taskId === null) {
      return null;
    }

    return {
      name: method === "PATCH" ? "updateTask" : "deleteTask",
      taskId,
    };
  }

  return null;
}

function decodePathSegment(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function parseRequestBody(request) {
  const rawBody = request.postData();

  if (rawBody === null) {
    return { present: false, valid: true, value: undefined };
  }

  try {
    return { present: true, valid: true, value: JSON.parse(rawBody) };
  } catch {
    return { present: true, valid: false, value: undefined };
  }
}

function sanitizeBodyForJournal(pathname, bodyResult) {
  if (!bodyResult.present) {
    return undefined;
  }

  if (!bodyResult.valid) {
    return "[invalid-json]";
  }

  if (pathname === "/api/v1/auth/login" && isPlainObject(bodyResult.value)) {
    return {
      login: bodyResult.value.login,
      password: "[synthetic-redacted]",
    };
  }

  return deepClone(bodyResult.value);
}

async function fulfillJson(route, status, value) {
  await route.fulfill({
    status,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(value),
  });
}

async function fulfillEmpty(route, status = 204) {
  await route.fulfill({ status });
}

async function fulfillApiError(route, controller, requestInfo, status, detail) {
  controller.errors.push({
    method: requestInfo.method,
    pathname: requestInfo.pathname,
    status,
    detail,
  });
  await fulfillJson(route, status, { detail });
}

function hasAllowedKeys(value, requiredKeys, optionalKeys = []) {
  if (!isPlainObject(value)) {
    return false;
  }

  const allowedKeys = new Set([...requiredKeys, ...optionalKeys]);
  return (
    requiredKeys.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowedKeys.has(key))
  );
}

function isValidDateKey(value) {
  if (typeof value !== "string") {
    return false;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const daysInMonth = [
    31,
    year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];

  return year >= 1 && year <= 9999 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth[month - 1];
}

function normalizeSubjectName(value) {
  return value.trim().toLocaleLowerCase("ru-RU");
}

function compareSubjects(left, right) {
  if (left.isSystem !== right.isSystem) {
    return left.isSystem ? -1 : 1;
  }

  const leftOrder = SYSTEM_SUBJECT_ORDER.get(left.name) ?? 2;
  const rightOrder = SYSTEM_SUBJECT_ORDER.get(right.name) ?? 2;

  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }

  return left.normalizedName.localeCompare(right.normalizedName, "ru-RU");
}

function isValidSubjectSelection(state, direction, subjectId) {
  if (REQUIRED_SUBJECT_DIRECTIONS.has(direction) && subjectId === null) {
    return false;
  }

  return (
    subjectId === null ||
    state.subjects.some((subject) => subject.id === subjectId)
  );
}

function nextSyntheticTimestamp(controller) {
  const timestamp = new Date(
    Date.UTC(2030, 0, 1, 0, 0, controller.timestampSequence),
  ).toISOString();

  controller.timestampSequence += 1;
  return timestamp;
}

function nextSyntheticId(controller, kind) {
  const collection = kind === "subject" ? controller.state.subjects : controller.state.tasks;
  const sequenceKey = kind === "subject" ? "subjectSequence" : "taskSequence";
  let id;

  do {
    id = `test-${kind}-created-${String(controller[sequenceKey]).padStart(3, "0")}`;
    controller[sequenceKey] += 1;
  } while (collection.some((item) => item.id === id));

  return id;
}

function bumpSyncVersion(controller) {
  controller.state.syncVersion += 1;
}

function recalculateProfile(controller) {
  const totalXp = controller.state.tasks
    .filter((task) => task.status === "completed" && task.xpAwarded)
    .reduce((sum, task) => sum + task.xpReward, 0);

  controller.state.profile.totalXp = totalXp;
  controller.state.profile.level = Math.floor(totalXp / 100) + 1;
}

async function requireAuthenticated(route, controller, requestInfo) {
  if (controller.auth.authenticated) {
    return true;
  }

  await fulfillApiError(route, controller, requestInfo, 401, "Not authenticated");
  return false;
}

async function requireMutationAccess(route, controller, request, requestInfo) {
  if (!(await requireAuthenticated(route, controller, requestInfo))) {
    return false;
  }

  if (request.headers()["x-csrf-token"] !== controller.csrfToken) {
    await fulfillApiError(route, controller, requestInfo, 403, "Invalid CSRF token");
    return false;
  }

  return true;
}

async function handleAuthMe(route, controller, requestInfo) {
  if (!(await requireAuthenticated(route, controller, requestInfo))) {
    return;
  }

  await fulfillJson(route, 200, deepClone(controller.auth.currentUser));
}

async function handleAuthCsrf(route, controller, requestInfo) {
  if (!(await requireAuthenticated(route, controller, requestInfo))) {
    return;
  }

  controller.csrfToken = TEST_CSRF_TOKEN;
  await fulfillJson(route, 200, { csrfToken: controller.csrfToken });
}

async function handleAuthLogin(route, controller, requestInfo, bodyResult) {
  const body = bodyResult.value;
  const hasValidShape =
    bodyResult.valid && hasAllowedKeys(body, ["login", "password"]);

  if (
    !hasValidShape ||
    body.login !== controller.credentials.login ||
    body.password !== controller.credentials.password
  ) {
    await fulfillApiError(route, controller, requestInfo, 401, "Invalid credentials");
    return;
  }

  controller.auth.authenticated = true;
  controller.csrfToken = TEST_CSRF_TOKEN;
  await fulfillJson(route, 200, {
    ...deepClone(controller.auth.currentUser),
    csrfToken: controller.csrfToken,
  });
}

async function handleAuthLogout(route, controller, request, requestInfo) {
  if (!(await requireMutationAccess(route, controller, request, requestInfo))) {
    return;
  }

  controller.auth.authenticated = false;
  controller.csrfToken = null;
  await fulfillEmpty(route);
}

async function handleGetState(route, controller, requestInfo) {
  if (!(await requireAuthenticated(route, controller, requestInfo))) {
    return;
  }

  await fulfillJson(route, 200, deepClone(controller.state));
}

async function handleCreateSubject(route, controller, request, requestInfo, bodyResult) {
  if (!(await requireMutationAccess(route, controller, request, requestInfo))) {
    return;
  }

  const body = bodyResult.value;

  if (
    !bodyResult.valid ||
    !hasAllowedKeys(body, ["name"]) ||
    typeof body.name !== "string" ||
    body.name.trim().length < 1 ||
    body.name.trim().length > 64
  ) {
    await fulfillApiError(route, controller, requestInfo, 422, "Invalid subject payload");
    return;
  }

  const name = body.name.trim();
  const normalizedName = normalizeSubjectName(name);

  if (controller.state.subjects.some((subject) => subject.normalizedName === normalizedName)) {
    await fulfillApiError(route, controller, requestInfo, 409, "Subject already exists");
    return;
  }

  const timestamp = nextSyntheticTimestamp(controller);
  const subject = {
    id: nextSyntheticId(controller, "subject"),
    name,
    normalizedName,
    isSystem: false,
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  controller.state.subjects.push(subject);
  controller.state.subjects.sort(compareSubjects);
  bumpSyncVersion(controller);
  await fulfillJson(route, 201, deepClone(subject));
}

function validateTaskCreatePayload(state, body) {
  if (
    !hasAllowedKeys(
      body,
      ["title", "direction", "difficulty", "deadline"],
      ["subjectId"],
    ) ||
    typeof body.title !== "string" ||
    body.title.trim().length < 1 ||
    body.title.trim().length > 200 ||
    !DIRECTIONS.has(body.direction) ||
    !Object.hasOwn(DIFFICULTY_REWARDS, body.difficulty) ||
    !isValidDateKey(body.deadline)
  ) {
    return false;
  }

  const subjectId = body.subjectId ?? null;
  return isValidSubjectSelection(state, body.direction, subjectId);
}

async function handleCreateTask(route, controller, request, requestInfo, bodyResult) {
  if (!(await requireMutationAccess(route, controller, request, requestInfo))) {
    return;
  }

  const body = bodyResult.value;

  if (!bodyResult.valid || !validateTaskCreatePayload(controller.state, body)) {
    await fulfillApiError(route, controller, requestInfo, 422, "Invalid task payload");
    return;
  }

  const timestamp = nextSyntheticTimestamp(controller);
  const task = {
    id: nextSyntheticId(controller, "task"),
    title: body.title.trim(),
    direction: body.direction,
    subjectId: body.subjectId ?? null,
    difficulty: body.difficulty,
    xpReward: DIFFICULTY_REWARDS[body.difficulty],
    status: "active",
    originalDeadline: body.deadline,
    currentDeadline: body.deadline,
    postponementCount: 0,
    xpAwarded: false,
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
  };

  controller.state.tasks.unshift(task);
  bumpSyncVersion(controller);
  await fulfillJson(route, 201, deepClone(task));
}

function validateTaskUpdatePayload(state, task, body) {
  if (!isPlainObject(body)) {
    return false;
  }

  const allowedFields = [
    "version",
    "title",
    "direction",
    "subjectId",
    "difficulty",
    "deadline",
  ];
  const changedFields = Object.keys(body).filter((field) => field !== "version");

  if (
    !Object.keys(body).every((field) => allowedFields.includes(field)) ||
    !Number.isInteger(body.version) ||
    body.version < 1 ||
    changedFields.length === 0
  ) {
    return false;
  }

  if (
    (Object.hasOwn(body, "title") &&
      (typeof body.title !== "string" ||
        body.title.trim().length < 1 ||
        body.title.trim().length > 200)) ||
    (Object.hasOwn(body, "direction") && !DIRECTIONS.has(body.direction)) ||
    (Object.hasOwn(body, "difficulty") &&
      !Object.hasOwn(DIFFICULTY_REWARDS, body.difficulty)) ||
    (Object.hasOwn(body, "deadline") && !isValidDateKey(body.deadline)) ||
    (Object.hasOwn(body, "subjectId") &&
      body.subjectId !== null &&
      typeof body.subjectId !== "string")
  ) {
    return false;
  }

  const direction = body.direction ?? task.direction;
  const subjectId = Object.hasOwn(body, "subjectId")
    ? body.subjectId
    : task.subjectId;

  return isValidSubjectSelection(state, direction, subjectId);
}

async function handleUpdateTask(route, controller, request, requestInfo, bodyResult, taskId) {
  if (!(await requireMutationAccess(route, controller, request, requestInfo))) {
    return;
  }

  const task = controller.state.tasks.find(
    (candidate) => candidate.id === taskId && candidate.status === "active",
  );

  if (!task) {
    await fulfillApiError(route, controller, requestInfo, 404, "Task not found");
    return;
  }

  const body = bodyResult.value;

  if (!bodyResult.valid || !validateTaskUpdatePayload(controller.state, task, body)) {
    await fulfillApiError(route, controller, requestInfo, 422, "Invalid task update payload");
    return;
  }

  if (body.version !== task.version) {
    await fulfillApiError(route, controller, requestInfo, 409, "Task version is stale");
    return;
  }

  if (Object.hasOwn(body, "title")) {
    task.title = body.title.trim();
  }
  if (Object.hasOwn(body, "direction")) {
    task.direction = body.direction;
  }
  if (Object.hasOwn(body, "subjectId")) {
    task.subjectId = body.subjectId;
  }
  if (Object.hasOwn(body, "difficulty")) {
    task.difficulty = body.difficulty;
    task.xpReward = DIFFICULTY_REWARDS[body.difficulty];
  }
  if (Object.hasOwn(body, "deadline")) {
    if (body.deadline > task.currentDeadline) {
      task.postponementCount += 1;
    }
    task.currentDeadline = body.deadline;
  }

  task.version += 1;
  task.updatedAt = nextSyntheticTimestamp(controller);
  bumpSyncVersion(controller);
  await fulfillJson(route, 200, deepClone(task));
}

function isValidVersionPayload(bodyResult) {
  return (
    bodyResult.valid &&
    hasAllowedKeys(bodyResult.value, ["version"]) &&
    Number.isInteger(bodyResult.value.version) &&
    bodyResult.value.version >= 1
  );
}

async function handleCompleteTask(route, controller, request, requestInfo, bodyResult, taskId) {
  if (!(await requireMutationAccess(route, controller, request, requestInfo))) {
    return;
  }

  const task = controller.state.tasks.find(
    (candidate) => candidate.id === taskId && candidate.status === "active",
  );

  if (!task) {
    await fulfillApiError(route, controller, requestInfo, 404, "Task not found");
    return;
  }

  if (!isValidVersionPayload(bodyResult)) {
    await fulfillApiError(route, controller, requestInfo, 422, "Invalid version payload");
    return;
  }

  if (bodyResult.value.version !== task.version || task.xpAwarded) {
    await fulfillApiError(route, controller, requestInfo, 409, "Task version is stale");
    return;
  }

  task.status = "completed";
  task.xpAwarded = true;
  task.version += 1;
  task.updatedAt = nextSyntheticTimestamp(controller);
  bumpSyncVersion(controller);
  recalculateProfile(controller);
  await fulfillJson(route, 200, deepClone(task));
}

async function handleDeleteTask(route, controller, request, requestInfo, bodyResult, taskId) {
  if (!(await requireMutationAccess(route, controller, request, requestInfo))) {
    return;
  }

  const taskIndex = controller.state.tasks.findIndex(
    (candidate) => candidate.id === taskId,
  );

  if (taskIndex === -1) {
    await fulfillApiError(route, controller, requestInfo, 404, "Task not found");
    return;
  }

  const task = controller.state.tasks[taskIndex];

  if (!isValidVersionPayload(bodyResult)) {
    await fulfillApiError(route, controller, requestInfo, 422, "Invalid version payload");
    return;
  }

  if (bodyResult.value.version !== task.version) {
    await fulfillApiError(route, controller, requestInfo, 409, "Task version is stale");
    return;
  }

  const timestamp = nextSyntheticTimestamp(controller);

  task.version += 1;
  task.updatedAt = timestamp;
  task.deletedAt = timestamp;
  controller.state.tasks.splice(taskIndex, 1);
  bumpSyncVersion(controller);
  recalculateProfile(controller);
  await fulfillEmpty(route);
}

async function handleApiRequest(route, controller, request, url, apiRoute) {
  const method = request.method();
  const pathname = url.pathname;
  const requestInfo = { method, pathname };
  const bodyResult = parseRequestBody(request);
  const journalEntry = { method, pathname };
  const journalBody = sanitizeBodyForJournal(pathname, bodyResult);

  if (journalBody !== undefined) {
    journalEntry.body = journalBody;
  }
  controller.requests.push(journalEntry);

  const override = controller.routeOverrides.get(`${method} ${pathname}`);

  if (override) {
    await override({
      route,
      request,
      controller,
      body: bodyResult.valid ? bodyResult.value : undefined,
    });
    return;
  }

  if (apiRoute.name === "authMe") {
    await handleAuthMe(route, controller, requestInfo);
  } else if (apiRoute.name === "authCsrf") {
    await handleAuthCsrf(route, controller, requestInfo);
  } else if (apiRoute.name === "authLogin") {
    await handleAuthLogin(route, controller, requestInfo, bodyResult);
  } else if (apiRoute.name === "authLogout") {
    await handleAuthLogout(route, controller, request, requestInfo);
  } else if (apiRoute.name === "getState") {
    await handleGetState(route, controller, requestInfo);
  } else if (apiRoute.name === "createSubject") {
    await handleCreateSubject(route, controller, request, requestInfo, bodyResult);
  } else if (apiRoute.name === "createTask") {
    await handleCreateTask(route, controller, request, requestInfo, bodyResult);
  } else if (apiRoute.name === "updateTask") {
    await handleUpdateTask(
      route,
      controller,
      request,
      requestInfo,
      bodyResult,
      apiRoute.taskId,
    );
  } else if (apiRoute.name === "completeTask") {
    await handleCompleteTask(
      route,
      controller,
      request,
      requestInfo,
      bodyResult,
      apiRoute.taskId,
    );
  } else if (apiRoute.name === "deleteTask") {
    await handleDeleteTask(
      route,
      controller,
      request,
      requestInfo,
      bodyResult,
      apiRoute.taskId,
    );
  }
}

async function installApiMock(page, controller) {
  await page.route("**/*", async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());

    if (url.origin !== LOCAL_ORIGIN) {
      controller.unexpectedRequests.push({
        method,
        origin: url.origin,
        pathname: url.pathname,
        reason: "External origin is blocked",
      });
      await route.abort("blockedbyclient");
      return;
    }

    if (url.pathname.startsWith(`${API_PREFIX}/`) || url.pathname === API_PREFIX) {
      const apiRoute = getApiRoute(method, url.pathname);

      if (!apiRoute) {
        controller.unexpectedRequests.push({
          method,
          origin: url.origin,
          pathname: url.pathname,
          reason: "Unexpected API request",
        });
        await fulfillJson(route, 501, { detail: "Unexpected mocked API request" });
        return;
      }

      try {
        await handleApiRequest(route, controller, request, url, apiRoute);
      } catch (error) {
        controller.errors.push({
          method,
          pathname: url.pathname,
          status: 0,
          detail: error instanceof Error ? error.message : String(error),
        });
        await route.abort("failed");
      }
      return;
    }

    if (method !== "GET" && method !== "HEAD") {
      controller.unexpectedRequests.push({
        method,
        origin: url.origin,
        pathname: url.pathname,
        reason: "Unexpected local non-API request",
      });
      await route.abort("blockedbyclient");
      return;
    }

    await route.continue();
  });
}

module.exports = {
  LOCAL_ORIGIN,
  createApiMockController,
  createMockState,
  deepClone,
  getApiRoute,
  installApiMock,
};
