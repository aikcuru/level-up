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
const TASK_FORM_REPLACEMENT_CONFIRMATION =
  "Заменить несохранённый черновик? Внесённые изменения будут потеряны.";

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

async function expectMainTabState(
  page,
  activeTabName,
  { focused = true } = {},
) {
  for (const tabName of ["tasks", "calendar", "archive"]) {
    const isActive = tabName === activeTabName;
    const tab = page.locator(`#main-tab-${tabName}`);
    const panel = page.locator(`#main-panel-${tabName}`);

    await expect(tab).toHaveAttribute("aria-selected", String(isActive));
    await expect(tab).toHaveAttribute("tabindex", isActive ? "0" : "-1");

    if (isActive) {
      if (focused) {
        await expect(tab).toBeFocused();
      }
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

    await page.reload();
    await expect(page.locator("#main-interface")).toBeVisible();
    await expect(page.locator("#task-form-panel")).toBeHidden();
    await page.locator("#task-form-toggle").click();
    await expect(page.locator("#task-title-input")).toHaveValue("");
    await expect(page.locator("#task-direction-select")).toHaveValue("");
    await expect(page.locator("#task-subject-select")).toHaveValue("");
    await expect(page.locator("#task-difficulty-select")).toHaveValue("");
    await expect(page.locator("#task-deadline-input")).toHaveValue("");
    expectNoUnexpectedRequests(controller);
  });

  test("E06 supports Arrow, Home, and End navigation with correct tab ARIA", async ({
    page,
  }) => {
    const controller = createApiMockController();
    const archivePreferences = createUiPreferences({ activeMainTab: "archive" });

    await installMatrixClock(page);
    await seedUiPreferences(page, archivePreferences);
    await installApiMock(page, controller);
    await page.goto("/index.html");
    await expect(page.locator("#main-interface")).toBeVisible();

    await page.locator(".brand").focus();
    await expect(page.locator(".brand")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.locator("#logout-button")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.locator("#settings-button")).toBeFocused();
    await page.keyboard.press("Tab");
    await expectMainTabState(page, "archive");

    await page.keyboard.press("ArrowRight");
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

    await page.keyboard.press("Home");
    await expectMainTabState(page, "tasks");
    await page.keyboard.press("Tab");
    const focusedElement = await page.evaluate(() => ({
      id: document.activeElement?.id ?? "",
      panelId: document.activeElement?.closest('[role="tabpanel"]')?.id ?? "",
    }));

    expect(focusedElement.panelId).toBe("main-panel-tasks");
    expect(focusedElement.id).not.toMatch(/^main-panel-(?:calendar|archive)$/);

    await page.locator("#main-tab-calendar").focus();
    await page.keyboard.press("ArrowRight");
    await expectMainTabState(page, "archive");
    expect((await getStoredUiPreferences(page)).activeMainTab).toBe("archive");
    await page.reload();
    await expect(page.locator("#main-interface")).toBeVisible();
    await expectMainTabState(page, "archive", { focused: false });

    await page.locator("#main-tab-calendar").click();
    await expectMainTabState(page, "calendar");
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
    await expect(page.locator("#calendar-day-overview")).toBeVisible();
    await expect(page.locator("#calendar-selected-empty")).toBeVisible();
    await expectCalendarOverviewOrder(page, []);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator("#calendar-day-overview")).toBeVisible();
    await expect(page.locator("#calendar-selected-empty")).toBeVisible();
    await expectCalendarOverviewOrder(page, []);
    await page.setViewportSize({ width: 1280, height: 720 });

    const oneCell = page.locator(
      `.calendar-day[data-date="${dates.one}"]`,
    );
    const oneTaskPill = oneCell.locator(".calendar-task");
    const calendarTaskTooltip = page.locator("#calendar-task-tooltip");

    await expect(oneTaskPill).toHaveCount(1);
    await oneTaskPill.hover();
    await expect(oneTaskPill).toHaveAttribute(
      "aria-describedby",
      "calendar-task-tooltip",
    );
    await expect(calendarTaskTooltip).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(calendarTaskTooltip).toBeHidden();
    await expect(oneTaskPill).not.toHaveAttribute(
      "aria-describedby",
      "calendar-task-tooltip",
    );
    await page.waitForTimeout(150);
    await expect(calendarTaskTooltip).toBeHidden();

    await page.locator(".brand").hover();
    await oneTaskPill.hover();
    await expect(calendarTaskTooltip).toBeVisible();
    await page.locator("#main-tab-tasks").focus();
    await page.keyboard.press("Enter");
    await expect(calendarTaskTooltip).toBeHidden();
    await page.locator(".brand").hover();
    await page.locator("#main-tab-calendar").focus();
    await page.keyboard.press("Enter");

    await oneTaskPill.click();
    await expect(emptyCell).toHaveAttribute("aria-selected", "true");
    await expect(oneCell).toHaveAttribute("aria-selected", "false");
    await expect(oneTaskPill).toHaveAttribute(
      "aria-describedby",
      "calendar-task-tooltip",
    );
    await expect(calendarTaskTooltip).toBeVisible();
    await oneTaskPill.press("Escape");
    await expect(calendarTaskTooltip).toBeHidden();

    await oneCell.locator(".calendar-day__button").click();
    await expect(oneCell).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#calendar-day-overview")).toBeVisible();
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
    await expect(page.locator("#calendar-day-overview")).toBeVisible();
    await expectCalendarOverviewOrder(
      page,
      getDescendingTaskTitles("e08-three", 3),
    );

    const fourCell = page.locator(
      `.calendar-day[data-date="${dates.four}"]`,
    );

    await expect(fourCell.locator(".calendar-task")).toHaveCount(3);
    const fourMoreButton = fourCell.getByRole("button", {
      name: /Показать все активные задачи/,
    });

    await expect(fourMoreButton).toBeVisible();
    await expect(fourMoreButton).toHaveText("+ ещё 1");
    await fourMoreButton.click();
    await expect(fourCell).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#calendar-day-overview")).toBeVisible();
    await expect(page.locator("#calendar-selected-date")).toBeFocused();
    await expectCalendarOverviewOrder(
      page,
      getDescendingTaskTitles("e08-four", 4),
    );

    const sixCell = page.locator(
      `.calendar-day[data-date="${dates.six}"]`,
    );

    await expect(sixCell.locator(".calendar-task")).toHaveCount(3);
    const sixMoreButton = sixCell.getByRole("button", {
      name: /Показать все активные задачи/,
    });

    await expect(sixMoreButton).toHaveText("+ ещё 3");
    await sixCell.locator(".calendar-task").nth(2).focus();
    await page.keyboard.press("Tab");
    await expect(sixMoreButton).toBeFocused();
    await page.keyboard.press("Space");
    await expect(sixCell).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#calendar-day-overview")).toBeVisible();
    await expect(page.locator("#calendar-selected-date")).toBeFocused();
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

function createDeferred() {
  let resolvePromise;
  let isSettled = false;
  const promise = new Promise((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve(value) {
      if (!isSettled) {
        isSettled = true;
        resolvePromise(value);
      }
    },
  };
}

function createSingleActiveTaskState(task) {
  const state = createMockState();

  state.tasks = [task];
  state.profile.totalXp = 0;
  state.profile.level = 1;
  state.syncVersion = 1;
  return state;
}

async function bootAuthenticatedTasks(page, controller) {
  await installMatrixClock(page);
  await installApiMock(page, controller);
  await page.goto("/index.html");
  await expect(page.locator("#main-interface")).toBeVisible();
  await expect(page.locator("#main-panel-tasks")).toBeVisible();
}

function getTaskCard(page, listSelector, title) {
  return page.locator(`${listSelector} .task-card`).filter({ hasText: title });
}

function getCalendarOverviewTask(page, title) {
  return page
    .locator("#calendar-selected-tasks .calendar-day-task")
    .filter({ hasText: title });
}

async function expectTaskActionButtonsDisabled(task) {
  const buttons = task.locator(".task-card__action-button");

  await expect(buttons).toHaveCount(3);
  for (let index = 0; index < 3; index += 1) {
    await expect(buttons.nth(index)).toBeDisabled();
  }
}

function getRouteRequests(controller, method, pathname) {
  return controller.requests.filter(
    (request) => request.method === method && request.pathname === pathname,
  );
}

async function openTaskEditor(page, title) {
  const card = getTaskCard(page, "#active-tasks-list", title);

  await card.locator(".task-card__edit-button").click();
  await expect(page.locator("#task-form-heading")).toHaveText(
    "Редактирование задачи",
  );
  await expect(page.locator("#task-title-input")).toBeFocused();
}

async function fillSyntheticTaskDraft(page, title) {
  await page.locator("#task-title-input").fill(title);
  await page.locator("#task-direction-select").selectOption("Школа");
  await page
    .locator("#task-subject-select")
    .selectOption("test-subject-math-001");
  await page.locator("#task-difficulty-select").selectOption("hard");
  await page.locator("#task-deadline-input").fill("2026-10-05");
}

test.describe("E10 mutation lifecycle", () => {
  test("E10 updates only deadline after mutation response and fresh state", async ({
    page,
  }) => {
    const task = createSyntheticTask({
      id: "test-e10-deadline-001",
      title: "E10 deadline task",
      currentDeadline: "2026-09-18",
      version: 4,
      createdAt: "2026-09-01T08:00:00.000Z",
    });
    const controller = createApiMockController({
      state: createSingleActiveTaskState(task),
    });
    const pathname = `/api/v1/tasks/${task.id}`;
    const mutationGate = createDeferred();
    let capturedBody = null;

    controller.setRouteOverride(
      "PATCH",
      pathname,
      async ({ route, request, controller: activeController, body }) => {
        capturedBody = deepClone(body);
        await mutationGate.promise;
        await handleUpdateTask(
          route,
          activeController,
          request,
          { method: "PATCH", pathname },
          { present: true, valid: true, value: body },
          task.id,
        );
      },
    );

    await bootAuthenticatedTasks(page, controller);
    const requestStartIndex = controller.requests.length;
    await openTaskEditor(page, task.title);
    await page.locator("#task-deadline-input").fill("2026-09-20");

    try {
      await page.locator("#task-form-submit").click();
      await expect.poll(() => capturedBody).not.toBeNull();

      expect(capturedBody).toEqual({
        version: 4,
        deadline: "2026-09-20",
      });
      await expect(
        getTaskCard(page, "#active-tasks-list", task.title),
      ).toContainText("18.09.2026");
      expect(controller.state.tasks[0].currentDeadline).toBe("2026-09-18");
    } finally {
      mutationGate.resolve();
    }

    await expect(page.locator("#task-form-status")).toHaveText(
      "Изменения сохранены",
    );
    await expect(
      getTaskCard(page, "#active-tasks-list", task.title),
    ).toContainText("20.09.2026");
    expect(getRouteRequests(controller, "PATCH", pathname)).toHaveLength(1);
    expect(
      controller.requests.slice(requestStartIndex).map(
        ({ method, pathname: requestPath }) => `${method} ${requestPath}`,
      ),
    ).toEqual([`PATCH ${pathname}`, "GET /api/v1/state"]);

    await page.locator("#main-tab-calendar").click();
    await expect(
      page.locator(
        '.calendar-day[data-date="2026-09-20"] .calendar-task__title',
      ),
    ).toHaveText(task.title);
    await expect(
      page.locator(
        '.calendar-day[data-date="2026-09-18"] .calendar-task__title',
      ),
    ).toHaveCount(0);
    expectNoUnexpectedRequests(controller);
  });

  test("E10 completes once from Day and preserves calendar UI", async ({
    page,
  }) => {
    const task = createSyntheticTask({
      id: "test-e10-complete-001",
      title: "E10 complete task",
      difficulty: "hard",
      xpReward: 50,
      currentDeadline: MATRIX_TODAY_KEY,
      xpAwarded: false,
      version: 3,
      createdAt: "2026-09-02T08:00:00.000Z",
    });
    const controller = createApiMockController({
      state: createSingleActiveTaskState(task),
    });
    const pathname = `/api/v1/tasks/${task.id}/complete`;
    const mutationGate = createDeferred();
    let capturedRequest = null;

    controller.setRouteOverride(
      "POST",
      pathname,
      async ({ route, request, controller: activeController, body }) => {
        capturedRequest = {
          body: deepClone(body),
          csrf: request.headers()["x-csrf-token"],
        };
        await mutationGate.promise;
        await handleCompleteTask(
          route,
          activeController,
          request,
          { method: "POST", pathname },
          { present: true, valid: true, value: body },
          task.id,
        );
      },
    );

    const expectedUi = createUiPreferences({
      mode: "day",
      selectedDate: MATRIX_TODAY_KEY,
    });

    await installMatrixClock(page);
    await seedUiPreferences(page, expectedUi);
    await installApiMock(page, controller);
    await page.goto("/index.html");
    await expect(page.locator("#main-panel-calendar")).toBeVisible();
    const requestStartIndex = controller.requests.length;
    const overviewTask = getCalendarOverviewTask(page, task.title);

    try {
      await overviewTask.locator(".task-card__complete-button").click();
      await expect.poll(() => capturedRequest).not.toBeNull();

      expect(capturedRequest).toEqual({
        body: { version: 3 },
        csrf: TEST_CSRF_TOKEN,
      });
      await expect(overviewTask).toBeVisible();
      await expectTaskActionButtonsDisabled(overviewTask);
      expect(controller.state.tasks[0].status).toBe("active");
    } finally {
      mutationGate.resolve();
    }

    await expect(getCalendarOverviewTask(page, task.title)).toHaveCount(0);
    await expect(page.locator("#calendar-selected-empty")).toBeVisible();
    expect(getRouteRequests(controller, "POST", pathname)).toHaveLength(1);
    expect(
      controller.requests.slice(requestStartIndex).map(
        ({ method, pathname: requestPath }) => `${method} ${requestPath}`,
      ),
    ).toEqual([`POST ${pathname}`, "GET /api/v1/state"]);
    await expect(page.locator("#profile-total-xp")).toHaveText("50");
    await expect(page.locator("#profile-level")).toHaveText("1");
    await expect(page.locator("#profile-progress-text")).toHaveText(
      "50 из 100 XP",
    );
    await expect(page.locator("#profile-progress")).toHaveAttribute(
      "aria-valuenow",
      "50",
    );
    await expectUiPreferencesInDom(page, expectedUi);
    expect(await getStoredUiPreferences(page)).toEqual(expectedUi);
    expect(controller.state.tasks[0].status).toBe("completed");
    expect(controller.state.tasks[0].xpAwarded).toBe(true);
    await expect(
      getTaskCard(page, "#completed-tasks-list", task.title),
    ).toHaveCount(1);
    expectNoUnexpectedRequests(controller);
  });

  test("E10 deletes once from Day and preserves calendar UI", async ({ page }) => {
    const task = createSyntheticTask({
      id: "test-e10-delete-001",
      title: "E10 delete task",
      currentDeadline: MATRIX_TODAY_KEY,
      version: 6,
      createdAt: "2026-09-03T08:00:00.000Z",
    });
    const controller = createApiMockController({
      state: createSingleActiveTaskState(task),
    });
    const pathname = `/api/v1/tasks/${task.id}`;
    const mutationGate = createDeferred();
    let capturedRequest = null;
    let confirmationMessage = null;

    controller.setRouteOverride(
      "DELETE",
      pathname,
      async ({ route, request, controller: activeController, body }) => {
        capturedRequest = {
          body: deepClone(body),
          csrf: request.headers()["x-csrf-token"],
        };
        await mutationGate.promise;
        await handleDeleteTask(
          route,
          activeController,
          request,
          { method: "DELETE", pathname },
          { present: true, valid: true, value: body },
          task.id,
        );
      },
    );

    const expectedUi = createUiPreferences({
      mode: "day",
      selectedDate: MATRIX_TODAY_KEY,
    });

    await installMatrixClock(page);
    await seedUiPreferences(page, expectedUi);
    await installApiMock(page, controller);
    await page.goto("/index.html");
    await expect(page.locator("#main-panel-calendar")).toBeVisible();
    const requestStartIndex = controller.requests.length;
    const overviewTask = getCalendarOverviewTask(page, task.title);
    page.once("dialog", async (dialog) => {
      confirmationMessage = dialog.message();
      await dialog.accept();
    });

    try {
      await overviewTask.locator(".task-card__delete-button").click();
      await expect.poll(() => capturedRequest).not.toBeNull();

      expect(confirmationMessage).toBe(`Удалить задачу «${task.title}»?`);
      expect(capturedRequest).toEqual({
        body: { version: 6 },
        csrf: TEST_CSRF_TOKEN,
      });
      await expect(overviewTask).toBeVisible();
      await expectTaskActionButtonsDisabled(overviewTask);
      expect(controller.state.tasks).toHaveLength(1);
    } finally {
      mutationGate.resolve();
    }

    await expect(getCalendarOverviewTask(page, task.title)).toHaveCount(0);
    await expect(page.locator("#calendar-selected-empty")).toBeVisible();
    expect(getRouteRequests(controller, "DELETE", pathname)).toHaveLength(1);
    expect(
      controller.requests.slice(requestStartIndex).map(
        ({ method, pathname: requestPath }) => `${method} ${requestPath}`,
      ),
    ).toEqual([`DELETE ${pathname}`, "GET /api/v1/state"]);

    await expectUiPreferencesInDom(page, expectedUi);
    expect(await getStoredUiPreferences(page)).toEqual(expectedUi);
    expect(controller.state.tasks).toHaveLength(0);
    expectNoUnexpectedRequests(controller);
  });
});

test.describe("E11 editing contracts", () => {
  test("E11 starts editing directly from Calendar with the shared focused form", async ({
    page,
  }) => {
    const task = createSyntheticTask({
      id: "test-e11-calendar-edit-001",
      title: "E11 calendar edit task",
      currentDeadline: MATRIX_TODAY_KEY,
      version: 2,
      createdAt: "2026-09-04T08:00:00.000Z",
    });
    const state = createSingleActiveTaskState(task);
    const controller = createApiMockController({ state });

    await installMatrixClock(page);
    await seedUiPreferences(
      page,
      createUiPreferences({
        activeMainTab: "tasks",
        mode: "day",
        selectedDate: MATRIX_TODAY_KEY,
      }),
    );
    await installApiMock(page, controller);
    await page.goto("/index.html");
    await expect(page.locator("#main-panel-tasks")).toBeVisible();
    await page.locator("#task-form-toggle").click();
    await expect(page.locator("#task-form-panel")).toBeVisible();
    await page.locator("#main-tab-calendar").click();
    await expect(page.locator("#main-panel-calendar")).toBeVisible();
    const overviewTask = getCalendarOverviewTask(page, task.title);
    const actionButtons = overviewTask.locator(".task-card__action-button");
    const editButton = overviewTask.getByRole("button", {
      name: "Редактировать",
    });
    let dialogCount = 0;

    page.on("dialog", async (dialog) => {
      dialogCount += 1;
      await dialog.dismiss();
    });

    await expect(actionButtons).toHaveText([
      "Выполнено",
      "Редактировать",
      "Удалить",
    ]);
    await actionButtons.nth(0).focus();
    await expect(actionButtons.nth(0)).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(actionButtons.nth(1)).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(actionButtons.nth(2)).toBeFocused();
    await expect(editButton).toBeVisible();
    await editButton.click();
    await expect(page.locator("#main-panel-tasks")).toBeVisible();
    await expect(page.locator("#task-form-heading")).toHaveText(
      "Редактирование задачи",
    );
    await expect(page.locator("#task-title-input")).toHaveValue(task.title);
    await expect(page.locator("#task-title-input")).toBeFocused();
    expect(dialogCount).toBe(0);
    await page.locator("#main-tab-calendar").click();
    await expect(page.locator(".calendar")).toHaveAttribute(
      "data-calendar-mode",
      "day",
    );
    await expect(page.locator("#calendar-month")).toHaveText(
      "18 сентября 2026",
    );
    expectNoUnexpectedRequests(controller);
  });

  test("E11 keeps a dirty create draft when Calendar edit replacement is cancelled", async ({
    page,
  }) => {
    const task = createSyntheticTask({
      id: "test-e11-dirty-create-cancel-001",
      title: "E11 replacement target",
      currentDeadline: MATRIX_TODAY_KEY,
      version: 4,
      createdAt: "2026-09-04T09:00:00.000Z",
    });
    const controller = createApiMockController({
      state: createSingleActiveTaskState(task),
    });
    const draftTitle = "Черновик перед заменой";
    let confirmationMessage = null;

    await bootAuthenticatedTasks(page, controller);
    await page.locator("#task-form-toggle").click();
    await fillSyntheticTaskDraft(page, draftTitle);
    await page.locator("#main-tab-calendar").click();
    await page.locator('[data-calendar-mode="day"]').click();
    page.once("dialog", async (dialog) => {
      confirmationMessage = dialog.message();
      await dialog.dismiss();
    });

    await getCalendarOverviewTask(page, task.title)
      .getByRole("button", { name: "Редактировать" })
      .click();

    expect(confirmationMessage).toBe(TASK_FORM_REPLACEMENT_CONFIRMATION);
    await expect(page.locator("#main-panel-calendar")).toBeVisible();
    await expect(page.locator(".calendar")).toHaveAttribute(
      "data-calendar-mode",
      "day",
    );
    await expect(page.locator("#calendar-month")).toHaveText(
      "18 сентября 2026",
    );
    await expect(page.locator("#task-form-heading")).toHaveText("Новая задача");
    await expect(page.locator("#task-title-input")).toHaveValue(draftTitle);

    await page.locator("#main-tab-tasks").click();
    await expect(page.locator("#task-form-panel")).toBeVisible();
    await expect(page.locator("#task-title-input")).toHaveValue(draftTitle);
    await expect(page.locator("#task-direction-select")).toHaveValue("Школа");
    await expect(page.locator("#task-subject-select")).toHaveValue(
      "test-subject-math-001",
    );
    await expect(page.locator("#task-difficulty-select")).toHaveValue("hard");
    await expect(page.locator("#task-deadline-input")).toHaveValue(
      "2026-10-05",
    );
    expectNoUnexpectedRequests(controller);
  });

  test("E11 replaces a dirty create draft after Calendar edit confirmation", async ({
    page,
  }) => {
    const task = createSyntheticTask({
      id: "test-e11-dirty-create-confirm-001",
      title: "E11 confirmed replacement target",
      currentDeadline: MATRIX_TODAY_KEY,
      version: 6,
      createdAt: "2026-09-04T10:00:00.000Z",
    });
    const controller = createApiMockController({
      state: createSingleActiveTaskState(task),
    });
    let confirmationMessage = null;

    await bootAuthenticatedTasks(page, controller);
    await page.locator("#task-form-toggle").click();
    await fillSyntheticTaskDraft(page, "E11 discarded create draft");
    await page.locator("#main-tab-calendar").click();
    await page.locator('[data-calendar-mode="day"]').click();
    page.once("dialog", async (dialog) => {
      confirmationMessage = dialog.message();
      await dialog.accept();
    });

    await getCalendarOverviewTask(page, task.title)
      .getByRole("button", { name: "Редактировать" })
      .click();

    expect(confirmationMessage).toBe(TASK_FORM_REPLACEMENT_CONFIRMATION);
    await expect(page.locator("#main-panel-tasks")).toBeVisible();
    await expect(page.locator("#task-form")).toHaveCount(1);
    await expect(page.locator("#task-form-heading")).toHaveText(
      "Редактирование задачи",
    );
    await expect(page.locator("#task-form-context")).toHaveText(
      `Редактируется: ${task.title}`,
    );
    await expect(page.locator("#task-title-input")).toHaveValue(task.title);
    await expect(page.locator("#task-direction-select")).toHaveValue(
      task.direction,
    );
    await expect(page.locator("#task-difficulty-select")).toHaveValue(
      task.difficulty,
    );
    await expect(page.locator(".calendar")).toHaveAttribute(
      "data-calendar-mode",
      "day",
    );
    await expect(page.locator("#calendar-month")).toHaveText(
      "18 сентября 2026",
    );
    expectNoUnexpectedRequests(controller);
  });

  test("E11 keeps a dirty edit draft when another task replacement is cancelled", async ({
    page,
  }) => {
    const firstTask = createSyntheticTask({
      id: "test-e11-dirty-edit-first-001",
      title: "E11 first edit task",
      currentDeadline: MATRIX_TODAY_KEY,
      version: 3,
      createdAt: "2026-09-04T11:00:00.000Z",
    });
    const secondTask = createSyntheticTask({
      id: "test-e11-dirty-edit-second-001",
      title: "E11 second edit task",
      currentDeadline: MATRIX_TODAY_KEY,
      version: 7,
      createdAt: "2026-09-04T12:00:00.000Z",
    });
    const state = createSingleActiveTaskState(firstTask);
    const editedTitle = "E11 first unsaved edit";
    let confirmationMessage = null;

    state.tasks.push(secondTask);
    const controller = createApiMockController({ state });

    await bootAuthenticatedTasks(page, controller);
    await openTaskEditor(page, firstTask.title);
    await page.locator("#task-title-input").fill(editedTitle);
    page.once("dialog", async (dialog) => {
      confirmationMessage = dialog.message();
      await dialog.dismiss();
    });

    await getTaskCard(page, "#active-tasks-list", secondTask.title)
      .locator(".task-card__edit-button")
      .click();

    expect(confirmationMessage).toBe(TASK_FORM_REPLACEMENT_CONFIRMATION);
    await expect(page.locator("#main-panel-tasks")).toBeVisible();
    await expect(page.locator("#task-form-panel")).toBeVisible();
    await expect(page.locator("#task-form-context")).toHaveText(
      `Редактируется: ${firstTask.title}`,
    );
    await expect(page.locator("#task-title-input")).toHaveValue(editedTitle);
    expectNoUnexpectedRequests(controller);
  });

  test("E11 sends the task version captured when editing opened", async ({
    page,
  }) => {
    const task = createSyntheticTask({
      id: "test-e11-version-001",
      title: "E11 version task",
      currentDeadline: MATRIX_TODAY_KEY,
      version: 7,
      createdAt: "2026-09-05T08:00:00.000Z",
    });
    const controller = createApiMockController({
      state: createSingleActiveTaskState(task),
    });
    const pathname = `/api/v1/tasks/${task.id}`;

    await bootAuthenticatedTasks(page, controller);
    await openTaskEditor(page, task.title);
    controller.state.tasks[0].version = 8;
    controller.state.tasks[0].title = "E11 authoritative task";
    controller.state.syncVersion += 1;
    await page.locator("#task-deadline-input").fill("2026-09-19");
    await page.locator("#task-form-submit").click();

    await expect(page.locator("#task-form-status")).toContainText(
      "Задача изменилась в другом месте",
    );
    const patchRequests = getRouteRequests(controller, "PATCH", pathname);

    expect(patchRequests).toHaveLength(1);
    expect(patchRequests[0].body).toEqual({
      version: 7,
      deadline: "2026-09-19",
    });
    await expect(page.locator("#task-form-panel")).toBeHidden();
    await expect(
      getTaskCard(page, "#active-tasks-list", "E11 authoritative task"),
    ).toBeVisible();
    expectNoUnexpectedRequests(controller);
  });

  test("E11 does not PATCH an unchanged edit and reports no changes", async ({
    page,
  }) => {
    const task = createSyntheticTask({
      id: "test-e11-unchanged-001",
      title: "E11 unchanged task",
      currentDeadline: MATRIX_TODAY_KEY,
      version: 5,
      createdAt: "2026-09-06T08:00:00.000Z",
    });
    const state = createSingleActiveTaskState(task);
    const controller = createApiMockController({ state });
    const pathname = `/api/v1/tasks/${task.id}`;
    const initialVersion = controller.state.tasks[0].version;
    const initialSyncVersion = controller.state.syncVersion;

    await bootAuthenticatedTasks(page, controller);
    await openTaskEditor(page, task.title);
    await page.locator("#task-form-submit").click();
    await expect(page.locator("#task-form-status")).toBeVisible();

    expect.soft(getRouteRequests(controller, "PATCH", pathname)).toHaveLength(0);
    await expect.soft(page.locator("#task-form-status")).toHaveText(
      "Изменений нет",
    );
    expect.soft(controller.state.tasks[0].version).toBe(initialVersion);
    expect.soft(controller.state.syncVersion).toBe(initialSyncVersion);
    expectNoUnexpectedRequests(controller);
  });
});

test.describe("E12 mutation error handling", () => {
  test("E12 handles mutation 401 once and requires reauthentication", async ({
    page,
  }) => {
    const task = createSyntheticTask({
      id: "test-e12-401-001",
      title: "E12 401 task",
      currentDeadline: MATRIX_TODAY_KEY,
      version: 2,
      createdAt: "2026-09-07T08:00:00.000Z",
    });
    const controller = createApiMockController({
      state: createSingleActiveTaskState(task),
    });
    const pathname = `/api/v1/tasks/${task.id}/complete`;

    controller.setRouteOverride("POST", pathname, async ({ route }) => {
      await fulfillApiError(
        route,
        controller,
        { method: "POST", pathname },
        401,
        "Synthetic session expired",
      );
    });

    await bootAuthenticatedTasks(page, controller);
    await page.evaluate(() => {
      window.sessionStorage.setItem(
        "level-up:ui-preferences",
        JSON.stringify({ version: 1, activeMainTab: "tasks" }),
      );
    });
    await getTaskCard(page, "#active-tasks-list", task.title)
      .locator(".task-card__complete-button")
      .click();

    await expect(page.locator("#login-panel")).toBeVisible();
    await expect(page.locator("#main-interface")).toBeHidden();
    await expect(page.locator("#login-error")).toContainText(
      "Сессия завершена",
    );
    expect(getRouteRequests(controller, "POST", pathname)).toHaveLength(1);
    expect(
      await page.evaluate(() =>
        window.sessionStorage.getItem("level-up:ui-preferences"),
      ),
    ).toBeNull();
    expectNoUnexpectedRequests(controller);
  });

  test("E12 handles mutation 403 once without storing CSRF", async ({ page }) => {
    const task = createSyntheticTask({
      id: "test-e12-403-001",
      title: "E12 403 task",
      currentDeadline: MATRIX_TODAY_KEY,
      version: 2,
      createdAt: "2026-09-08T08:00:00.000Z",
    });
    const controller = createApiMockController({
      state: createSingleActiveTaskState(task),
    });
    const pathname = `/api/v1/tasks/${task.id}/complete`;

    controller.setRouteOverride("POST", pathname, async ({ route }) => {
      await fulfillApiError(
        route,
        controller,
        { method: "POST", pathname },
        403,
        "Invalid CSRF token",
      );
    });

    await bootAuthenticatedTasks(page, controller);
    await getTaskCard(page, "#active-tasks-list", task.title)
      .locator(".task-card__complete-button")
      .click();

    await expect(page.locator("#task-form-status")).toContainText(
      "Сервер отклонил запрос",
    );
    await expect(page.locator("#main-interface")).toBeVisible();
    await expect(
      getTaskCard(page, "#active-tasks-list", task.title),
    ).toBeVisible();
    expect(getRouteRequests(controller, "POST", pathname)).toHaveLength(1);
    const storageText = await page.evaluate(() =>
      JSON.stringify({
        sessionStorage: { ...window.sessionStorage },
        localStorage: { ...window.localStorage },
      }),
    );
    expect(storageText).not.toContain(TEST_CSRF_TOKEN);
    expectNoUnexpectedRequests(controller);
  });

  test("E12 handles mutation 409 once and reloads authoritative state", async ({
    page,
  }) => {
    const task = createSyntheticTask({
      id: "test-e12-409-001",
      title: "E12 conflict task",
      currentDeadline: MATRIX_TODAY_KEY,
      version: 3,
      createdAt: "2026-09-09T08:00:00.000Z",
    });
    const controller = createApiMockController({
      state: createSingleActiveTaskState(task),
    });
    const pathname = `/api/v1/tasks/${task.id}`;

    controller.setRouteOverride("PATCH", pathname, async ({ route }) => {
      controller.state.tasks[0].title = "E12 authoritative conflict task";
      controller.state.tasks[0].version += 1;
      controller.state.syncVersion += 1;
      await fulfillApiError(
        route,
        controller,
        { method: "PATCH", pathname },
        409,
        "Task version is stale",
      );
    });

    await bootAuthenticatedTasks(page, controller);
    const requestStartIndex = controller.requests.length;
    await openTaskEditor(page, task.title);
    await page.locator("#task-deadline-input").fill("2026-09-20");
    await page.locator("#task-form-submit").click();

    await expect(page.locator("#task-form-status")).toContainText(
      "Задача изменилась в другом месте",
    );
    await expect(page.locator("#task-form-panel")).toBeHidden();
    await expect(
      getTaskCard(
        page,
        "#active-tasks-list",
        "E12 authoritative conflict task",
      ),
    ).toBeVisible();
    expect(getRouteRequests(controller, "PATCH", pathname)).toHaveLength(1);
    expect(
      controller.requests.slice(requestStartIndex).map(
        ({ method, pathname: requestPath }) => `${method} ${requestPath}`,
      ),
    ).toEqual([`PATCH ${pathname}`, "GET /api/v1/state"]);
    expectNoUnexpectedRequests(controller);
  });

  test("E12 handles one mutation network failure without retry", async ({ page }) => {
    const task = createSyntheticTask({
      id: "test-e12-network-001",
      title: "E12 network task",
      currentDeadline: MATRIX_TODAY_KEY,
      version: 2,
      createdAt: "2026-09-10T08:00:00.000Z",
    });
    const controller = createApiMockController({
      state: createSingleActiveTaskState(task),
    });
    const pathname = `/api/v1/tasks/${task.id}/complete`;

    controller.setRouteOverride("POST", pathname, async ({ route }) => {
      await route.abort("failed");
    });

    await bootAuthenticatedTasks(page, controller);
    await getTaskCard(page, "#active-tasks-list", task.title)
      .locator(".task-card__complete-button")
      .click();

    await expect(page.locator("#task-form-status")).toHaveText(
      "Не удалось связаться с сервером. Проверьте соединение и повторите попытку.",
    );
    await expect(
      getTaskCard(page, "#active-tasks-list", task.title),
    ).toBeVisible();
    await expect(
      getTaskCard(page, "#active-tasks-list", task.title).locator(
        ".task-card__complete-button",
      ),
    ).toBeEnabled();
    expect(getRouteRequests(controller, "POST", pathname)).toHaveLength(1);
    expectNoUnexpectedRequests(controller);
  });

  test("E12 handles a 15-second task mutation timeout with read-only verification", async ({
    page,
  }) => {
    const task = createSyntheticTask({
      id: "test-e12-timeout-001",
      title: "E12 timeout task",
      currentDeadline: MATRIX_TODAY_KEY,
      version: 2,
      createdAt: "2026-09-10T09:00:00.000Z",
    });
    const controller = createApiMockController({
      state: createSingleActiveTaskState(task),
    });
    const pathname = `/api/v1/tasks/${task.id}/complete`;
    const mutationGate = createDeferred();

    controller.setRouteOverride("POST", pathname, async ({ route }) => {
      await mutationGate.promise;
      await route.abort("failed").catch(() => {});
    });

    await bootAuthenticatedTasks(page, controller);
    await page.clock.pauseAt(new Date(MATRIX_FIXED_TIME_MS + 1_000));
    const activeCard = getTaskCard(page, "#active-tasks-list", task.title);
    const completeButton = activeCard.locator(".task-card__complete-button");

    try {
      await completeButton.click();
      await expect
        .poll(() => getRouteRequests(controller, "POST", pathname).length)
        .toBe(1);
      await page.clock.fastForward(14_999);
      await expect(page.locator("#task-form-status")).toBeHidden();
      await page.clock.fastForward(1);
      await expect(page.locator("#task-form-status")).toHaveText(
        "Не удалось подтвердить результат операции. Проверьте актуальные данные перед повтором.",
      );
      const verifyButton = page.getByRole("button", {
        name: "Проверить данные",
      });

      await expect(verifyButton).toBeVisible();
      await expect(verifyButton).toBeEnabled();
      await expect(completeButton).toBeDisabled();
      await expect(
        activeCard.locator(".task-card__edit-button"),
      ).toBeDisabled();
      await expect(
        activeCard.locator(".task-card__delete-button"),
      ).toBeDisabled();
      await expect(page.locator("#task-form-submit")).toBeDisabled();
      expect(getRouteRequests(controller, "POST", pathname)).toHaveLength(1);
      expect(
        getRouteRequests(controller, "GET", "/api/v1/state"),
      ).toHaveLength(1);

      await verifyButton.click();
      await expect(page.locator("#task-form-status")).toHaveText(
        "Данные обновлены. Проверьте результат операции перед повтором.",
      );
      await expect(
        getTaskCard(page, "#active-tasks-list", task.title),
      ).toBeVisible();
      await expect(
        getTaskCard(page, "#active-tasks-list", task.title).locator(
          ".task-card__complete-button",
        ),
      ).toBeEnabled();
      expect(getRouteRequests(controller, "POST", pathname)).toHaveLength(1);
      expect(
        getRouteRequests(controller, "GET", "/api/v1/state"),
      ).toHaveLength(2);
      expectNoUnexpectedRequests(controller);
    } finally {
      mutationGate.resolve();
    }
  });
});

test.describe("E13 accepted mutation with failed state refresh", () => {
  test("E13 reports accepted mutation separately and offers read-only retry", async ({
    page,
  }) => {
    const task = createSyntheticTask({
      id: "test-e13-refresh-001",
      title: "E13 refresh task",
      currentDeadline: MATRIX_TODAY_KEY,
      version: 4,
      createdAt: "2026-09-11T08:00:00.000Z",
    });
    const controller = createApiMockController({
      state: createSingleActiveTaskState(task),
    });
    const pathname = `/api/v1/tasks/${task.id}`;
    let stateReadCount = 0;

    controller.setRouteOverride("GET", "/api/v1/state", async ({ route }) => {
      stateReadCount += 1;

      if (stateReadCount === 2) {
        await fulfillApiError(
          route,
          controller,
          { method: "GET", pathname: "/api/v1/state" },
          503,
          "Synthetic state refresh failure",
        );
        return;
      }

      await fulfillJson(route, 200, deepClone(controller.state));
    });

    await bootAuthenticatedTasks(page, controller);
    await openTaskEditor(page, task.title);
    await page.locator("#task-deadline-input").fill("2026-09-21");
    await page.locator("#task-form-submit").click();
    await expect(page.locator("#task-form-status")).toBeVisible();

    expect(getRouteRequests(controller, "PATCH", pathname)).toHaveLength(1);
    expect(controller.state.tasks[0].currentDeadline).toBe("2026-09-21");
    expect(controller.state.tasks[0].version).toBe(5);
    expect(controller.state.syncVersion).toBe(2);
    expect(stateReadCount).toBe(2);
    await expect.soft(page.locator("#task-form-status")).toHaveText(
      "Изменение принято сервером, не удалось обновить данные",
    );
    const retryButton = page.getByRole("button", {
      name: /повторить.*(?:загрузку|обновление)|обновить данные/i,
    });

    await expect.soft(retryButton).toBeVisible();

    if ((await retryButton.count()) > 0) {
      await retryButton.click();
      await expect(
        getTaskCard(page, "#active-tasks-list", task.title),
      ).toContainText("21.09.2026");
    }

    expect(getRouteRequests(controller, "PATCH", pathname)).toHaveLength(1);
    expectNoUnexpectedRequests(controller);
  });
});

const UI_PREFERENCES_KEY = "level-up:ui-preferences";
const UI_FILTER_WITHOUT_SUBJECT = "__without_subject__";
const E14_E21_SELECTED_DATE = "2026-09-21";

async function getStoredUiPreferences(page) {
  return page.evaluate((key) => {
    const rawValue = window.sessionStorage.getItem(key);

    return rawValue === null ? null : JSON.parse(rawValue);
  }, UI_PREFERENCES_KEY);
}

async function getBrowserStorageSnapshot(page) {
  return page.evaluate(() => ({
    sessionStorage: Object.fromEntries(
      Array.from({ length: window.sessionStorage.length }, (_, index) => {
        const key = window.sessionStorage.key(index);

        return [key, window.sessionStorage.getItem(key)];
      }),
    ),
    localStorage: Object.fromEntries(
      Array.from({ length: window.localStorage.length }, (_, index) => {
        const key = window.localStorage.key(index);

        return [key, window.localStorage.getItem(key)];
      }),
    ),
  }));
}

async function setUiPreferencesThroughControls(
  page,
  {
    activeMainTab = "calendar",
    status = "active",
    direction = "Школа",
    subject = "all",
    mode = "day",
    selectedDate = E14_E21_SELECTED_DATE,
  } = {},
) {
  await page.locator("#main-tab-tasks").click();

  if (await page.locator("#filters-panel").isHidden()) {
    await page.locator("#filters-toggle").click();
  }

  await page.locator("#status-filter").selectOption(status);
  await page.locator("#direction-filter").selectOption(direction);
  await page.locator("#subject-filter").selectOption(subject);
  await page.locator("#main-tab-calendar").click();

  if (
    (await page.locator('.calendar [data-calendar-mode="month"]').getAttribute(
      "aria-pressed",
    )) !== "true"
  ) {
    await page.locator('.calendar [data-calendar-mode="month"]').click();
  }

  await page
    .locator(`.calendar-day[data-date="${selectedDate}"]`)
    .click();
  await page.locator(`.calendar [data-calendar-mode="${mode}"]`).click();

  if (activeMainTab !== "calendar") {
    await page.locator(`#main-tab-${activeMainTab}`).click();
  }
}

async function expectUiPreferencesInDom(page, expected) {
  await expect(page.locator(`#main-tab-${expected.activeMainTab}`)).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.locator(`#main-panel-${expected.activeMainTab}`)).toBeVisible();
  await expect(page.locator("#status-filter")).toHaveValue(
    expected.filters.status,
  );
  await expect(page.locator("#direction-filter")).toHaveValue(
    expected.filters.direction,
  );
  await expect(page.locator("#subject-filter")).toHaveValue(
    expected.filters.subject,
  );
  await expect(page.locator(".calendar")).toHaveAttribute(
    "data-calendar-mode",
    expected.calendar.mode,
  );
  await expect(
    page.locator(
      `.calendar [data-calendar-mode="${expected.calendar.mode}"]`,
    ),
  ).toHaveAttribute("aria-pressed", "true");

  if (expected.calendar.mode === "day") {
    const parts = expected.calendar.selectedDate.split("-").map(Number);
    const expectedDate = new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    })
      .format(new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])))
      .replace(/\s*г\.$/, "");

    await expect(page.locator("#calendar-month")).toHaveText(expectedDate);
  } else {
    await expect(
      page
        .locator(
          `.calendar [data-date="${expected.calendar.selectedDate}"][aria-selected="true"]`,
        )
        .first(),
    ).toBeAttached();
  }
}

async function bootAuthenticatedWithRawPreferences(
  page,
  rawPreferences,
  controller = createApiMockController(),
) {
  await installMatrixClock(page);
  await page.addInitScript(
    ({ key, rawValue }) => {
      window.sessionStorage.setItem(key, rawValue);
    },
    { key: UI_PREFERENCES_KEY, rawValue: rawPreferences },
  );
  await installApiMock(page, controller);
  await page.goto("/index.html");
  await expect(page.locator("#main-interface")).toBeVisible();
  return controller;
}

async function expectDefaultUiPreferences(page) {
  const expected = createUiPreferences({
    activeMainTab: "tasks",
    selectedDate: MATRIX_TODAY_KEY,
  });

  await expectUiPreferencesInDom(page, expected);
  expect(await getStoredUiPreferences(page)).toEqual(expected);
}

test.describe("E14 UI preferences survive refresh", () => {
  test("E14 derives the task filter panel from restored filter values", async ({
    page,
  }) => {
    const controller = createApiMockController();
    const subjectValue = `subject:${controller.state.subjects[0].id}`;
    const expected = createUiPreferences({
      activeMainTab: "tasks",
      status: "overdue",
      direction: controller.state.tasks[0].direction,
      subject: subjectValue,
      mode: "day",
      selectedDate: E14_E21_SELECTED_DATE,
    });
    const expectedDefaults = createUiPreferences({
      activeMainTab: "tasks",
      mode: "day",
      selectedDate: E14_E21_SELECTED_DATE,
    });

    await installMatrixClock(page);
    await installApiMock(page, controller);
    await page.goto("/index.html");
    await expect(page.locator("#main-interface")).toBeVisible();
    await setUiPreferencesThroughControls(page, {
      activeMainTab: expected.activeMainTab,
      status: expected.filters.status,
      direction: expected.filters.direction,
      subject: expected.filters.subject,
      mode: expected.calendar.mode,
      selectedDate: expected.calendar.selectedDate,
    });
    await expect(page.locator("#filters-panel")).toBeVisible();
    await page.locator("#filters-toggle").click();
    await expect(page.locator("#filters-panel")).toBeHidden();

    await page.reload();
    await expect(page.locator("#main-interface")).toBeVisible();
    await expectUiPreferencesInDom(page, expected);
    await expect(page.locator("#filters-panel")).toBeVisible();
    await expect(page.locator("#filters-toggle")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(await getStoredUiPreferences(page)).toEqual(expected);

    await page.locator("#filters-reset-button").click();
    await expectUiPreferencesInDom(page, expectedDefaults);
    expect(await getStoredUiPreferences(page)).toEqual(expectedDefaults);
    await page.locator("#filters-toggle").click();
    await expect(page.locator("#filters-panel")).toBeHidden();

    await page.reload();
    await expect(page.locator("#main-interface")).toBeVisible();
    await expectUiPreferencesInDom(page, expectedDefaults);
    await expect(page.locator("#filters-panel")).toBeHidden();
    await expect(page.locator("#filters-toggle")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(await getStoredUiPreferences(page)).toEqual(expectedDefaults);
    expectNoUnexpectedRequests(controller);
  });

  test("E14 restores non-default UI after F5 using fresh auth, CSRF and state", async ({
    page,
  }) => {
    const controller = createApiMockController();
    const subjectValue = `subject:${controller.state.subjects[0].id}`;
    const expected = createUiPreferences({
      activeMainTab: "calendar",
      status: "active",
      direction: "Школа",
      subject: subjectValue,
      mode: "day",
      selectedDate: E14_E21_SELECTED_DATE,
    });
    const issuedCsrfTokens = [];

    controller.setRouteOverride(
      "POST",
      "/api/v1/auth/csrf",
      async ({ route }) => {
        const token = `test-e14-csrf-${issuedCsrfTokens.length + 1}`;

        issuedCsrfTokens.push(token);
        controller.csrfToken = token;
        await fulfillJson(route, 200, { csrfToken: token });
      },
    );

    await installMatrixClock(page);
    await installApiMock(page, controller);
    await page.goto("/index.html");
    await expect(page.locator("#main-interface")).toBeVisible();
    await setUiPreferencesThroughControls(page, {
      subject: subjectValue,
    });
    expect(await getStoredUiPreferences(page)).toEqual(expected);

    await page.reload();
    await expect(page.locator("#main-interface")).toBeVisible();
    await expectUiPreferencesInDom(page, expected);
    expect(await getStoredUiPreferences(page)).toEqual(expected);
    expect(getRouteRequests(controller, "GET", "/api/v1/auth/me")).toHaveLength(
      2,
    );
    expect(
      getRouteRequests(controller, "POST", "/api/v1/auth/csrf"),
    ).toHaveLength(2);
    expect(getRouteRequests(controller, "GET", "/api/v1/state")).toHaveLength(
      2,
    );
    expect(issuedCsrfTokens).toEqual([
      "test-e14-csrf-1",
      "test-e14-csrf-2",
    ]);
    const storageText = JSON.stringify(await getBrowserStorageSnapshot(page));

    expect(storageText).not.toContain("test-e14-csrf-1");
    expect(storageText).not.toContain("test-e14-csrf-2");
    expectNoUnexpectedRequests(controller);
  });
});

test.describe("E15 fresh server state after refresh", () => {
  test("E15 keeps UI preferences but renders only the new server state", async ({
    page,
  }) => {
    const controller = createApiMockController();
    const selectedSubject = controller.state.subjects[0];
    const subjectValue = `subject:${selectedSubject.id}`;
    const expected = createUiPreferences({
      activeMainTab: "calendar",
      status: "active",
      direction: "Школа",
      subject: subjectValue,
      mode: "day",
      selectedDate: E14_E21_SELECTED_DATE,
    });
    const oldTaskTitle = controller.state.tasks[0].title;
    const newTaskTitle = "E15 fresh server task";

    await installMatrixClock(page);
    await installApiMock(page, controller);
    await page.goto("/index.html");
    await expect(page.locator("#main-interface")).toBeVisible();
    await setUiPreferencesThroughControls(page, { subject: subjectValue });

    controller.state.profile.displayName = "E15 fresh profile";
    controller.state.profile.totalXp = 85;
    controller.state.profile.level = 1;
    selectedSubject.name = "E15 fresh subject";
    selectedSubject.normalizedName = "e15 fresh subject";
    controller.state.tasks = [
      createSyntheticTask({
        id: "test-e15-fresh-task-001",
        title: newTaskTitle,
        subjectId: selectedSubject.id,
        currentDeadline: E14_E21_SELECTED_DATE,
        createdAt: "2026-09-12T08:00:00.000Z",
      }),
    ];
    controller.state.syncVersion += 1;

    await page.reload();
    await expect(page.locator("#main-interface")).toBeVisible();
    await expectUiPreferencesInDom(page, expected);
    await expect(page.locator("#profile-name")).toHaveText("E15 fresh profile");
    await expect(page.locator("#profile-total-xp")).toHaveText("85");
    await expect(page.locator("#subject-filter")).toContainText(
      "E15 fresh subject",
    );
    await expect(
      page.locator("#calendar-selected-tasks .calendar-day-task__title"),
    ).toHaveText(newTaskTitle);
    await expect(page.getByText(oldTaskTitle, { exact: true })).toHaveCount(0);
    expect(getRouteRequests(controller, "GET", "/api/v1/state")).toHaveLength(
      2,
    );
    const storageText = JSON.stringify(await getBrowserStorageSnapshot(page));

    expect(storageText).not.toContain(oldTaskTitle);
    expect(storageText).not.toContain(newTaskTitle);
    expect(storageText).not.toContain("E15 fresh profile");
    expectNoUnexpectedRequests(controller);
  });
});

test.describe("E16 stale subject preference normalization", () => {
  test("E16 resets only a missing subject filter after fresh state", async ({
    page,
  }) => {
    const state = createMockState();
    const removableSubject = {
      id: "test-e16-removable-subject-001",
      name: "E16 removable subject",
      normalizedName: "e16 removable subject",
      isSystem: false,
      version: 1,
      createdAt: "2026-09-12T09:00:00.000Z",
      updatedAt: "2026-09-12T09:00:00.000Z",
    };

    state.subjects.push(removableSubject);
    const controller = createApiMockController({ state });
    const subjectValue = `subject:${removableSubject.id}`;
    const expected = createUiPreferences({
      activeMainTab: "calendar",
      status: "active",
      direction: "Школа",
      subject: "all",
      mode: "day",
      selectedDate: E14_E21_SELECTED_DATE,
    });

    await installMatrixClock(page);
    await installApiMock(page, controller);
    await page.goto("/index.html");
    await expect(page.locator("#main-interface")).toBeVisible();
    await setUiPreferencesThroughControls(page, { subject: subjectValue });
    controller.state.subjects = controller.state.subjects.filter(
      ({ id }) => id !== removableSubject.id,
    );
    controller.state.syncVersion += 1;

    await page.reload();
    await expect(page.locator("#main-interface")).toBeVisible();
    await expectUiPreferencesInDom(page, expected);
    expect(await getStoredUiPreferences(page)).toEqual(expected);
    expectNoUnexpectedRequests(controller);
  });
});

test.describe("E17 invalid UI preferences", () => {
  test("E17 uses safe defaults for malformed JSON", async ({ page }) => {
    const controller = await bootAuthenticatedWithRawPreferences(
      page,
      "{malformed-json",
    );

    await expectDefaultUiPreferences(page);
    await expect(page.locator("#profile-name")).toHaveText(
      controller.state.profile.displayName,
    );
    expectNoUnexpectedRequests(controller);
  });

  test("E17 uses safe defaults for a non-object root", async ({ page }) => {
    const controller = await bootAuthenticatedWithRawPreferences(page, "[]");

    await expectDefaultUiPreferences(page);
    expectNoUnexpectedRequests(controller);
  });

  test("E17 uses safe defaults for an unknown version", async ({ page }) => {
    const controller = await bootAuthenticatedWithRawPreferences(
      page,
      JSON.stringify({ version: 999, activeMainTab: "calendar" }),
    );

    await expectDefaultUiPreferences(page);
    expectNoUnexpectedRequests(controller);
  });

  test("E17 normalizes invalid fields without discarding valid fields", async ({
    page,
  }) => {
    const rawValue = {
      version: 1,
      activeMainTab: "archive",
      filters: {
        status: "invalid-status",
        direction: "invalid-direction",
        subject: UI_FILTER_WITHOUT_SUBJECT,
      },
      calendar: {
        mode: "invalid-mode",
        selectedDate: E14_E21_SELECTED_DATE,
      },
    };
    const controller = await bootAuthenticatedWithRawPreferences(
      page,
      JSON.stringify(rawValue),
    );
    const expected = createUiPreferences({
      activeMainTab: "archive",
      status: "all",
      direction: "all",
      subject: UI_FILTER_WITHOUT_SUBJECT,
      mode: "month",
      selectedDate: E14_E21_SELECTED_DATE,
    });

    await expectUiPreferencesInDom(page, expected);
    expect(await getStoredUiPreferences(page)).toEqual(expected);
    expectNoUnexpectedRequests(controller);
  });

  test("E17 strips extra fields instead of merging arbitrary state", async ({
    page,
  }) => {
    const expected = createUiPreferences({
      activeMainTab: "calendar",
      status: "active",
      direction: "Школа",
      subject: "all",
      mode: "day",
      selectedDate: E14_E21_SELECTED_DATE,
    });
    const rawValue = {
      ...expected,
      unexpected: "E17_SYNTHETIC_EXTRA",
      appState: {
        tasks: [{ title: "E17_SYNTHETIC_FAKE_TASK" }],
      },
      fakeToken: "E17_SYNTHETIC_FAKE_TOKEN",
      filters: {
        ...expected.filters,
        unexpected: "E17_SYNTHETIC_FILTER_EXTRA",
      },
      calendar: {
        ...expected.calendar,
        unexpected: "E17_SYNTHETIC_CALENDAR_EXTRA",
      },
    };
    const controller = await bootAuthenticatedWithRawPreferences(
      page,
      JSON.stringify(rawValue),
    );

    await expectUiPreferencesInDom(page, expected);
    expect(await getStoredUiPreferences(page)).toEqual(expected);
    const storageText = JSON.stringify(await getBrowserStorageSnapshot(page));

    expect(storageText).not.toContain("E17_SYNTHETIC_EXTRA");
    expect(storageText).not.toContain("E17_SYNTHETIC_FAKE_TASK");
    expect(storageText).not.toContain("E17_SYNTHETIC_FAKE_TOKEN");
    await expect(page.getByText("E17_SYNTHETIC_FAKE_TASK")).toHaveCount(0);
    await expect(page.locator("#profile-name")).toHaveText(
      controller.state.profile.displayName,
    );
    expectNoUnexpectedRequests(controller);
  });
});

async function makeSessionStorageThrow(page, { writesOnly = false } = {}) {
  await page.addInitScript(({ onlyWrites }) => {
    const sessionStorageObject = window.sessionStorage;
    const methods = onlyWrites
      ? ["setItem"]
      : ["getItem", "setItem", "removeItem"];

    for (const methodName of methods) {
      const original = Storage.prototype[methodName];

      Storage.prototype[methodName] = function (...args) {
        if (this === sessionStorageObject) {
          if (methodName === "setItem" && onlyWrites) {
            throw new DOMException(
              "Synthetic sessionStorage quota failure",
              "QuotaExceededError",
            );
          }

          throw new DOMException(
            "Synthetic sessionStorage access denied",
            "SecurityError",
          );
        }

        return original.apply(this, args);
      };
    }
  }, { onlyWrites: writesOnly });
}

test.describe("E18 unavailable browser storage", () => {
  test("E18 keeps the UI working when sessionStorage access throws", async ({
    page,
  }) => {
    const controller = createApiMockController();
    const subjectValue = `subject:${controller.state.subjects[0].id}`;

    await installMatrixClock(page);
    await makeSessionStorageThrow(page);
    await installApiMock(page, controller);
    await page.goto("/index.html");
    await expect(page.locator("#main-interface")).toBeVisible();
    await setUiPreferencesThroughControls(page, { subject: subjectValue });
    await expectUiPreferencesInDom(
      page,
      createUiPreferences({
        activeMainTab: "calendar",
        status: "active",
        direction: "Школа",
        subject: subjectValue,
        mode: "day",
        selectedDate: E14_E21_SELECTED_DATE,
      }),
    );
    expectNoUnexpectedRequests(controller);
  });

  test("E18 visibly warns when UI preferences cannot be written", async ({
    page,
  }) => {
    const controller = createApiMockController();

    await installMatrixClock(page);
    await makeSessionStorageThrow(page, { writesOnly: true });
    await installApiMock(page, controller);
    await page.goto("/index.html");
    await expect(page.locator("#main-interface")).toBeVisible();
    await setUiPreferencesThroughControls(page, { subject: "all" });
    await expect(page.locator("#main-panel-calendar")).toBeVisible();
    await expect(page.locator("body")).toContainText(
      /настройк[^\n]{0,160}(?:не\s+(?:сохран|восстанов)|после\s+обновлен)/i,
    );
    expectNoUnexpectedRequests(controller);
  });
});

test.describe("E19 logout, reauthentication and account isolation", () => {
  test("E19 logout clears only Level Up preferences and resets UI memory", async ({
    page,
  }) => {
    const controller = createApiMockController();
    const subjectValue = `subject:${controller.state.subjects[0].id}`;

    await installMatrixClock(page);
    await installApiMock(page, controller);
    await page.goto("/index.html");
    await expect(page.locator("#main-interface")).toBeVisible();
    await setUiPreferencesThroughControls(page, { subject: subjectValue });
    await page.evaluate(() => {
      window.sessionStorage.setItem(
        "test-e19-unrelated-key",
        "test-e19-unrelated-value",
      );
    });
    await page.locator("#logout-button").click();

    await expect(page.locator("#login-panel")).toBeVisible();
    await expect(page.locator("#main-interface")).toBeHidden();
    await expect(
      page.getByText(controller.state.tasks[0].title, { exact: true }),
    ).not.toBeVisible();
    const snapshot = await getBrowserStorageSnapshot(page);

    expect(snapshot.sessionStorage[UI_PREFERENCES_KEY]).toBeUndefined();
    expect(snapshot.sessionStorage["test-e19-unrelated-key"]).toBe(
      "test-e19-unrelated-value",
    );
    await page.locator("#login-input").fill(controller.credentials.login);
    await page.locator("#password-input").fill(controller.credentials.password);
    await page.locator("#login-submit").click();
    await expect(page.locator("#main-interface")).toBeVisible();
    const defaults = createUiPreferences({
      activeMainTab: "tasks",
      selectedDate: MATRIX_TODAY_KEY,
    });

    await expectUiPreferencesInDom(page, defaults);
    expect(await getStoredUiPreferences(page)).toBeNull();
    expect(
      (await getBrowserStorageSnapshot(page)).sessionStorage[
        "test-e19-unrelated-key"
      ],
    ).toBe("test-e19-unrelated-value");
    expectNoUnexpectedRequests(controller);
  });

  test("E19 starts a manual login from defaults after a state 401", async ({
    page,
  }) => {
    const controller = createApiMockController();
    let stateReadCount = 0;

    controller.setRouteOverride("GET", "/api/v1/state", async ({ route }) => {
      stateReadCount += 1;

      if (stateReadCount === 1) {
        await fulfillApiError(
          route,
          controller,
          { method: "GET", pathname: "/api/v1/state" },
          401,
          "Synthetic E19 session expired",
        );
        return;
      }

      await fulfillJson(route, 200, deepClone(controller.state));
    });
    await installMatrixClock(page);
    await seedUiPreferences(
      page,
      createUiPreferences({
        activeMainTab: "calendar",
        status: "overdue",
        direction: "Личные дела",
        subject: UI_FILTER_WITHOUT_SUBJECT,
        mode: "day",
        selectedDate: E14_E21_SELECTED_DATE,
      }),
    );
    await installApiMock(page, controller);
    await page.goto("/index.html");
    await expect(page.locator("#login-panel")).toBeVisible();
    expect(await getStoredUiPreferences(page)).toBeNull();

    await page.locator("#login-input").fill(controller.credentials.login);
    await page.locator("#password-input").fill(controller.credentials.password);
    await page.locator("#login-submit").click();
    await expect(page.locator("#main-interface")).toBeVisible();
    const defaults = createUiPreferences({
      activeMainTab: "tasks",
      selectedDate: MATRIX_TODAY_KEY,
    });

    await expectUiPreferencesInDom(page, defaults);
    expect(await getStoredUiPreferences(page)).toBeNull();
    await expect(page.locator("#profile-name")).toHaveText(
      controller.state.profile.displayName,
    );
    expect(stateReadCount).toBe(2);
    expectNoUnexpectedRequests(controller);
  });

  test("E19 does not transfer UI or business data to a new synthetic account", async ({
    page,
  }) => {
    const controller = createApiMockController();
    const accountATaskTitle = controller.state.tasks[0].title;
    const subjectValue = `subject:${controller.state.subjects[0].id}`;

    await installMatrixClock(page);
    await installApiMock(page, controller);
    await page.goto("/index.html");
    await expect(page.locator("#main-interface")).toBeVisible();
    await setUiPreferencesThroughControls(page, { subject: subjectValue });
    await page.locator("#logout-button").click();
    await expect(page.locator("#login-panel")).toBeVisible();

    const accountBState = createMockState();

    accountBState.profile.userId = "test-user-b-001";
    accountBState.profile.displayName = "E19 synthetic user B";
    accountBState.tasks[0].id = "test-e19-user-b-task-001";
    accountBState.tasks[0].title = "E19 synthetic account B task";
    controller.state = deepClone(accountBState);
    controller.auth.currentUser = createSyntheticUser(accountBState.profile);
    controller.auth.currentUser.login = "test-user-b";
    controller.credentials = {
      login: "test-user-b",
      password: "test-password-b",
    };

    await page.locator("#login-input").fill(controller.credentials.login);
    await page.locator("#password-input").fill(controller.credentials.password);
    await page.locator("#login-submit").click();
    await expect(page.locator("#main-interface")).toBeVisible();
    await expect(page.locator("#profile-name")).toHaveText(
      accountBState.profile.displayName,
    );
    await expect(
      page.locator("#active-tasks-list .task-card__title"),
    ).toHaveText(accountBState.tasks[0].title);
    await expect(page.getByText(accountATaskTitle, { exact: true })).toHaveCount(
      0,
    );
    const defaults = createUiPreferences({
      activeMainTab: "tasks",
      selectedDate: MATRIX_TODAY_KEY,
    });

    await expectUiPreferencesInDom(page, defaults);
    expect(await getStoredUiPreferences(page)).toBeNull();
    expectNoUnexpectedRequests(controller);
  });
});

test.describe("E20 browser storage allowlist", () => {
  test("E20 stores only allowed UI preferences and never stores a task draft", async ({
    page,
  }) => {
    const controller = createApiMockController();
    const subjectValue = `subject:${controller.state.subjects[0].id}`;
    const draftMarker = "E20_SYNTHETIC_DRAFT_MUST_NOT_BE_STORED";
    const expected = createUiPreferences({
      activeMainTab: "calendar",
      status: "active",
      direction: "Школа",
      subject: subjectValue,
      mode: "day",
      selectedDate: E14_E21_SELECTED_DATE,
    });

    await installMatrixClock(page);
    await installApiMock(page, controller);
    await page.goto("/index.html");
    await expect(page.locator("#main-interface")).toBeVisible();
    await setUiPreferencesThroughControls(page, { subject: subjectValue });
    await page.locator("#main-tab-tasks").click();
    await page.locator("#task-form-toggle").click();
    await page.locator("#task-title-input").fill(draftMarker);
    await page.locator("#main-tab-calendar").click();

    const snapshot = await getBrowserStorageSnapshot(page);

    expect(Object.keys(snapshot.localStorage)).toEqual([]);
    expect(Object.keys(snapshot.sessionStorage)).toEqual([UI_PREFERENCES_KEY]);
    expect(JSON.parse(snapshot.sessionStorage[UI_PREFERENCES_KEY])).toEqual(
      expected,
    );
    const storageText = JSON.stringify(snapshot);

    expect(storageText).not.toContain(draftMarker);
    expect(storageText).not.toContain(TEST_CSRF_TOKEN);
    expect(storageText).not.toContain(controller.state.profile.displayName);
    expect(storageText).not.toContain(controller.state.tasks[0].title);
    expect(storageText).not.toContain('"syncVersion"');
    expect(storageText).not.toContain('"totalXp"');
    expect(storageText).not.toContain('"level"');
    expectNoUnexpectedRequests(controller);
  });
});

test.describe("E21 independent tabs and stale CSRF", () => {
  test("E21 isolates tab UI and rejects one stale-CSRF mutation without retry", async ({
    page,
    context,
  }) => {
    const controller = createApiMockController();
    const pageB = await context.newPage();
    const csrfTokens = ["test-e21-csrf-a", "test-e21-csrf-b"];
    let csrfRequestCount = 0;

    controller.setRouteOverride(
      "POST",
      "/api/v1/auth/csrf",
      async ({ route }) => {
        const token = csrfTokens[csrfRequestCount];

        csrfRequestCount += 1;
        controller.csrfToken = token;
        await fulfillJson(route, 200, { csrfToken: token });
      },
    );

    try {
      await installMatrixClock(page);
      await installMatrixClock(pageB);
      await installApiMock(page, controller);
      await installApiMock(pageB, controller);
      await page.goto("/index.html");
      await expect(page.locator("#main-interface")).toBeVisible();
      await pageB.goto("/index.html");
      await expect(pageB.locator("#main-interface")).toBeVisible();
      expect(csrfRequestCount).toBe(2);
      expect(controller.csrfToken).toBe("test-e21-csrf-b");

      const subjectValue = `subject:${controller.state.tasks[0].subjectId}`;
      const pageAExpected = createUiPreferences({
        activeMainTab: "calendar",
        status: "active",
        direction: "Школа",
        subject: subjectValue,
        mode: "day",
        selectedDate: E14_E21_SELECTED_DATE,
      });
      const pageBExpected = createUiPreferences({
        activeMainTab: "archive",
        status: "overdue",
        direction: "Личные дела",
        subject: UI_FILTER_WITHOUT_SUBJECT,
        mode: "week",
        selectedDate: E14_E21_SELECTED_DATE,
      });

      await setUiPreferencesThroughControls(page, { subject: subjectValue });
      await setUiPreferencesThroughControls(pageB, {
        activeMainTab: "archive",
        status: "overdue",
        direction: "Личные дела",
        subject: UI_FILTER_WITHOUT_SUBJECT,
        mode: "week",
      });
      await expectUiPreferencesInDom(page, pageAExpected);
      await expectUiPreferencesInDom(pageB, pageBExpected);
      expect(await getStoredUiPreferences(page)).toEqual(pageAExpected);
      expect(await getStoredUiPreferences(pageB)).toEqual(pageBExpected);

      const pageBStorageBeforeMutation = await getStoredUiPreferences(pageB);
      const task = controller.state.tasks[0];
      const pathname = `/api/v1/tasks/${task.id}/complete`;

      await page.locator("#main-tab-tasks").click();
      await getTaskCard(page, "#active-tasks-list", task.title)
        .locator(".task-card__complete-button")
        .click();
      await expect(page.locator("#task-form-status")).toContainText(
        "Сервер отклонил запрос",
      );

      expect(getRouteRequests(controller, "POST", pathname)).toHaveLength(1);
      expect(controller.state.tasks[0].status).toBe("active");
      expect(controller.state.tasks[0].xpAwarded).toBe(false);
      expect(controller.state.profile.totalXp).toBe(0);
      await expect(
        getTaskCard(page, "#active-tasks-list", task.title),
      ).toBeVisible();
      expect(await getStoredUiPreferences(pageB)).toEqual(
        pageBStorageBeforeMutation,
      );
      await expectUiPreferencesInDom(pageB, pageBExpected);
      expectNoUnexpectedRequests(controller);
    } finally {
      await pageB.close();
    }
  });
});

const E22_BEFORE_MIDNIGHT = "2026-09-18T15:59:59.000Z";
const E22_AFTER_MIDNIGHT = "2026-09-18T16:00:00.000Z";
const E22_SELECTED_DATE = "2026-09-18";
const E22_NEXT_DATE = "2026-09-19";

async function getE22CalendarSnapshot(page, taskAId, taskBId) {
  return page.evaluate(
    ({ firstTaskId, secondTaskId, preferencesKey }) => {
      const taskA = document.querySelector(
        `.calendar-task[data-task-id="${firstTaskId}"]`,
      );
      const taskB = document.querySelector(
        `.calendar-task[data-task-id="${secondTaskId}"]`,
      );
      const storedValue = window.sessionStorage.getItem(preferencesKey);
      const preferences = storedValue === null ? null : JSON.parse(storedValue);

      return {
        todayDate:
          document.querySelector(".calendar-day--today")?.dataset.date ?? null,
        selectedDate:
          document.querySelector('.calendar-day[aria-selected="true"]')?.dataset
            .date ?? null,
        calendarMode:
          document.querySelector(".calendar")?.dataset.calendarMode ?? null,
        taskAOverdue: taskA?.classList.contains("calendar-task--overdue") ?? null,
        taskBIsInTodayCell:
          taskB?.closest(".calendar-day")?.classList.contains(
            "calendar-day--today",
          ) ?? null,
        storedSelectedDate: preferences?.calendar?.selectedDate ?? null,
      };
    },
    {
      firstTaskId: taskAId,
      secondTaskId: taskBId,
      preferencesKey: UI_PREFERENCES_KEY,
    },
  );
}

test.describe("E22 Asia/Irkutsk calendar day rollover", () => {
  test("E22 refreshes today and overdue state after returning from background", async ({
    browser,
  }, testInfo) => {
    const taskA = createSyntheticTask({
      id: "test-e22-task-a-001",
      title: "E22 task A September 18",
      currentDeadline: E22_SELECTED_DATE,
      createdAt: "2026-09-10T08:00:00.000Z",
    });
    const taskB = createSyntheticTask({
      id: "test-e22-task-b-001",
      title: "E22 task B September 19",
      currentDeadline: E22_NEXT_DATE,
      createdAt: "2026-09-10T09:00:00.000Z",
    });
    const state = createMockState();

    state.tasks = [taskA, taskB];
    state.profile.totalXp = 0;
    state.profile.level = 1;
    state.syncVersion = 1;

    const controller = createApiMockController({ state });
    const context = await browser.newContext({
      baseURL: LOCAL_ORIGIN,
      timezoneId: "America/Los_Angeles",
    });
    const page = await context.newPage();

    try {
      await page.clock.install({ time: new Date(E22_BEFORE_MIDNIGHT) });
      await seedUiPreferences(
        page,
        createUiPreferences({
          activeMainTab: "calendar",
          mode: "month",
          selectedDate: E22_SELECTED_DATE,
        }),
      );
      await installApiMock(page, controller);
      await page.goto("/index.html");
      await expect(page.locator("#main-interface")).toBeVisible();
      await expect(page.locator("#main-panel-calendar")).toBeVisible();

      const before = await getE22CalendarSnapshot(page, taskA.id, taskB.id);
      const requestsBefore = controller.requests.length;

      expect(before).toEqual({
        todayDate: E22_SELECTED_DATE,
        selectedDate: E22_SELECTED_DATE,
        calendarMode: "month",
        taskAOverdue: false,
        taskBIsInTodayCell: false,
        storedSelectedDate: E22_SELECTED_DATE,
      });

      await page.clock.fastForward(1_000);
      await page.evaluate(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });

      const after = await getE22CalendarSnapshot(page, taskA.id, taskB.id);
      const requestsAfter = controller.requests.length;

      await page.locator('.calendar [data-calendar-mode="week"]').click();
      await page.locator('.calendar [data-calendar-mode="month"]').click();

      const afterManualRender = await getE22CalendarSnapshot(
        page,
        taskA.id,
        taskB.id,
      );
      const requestsAfterManualRender = controller.requests.length;
      const diagnostics = {
        timezoneId: "America/Los_Angeles",
        clockBefore: E22_BEFORE_MIDNIGHT,
        clockAfter: E22_AFTER_MIDNIGHT,
        before: { ...before, apiRequests: requestsBefore },
        after: { ...after, apiRequests: requestsAfter },
        afterManualRender: {
          ...afterManualRender,
          apiRequests: requestsAfterManualRender,
        },
      };

      await testInfo.attach("e22-diagnostics", {
        body: JSON.stringify(diagnostics, null, 2),
        contentType: "application/json",
      });

      expect(afterManualRender).toEqual({
        todayDate: E22_NEXT_DATE,
        selectedDate: E22_SELECTED_DATE,
        calendarMode: "month",
        taskAOverdue: true,
        taskBIsInTodayCell: true,
        storedSelectedDate: E22_SELECTED_DATE,
      });
      expect(requestsAfterManualRender).toBe(requestsBefore);
      expect(after).toEqual({
        todayDate: E22_NEXT_DATE,
        selectedDate: E22_SELECTED_DATE,
        calendarMode: "month",
        taskAOverdue: true,
        taskBIsInTodayCell: true,
        storedSelectedDate: E22_SELECTED_DATE,
      });
      expect(requestsAfter).toBe(requestsBefore);
      expect(getRouteRequests(controller, "GET", "/api/v1/state")).toHaveLength(
        1,
      );
      expectNoUnexpectedRequests(controller);
    } finally {
      await context.close();
    }
  });
});

function createE23LongTextState() {
  const state = createMockState();
  const displayName = `E23_PROFILE_${"P".repeat(120)}`;
  const subjectName = `E23_SUBJECT_${"S".repeat(50)}`;
  const taskTitle = `E23_TASK_${"T".repeat(180)}`;
  const subject = {
    ...state.subjects[0],
    id: "test-e23-long-subject-001",
    name: subjectName,
    normalizedName: subjectName.toLowerCase(),
  };

  state.profile.displayName = displayName;
  state.subjects = [subject];
  state.tasks = [
    createSyntheticTask({
      id: "test-e23-long-task-001",
      title: taskTitle,
      subjectId: subject.id,
      currentDeadline: MATRIX_TODAY_KEY,
      createdAt: "2026-09-11T08:00:00.000Z",
    }),
  ];
  state.syncVersion = 1;

  return { state, displayName, subjectName, taskTitle };
}

async function getHorizontalOverflowSnapshot(page) {
  return page.evaluate(() => ({
    documentScrollWidth: document.documentElement.scrollWidth,
    documentClientWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
}

async function getWeekLayoutSnapshot(page) {
  const days = page.locator(".calendar-week-day");
  const count = await days.count();
  const boxes = [];

  for (let index = 0; index < count; index += 1) {
    boxes.push(await days.nth(index).boundingBox());
  }

  return {
    count,
    weekdays: await page
      .locator(".calendar-week-day__weekday")
      .allTextContents(),
    boxes,
  };
}

function expectNoHorizontalOverflow(snapshot) {
  expect.soft(snapshot.documentScrollWidth).toBeLessThanOrEqual(
    snapshot.documentClientWidth + 1,
  );
  expect.soft(snapshot.bodyScrollWidth).toBeLessThanOrEqual(
    snapshot.viewportWidth + 1,
  );
}

function expectMobileWeekLayout(layout) {
  expect(layout.count).toBe(7);
  expect(layout.weekdays).toEqual(["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]);
  expect(layout.boxes.every((box) => box !== null)).toBe(true);

  for (let index = 1; index < layout.boxes.length; index += 1) {
    expect.soft(layout.boxes[index].y).toBeGreaterThan(
      layout.boxes[index - 1].y,
    );
    expect.soft(
      Math.abs(layout.boxes[index].x - layout.boxes[0].x),
    ).toBeLessThanOrEqual(2);
  }
}

function expectDesktopWeekLayout(layout) {
  expect(layout.count).toBe(7);
  expect(layout.weekdays).toEqual(["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]);
  expect(layout.boxes.every((box) => box !== null)).toBe(true);

  for (let index = 1; index < layout.boxes.length; index += 1) {
    expect.soft(
      Math.abs(layout.boxes[index].y - layout.boxes[0].y),
    ).toBeLessThanOrEqual(2);
    expect.soft(layout.boxes[index].x).toBeGreaterThan(
      layout.boxes[index - 1].x,
    );
  }
}

for (const viewport of [
  { width: 390, height: 844, layout: "mobile" },
  { width: 767, height: 900, layout: "mobile" },
  { width: 768, height: 900, layout: "desktop" },
  { width: 1280, height: 900, layout: "desktop" },
]) {
  test(`E23 ${viewport.width}px has no horizontal overflow and uses ${viewport.layout} week layout`, async ({
    page,
  }, testInfo) => {
    const { state, displayName, subjectName, taskTitle } =
      createE23LongTextState();
    const controller = createApiMockController({ state });

    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await installMatrixClock(page);
    await installApiMock(page, controller);
    await page.goto("/index.html");
    await expect(page.locator("#main-interface")).toBeVisible();
    await expect(page.locator("#profile-name")).toHaveText(displayName);

    await page.locator("#main-tab-calendar").click();
    await page.locator('.calendar [data-calendar-mode="week"]').click();
    await expect(page.locator(".calendar")).toHaveAttribute(
      "data-calendar-mode",
      "week",
    );
    await expect(page.locator(".calendar-task__title")).toHaveText(taskTitle);

    const weekLayout = await getWeekLayoutSnapshot(page);
    const calendarOverflow = await getHorizontalOverflowSnapshot(page);

    if (viewport.layout === "mobile") {
      expectMobileWeekLayout(weekLayout);
    } else {
      expectDesktopWeekLayout(weekLayout);
    }
    expectNoHorizontalOverflow(calendarOverflow);

    await page.locator("#main-tab-tasks").click();
    const taskCard = getTaskCard(page, "#active-tasks-list", taskTitle);

    await expect(taskCard).toBeVisible();
    await expect(taskCard).toContainText(subjectName);
    const tasksOverflow = await getHorizontalOverflowSnapshot(page);

    expectNoHorizontalOverflow(tasksOverflow);

    await testInfo.attach(`e23-${viewport.width}px-diagnostics`, {
      body: JSON.stringify(
        {
          viewport,
          calendarOverflow,
          tasksOverflow,
          weekLayout,
          longTextLengths: {
            displayName: displayName.length,
            subjectName: subjectName.length,
            taskTitle: taskTitle.length,
          },
        },
        null,
        2,
      ),
      contentType: "application/json",
    });
    expectNoUnexpectedRequests(controller);
  });
}

async function installUiPreferenceReadCounter(page) {
  await page.addInitScript((preferencesKey) => {
    const sessionStorageObject = window.sessionStorage;
    const originalGetItem = Storage.prototype.getItem;

    window.__e24UiPreferenceReadCount = 0;
    Storage.prototype.getItem = function (...args) {
      if (this === sessionStorageObject && args[0] === preferencesKey) {
        window.__e24UiPreferenceReadCount += 1;
      }

      return originalGetItem.apply(this, args);
    };
  }, UI_PREFERENCES_KEY);
}

async function getUiPreferenceReadCount(page) {
  return page.evaluate(() => window.__e24UiPreferenceReadCount);
}

async function getUiControlSnapshot(page) {
  return page.evaluate(() => ({
    activeMainTab:
      document.querySelector('[data-main-tab][aria-selected="true"]')?.dataset
        .mainTab ?? null,
    filters: {
      status: document.querySelector("#status-filter")?.value ?? null,
      direction: document.querySelector("#direction-filter")?.value ?? null,
      subject: document.querySelector("#subject-filter")?.value ?? null,
    },
    calendar: {
      mode: document.querySelector(".calendar")?.dataset.calendarMode ?? null,
      selectedDate:
        document.querySelector('.calendar-day[aria-selected="true"]')?.dataset
          .date ?? null,
    },
  }));
}

const E24_SELECTED_DATE = "2026-09-20";

test.describe("E24 UI state after accepted mutation refresh", () => {
  test("E24 keeps live UI state and restores preferences only during initial boot", async ({
    page,
  }, testInfo) => {
    const task = createSyntheticTask({
      id: "test-e24-complete-001",
      title: "E24 complete task",
      direction: "Школа",
      subjectId: createMockState().subjects[0].id,
      difficulty: "medium",
      xpReward: 20,
      currentDeadline: E14_E21_SELECTED_DATE,
      xpAwarded: false,
      version: 3,
      createdAt: "2026-09-12T08:00:00.000Z",
    });
    const controller = createApiMockController({
      state: createSingleActiveTaskState(task),
    });
    const pathname = `/api/v1/tasks/${task.id}/complete`;
    const subjectValue = `subject:${task.subjectId}`;
    const expectedBeforeMutation = createUiPreferences({
      activeMainTab: "tasks",
      status: "active",
      direction: "Школа",
      subject: subjectValue,
      mode: "week",
      selectedDate: E24_SELECTED_DATE,
    });

    await installMatrixClock(page);
    await installUiPreferenceReadCounter(page);
    await installApiMock(page, controller);
    await page.goto("/index.html");
    await expect(page.locator("#main-interface")).toBeVisible();
    const preferenceReadsAfterBoot = await getUiPreferenceReadCount(page);

    await setUiPreferencesThroughControls(page, {
      activeMainTab: "tasks",
      status: "active",
      direction: "Школа",
      subject: subjectValue,
      mode: "week",
      selectedDate: E24_SELECTED_DATE,
    });
    await expectUiPreferencesInDom(page, expectedBeforeMutation);
    const uiBeforeMutation = await getUiControlSnapshot(page);
    const storedBeforeMutation = await getStoredUiPreferences(page);
    const preferenceReadsBeforeMutation = await getUiPreferenceReadCount(page);
    const stateRequestsBeforeMutation = getRouteRequests(
      controller,
      "GET",
      "/api/v1/state",
    ).length;
    const authRequestsBeforeMutation = getRouteRequests(
      controller,
      "GET",
      "/api/v1/auth/me",
    ).length;
    const csrfRequestsBeforeMutation = getRouteRequests(
      controller,
      "POST",
      "/api/v1/auth/csrf",
    ).length;

    expect(storedBeforeMutation).toEqual(expectedBeforeMutation);
    await getTaskCard(page, "#active-tasks-list", task.title)
      .locator(".task-card__complete-button")
      .click();

    await expect(
      getTaskCard(page, "#active-tasks-list", task.title),
    ).toHaveCount(0);
    await expect(page.locator("#profile-total-xp")).toHaveText("20");
    await expectUiPreferencesInDom(page, expectedBeforeMutation);

    const uiAfterMutation = await getUiControlSnapshot(page);
    const preferenceReadsAfterMutation = await getUiPreferenceReadCount(page);
    const stateRequestsAfterMutation = getRouteRequests(
      controller,
      "GET",
      "/api/v1/state",
    ).length;
    const mutationCount = getRouteRequests(
      controller,
      "POST",
      pathname,
    ).length;

    expect(mutationCount).toBe(1);
    expect(stateRequestsAfterMutation).toBe(stateRequestsBeforeMutation + 1);
    expect(preferenceReadsAfterMutation).toBe(
      preferenceReadsBeforeMutation,
    );
    expect(
      getRouteRequests(controller, "GET", "/api/v1/auth/me"),
    ).toHaveLength(authRequestsBeforeMutation);
    expect(
      getRouteRequests(controller, "POST", "/api/v1/auth/csrf"),
    ).toHaveLength(csrfRequestsBeforeMutation);
    expect(uiAfterMutation).toEqual(uiBeforeMutation);
    expect(controller.state.tasks[0].status).toBe("completed");
    expect(controller.state.tasks[0].xpAwarded).toBe(true);
    expect(controller.state.profile.totalXp).toBe(20);

    await page.locator("#main-tab-calendar").click();
    const expectedAfterCalendarOpen = {
      ...expectedBeforeMutation,
      activeMainTab: "calendar",
    };

    await expectUiPreferencesInDom(page, expectedAfterCalendarOpen);
    expect(await getStoredUiPreferences(page)).toEqual(
      expectedAfterCalendarOpen,
    );
    await expect(
      page.locator(
        `.calendar-task[data-task-id="${task.id}"]`,
      ),
    ).toHaveCount(0);

    await testInfo.attach("e24-diagnostics", {
      body: JSON.stringify(
        {
          uiBeforeMutation,
          uiAfterMutation,
          preferenceReadsAfterBoot,
          preferenceReadsBeforeMutation,
          preferenceReadsAfterMutation,
          mutationCount,
          stateRequestsBeforeMutation,
          stateRequestsAfterMutation,
          authRequestsBeforeMutation,
          csrfRequestsBeforeMutation,
          serverResult: {
            taskStatus: controller.state.tasks[0].status,
            xpAwarded: controller.state.tasks[0].xpAwarded,
            totalXp: controller.state.profile.totalXp,
            level: controller.state.profile.level,
          },
        },
        null,
        2,
      ),
      contentType: "application/json",
    });
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
