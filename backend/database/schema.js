/**
 * 数据库表结构定义模块
 * 仅定义DDL语句，不包含业务逻辑
 */

const createGroupsTable = `
  CREATE TABLE IF NOT EXISTS \`groups\` (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    leaders TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`;

const createUsersTable = `
  CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'user',
    group_id INT DEFAULT NULL,
    FOREIGN KEY (group_id) REFERENCES \`groups\`(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`;

const createUserGroupMembershipsTable = `
  CREATE TABLE IF NOT EXISTS user_group_memberships (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    group_id INT NOT NULL,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (group_id) REFERENCES \`groups\`(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_group (user_id, group_id)
  )
`;

const createTodosListTable = `
  CREATE TABLE IF NOT EXISTS TodosList (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    Belonging_users TEXT,
    Belonging_groups TEXT,
    Completion_time DATETIME,
    create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    update_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    delete_time TIMESTAMP NULL,
    Deadline DATETIME,
    Priority INT DEFAULT 0,
    Status INT DEFAULT 0,
    creator_id INT,
    administrator_id INT,
    FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (administrator_id) REFERENCES users(id) ON DELETE SET NULL
  )
`;

const createSchemaMigrationsTable = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INT NOT NULL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`;

module.exports = {
  createGroupsTable,
  createUsersTable,
  createUserGroupMembershipsTable,
  createTodosListTable,
  createSchemaMigrationsTable
};