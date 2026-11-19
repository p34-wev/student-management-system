USE student_management;

ALTER TABLE students
  ADD COLUMN mathematics_marks DECIMAL(5,2) NULL,
  ADD COLUMN science_marks DECIMAL(5,2) NULL,
  ADD COLUMN english_marks DECIMAL(5,2) NULL;
