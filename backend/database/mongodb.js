const mongoose = require('mongoose');
require('dotenv').config();

/**
 * MongoDB 连接管理模块
 * 负责管理 MongoDB 数据库连接的创建、初始化和重连逻辑
 */

let mongoConnection = null;

/**
 * 初始化 MongoDB 连接
 * @param {Object} options - 连接选项
 * @returns {Promise<void>}
 */
async function initializeMongoConnection(options = {}) {
  const {
    maxRetries = 10,
    retryDelay = 5000,
    database = process.env.MONGO_DB_NAME || 'todos_db'
  } = options;

  const mongoUri = process.env.MONGO_URI || 
    `mongodb://${process.env.MONGO_HOST || 'localhost'}:${process.env.MONGO_PORT || 27017}/${database}`;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 5000, // 服务器选择超时
        connectTimeoutMS: 10000, // 连接超时
        socketTimeoutMS: 45000, // Socket 超时
        maxPoolSize: 10, // 最大连接池大小
        minPoolSize: 2 // 最小连接池大小
      });

      mongoConnection = mongoose.connection;
      
      console.log(`成功连接到 MongoDB '${database}'`);
      
      // 设置连接事件监听
      mongoConnection.on('error', (err) => {
        console.error('MongoDB 连接错误:', err);
      });
      
      mongoConnection.on('disconnected', () => {
        console.log('MongoDB 连接已断开');
      });
      
      mongoConnection.on('reconnected', () => {
        console.log('MongoDB 已重连');
      });

      return;
    } catch (error) {
      console.error(`MongoDB 连接失败 (尝试 ${attempt}/${maxRetries}):`, error.message);
      
      if (attempt < maxRetries) {
        console.log(`${retryDelay/1000}秒后重试...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      } else {
        throw new Error(`达到最大重试次数，无法连接到 MongoDB: ${error.message}`);
      }
    }
  }
}

/**
 * 获取当前 MongoDB 连接
 * @returns {Object|null} MongoDB 连接对象
 */
function getMongoConnection() {
  return mongoConnection;
}

/**
 * 关闭 MongoDB 连接
 * @returns {Promise<void>}
 */
async function closeMongoConnection() {
  if (mongoConnection) {
    await mongoose.connection.close();
    mongoConnection = null;
    console.log('MongoDB 连接已关闭');
  }
}

/**
 * 测试 MongoDB 连接
 * @returns {Promise<boolean>}
 */
async function testMongoConnection() {
  try {
    if (!mongoConnection || mongoConnection.readyState !== 1) {
      throw new Error('MongoDB 未连接');
    }
    
    // 执行简单的 ping 操作
    await mongoConnection.db.admin().ping();
    return true;
  } catch (error) {
    throw error;
  }
}

/**
 * 获取 MongoDB 健康状态
 * @returns {Promise<Object>}
 */
async function getMongoHealthStatus() {
  try {
    const isConnected = mongoConnection && mongoConnection.readyState === 1;
    
    if (!isConnected) {
      return {
        status: 'disconnected',
        readyState: mongoConnection ? mongoConnection.readyState : 'no connection',
        database: null
      };
    }

    await mongoConnection.db.admin().ping();
    
    return {
      status: 'connected',
      readyState: mongoConnection.readyState,
      database: mongoConnection.db.databaseName,
      host: mongoConnection.host,
      port: mongoConnection.port
    };
  } catch (error) {
    return {
      status: 'error',
      error: error.message
    };
  }
}

module.exports = {
  initializeMongoConnection,
  getMongoConnection,
  closeMongoConnection,
  testMongoConnection,
  getMongoHealthStatus
};