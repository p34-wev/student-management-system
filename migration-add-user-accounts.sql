USE student_management;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(254) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin', 'user') NOT NULL DEFAULT 'user',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
);

ALTER TABLE students
  ADD COLUMN owner_user_id INT UNSIGNED NULL AFTER id,
  DROP INDEX uq_students_email,
  ADD UNIQUE KEY uq_students_owner_email (owner_user_id, email),
  ADD CONSTRAINT fk_students_owner FOREIGN KEY (owner_user_id) REFERENCES users (id);
