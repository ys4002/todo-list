CREATE TABLE IF NOT EXISTS users (
  id             BIGINT       NOT NULL AUTO_INCREMENT,
  username       VARCHAR(30)  NOT NULL,
  name           VARCHAR(100) NOT NULL,
  password_hash  VARCHAR(100) NOT NULL,
  role           VARCHAR(20)  NOT NULL DEFAULT 'USER',
  token_version  INT          NOT NULL DEFAULT 0,
  enabled        BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at     DATETIME(6)  NOT NULL,
  updated_at     DATETIME(6)  NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT uk_users_username UNIQUE (username),
  CONSTRAINT ck_users_role CHECK (role IN ('USER', 'ADMIN'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tasks (
  id            BIGINT        NOT NULL AUTO_INCREMENT,
  user_id       BIGINT        NOT NULL,
  title         VARCHAR(100)  NOT NULL,
  description   VARCHAR(1000) NULL,
  due_at        DATETIME(6)   NOT NULL,
  completed     BOOLEAN       NOT NULL DEFAULT FALSE,
  completed_at  DATETIME(6)   NULL,
  created_at    DATETIME(6)   NOT NULL,
  updated_at    DATETIME(6)   NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_tasks_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  INDEX idx_tasks_user_due (user_id, due_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
