-- BuildBid database schema (MySQL 8 / MariaDB 10.5+).
-- Also used for SQLite demo mode: scripts/init-db.js rewrites AUTO_INCREMENT keys automatically.

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(160) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL,                -- customer | contractor | professional | supplier | admin
  phone VARCHAR(20),
  city VARCHAR(80),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id INT PRIMARY KEY,
  category VARCHAR(40),                     -- contractor, civil_engineer, architect, mason, plumber, electrician, carpenter, painter, supplier
  company VARCHAR(160),
  skills TEXT,
  experience_years INT DEFAULT 0,
  bio TEXT,
  day_rate DECIMAL(10,2),
  licence_no VARCHAR(80),
  rating DECIMAL(3,2) DEFAULT 0,
  rating_count INT DEFAULT 0,
  projects_completed INT DEFAULT 0,
  verified TINYINT DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS regions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  city VARCHAR(80) NOT NULL,
  state VARCHAR(80) NOT NULL,
  labour_rate_sqft DECIMAL(10,2) NOT NULL,  -- typical labour contract rate, Rs per sq ft of built-up area
  region_index DECIMAL(5,3) NOT NULL DEFAULT 1.000
);

CREATE TABLE IF NOT EXISTS material_rates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  region_id INT NOT NULL,
  material_key VARCHAR(40) NOT NULL,
  name VARCHAR(120) NOT NULL,
  unit VARCHAR(30) NOT NULL,
  rate DECIMAL(12,2) NOT NULL,
  source VARCHAR(80) DEFAULT 'Indicative market rate',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (region_id) REFERENCES regions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS estimates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  region_id INT NOT NULL,
  inputs TEXT NOT NULL,
  result TEXT NOT NULL,
  total DECIMAL(14,2) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (region_id) REFERENCES regions(id)
);

CREATE TABLE IF NOT EXISTS projects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  title VARCHAR(160) NOT NULL,
  description TEXT,
  building_type VARCHAR(30) NOT NULL,       -- residential | commercial
  region_id INT NOT NULL,
  location_text VARCHAR(200),
  plot_area DECIMAL(10,2),
  area_per_floor DECIMAL(10,2) NOT NULL,
  floors INT NOT NULL,
  quality VARCHAR(20) NOT NULL,             -- basic | standard | premium
  basement TINYINT DEFAULT 0,
  budget DECIMAL(14,2),
  estimate_id INT,
  estimated_cost DECIMAL(14,2),
  status VARCHAR(20) NOT NULL DEFAULT 'open',  -- open | awarded | in_progress | completed | cancelled
  awarded_bid_id INT,
  bid_deadline DATE,
  actual_cost DECIMAL(14,2),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (region_id) REFERENCES regions(id)
);

CREATE TABLE IF NOT EXISTS bids (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  contractor_id INT NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  material_cost DECIMAL(14,2) DEFAULT 0,
  labour_cost DECIMAL(14,2) DEFAULT 0,
  other_cost DECIMAL(14,2) DEFAULT 0,
  timeline_days INT NOT NULL,
  warranty_months INT DEFAULT 0,
  notes TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'submitted',  -- submitted | accepted | rejected | withdrawn
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (project_id, contractor_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (contractor_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS historical_projects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  region_id INT NOT NULL,
  building_type VARCHAR(30) NOT NULL,
  total_area DECIMAL(10,2) NOT NULL,
  floors INT NOT NULL,
  quality VARCHAR(20) NOT NULL,
  cost_per_sqft DECIMAL(10,2) NOT NULL,
  year INT,
  source VARCHAR(80) DEFAULT 'seed-sample',
  FOREIGN KEY (region_id) REFERENCES regions(id)
);

CREATE TABLE IF NOT EXISTS milestones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  title VARCHAR(160) NOT NULL,
  phase VARCHAR(40),
  budget DECIMAL(14,2) DEFAULT 0,
  due_date DATE,
  status VARCHAR(20) DEFAULT 'pending',     -- pending | in_progress | done
  progress INT DEFAULT 0,
  sort_order INT DEFAULT 0,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS expenses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  milestone_id INT,
  description VARCHAR(200) NOT NULL,
  category VARCHAR(40) DEFAULT 'material',
  amount DECIMAL(14,2) NOT NULL,
  spent_on DATE,
  created_by INT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS project_updates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  user_id INT NOT NULL,
  message TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS hire_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  from_user INT NOT NULL,
  to_user INT NOT NULL,
  project_id INT,
  message TEXT,
  status VARCHAR(20) DEFAULT 'pending',     -- pending | accepted | declined
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (from_user) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (to_user) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS supplier_products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  supplier_id INT NOT NULL,
  region_id INT NOT NULL,
  material_key VARCHAR(40),
  name VARCHAR(160) NOT NULL,
  brand VARCHAR(80),
  unit VARCHAR(30) NOT NULL,
  price DECIMAL(12,2) NOT NULL,
  min_order VARCHAR(60),
  in_stock TINYINT DEFAULT 1,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (supplier_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (region_id) REFERENCES regions(id)
);

CREATE TABLE IF NOT EXISTS tenders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  organization VARCHAR(200) NOT NULL,
  tender_type VARCHAR(30) NOT NULL,         -- government | institutional | private
  category VARCHAR(80),
  location VARCHAR(120),
  state VARCHAR(80),
  value_estimate DECIMAL(16,2),
  emd DECIMAL(14,2),
  closing_date DATE,
  source_name VARCHAR(120),
  source_url VARCHAR(255),
  description TEXT,
  is_sample TINYINT DEFAULT 1
);

CREATE TABLE IF NOT EXISTS tender_bookmarks (
  user_id INT NOT NULL,
  tender_id INT NOT NULL,
  PRIMARY KEY (user_id, tender_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (tender_id) REFERENCES tenders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reviews (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT,
  reviewer_id INT NOT NULL,
  reviewee_id INT NOT NULL,
  rating INT NOT NULL,
  comment TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewee_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  message VARCHAR(255) NOT NULL,
  link VARCHAR(160),
  is_read TINYINT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
