const rowsElement = document.querySelector("#student-rows");
const emptyState = document.querySelector("#empty-state");
const loadingState = document.querySelector("#loading-state");
const searchInput = document.querySelector("#search-input");
const statusFilter = document.querySelector("#status-filter");
const studentModal = document.querySelector("#student-modal");
const detailsModal = document.querySelector("#details-modal");
const studentForm = document.querySelector("#student-form");
const formError = document.querySelector("#form-error");
const saveButton = document.querySelector("#save-student");
const assistantPanel = document.querySelector("#assistant-panel");
const assistantInput = document.querySelector("#assistant-input");
const assistantMessages = document.querySelector("#assistant-messages");
const assistantSend = document.querySelector("#assistant-send");
const databaseStatus = document.querySelector("#database-status");
const appShell = document.querySelector("#app-shell");
const assistantWidget = document.querySelector(".assistant-widget");
const loginScreen = document.querySelector("#login-screen");
const loginForm = document.querySelector("#login-form");
const loginEmail = document.querySelector("#auth-email");
const loginPassword = document.querySelector("#admin-password");
const passwordToggle = document.querySelector("#toggle-admin-password");
const loginError = document.querySelector("#login-error");
const loginButton = document.querySelector("#login-submit");
const authSwitch = document.querySelector("#auth-switch");
const logoutButton = document.querySelector("#logout-button");

let students = [];
let toastTimer;
let currentDetailsStudentId = null;
let registrationMode = false;

const colors = [
  ["#eeeaff", "#6558d7"],
  ["#e8f5f2", "#42a78a"],
  ["#fff0e8", "#d68257"],
  ["#eaf1ff", "#587ccc"],
  ["#f8eaf2", "#bd668d"],
];

function initials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function formattedDate(value) {
  if (!value) return "—";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function studentMarks(student) {
  return [student.mathematics_marks, student.science_marks, student.english_marks]
    .map((mark) => Number(mark))
    .filter((mark) => Number.isFinite(mark));
}

function studentAverage(student) {
  const marks = studentMarks(student);
  if (!marks.length) return null;
  return marks.reduce((total, mark) => total + mark, 0) / marks.length;
}

function performanceLabel(average) {
  if (average === null) return "Marks not added";
  if (average >= 90) return "Excellent";
  if (average >= 75) return "Very good";
  if (average >= 60) return "Good";
  if (average >= 40) return "Needs improvement";
  return "At risk";
}

async function request(path, options = {}) {
  if (window.location.protocol === "file:") {
    throw new Error("The page was opened as a local file. Start the app with `npm start`, then open http://localhost:3000.");
  }

  let response;
  try {
    response = await fetch(path, {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
    });
  } catch {
    throw new Error("Can't reach the API. Run `npm start` in the project folder and open http://localhost:3000.");
  }

  if (response.status === 204) return null;

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error("This page is served without the student API. Run `npm start` and open http://localhost:3000 (not a file or static preview).");
  }
  const payload = await response.json();
  if (!response.ok) {
    if (response.status === 401 && path !== "/api/auth/login") {
      showLoginScreen("Your session expired. Sign in again to continue.");
    }
    throw new Error(payload.error || `Request failed (${response.status})`);
  }
  return payload;
}

function notify(message, isError = false) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.toggle("error", isError);
  toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 3200);
}

function setDatabaseStatus(state, label) {
  databaseStatus.dataset.state = state;
  databaseStatus.querySelector(".connection-label").textContent = label;
}

function showLoginScreen(message = "") {
  appShell.hidden = true;
  assistantWidget.hidden = true;
  loginScreen.hidden = false;
  loginError.textContent = message;
  loginPassword.value = "";
  loginEmail.value = "";
  setLoginPasswordVisibility(false);
  window.requestAnimationFrame(() => loginPassword.focus());
}

function setRegistrationMode(enabled) {
  registrationMode = enabled;
  document.querySelector("#auth-title").textContent = enabled ? "Create account" : "Sign in";
  document.querySelector("#auth-copy").textContent = enabled
    ? "Create your account. Your student records will stay private to you."
    : "Sign in to manage your private student records, or create a new account.";
  document.querySelector("#auth-password-label").textContent = enabled ? "Create password" : "Password";
  loginPassword.autocomplete = enabled ? "new-password" : "current-password";
  loginButton.textContent = enabled ? "Create account" : "Sign in";
  authSwitch.textContent = enabled ? "Already have an account? Sign in" : "New here? Create an account";
  loginError.textContent = "";
}

function setLoginPasswordVisibility(visible) {
  loginPassword.type = visible ? "text" : "password";
  passwordToggle.setAttribute("aria-label", `${visible ? "Hide" : "Show"} password`);
  passwordToggle.setAttribute("aria-pressed", String(visible));
}

function showApplication() {
  loginScreen.hidden = true;
  appShell.hidden = false;
  assistantWidget.hidden = false;
  showPage();
  checkAssistantStatus();
  loadStudents();
}

async function initializeApplication() {
  try {
    const status = await request("/api/auth/status");
    logoutButton.hidden = !status.required;
    if (!status.authenticated) {
      showLoginScreen();
      return;
    }
    document.querySelector("#profile-email").textContent = status.email;
    document.querySelector("#profile-label").textContent = status.role === "admin" ? "Administrator" : "Account";
    showApplication();
  } catch (error) {
    showLoginScreen(error.message);
  }
}

function showPage() {
  const page = window.location.hash === "#overview" ? "overview" : "students";
  document.querySelectorAll(".page-view").forEach((view) => {
    view.hidden = view.id !== page;
  });
  document.querySelectorAll(".nav-link[data-page]").forEach((link) => {
    const active = link.dataset.page === page;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  document.querySelector(".breadcrumb strong").textContent = page === "overview" ? "Overview" : "Students";
  document.title = `${page === "overview" ? "Overview" : "Students"} | Student Management`;
}

function addChatMessage(message, role) {
  const element = document.createElement("div");
  element.className = `chat-message ${role}-message`;
  element.textContent = message;
  assistantMessages.append(element);
  assistantMessages.scrollTop = assistantMessages.scrollHeight;
}

function searchStudentsLocally(command) {
  const term = command.replace(/^\/student\s*/i, "").trim();
  if (!term) return "Enter a name after /student, for example: /student Alex Morgan.";
  if (!students.length) return "Student records aren’t loaded yet. Please try again once the directory has loaded.";
  const matches = students.filter((student) => student.full_name.toLowerCase().includes(term.toLowerCase()));
  if (!matches.length) return `I couldn’t find a student matching “${term}”.`;
  const results = matches.slice(0, 5).map((student) => `${student.full_name} — ${student.course} (${student.status})`);
  const extra = matches.length > results.length ? `\nAnd ${matches.length - results.length} more match(es).` : "";
  return `Found ${matches.length} student${matches.length === 1 ? "" : "s"}:\n${results.join("\n")}${extra}`;
}

async function checkAssistantStatus() {
  try {
    const status = await request("/api/assistant/status");
    document.querySelector("#assistant-connection").textContent = status.configured
      ? "AI help is ready"
      : "OpenAI API key not configured";
  } catch (error) {
    document.querySelector("#assistant-connection").textContent = error.message.includes("npm start")
      ? "Open the app at localhost:3000"
      : "Assistant service unavailable";
  }
}

async function sendAssistantMessage(event) {
  event.preventDefault();
  const message = assistantInput.value.trim();
  if (!message) return;

  assistantInput.value = "";
  addChatMessage(message, "user");
  assistantSend.disabled = true;
  assistantInput.disabled = true;
  try {
    if (/^\/student(?:\s|$)/i.test(message)) {
      addChatMessage(searchStudentsLocally(message), "assistant");
      return;
    }
    const response = await request("/api/assistant/chat", {
      method: "POST",
      body: JSON.stringify({ message }),
    });
    addChatMessage(response.reply, "assistant");
  } catch (error) {
    addChatMessage(error.message || "The assistant could not answer right now. Please try again.", "assistant");
  } finally {
    assistantSend.disabled = false;
    assistantInput.disabled = false;
    assistantInput.focus();
  }
}

function updateStats() {
  document.querySelector("#total-count").textContent = students.length;
  document.querySelector("#active-count").textContent = students.filter((student) => student.status === "Active").length;
  document.querySelector("#course-count").textContent = new Set(students.map((student) => student.course.toLowerCase())).size;
  const averages = students.map((student) => studentAverage(student)).filter((average) => average !== null);
  const overallAverage = averages.length ? averages.reduce((total, average) => total + average, 0) / averages.length : null;
  document.querySelector("#overall-average").textContent = overallAverage === null ? "—" : `${overallAverage.toFixed(1)}%`;
  document.querySelector("#top-performer").textContent = averages.length
    ? [...students].sort((first, second) => (studentAverage(second) ?? -1) - (studentAverage(first) ?? -1))[0].full_name
    : "No marks yet";
  renderCourseChart();
}

function renderCourseChart() {
  const chart = document.querySelector("#course-chart");
  document.querySelector("#chart-total").textContent = students.length;
  if (students.length === 0) {
    chart.innerHTML = '<p class="chart-empty">Add students to see course enrollment here.</p>';
    return;
  }

  const courseCounts = new Map();
  for (const student of students) {
    const course = student.course.trim();
    const key = course.toLowerCase();
    const existing = courseCounts.get(key);
    if (existing) existing.count += 1;
    else courseCounts.set(key, { name: course, count: 1 });
  }
  const sortedCourses = [...courseCounts.values()].sort((first, second) => second.count - first.count || first.name.localeCompare(second.name));
  const visibleCourses = sortedCourses.slice(0, 5);
  if (sortedCourses.length > 5) {
    visibleCourses.push({
      name: "Other courses",
      count: sortedCourses.slice(5).reduce((total, course) => total + course.count, 0),
    });
  }
  const maxCount = Math.max(...visibleCourses.map((course) => course.count));
  chart.innerHTML = visibleCourses.map((course) => {
    const percent = Math.round((course.count / maxCount) * 100);
    const studentLabel = course.count === 1 ? "student" : "students";
    return `<div class="course-chart-row" role="listitem" aria-label="${escapeHtml(course.name)}: ${course.count} ${studentLabel}">
      <span class="course-chart-name" title="${escapeHtml(course.name)}">${escapeHtml(course.name)}</span>
      <span class="course-chart-track"><span class="course-chart-bar" style="width:${percent}%"></span></span>
      <strong class="course-chart-count">${course.count}</strong>
    </div>`;
  }).join("");
}

function filteredStudents() {
  const term = searchInput.value.trim().toLowerCase();
  const status = statusFilter.value;
  return students.filter((student) => {
    const matchesText = [student.full_name, student.email, student.course, String(student.id)]
      .some((value) => String(value).toLowerCase().includes(term));
    return matchesText && (status === "all" || student.status === status);
  });
}

function renderStudents() {
  const visible = filteredStudents();
  emptyState.querySelector("h3").textContent = "No students found";
  emptyState.querySelector("p").textContent = "Try changing your search or add a new student record.";
  document.querySelector("#visible-count").textContent = visible.length;
  document.querySelector("#results-label").textContent = `Showing ${visible.length} ${visible.length === 1 ? "student" : "students"}`;
  rowsElement.innerHTML = visible.map((student, index) => {
    const [background, foreground] = colors[index % colors.length];
    const statusClass = student.status.toLowerCase();
    return `<tr>
      <td><input type="checkbox" aria-label="Select ${escapeHtml(student.full_name)}" disabled /></td>
      <td><div class="student-cell"><span class="student-avatar" style="background:${background};color:${foreground}">${escapeHtml(initials(student.full_name))}</span><span><span class="student-name">${escapeHtml(student.full_name)}</span><span class="student-email">${escapeHtml(student.email)}</span></span></div></td>
      <td><span class="student-id">STU-${String(student.id).padStart(4, "0")}</span></td>
      <td><span class="course-name" title="${escapeHtml(student.course)}">${escapeHtml(student.course)}</span></td>
      <td><span class="date-cell">${escapeHtml(formattedDate(student.enrollment_date))}</span></td>
      <td><span class="status-badge ${statusClass}">${escapeHtml(student.status)}</span></td>
      <td><span class="row-actions">
        <button class="row-action" type="button" data-action="view" data-id="${student.id}" aria-label="View ${escapeHtml(student.full_name)}" title="View details">↗</button>
        <button class="row-action" type="button" data-action="edit" data-id="${student.id}" aria-label="Edit ${escapeHtml(student.full_name)}" title="Edit student">✎</button>
        <button class="row-action delete" type="button" data-action="delete" data-id="${student.id}" aria-label="Delete ${escapeHtml(student.full_name)}" title="Delete student">⌫</button>
      </span></td>
    </tr>`;
  }).join("");
  const isEmpty = visible.length === 0;
  emptyState.hidden = !isEmpty;
  rowsElement.closest("table").hidden = isEmpty;
}

async function loadStudents() {
  loadingState.hidden = false;
  emptyState.hidden = true;
  rowsElement.closest("table").hidden = true;
  setDatabaseStatus("checking", "Checking database...");
  let databaseConnected = false;
  try {
    const health = await request("/api/health");
    if (health.database !== "connected") throw new Error("The database health check did not confirm a connection.");
    setDatabaseStatus("connected", "Database connected");
    databaseConnected = true;
    students = await request("/api/students");
    updateStats();
    renderStudents();
  } catch (error) {
    if (!databaseConnected) setDatabaseStatus("disconnected", "Database unavailable");
    notify(`Couldn't load student records: ${error.message}`, true);
    emptyState.querySelector("h3").textContent = "Unable to load records";
    emptyState.querySelector("p").textContent = "Check your API and database connection, then try again.";
    emptyState.hidden = false;
  } finally {
    loadingState.hidden = true;
  }
}

function openForm(student = null) {
  studentForm.reset();
  formError.textContent = "";
  document.querySelector("#student-id").value = student?.id ?? "";
  document.querySelector("#full-name").value = student?.full_name ?? "";
  document.querySelector("#email").value = student?.email ?? "";
  document.querySelector("#phone").value = student?.phone ?? "";
  document.querySelector("#course").value = student?.course ?? "";
  document.querySelector("#enrollment-date").value = student?.enrollment_date ? String(student.enrollment_date).slice(0, 10) : new Date().toISOString().slice(0, 10);
  document.querySelector("#student-status").value = student?.status ?? "Active";
  document.querySelector("#mathematics-marks").value = student?.mathematics_marks ?? "";
  document.querySelector("#science-marks").value = student?.science_marks ?? "";
  document.querySelector("#english-marks").value = student?.english_marks ?? "";
  document.querySelector("#modal-title").textContent = student ? "Edit student" : "Add student";
  document.querySelector("#modal-intro").textContent = student ? "Update the student information below." : "Add a student to your directory by entering their details below.";
  saveButton.innerHTML = student ? "Save changes" : "Add student";
  studentModal.hidden = false;
  document.querySelector("#full-name").focus();
}

function closeModal(modal) {
  modal.hidden = true;
}

function viewStudent(student) {
  currentDetailsStudentId = student.id;
  const [background, foreground] = colors[(student.id - 1) % colors.length];
  const demoCompleted = Boolean(student.aadhaar_demo_completed);
  document.querySelector("#details-content").innerHTML = `
    <div class="detail-identity"><div class="detail-avatar" style="background:${background};color:${foreground}">${escapeHtml(initials(student.full_name))}</div><div><h3>${escapeHtml(student.full_name)}</h3><p>${escapeHtml(student.email)}</p></div></div>
    <div class="detail-grid">
      <div class="detail-item"><span>Student ID</span><strong>STU-${String(student.id).padStart(4, "0")}</strong></div>
      <div class="detail-item"><span>Status</span><strong><span class="status-badge ${student.status.toLowerCase()}">${escapeHtml(student.status)}</span></strong></div>
      <div class="detail-item"><span>Course</span><strong>${escapeHtml(student.course)}</strong></div>
      <div class="detail-item"><span>Enrollment date</span><strong>${escapeHtml(formattedDate(student.enrollment_date))}</strong></div>
      <div class="detail-item"><span>Phone number</span><strong>${escapeHtml(student.phone || "Not provided")}</strong></div>
    </div>
    <section class="performance-card" aria-label="Student academic performance">
      <div class="performance-heading"><div><span>Academic performance</span><strong>${escapeHtml(performanceLabel(studentAverage(student)))}</strong></div><span class="performance-average">${studentAverage(student) === null ? "—" : `${studentAverage(student).toFixed(1)}%`}</span></div>
      <div class="subject-marks">
        <div><span>Mathematics</span><strong>${student.mathematics_marks == null ? "—" : `${student.mathematics_marks}%`}</strong></div>
        <div><span>Science</span><strong>${student.science_marks == null ? "—" : `${student.science_marks}%`}</strong></div>
        <div><span>English</span><strong>${student.english_marks == null ? "—" : `${student.english_marks}%`}</strong></div>
      </div>
    </section>`;
  document.querySelector("#verification-status").textContent = demoCompleted
    ? "Demo completed — not verified"
    : "Not verified";
  const demoButton = document.querySelector("#demo-verification-button");
  demoButton.disabled = demoCompleted;
  demoButton.textContent = demoCompleted ? "Demo completed" : "Run demo only";
  detailsModal.hidden = false;
}

async function runDemoVerification() {
  const student = students.find((item) => item.id === currentDetailsStudentId);
  if (!student) return;
  const button = document.querySelector("#demo-verification-button");
  button.disabled = true;
  button.textContent = "Saving...";
  try {
    const updatedStudent = await request(`/api/students/${student.id}/aadhaar-demo-verification`, { method: "POST" });
    students = students.map((item) => item.id === updatedStudent.id ? updatedStudent : item);
    viewStudent(updatedStudent);
    notify("Demo marked complete. Aadhaar is not verified.");
  } catch (error) {
    button.disabled = false;
    button.textContent = "Run demo only";
    notify(`Couldn't save demo status: ${error.message}`, true);
  }
}

async function deleteStudent(student) {
  if (!window.confirm(`Delete ${student.full_name}'s student record? This cannot be undone.`)) return;
  try {
    await request(`/api/students/${student.id}`, { method: "DELETE" });
    students = students.filter((item) => item.id !== student.id);
    updateStats();
    renderStudents();
    notify("Student record deleted.");
  } catch (error) {
    notify(`Couldn't delete student: ${error.message}`, true);
  }
}

document.querySelector("#add-student-button").addEventListener("click", () => openForm());
document.querySelector("#empty-add-button").addEventListener("click", () => openForm());
document.querySelector("#close-modal").addEventListener("click", () => closeModal(studentModal));
document.querySelector("#cancel-modal").addEventListener("click", () => closeModal(studentModal));
document.querySelector("#close-details").addEventListener("click", () => closeModal(detailsModal));
document.querySelector("#demo-verification-button").addEventListener("click", runDemoVerification);
document.querySelector("#assistant-launcher").addEventListener("click", () => {
  const isOpening = assistantPanel.hidden;
  assistantPanel.hidden = !isOpening;
  document.querySelector("#assistant-launcher").setAttribute("aria-expanded", String(isOpening));
  if (isOpening) assistantInput.focus();
});
document.querySelector("#assistant-close").addEventListener("click", () => {
  assistantPanel.hidden = true;
  document.querySelector("#assistant-launcher").setAttribute("aria-expanded", "false");
});
document.querySelector("#assistant-form").addEventListener("submit", sendAssistantMessage);
passwordToggle.addEventListener("click", () => {
  setLoginPasswordVisibility(loginPassword.type === "password");
  loginPassword.focus();
});
loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.textContent = "";
  loginButton.disabled = true;
  loginButton.textContent = registrationMode ? "Creating account..." : "Signing in...";
  try {
    const result = await request(registrationMode ? "/api/auth/register" : "/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: loginEmail.value.trim(), password: loginPassword.value }),
    });
    logoutButton.hidden = false;
    document.querySelector("#profile-email").textContent = result.email;
    document.querySelector("#profile-label").textContent = result.role === "admin" ? "Administrator" : "Account";
    loginEmail.value = "";
    loginPassword.value = "";
    setLoginPasswordVisibility(false);
    showApplication();
  } catch (error) {
    loginError.textContent = error.message || "Unable to sign in.";
  } finally {
    loginButton.disabled = false;
    loginButton.textContent = registrationMode ? "Create account" : "Sign in";
  }
});
authSwitch.addEventListener("click", () => setRegistrationMode(!registrationMode));
logoutButton.addEventListener("click", async () => {
  logoutButton.disabled = true;
  try {
    await request("/api/auth/logout", { method: "POST" });
    students = [];
    rowsElement.replaceChildren();
    showLoginScreen();
  } catch (error) {
    notify(`Couldn't sign out: ${error.message}`, true);
  } finally {
    logoutButton.disabled = false;
  }
});
window.addEventListener("hashchange", showPage);
studentModal.addEventListener("click", (event) => { if (event.target === studentModal) closeModal(studentModal); });
detailsModal.addEventListener("click", (event) => { if (event.target === detailsModal) closeModal(detailsModal); });
searchInput.addEventListener("input", renderStudents);
statusFilter.addEventListener("change", renderStudents);

rowsElement.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const student = students.find((item) => item.id === Number(button.dataset.id));
  if (!student) return;
  if (button.dataset.action === "view") viewStudent(student);
  if (button.dataset.action === "edit") openForm(student);
  if (button.dataset.action === "delete") await deleteStudent(student);
});

studentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  formError.textContent = "";
  saveButton.disabled = true;
  saveButton.textContent = "Saving...";
  const id = document.querySelector("#student-id").value;
  const student = Object.fromEntries(new FormData(studentForm).entries());
  student.status = document.querySelector("#student-status").value;
  try {
    const savedStudent = await request(id ? `/api/students/${id}` : "/api/students", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(student),
    });
    if (id) students = students.map((item) => item.id === savedStudent.id ? savedStudent : item);
    else students.unshift(savedStudent);
    updateStats();
    renderStudents();
    closeModal(studentModal);
    notify(id ? "Student record updated." : "Student added successfully.");
  } catch (error) {
    formError.textContent = error.message || "Unable to save student record.";
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = id ? "Save changes" : "Add student";
  }
});

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    searchInput.focus();
  }
  if (event.key === "Escape") {
    closeModal(studentModal);
    closeModal(detailsModal);
  }
});

document.querySelector("#today-label").textContent = new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(new Date());
initializeApplication();
