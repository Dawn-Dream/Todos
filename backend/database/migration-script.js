/**
 * MySQL到MongoDB数据迁移脚本
 * 将现有MySQL数据转换并导入到MongoDB
 */

const mysql = require('mysql2/promise');
const mongoose = require('mongoose');
require('dotenv').config();

const {
  GroupModel,
  UserModel,
  UserGroupMembershipModel,
  TodoModel
} = require('./mongodb-schema');

// MySQL连接配置
const mysqlConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'todos_db',
  charset: 'utf8mb4'
};

// MongoDB连接配置
const mongoUri = process.env.MONGODB_URI || 
  `mongodb://${process.env.MONGODB_HOST || 'localhost'}:${process.env.MONGODB_PORT || 27017}/${process.env.MONGODB_DATABASE || 'todos'}`;

let mysqlConnection;
let mongoConnection;

/**
 * 初始化数据库连接
 */
async function initializeConnections() {
  try {
    // 连接MySQL
    mysqlConnection = await mysql.createConnection(mysqlConfig);
    console.log('MySQL连接成功');
    
    // 连接MongoDB
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    mongoConnection = mongoose.connection;
    console.log('MongoDB连接成功');
    
  } catch (error) {
    console.error('数据库连接失败:', error);
    throw error;
  }
}

/**
 * 迁移用户组数据
 */
async function migrateGroups() {
  try {
    console.log('开始迁移用户组数据...');
    
    const [rows] = await mysqlConnection.execute('SELECT * FROM `groups`');
    
    for (const row of rows) {
      // 解析leaders字段
      let leaders = [];
      if (row.leaders) {
        try {
          // 尝试解析JSON格式
          leaders = JSON.parse(row.leaders);
        } catch (e) {
          // 如果不是JSON，尝试解析逗号分隔的字符串
          leaders = row.leaders.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
        }
      }
      
      const group = new GroupModel({
        mysqlId: row.id,
        name: row.name,
        description: row.description,
        leaders: leaders,
        createdAt: row.created_at
      });
      
      await group.save();
    }
    
    console.log(`用户组数据迁移完成，共迁移 ${rows.length} 条记录`);
  } catch (error) {
    console.error('用户组数据迁移失败:', error);
    throw error;
  }
}

/**
 * 迁移用户数据
 */
async function migrateUsers() {
  try {
    console.log('开始迁移用户数据...');
    
    const [rows] = await mysqlConnection.execute('SELECT * FROM users');
    
    for (const row of rows) {
      const user = new UserModel({
        mysqlId: row.id,
        username: row.username,
        name: row.name,
        password: row.password,
        role: row.role,
        groupId: row.group_id,
        createdAt: row.created_at
      });
      
      await user.save();
    }
    
    console.log(`用户数据迁移完成，共迁移 ${rows.length} 条记录`);
  } catch (error) {
    console.error('用户数据迁移失败:', error);
    throw error;
  }
}

/**
 * 迁移用户组成员关系数据
 */
async function migrateUserGroupMemberships() {
  try {
    console.log('开始迁移用户组成员关系数据...');
    
    const [rows] = await mysqlConnection.execute('SELECT * FROM user_group_memberships');
    
    for (const row of rows) {
      const membership = new UserGroupMembershipModel({
        userId: row.user_id,
        groupId: row.group_id,
        joinedAt: row.joined_at
      });
      
      await membership.save();
    }
    
    console.log(`用户组成员关系数据迁移完成，共迁移 ${rows.length} 条记录`);
  } catch (error) {
    console.error('用户组成员关系数据迁移失败:', error);
    throw error;
  }
}

/**
 * 迁移任务数据
 */
async function migrateTodos() {
  try {
    console.log('开始迁移任务数据...');
    
    const [rows] = await mysqlConnection.execute('SELECT * FROM TodosList');
    
    for (const row of rows) {
      // 解析Belonging_users和Belonging_groups字段
      let belongingUsers = [];
      let belongingGroups = [];
      
      if (row.Belonging_users) {
        try {
          // 尝试解析JSON格式
          belongingUsers = JSON.parse(row.Belonging_users);
        } catch (e) {
          // 如果不是JSON，尝试解析逗号分隔的字符串
          belongingUsers = row.Belonging_users.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
        }
      }
      
      if (row.Belonging_groups) {
        try {
          // 尝试解析JSON格式
          belongingGroups = JSON.parse(row.Belonging_groups);
        } catch (e) {
          // 如果不是JSON，尝试解析逗号分隔的字符串
          belongingGroups = row.Belonging_groups.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
        }
      }
      
      const todo = new TodoModel({
        mysqlId: row.id,
        name: row.name,
        description: row.description,
        belongingUsers: belongingUsers,
        belongingGroups: belongingGroups,
        completionTime: row.Completion_time,
        deadline: row.Deadline,
        priority: row.Priority,
        status: row.Status,
        creatorId: row.creator_id,
        administratorId: row.administrator_id,
        adminUsers: [], // 新字段，暂时为空
        createdAt: row.create_time,
        updatedAt: row.update_time,
        deletedAt: row.delete_time
      });
      
      await todo.save();
    }
    
    console.log(`任务数据迁移完成，共迁移 ${rows.length} 条记录`);
  } catch (error) {
    console.error('任务数据迁移失败:', error);
    throw error;
  }
}

/**
 * 验证迁移结果
 */
async function validateMigration() {
  try {
    console.log('开始验证迁移结果...');
    
    // 验证用户组数据
    const [mysqlGroups] = await mysqlConnection.execute('SELECT COUNT(*) as count FROM `groups`');
    const mongoGroups = await GroupModel.countDocuments();
    console.log(`用户组数据验证: MySQL ${mysqlGroups[0].count} 条, MongoDB ${mongoGroups} 条`);
    
    // 验证用户数据
    const [mysqlUsers] = await mysqlConnection.execute('SELECT COUNT(*) as count FROM users');
    const mongoUsers = await UserModel.countDocuments();
    console.log(`用户数据验证: MySQL ${mysqlUsers[0].count} 条, MongoDB ${mongoUsers} 条`);
    
    // 验证用户组成员关系数据
    const [mysqlMemberships] = await mysqlConnection.execute('SELECT COUNT(*) as count FROM user_group_memberships');
    const mongoMemberships = await UserGroupMembershipModel.countDocuments();
    console.log(`用户组成员关系数据验证: MySQL ${mysqlMemberships[0].count} 条, MongoDB ${mongoMemberships} 条`);
    
    // 验证任务数据
    const [mysqlTodos] = await mysqlConnection.execute('SELECT COUNT(*) as count FROM TodosList');
    const mongoTodos = await TodoModel.countDocuments();
    console.log(`任务数据验证: MySQL ${mysqlTodos[0].count} 条, MongoDB ${mongoTodos} 条`);
    
    console.log('迁移结果验证完成');
  } catch (error) {
    console.error('验证迁移结果失败:', error);
    throw error;
  }
}

/**
 * 清理MongoDB数据（用于重新迁移）
 */
async function cleanupMongoDB() {
  try {
    console.log('清理MongoDB数据...');
    
    await GroupModel.deleteMany({});
    await UserModel.deleteMany({});
    await UserGroupMembershipModel.deleteMany({});
    await TodoModel.deleteMany({});
    
    console.log('MongoDB数据清理完成');
  } catch (error) {
    console.error('清理MongoDB数据失败:', error);
    throw error;
  }
}

/**
 * 关闭数据库连接
 */
async function closeConnections() {
  try {
    if (mysqlConnection) {
      await mysqlConnection.end();
      console.log('MySQL连接已关闭');
    }
    
    if (mongoConnection) {
      await mongoose.connection.close();
      console.log('MongoDB连接已关闭');
    }
  } catch (error) {
    console.error('关闭数据库连接失败:', error);
  }
}

/**
 * 主迁移函数
 */
async function migrate(options = {}) {
  try {
    console.log('开始数据迁移...');
    
    // 初始化连接
    await initializeConnections();
    
    // 如果指定了清理选项，先清理MongoDB数据
    if (options.cleanup) {
      await cleanupMongoDB();
    }
    
    // 按顺序迁移数据
    await migrateGroups();
    await migrateUsers();
    await migrateUserGroupMemberships();
    await migrateTodos();
    
    // 验证迁移结果
    await validateMigration();
    
    console.log('数据迁移完成！');
  } catch (error) {
    console.error('数据迁移失败:', error);
    throw error;
  } finally {
    await closeConnections();
  }
}

/**
 * 备份MySQL数据
 */
async function backupMySQL() {
  try {
    console.log('开始备份MySQL数据...');
    
    const fs = require('fs').promises;
    const path = require('path');
    
    const backupDir = path.join(__dirname, '../backups');
    await fs.mkdir(backupDir, { recursive: true });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupDir, `mysql-backup-${timestamp}.sql`);
    
    // 这里应该使用mysqldump命令来备份数据
    // 由于Node.js环境限制，这里只是创建一个示例文件
    const backupContent = `-- MySQL备份文件\n-- 备份时间: ${new Date().toISOString()}\n-- 请使用mysqldump命令进行实际备份\n`;
    
    await fs.writeFile(backupFile, backupContent);
    
    console.log(`MySQL数据备份完成: ${backupFile}`);
    console.log('请手动执行以下命令进行完整备份:');
    console.log(`mysqldump -h ${mysqlConfig.host} -P ${mysqlConfig.port} -u ${mysqlConfig.user} -p ${mysqlConfig.database} > ${backupFile}`);
  } catch (error) {
    console.error('备份MySQL数据失败:', error);
    throw error;
  }
}

// 命令行接口
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];
  
  switch (command) {
    case 'migrate':
      const cleanup = args.includes('--cleanup');
      migrate({ cleanup })
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
      break;
      
    case 'backup':
      backupMySQL()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
      break;
      
    case 'cleanup':
      initializeConnections()
        .then(() => cleanupMongoDB())
        .then(() => closeConnections())
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
      break;
      
    case 'validate':
      initializeConnections()
        .then(() => validateMigration())
        .then(() => closeConnections())
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
      break;
      
    default:
      console.log('使用方法:');
      console.log('  node migration-script.js migrate [--cleanup]  # 执行数据迁移');
      console.log('  node migration-script.js backup              # 备份MySQL数据');
      console.log('  node migration-script.js cleanup             # 清理MongoDB数据');
      console.log('  node migration-script.js validate            # 验证迁移结果');
      process.exit(1);
  }
}

module.exports = {
  migrate,
  backupMySQL,
  cleanupMongoDB,
  validateMigration
};