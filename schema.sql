CREATE TABLE images (
  id INT AUTO_INCREMENT PRIMARY KEY,
  filename VARCHAR(255),
  s3_key VARCHAR(512),
  caption TEXT,
  uploaded_at DATETIME
);
