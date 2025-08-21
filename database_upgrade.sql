-- =====================================================
-- 数据库升级脚本 - 多用户组支持功能
-- 版本: 从单用户组模式升级到多用户组模式
-- 创建时间: 2024年
-- =====================================================

-- 设置字符集和排序规则
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- =====================================================
-- 1. 创建版本控制表（用于跟踪数据库升级状态）
-- =====================================================
CREATE TABLE IF NOT EXISTS `database_versions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `version` VARCHAR(50) NOT NULL UNIQUE,
  `description` TEXT,
  `applied_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `rollback_script` TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 检查是否已经应用过此升级
SET @upgrade_applied = (SELECT COUNT(*) FROM `database_versions` WHERE `version` = 'v1.1.0_multi_group_support');

-- =====================================================
-- 2. 创建用户组成员关系表（多对多关系）
-- =====================================================
-- 目的：支持用户属于多个用户组的功能
-- 替代原有的users表中的group_id字段（一对多关系）

CREATE TABLE IF NOT EXISTS `user_group_memberships` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL COMMENT '用户ID',
  `group_id` INT NOT NULL COMMENT '用户组ID',
  `joined_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '加入时间',
  `created_by` INT DEFAULT NULL COMMENT '添加此关系的管理员ID',
  `notes` TEXT DEFAULT NULL COMMENT '备注信息',
  
  -- 外键约束
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  
  -- 唯一约束：防止重复的用户-组关系
  UNIQUE KEY `unique_user_group` (`user_id`, `group_id`),
  
  -- 索引优化
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_group_id` (`group_id`),
  INDEX `idx_joined_at` (`joined_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
COMMENT='用户组成员关系表 - 支持多对多关系';

-- =====================================================
-- 3. 数据迁移：将现有的group_id数据迁移到新表
-- =====================================================
-- 目的：保持数据完整性，将原有的单用户组关系迁移到新的多用户组关系表

-- 3.1 迁移现有的用户组关系数据
INSERT IGNORE INTO `user_group_memberships` (`user_id`, `group_id`, `joined_at`, `notes`)
SELECT 
    `id` as `user_id`,
    `group_id`,
    `created_at` as `joined_at`,
    '数据迁移：从原group_id字段迁移' as `notes`
FROM `users` 
WHERE `group_id` IS NOT NULL;

-- 3.2 验证迁移结果
SET @migrated_count = (SELECT COUNT(*) FROM `user_group_memberships` WHERE `notes` LIKE '%数据迁移%');
SET @original_count = (SELECT COUNT(*) FROM `users` WHERE `group_id` IS NOT NULL);

-- 如果迁移数量不匹配，输出警告（注意：这在脚本中只是记录，实际需要应用程序检查）
-- SELECT CASE 
--     WHEN @migrated_count != @original_count THEN 
--         CONCAT('警告：迁移数据数量不匹配。原始数据：', @original_count, '，迁移数据：', @migrated_count)
--     ELSE 
--         CONCAT('数据迁移成功：', @migrated_count, ' 条记录')
-- END as migration_status;

-- =====================================================
-- 4. 表结构优化（可选）
-- =====================================================
-- 目的：为了向后兼容，暂时保留users表中的group_id字段
-- 在确认新系统稳定运行后，可以通过后续升级脚本删除此字段

-- 4.1 为group_id字段添加注释，标记为已废弃
ALTER TABLE `users` 
MODIFY COLUMN `group_id` INT DEFAULT NULL 
COMMENT '已废弃：请使用user_group_memberships表查询用户组关系';

-- 4.2 为users表添加索引优化（如果不存在）
ALTER TABLE `users` 
ADD INDEX IF NOT EXISTS `idx_username` (`username`),
ADD INDEX IF NOT EXISTS `idx_role` (`role`),
ADD INDEX IF NOT EXISTS `idx_created_at` (`created_at`);

-- 4.3 为groups表添加索引优化（如果不存在）
ALTER TABLE `groups` 
ADD INDEX IF NOT EXISTS `idx_name` (`name`),
ADD INDEX IF NOT EXISTS `idx_created_at` (`created_at`);

-- =====================================================
-- 5. 创建视图：简化多用户组查询
-- =====================================================
-- 目的：提供便捷的查询接口，简化应用程序中的复杂JOIN查询

-- 5.1 用户及其所属组的视图
CREATE OR REPLACE VIEW `user_groups_view` AS
SELECT 
    u.id as user_id,
    u.username,
    u.name as user_name,
    u.role,
    g.id as group_id,
    g.name as group_name,
    g.description as group_description,
    ugm.joined_at,
    ugm.notes
FROM `users` u
LEFT JOIN `user_group_memberships` ugm ON u.id = ugm.user_id
LEFT JOIN `groups` g ON ugm.group_id = g.id;

-- 5.2 用户组及其成员的视图
CREATE OR REPLACE VIEW `group_members_view` AS
SELECT 
    g.id as group_id,
    g.name as group_name,
    g.description as group_description,
    g.leaders,
    u.id as user_id,
    u.username,
    u.name as user_name,
    u.role,
    ugm.joined_at,
    ugm.notes
FROM `groups` g
LEFT JOIN `user_group_memberships` ugm ON g.id = ugm.group_id
LEFT JOIN `users` u ON ugm.user_id = u.id;

-- =====================================================
-- 6. 创建存储过程：用户组管理操作
-- =====================================================

DELIMITER //

-- 6.1 添加用户到用户组的存储过程
CREATE PROCEDURE IF NOT EXISTS `AddUserToGroup`(
    IN p_user_id INT,
    IN p_group_id INT,
    IN p_created_by INT,
    IN p_notes TEXT
)
BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;
    
    START TRANSACTION;
    
    -- 检查用户是否存在
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_user_id) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '用户不存在';
    END IF;
    
    -- 检查用户组是否存在
    IF NOT EXISTS (SELECT 1 FROM `groups` WHERE id = p_group_id) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '用户组不存在';
    END IF;
    
    -- 插入用户组关系（使用INSERT IGNORE避免重复）
    INSERT IGNORE INTO user_group_memberships (user_id, group_id, created_by, notes)
    VALUES (p_user_id, p_group_id, p_created_by, p_notes);
    
    COMMIT;
END//

-- 6.2 从用户组移除用户的存储过程
CREATE PROCEDURE IF NOT EXISTS `RemoveUserFromGroup`(
    IN p_user_id INT,
    IN p_group_id INT
)
BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;
    
    START TRANSACTION;
    
    DELETE FROM user_group_memberships 
    WHERE user_id = p_user_id AND group_id = p_group_id;
    
    COMMIT;
END//

DELIMITER ;

-- =====================================================
-- 7. 数据完整性检查
-- =====================================================
-- 目的：确保升级后的数据完整性

-- 7.1 检查孤立的用户组关系记录
-- （引用不存在的用户或用户组的记录）
SELECT 
    'orphaned_user_memberships' as check_type,
    COUNT(*) as count
FROM user_group_memberships ugm
LEFT JOIN users u ON ugm.user_id = u.id
WHERE u.id IS NULL

UNION ALL

SELECT 
    'orphaned_group_memberships' as check_type,
    COUNT(*) as count
FROM user_group_memberships ugm
LEFT JOIN `groups` g ON ugm.group_id = g.id
WHERE g.id IS NULL;

-- =====================================================
-- 8. 记录升级完成状态
-- =====================================================
-- 目的：标记此升级脚本已成功应用，防止重复执行

INSERT IGNORE INTO `database_versions` (`version`, `description`, `rollback_script`) 
VALUES (
    'v1.1.0_multi_group_support',
    '多用户组支持功能升级：添加user_group_memberships表，支持用户属于多个用户组',
    'DROP TABLE IF EXISTS user_group_memberships; DROP VIEW IF EXISTS user_groups_view; DROP VIEW IF EXISTS group_members_view; DROP PROCEDURE IF EXISTS AddUserToGroup; DROP PROCEDURE IF EXISTS RemoveUserFromGroup;'
);

-- =====================================================
-- 9. 清理临时数据
-- =====================================================
-- 删除临时文件（如果有的话）
-- 注意：实际环境中可能需要手动清理

-- =====================================================
-- 10. 升级完成提示
-- =====================================================
SELECT 
    '数据库升级完成' as status,
    'v1.1.0_multi_group_support' as version,
    NOW() as completed_at,
    (
        SELECT COUNT(*) 
        FROM user_group_memberships 
        WHERE notes LIKE '%数据迁移%'
    ) as migrated_records;

-- 恢复外键检查
SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================
-- 升级脚本执行说明
-- =====================================================
/*
使用方法：
1. 备份当前数据库：mysqldump -u username -p database_name > backup.sql
2. 执行升级脚本：mysql -u username -p database_name < database_upgrade.sql
3. 验证升级结果：检查user_group_memberships表中的数据
4. 测试应用程序功能：确保多用户组功能正常工作

回滚方法（如果需要）：
1. 恢复备份：mysql -u username -p database_name < backup.sql
2. 或执行回滚脚本中的命令

注意事项：
1. 此脚本设计为可重复执行，不会重复创建已存在的表或数据
2. 原有的group_id字段被保留以确保向后兼容性
3. 建议在生产环境执行前先在测试环境验证
4. 执行前请确保有足够的磁盘空间和数据库权限
*/