const mysql = require('mysql2');
require('dotenv').config();

/**
 * 数据库连接管理模块
 * 负责管理MySQL数据库连接的创建、初始化和重连逻辑
 */

let db = null;

/**
 * 创建数据库连接
 * @param {Object} config - 数据库配置参数
 * @returns {Promise<Object>} MySQL连接对象
 */
function createConnection(config = {}) {
  const connectionConfig = {
    host: config.host || process.env.DB_HOST,
    port: config.port || process.env.DB_PORT,
    user: config.user || process.env.DB_USER,
    password: config.password || process.env.DB_PASSWORD,
    database: config.database,
    charset: 'utf8mb4',
    ...config
  };

  return mysql.createConnection(connectionConfig);
}

/**
 * 创建数据库（如果不存在）
 * @param {string} databaseName - 数据库名称
 * @returns {Promise<void>}
 */
function createDatabaseIfNotExists(databaseName) {
  return new Promise((resolve, reject) => {
    const dbInit = createConnection();
    
    dbInit.connect((err) => {
      if (err) {
        return reject(new Error(`MySQL服务器连接失败: ${err.message}`));
      }
      
      console.log('成功连接到MySQL服务器');
      
      const createDbQuery = 'CREATE DATABASE IF NOT EXISTS ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci';
      dbInit.query(createDbQuery, [databaseName], (err) => {
        dbInit.end();
        
        if (err) {
          return reject(new Error(`创建数据库失败: ${err.message}`));
        }
        
        console.log(`数据库 '${databaseName}' 已创建或已存在`);
        resolve();
      });
    });
  });
}

/**
 * 初始化数据库连接（带重试机制）
 * @param {Object} options - 连接选项
 * @returns {Promise<Object>} 数据库连接对象
 */
async function initializeConnection(options = {}) {
  const {
    maxRetries = 10,
    retryDelay = 5000,
    database = process.env.DB_NAME || 'todos_db'
  } = options;

  // 首先确保数据库存在
  try {
    await createDatabaseIfNotExists(database);
  } catch (error) {
    console.error('数据库创建失败:', error.message);
    throw error;
  }

  // 连接到指定数据库
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      db = createConnection({ database });
      
      await new Promise((resolve, reject) => {
        db.connect((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
      
      console.log(`成功连接到数据库 '${database}'`);
      
      // 设置连接错误处理
      db.on('error', (err) => {
        console.error('数据库连接错误:', err);
        if (err.code === 'PROTOCOL_CONNECTION_LOST') {
          console.log('尝试重新连接数据库...');
          initializeConnection(options);
        }
      });
      
      return db;
    } catch (error) {
      console.error(`数据库连接失败 (尝试 ${attempt}/${maxRetries}):`, error.message);
      
      if (attempt < maxRetries) {
        console.log(`${retryDelay/1000}秒后重试...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      } else {
        throw new Error(`达到最大重试次数，无法连接到数据库: ${error.message}`);
      }
    }
  }
}

/**
 * 获取当前数据库连接
 * @returns {Object|null} 数据库连接对象
 */
function getConnection() {
  return db;
}

/**
 * 关闭数据库连接
 * @returns {Promise<void>}
 */
function closeConnection() {
  return new Promise((resolve) => {
    if (db) {
      db.end(() => {
        console.log('数据库连接已关闭');
        db = null;
        resolve();
      });
    } else {
      resolve();
    }
  });
}

/**
 * 测试数据库连接
 * @returns {Promise<boolean>}
 */
function testConnection() {
  return new Promise((resolve, reject) => {
    if (!db) {
      return reject(new Error('数据库未连接'));
    }
    
    db.query('SELECT 1', (err) => {
      if (err) {
        reject(err);
      } else {
        resolve(true);
      }
    });
  });
}

module.exports = {
  initializeConnection,
  getConnection,
  closeConnection,
  testConnection,
  createConnection
};