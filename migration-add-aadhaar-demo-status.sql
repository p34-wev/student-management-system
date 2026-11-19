USE student_management;

ALTER TABLE students
  ADD COLUMN aadhaar_demo_completed BOOLEAN NOT NULL DEFAULT FALSE;
