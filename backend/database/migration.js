const { getConnection } = require('./connection');
const {
  createGroupsTable,
  createUsersTable,
  createUserGroupMembershipsTable,
  createTodosListTable,
  createSchemaMigrationsTable
} = require('./schema');

/**
 * 迁移runner（含版本控制与并发锁）
 * - 使用 schema_migrations 表记录已执行的迁移
 * - 使用 MySQL 命名锁防止多实例并发执行迁移
 */

async function runMigrations() {
  const db = getConnection();
  if (!db) throw new Error('数据库未连接');

  // 确保迁移元数据表存在
  await execQuery(db, createSchemaMigrationsTable, '创建 schema_migrations 表');

  // 获取并发锁，避免多个实例同时迁移
  const lockName = 'todos_migrations_lock';
  const gotLock = await acquireLock(db, lockName, 60);
  if (!gotLock) {
    throw new Error('获取迁移锁超时，可能有另一个实例正在执行迁移');
  }

  try {
    const applied = await getAppliedMigrations(db); // Set<number>

    // 定义按版本顺序的迁移列表
    const migrations = [
      {
        version: 1,
        name: 'initial_schema',
        up: async () => {
          await execQuery(db, createGroupsTable, '创建 groups 表');
          await execQuery(db, createUsersTable, '创建 users 表');
          await execQuery(db, createUserGroupMembershipsTable, '创建 user_group_memberships 表');
          await execQuery(db, createTodosListTable, '创建 TodosList 表');
        }
      },
      {
        version: 2,
        name: 'migrate_user_group_memberships',
        up: async () => {
          await migrateExistingGroupData(db);
        }
      }
    ];

    for (const m of migrations) {
      if (applied.has(m.version)) {
        console.log(`迁移 v${m.version} (${m.name}) 已执行，跳过`);
        continue;
      }
      console.log(`开始执行迁移 v${m.version} (${m.name})...`);
      await m.up();
      await markMigrationApplied(db, m.version, m.name);
      console.log(`迁移 v${m.version} (${m.name}) 执行完成`);
    }

    console.log('所有迁移已应用');
  } finally {
    await releaseLock(db, lockName);
  }
}

function execQuery(db, sql, desc) {
  return new Promise((resolve, reject) => {
    db.query(sql, (err) => {
      if (err) {
        console.error(`${desc} 失败:`, err);
        return reject(err);
      }
      console.log(`${desc} 成功或已存在`);
      resolve();
    });
  });
}

function queryAsync(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  });
}

async function acquireLock(db, name, timeoutSec) {
  const rows = await queryAsync(db, 'SELECT GET_LOCK(?, ?) AS got_lock', [name, timeoutSec]);
  return rows && rows[0] && rows[0].got_lock === 1;
}

async function releaseLock(db, name) {
  try {
    const rows = await queryAsync(db, 'SELECT RELEASE_LOCK(?) AS released', [name]);
    if (rows && rows[0] && rows[0].released === 1) {
      console.log('迁移锁已释放');
    } else {
      console.warn('迁移锁释放结果非 1，可能锁已不存在');
    }
  } catch (e) {
    console.warn('释放迁移锁时发生错误:', e.message);
  }
}

async function getAppliedMigrations(db) {
  const rows = await queryAsync(db, 'SELECT version FROM schema_migrations ORDER BY version ASC');
  return new Set(rows.map(r => r.version));
}

async function markMigrationApplied(db, version, name) {
  await queryAsync(db, 'INSERT INTO schema_migrations (version, name) VALUES (?, ?)', [version, name]);
}

function migrateExistingGroupData(db) {
  return new Promise((resolve) => {
    const selectUsersWithGroupQuery = 'SELECT id, group_id FROM users WHERE group_id IS NOT NULL';
    db.query(selectUsersWithGroupQuery, (err, users) => {
      if (err) {
        console.error('查询用户组数据失败:', err);
        return resolve();
      }

      if (!users || users.length === 0) {
        console.log('没有需要迁移的用户组数据');
        return resolve();
      }

      console.log(`开始迁移 ${users.length} 条用户组关系数据`);

      let pending = users.length;
      users.forEach(user => {
        const insertMembershipQuery = 'INSERT IGNORE INTO user_group_memberships (user_id, group_id) VALUES (?, ?)';
        db.query(insertMembershipQuery, [user.id, user.group_id], (err) => {
          if (err) {
            console.error(`迁移用户 ${user.id} 的组关系失败:`, err);
          } else {
            console.log(`成功迁移用户 ${user.id} 到组 ${user.group_id}`);
          }
          if (--pending === 0) resolve();
        });
      });
    });
  });
}

module.exports = { runMigrations };