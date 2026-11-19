require("dotenv").config();

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const net = require("node:net");
const path = require("node:path");
const mysql = require("mysql2/promise");
const test = require("node:test");

function findPort() {
  return new Promise((resolve, reject) => {
    const listener = net.createServer();
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", () => {
      const { port } = listener.address();
      listener.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function createDatabasePool() {
  return mysql.createPool({
    host: process.env.DB_HOST || process.env.MYSQLHOST || "localhost",
    port: Number(process.env.DB_PORT || process.env.MYSQLPORT) || 3306,
    user: process.env.DB_USER || process.env.MYSQLUSER || "root",
    password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || "",
    database: process.env.DB_NAME || process.env.MYSQLDATABASE || "student_management",
    connectionLimit: 2,
  });
}

test("users can register, sign in, and access only their own student records", async (t) => {
  const port = await findPort();
  const suffix = crypto.randomUUID();
  const adminEmail = process.env.ADMIN_EMAIL || "admin@localhost.test";
  const passwordOne = "test-user-password-one";
  const passwordTwo = "test-user-password-two";
  const emailOne = `test-${suffix}-one@example.test`;
  const emailTwo = `test-${suffix}-two@example.test`;
  const studentEmail = `student-${suffix}@example.test`;
  const db = createDatabasePool();
  const child = spawn(process.execPath, ["server.js"], {
    cwd: path.resolve(__dirname, ".."),
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: "production",
      ADMIN_EMAIL: adminEmail,
      ADMIN_PASSWORD: "test-admin-password-123",
      SESSION_SECRET: "test-session-secret-that-is-at-least-32-characters",
    },
    stdio: "ignore",
  });
  let userIds = [];
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill();
      await new Promise((resolve) => child.once("exit", resolve));
    }
    try {
      for (const userId of userIds) {
        await db.execute("DELETE FROM students WHERE owner_user_id = ?", [userId]);
        await db.execute("DELETE FROM users WHERE id = ?", [userId]);
      }
    } finally {
      await db.end();
    }
  });

  const origin = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) break;
    try {
      const response = await fetch(`${origin}/api/auth/status`);
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(ready, true, "server should start and expose auth status");

  const status = await fetch(`${origin}/api/auth/status`).then((response) => response.json());
  assert.deepEqual(status, { required: true, authenticated: false });
  assert.equal((await fetch(`${origin}/api/students`)).status, 401);
  const [unownedStudents] = await db.execute("SELECT COUNT(*) AS count FROM students WHERE owner_user_id IS NULL");
  assert.equal(Number(unownedStudents[0].count), 0);

  const page = await fetch(origin);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Create an account/);

  const weakPassword = await fetch(`${origin}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: emailOne, password: "short" }),
  });
  assert.equal(weakPassword.status, 400);

  async function register(email, password) {
    const response = await fetch(`${origin}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(response.status, 201);
    const cookie = response.headers.get("set-cookie").split(";")[0];
    const user = await db.execute("SELECT id, password_hash FROM users WHERE email = ?", [email]);
    userIds.push(user[0][0].id);
    assert.notEqual(user[0][0].password_hash, password);
    return cookie;
  }

  const cookieOne = await register(emailOne, passwordOne);
  const duplicateAccount = await fetch(`${origin}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: emailOne, password: passwordOne }),
  });
  assert.equal(duplicateAccount.status, 409);

  const firstStudent = await fetch(`${origin}/api/students`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieOne },
    body: JSON.stringify({
      full_name: "Test Student",
      email: studentEmail,
      phone: "",
      course: "Test Course",
      enrollment_date: "2026-01-15",
      status: "Active",
    }),
  });
  assert.equal(firstStudent.status, 201);
  const student = await firstStudent.json();

  const cookieTwo = await register(emailTwo, passwordTwo);
  const secondUserList = await fetch(`${origin}/api/students`, { headers: { Cookie: cookieTwo } });
  assert.deepEqual(await secondUserList.json(), []);

  const crossAccountRead = await fetch(`${origin}/api/students/${student.id}`, { headers: { Cookie: cookieTwo } });
  assert.equal(crossAccountRead.status, 404);
  const crossAccountUpdate = await fetch(`${origin}/api/students/${student.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookieTwo },
    body: JSON.stringify({
      full_name: "Changed by another account",
      email: studentEmail,
      course: "Test Course",
      enrollment_date: "2026-01-15",
      status: "Active",
    }),
  });
  assert.equal(crossAccountUpdate.status, 404);
  const crossAccountDelete = await fetch(`${origin}/api/students/${student.id}`, {
    method: "DELETE",
    headers: { Cookie: cookieTwo },
  });
  assert.equal(crossAccountDelete.status, 404);

  const login = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: emailOne, password: passwordOne }),
  });
  assert.equal(login.status, 200);
  assert.match(login.headers.get("set-cookie"), /HttpOnly; SameSite=Strict; Max-Age=28800; Secure/);
  const loginCookie = login.headers.get("set-cookie").split(";")[0];

  const authenticatedStatus = await fetch(`${origin}/api/auth/status`, { headers: { Cookie: loginCookie } });
  assert.deepEqual(await authenticatedStatus.json(), { required: true, authenticated: true, email: emailOne, role: "user" });
  const ownList = await fetch(`${origin}/api/students`, { headers: { Cookie: loginCookie } });
  assert.equal((await ownList.json()).length, 1);
  const ownUpdate = await fetch(`${origin}/api/students/${student.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: loginCookie },
    body: JSON.stringify({
      full_name: "Updated Test Student",
      email: studentEmail,
      course: "Test Course",
      enrollment_date: "2026-01-15",
      status: "Active",
    }),
  });
  assert.equal(ownUpdate.status, 200);
  assert.equal((await ownUpdate.json()).full_name, "Updated Test Student");
  const ownDelete = await fetch(`${origin}/api/students/${student.id}`, {
    method: "DELETE",
    headers: { Cookie: loginCookie },
  });
  assert.equal(ownDelete.status, 204);
  const emptyOwnList = await fetch(`${origin}/api/students`, { headers: { Cookie: loginCookie } });
  assert.deepEqual(await emptyOwnList.json(), []);

  const logout = await fetch(`${origin}/api/auth/logout`, {
    method: "POST",
    headers: { Cookie: loginCookie },
  });
  assert.equal(logout.status, 204);
  const afterLogout = await fetch(`${origin}/api/assistant/status`, {
    headers: { Cookie: logout.headers.get("set-cookie").split(";")[0] },
  });
  assert.equal(afterLogout.status, 401);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const failedLogin = await fetch(`${origin}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailOne, password: "incorrect-password" }),
    });
    assert.equal(failedLogin.status, 401);
  }
  const rateLimitedLogin = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: emailOne, password: passwordOne }),
  });
  assert.equal(rateLimitedLogin.status, 429);
});

test("production refuses to start without initial admin credentials", async () => {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: path.resolve(__dirname, ".."),
    env: {
      ...process.env,
      NODE_ENV: "production",
      ADMIN_PASSWORD: "",
      SESSION_SECRET: "",
      PORT: "0",
    },
    stdio: "ignore",
  });
  const [code] = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (exitCode, signal) => resolve([exitCode, signal]));
  });
  assert.notEqual(code, 0);
});
