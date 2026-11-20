# Student Management

A student directory with add, view, update, delete, search, status-filter, and live course-enrollment chart functionality. The browser app uses an Express REST API backed by MySQL.

## Requirements

- Node.js 18 or newer
- MySQL 8 or newer

## Setup

1. Create the database and table:

   ```sh
   mysql -u root -p < schema.sql
   ```

   If you already created the database using an older version of the schema, apply the new demo-status column:

   ```sh
   mysql -u root -p < migration-add-aadhaar-demo-status.sql
   ```

   To add academic marks and performance fields to an existing database:

   ```sh
   mysql -u root -p < migration-add-marks.sql
   ```

   Apply account ownership once to an existing database before starting the updated server:

   ```sh
   mysql -u root -p < migration-add-user-accounts.sql
   ```

   Back up the database first. On first startup, unowned existing records are assigned to the legacy admin account.

2. Install dependencies:

   ```sh
   npm install
   ```

3. Copy `.env.example` to `.env` and set your MySQL connection values. To use AI app-help, add your OpenAI API key as `OPENAI_API_KEY` in `.env` (never put it in browser code). The default model is `gpt-4o-mini`; you can change it with `OPENAI_MODEL`.

4. Set `ADMIN_PASSWORD` to a unique password of at least 12 characters and `SESSION_SECRET` to a random secret of at least 32 characters. `ADMIN_EMAIL` defaults to `admin@localhost.test`; the first start creates the legacy admin account for existing records. `ADMIN_PASSWORD` is only used when creating that account; changing the environment value later does not reset its password. New users can select **Create an account** and choose their own email and password (at least 12 characters). Each account sees only its own student records. Generate a session secret with:

   ```sh
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```

   Put these values in `.env`, not `.env.example`, and restart the server after changing them.

5. Start the API server (leave this terminal running):

   ```sh
   npm start
   ```

6. [Open the live app](https://student-management-system-production-2743b4fe.up.railway.app). To use your local server instead, open `http://localhost:3000` after running `npm start`. Do not open `index.html` directly or use Live Server on port 5500: login and the CRUD API need the Express server.

7. Check your local API and MySQL connection at `http://localhost:3000/api/health`, or [check the live API](https://student-management-system-production-2743b4fe.up.railway.app/api/health). A healthy response is `{"status":"ok","database":"connected"}`.

## Dynamic cloud deployment (GitHub + Railway)

GitHub stores the source code; GitHub Pages cannot run this app's Express API or MySQL. For a live, database-backed app, deploy the Node.js server and MySQL database on Railway.

1. Push this project to a GitHub repository. The existing `.gitignore` excludes `.env` and `node_modules/`; never commit database passwords or API keys.
2. In Railway, create a project from that GitHub repository, then add a MySQL service to the same project.
3. In the Node app service's **Variables**, add references to the MySQL service. Replace `MySQL` below with the exact service name shown in Railway if it differs:

   ```text
   DB_HOST=${{MySQL.MYSQLHOST}}
   DB_PORT=${{MySQL.MYSQLPORT}}
   DB_USER=${{MySQL.MYSQLUSER}}
   DB_PASSWORD=${{MySQL.MYSQLPASSWORD}}
   DB_NAME=student_management
   ```

   `DB_NAME` must match the database created by `schema.sql`. Railway injects `PORT` for the web service. The server also accepts the `MYSQLHOST`, `MYSQLPORT`, `MYSQLUSER`, `MYSQLPASSWORD`, and `MYSQLDATABASE` names directly when those values point to the matching database.
4. Set `NODE_ENV=production`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` (at least 12 characters), and `SESSION_SECRET` (at least 32 random characters). Set them as private Railway variables; never commit or share the secrets.
5. Initialize the Railway MySQL database with `schema.sql` once, using Railway's MySQL query/connect tool. If the database already has an older schema, apply the relevant migration SQL files instead of re-running `schema.sql`.
6. In the Node service's **Settings → Networking**, generate a public domain. Open `https://<your-domain>/api/health`; deployment is ready when it returns `{"status":"ok","database":"connected"}`. Users can create accounts from the sign-in page.

The Node service serves both the app interface and API from the same domain. Keep database credentials and any `OPENAI_API_KEY` only in Railway's private service variables.

## REST API

| Method | Route | Description |
| --- | --- | --- |
| `GET` | `/api/students` | List students |
| `GET` | `/api/students/:id` | Get one student |
| `POST` | `/api/students` | Create a student |
| `PUT` | `/api/students/:id` | Update a student |
| `DELETE` | `/api/students/:id` | Delete a student |
| `GET` | `/api/health` | Check API and MySQL connectivity |
| `GET` | `/api/auth/status` | Check the current account session |
| `POST` | `/api/auth/register` | Create an account with a private student directory |
| `POST` | `/api/auth/login` | Sign in with email and password |
| `POST` | `/api/auth/logout` | Sign out |
| `POST` | `/api/students/:id/aadhaar-demo-verification` | Mark the demo flow complete |
| `GET` | `/api/assistant/status` | Check whether AI help is configured |
| `POST` | `/api/assistant/chat` | Ask a student-app usage question |

Student fields: `full_name`, `email`, `phone` (optional), `course`, `enrollment_date` (`YYYY-MM-DD`), and `status` (`Active` or `Inactive`). Student email addresses must be unique within each account.

The Aadhaar item is a demo status only; it does not verify identity. The app does not collect or store Aadhaar numbers or OTPs. Real verification must be integrated through an authorized UIDAI-compatible provider.

The assistant sends only its app-help question to OpenAI through the server. Student records are not included in AI requests. To search by name, enter `/student name` in the assistant; this lookup runs locally in the browser and returns matching names, courses, and statuses.
