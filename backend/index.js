const express = require('express');

const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// 引入新的数据库模块
const { initializeConnection, getConnection } = require('./database/connection');
const { runMigrations } = require('./database/migration');

const app = express();
const PORT = process.env.PORT || 3000;

let db;

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
app.post('/users/:userId/groups/:groupId', authenticateToken, (req, res) => {
  // 检查当前用户是否为管理员
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: '权限不足，只有管理员可以执行此操作' });
  }
  
  const { userId, groupId } = req.params;
  
  // 检查用户和用户组是否存在
  const checkUserQuery = 'SELECT id FROM users WHERE id = ?';
  const checkGroupQuery = 'SELECT id FROM `groups` WHERE id = ?';
  
  db.query(checkUserQuery, [userId], (err, userResults) => {
    if (err) {
      console.error('检查用户失败:', err);
      return res.status(500).json({ message: '服务器内部错误' });
    }
    
    if (userResults.length === 0) {
      return res.status(404).json({ message: '用户不存在' });
    }
    
    db.query(checkGroupQuery, [groupId], (err, groupResults) => {
      if (err) {
        console.error('检查用户组失败:', err);
        return res.status(500).json({ message: '服务器内部错误' });
      }
      
      if (groupResults.length === 0) {
        return res.status(404).json({ message: '用户组不存在' });
      }
      
      // 添加用户到用户组
      const insertQuery = 'INSERT IGNORE INTO user_group_memberships (user_id, group_id) VALUES (?, ?)';
      db.query(insertQuery, [userId, groupId], (err) => {
        if (err) {
          console.error('添加用户到用户组失败:', err);
          return res.status(500).json({ message: '服务器内部错误' });
        }
        
        res.json({ message: '用户已成功添加到用户组' });
      });
    });
  });
});

// 从用户组中移除用户API
app.delete('/users/:userId/groups/:groupId', authenticateToken, (req, res) => {
  // 检查当前用户是否为管理员
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: '权限不足，只有管理员可以执行此操作' });
  }
  
  const { userId, groupId } = req.params;
  
  const deleteQuery = 'DELETE FROM user_group_memberships WHERE user_id = ? AND group_id = ?';
  db.query(deleteQuery, [userId, groupId], (err, results) => {
    if (err) {
      console.error('从用户组中移除用户失败:', err);
      return res.status(500).json({ message: '服务器内部错误' });
    }
    
    if (results.affectedRows === 0) {
      return res.status(404).json({ message: '用户不在该用户组中' });
    }
    
    res.json({ message: '用户已从用户组中移除' });
  });
});

// 获取用户组成员API
app.get('/groups/:groupId/members', authenticateToken, (req, res) => {
  const { groupId } = req.params;
  
  const query = `
    SELECT u.id, u.username, u.name, u.role, ugm.joined_at
    FROM users u
    INNER JOIN user_group_memberships ugm ON u.id = ugm.user_id
    WHERE ugm.group_id = ?
    ORDER BY ugm.joined_at DESC
  `;
  
  db.query(query, [groupId], (err, results) => {
    if (err) {
      console.error('获取用户组成员失败:', err);
      return res.status(500).json({ message: '服务器内部错误' });
    }
    
    res.json({ members: results });
  });
});

// 移除旧的 dbInit 和 initializeDatabase 实现，改为模块化启动
async function bootstrap() {
  try {
    // 1) 初始化数据库连接并确保数据库存在
    await initializeConnection({ database: process.env.DB_NAME || 'todos_db' });
    db = getConnection();

    // 2) 执行迁移（DDL + 数据迁移），确保表结构和旧数据迁移完成
    await runMigrations();

    // 3) 初始化默认数据并启动服务器
    initializeDefaultUsers(db);
  } catch (err) {
    console.error('服务启动失败:', err);
    process.exit(1);
  }
}

// 调用新的启动流程
bootstrap();

// 更新用户组成员关系函数
function updateUserGroupMemberships(userId, groupIds, callback) {
  // 首先删除用户的所有现有组关系
  const deleteQuery = 'DELETE FROM user_group_memberships WHERE user_id = ?';
  
  db.query(deleteQuery, [userId], (err) => {
    if (err) {
      return callback(err);
    }
    
    // 如果groupIds为空数组或null，则只删除不添加
    if (!groupIds || groupIds.length === 0) {
      return callback(null);
    }
    
    // 为每个组ID创建新的关系记录
    const insertPromises = groupIds.map(groupId => {
      return new Promise((resolve, reject) => {
        const insertQuery = 'INSERT INTO user_group_memberships (user_id, group_id) VALUES (?, ?)';
        db.query(insertQuery, [userId, groupId], (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    });
    
    Promise.all(insertPromises)
      .then(() => callback(null))
      .catch(err => callback(err));
  });
}

// mysql2 连接已迁移至 ./database/connection 模块，不再直接在此引用
// 迁移逻辑已模块化至 ./database/migration.js


// 初始化默认用户
function initializeDefaultUsers(db) {
  // 检查是否已存在默认用户，如果不存在则创建
  const checkUserQuery = 'SELECT * FROM users WHERE username = ?';
  db.query(checkUserQuery, ['admin'], async (err, results) => {
    if (err) {
      console.error('检查默认用户失败:', err);
      return;
    }
    
    if (results.length === 0) {
      // 创建默认管理员用户
      const defaultPassword = 'admin123';
      const hashedPassword = await bcrypt.hash(defaultPassword, 10);
      const insertUserQuery = 'INSERT INTO users (username, name, password, role, group_id) VALUES (?, ?, ?, ?, ?)';
      db.query(insertUserQuery, ['admin', '管理员', hashedPassword, 'admin', null], (err, result) => {
        if (err) {
          console.error('创建默认用户失败:', err);
        } else {
          console.log('默认管理员用户创建成功，用户名: admin，展示名: 管理员，密码: admin123');
        }
      });
    } else {
      console.log('默认管理员用户已存在');
    }
    
    // 创建用于存储任务详情的目录
    const todoDetailsDir = path.join(__dirname, 'todo-details');
    if (!fs.existsSync(todoDetailsDir)) {
      fs.mkdirSync(todoDetailsDir, { recursive: true });
      console.log('任务详情存储目录已创建');
    }
    
    // 数据库初始化完成后启动服务器
    startServer();
  });
}

// 注册API
app.post('/register', (req, res) => {
  const { username, name, password, role, groupId } = req.body;
  
  if (!username || !name || !password) {
    return res.status(400).json({ message: '用户名、展示名和密码是必需的' });
  }
  
  // 检查用户名是否已存在
  const checkQuery = 'SELECT * FROM users WHERE username = ?';
  db.query(checkQuery, [username], (err, results) => {
    if (err) {
      console.error('数据库查询错误:', err);
      return res.status(500).json({ message: '服务器内部错误' });
    }
    
    if (results.length > 0) {
      return res.status(400).json({ message: '用户名已存在' });
    }
    
    // 检查用户组是否存在（如果提供了groupId）
    if (groupId) {
      const checkGroupQuery = 'SELECT * FROM `groups` WHERE id = ?';
      db.query(checkGroupQuery, [groupId], (err, groupResults) => {
        if (err) {
          console.error('数据库查询错误:', err);
          return res.status(500).json({ message: '服务器内部错误' });
        }
        
        if (groupResults.length === 0) {
          return res.status(400).json({ message: '指定的用户组不存在' });
        }
        
        // 密码哈希
        const hashedPassword = bcrypt.hashSync(password, 10);
        
        // 设置默认角色
        const userRole = role || 'user';
        
        // 插入新用户
        const insertQuery = 'INSERT INTO users (username, name, password, role, group_id) VALUES (?, ?, ?, ?, ?)';
        db.query(insertQuery, [username, name, hashedPassword, userRole, groupId], (err, results) => {
          if (err) {
            console.error('插入用户失败:', err);
            return res.status(500).json({ message: '服务器内部错误' });
          }
          
          res.status(201).json({ message: '注册成功' });
        });
      });
    } else {
      // 没有提供groupId，直接插入用户
      // 密码哈希
      const hashedPassword = bcrypt.hashSync(password, 10);
      
      // 设置默认角色
      const userRole = role || 'user';
      
      // 插入新用户
      const insertQuery = 'INSERT INTO users (username, name, password, role, group_id) VALUES (?, ?, ?, ?, ?)';
      db.query(insertQuery, [username, name, hashedPassword, userRole, null], (err, results) => {
        if (err) {
          console.error('插入用户失败:', err);
          return res.status(500).json({ message: '服务器内部错误' });
        }
        
        res.status(201).json({ message: '注册成功' });
      });
    }
  });
});

// 登录API
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ message: '用户名和密码是必需的' });
  }
  
  // 查询用户
  const query = 'SELECT * FROM users WHERE username = ?';
  db.query(query, [username], (err, results) => {
    if (err) {
      console.error('数据库查询错误:', err);
      return res.status(500).json({ message: '服务器内部错误' });
    }
    
    if (results.length === 0) {
      return res.status(401).json({ message: '用户名或密码错误' });
    }
    
    const user = results[0];
    
    // 验证密码
    bcrypt.compare(password, user.password, (err, isMatch) => {
      if (err) {
        console.error('密码验证错误:', err);
        return res.status(500).json({ message: '服务器内部错误' });
      }
      
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
    });
  });
});

// 刷新token API
app.post('/refresh-token', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ message: '未提供token' });
  }
  
  try {
    // 验证token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret_key');
    
    // 验证用户是否仍然存在于数据库中，并获取最新的用户信息
    const query = 'SELECT * FROM users WHERE id = ? AND username = ?';
    db.query(query, [decoded.userId, decoded.username], (err, results) => {
      if (err) {
        console.error('数据库查询错误:', err);
        return res.status(500).json({ message: '服务器内部错误' });
      }
      
      if (results.length === 0) {
        return res.status(401).json({ message: '用户不存在' });
      }
      
      const user = results[0];
      
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
    });
  } catch (error) {
    console.error('token刷新失败:', error);
    res.status(401).json({ message: 'token无效或已过期' });
  }
});

// 获取所有用户组API
app.get('/groups', authenticateToken, (req, res) => {
  const query = 'SELECT id, name, description, leaders FROM `groups`';
  db.query(query, (err, results) => {
    if (err) {
      console.error('数据库查询错误:', err);
      return res.status(500).json({ message: '服务器内部错误' });
    }
    
    // 解析leaders字段
    const groupsWithLeaders = results.map(group => ({
      ...group,
      leaders: group.leaders ? JSON.parse(group.leaders) : []
    }));
    
    res.json({ groups: groupsWithLeaders });
  });
});

// 根据ID获取单个用户组API
app.get('/groups/:id', authenticateToken, (req, res) => {
  const groupId = req.params.id;
  const query = 'SELECT id, name, description, leaders FROM \`groups\` WHERE id = ?';
  
  db.query(query, [groupId], (err, results) => {
    if (err) {
      console.error('数据库查询错误:', err);
      return res.status(500).json({ message: '服务器内部错误' });
    }
    
    if (results.length === 0) {
      return res.status(404).json({ message: '用户组不存在' });
    }
    
    // 解析leaders字段
    const groupWithLeaders = {
      ...results[0],
      leaders: results[0].leaders ? JSON.parse(results[0].leaders) : []
    };
    
    res.json({ group: groupWithLeaders });
  });
});

// 获取所有用户组API
app.get('/groups', authenticateToken, (req, res) => {
  const query = 'SELECT * FROM `groups`';
  db.query(query, (err, results) => {
    if (err) {
      console.error('数据库查询错误:', err);
      return res.status(500).json({ message: '服务器内部错误' });
    }
    
    res.json({ groups: results });
  });
});

// 根据ID获取单个用户组API
app.get('/groups/:id', authenticateToken, (req, res) => {
  const groupId = req.params.id;
  const query = 'SELECT * FROM \`groups\` WHERE id = ?';
  
  db.query(query, [groupId], (err, results) => {
    if (err) {
      console.error('数据库查询错误:', err);
      return res.status(500).json({ message: '服务器内部错误' });
    }
    
    if (results.length === 0) {
      return res.status(404).json({ message: '用户组不存在' });
    }
    
    res.json({ group: results[0] });
  });
});

// 更新用户组API
app.put('/groups/:id', authenticateToken, (req, res) => {
  // 检查当前用户是否为管理员
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: '权限不足，只有管理员可以执行此操作' });
  }
  
  const { id } = req.params;
  const { name, description, leaders } = req.body;
  
  // 构建更新查询
  let updateQuery = 'UPDATE `groups` SET ';
  const updateFields = [];
  const updateValues = [];
  
  if (name !== undefined) {
    updateFields.push('name = ?');
    updateValues.push(name);
  }
  if (description !== undefined) {
    updateFields.push('description = ?');
    updateValues.push(description);
  }
  if (leaders !== undefined) {
    updateFields.push('leaders = ?');
    updateValues.push(JSON.stringify(leaders));
  }
  
  // 如果没有提供任何更新字段
  if (updateFields.length === 0) {
    return res.status(400).json({ message: '至少需要提供一个要更新的字段' });
  }
  
  updateQuery += updateFields.join(', ') + ' WHERE id = ?';
  updateValues.push(id);
  
  db.query(updateQuery, updateValues, (err, results) => {
    if (err) {
      console.error('更新用户组失败:', err);
      return res.status(500).json({ message: '服务器内部错误' });
    }
    
    if (results.affectedRows === 0) {
      return res.status(404).json({ message: '未找到指定的用户组' });
    }
    
    res.json({ message: '用户组更新成功' });
  });
});

// 删除用户组API
app.delete('/groups/:id', authenticateToken, (req, res) => {
  // 检查当前用户是否为管理员
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: '权限不足，只有管理员可以执行此操作' });
  }
  
  const { id } = req.params;
  
  const query = 'DELETE FROM `groups` WHERE id = ?';
  
  db.query(query, [id], (err, results) => {
    if (err) {
      console.error('删除用户组失败:', err);
      return res.status(500).json({ message: '服务器内部错误' });
    }
    
    if (results.affectedRows === 0) {
      return res.status(404).json({ message: '未找到指定的用户组' });
    }
    
    // 同时更新属于该用户组的用户的group_id为NULL
    const updateUserQuery = 'UPDATE users SET group_id = NULL WHERE group_id = ?';
    db.query(updateUserQuery, [id], (updateErr) => {
      if (updateErr) {
        console.error('更新用户group_id失败:', updateErr);
      }
      // 不管更新用户是否成功，都返回删除成功
      res.json({ message: '用户组删除成功' });
    });
  });
});

// 创建用户组API
app.post('/groups', authenticateToken, (req, res) => {
  // 检查当前用户是否为管理员
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: '权限不足，只有管理员可以执行此操作' });
  }
  
  const { name, description, leaders } = req.body;
  
  // 验证必填字段
  if (!name) {
    return res.status(400).json({ message: '用户组名称是必填项' });
  }
  
  // 插入新用户组
  const query = 'INSERT INTO `groups` (name, description, leaders) VALUES (?, ?, ?)';
  db.query(query, [name, description || '', leaders ? JSON.stringify(leaders) : '[]'], (err, results) => {
    if (err) {
      console.error('创建用户组失败:', err);
      return res.status(500).json({ message: '服务器内部错误' });
    }
    
    res.status(201).json({ message: '用户组创建成功', groupId: results.insertId });
  });
});

// 获取所有用户API
app.get('/users', authenticateToken, (req, res) => {
  const query = `
    SELECT 
      u.id, 
      u.username, 
      u.name, 
      u.role
    FROM users u
  `;
  
  db.query(query, (err, users) => {
    if (err) {
      console.error('数据库查询错误:', err);
      return res.status(500).json({ message: '服务器内部错误' });
    }
    
    // 为每个用户获取其所属的用户组
    const userPromises = users.map(user => {
      return new Promise((resolve, reject) => {
        const groupQuery = `
          SELECT g.id, g.name
          FROM \`groups\` g
          INNER JOIN user_group_memberships ugm ON g.id = ugm.group_id
          WHERE ugm.user_id = ?
        `;
        
        db.query(groupQuery, [user.id], (err, groups) => {
          if (err) {
            reject(err);
          } else {
            user.groups = groups;
            resolve(user);
          }
        });
      });
    });
    
    Promise.all(userPromises)
      .then(usersWithGroups => {
        res.json({ users: usersWithGroups });
      })
      .catch(err => {
        console.error('获取用户组信息失败:', err);
        res.status(500).json({ message: '服务器内部错误' });
      });
  });
});

// 更新用户API
app.put('/users/:id', authenticateToken, (req, res) => {
  // 检查当前用户是否为管理员
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: '权限不足，只有管理员可以执行此操作' });
  }
  
  const { id } = req.params;
  const { username, name, role, groupIds, password } = req.body;
  
  // 构建更新查询
  let updateQuery = 'UPDATE users SET ';
  const updateFields = [];
  const updateValues = [];
  
  if (username !== undefined) {
    updateFields.push('username = ?');
    updateValues.push(username);
  }
  if (name !== undefined) {
    updateFields.push('name = ?');
    updateValues.push(name);
  }
  if (role !== undefined) {
    // 验证角色值
    if (role !== 'user' && role !== 'admin') {
      return res.status(400).json({ message: '角色值无效，必须是user或admin' });
    }
    updateFields.push('role = ?');
    updateValues.push(role);
  }
  // groupIds将在后续单独处理，不在这里更新users表的group_id字段

  if (password !== undefined && password.trim() !== '') {
    const hashedPassword = bcrypt.hashSync(password, 8);
    updateFields.push('password = ?');
    updateValues.push(hashedPassword);
  }
  
  // 如果没有提供任何更新字段
  if (updateFields.length === 0) {
    return res.status(400).json({ message: '至少需要提供一个要更新的字段' });
  }
  
  updateQuery += updateFields.join(', ') + ' WHERE id = ?';
  updateValues.push(id);
  
  db.query(updateQuery, updateValues, (err, results) => {
    if (err) {
      console.error('更新用户失败:', err);
      return res.status(500).json({ message: '服务器内部错误' });
    }
    
    if (results.affectedRows === 0) {
      return res.status(404).json({ message: '未找到指定的用户' });
    }
    
    // 如果提供了groupIds，更新用户组关系
    if (groupIds !== undefined) {
      updateUserGroupMemberships(id, groupIds, (err) => {
        if (err) {
          console.error('更新用户组关系失败:', err);
          return res.status(500).json({ message: '用户信息更新成功，但用户组关系更新失败' });
        }
        res.json({ message: '用户更新成功' });
      });
    } else {
      res.json({ message: '用户更新成功' });
    }
  });
});

// 删除用户API
app.delete('/users/:id', authenticateToken, (req, res) => {
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
  const removeFromTodosQuery = `UPDATE TodosList SET Belonging_users = 
    CASE 
      WHEN Belonging_users IS NULL OR Belonging_users = '' THEN ''
      WHEN Belonging_users = ? THEN ''
      WHEN Belonging_users LIKE ? THEN REPLACE(Belonging_users, ?, '')
      WHEN Belonging_users LIKE ? THEN REPLACE(Belonging_users, ?, ?)
      WHEN Belonging_users LIKE ? THEN REPLACE(Belonging_users, ?, ?)
      ELSE Belonging_users
    END`;
  
  const userIdStr = id.toString();
  const userIdWithComma = userIdStr + ',';
  const commaUserId = ',' + userIdStr;
  const commaUserIdWithComma = ',' + userIdStr + ',';
  
  db.query(removeFromTodosQuery, [
    userIdStr, 
    userIdWithComma + '%', userIdWithComma, '',
    '%' + commaUserIdWithComma + '%', commaUserIdWithComma, ',',
    '%' + commaUserId, commaUserId, ''
  ], (err) => {
    if (err) {
      console.error('从任务中移除用户失败:', err);
      return res.status(500).json({ message: '服务器内部错误' });
    }
    
    // 删除用户
    const query = 'DELETE FROM users WHERE id = ?';
    
    db.query(query, [id], (err, results) => {
      if (err) {
        console.error('删除用户失败:', err);
        return res.status(500).json({ message: '服务器内部错误' });
      }
      
      if (results.affectedRows === 0) {
        return res.status(404).json({ message: '未找到指定的用户' });
      }
      
      res.json({ message: '用户删除成功' });
    });
  });
});

// 认证中间件
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (token == null) return res.status(401).json({ message: '未提供token' });
  
  jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret_key', (err, decodedUser) => {
    if (err) return res.status(403).json({ message: 'token无效或已过期' });
    
    // 验证用户是否仍然存在于数据库中
    const query = 'SELECT * FROM users WHERE id = ? AND username = ?';
    db.query(query, [decodedUser.userId, decodedUser.username], (err, results) => {
      if (err) {
        console.error('数据库查询错误:', err);
        return res.status(500).json({ message: '服务器内部错误' });
      }
      
      if (results.length === 0) {
        return res.status(401).json({ message: '用户不存在' });
      }
      
      // 添加用户信息到req.user，确保中文字符正确处理
      const user = results[0];
      
      // 获取用户的所有用户组
      const groupQuery = `
        SELECT g.id, g.name
        FROM \`groups\` g
        INNER JOIN user_group_memberships ugm ON g.id = ugm.group_id
        WHERE ugm.user_id = ?
      `;
      
      db.query(groupQuery, [user.id], (err, groupResults) => {
        if (err) {
          console.error('获取用户组信息失败:', err);
          return res.status(500).json({ message: '服务器内部错误' });
        }
        
        req.user = {
          userId: user.id,
          username: user.username,
          name: user.name,
          role: user.role,
          groups: groupResults,
          groupIds: groupResults.map(g => g.id)
        };
        
        // 确保响应头设置正确的字符集
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        next();
      });
    });
  });
}

// 检查用户是否有权限编辑或删除待办事项
async function checkTodoPermission(req, res, next) {
  const { id } = req.params;
  const userId = req.user.userId;
  
  // 查询待办事项的创建者和管理员
  const query = 'SELECT creator_id, administrator_id, Belonging_groups FROM TodosList WHERE id = ?';
  
  db.query(query, [id], async (err, results) => {
    if (err) {
      console.error('查询待办事项权限失败:', err);
      return res.status(500).json({ message: '服务器内部错误' });
    }
    
    if (results.length === 0) {
      return res.status(404).json({ message: '未找到指定的待办事项' });
    }
    
    const todo = results[0];
    
    // 检查是否是创建者或管理员
    if (userId === todo.creator_id || userId === todo.administrator_id) {
      return next();
    }
    
    // 检查是否是系统管理员
    const userQuery = 'SELECT role FROM users WHERE id = ?';
    db.query(userQuery, [userId], (err, userResults) => {
      if (err) {
        console.error('查询用户角色失败:', err);
        return res.status(500).json({ message: '服务器内部错误' });
      }
      
      if (userResults.length > 0 && userResults[0].role === 'admin') {
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
          const groupQuery = 'SELECT id, leaders FROM `groups` WHERE id IN (?)';
          db.query(groupQuery, [todoGroupIds], (err, groupResults) => {
            if (err) {
              console.error('查询用户组失败:', err);
              return res.status(500).json({ message: '服务器内部错误' });
            }
            
            // 检查用户是否是任何关联组的组长
            for (const group of groupResults) {
              if (userGroupIds.includes(group.id) && group.leaders) {
                const leaders = JSON.parse(group.leaders);
                if (Array.isArray(leaders) && leaders.includes(userId)) {
                  return next();
                }
              }
            }
            
            // 如果是组成员但不是组长，则拒绝访问（只有组长可以编辑/删除）
            return res.status(403).json({ message: '只有用户组组长才能执行此操作' });
          });
        } else {
          // 如果用户不属于任何关联组，则拒绝访问
          return res.status(403).json({ message: '您没有权限执行此操作' });
        }
      } else {
        // 如果没有关联组且不是创建者或管理员，则拒绝访问
        return res.status(403).json({ message: '您没有权限执行此操作' });
      }
    });
  });
}


// 创建待办事项API
app.post('/todos', authenticateToken, (req, res) => {
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
  
  // 处理Belonging_users和Belonging_groups为ID列表
  const belongingUsers = Array.isArray(Belonging_users) ? Belonging_users.join(',') : 
                        (typeof Belonging_users === 'string' ? Belonging_users : '');
  const belongingGroups = Array.isArray(Belonging_groups) ? Belonging_groups.join(',') : 
                         (typeof Belonging_groups === 'string' ? Belonging_groups : '');
  
  // 处理Deadline字段，确保格式正确
  let formattedDeadline = deadline;
  if (deadline) {
    // 如果只提供了日期，添加默认时间
    if (deadline.match(/^\d{4}-\d{2}-\d{2}$/)) {
      formattedDeadline = deadline + ' 00:00:00';
    }
  }
  
  // 插入新待办事项
  const insertQuery = `
    INSERT INTO TodosList 
    (name, description, Deadline, Priority, Status, Belonging_users, Belonging_groups, creator_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;
  
  db.query(insertQuery, [name, description, formattedDeadline, priority, Status, belongingUsers, belongingGroups, req.user.userId], (err, results) => {
    if (err) {
      console.error('创建待办事项失败:', err);
      return res.status(500).json({ message: '服务器内部错误' });
    }
    
    res.status(201).json({ 
      message: '待办事项创建成功',
      todoId: results.insertId 
    });
  });
});

// 获取所有待办事项API
app.get('/todos', authenticateToken, (req, res) => {
  const query = 'SELECT * FROM TodosList';
  db.query(query, (err, results) => {
    if (err) {
      console.error('获取待办事项失败:', err);
      return res.status(500).json({ message: '服务器内部错误' });
    }
    
    // 处理Belonging_users和Belonging_groups字段，将逗号分隔的字符串转换为数组
    const todos = results.map(todo => ({
      ...todo,
      // 确保状态和优先级值被正确处理
      Status: Number(todo.Status),
      // 将数据库中的整数优先级映射为前端需要的字符串值
      Priority: (() => {
        const priorityMap = {
          3: '紧急',
          2: '重要',
          1: '普通',
          0: '低'
        };
        return priorityMap[todo.Priority] || '普通';
      })(),
      Belonging_users: todo.Belonging_users ? todo.Belonging_users.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)) : [],
      Belonging_groups: todo.Belonging_groups ? todo.Belonging_groups.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)) : [],
      creator_id: todo.creator_id ? parseInt(todo.creator_id) : null,
      administrator_id: todo.administrator_id ? parseInt(todo.administrator_id) : null
    }));
    
    res.json({ todos });
  });
});

// 根据ID获取单个待办事项API
app.get('/todos/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const query = 'SELECT * FROM TodosList WHERE id = ?';
  
  db.query(query, [id], (err, results) => {
    if (err) {
      console.error('获取待办事项详情失败:', err);
      return res.status(500).json({ message: '服务器内部错误' });
    }
    
    if (results.length === 0) {
      return res.status(404).json({ message: '未找到指定的待办事项' });
    }
    
    // 处理Belonging_users和Belonging_groups字段，将逗号分隔的字符串转换为数组
    const todo = {
      ...results[0],
      // 确保状态和优先级值被正确处理
      Status: Number(results[0].Status),
      // 将数据库中的整数优先级映射为前端需要的字符串值
      Priority: (() => {
        const priorityMap = {
          3: '紧急',
          2: '重要',
          1: '普通',
          0: '低'
        };
        return priorityMap[results[0].Priority] || '普通';
      })(),
      Belonging_users: results[0].Belonging_users ? results[0].Belonging_users.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)) : [],
      Belonging_groups: results[0].Belonging_groups ? results[0].Belonging_groups.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)) : [],
      creator_id: results[0].creator_id ? parseInt(results[0].creator_id) : null,
      administrator_id: results[0].administrator_id ? parseInt(results[0].administrator_id) : null
    };
    
    res.json({ todo });
  });
});

// 更新待办事项API
app.put('/todos/:id', authenticateToken, checkTodoPermission, (req, res) => {
  const { id } = req.params;
  const { name, description, deadline, Priority, Status, Belonging_users, Belonging_groups } = req.body;
  
  // 构建更新查询
  let updateQuery = 'UPDATE TodosList SET ';
  const updateFields = [];
  const updateValues = [];
  
  if (name !== undefined) {
    updateFields.push('name = ?');
    updateValues.push(name);
  }
  if (description !== undefined) {
    updateFields.push('description = ?');
    updateValues.push(description);
  }
  if (deadline !== undefined) {
    updateFields.push('Deadline = ?');
    // 处理Deadline字段，确保格式正确
    let formattedDeadline = deadline;
    if (deadline) {
      // 如果只提供了日期，添加默认时间
      if (deadline.match(/^\d{4}-\d{2}-\d{2}$/)) {
        formattedDeadline = deadline + ' 00:00:00';
      }
    }
    updateValues.push(formattedDeadline);
  }
  if (Priority !== undefined) {
    updateFields.push('Priority = ?');
    // 确保优先级值被正确处理
    // 将前端传来的字符串优先级映射为数据库中的整数值
    const priorityMap = {
      '紧急': 3,
      '重要': 2,
      '普通': 1,
      '低': 0
    };
    const priorityValue = priorityMap[Priority] !== undefined ? priorityMap[Priority] : 0;
    updateValues.push(priorityValue);
  }
  if (Status !== undefined) {
    updateFields.push('Status = ?');
    // 确保状态值被正确处理
    updateValues.push(Status);
  }
  if (Belonging_users !== undefined) {
    // 处理Belonging_users为ID列表
    const belongingUsers = Array.isArray(Belonging_users) ? Belonging_users.join(',') : 
                          (typeof Belonging_users === 'string' ? Belonging_users : '') || '';
    updateFields.push('Belonging_users = ?');
    updateValues.push(belongingUsers);
  }
  if (Belonging_groups !== undefined) {
    // 处理Belonging_groups为ID列表
    const belongingGroups = Array.isArray(Belonging_groups) ? Belonging_groups.join(',') : 
                           (typeof Belonging_groups === 'string' ? Belonging_groups : '') || '';
    updateFields.push('Belonging_groups = ?');
    updateValues.push(belongingGroups);
  }
  
  // 如果没有提供任何更新字段
  if (updateFields.length === 0) {
    return res.status(400).json({ message: '至少需要提供一个要更新的字段' });
  }
  
  updateQuery += updateFields.join(', ') + ' WHERE id = ?';
  updateValues.push(id);
  
  db.query(updateQuery, updateValues, (err, results) => {
    if (err) {
      console.error('更新待办事项失败:', err);
      return res.status(500).json({ message: '服务器内部错误' });
    }
    
    if (results.affectedRows === 0) {
      return res.status(404).json({ message: '未找到指定的待办事项' });
    }
    
    res.json({ message: '待办事项更新成功' });
  });
});

// 删除待办事项API
app.delete('/todos/:id', authenticateToken, checkTodoPermission, (req, res) => {
  const { id } = req.params;
  const query = 'DELETE FROM TodosList WHERE id = ?';
  
  db.query(query, [id], (err, results) => {
    if (err) {
      console.error('删除待办事项失败:', err);
      return res.status(500).json({ message: '服务器内部错误' });
    }
    
    if (results.affectedRows === 0) {
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
  });
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