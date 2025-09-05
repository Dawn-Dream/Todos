const express = require('express');

const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const webPush = require('web-push');
const subscriptionsFile = path.join(__dirname, 'push-subscriptions.json');

// 引入MongoDB数据库模块
const { initializeConnection, testConnection } = require('./database/mongodb-connection');
const { GroupsRepo, UsersRepo, MembershipRepo, TodosRepo } = require('./database/mongodb-repository');

const app = express();
const PORT = process.env.PORT || 3000;

// 数据库操作已完全迁移至 MongoDB，使用仓库模式进行数据访问

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
  // 检查当前用户是否为管理员
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: '权限不足，只有管理员可以执行此操作' });
  }
  
  const { userId, groupId } = req.params;
  
  try {
    // 检查用户和用户组是否存在
    const user = await UsersRepo.findById(parseInt(userId));
    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }
    
    const group = await GroupsRepo.findById(parseInt(groupId));
    if (!group) {
      return res.status(404).json({ message: '用户组不存在' });
    }
    
    // 添加用户到用户组
    await MembershipRepo.addUserToGroup(parseInt(userId), parseInt(groupId));
    
    res.json({ message: '用户已成功添加到用户组' });
  } catch (error) {
    console.error('添加用户到用户组失败:', error);
    return res.status(500).json({ message: '服务器内部错误' });
  }
});

// 从用户组中移除用户API
app.delete('/users/:userId/groups/:groupId', authenticateToken, async (req, res) => {
  // 检查当前用户是否为管理员
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: '权限不足，只有管理员可以执行此操作' });
  }
  
  const { userId, groupId } = req.params;
  
  try {
    const result = await MembershipRepo.removeUserFromGroup(parseInt(userId), parseInt(groupId));
    
    if (!result) {
      return res.status(404).json({ message: '用户不在该用户组中' });
    }
    
    res.json({ message: '用户已从用户组中移除' });
  } catch (error) {
    console.error('从用户组中移除用户失败:', error);
    return res.status(500).json({ message: '服务器内部错误' });
  }
});

// 获取用户组成员API
app.get('/groups/:groupId/members', authenticateToken, async (req, res) => {
  const { groupId } = req.params;
  
  try {
    const members = await MembershipRepo.getGroupMembers(parseInt(groupId));
    res.json({ members });
  } catch (error) {
    console.error('获取用户组成员失败:', error);
    return res.status(500).json({ message: '服务器内部错误' });
  }
});

// 移除旧的 dbInit 和 initializeDatabase 实现，改为模块化启动
async function bootstrap() {
  try {
    // 初始化MongoDB连接
    await initializeConnection();
    console.log('MongoDB连接初始化完成');
    
    // 测试数据库连接
    const isConnected = await testConnection();
    if (!isConnected) {
      throw new Error('MongoDB连接测试失败');
    }
    console.log('MongoDB连接测试通过');
    
    // 初始化默认用户
    await initializeDefaultUsers();
    
    // 启动服务器
    startServer();
  } catch (error) {
    console.error('应用启动失败:', error);
    process.exit(1);
  }
}

// 调用新的启动流程
bootstrap();

// 更新用户组成员关系函数（已迁移至 MembershipRepo.updateUserGroups）
// 此函数已废弃，请使用 MembershipRepo.updateUserGroups(userId, groupIds)
function updateUserGroupMemberships(userId, groupIds, callback) {
  // 使用新的 MongoDB 仓库方法
  MembershipRepo.updateUserGroups(userId, groupIds)
    .then(() => callback(null))
    .catch(err => callback(err));
}

// MySQL 连接已完全迁移至 MongoDB
// 所有数据库操作现在通过 MongoDB 仓库模式进行


// 初始化默认用户
async function initializeDefaultUsers() {
  try {
    // 检查是否已存在默认用户，如果不存在则创建
    const existingAdmin = await UsersRepo.findByUsername('admin');
    
    if (!existingAdmin) {
      // 创建默认管理员用户
      const defaultPassword = 'admin123';
      const hashedPassword = await bcrypt.hash(defaultPassword, 10);
      await UsersRepo.create({
        username: 'admin',
        name: '管理员',
        password: hashedPassword,
        role: 'admin'
      });
      console.log('默认管理员用户创建成功，用户名: admin，展示名: 管理员，密码: admin123');
    } else {
      console.log('默认管理员用户已存在');
    }
    
    // 创建用于存储任务详情的目录
    const todoDetailsDir = path.join(__dirname, 'todo-details');
    if (!fs.existsSync(todoDetailsDir)) {
      fs.mkdirSync(todoDetailsDir, { recursive: true });
      console.log('任务详情存储目录已创建');
    }
  } catch (error) {
    console.error('初始化默认用户失败:', error);
  }
}

// 注册API
app.post('/register', async (req, res) => {
  try {
    const { username, name, password, role, groupId } = req.body;
    
    if (!username || !name || !password) {
      return res.status(400).json({ message: '用户名、展示名和密码是必需的' });
    }
    
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
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // 设置默认角色
    const userRole = role || 'user';
    
    // 创建新用户
    const newUser = await UsersRepo.create({
      username,
      name,
      password: hashedPassword,
      role: userRole,
      group_id: groupId || null
    });
    
    // 如果指定了用户组，添加到用户组成员关系表
    if (groupId) {
      try {
        await MembershipRepo.addUserToGroup(newUser.id, groupId);
      } catch (err) {
        console.error('更新用户组成员关系失败:', err);
        // 这里不返回错误，因为用户已经创建成功
      }
    }
    
    res.status(201).json({ message: '注册成功' });
  } catch (error) {
    console.error('用户注册失败:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 登录API
app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ message: '用户名和密码是必需的' });
    }
    
    // 查询用户
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
    console.error('用户登录失败:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 刷新token API
app.post('/refresh-token', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ message: '未提供token' });
  }
  
  try {
    // 验证token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret_key');
    
    // 验证用户是否仍然存在于数据库中，并获取最新的用户信息
    const user = await UsersRepo.findById(decoded.userId);
    
    if (!user || user.username !== decoded.username) {
      return res.status(401).json({ message: '用户不存在' });
    }
    
    // 确保用户信息中的中文字符正确编码
    const userInfo = {
      userId: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      groupId: user.group_id || null
    };
    
    // 生成新token
    const newToken = jwt.sign(userInfo, process.env.JWT_SECRET || 'your_jwt_secret_key', {
      expiresIn: '1h',
      encoding: 'utf8'
    });
    
    res.json({ token: newToken });
  } catch (error) {
    console.error('token刷新失败:', error);
    res.status(401).json({ message: 'token无效或已过期' });
  }
});

// 获取所有用户组API
app.get('/groups', authenticateToken, async (req, res) => {
  try {
    const groups = await GroupsRepo.findAll();
    res.json({ groups });
  } catch (error) {
    console.error('获取用户组失败:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 根据ID获取单个用户组API
app.get('/groups/:id', authenticateToken, async (req, res) => {
  try {
    const groupId = req.params.id;
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
  
  try {
    const { id } = req.params;
    const { name, description, leaders } = req.body;
    
    // 构建更新数据
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (leaders !== undefined) updateData.leaders = leaders;
    
    // 如果没有提供任何更新字段
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: '至少需要提供一个要更新的字段' });
    }
    
    const result = await GroupsRepo.update(id, updateData);
    
    if (!result) {
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
  
  try {
    const { id } = req.params;
    
    const result = await GroupsRepo.delete(id);
    
    if (!result) {
      return res.status(404).json({ message: '未找到指定的用户组' });
    }
    
    // 同时删除用户组成员关系
    try {
      await MembershipRepo.removeAllFromGroup(id);
    } catch (membershipErr) {
      console.error('删除用户组成员关系失败:', membershipErr);
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
  
  try {
    const { name, description, leaders } = req.body;
    
    // 验证必填字段
    if (!name) {
      return res.status(400).json({ message: '用户组名称是必填项' });
    }
    
    // 创建新用户组
    const newGroup = await GroupsRepo.create({
      name,
      description: description || '',
      leaders: leaders || []
    });
    
    res.status(201).json({ message: '用户组创建成功', groupId: newGroup.id });
  } catch (error) {
    console.error('创建用户组失败:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 获取所有用户API
app.get('/users', authenticateToken, async (req, res) => {
  // 检查当前用户是否为管理员
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: '权限不足，只有管理员可以查看用户列表' });
  }
  
  try {
    const users = await UsersRepo.findAll();
    
    // 获取每个用户的用户组信息
    const usersWithGroups = await Promise.all(
      users.map(async (user) => {
        try {
          const groups = await MembershipRepo.getUserGroups(user.id);
          return { ...user, groups };
        } catch (error) {
          console.error('获取用户组信息失败:', error);
          return { ...user, groups: [] };
        }
      })
    );
    
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
  } catch (error) {
    console.error('获取用户组失败:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 更新用户API
app.put('/users/:id', authenticateToken, async (req, res) => {
  try {
    // 检查当前用户是否为管理员
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: '权限不足，只有管理员可以执行此操作' });
    }
    
    const { id } = req.params;
    const { username, name, role, groupIds, password } = req.body;
    
    // 防止用户修改自己的角色
    if (parseInt(id) === req.user.userId && role && role !== req.user.role) {
      return res.status(400).json({ message: '不能修改自己的角色' });
    }
    
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
      const hashedPassword = await bcrypt.hash(password, 10);
      updateData.password = hashedPassword;
    }
    
    // 如果没有提供任何更新字段
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: '至少需要提供一个要更新的字段' });
    }
    
    // 更新用户信息
    const result = await UsersRepo.update(parseInt(id), updateData);
    
    if (!result) {
      return res.status(404).json({ message: '未找到指定的用户' });
    }
    
    // 如果提供了groupIds，更新用户组关系
    if (groupIds !== undefined) {
      try {
        await MembershipRepo.replaceUserGroups(parseInt(id), groupIds);
        res.json({ message: '用户更新成功' });
      } catch (error) {
        console.error('更新用户组关系失败:', error);
        res.status(500).json({ message: '用户信息更新成功，但用户组关系更新失败' });
      }
    } else {
      res.json({ message: '用户更新成功' });
    }
  } catch (error) {
    console.error('更新用户失败:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 删除用户API
app.delete('/users/:id', authenticateToken, async (req, res) => {
  try {
    // 检查当前用户是否为管理员
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: '权限不足，只有管理员可以执行此操作' });
    }
    
    const { id } = req.params;
    
    // 防止用户删除自己
    if (parseInt(id) === req.user.userId) {
      return res.status(400).json({ message: '不能删除当前登录的用户' });
    }
    
    // 从所有关联的任务中移除该用户
    await TodosRepo.removeUserFromAllTodos(parseInt(id));
    
    // 删除用户
    const result = await UsersRepo.deleteById(parseInt(id));
    
    if (!result) {
      return res.status(404).json({ message: '未找到指定的用户' });
    }
    
    res.json({ message: '用户删除成功' });
  } catch (error) {
    console.error('删除用户失败:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 认证中间件
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (token == null) return res.status(401).json({ message: '未提供token' });
  
  jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret_key', async (err, decodedUser) => {
    if (err) return res.status(403).json({ message: 'token无效或已过期' });
    
    try {
      // 验证用户是否仍然存在于数据库中
      const user = await UsersRepo.findById(decodedUser.userId);
      
      if (!user || user.username !== decodedUser.username) {
        return res.status(401).json({ message: '用户不存在' });
      }
      
      // 获取用户的所有用户组
      const userGroups = await MembershipRepo.getUserGroups(user.id);
      
      req.user = {
        userId: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        groups: userGroups,
        groupIds: userGroups.map(g => g.id)
      };
      
      // 确保响应头设置正确的字符集
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      next();
    } catch (error) {
      console.error('数据库查询错误:', error);
      return res.status(500).json({ message: '服务器内部错误' });
    }
  });
}

// 检查用户是否有权限编辑或删除待办事项
async function checkTodoPermission(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    
    // 查询待办事项的创建者和管理员
    const todo = await TodosRepo.findById(parseInt(id));
    
    if (!todo) {
      return res.status(404).json({ message: '未找到指定的待办事项' });
    }
    
    // 检查是否是创建者或管理员
    if (userId === todo.creator_id || userId === todo.administrator_id) {
      return next();
    }
    
    // 检查是否是系统管理员
    const user = await UsersRepo.findById(userId);
    if (user && user.role === 'admin') {
      return next();
    }
    
    // 检查是否是关联用户组的组长或成员
    if (todo.Belonging_groups) {
      const todoGroupIds = todo.Belonging_groups.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
      const userGroupIds = req.user.groupIds || [];
      
      // 检查用户是否属于任何关联的用户组
      const hasGroupAccess = todoGroupIds.some(groupId => userGroupIds.includes(groupId));
      
      if (hasGroupAccess) {
        // 如果用户属于关联组，还需要检查是否是组长
        const groups = await GroupsRepo.findByIds(todoGroupIds);
        
        // 检查用户是否是任何关联组的组长
        for (const group of groups) {
          if (userGroupIds.includes(group.id) && group.leaders) {
            const leaders = Array.isArray(group.leaders) ? group.leaders : JSON.parse(group.leaders || '[]');
            if (Array.isArray(leaders) && leaders.includes(userId)) {
              return next();
            }
          }
        }
        
        // 如果是组成员但不是组长，则拒绝访问（只有组长可以编辑/删除）
        return res.status(403).json({ message: '只有用户组组长才能执行此操作' });
      } else {
        // 如果用户不属于任何关联组，则拒绝访问
        return res.status(403).json({ message: '您没有权限执行此操作' });
      }
    } else {
      // 如果没有关联组且不是创建者或管理员，则拒绝访问
      return res.status(403).json({ message: '您没有权限执行此操作' });
    }
  } catch (error) {
    console.error('查询待办事项权限失败:', error);
    return res.status(500).json({ message: '服务器内部错误' });
  }
}


// 创建待办事项API
app.post('/todos', authenticateToken, async (req, res) => {
  try {
    const { name, description, deadline, Priority, Belonging_users, Belonging_groups } = req.body;
    
    // 验证必要字段
    if (!name) {
      return res.status(400).json({ message: '待办事项标题是必需的' });
    }
    
    // 设置默认值
    // 确保优先级和状态值被正确处理
    // 将前端传来的字符串优先级映射为数据库中的整数值
    const priorityMap = {
      '紧急': 3,
      '重要': 2,
      '普通': 1,
      '低': 0
    };
    const priority = Priority !== undefined ? (priorityMap[Priority] !== undefined ? priorityMap[Priority] : 0) : 0;
    const Status = req.body.Status !== undefined ? req.body.Status : -1; // 默认状态为"计划中"
    
    // 处理Belonging_users和Belonging_groups为ID数组，MongoDB期望数组格式
    const belongingUsers = Array.isArray(Belonging_users) ? Belonging_users.map(id => parseInt(id)).filter(id => !isNaN(id)) : 
                          (typeof Belonging_users === 'string' ? Belonging_users.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)) : []);
    const belongingGroups = Array.isArray(Belonging_groups) ? Belonging_groups.map(id => parseInt(id)).filter(id => !isNaN(id)) : 
                           (typeof Belonging_groups === 'string' ? Belonging_groups.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)) : []);
    
    // 处理Deadline字段，确保格式正确
    let formattedDeadline = deadline;
    if (deadline) {
      // 如果只提供了日期，添加默认时间
      if (deadline.match(/^\d{4}-\d{2}-\d{2}$/)) {
        formattedDeadline = deadline + ' 00:00:00';
      }
    }
    
    // 创建新待办事项
    const todoData = {
      name,
      description,
      Deadline: formattedDeadline,
      Priority: priority,
      Status,
      Belonging_users: belongingUsers,
      Belonging_groups: belongingGroups,
      creator_id: req.user.userId
    };
    
    const result = await TodosRepo.create(todoData);
    
    res.status(201).json({ 
      message: '待办事项创建成功',
      todoId: result.id 
    });
  } catch (error) {
    console.error('创建待办事项失败:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 获取所有待办事项API
app.get('/todos', authenticateToken, async (req, res) => {
  try {
    // 获取所有待办事项
    const results = await TodosRepo.findAll();

    // 当前用户身份
    const userId = req.user.userId;
    const userGroupIds = req.user.groupIds || [];

    // 先解析字段，再根据用户/用户组进行服务端过滤，避免返回无权限数据
    const parsed = results.map(todo => ({
      ...todo,
      Status: Number(todo.Status),
      Priority: (() => {
        const priorityMap = { 3: '紧急', 2: '重要', 1: '普通', 0: '低' };
        return priorityMap[todo.Priority] || '普通';
      })(),
      Belonging_users: Array.isArray(todo.Belonging_users) ? todo.Belonging_users.map(id => parseInt(id)).filter(id => !isNaN(id)) : 
                      (todo.Belonging_users ? todo.Belonging_users.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)) : []),
      Belonging_groups: Array.isArray(todo.Belonging_groups) ? todo.Belonging_groups.map(id => parseInt(id)).filter(id => !isNaN(id)) : 
                       (todo.Belonging_groups ? todo.Belonging_groups.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)) : []),
      creator_id: todo.creator_id ? parseInt(todo.creator_id) : null,
      administrator_id: todo.administrator_id ? parseInt(todo.administrator_id) : null
    }));

    const todos = parsed.filter(todo => {
      if (todo.creator_id === userId || todo.administrator_id === userId) return true;
      if (Array.isArray(todo.Belonging_users) && todo.Belonging_users.includes(userId)) return true;
      if (Array.isArray(todo.Belonging_groups) && userGroupIds.length > 0 && todo.Belonging_groups.some(gid => userGroupIds.includes(gid))) return true;
      return false;
    });

    res.json({ todos });
  } catch (error) {
    console.error('获取待办事项失败:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 根据ID获取单个待办事项API
app.get('/todos/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const todo = await TodosRepo.findById(parseInt(id));
    
    if (!todo) {
      return res.status(404).json({ message: '未找到指定的待办事项' });
    }
    
    // 处理Belonging_users和Belonging_groups字段，兼容数组和字符串格式
    const processedTodo = {
      ...todo,
      Status: Number(todo.Status),
      Priority: (() => {
        const priorityMap = { 3: '紧急', 2: '重要', 1: '普通', 0: '低' };
        return priorityMap[todo.Priority] || '普通';
      })(),
      Belonging_users: Array.isArray(todo.Belonging_users) ? todo.Belonging_users.map(id => parseInt(id)).filter(id => !isNaN(id)) : 
                      (todo.Belonging_users ? todo.Belonging_users.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)) : []),
      Belonging_groups: Array.isArray(todo.Belonging_groups) ? todo.Belonging_groups.map(id => parseInt(id)).filter(id => !isNaN(id)) : 
                       (todo.Belonging_groups ? todo.Belonging_groups.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)) : []),
      creator_id: todo.creator_id ? parseInt(todo.creator_id) : null,
      administrator_id: todo.administrator_id ? parseInt(todo.administrator_id) : null
    };

    // 仅允许创建者、管理员、在Belonging_users中的用户，或属于Belonging_groups的成员查看
    const userId = req.user.userId;
    const userGroupIds = req.user.groupIds || [];
    const canView = (processedTodo.creator_id === userId)
      || (processedTodo.administrator_id === userId)
      || (Array.isArray(processedTodo.Belonging_users) && processedTodo.Belonging_users.includes(userId))
      || (Array.isArray(processedTodo.Belonging_groups) && userGroupIds.length > 0 && processedTodo.Belonging_groups.some(gid => userGroupIds.includes(gid)));

    if (!canView) {
      return res.status(403).json({ message: '您没有权限查看此待办事项' });
    }
    
    res.json({ todo: processedTodo });
  } catch (error) {
    console.error('获取待办事项详情失败:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 更新待办事项API
app.put('/todos/:id', authenticateToken, checkTodoPermission, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, deadline, Priority, Status, Belonging_users, Belonging_groups } = req.body;
    
    // 构建更新数据
    const updateData = {};
    
    if (name !== undefined) {
      updateData.name = name;
    }
    if (description !== undefined) {
      updateData.description = description;
    }
    if (deadline !== undefined) {
      // 处理Deadline字段，确保格式正确
      let formattedDeadline = deadline;
      if (deadline) {
        // 如果只提供了日期，添加默认时间
        if (deadline.match(/^\d{4}-\d{2}-\d{2}$/)) {
          formattedDeadline = deadline + ' 00:00:00';
        }
      }
      updateData.Deadline = formattedDeadline;
    }
    if (Priority !== undefined) {
      // 确保优先级值被正确处理
      // 将前端传来的字符串优先级映射为数据库中的整数值
      const priorityMap = {
        '紧急': 3,
        '重要': 2,
        '普通': 1,
        '低': 0
      };
      const priorityValue = priorityMap[Priority] !== undefined ? priorityMap[Priority] : 0;
      updateData.Priority = priorityValue;
    }
    if (Status !== undefined) {
      // 确保状态值被正确处理
      updateData.Status = Status;
    }
    if (Belonging_users !== undefined) {
      // 处理Belonging_users为ID数组，MongoDB期望数组格式
      const belongingUsers = Array.isArray(Belonging_users) ? Belonging_users.map(id => parseInt(id)).filter(id => !isNaN(id)) : 
                            (typeof Belonging_users === 'string' ? Belonging_users.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)) : []);
      updateData.Belonging_users = belongingUsers;
    }
    if (Belonging_groups !== undefined) {
      // 处理Belonging_groups为ID数组，MongoDB期望数组格式
      const belongingGroups = Array.isArray(Belonging_groups) ? Belonging_groups.map(id => parseInt(id)).filter(id => !isNaN(id)) : 
                             (typeof Belonging_groups === 'string' ? Belonging_groups.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)) : []);
      updateData.Belonging_groups = belongingGroups;
    }
    
    // 如果没有提供任何更新字段
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: '至少需要提供一个要更新的字段' });
    }
    
    const result = await TodosRepo.update(parseInt(id), updateData);
    
    if (!result) {
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
  try {
    const { id } = req.params;
    
    const result = await TodosRepo.delete(parseInt(id));
    
    if (!result) {
      return res.status(404).json({ message: '未找到指定的待办事项' });
    }
    
    // 同步删除相关的详情文件
    const detailPath = getTodoDetailPath(id);
    if (fs.existsSync(detailPath)) {
      fs.unlink(detailPath, (unlinkErr) => {
        if (unlinkErr) {
          console.error('删除任务详情文件失败:', unlinkErr);
          // 不返回错误给客户端，因为数据库记录已成功删除
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
  app.listen(PORT, '127.0.0.1', () => {
    console.log(`服务器运行在 http://127.0.0.1:${PORT}`);
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