/**
 * MongoDB连接管理模块
 * 负责管理MongoDB数据库连接的创建、初始化和重连逻辑
 */

const mongoose = require('mongoose');
require('dotenv').config();

let isConnected = false;

/**
 * 初始化MongoDB连接
 * @param {Object} options - 连接选项
 * @returns {Promise<void>}
 */
async function initializeConnection(options = {}) {
  try {
    if (isConnected) {
      console.log('MongoDB已连接，跳过重复连接');
      return;
    }

    const mongoUri = options.uri || process.env.MONGODB_URI || 
      `mongodb://${process.env.MONGODB_HOST || 'localhost'}:${process.env.MONGODB_PORT || 27017}/${process.env.MONGODB_DATABASE || 'todos'}`;

    const connectionOptions = {
      maxPoolSize: 10, // 连接池最大连接数
      serverSelectionTimeoutMS: 5000, // 服务器选择超时
      socketTimeoutMS: 45000, // Socket超时
      bufferCommands: false, // 禁用mongoose缓冲
      ...options.connectionOptions
    };

    await mongoose.connect(mongoUri, connectionOptions);
    
    isConnected = true;
    console.log('MongoDB连接成功');
    console.log(`数据库: ${mongoose.connection.db.databaseName}`);

    // 监听连接事件
    mongoose.connection.on('error', (err) => {
      console.error('MongoDB连接错误:', err);
      isConnected = false;
    });

    mongoose.connection.on('disconnected', () => {
      console.log('MongoDB连接断开');
      isConnected = false;
    });

    mongoose.connection.on('reconnected', () => {
      console.log('MongoDB重新连接成功');
      isConnected = true;
    });

    // 创建索引
    const { createIndexes } = require('./mongodb-schema');
    await createIndexes();

  } catch (error) {
    console.error('MongoDB连接失败:', error);
    isConnected = false;
    throw error;
  }
}

/**
 * 获取MongoDB连接状态
 * @returns {boolean} 连接状态
 */
function getConnectionStatus() {
  return isConnected && mongoose.connection.readyState === 1;
}

/**
 * 获取数据库连接实例
 * @returns {mongoose.Connection} MongoDB连接实例
 */
function getConnection() {
  if (!getConnectionStatus()) {
    throw new Error('MongoDB未连接');
  }
  return mongoose.connection;
}

/**
 * 关闭MongoDB连接
 * @returns {Promise<void>}
 */
async function closeConnection() {
  try {
    if (isConnected) {
      await mongoose.connection.close();
      isConnected = false;
      console.log('MongoDB连接已关闭');
    }
  } catch (error) {
    console.error('关闭MongoDB连接失败:', error);
    throw error;
  }
}

/**
 * 测试MongoDB连接
 * @returns {Promise<boolean>} 连接测试结果
 */
async function testConnection() {
  try {
    if (!getConnectionStatus()) {
      return false;
    }
    
    // 执行简单的ping操作
    await mongoose.connection.db.admin().ping();
    return true;
  } catch (error) {
    console.error('MongoDB连接测试失败:', error);
    return false;
  }
}

/**
 * 安全执行数据库操作
 * @param {Function} operation - 要执行的数据库操作
 * @param {string} operationName - 操作名称（用于日志）
 * @returns {Promise<any>} 操作结果
 */
async function safeOperation(operation, operationName = '数据库操作') {
  try {
    if (!getConnectionStatus()) {
      throw new Error('MongoDB连接不可用');
    }
    
    return await operation();
  } catch (error) {
    console.error(`${operationName}失败:`, error);
    throw error;
  }
}

/**
 * 开始事务
 * @returns {Promise<mongoose.ClientSession>} 事务会话
 */
async function startTransaction() {
  const session = await mongoose.startSession();
  session.startTransaction();
  return session;
}

/**
 * 提交事务
 * @param {mongoose.ClientSession} session - 事务会话
 * @returns {Promise<void>}
 */
async function commitTransaction(session) {
  await session.commitTransaction();
  session.endSession();
}

/**
 * 回滚事务
 * @param {mongoose.ClientSession} session - 事务会话
 * @returns {Promise<void>}
 */
async function abortTransaction(session) {
  await session.abortTransaction();
  session.endSession();
}

module.exports = {
  initializeConnection,
  getConnectionStatus,
  getConnection,
  closeConnection,
  testConnection,
  safeOperation,
  startTransaction,
  commitTransaction,
  abortTransaction
};