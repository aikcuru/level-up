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

function getRequestSequence(controller) {
  return controller.requests.map(
    ({ method, pathname }) => `${method} ${pathname}`,
  );
}

function expectNoUnexpectedRequests(controller) {
  controller.assertNoUnexpectedRequests();
}

test.describe("smoke/auth/state", () => {
  test("restores an authenticated session and renders synthetic state", async ({ page }) => {
    const controller = createApiMockController({ authenticated: true });

    await installApiMock(page, controller);
    await page.goto("/index.html");

    await expect(page.locator("#main-interface")).toBeVisible();
    await expect(page.locator("#login-panel")).toBeHidden();
    await expect(page.locator("#profile-name")).toHaveText(
      controller.state.profile.displayName,
    );
    await expect(
      page.locator("#active-tasks-list .task-card__title"),
    ).toHaveText(controller.state.tasks[0].title);
    await expect(page.locator("#task-form-status")).toBeHidden();
    await expect(page.locator("#login-error")).toBeHidden();

    await page.locator("#settings-button").click();
    await expect(page.locator("#subjects-list")).toBeVisible();
    await expect(page.locator("#subjects-list")).toContainText(
      controller.state.subjects[0].name,
    );

    expect(getRequestSequence(controller)).toEqual([
      "GET /api/v1/auth/me",
      "POST /api/v1/auth/csrf",
      "GET /api/v1/state",
    ]);
    expect(controller.errors).toEqual([]);
    expectNoUnexpectedRequests(controller);
  });

  test("shows login when there is no active session", async ({ page }) => {
    const controller = createApiMockController({ authenticated: false });

    await installApiMock(page, controller);
    await page.goto("/index.html");

    await expect(page.locator("#login-panel")).toBeVisible();
    await expect(page.locator("#login-form")).toBeVisible();
    await expect(page.locator("#main-interface")).toBeHidden();
    await expect(page.locator("#active-tasks-list .task-card")).toHaveCount(0);

    expect(getRequestSequence(controller)).toEqual([
      "GET /api/v1/auth/me",
    ]);
    expectNoUnexpectedRequests(controller);
  });

  test("logs in manually with synthetic credentials", async ({ page }) => {
    const controller = createApiMockController({ authenticated: false });

    await installApiMock(page, controller);
    await page.goto("/index.html");
    await expect(page.locator("#login-panel")).toBeVisible();

    await page.locator("#login-input").fill(controller.credentials.login);
    await page.locator("#password-input").fill(controller.credentials.password);
    await page.locator("#login-submit").click();

    await expect(page.locator("#main-interface")).toBeVisible();
    await expect(page.locator("#login-panel")).toBeHidden();
    await expect(page.locator("#profile-name")).toHaveText(
      controller.state.profile.displayName,
    );
    await expect(
      page.locator("#active-tasks-list .task-card__title"),
    ).toHaveText(controller.state.tasks[0].title);

    expect(controller.auth.authenticated).toBe(true);
    expect(controller.csrfToken).toBeTruthy();
    expect(getRequestSequence(controller)).toEqual([
      "GET /api/v1/auth/me",
      "POST /api/v1/auth/login",
      "GET /api/v1/state",
    ]);

    const loginRequest = controller.requests.find(
      ({ method, pathname }) =>
        method === "POST" && pathname === "/api/v1/auth/login",
    );

    expect(loginRequest.body).toEqual({
      login: controller.credentials.login,
      password: "[synthetic-redacted]",
    });
    expect(JSON.stringify(loginRequest)).not.toContain(
      controller.credentials.password,
    );
    expectNoUnexpectedRequests(controller);
  });

  test("logs out and clears browser storage", async ({ page }) => {
    const controller = createApiMockController({ authenticated: true });

    await installApiMock(page, controller);
    await page.goto("/index.html");
    await expect(page.locator("#main-interface")).toBeVisible();
    const preferencesBeforeLogout = await page.evaluate(() =>
      window.sessionStorage.getItem("level-up:ui-preferences"),
    );

    expect(preferencesBeforeLogout).not.toBeNull();

    await page.locator("#logout-button").click();

    await expect(page.locator("#login-panel")).toBeVisible();
    await expect(page.locator("#main-interface")).toBeHidden();
    expect(controller.auth.authenticated).toBe(false);
    expect(getRequestSequence(controller)).toEqual([
      "GET /api/v1/auth/me",
      "POST /api/v1/auth/csrf",
      "GET /api/v1/state",
      "POST /api/v1/auth/logout",
    ]);

    const storageSnapshot = await page.evaluate(() => ({
      preferences: window.sessionStorage.getItem("level-up:ui-preferences"),
      sessionStorageLength: window.sessionStorage.length,
      localStorageLength: window.localStorage.length,
    }));

    expect(storageSnapshot).toEqual({
      preferences: null,
      sessionStorageLength: 0,
      localStorageLength: 0,
    });
    expectNoUnexpectedRequests(controller);
  });

  test("requires reauthentication when state loading returns 401", async ({ page }) => {
    const controller = createApiMockController({ authenticated: true });

    controller.setRouteOverride("GET", "/api/v1/state", async ({ route }) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({ detail: "Synthetic session expired" }),
      });
    });

    await page.addInitScript(() => {
      window.sessionStorage.setItem(
        "level-up:ui-preferences",
        JSON.stringify({ version: 1, activeMainTab: "calendar" }),
      );
    });
    await installApiMock(page, controller);
    await page.goto("/index.html");

    await expect(page.locator("#login-panel")).toBeVisible();
    await expect(page.locator("#main-interface")).toBeHidden();
    await expect(page.locator("#login-error")).toBeVisible();
    await expect(page.locator("#login-error")).toContainText(
      "Сессия завершена",
    );
    expect(
      await page.evaluate(() =>
        window.sessionStorage.getItem("level-up:ui-preferences"),
      ),
    ).toBeNull();
    expect(getRequestSequence(controller)).toEqual([
      "GET /api/v1/auth/me",
      "POST /api/v1/auth/csrf",
      "GET /api/v1/state",
    ]);
    expectNoUnexpectedRequests(controller);
  });
});

const MATRIX_FIXED_TIME_MS = Date.UTC(2026, 8, 18, 4, 0, 0);
const MATRIX_TODAY_KEY = "2026-09-18";

async function installMatrixClock(page) {
  await page.clock.install({ time: new Date(MATRIX_FIXED_TIME_MS) });
}

function createSyntheticTask(overrides) {
  const task = {
    ...createMockState().tasks[0],
    ...overrides,
  };

  if (!Object.hasOwn(overrides, "originalDeadline")) {
    task.originalDeadline = task.currentDeadline;
  }
  if (!Object.hasOwn(overrides, "updatedAt")) {
    task.updatedAt = task.createdAt;
  }

  return task;
}

async function expectTaskOrder(page, listSelector, expectedTitles) {
  const titles = page.locator(`${listSelector} .task-card__title`);

  await expect(titles).toHaveCount(expectedTitles.length);
  await expect(titles).toHaveText(expectedTitles);
}

function createUiPreferences({
  activeMainTab = "calendar",
  status = "all",
  direction = "all",
  subject = "all",
  mode = "month",
  selectedDate = MATRIX_TODAY_KEY,
} = {}) {
  return {
    version: 1,
    activeMainTab,
    filters: {
      status,
      direction,
      subject,
    },
    calendar: {
      mode,
      selectedDate,
    },
  };
}

async function seedUiPreferences(page, preferences) {
  await page.addInitScript((value) => {
    window.sessionStorage.setItem(
      "level-up:ui-preferences",
      JSON.stringify(value),
    );
  }, preferences);
}

async function bootAuthenticatedCalendar(
  page,
  {
    state = createMockState(),
    preferences = createUiPreferences(),
  } = {},
) {
  const controller = createApiMockController({ state });

  await installMatrixClock(page);
  await seedUiPreferences(page, preferences);
  await installApiMock(page, controller);
  await page.goto("/index.html");
  await expect(page.locator("#main-interface")).toBeVisible();
  await expect(page.locator("#main-panel-calendar")).toBeVisible();

  return controller;
}

async function expectMainTabState(page, activeTabName) {
  for (const tabName of ["tasks", "calendar", "archive"]) {
    const isActive = tabName === activeTabName;
    const tab = page.locator(`#main-tab-${tabName}`);
    const panel = page.locator(`#main-panel-${tabName}`);

    await expect(tab).toHaveAttribute("aria-selected", String(isActive));
    await expect(tab).toHaveAttribute("tabindex", isActive ? "0" : "-1");

    if (isActive) {
      await expect(tab).toBeFocused();
      await expect(panel).toBeVisible();
    } else {
      await expect(panel).toBeHidden();
    }
  }
}

async function expectCalendarOverviewOrder(page, expectedTitles) {
  const titles = page.locator(
    "#calendar-selected-tasks .calendar-day-task__title",
  );

  await expect(titles).toHaveCount(expectedTitles.length);
  await expect(titles).toHaveText(expectedTitles);
}

function createTasksForCalendarDate({ date, count, prefix }) {
  return Array.from({ length: count }, (_, index) => {
    const taskNumber = index + 1;
    const paddedNumber = String(taskNumber).padStart(2, "0");

    return createSyntheticTask({
      id: `test-${prefix}-${paddedNumber}`,
      title: `${prefix} task ${taskNumber}`,
      currentDeadline: date,
      createdAt: `2026-08-${paddedNumber}T08:00:00.000Z`,
    });
  });
}

function getDescendingTaskTitles(prefix, count) {
  return Array.from(
    { length: count },
    (_, index) => `${prefix} task ${count - index}`,
  );
}

test.describe("E01-E04 required matrix", () => {
  test("E01 orders active tasks by current deadline", async ({ page }) => {
    const state = createMockState();
    const tasks = [
      createSyntheticTask({
        id: "test-e01-future-002",
        title: "E01 future second",
        currentDeadline: "2026-09-20",
        createdAt: "2026-09-06T08:00:00.000Z",
      }),
      createSyntheticTask({
        id: "test-e01-today-001",
        title: "E01 today older",
        currentDeadline: MATRIX_TODAY_KEY,
        createdAt: "2026-09-03T08:00:00.000Z",
      }),
      createSyntheticTask({
        id: "test-e01-overdue-002",
        title: "E01 overdue second",
        currentDeadline: "2026-09-17",
        createdAt: "2026-09-02T08:00:00.000Z",
      }),
      createSyntheticTask({
        id: "test-e01-future-001",
        title: "E01 future first",
        currentDeadline: "2026-09-19",
        createdAt: "2026-09-05T08:00:00.000Z",
      }),
      createSyntheticTask({
        id: "test-e01-overdue-001",
        title: "E01 overdue first",
        currentDeadline: "2026-09-16",
        createdAt: "2026-09-01T08:00:00.000Z",
      }),
      createSyntheticTask({
        id: "test-e01-today-002",
        title: "E01 today newer",
        currentDeadline: MATRIX_TODAY_KEY,
        createdAt: "2026-09-04T08:00:00.000Z",
      }),
    ];
    const expectedTitles = [
      "E01 overdue first",
      "E01 overdue second",
      "E01 today newer",
      "E01 today older",
      "E01 future first",
      "E01 future second",
    ];

    state.tasks = tasks;
    const controller = createApiMockController({ state });

    await installMatrixClock(page);
    await installApiMock(page, controller);
    await page.goto("/index.html");

    await expect(page.locator("#main-interface")).toBeVisible();
    await expectTaskOrder(page, "#active-tasks-list", expectedTitles);
    expect(tasks.map(({ title }) => title)).not.toEqual(expectedTitles);

    const mutationProbe = await page.evaluate((inputTasks) => {
      if (typeof window.getSortedActiveTasks !== "function") {
        return { available: false };
      }

      const input = structuredClone(inputTasks);
      const before = JSON.stringify(input);
      const result = window.getSortedActiveTasks(input);

      return {
        available: true,
        inputUnchanged: JSON.stringify(input) === before,
        returnsNewArray: result !== input,
      };
    }, tasks);

    expect(mutationProbe).toEqual({
      available: true,
      inputUnchanged: true,
      returnsNewArray: true,
    });
    expectNoUnexpectedRequests(controller);
  });

  test("E02 uses createdAt DESC and id DESC without title influence", async ({ page }) => {
    const state = createMockState();
    const tasks = [
      createSyntheticTask({
        id: "test-task-001",
        title: "E02 older createdAt",
        currentDeadline: "2026-09-21",
        createdAt: "2026-09-01T08:00:00.000Z",
      }),
      createSyntheticTask({
        id: "test-task-003",
        title: "E02 equal timestamp id 003",
        currentDeadline: "2026-09-21",
        createdAt: "2026-09-03T08:00:00.000Z",
      }),
      createSyntheticTask({
        id: "test-task-002",
        title: "E02 newer createdAt",
        currentDeadline: "2026-09-21",
        createdAt: "2026-09-02T08:00:00.000Z",
      }),
      createSyntheticTask({
        id: "test-task-004",
        title: "E02 equal timestamp id 004",
        currentDeadline: "2026-09-21",
        createdAt: "2026-09-03T08:00:00.000Z",
      }),
    ];
    const initialOrder = [
      "E02 equal timestamp id 004",
      "E02 equal timestamp id 003",
      "E02 newer createdAt",
      "E02 older createdAt",
    ];

    state.tasks = tasks;
    const controller = createApiMockController({ state });

    await installMatrixClock(page);
    await installApiMock(page, controller);
    await page.goto("/index.html");

    await expectTaskOrder(page, "#active-tasks-list", initialOrder);

    const renamedTask = controller.state.tasks.find(
      ({ id }) => id === "test-task-004",
    );

    renamedTask.title = "E02 renamed id 004";
    await page.reload();
    await expect(page.locator("#main-interface")).toBeVisible();
    await expectTaskOrder(page, "#active-tasks-list", [
      "E02 renamed id 004",
      "E02 equal timestamp id 003",
      "E02 newer createdAt",
      "E02 older createdAt",
    ]);
    expectNoUnexpectedRequests(controller);
  });

  test("E03 applies AND filters and preserves completed server order", async ({ page }) => {
    const state = createMockState();
    const historySubjectId = "test-subject-history-001";
    const mathSubjectId = "test-subject-math-001";
    const completedTasks = [
      createSyntheticTask({
        id: "test-e03-completed-002",
        title: "E03 completed server first",
        direction: "Курс",
        subjectId: historySubjectId,
        difficulty: "easy",
        xpReward: 5,
        status: "completed",
        currentDeadline: "2026-09-12",
        xpAwarded: true,
        createdAt: "2026-09-01T08:00:00.000Z",
      }),
      createSyntheticTask({
        id: "test-e03-completed-001",
        title: "E03 completed server second",
        direction: "Школа",
        subjectId: mathSubjectId,
        difficulty: "medium",
        xpReward: 20,
        status: "completed",
        currentDeadline: "2026-09-10",
        xpAwarded: true,
        createdAt: "2026-09-03T08:00:00.000Z",
      }),
      createSyntheticTask({
        id: "test-e03-completed-003",
        title: "E03 completed server third",
        direction: "Личные дела",
        subjectId: null,
        difficulty: "hard",
        xpReward: 50,
        status: "completed",
        currentDeadline: "2026-09-11",
        xpAwarded: true,
        createdAt: "2026-09-02T08:00:00.000Z",
      }),
    ];
    const activeTasks = [
      createSyntheticTask({
        id: "test-e03-future-math",
        title: "E03 school math future",
        direction: "Школа",
        subjectId: mathSubjectId,
        currentDeadline: "2026-09-20",
        createdAt: "2026-09-05T08:00:00.000Z",
      }),
      createSyntheticTask({
        id: "test-e03-overdue-target",
        title: "E03 school math overdue target",
        direction: "Школа",
        subjectId: mathSubjectId,
        currentDeadline: "2026-09-17",
        createdAt: "2026-09-04T08:00:00.000Z",
      }),
      createSyntheticTask({
        id: "test-e03-today-course",
        title: "E03 course history today",
        direction: "Курс",
        subjectId: historySubjectId,
        currentDeadline: MATRIX_TODAY_KEY,
        createdAt: "2026-09-03T08:00:00.000Z",
      }),
      createSyntheticTask({
        id: "test-e03-overdue-personal",
        title: "E03 personal overdue",
        direction: "Личные дела",
        subjectId: null,
        currentDeadline: "2026-09-15",
        createdAt: "2026-09-01T08:00:00.000Z",
      }),
      createSyntheticTask({
        id: "test-e03-overdue-history",
        title: "E03 school history overdue",
        direction: "Школа",
        subjectId: historySubjectId,
        currentDeadline: "2026-09-16",
        createdAt: "2026-09-02T08:00:00.000Z",
      }),
    ];
    const allActiveOrder = [
      "E03 personal overdue",
      "E03 school history overdue",
      "E03 school math overdue target",
      "E03 course history today",
      "E03 school math future",
    ];

    state.profile.totalXp = 75;
    state.tasks = [
      completedTasks[0],
      activeTasks[0],
      activeTasks[1],
      completedTasks[1],
      activeTasks[2],
      activeTasks[3],
      completedTasks[2],
      activeTasks[4],
    ];
    const controller = createApiMockController({ state });

    await installMatrixClock(page);
    await installApiMock(page, controller);
    await page.goto("/index.html");
    await expect(page.locator("#main-interface")).toBeVisible();

    await expectTaskOrder(page, "#active-tasks-list", allActiveOrder);
    await page.locator("#filters-toggle").click();
    await expect(page.locator("#filters-panel")).toBeVisible();

    await page.locator("#status-filter").selectOption("active");
    await expectTaskOrder(page, "#active-tasks-list", allActiveOrder);

    await page.locator("#status-filter").selectOption("overdue");
    await expectTaskOrder(page, "#active-tasks-list", [
      "E03 personal overdue",
      "E03 school history overdue",
      "E03 school math overdue target",
    ]);

    await page.locator("#direction-filter").selectOption("Школа");
    await page
      .locator("#subject-filter")
      .selectOption(`subject:${mathSubjectId}`);
    await expectTaskOrder(page, "#active-tasks-list", [
      "E03 school math overdue target",
    ]);

    await page.locator("#filters-reset-button").click();
    await expect(page.locator("#status-filter")).toHaveValue("all");
    await expect(page.locator("#direction-filter")).toHaveValue("all");
    await expect(page.locator("#subject-filter")).toHaveValue("all");
    await expectTaskOrder(page, "#active-tasks-list", allActiveOrder);

    await page.locator("#status-filter").selectOption("overdue");
    await page.locator("#direction-filter").selectOption("Школа");
    await page
      .locator("#subject-filter")
      .selectOption(`subject:${mathSubjectId}`);
    await page.locator("#main-tab-archive").click();
    await expect(page.locator("#main-panel-archive")).toBeVisible();
    await expectTaskOrder(page, "#completed-tasks-list", [
      "E03 completed server first",
      "E03 completed server second",
      "E03 completed server third",
    ]);
    expectNoUnexpectedRequests(controller);
  });

  test("E04 exposes an explicit contract error for invalid createdAt", async ({ page }) => {
    const state = createMockState();

    state.tasks[0].createdAt = "invalid-created-at";
    const controller = createApiMockController({ state });

    await installApiMock(page, controller);
    await page.goto("/index.html");

    await expect(page.locator("#login-panel")).toBeVisible();
    await expect(page.locator("#main-interface")).toBeHidden();
    await expect(page.locator("#active-tasks-list .task-card")).toHaveCount(0);
    expectNoUnexpectedRequests(controller);
    await expect(page.locator("#login-error")).toBeVisible();
    await expect(page.locator("#login-error")).toHaveText(
      "Сервер вернул некорректное состояние",
    );
  });
});

test.describe("E05-E09 required matrix", () => {
  test("E05 preserves task draft and filters across main tabs without API requests", async ({
    page,
  }) => {
    const controller = createApiMockController();

    await installMatrixClock(page);
    await installApiMock(page, controller);
    await page.goto("/index.html");
    await expect(page.locator("#main-interface")).toBeVisible();

    await page.locator("#task-form-toggle").click();
    await page.locator("#task-title-input").fill("E05 synthetic draft");
    await page.locator("#task-direction-select").selectOption("Школа");
    await page
      .locator("#task-subject-select")
      .selectOption("test-subject-math-001");
    await page.locator("#task-difficulty-select").selectOption("hard");
    await page.locator("#task-deadline-input").fill("2026-10-05");

    await page.locator("#filters-toggle").click();
    await page.locator("#status-filter").selectOption("overdue");
    await page.locator("#direction-filter").selectOption("Школа");
    await page
      .locator("#subject-filter")
      .selectOption("subject:test-subject-math-001");

    const requestCountAfterBoot = controller.requests.length;

    await page.locator("#main-tab-calendar").click();
    await expect(page.locator("#main-panel-calendar")).toBeVisible();
    await page.locator("#main-tab-archive").click();
    await expect(page.locator("#main-panel-archive")).toBeVisible();
    await page.locator("#main-tab-tasks").click();

    await expect(page.locator("#main-tab-tasks")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.locator("#main-panel-tasks")).toBeVisible();
    await expect(page.locator("#main-panel-calendar")).toBeHidden();
    await expect(page.locator("#main-panel-archive")).toBeHidden();
    await expect(page.locator("#task-form")).toHaveCount(1);
    await expect(page.locator("#task-title-input")).toHaveValue(
      "E05 synthetic draft",
    );
    await expect(page.locator("#task-direction-select")).toHaveValue("Школа");
    await expect(page.locator("#task-subject-select")).toHaveValue(
      "test-subject-math-001",
    );
    await expect(page.locator("#task-difficulty-select")).toHaveValue("hard");
    await expect(page.locator("#task-deadline-input")).toHaveValue(
      "2026-10-05",
    );
    await expect(page.locator("#status-filter")).toHaveValue("overdue");
    await expect(page.locator("#direction-filter")).toHaveValue("Школа");
    await expect(page.locator("#subject-filter")).toHaveValue(
      "subject:test-subject-math-001",
    );
    expect(controller.requests).toHaveLength(requestCountAfterBoot);
    expectNoUnexpectedRequests(controller);
  });

  test("E06 supports Arrow, Home, and End navigation with correct tab ARIA", async ({
    page,
  }) => {
    const controller = createApiMockController();

    await installMatrixClock(page);
    await installApiMock(page, controller);
    await page.goto("/index.html");
    await expect(page.locator("#main-interface")).toBeVisible();

    await page.locator("#main-tab-tasks").focus();
    await expectMainTabState(page, "tasks");

    await page.keyboard.press("ArrowRight");
    await expectMainTabState(page, "calendar");

    await page.keyboard.press("ArrowRight");
    await expectMainTabState(page, "archive");

    await page.keyboard.press("ArrowLeft");
    await expectMainTabState(page, "calendar");

    await page.keyboard.press("Home");
    await expectMainTabState(page, "tasks");

    await page.keyboard.press("End");
    await expectMainTabState(page, "archive");
    expectNoUnexpectedRequests(controller);
  });

  test("E06 closes Settings with Escape and restores focus", async ({ page }) => {
    const controller = createApiMockController();

    await installApiMock(page, controller);
    await page.goto("/index.html");
    await expect(page.locator("#main-interface")).toBeVisible();

    await page.locator("#settings-button").click();
    await expect(page.locator("#settings-panel")).toBeVisible();
    await expect(page.locator("#settings-button")).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    await page.keyboard.press("Escape");

    await expect(page.locator("#settings-panel")).toBeHidden();
    await expect(page.locator("#settings-button")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await expect(page.locator("#settings-button")).toBeFocused();
    await expect(page.locator("#main-interface")).toBeVisible();
    expectNoUnexpectedRequests(controller);
  });

  test("E06 does not duplicate calendar navigation handlers after repeat visits", async ({
    page,
  }) => {
    const controller = createApiMockController();

    await installMatrixClock(page);
    await installApiMock(page, controller);
    await page.goto("/index.html");
    await expect(page.locator("#main-interface")).toBeVisible();
    const requestCountAfterBoot = controller.requests.length;

    await page.locator("#main-tab-calendar").click();
    await page.locator("#main-tab-tasks").click();
    await page.locator("#main-tab-calendar").click();
    await expect(page.locator("#calendar-month")).toHaveText("сентябрь 2026");

    await page.locator("#calendar-next").click();

    await expect(page.locator("#calendar-month")).toHaveText("октябрь 2026");
    await expect(
      page.locator('.calendar-day[data-date="2026-10-18"]'),
    ).toHaveAttribute("aria-selected", "true");
    expect(controller.requests).toHaveLength(requestCountAfterBoot);
    expectNoUnexpectedRequests(controller);
  });
});

test.describe("E07 calendar arithmetic and safe boundaries", () => {
  test("E07 renders 28 days in February of a non-leap year", async ({ page }) => {
    const controller = await bootAuthenticatedCalendar(page, {
      preferences: createUiPreferences({ selectedDate: "2027-02-15" }),
    });

    await expect(page.locator("#calendar-month")).toHaveText("февраль 2027");
    await expect(page.locator("#calendar-grid .calendar-day")).toHaveCount(28);
    await expect(
      page.locator('.calendar-day[data-date="2027-02-28"]'),
    ).toHaveCount(1);
    await expect(
      page.locator('.calendar-day[data-date="2027-02-29"]'),
    ).toHaveCount(0);
    expectNoUnexpectedRequests(controller);
  });

  test("E07 renders 29 days in February of a leap year", async ({ page }) => {
    const controller = await bootAuthenticatedCalendar(page, {
      preferences: createUiPreferences({ selectedDate: "2028-02-15" }),
    });

    await expect(page.locator("#calendar-month")).toHaveText("февраль 2028");
    await expect(page.locator("#calendar-grid .calendar-day")).toHaveCount(29);
    await expect(
      page.locator('.calendar-day[data-date="2028-02-29"]'),
    ).toHaveCount(1);
    expectNoUnexpectedRequests(controller);
  });

  test("E07 clamps January 31 to the last day of February", async ({ page }) => {
    const controller = await bootAuthenticatedCalendar(page, {
      preferences: createUiPreferences({ selectedDate: "2027-01-31" }),
    });

    await page.locator("#calendar-next").click();

    await expect(page.locator("#calendar-month")).toHaveText("февраль 2027");
    await expect(
      page.locator('.calendar-day[data-date="2027-02-28"]'),
    ).toHaveAttribute("aria-selected", "true");
    expectNoUnexpectedRequests(controller);
  });

  test("E07 clamps March 31 to April 30", async ({ page }) => {
    const controller = await bootAuthenticatedCalendar(page, {
      preferences: createUiPreferences({ selectedDate: "2027-03-31" }),
    });

    await page.locator("#calendar-next").click();

    await expect(page.locator("#calendar-month")).toHaveText("апрель 2027");
    await expect(
      page.locator('.calendar-day[data-date="2027-04-30"]'),
    ).toHaveAttribute("aria-selected", "true");
    expectNoUnexpectedRequests(controller);
  });

  test("E07 renders a seven-day week across the year boundary", async ({ page }) => {
    const controller = await bootAuthenticatedCalendar(page, {
      preferences: createUiPreferences({
        mode: "week",
        selectedDate: "2027-01-01",
      }),
    });
    const weekDays = page.locator("#calendar-grid .calendar-week-day[data-date]");

    await expect(page.locator("#calendar-month")).toHaveText(
      "28 декабря 2026 — 3 января 2027",
    );
    await expect(weekDays).toHaveCount(7);
    expect(await weekDays.evaluateAll((elements) =>
      elements.map((element) => element.dataset.date),
    )).toEqual([
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
      "2027-01-03",
    ]);
    expectNoUnexpectedRequests(controller);
  });

  test("E07 disables Previous at 0001-01-01 without wrapping", async ({ page }) => {
    const controller = await bootAuthenticatedCalendar(page, {
      preferences: createUiPreferences({
        mode: "day",
        selectedDate: "0001-01-01",
      }),
    });

    await expect(page.locator("#calendar-month")).toHaveText("1 января 1");
    await expect(page.locator("#calendar-previous")).toBeDisabled();
    await expect(page.locator("#calendar-next")).toBeEnabled();
    await expect(page.locator("#calendar-selected-date")).toHaveText(
      "Задачи на 1 января 1 года",
    );
    expectNoUnexpectedRequests(controller);
  });

  test("E07 disables Next at 9999-12-31 without wrapping", async ({ page }) => {
    const controller = await bootAuthenticatedCalendar(page, {
      preferences: createUiPreferences({
        mode: "day",
        selectedDate: "9999-12-31",
      }),
    });

    await expect(page.locator("#calendar-month")).toHaveText(
      "31 декабря 9999",
    );
    await expect(page.locator("#calendar-previous")).toBeEnabled();
    await expect(page.locator("#calendar-next")).toBeDisabled();
    await expect(page.locator("#calendar-selected-date")).toHaveText(
      "Задачи на 31 декабря 9999 года",
    );
    expectNoUnexpectedRequests(controller);
  });
});

test.describe("E08-E09 calendar task rendering", () => {
  test("E08 handles 0, 1, 3, 4, and 6 tasks with exact Month overflow", async ({
    page,
  }) => {
    const state = createMockState();
    const dates = {
      empty: "2026-09-09",
      one: "2026-09-10",
      three: "2026-09-11",
      four: "2026-09-12",
      six: "2026-09-13",
    };
    const oneTask = createTasksForCalendarDate({
      date: dates.one,
      count: 1,
      prefix: "e08-one",
    });
    const threeTasks = createTasksForCalendarDate({
      date: dates.three,
      count: 3,
      prefix: "e08-three",
    });
    const fourTasks = createTasksForCalendarDate({
      date: dates.four,
      count: 4,
      prefix: "e08-four",
    });
    const sixTasks = createTasksForCalendarDate({
      date: dates.six,
      count: 6,
      prefix: "e08-six",
    });

    state.tasks = [
      ...fourTasks,
      ...oneTask,
      ...sixTasks,
      ...threeTasks,
    ];
    const controller = await bootAuthenticatedCalendar(page, {
      state,
      preferences: createUiPreferences({ selectedDate: MATRIX_TODAY_KEY }),
    });
    const emptyCell = page.locator(
      `.calendar-day[data-date="${dates.empty}"]`,
    );
    await emptyCell.click();
    await expect(emptyCell).toHaveAttribute("aria-selected", "true");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator("#calendar-day-overview")).toBeVisible();
    await expect(page.locator("#calendar-selected-empty")).toBeVisible();
    await expectCalendarOverviewOrder(page, []);
    await page.setViewportSize({ width: 1280, height: 720 });

    const oneCell = page.locator(
      `.calendar-day[data-date="${dates.one}"]`,
    );
    const oneTaskPill = oneCell.locator(".calendar-task");

    await expect(oneTaskPill).toHaveCount(1);
    await oneTaskPill.click();
    await expect(emptyCell).toHaveAttribute("aria-selected", "true");
    await expect(oneCell).toHaveAttribute("aria-selected", "false");
    await expect(oneTaskPill).toHaveAttribute(
      "aria-describedby",
      "calendar-task-tooltip",
    );
    await expect(page.locator("#calendar-task-tooltip")).toBeVisible();
    await oneTaskPill.press("Escape");
    await expect(page.locator("#calendar-task-tooltip")).toBeHidden();

    await oneCell.locator(".calendar-day__button").click();
    await expect(page.locator("#calendar-selected-empty")).toBeHidden();
    await expectCalendarOverviewOrder(
      page,
      getDescendingTaskTitles("e08-one", 1),
    );

    const threeCell = page.locator(
      `.calendar-day[data-date="${dates.three}"]`,
    );

    await expect(threeCell.locator(".calendar-task")).toHaveCount(3);
    await expect(threeCell.locator(".calendar-day__more")).toHaveCount(0);
    await threeCell.locator(".calendar-day__button").click();
    await expectCalendarOverviewOrder(
      page,
      getDescendingTaskTitles("e08-three", 3),
    );

    const fourCell = page.locator(
      `.calendar-day[data-date="${dates.four}"]`,
    );

    await expect(fourCell.locator(".calendar-task")).toHaveCount(3);
    await expect(fourCell.locator(".calendar-day__more")).toHaveText(
      "+ ещё 1",
    );
    await fourCell.locator(".calendar-day__button").click();
    await expectCalendarOverviewOrder(
      page,
      getDescendingTaskTitles("e08-four", 4),
    );

    const sixCell = page.locator(
      `.calendar-day[data-date="${dates.six}"]`,
    );

    await expect(sixCell.locator(".calendar-task")).toHaveCount(3);
    await expect(sixCell.locator(".calendar-day__more")).toHaveText(
      "+ ещё 3",
    );
    await sixCell.locator(".calendar-day__button").click();
    await expectCalendarOverviewOrder(
      page,
      getDescendingTaskTitles("e08-six", 6),
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator("#calendar-day-overview")).toBeVisible();
    await expectCalendarOverviewOrder(
      page,
      getDescendingTaskTitles("e08-six", 6),
    );
    expectNoUnexpectedRequests(controller);
  });

  test("E09 keeps the same task set and order in Month, Week, and Day", async ({
    page,
  }) => {
    const selectedDate = "2026-09-21";
    const state = createMockState();
    const tasks = [
      createSyntheticTask({
        id: "test-e09-002",
        title: "E09 school math older",
        direction: "Школа",
        subjectId: "test-subject-math-001",
        currentDeadline: selectedDate,
        createdAt: "2026-09-02T08:00:00.000Z",
      }),
      createSyntheticTask({
        id: "test-e09-001",
        title: "E09 personal oldest",
        direction: "Личные дела",
        subjectId: null,
        currentDeadline: selectedDate,
        createdAt: "2026-09-01T08:00:00.000Z",
      }),
      createSyntheticTask({
        id: "test-e09-004",
        title: "E09 school math newest id 004",
        direction: "Школа",
        subjectId: "test-subject-math-001",
        currentDeadline: selectedDate,
        createdAt: "2026-09-03T08:00:00.000Z",
      }),
      createSyntheticTask({
        id: "test-e09-003",
        title: "E09 course history newest id 003",
        direction: "Курс",
        subjectId: "test-subject-history-001",
        currentDeadline: selectedDate,
        createdAt: "2026-09-03T08:00:00.000Z",
      }),
    ];
    const expectedTitles = [
      "E09 school math newest id 004",
      "E09 course history newest id 003",
      "E09 school math older",
      "E09 personal oldest",
    ];

    state.tasks = tasks;
    const controller = await bootAuthenticatedCalendar(page, {
      state,
      preferences: createUiPreferences({ selectedDate }),
    });
    const requestCountAfterBoot = controller.requests.length;

    await expect(
      page.locator(`.calendar-day[data-date="${selectedDate}"]`),
    ).toHaveAttribute("aria-selected", "true");
    await expectCalendarOverviewOrder(page, expectedTitles);

    await page.locator('[data-calendar-mode="week"]').click();
    const selectedWeekDay = page.locator(
      `.calendar-week-day[data-date="${selectedDate}"]`,
    );

    await expect(page.locator(".calendar")).toHaveAttribute(
      "data-calendar-mode",
      "week",
    );
    await expect(selectedWeekDay).toHaveAttribute("aria-selected", "true");
    await expect(
      selectedWeekDay.locator(".calendar-task__title"),
    ).toHaveText(expectedTitles);
    await expectCalendarOverviewOrder(page, expectedTitles);

    await page.locator('[data-calendar-mode="day"]').click();
    await expect(page.locator(".calendar")).toHaveAttribute(
      "data-calendar-mode",
      "day",
    );
    await expect(page.locator("#calendar-month")).toHaveText(
      "21 сентября 2026",
    );
    await expectCalendarOverviewOrder(page, expectedTitles);

    await page.locator("#main-tab-tasks").click();
    await page.locator("#filters-toggle").click();
    await page.locator("#direction-filter").selectOption("Школа");
    await page
      .locator("#subject-filter")
      .selectOption("subject:test-subject-math-001");
    await expectTaskOrder(page, "#active-tasks-list", [
      "E09 school math newest id 004",
      "E09 school math older",
    ]);

    await page.locator("#main-tab-calendar").click();
    await expect(page.locator(".calendar")).toHaveAttribute(
      "data-calendar-mode",
      "day",
    );
    await expect(page.locator("#calendar-month")).toHaveText(
      "21 сентября 2026",
    );
    await expectCalendarOverviewOrder(page, expectedTitles);
    expect(controller.requests).toHaveLength(requestCountAfterBoot);
    expectNoUnexpectedRequests(controller);
  });
});

module.exports = {
  LOCAL_ORIGIN,
  createApiMockController,
  createMockState,
  deepClone,
  getApiRoute,
  installApiMock,
};
