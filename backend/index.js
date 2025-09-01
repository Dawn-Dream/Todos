const express = require('express');

const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const webPush = require('web-push');
const subscriptionsFile = path.join(__dirname, 'push-subscriptions.json');

// 引入新的数据库模块
const { initializeConnection, getConnection } = require('./database/connection');
const { runMigrations } = require('./database/migration');
const { initializeMongoConnection } = require('./database/mongodb');
const { TodosRepo, UsersRepo, GroupsRepo, MembershipRepo } = require('./database/dualRepo');

const app = express();
const PORT = process.env.PORT || 3000;

// 读写模式（用于双库切换）
const READ_FROM = process.env.DB_READ_FROM || 'mysql'; // mysql | mongo | prefer-mongo
const WRITE_MODE = process.env.DB_WRITE_MODE || 'mysql'; // mysql | dual | mongo
// 显式禁用/要求 MySQL（用于“下线 SQL”场景）
const MYSQL_DISABLED = (process.env.MYSQL_DISABLED === 'true') || (READ_FROM === 'mongo' && WRITE_MODE === 'mongo');
const MYSQL_REQUIRED = process.env.MYSQL_REQUIRED === 'true';

// 说明：本文件已移除直接 SQL 调用，统一通过仓储层（TodosRepo/UsersRepo/GroupsRepo/MembershipRepo）进行数据访问
// 配置CORS以允许来自前端的请求
const corsOptions = {
  origin: true,
  optionsSuccessStatus: 200,
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  next();
});

// 添加用户到用户组API
app.post('/users/:userId/groups/:groupId', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: '权限不足，只有管理员可以执行此操作' });
    }
    const { userId, groupId } = req.params;
  
    // 基于仓储验证用户/组存在（读源自动处理）
    const [user, group] = await Promise.all([
      UsersRepo.findById(userId),
      GroupsRepo.findById(groupId)
    ]);
    if (!user) return res.status(404).json({ message: '用户不存在' });
    if (!group) return res.status(404).json({ message: '用户组不存在' });
  
    await MembershipRepo.addUserToGroup(userId, groupId);
    return res.json({ message: '用户已成功添加到用户组' });
  } catch (err) {
    console.error('添加用户到用户组失败:', err);
    return res.status(500).json({ message: '服务器内部错误' });
  }
});

// 从用户组中移除用户API
app.delete('/users/:userId/groups/:groupId', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: '权限不足，只有管理员可以执行此操作' });
    }
    const { userId, groupId } = req.params;
  
    const result = await MembershipRepo.removeUserFromGroup(userId, groupId);
    // MySQL: affectedRows; Mongo: deletedCount
    if ((result && result.affectedRows === 0) || (result && result.deletedCount === 0)) {
      return res.status(404).json({ message: '用户不在该用户组中' });
    }
    return res.json({ message: '用户已从用户组中移除' });
  } catch (err) {
    console.error('从用户组中移除用户失败:', err);
    return res.status(500).json({ message: '服务器内部错误' });
  }
});

// 获取用户组成员API
app.get('/groups/:groupId/members', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;
  
    const members = await MembershipRepo.getGroupMembers(groupId);
    return res.json({ members });
  } catch (err) {
    console.error('获取用户组成员失败:', err);
    return res.status(500).json({ message: '服务器内部错误' });
  }
});

// 移除旧的 dbInit 和 initializeDatabase 实现，改为模块化启动
async function bootstrap() {
  let mysqlReady = false;
  try {
    // 先尝试初始化 MongoDB（可选，不阻断启动）
    try {
      await initializeMongoConnection();
      console.log('MongoDB 连接成功');
    } catch (mongoError) {
      console.warn('MongoDB 连接失败（根据读写配置可能影响功能）:', mongoError.message);
    }
  
    // 根据配置决定是否初始化 MySQL
    if (!MYSQL_DISABLED) {
      try {
        // 初始化数据库连接并确保数据库存在
        await initializeConnection({ database: process.env.DB_NAME || 'todos_db' });
        console.log('MySQL 数据库连接成功');
        mysqlReady = true;
        // 运行数据库迁移
        await runMigrations();
      } catch (mysqlError) {
        const msg = `MySQL 启动失败: ${mysqlError.message}`;
        if (MYSQL_REQUIRED) {
          console.error('启动失败（MySQL 为必需）:', msg);
          throw mysqlError; // 进入外层 catch
        } else {
          console.warn(msg + '（已忽略，应用将以无 MySQL 模式运行）');
        }
      }
    } else {
      console.log('已按配置禁用 MySQL 初始化（MYSQL_DISABLED=true 或 读/写均为 mongo）');
    }
  
    // 初始化默认用户（仅在可写路径可用时执行）
    try {
      if (WRITE_MODE === 'mongo' || WRITE_MODE === 'dual' || (WRITE_MODE === 'mysql' && mysqlReady)) {
        await initializeDefaultUsers();
      } else {
        console.log('跳过默认用户初始化：当前写入模式为 mysql 且 MySQL 未就绪');
      }
    } catch (e) {
      console.warn('初始化默认用户时出现非致命错误：', e.message);
    }
  
    // 启动服务器
    startServer();
  } catch (error) {
    console.error('启动失败:', error);
    // 仅在明确要求时才退出
    if (MYSQL_REQUIRED || process.env.EXIT_ON_BOOTSTRAP_ERROR === 'true') {
      process.exit(1);
    }
  }
}

// 调用新的启动流程
bootstrap();

// mysql2 连接已迁移至 ./database/connection 模块，不再直接在此引用
// 迁移逻辑已模块化至 ./database/migration.js

 // 初始化默认用户（使用仓储层，避免直接 SQL）
 async function initializeDefaultUsers() {
   try {
     const existing = await UsersRepo.findByUsername('admin');
     if (!existing) {
       const defaultPassword = 'admin123';
       const hashedPassword = await bcrypt.hash(defaultPassword, 10);
       await UsersRepo.create({ username: 'admin', name: '管理员', password: hashedPassword, role: 'admin' });
       console.log('默认管理员用户创建成功，用户名: admin，展示名: 管理员，密码: admin123');
     } else {
       console.log('默认管理员用户已存在');
     }
   } catch (err) {
     console.error('检查/创建默认用户失败:', err);
   }
   // 创建用于存储任务详情的目录
   const todoDetailsDir = path.join(__dirname, 'todo-details');
   if (!fs.existsSync(todoDetailsDir)) {
     fs.mkdirSync(todoDetailsDir, { recursive: true });
     console.log('任务详情存储目录已创建');
   }
 }

// 注册API
app.post('/register', async (req, res) => {
  const { username, name, password, role, groupId } = req.body;
  
  if (!username || !name || !password) {
    return res.status(400).json({ message: '用户名、展示名和密码是必需的' });
  }
  
  try {
    // 检查用户名是否已存在
    const existingUser = await UsersRepo.findByUsername(username);
    if (existingUser) {
      return res.status(400).json({ message: '用户名已存在' });
    }
    
    // 检查用户组是否存在（如果提供了groupId）
    if (groupId) {
      const group = await GroupsRepo.findById(groupId);
      if (!group) {
        return res.status(400).json({ message: '指定的用户组不存在' });
      }
    }
    
    // 密码哈希
    const hashedPassword = bcrypt.hashSync(password, 10);
    
    // 创建用户数据
    const userData = {
      username,
      name,
      password: hashedPassword,
      role: role || 'user',
      group_id: groupId || null
    };
    
    // 通过双写仓储创建用户
    // await UsersRepo.create(userData);
    const createResult = await UsersRepo.create(userData);
    
    // 尝试获取新用户的数值型ID（用于成员关系表）。
    // 优先使用 MySQL insertId；若不可用（例如 Mongo-only 模式），再回读用户尝试获取数值ID。
    let newUserId = null;
    if (createResult && typeof createResult.insertId === 'number') {
      newUserId = createResult.insertId;
    } else {
      try {
        const created = await UsersRepo.findByUsername(username);
        if (created && created.id && !isNaN(parseInt(created.id))) {
          newUserId = parseInt(created.id);
        }
      } catch (e) {
        console.warn('回读新用户信息以获取数值ID失败：', e);
      }
    }

    // 可选：把新用户加入指定的用户组（仅当拿到数值型 userId 且 groupId 可解析为数值时）
    if (groupId !== undefined && groupId !== null) {
      const gidNum = parseInt(groupId);
      if (!isNaN(gidNum) && !isNaN(parseInt(newUserId))) {
        try {
          await MembershipRepo.addUserToGroup(parseInt(newUserId), gidNum);
        } catch (e) {
          console.warn('注册后加入用户组失败（已忽略，不影响注册成功）：', e);
        }
      }
    }
    
    res.status(201).json({ message: '注册成功' });
  } catch (error) {
    console.error('注册失败:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 登录API
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ message: '用户名和密码是必需的' });
  }
  
  try {
    // 通过双读仓储查询用户
    const user = await UsersRepo.findByUsername(username);
    
    if (!user) {
      return res.status(401).json({ message: '用户名或密码错误' });
    }
    
    // 验证密码
    const isMatch = await bcrypt.compare(password, user.password);
    
    if (!isMatch) {
      return res.status(401).json({ message: '用户名或密码错误' });
    }
    
    // 确保用户信息中的中文字符正确编码
    const userInfo = {
      userId: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      groupId: user.group_id || null
    };
    
    // 生成JWT token
    const token = jwt.sign(userInfo, process.env.JWT_SECRET || 'your_jwt_secret_key', {
      expiresIn: '1h',
      encoding: 'utf8'
    });
    
    // 返回token和用户信息
    res.json({ 
      token, 
      user: { 
        id: user.id, 
        username: user.username, 
        name: user.name,
        role: user.role,
        groupId: user.group_id || null
      } 
    });
  } catch (error) {
    console.error('登录失败:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});
 

 app.post('/refresh-token', async (req, res) => {
   const token = req.headers.authorization?.split(' ')[1];
   
   if (!token) {
     return res.status(401).json({ message: '未提供token' });
   }
   
   try {
     // 优先正常验证（未过期）
     const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret_key');
     
     // 通过仓储验证用户是否仍然存在于数据库中，并获取最新的用户信息
     const user = await UsersRepo.findById(decoded.userId);
     if (!user || user.username !== decoded.username) {
       return res.status(401).json({ message: '用户不存在' });
     }
     
     const userInfo = {
       userId: user.id,
       username: user.username,
       name: user.name,
       role: user.role,
       groupId: user.group_id || null
     };
     
     const newToken = jwt.sign(userInfo, process.env.JWT_SECRET || 'your_jwt_secret_key', {
       expiresIn: '1h',
       encoding: 'utf8'
     });
     
     res.json({ token: newToken });
   } catch (error) {
     // 如果是过期错误，忽略过期时间但验证签名，允许续期
     if (error && error.name === 'TokenExpiredError') {
       try {
         const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret_key', { ignoreExpiration: true });
         const user = await UsersRepo.findById(decoded.userId);
         if (!user || user.username !== decoded.username) {
           return res.status(401).json({ message: '用户不存在' });
         }
         const userInfo = {
           userId: user.id,
           username: user.username,
           name: user.name,
           role: user.role,
           groupId: user.group_id || null
         };
         const newToken = jwt.sign(userInfo, process.env.JWT_SECRET || 'your_jwt_secret_key', {
           expiresIn: '1h',
           encoding: 'utf8'
         });
         return res.json({ token: newToken });
       } catch (e2) {
         console.error('过期token续期失败:', e2);
         return res.status(401).json({ message: 'token无效或已过期' });
       }
     }
     console.error('token刷新失败:', error);
     return res.status(401).json({ message: 'token无效或已过期' });
   }
 });



// 获取所有用户组API
app.get('/groups', authenticateToken, async (req, res) => {
  try {
    const groups = await GroupsRepo.findAll();
    res.json({ groups });
  } catch (error) {
    console.error('获取用户组列表失败:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 根据ID获取单个用户组API
app.get('/groups/:id', authenticateToken, async (req, res) => {
  const groupId = req.params.id;
  try {
    const group = await GroupsRepo.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: '用户组不存在' });
    }
    res.json({ group });
  } catch (error) {
    console.error('获取用户组失败:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 更新用户组API
app.put('/groups/:id', authenticateToken, async (req, res) => {
  // 检查当前用户是否为管理员
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: '权限不足，只有管理员可以执行此操作' });
  }
  
  const { id } = req.params;
  const { name, description, leaders } = req.body;
  
  const patch = {};
  if (name !== undefined) patch.name = name;
  if (description !== undefined) patch.description = description;
  if (leaders !== undefined) patch.leaders = leaders;
  
  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ message: '至少需要提供一个要更新的字段' });
  }
  
  try {
    const result = await GroupsRepo.update(id, patch);
    if ((result.affectedRows !== undefined && result.affectedRows === 0) || 
        (result.matchedCount !== undefined && result.matchedCount === 0)) {
      return res.status(404).json({ message: '未找到指定的用户组' });
    }
    res.json({ message: '用户组更新成功' });
  } catch (error) {
    console.error('更新用户组失败:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 删除用户组API
app.delete('/groups/:id', authenticateToken, async (req, res) => {
  // 检查当前用户是否为管理员
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: '权限不足，只有管理员可以执行此操作' });
  }
  
  const { id } = req.params;
  
  try {
    const result = await GroupsRepo.remove(id);
    if ((result.affectedRows !== undefined && result.affectedRows === 0) || 
        (result.deletedCount !== undefined && result.deletedCount === 0)) {
      return res.status(404).json({ message: '未找到指定的用户组' });
    }

    // 使用仓储清理该组的所有成员关系（MySQL 与 Mongo 双写由仓储负责）
    try {
      const members = await MembershipRepo.getGroupMembers(id);
      // 移除成员关系
      await Promise.allSettled((members || []).map(m => 
        MembershipRepo.removeUserFromGroup(m.id, id)
      ));
      // 兼容旧字段：将这些用户的 users.group_id 置空（如果存在该字段）
      await Promise.allSettled((members || []).map(m => 
        UsersRepo.update(m.id, { group_id: null })
      ));
    } catch (cleanupErr) {
      console.warn('清理用户组成员关系时出现问题（已继续删除组）:', cleanupErr);
    }

    res.json({ message: '用户组删除成功' });
  } catch (error) {
    console.error('删除用户组失败:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 创建用户组API
app.post('/groups', authenticateToken, async (req, res) => {
  // 检查当前用户是否为管理员
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: '权限不足，只有管理员可以执行此操作' });
  }
  
  const { name, description, leaders } = req.body;
  
  // 验证必填字段
  if (!name) {
    return res.status(400).json({ message: '用户组名称是必填项' });
  }
  
  try {
    const result = await GroupsRepo.create({ name, description: description || '', leaders });
    res.status(201).json({ message: '用户组创建成功', groupId: result.insertId || result.mongoId });
  } catch (error) {
    console.error('创建用户组失败:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 获取所有用户API
app.get('/users', authenticateToken, async (req, res) => {
  try {
    const users = await UsersRepo.findAll();

    // 使用仓储层查询用户组（优先 Mongo，回落 MySQL），统一错误容错
    const usersWithGroups = await Promise.all(users.map(async (user) => {
      try {
        const groups = await MembershipRepo.getUserGroups(user.id);
        user.groups = groups || [];
      } catch (err) {
        console.warn('查询用户组失败（已用空数组回退）:', err?.message || err);
        user.groups = [];
      }
      return user;
    }));

    res.json({ users: usersWithGroups });
  } catch (error) {
    console.error('获取用户列表失败:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 获取当前登录用户所属的所有用户组
app.get('/user/groups', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const groups = await MembershipRepo.getUserGroups(userId);
    res.json({ groups });
  } catch (err) {
    console.error('获取当前用户的用户组失败:', err);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 更新用户API
app.put('/users/:id', authenticateToken, async (req, res) => {
  // 检查当前用户是否为管理员
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: '权限不足，只有管理员可以执行此操作' });
  }
  
  const { id } = req.params;
  const { username, name, role, groupIds, password } = req.body;
  
  try {
    // 构建更新数据
    const updateData = {};
    
    if (username !== undefined) {
      updateData.username = username;
    }
    if (name !== undefined) {
      updateData.name = name;
    }
    if (role !== undefined) {
      // 验证角色值
      if (role !== 'user' && role !== 'admin') {
        return res.status(400).json({ message: '角色值无效，必须是user或admin' });
      }
      updateData.role = role;
    }
    if (password !== undefined && password.trim() !== '') {
      updateData.password = bcrypt.hashSync(password, 8);
    }
    
    // 如果没有提供任何更新字段
    if (Object.keys(updateData).length === 0 && groupIds === undefined) {
      return res.status(400).json({ message: '至少需要提供一个要更新的字段' });
    }
    
    // 更新用户信息（双写）
    if (Object.keys(updateData).length > 0) {
      const result = await UsersRepo.update(id, updateData);
      if (result.affectedRows === 0 && result.matchedCount === 0) {
        return res.status(404).json({ message: '未找到指定的用户' });
      }
    }
    
    // 如果提供了groupIds，更新用户组关系
    if (groupIds !== undefined) {
      try {
        await MembershipRepo.replaceUserGroups(id, groupIds);
        res.json({ message: '用户更新成功' });
      } catch (err) {
        console.error('更新用户组关系失败:', err);
        return res.status(500).json({ message: '用户信息更新成功，但用户组关系更新失败' });
      }
    } else {
      res.json({ message: '用户更新成功' });
    }
  } catch (err) {
    console.error('更新用户失败:', err);
    return res.status(500).json({ message: '服务器内部错误' });
  }
});

// 删除用户API
app.delete('/users/:id', authenticateToken, async (req, res) => {
  // 检查当前用户是否为管理员
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: '权限不足，只有管理员可以执行此操作' });
  }
  
  const { id } = req.params;
  
  // 防止用户删除自己
  if (parseInt(id) === req.user.userId) {
    return res.status(400).json({ message: '不能删除当前登录的用户' });
  }

  // 使用仓储：在删除用户前，从所有任务的 Belonging_users 中移除该用户
  try {
    let groupIds = [];
    try {
      const groups = await MembershipRepo.getUserGroups(id);
      groupIds = (groups || []).map(g => parseInt(g.id)).filter(n => !isNaN(n));
    } catch (e) {
      console.warn('获取用户组失败（继续移除任务中的用户，仅根据用户ID处理）:', e?.message || e);
    }

    const targetUser = { userId: parseInt(id), groupIds };
    let todos = [];
    try {
      todos = await TodosRepo.findAllForUser(targetUser);
    } catch (e) {
      console.warn('查询用户关联的任务失败（跳过任务清理）:', e?.message || e);
    }

    if (Array.isArray(todos) && todos.length > 0) {
      const uid = parseInt(id);
      await Promise.allSettled(todos.map(t => {
        const arr = Array.isArray(t.Belonging_users)
          ? t.Belonging_users
          : (typeof t.Belonging_users === 'string' && t.Belonging_users
              ? t.Belonging_users.split(',').map(x => parseInt(x.trim())).filter(x => !isNaN(x))
              : []);
        const filtered = arr.filter(x => x !== uid);
        if (filtered.length === arr.length) return Promise.resolve();
        return TodosRepo.update(t.id, { Belonging_users: filtered });
      }));
    }
  } catch (err) {
    console.warn('清理任务中的用户引用时发生非致命错误，将继续删除用户:', err?.message || err);
  }
  
  try {
    const result = await UsersRepo.remove(id);
    if ((result.affectedRows !== undefined && result.affectedRows === 0) ||
        (result.deletedCount !== undefined && result.deletedCount === 0)) {
      return res.status(404).json({ message: '未找到指定的用户' });
    }
    res.json({ message: '用户删除成功' });
  } catch (e) {
    console.error('删除用户失败:', e);
    return res.status(500).json({ message: '服务器内部错误' });
  }
});

// 认证中间件（使用仓储层）
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ message: '未提供token' });

  try {
    const decodedUser = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret_key');

    // 验证用户是否存在
    const user = await UsersRepo.findById(decodedUser.userId);
    if (!user || user.username !== decodedUser.username) {
      return res.status(401).json({ message: '用户不存在' });
    }

    // 获取用户的所有用户组
    let groups = [];
    try {
      groups = await MembershipRepo.getUserGroups(user.id);
    } catch (err) {
      console.warn('获取用户组信息失败（已用空数组回退）:', err?.message || err);
      groups = [];
    }

    req.user = {
      userId: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      groups,
      groupIds: (groups || []).map(g => parseInt(g.id)).filter(n => !isNaN(n))
    };

    // 确保响应头设置正确的字符集
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return next();
  } catch (err) {
    console.error('鉴权失败:', err);
    const isJwtError = err?.name === 'JsonWebTokenError' || err?.name === 'TokenExpiredError';
    return res.status(isJwtError ? 403 : 500).json({ message: isJwtError ? 'token无效或已过期' : '服务器内部错误' });
  }
}

// 统一 ID 比较，兼容数字与字符串（如 Mongo ObjectId 字符串）
function idsEqual(a, b) {
  if (a == null || b == null) return false;
  return String(a) === String(b);
}

// 检查用户是否有权限编辑或删除待办事项（使用仓储层）
async function checkTodoPermission(req, res, next) {
  const { id } = req.params;
  const userId = req.user.userId;

  try {
    const todo = await TodosRepo.findById(id);
    if (!todo) {
      return res.status(404).json({ message: '未找到指定的待办事项' });
    }

    // 创建者或管理员直接放行
    if (idsEqual(userId, todo.creator_id) || idsEqual(userId, todo.administrator_id)) {
      return next();
    }

    // 系统管理员放行
    if (req.user.role === 'admin') {
      return next();
    }

    // 处理关联组校验
    let todoGroupIds = [];
    if (Array.isArray(todo.Belonging_groups)) {
      todoGroupIds = todo.Belonging_groups.map(x => parseInt(x)).filter(x => !isNaN(x));
    } else if (typeof todo.Belonging_groups === 'string' && todo.Belonging_groups) {
      todoGroupIds = todo.Belonging_groups.split(',').map(x => parseInt(x.trim())).filter(x => !isNaN(x));
    }

    const userGroupIds = req.user.groupIds || [];
    const hasGroupAccess = todoGroupIds.some(gid => userGroupIds.includes(gid));

    if (!hasGroupAccess) {
      return res.status(403).json({ message: '您没有权限执行此操作' });
    }

    // 如果属于关联组，则进一步检查是否为该组组长
    try {
      const groups = await Promise.all(todoGroupIds.map(gid => GroupsRepo.findById(gid)));
      for (const g of groups) {
        if (!g) continue;
        const leaders = Array.isArray(g.leaders)
          ? g.leaders.map(x => parseInt(x)).filter(x => !isNaN(x))
          : (g.leaders ? g.leaders.split(',').map(x => parseInt(x.trim())).filter(x => !isNaN(x)) : []);
        if (leaders.includes(userId)) {
          return next();
        }
      }
      return res.status(403).json({ message: '只有用户组组长才能执行此操作' });
    } catch (err) {
      console.error('查询用户组失败:', err);
      return res.status(500).json({ message: '服务器内部错误' });
    }
  } catch (err) {
    console.error('查询待办事项权限失败:', err);
    return res.status(500).json({ message: '服务器内部错误' });
  }
}


// 创建待办事项API
app.post('/todos', authenticateToken, async (req, res) => {
  const { name, description, deadline, Priority, Belonging_users, Belonging_groups } = req.body;
  
  // 验证必要字段
  if (!name) {
    return res.status(400).json({ message: '待办事项标题是必需的' });
  }
  
  try {
    const result = await TodosRepo.create({ name, description, deadline, Priority, Status: req.body.Status, Belonging_users, Belonging_groups }, req.user.userId);
    res.status(201).json({ 
      message: '待办事项创建成功',
      todoId: result.insertId || result.mongoId
    });
  } catch (error) {
    console.error('创建待办事项失败:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 获取所有待办事项API
app.get('/todos', authenticateToken, async (req, res) => {
  try {
    const todos = await TodosRepo.findAllForUser(req.user);
    res.json({ todos });
  } catch (error) {
    console.error('获取待办事项失败:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 根据ID获取单个待办事项API
app.get('/todos/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  
  try {
    const todo = await TodosRepo.findById(id);
    
    if (!todo) {
      return res.status(404).json({ message: '未找到指定的待办事项' });
    }
    
    // 管理员可直接查看
    if (req.user && req.user.role === 'admin') {
      return res.json({ todo });
    }
    
    // 使用统一的 idsEqual 来兼容数字/字符串 ID
    const userId = req.user.userId;
    const userGroupIds = req.user.groupIds || [];
    const canView = idsEqual(todo.creator_id, userId)
          || idsEqual(todo.administrator_id, userId)
          || (Array.isArray(todo.Belonging_users) && todo.Belonging_users.some(u => idsEqual(u, userId)))
          || (Array.isArray(todo.Belonging_groups) && userGroupIds.length > 0 && todo.Belonging_groups.some(gid => userGroupIds.includes(parseInt(gid))));

    if (!canView) {
      return res.status(403).json({ message: '您没有权限查看此待办事项' });
    }
    
    res.json({ todo });
  } catch (error) {
    console.error('获取待办事项详情失败:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 更新待办事项API
app.put('/todos/:id', authenticateToken, checkTodoPermission, async (req, res) => {
  const { id } = req.params;
  const { name, description, deadline, Priority, Status, Belonging_users, Belonging_groups } = req.body;
  
  try {
    const result = await TodosRepo.update(id, { name, description, deadline, Priority, Status, Belonging_users, Belonging_groups });
    
    if (result.affectedRows === 0 && result.modifiedCount === 0) {
      return res.status(404).json({ message: '未找到指定的待办事项' });
    }
    
    res.json({ message: '待办事项更新成功' });
  } catch (error) {
    console.error('更新待办事项失败:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 删除待办事项API
app.delete('/todos/:id', authenticateToken, checkTodoPermission, async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await TodosRepo.remove(id);
    
    if (result.affectedRows === 0 && result.deletedCount === 0) {
      return res.status(404).json({ message: '未找到指定的待办事项' });
    }
    
    // 同步删除相关的详情文件
    const detailPath = getTodoDetailPath(id);
    if (fs.existsSync(detailPath)) {
      fs.unlink(detailPath, (unlinkErr) => {
        if (unlinkErr) {
          console.error('删除任务详情文件失败:', unlinkErr);
        }
      });
    }
    
    res.json({ message: '待办事项删除成功' });
  } catch (error) {
    console.error('删除待办事项失败:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 启动服务器函数
function startServer() {
  app.listen(PORT, () => {
    console.log(`服务器运行在端口 ${PORT}`);
  });
}

// 获取任务详情存储路径
function getTodoDetailPath(todoId) {
  const todoDetailsDir = path.join(__dirname, 'todo-details');
  return path.join(todoDetailsDir, `todo-${todoId}.json`);
}

// 查询是否存在Todo详情 API
app.get('/todo-details/:id/exists', authenticateToken, (req, res) => {
  const { id } = req.params;
  const detailPath = getTodoDetailPath(id);
  
  const exists = fs.existsSync(detailPath);
  res.json({ exists });
});

// 存储Todo详情 API
app.post('/todo-details/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { detail } = req.body;
  
  const detailPath = getTodoDetailPath(id);
  
  const detailData = {
    todoId: id,
    detail: detail,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  // 写入文件
  fs.writeFile(detailPath, JSON.stringify(detailData, null, 2), 'utf8', (err) => {
    if (err) {
      console.error('存储任务详情失败:', err);
      return res.status(500).json({ message: '存储任务详情失败' });
    }
    
    res.json({ message: '任务详情存储成功' });
  });
});

// 获取Todo详情 API
app.get('/todo-details/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const detailPath = getTodoDetailPath(id);
  
  if (!fs.existsSync(detailPath)) {
    return res.status(404).json({ message: '任务详情不存在' });
  }
  
  // 读取文件
  fs.readFile(detailPath, 'utf8', (err, data) => {
    if (err) {
      console.error('读取任务详情失败:', err);
      return res.status(500).json({ message: '读取任务详情失败' });
    }
    
    try {
      const detailData = JSON.parse(data);
      res.json({ detail: detailData.detail });
    } catch (parseErr) {
      console.error('解析任务详情失败:', parseErr);
      return res.status(500).json({ message: '解析任务详情失败' });
    }
  });
});

// 删除Todo详情 API
app.delete('/todo-details/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const detailPath = getTodoDetailPath(id);
  
  // 检查文件是否存在
  if (!fs.existsSync(detailPath)) {
    return res.status(404).json({ message: '任务详情不存在' });
  }
  
  // 删除文件
  fs.unlink(detailPath, (err) => {
    if (err) {
      console.error('删除任务详情失败:', err);
      return res.status(500).json({ message: '删除任务详情失败' });
    }
    
    res.json({ message: '任务详情删除成功' });
  });
});

// 读取与保存订阅到文件
function loadSubscriptions() {
  try { return JSON.parse(fs.readFileSync(subscriptionsFile, 'utf-8')); } catch { return []; }
}
function saveSubscriptions(list) {
  try { fs.writeFileSync(subscriptionsFile, JSON.stringify(list, null, 2), 'utf-8'); } catch (e) { console.error('保存订阅失败', e); }
}

// 设置 VAPID
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT) {
  webPush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
}
// 暴露 VAPID 公钥（前端订阅需要）
app.get('/push/publicKey', (req, res) => {
  res.json({ key: process.env.VAPID_PUBLIC_KEY || '' });
});

// 保存推送订阅（需要登录）
app.post('/push/subscribe', authenticateToken, (req, res) => {
  const sub = req.body;
  if (!sub || !sub.endpoint) return res.status(400).json({ message: '无效的订阅对象' });
  const list = loadSubscriptions();
  const exists = list.find((s) => s.endpoint === sub.endpoint);
  if (!exists) {
    list.push(sub);
    saveSubscriptions(list);
  }
  res.json({ success: true });
});

// 管理员触发测试推送
app.post('/push/test', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: '权限不足' });
  const list = loadSubscriptions();
  const payload = JSON.stringify({ title: 'Todos 通知', body: '这是一条测试推送', data: { url: '/home' } });
  const results = [];
  for (const sub of list) {
    try {
      await webPush.sendNotification(sub, payload);
      results.push({ endpoint: sub.endpoint, ok: true });
    } catch (e) {
      console.error('推送失败', e?.statusCode, e?.body);
      results.push({ endpoint: sub.endpoint, ok: false });
    }
  }
  res.json({ sent: results.length, results });
});