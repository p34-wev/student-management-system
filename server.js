require("dotenv").config();

const crypto = require("node:crypto");
const express = require("express");
const mysql = require("mysql2/promise");
const path = require("node:path");

const app = express();
const port = Number(process.env.PORT) || 3000;
const adminPassword = process.env.ADMIN_PASSWORD || "";
const isProduction = process.env.NODE_ENV === "production";
const sessionSecret = process.env.SESSION_SECRET || (isProduction ? "" : crypto.randomBytes(48).toString("base64url"));
const adminEmail = (process.env.ADMIN_EMAIL || "admin@localhost.test").trim().toLowerCase();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

if (isProduction && !adminPassword) {
  throw new Error("Set ADMIN_PASSWORD to create the initial admin account.");
}
if (adminPassword && Buffer.byteLength(adminPassword) < 12) {
  throw new Error("ADMIN_PASSWORD must be at least 12 characters.");
}
if (isProduction && Buffer.byteLength(sessionSecret) < 32) {
  throw new Error("SESSION_SECRET must be at least 32 characters in production.");
}
if (!emailPattern.test(adminEmail)) {
  throw new Error("ADMIN_EMAIL must be a valid email address.");
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || process.env.MYSQLHOST || "localhost",
  port: Number(process.env.DB_PORT || process.env.MYSQLPORT) || 3306,
  user: process.env.DB_USER || process.env.MYSQLUSER || "root",
  password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || "",
  database: process.env.DB_NAME || process.env.MYSQLDATABASE || "student_management",
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,
});

app.use(express.json({ limit: "20kb" }));
if (isProduction) app.set("trust proxy", 1);

const sessionCookieName = "campus_session";
const sessionDurationMs = 8 * 60 * 60 * 1000;
const loginFailureWindowMs = 15 * 60 * 1000;
const maxLoginFailures = 5;
const loginFailures = new Map();
const registrationAttempts = new Map();

function safeEqual(left, right) {
  const leftBuffer = Buffer.isBuffer(left) ? left : Buffer.from(left);
  const rightBuffer = Buffer.isBuffer(right) ? right : Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

function verifyPassword(password, encodedHash) {
  const [algorithm, saltHex, hashHex, ...extra] = String(encodedHash).split("$");
  if (algorithm !== "scrypt" || extra.length || !/^[0-9a-f]{32}$/i.test(saltHex || "") || !/^[0-9a-f]{128}$/i.test(hashHex || "")) {
    return false;
  }
  const derivedHash = crypto.scryptSync(password, Buffer.from(saltHex, "hex"), 64);
  return safeEqual(derivedHash, Buffer.from(hashHex, "hex"));
}

function sessionSignature(userId, expiry) {
  return crypto.createHmac("sha256", sessionSecret).update(`${userId}.${expiry}`).digest("base64url");
}

function readSession(req) {
  const cookie = (req.headers.cookie || "").split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${sessionCookieName}=`));
  if (!cookie) return null;

  const [userIdText, expiryText, signature, ...extra] = cookie.slice(sessionCookieName.length + 1).split(".");
  if (extra.length || !/^\d+$/.test(userIdText || "") || !/^\d+$/.test(expiryText || "") || !signature) return null;
  const userId = Number(userIdText);
  const expiry = Number(expiryText);
  if (!Number.isSafeInteger(userId) || userId < 1 || !Number.isSafeInteger(expiry) || expiry <= Date.now()) return null;
  if (!safeEqual(signature, sessionSignature(userId, expiry))) return null;
  return { userId, expiry };
}

function createSessionToken(userId) {
  const expiresAt = Date.now() + sessionDurationMs;
  return `${userId}.${expiresAt}.${sessionSignature(userId, expiresAt)}`;
}

function registrationBlockDuration(ip) {
  const attempt = registrationAttempts.get(ip);
  if (!attempt || attempt.expiresAt <= Date.now()) {
    registrationAttempts.delete(ip);
    return 0;
  }
  return attempt.count >= 5 ? attempt.expiresAt - Date.now() : 0;
}

function recordRegistrationAttempt(ip) {
  const now = Date.now();
  let attempt = registrationAttempts.get(ip);
  if (!attempt || attempt.expiresAt <= now) {
    attempt = { count: 0, expiresAt: now + loginFailureWindowMs };
    registrationAttempts.set(ip, attempt);
  }
  attempt.count += 1;
  if (registrationAttempts.size > 1000) {
    for (const [address, entry] of registrationAttempts) {
      if (entry.expiresAt <= now || registrationAttempts.size > 1000) registrationAttempts.delete(address);
      if (registrationAttempts.size <= 1000) break;
    }
  }
}

function setSessionCookie(res, value, maxAge) {
  const secure = isProduction ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${sessionCookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`);
}

function loginBlockDuration(ip) {
  const failure = loginFailures.get(ip);
  if (!failure || failure.expiresAt <= Date.now()) {
    loginFailures.delete(ip);
    return 0;
  }
  return failure.count >= maxLoginFailures ? failure.expiresAt - Date.now() : 0;
}

function recordLoginFailure(ip) {
  const now = Date.now();
  let failure = loginFailures.get(ip);
  if (!failure || failure.expiresAt <= now) {
    failure = { count: 0, expiresAt: now + loginFailureWindowMs };
    loginFailures.set(ip, failure);
  }
  failure.count += 1;

  if (loginFailures.size > 1000) {
    for (const [address, entry] of loginFailures) {
      if (entry.expiresAt <= now || loginFailures.size > 1000) loginFailures.delete(address);
      if (loginFailures.size <= 1000) break;
    }
  }
}

app.get(["/", "/index.html"], (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});
app.get("/app.js", (req, res) => {
  res.sendFile(path.join(__dirname, "app.js"));
});
app.get("/styles.css", (req, res) => {
  res.sendFile(path.join(__dirname, "styles.css"));
});

app.get("/api/health", async (req, res, next) => {
  try {
    await pool.execute("SELECT 1 FROM students LIMIT 0");
    res.json({ status: "ok", database: "connected" });
  } catch (error) {
    next(error);
  }
});

app.get("/api/auth/status", async (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  const session = readSession(req);
  if (!session) return res.json({ required: true, authenticated: false });
  try {
    const [users] = await pool.execute("SELECT email, role FROM users WHERE id = ?", [session.userId]);
    if (!users.length) return res.json({ required: true, authenticated: false });
    res.json({ required: true, authenticated: true, email: users[0].email, role: users[0].role });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/register", async (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  const blockedFor = registrationBlockDuration(req.ip);
  if (blockedFor) {
    res.setHeader("Retry-After", String(Math.ceil(blockedFor / 1000)));
    return res.status(429).json({ error: "Too many account creation attempts. Try again in 15 minutes." });
  }

  recordRegistrationAttempt(req.ip);
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = req.body?.password;
  if (!email || email.length > 254 || !emailPattern.test(email)) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }
  if (email === adminEmail) {
    return res.status(409).json({ error: "This email address is reserved for the administrator account." });
  }
  if (typeof password !== "string" || password.length < 12 || Buffer.byteLength(password) > 1024) {
    return res.status(400).json({ error: "Password must be at least 12 characters." });
  }

  try {
    const [result] = await pool.execute(
      "INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'user')",
      [email, hashPassword(password)],
    );
    setSessionCookie(res, createSessionToken(result.insertId), sessionDurationMs / 1000);
    res.status(201).json({ authenticated: true, email, role: "user" });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "An account with this email already exists." });
    next(error);
  }
});

app.post("/api/auth/login", async (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = req.body?.password;
  const blockedFor = loginBlockDuration(req.ip);
  if (blockedFor) {
    res.setHeader("Retry-After", String(Math.ceil(blockedFor / 1000)));
    return res.status(429).json({ error: "Too many sign-in attempts. Try again in 15 minutes." });
  }

  if (!email || email.length > 254 || typeof password !== "string" || Buffer.byteLength(password) > 1024) {
    recordLoginFailure(req.ip);
    return res.status(401).json({ error: "Incorrect email or password." });
  }

  try {
    const [users] = await pool.execute(
      "SELECT id, email, password_hash, role FROM users WHERE email = ?",
      [email],
    );
    const user = users[0];
    if (!user || !verifyPassword(password, user.password_hash)) {
      recordLoginFailure(req.ip);
      return res.status(401).json({ error: "Incorrect email or password." });
    }

    loginFailures.delete(req.ip);
    setSessionCookie(res, createSessionToken(user.id), sessionDurationMs / 1000);
    res.json({ authenticated: true, email: user.email, role: user.role });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/logout", (req, res) => {
  setSessionCookie(res, "", 0);
  res.status(204).end();
});

app.use("/api", (req, res, next) => {
  const session = readSession(req);
  if (session) {
    req.userId = session.userId;
    return next();
  }
  res.status(401).json({ error: "Sign in to continue." });
});

app.get("/api/assistant/status", (req, res) => {
  res.json({ configured: Boolean(process.env.OPENAI_API_KEY?.trim()) });
});

app.post("/api/assistant/chat", async (req, res) => {
  if (typeof req.body?.message !== "string" || !req.body.message.trim()) {
    return res.status(400).json({ error: "Enter a question for the assistant." });
  }
  const message = req.body.message.trim();
  if (message.length > 2000) return res.status(400).json({ error: "Questions must be 2,000 characters or fewer." });
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return res.status(503).json({ error: "AI help is not configured yet. Add OPENAI_API_KEY to your server .env file." });
  }

  let upstream;
  try {
    upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY.trim()}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are the Campus assistant for a student management web app. Answer concise questions about using the app: adding, viewing, editing, deleting, searching, and filtering student records. The app uses an Express API and MySQL. Student searches use the local /student name command and are not an AI feature. Do not claim to verify Aadhaar; its current feature is demo-only. Do not ask for or encourage sharing student personal data. If a question is unrelated to app usage, briefly explain your scope.",
          },
          { role: "user", content: message },
        ],
        max_tokens: 400,
      }),
    });
  } catch (error) {
    console.error("AI provider request failed:", error);
    return res.status(502).json({ error: "The AI service could not be reached. Please try again." });
  }

  if (!upstream.ok) {
    console.error(`AI provider returned HTTP ${upstream.status}.`);
    return res.status(502).json({ error: "The AI service could not answer right now. Check your API configuration and try again." });
  }

  let result;
  try {
    result = await upstream.json();
  } catch (error) {
    console.error("AI provider returned invalid JSON:", error);
    return res.status(502).json({ error: "The AI service returned an invalid response. Please try again." });
  }
  const reply = result.choices?.[0]?.message?.content;
  if (typeof reply !== "string" || !reply.trim()) {
    console.error("AI provider response did not contain a message.");
    return res.status(502).json({ error: "The AI service returned an empty response. Please try again." });
  }
  res.json({ reply: reply.trim() });
});

const fields = ["full_name", "email", "phone", "course", "enrollment_date", "status", "mathematics_marks", "science_marks", "english_marks"];
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value) {
  if (!datePattern.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1000 || year > 9999) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function validateStudent(body) {
  const markFields = ["mathematics_marks", "science_marks", "english_marks"];
  const student = Object.fromEntries(fields.map((field) => [
    field,
    markFields.includes(field)
      ? (body[field] === null || body[field] === undefined ? "" : String(body[field]).trim())
      : (typeof body[field] === "string" ? body[field].trim() : ""),
  ]));
  const errors = [];
  if (!student.full_name || student.full_name.length > 120) errors.push("Full name is required and must be 120 characters or fewer.");
  if (!student.email || student.email.length > 254 || !emailPattern.test(student.email)) errors.push("Enter a valid email address (maximum 254 characters).");
  if (student.phone.length > 30) errors.push("Phone number must be 30 characters or fewer.");
  if (!student.course || student.course.length > 120) errors.push("Course is required and must be 120 characters or fewer.");
  if (!isValidDate(student.enrollment_date)) errors.push("Enter a valid enrollment date.");
  if (!["Active", "Inactive"].includes(student.status)) errors.push("Status must be Active or Inactive.");
  for (const [field, label] of [
    ["mathematics_marks", "Mathematics"],
    ["science_marks", "Science"],
    ["english_marks", "English"],
  ]) {
    if (student[field] === "") student[field] = null;
    else {
      const marks = Number(student[field]);
      if (!Number.isFinite(marks) || marks < 0 || marks > 100) errors.push(`${label} marks must be between 0 and 100.`);
      else student[field] = marks;
    }
  }
  return { student, errors };
}

function validId(value) {
  return /^\d+$/.test(value) && Number(value) > 0;
}

app.get("/api/students", async (req, res, next) => {
  try {
    const [students] = await pool.execute(
      "SELECT id, full_name, email, phone, course, DATE_FORMAT(enrollment_date, '%Y-%m-%d') AS enrollment_date, status, aadhaar_demo_completed, mathematics_marks, science_marks, english_marks, created_at, updated_at FROM students WHERE owner_user_id = ? ORDER BY created_at DESC, id DESC",
      [req.userId],
    );
    res.json(students);
  } catch (error) {
    next(error);
  }
});

app.get("/api/students/:id", async (req, res, next) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: "Student ID must be a positive integer." });
  try {
    const [students] = await pool.execute(
      "SELECT id, full_name, email, phone, course, DATE_FORMAT(enrollment_date, '%Y-%m-%d') AS enrollment_date, status, aadhaar_demo_completed, mathematics_marks, science_marks, english_marks, created_at, updated_at FROM students WHERE id = ? AND owner_user_id = ?",
      [Number(req.params.id), req.userId],
    );
    if (!students.length) return res.status(404).json({ error: "Student not found." });
    res.json(students[0]);
  } catch (error) {
    next(error);
  }
});

app.post("/api/students", async (req, res, next) => {
  const { student, errors } = validateStudent(req.body || {});
  if (errors.length) return res.status(400).json({ error: errors.join(" ") });
  try {
    const [result] = await pool.execute(
      "INSERT INTO students (owner_user_id, full_name, email, phone, course, enrollment_date, status, mathematics_marks, science_marks, english_marks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [req.userId, student.full_name, student.email, student.phone || null, student.course, student.enrollment_date, student.status, student.mathematics_marks, student.science_marks, student.english_marks],
    );
    const [rows] = await pool.execute(
      "SELECT id, full_name, email, phone, course, DATE_FORMAT(enrollment_date, '%Y-%m-%d') AS enrollment_date, status, aadhaar_demo_completed, mathematics_marks, science_marks, english_marks, created_at, updated_at FROM students WHERE id = ? AND owner_user_id = ?",
      [result.insertId, req.userId],
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "A student with this email address already exists." });
    next(error);
  }
});

app.put("/api/students/:id", async (req, res, next) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: "Student ID must be a positive integer." });
  const { student, errors } = validateStudent(req.body || {});
  if (errors.length) return res.status(400).json({ error: errors.join(" ") });
  try {
    await pool.execute(
      "UPDATE students SET full_name = ?, email = ?, phone = ?, course = ?, enrollment_date = ?, status = ?, mathematics_marks = ?, science_marks = ?, english_marks = ? WHERE id = ? AND owner_user_id = ?",
      [student.full_name, student.email, student.phone || null, student.course, student.enrollment_date, student.status, student.mathematics_marks, student.science_marks, student.english_marks, Number(req.params.id), req.userId],
    );
    const [rows] = await pool.execute(
      "SELECT id, full_name, email, phone, course, DATE_FORMAT(enrollment_date, '%Y-%m-%d') AS enrollment_date, status, aadhaar_demo_completed, mathematics_marks, science_marks, english_marks, created_at, updated_at FROM students WHERE id = ? AND owner_user_id = ?",
      [Number(req.params.id), req.userId],
    );
    if (!rows.length) return res.status(404).json({ error: "Student not found." });
    res.json(rows[0]);
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "A student with this email address already exists." });
    next(error);
  }
});

app.post("/api/students/:id/aadhaar-demo-verification", async (req, res, next) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: "Student ID must be a positive integer." });
  try {
    const [existing] = await pool.execute(
      "SELECT id FROM students WHERE id = ? AND owner_user_id = ?",
      [Number(req.params.id), req.userId],
    );
    if (!existing.length) return res.status(404).json({ error: "Student not found." });
    await pool.execute(
      "UPDATE students SET aadhaar_demo_completed = TRUE WHERE id = ? AND owner_user_id = ?",
      [Number(req.params.id), req.userId],
    );
    const [rows] = await pool.execute(
      "SELECT id, full_name, email, phone, course, DATE_FORMAT(enrollment_date, '%Y-%m-%d') AS enrollment_date, status, aadhaar_demo_completed, mathematics_marks, science_marks, english_marks, created_at, updated_at FROM students WHERE id = ? AND owner_user_id = ?",
      [Number(req.params.id), req.userId],
    );
    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/students/:id", async (req, res, next) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: "Student ID must be a positive integer." });
  try {
    const [result] = await pool.execute(
      "DELETE FROM students WHERE id = ? AND owner_user_id = ?",
      [Number(req.params.id), req.userId],
    );
    if (!result.affectedRows) return res.status(404).json({ error: "Student not found." });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  console.error(error);
  if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
    return res.status(400).json({ error: "Request body must be valid JSON." });
  }
  if (error.code === "ECONNREFUSED" || error.code === "PROTOCOL_CONNECTION_LOST") {
    return res.status(503).json({ error: "MySQL is unavailable. Check DB_HOST/DB_PORT (or MYSQLHOST/MYSQLPORT) and the database credentials in your environment settings." });
  }
  if (error.code === "ER_BAD_DB_ERROR") {
    return res.status(503).json({ error: "The configured database does not exist. Create it or check DB_NAME/MYSQLDATABASE." });
  }
  if (error.code === "ER_NO_SUCH_TABLE") {
    return res.status(503).json({ error: "The students table is missing. Import schema.sql into MySQL." });
  }
  res.status(500).json({ error: "An unexpected server error occurred." });
});

async function initializeAdminAccount() {
  const [accounts] = await pool.execute(
    "SELECT id, role FROM users WHERE email = ?",
    [adminEmail],
  );
  let admin = accounts[0];
  if (!admin) {
    if (!adminPassword) {
      const [unownedStudents] = await pool.execute(
        "SELECT COUNT(*) AS count FROM students WHERE owner_user_id IS NULL",
      );
      if (Number(unownedStudents[0].count) > 0) {
        throw new Error("Set ADMIN_PASSWORD to assign existing student records to the legacy admin account.");
      }
      return;
    }
    const [result] = await pool.execute(
      "INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'admin')",
      [adminEmail, hashPassword(adminPassword)],
    );
    admin = { id: result.insertId, role: "admin" };
  }
  if (admin.role !== "admin") {
    throw new Error("ADMIN_EMAIL is already used by a non-admin account. Choose a different reserved email.");
  }
  await pool.execute(
    "UPDATE students SET owner_user_id = ? WHERE owner_user_id IS NULL",
    [admin.id],
  );
}

async function start() {
  try {
    await initializeAdminAccount();
    app.listen(port, () => {
      console.log(`Student Management is running at http://localhost:${port}`);
    });
  } catch (error) {
    console.error("Student Management could not start:", error);
    await pool.end();
    process.exitCode = 1;
  }
}

start();

async function shutdown() {
  await pool.end();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
