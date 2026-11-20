Student Management System
A full-stack Student Management System built with HTML, CSS, JavaScript, Node.js, Express and MySQL. It supports complete CRUD (Create, Read, Update, Delete) operations with a modern dashboard UI.


🌟 Live Demo

🔗 "Open Student Management System" (https://student-management-system-production-2743b4fe.up.railway.app)

📌 Project Overview

The Student Management System is a web-based application that allows users to efficiently manage student records through a clean and user-friendly interface.

It provides essential student management operations, secure authentication, course enrollment analytics and an AI-powered application-help assistant.

✨ Key Features
  Features
🔐 Admin login with session-based authentication (protected API + pages)
📊 Dashboard with live stats (total students, active students, courses, average score)
➕ Add new students
📋 View / list students with search, course & status filters and pagination
✏️ Edit existing students
🗑️ Delete students with confirmation
🧮 Mathematics / Science / English marks with per-student average score
✅ Server-side validation and duplicate email handling
📱 Responsive layout
📊 Interactive Dashboard

- Total student statistics.
- Active and inactive student counts.
- Course enrollment analytics.
- Dynamic charts and visual reports.

👨‍🎓 Student Management

- ➕ Add new students.
- 👁️ View student details.
- ✏️ Update student information.
- 🗑️ Delete student records.
- 🔍 Search students instantly.
- Filter students by status.

🔐 Authentication & Security

- User registration and login.
- Secure password hashing.
- Session-based authentication.
- Private student directories.
- Account-based data access.

📈 Analytics & Performance

- Course-wise enrollment charts.
- Student status visualization.
- Academic marks and performance fields.

🤖 AI Assistant

- AI-powered application-help support.
- Answers questions about application usage.
- Local student-name search through assistant commands.

📱 User Experience

- Responsive interface.
- Modern dashboard design.
- Interactive navigation.
- User-friendly forms.

🛠️ Technology Stack

Technology| Purpose
HTML5| Structure
CSS3| Styling
JavaScript| Interactivity
React.js| Frontend
Node.js| Backend
Express.js| REST API
MySQL 8| Database
Railway| Cloud Deployment
OpenAI API| AI Assistant

⚙️ Installation & Setup

Prerequisites

- Node.js 18+
- MySQL 8+
- npm

Step 1: Clone Repository

git clone YOUR_GITHUB_REPOSITORY_URL
cd student-management-system

Step 2: Install Dependencies

npm install

Step 3: Configure Database

mysql -u root -p < schema.sql

Step 4: Configure Environment Variables

Copy ".env.example" to ".env" and configure:

DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=student_management

ADMIN_EMAIL=admin@localhost.test
ADMIN_PASSWORD=your_secure_password
SESSION_SECRET=your_random_secret

OPENAI_API_KEY=your_api_key

Keep your ".env" file private.

Step 5: Start Application

npm start

Open:

http://localhost:3000

🔗 REST API Endpoints

Method| Endpoint| Description
GET| /api/students| Get all students
POST| /api/students| Add student
GET| /api/students/:id| Get student details
PUT| /api/students/:id| Update student
DELETE| /api/students/:id| Delete student
GET| /api/health| Check server health
POST| /api/auth/login| User login
POST| /api/auth/register| User registration
POST| /api/auth/logout| User logout

☁️ Deployment

The application is deployed using Railway.

- GitHub: Source code management.
- Railway: Node.js application hosting.
- Railway MySQL: Database hosting.

Live Application: "Student Management System" (https://student-management-system-production-2743b4fe.up.railway.app)

🔒 Security

- Passwords are securely hashed.
- Database credentials are stored in environment variables.
- Session-based authentication.
- User-specific student data access.
- API requests are handled through the Express backend.

🎯 Project Objective

The main objective is to develop a secure, responsive and interactive platform that simplifies student record management and demonstrates full-stack web development concepts.

👩‍💻 Developer

Priyanshi Srivastava

BCA Student | Aspiring Full-Stack Developer

---

⭐ If you find this project interesting, don't forget to give it a star!
