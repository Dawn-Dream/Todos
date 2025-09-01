#!/usr/bin/env node
/**
 * 全量数据迁移脚本：MySQL -> MongoDB
 * 用法: node scripts/full-migration.js [--dry-run] [--batch-size=1000]
 */

const mysql = require('mysql2/promise');
const mongoose = require('mongoose');
const { getConnection, safeQuery } = require('../database/connection');
const { initializeMongoConnection } = require('../database/mongodb');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { UserModel, GroupModel, UserGroupMembershipModel, TodoModel } = require('../database/mongoModels');

// 配置参数
const BATCH_SIZE = parseInt(process.argv.find(arg => arg.startsWith('--batch-size='))?.split('=')[1]) || 1000;
const DRY_RUN = process.argv.includes('--dry-run');

let mysqlConn, mongoConn;

async function connectDatabases() {
  // 连接 MySQL
  mysqlConn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '123456',
    database: process.env.DB_NAME || 'todos_db'
  });
  console.log('✓ MySQL 连接成功');

  // 连接 MongoDB
  const mongoUri = process.env.MONGO_URI || `mongodb://${process.env.MONGO_HOST || 'localhost'}:${process.env.MONGO_PORT || 27017}/${process.env.MONGO_DB_NAME || 'todos_db'}`;
  await mongoose.connect(mongoUri);
  mongoConn = mongoose.connection;
  console.log('✓ MongoDB 连接成功');
}

// 新增：统一归一化 role 的辅助函数，优先读取 SQL 的 role 字段，兼容旧版 is_admin
function normalizeRole(row) {
  if (row.role !== undefined && row.role !== null) {
    const v = String(row.role).trim().toLowerCase();
    if (v === 'admin') return 'admin';
    if (v === '1' || v === 'true') return 'admin';
    return 'user';
  }
  const ia = row.is_admin;
  if (ia === 1 || ia === '1' || ia === true) return 'admin';
  if (typeof ia === 'string' && ia.trim().toLowerCase() === 'true') return 'admin';
  return 'user';
}

async function migrateGroups(batch, dryRun = false) {
  console.log(`迁移 ${batch.length} 个用户组...`);
  const docs = batch.map(row => ({
    name: row.name,
    description: row.description,
    leaders: row.leaders ? row.leaders.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)) : [],
    mysqlId: row.id,
  }));
  
  if (dryRun) {
    console.log('预览模式 - 用户组:', docs);
    return { inserted: docs.length };
  }
  
  const result = await GroupModel.insertMany(docs, { ordered: false });
  return { inserted: result.length };
}

async function migrateUsers(batch, dryRun = false) {
  console.log(`迁移 ${batch.length} 个用户...`);
  const docs = batch.map(row => ({
    username: row.username,
    name: row.name || row.username, // 如果没有name字段，使用username作为fallback
    password: row.password, // 密码已加密的
    role: normalizeRole(row), // 优先使用 SQL 的 role 字段；无则回退 is_admin
    mysqlId: row.id,
  }));
  
  if (dryRun) {
    console.log('预览模式 - 用户:', docs);
    return { inserted: docs.length };
  }
  
  try {
    const result = await UserModel.insertMany(docs, { ordered: false });
    console.log(`✓ 成功插入 ${result.length} 个用户到 MongoDB`);
    return { inserted: result.length };
  } catch (error) {
    console.error('❌ 用户迁移失败:', error.message);
    if (error.writeErrors) {
      console.error('写入错误详情:', error.writeErrors);
    }
    throw error;
  }
}

async function migrateUserGroupMemberships(batch, dryRun = false) {
  console.log(`迁移 ${batch.length} 个用户组关系...`);
  const docs = batch.map(row => ({
    user_id: row.user_id,
    group_id: row.group_id,
    joined_at: row.joined_at ? new Date(row.joined_at) : new Date(),
  }));
  
  if (dryRun) {
    console.log('预览模式 - 用户组关系:', docs);
    return { inserted: docs.length };
  }
  
  const result = await UserGroupMembershipModel.insertMany(docs, { ordered: false });
  return { inserted: result.length };
}

async function migrateTodos(batch, dryRun = false) {
  console.log(`迁移 ${batch.length} 个待办事项...`);
  const docs = batch.map(row => ({
    name: row.name,
    description: row.description,
    Deadline: row.Deadline ? new Date(row.Deadline) : null,
    Priority: Number(row.Priority) || 0,
    Status: Number(row.Status) || -1,
    Belonging_users: row.Belonging_users ? row.Belonging_users.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)) : [],
    Belonging_groups: row.Belonging_groups ? row.Belonging_groups.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)) : [],
    creator_id: row.creator_id,
    administrator_id: row.administrator_id,
    mysqlId: row.id,
  }));
  
  if (dryRun) {
    console.log('预览模式 - 待办事项:', docs);
    return { inserted: docs.length };
  }
  
  try {
    const result = await TodoModel.insertMany(docs, { ordered: false });
    console.log(`✓ 成功插入 ${result.length} 个待办事项到 MongoDB`);
    return { inserted: result.length };
  } catch (error) {
    console.error('❌ 待办事项迁移失败:', error.message);
    if (error.writeErrors) {
      console.error('写入错误详情:', error.writeErrors);
    }
    throw error;
  }
}

async function validateMigration() {
  console.log('\n🔍 数据迁移校验...');
  
  const mysqlCounts = {
    groups: (await mysqlConn.execute('SELECT COUNT(*) as count FROM `groups`'))[0][0].count,
    users: (await mysqlConn.execute('SELECT COUNT(*) as count FROM users'))[0][0].count,
    memberships: (await mysqlConn.execute('SELECT COUNT(*) as count FROM user_group_memberships'))[0][0].count,
    todos: (await mysqlConn.execute('SELECT COUNT(*) as count FROM TodosList'))[0][0].count
  };

  const mongoCounts = {
    groups: await GroupModel.countDocuments(),
    users: await UserModel.countDocuments(),
    memberships: await UserGroupMembershipModel.countDocuments(),
    todos: await TodoModel.countDocuments()
  };

  console.log('📊 数据对比:');
  console.log(`  用户组: MySQL ${mysqlCounts.groups} vs MongoDB ${mongoCounts.groups}`);
  console.log(`  用户: MySQL ${mysqlCounts.users} vs MongoDB ${mongoCounts.users}`);
  console.log(`  用户-组关系: MySQL ${mysqlCounts.memberships} vs MongoDB ${mongoCounts.memberships}`);
  console.log(`  待办事项: MySQL ${mysqlCounts.todos} vs MongoDB ${mongoCounts.todos}`);

  const allMatch = Object.keys(mysqlCounts).every(key => mysqlCounts[key] === mongoCounts[key]);
  if (allMatch) {
    console.log('✅ 数据迁移校验通过!');
  } else {
    console.log('❌ 数据迁移校验失败，请检查!');
    process.exit(1);
  }
}

async function main() {
  console.log(`🚀 开始全量数据迁移 ${DRY_RUN ? '(预览模式)' : ''}`);
  console.log(`批次大小: ${BATCH_SIZE}`);
  
  try {
    await connectDatabases();
    
    if (!DRY_RUN) {
      // 清空 MongoDB 现有数据
      console.log('\n🧹 清空 MongoDB 现有数据...');
      try {
        await Promise.all([
          GroupModel.deleteMany({}),
          UserModel.deleteMany({}),
          UserGroupMembershipModel.deleteMany({}),
          TodoModel.deleteMany({})
        ]);
        console.log('✓ 清理完成');
      } catch (error) {
        console.warn('⚠️  清理数据失败（可能是权限问题），继续迁移:', error.message);
      }
    }
    
    // 迁移用户组
    console.log('\n📂 开始迁移用户组...');
    const [groupRows] = await mysqlConn.execute('SELECT * FROM `groups`');
    console.log(`发现 ${groupRows.length} 个用户组`);
    for (let i = 0; i < groupRows.length; i += BATCH_SIZE) {
      const batch = groupRows.slice(i, i + BATCH_SIZE);
      await migrateGroups(batch, DRY_RUN);
    }

    // 迁移用户
    console.log('\n👥 开始迁移用户...');
    const [userRows] = await mysqlConn.execute('SELECT * FROM users');
    console.log(`发现 ${userRows.length} 个用户`);
    for (let i = 0; i < userRows.length; i += BATCH_SIZE) {
      const batch = userRows.slice(i, i + BATCH_SIZE);
      await migrateUsers(batch, DRY_RUN);
    }

    // 迁移用户组关系
    console.log('\n🔗 开始迁移用户-组关系...');
    const [membershipRows] = await mysqlConn.execute('SELECT * FROM user_group_memberships');
    console.log(`发现 ${membershipRows.length} 条关系记录`);
    if (membershipRows.length > 0) {
      for (let i = 0; i < membershipRows.length; i += BATCH_SIZE) {
        const batch = membershipRows.slice(i, i + BATCH_SIZE);
        await migrateUserGroupMemberships(batch, DRY_RUN);
      }
    }

    // 迁移待办事项
    console.log('\n📝 开始迁移待办事项...');
    const [todoRows] = await mysqlConn.execute('SELECT * FROM TodosList');
    console.log(`发现 ${todoRows.length} 个待办事项`);
    for (let i = 0; i < todoRows.length; i += BATCH_SIZE) {
      const batch = todoRows.slice(i, i + BATCH_SIZE);
      await migrateTodos(batch, DRY_RUN);
    }
    
    if (!DRY_RUN) {
      await validateMigration();
      console.log('\n🎉 数据迁移完成!');
    } else {
      console.log('\n👀 预览模式完成，运行时请移除 --dry-run 参数');
    }
    
  } catch (error) {
    console.error('💥 迁移失败:', error);
    process.exit(1);
  } finally {
    await mysqlConn?.end();
    await mongoose.disconnect();
  }
}

main();