const { safeQuery, getConnection, initializeConnection } = require('./connection');
const { TodoModel, UserModel, GroupModel, UserGroupMembershipModel } = require('./mongoModels');

// feature toggles from env
const READ_FROM = process.env.DB_READ_FROM || 'mysql'; // mysql | mongo | prefer-mongo
const WRITE_MODE = process.env.DB_WRITE_MODE || 'mysql'; // mysql | dual | mongo

function parseMysqlTodoRow(row) {
  return {
    ...row,
    Status: Number(row.Status),
    Priority: Number(row.Priority),
    Belonging_users: row.Belonging_users ? row.Belonging_users.split(',').map(x => parseInt(x.trim())).filter(x => !isNaN(x)) : [],
    Belonging_groups: row.Belonging_groups ? row.Belonging_groups.split(',').map(x => parseInt(x.trim())).filter(x => !isNaN(x)) : [],
    creator_id: row.creator_id ? parseInt(row.creator_id) : null,
    administrator_id: row.administrator_id ? parseInt(row.administrator_id) : null
  };
}

// Todos repository
const TodosRepo = {
  async create(todo, userId) {
    // 归一化 ID，确保新写入统一为 MySQL 数字ID
    const normalizedUsers = await normalizeLeaderIds(Array.isArray(todo.Belonging_users) ? todo.Belonging_users : []);
    const normalizedGroups = await normalizeGroupIds(Array.isArray(todo.Belonging_groups) ? todo.Belonging_groups : []);

    const insertMysql = () => new Promise((resolve, reject) => {
      const belongingUsers = Array.isArray(normalizedUsers) ? normalizedUsers.join(',') : '';
      const belongingGroups = Array.isArray(normalizedGroups) ? normalizedGroups.join(',') : '';
      const priorityMap = { '紧急': 3, '重要': 2, '普通': 1, '低': 0 };
      const priority = todo.Priority !== undefined ? (priorityMap[todo.Priority] ?? todo.Priority ?? 0) : 0;
      const Status = todo.Status !== undefined ? todo.Status : -1;
      let formattedDeadline = todo.deadline;
      if (formattedDeadline && /^\d{4}-\d{2}-\d{2}$/.test(formattedDeadline)) {
        formattedDeadline = `${formattedDeadline} 00:00:00`;
      }
      const sql = `INSERT INTO TodosList (name, description, Deadline, Priority, Status, Belonging_users, Belonging_groups, creator_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
      safeQuery(sql, [todo.name, todo.description, formattedDeadline, priority, Status, belongingUsers, belongingGroups, userId], (err, results) => {
        if (err) return reject(err);
        resolve({ insertId: results.insertId });
      });
    });

    const insertMongo = async () => {
      const priorityMap = { '紧急': 3, '重要': 2, '普通': 1, '低': 0 };
      const doc = new TodoModel({
        name: todo.name,
        description: todo.description,
        Deadline: todo.deadline ? new Date(todo.deadline) : undefined,
        Priority: todo.Priority !== undefined ? (priorityMap[todo.Priority] ?? todo.Priority ?? 0) : 0,
        Status: todo.Status !== undefined ? todo.Status : -1,
        Belonging_users: Array.isArray(normalizedUsers) ? normalizedUsers : [],
        Belonging_groups: Array.isArray(normalizedGroups) ? normalizedGroups : [],
        creator_id: userId
      });
      const saved = await doc.save();
      return { mongoId: saved._id.toString() };
    };

    if (WRITE_MODE === 'mysql') return insertMysql();
    if (WRITE_MODE === 'mongo') return insertMongo();
    // dual
    const [mysqlRes, mongoRes] = await Promise.allSettled([insertMysql(), insertMongo()]);
    if (mysqlRes.status === 'rejected' && mongoRes.status === 'rejected') throw mysqlRes.reason || mongoRes.reason;
    if (mysqlRes.status === 'rejected') console.warn('TodosRepo.create: MySQL 写入失败，已使用 Mongo 结果：', mysqlRes.reason);
    if (mongoRes.status === 'rejected') console.warn('TodosRepo.create: Mongo 写入失败，已使用 MySQL 结果：', mongoRes.reason);
    // 成功双写后，同步 mysqlId 到 Mongo 文档
    if (mysqlRes.status === 'fulfilled' && mongoRes.status === 'fulfilled') {
      try {
        await TodoModel.updateOne({ _id: mongoRes.value.mongoId }, { mysqlId: mysqlRes.value.insertId });
      } catch (e) {
        console.warn('TodosRepo.create: 同步 mysqlId 到 Mongo 失败：', e);
      }
    }
    return mysqlRes.status === 'fulfilled' ? mysqlRes.value : { insertId: null, ...mongoRes.value };
  },

  async findAllForUser(user) {
    if (READ_FROM === 'mongo' || READ_FROM === 'prefer-mongo') {
      // 读取 Mongo（管理员直接查看全部）
      const numericIds = [];
      const stringIds = [];
      if (user && user.userId != null) {
        const sid = String(user.userId);
        stringIds.push(sid);
        const n = parseInt(sid);
        if (!isNaN(n)) {
          numericIds.push(n);
        } else if (/^[a-f\d]{24}$/i.test(sid)) {
          // 如果是 ObjectId 字符串，尝试映射为 mysqlId（数字）
          const me = await UserModel.findById(sid).lean().catch(() => null);
          if (me && typeof me.mysqlId === 'number' && Number.isFinite(me.mysqlId)) {
            numericIds.push(Math.trunc(me.mysqlId));
          }
        }
      }
  
      // 归一化 groupIds：支持数字/数字字符串/ObjectId 字符串
      let numericGroupIds = [];
      if (Array.isArray(user?.groupIds) && user.groupIds.length > 0) {
        const nums = user.groupIds
          .map(g => (typeof g === 'number' ? Math.trunc(g) : (/^\d+$/.test(String(g)) ? parseInt(String(g), 10) : NaN)))
          .filter(v => !isNaN(v));
        numericGroupIds.push(...nums);
  
        const objectLike = user.groupIds
          .map(String)
          .filter(g => /^[a-f\d]{24}$/i.test(g));
        if (objectLike.length > 0) {
          const groups = await GroupModel.find({ _id: { $in: objectLike } }, 'mysqlId').lean();
          groups.forEach(g => {
            if (typeof g.mysqlId === 'number' && Number.isFinite(g.mysqlId)) {
              numericGroupIds.push(Math.trunc(g.mysqlId));
            }
          });
        }
        // 去重
        numericGroupIds = Array.from(new Set(numericGroupIds));
      }
  
      const query = (user && user.role === 'admin') ? {} : {
        $or: [
          { creator_id: { $in: [...numericIds, ...stringIds] } },
          { administrator_id: { $in: [...numericIds, ...stringIds] } },
          { Belonging_users: { $in: numericIds } },
          { Belonging_groups: { $in: numericGroupIds } }
        ]
      };
      const todos = await TodoModel.find(query).lean();
      // 转换 Priority 为中文便于前端兼容
      const map = { 3: '紧急', 2: '重要', 1: '普通', 0: '低' };
      return todos.map(t => ({
        ...t,
        id: t.mysqlId || t._id.toString(),
        Priority: map[t.Priority] || '普通'
      }));
    }

    // 默认从 MySQL 读取，失败自动回退到 Mongo
    try {
      const rows = await new Promise((resolve, reject) => {
        safeQuery('SELECT * FROM TodosList', (err, results) => err ? reject(err) : resolve(results));
      });
      const parsed = rows.map(parseMysqlTodoRow);
      const filtered = (user && user.role === 'admin') ? parsed : parsed.filter(todo => {
        if (todo.creator_id === user.userId || todo.administrator_id === user.userId) return true;
        if (Array.isArray(todo.Belonging_users) && todo.Belonging_users.includes(user.userId)) return true;
        if (Array.isArray(todo.Belonging_groups) && (user.groupIds || []).length > 0 && todo.Belonging_groups.some(g => (user.groupIds || []).includes(g))) return true;
        return false;
      });
      return filtered.map(t => ({ ...t, Priority: { 3: '紧急', 2: '重要', 1: '普通', 0: '低' }[t.Priority] || '普通' }));
    } catch (err) {
      console.warn('从 MySQL 获取 Todos 失败，回落到 Mongo:', err?.message || err);
      const numericIds = [];
      const stringIds = [];
      if (user && user.userId != null) {
        const sid = String(user.userId);
        stringIds.push(sid);
        const n = parseInt(sid);
        if (!isNaN(n)) {
          numericIds.push(n);
        } else if (/^[a-f\d]{24}$/i.test(sid)) {
          const me = await UserModel.findById(sid).lean().catch(() => null);
          if (me && typeof me.mysqlId === 'number' && Number.isFinite(me.mysqlId)) {
            numericIds.push(Math.trunc(me.mysqlId));
          }
        }
      }
  
      let numericGroupIds = [];
      if (Array.isArray(user?.groupIds) && user.groupIds.length > 0) {
        const nums = user.groupIds
          .map(g => (typeof g === 'number' ? Math.trunc(g) : (/^\d+$/.test(String(g)) ? parseInt(String(g), 10) : NaN)))
          .filter(v => !isNaN(v));
        numericGroupIds.push(...nums);
  
        const objectLike = user.groupIds
          .map(String)
          .filter(g => /^[a-f\d]{24}$/i.test(g));
        if (objectLike.length > 0) {
          const groups = await GroupModel.find({ _id: { $in: objectLike } }, 'mysqlId').lean();
          groups.forEach(g => {
            if (typeof g.mysqlId === 'number' && Number.isFinite(g.mysqlId)) {
              numericGroupIds.push(Math.trunc(g.mysqlId));
            }
          });
        }
        numericGroupIds = Array.from(new Set(numericGroupIds));
      }
  
      const query = (user && user.role === 'admin') ? {} : {
        $or: [
          { creator_id: { $in: [...numericIds, ...stringIds] } },
          { administrator_id: { $in: [...numericIds, ...stringIds] } },
          { Belonging_users: { $in: numericIds } },
          { Belonging_groups: { $in: numericGroupIds } }
        ]
      };
      const todos = await TodoModel.find(query).lean();
      const map = { 3: '紧急', 2: '重要', 1: '普通', 0: '低' };
      return todos.map(t => ({
        ...t,
        id: t.mysqlId || t._id.toString(),
        Priority: map[t.Priority] || '普通'
      }));
    }
  },

  async findById(id) {
    if (READ_FROM === 'mongo' || READ_FROM === 'prefer-mongo') {
      // 尝试按 mysqlId 查找，如果找不到就按 ObjectId 查找
      let doc = await GroupModel.findOne({ mysqlId: parseInt(id) }).lean();
      if (!doc) {
        doc = await GroupModel.findById(id).lean().catch(() => null);
      }
      if (doc) {
        const mid = (typeof doc.mysqlId === 'number' && Number.isFinite(doc.mysqlId)) ? Math.trunc(doc.mysqlId) : null;
        // 若没有数字 mysqlId，则回退返回 Mongo 的 _id 字符串，避免空列表
        const retId = (mid != null) ? mid : ((doc._id && doc._id.toString) ? doc._id.toString() : String(doc._id));
        return {
          id: retId,
          name: doc.name,
          description: doc.description,
          leaders: Array.isArray(doc.leaders) ? doc.leaders : []
        };
      }
    }
    
    // MySQL 回退，并将 leaders 从逗号分隔的字符串解析为数字数组
    const rows = await new Promise((resolve, reject) => {
      safeQuery('SELECT id, name, description, leaders FROM `groups` WHERE id = ?', [id], (err, results) => err ? reject(err) : resolve(results));
    });
    if (!rows || rows.length === 0) return null;
    const row = rows[0];
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      leaders: row.leaders ? row.leaders.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)) : []
    };
  },

  async findAll() {
    if (READ_FROM === 'mongo' || READ_FROM === 'prefer-mongo') {
      const docs = await GroupModel.find({}).lean();
      return docs.map(doc => {
        const mid = (typeof doc.mysqlId === 'number' && Number.isFinite(doc.mysqlId)) ? Math.trunc(doc.mysqlId) : null;
        const id = (mid != null) ? mid : ((doc._id && doc._id.toString) ? doc._id.toString() : String(doc._id));
        return { id, name: doc.name, description: doc.description, leaders: Array.isArray(doc.leaders) ? doc.leaders : [] };
      });
    }
    
    const rows = await new Promise((resolve, reject) => {
      safeQuery('SELECT * FROM `groups` ORDER BY id', (err, results) => err ? reject(err) : resolve(results));
    });
    return rows.map(row => ({ id: row.id, name: row.name, description: row.description, leaders: row.leaders ? row.leaders.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)) : [] }));
  },

  async update(id, patch) {
    // 归一化补丁中的 ID 字段
    const normalizedUsers = (patch.Belonging_users !== undefined)
      ? await normalizeLeaderIds(Array.isArray(patch.Belonging_users) ? patch.Belonging_users : [])
      : undefined;
    const normalizedGroups = (patch.Belonging_groups !== undefined)
      ? await normalizeGroupIds(Array.isArray(patch.Belonging_groups) ? patch.Belonging_groups : [])
      : undefined;

    const updateMysql = () => new Promise((resolve, reject) => {
      const fields = [];
      const values = [];
      if (patch.name !== undefined) { fields.push('name = ?'); values.push(patch.name); }
      if (patch.description !== undefined) { fields.push('description = ?'); values.push(patch.description); }
      if (patch.deadline !== undefined) {
        let formatted = patch.deadline;
        if (formatted && /^\d{4}-\d{2}-\d{2}$/.test(formatted)) formatted = `${formatted} 00:00:00`;
        fields.push('Deadline = ?'); values.push(formatted);
      }
      if (patch.Priority !== undefined) { fields.push('Priority = ?'); const map = { '紧急':3,'重要':2,'普通':1,'低':0 }; values.push(map[patch.Priority] ?? patch.Priority ?? 0); }
      if (patch.Status !== undefined) { fields.push('Status = ?'); values.push(patch.Status); }
      if (patch.Belonging_users !== undefined) { fields.push('Belonging_users = ?'); values.push(Array.isArray(normalizedUsers) ? normalizedUsers.join(',') : ''); }
      if (patch.Belonging_groups !== undefined) { fields.push('Belonging_groups = ?'); values.push(Array.isArray(normalizedGroups) ? normalizedGroups.join(',') : ''); }
      if (!fields.length) return resolve({ affectedRows: 0 });
      const sql = `UPDATE TodosList SET ${fields.join(', ')} WHERE id = ?`;
      values.push(id);
      safeQuery(sql, values, (err, results) => err ? reject(err) : resolve(results));
    });

    const updateMongo = async () => {
      const $set = {};
      if (patch.name !== undefined) $set.name = patch.name;
      if (patch.description !== undefined) $set.description = patch.description;
      if (patch.deadline !== undefined) $set.Deadline = patch.deadline ? new Date(patch.deadline) : null;
      if (patch.Priority !== undefined) $set.Priority = ({ '紧急':3,'重要':2,'普通':1,'低':0 }[patch.Priority] ?? patch.Priority ?? 0);
      if (patch.Status !== undefined) $set.Status = patch.Status;
      if (patch.Belonging_users !== undefined) $set.Belonging_users = Array.isArray(normalizedUsers) ? normalizedUsers : [];
      if (patch.Belonging_groups !== undefined) $set.Belonging_groups = Array.isArray(normalizedGroups) ? normalizedGroups : [];
      
      // 先尝试按 mysqlId 更新（仅当 id 为有效数字时）
      const isNumericId = (typeof id === 'number' && Number.isFinite(id)) || (typeof id === 'string' && /^\d+$/.test(id));
      let res = { matchedCount: 0 };
      if (isNumericId) {
        res = await TodoModel.updateOne({ mysqlId: Number(id) }, { $set });
      }
      if (res.matchedCount === 0) {
        // 如果按 mysqlId 没找到，尝试按 ObjectId 更新
        res = await TodoModel.updateOne({ _id: id }, { $set });
      }
      return res;
    };

    if (WRITE_MODE === 'mysql') return updateMysql();
    if (WRITE_MODE === 'mongo') return updateMongo();
    const [mysqlRes, mongoRes] = await Promise.allSettled([updateMysql(), updateMongo()]);
    if (mysqlRes.status === 'rejected' && mongoRes.status === 'rejected') throw mysqlRes.reason || mongoRes.reason;
    if (mysqlRes.status === 'rejected') console.warn('TodosRepo.update: MySQL 更新失败，已使用 Mongo 结果：', mysqlRes.reason);
    if (mongoRes.status === 'rejected') console.warn('TodosRepo.update: Mongo 更新失败，已使用 MySQL 结果：', mongoRes.reason);
    return mysqlRes.status === 'fulfilled' ? mysqlRes.value : mongoRes.value;
  },

  async remove(id) {
    const removeMysql = () => new Promise((resolve, reject) => {
      safeQuery('DELETE FROM TodosList WHERE id = ?', [id], (err, results) => err ? reject(err) : resolve(results));
    });
    
    const removeMongo = async () => {
      // 先尝试按 mysqlId 删除（仅当 id 为有效数字时）
      const isNumericId = (typeof id === 'number' && Number.isFinite(id)) || (typeof id === 'string' && /^\d+$/.test(id));
      let res = { deletedCount: 0 };
      if (isNumericId) {
        res = await TodoModel.deleteOne({ mysqlId: Number(id) });
      }
      if (res.deletedCount === 0) {
        // 如果按 mysqlId 没找到，尝试按 ObjectId 删除
        res = await TodoModel.deleteOne({ _id: id });
      }
      return res;
    };

    if (WRITE_MODE === 'mysql') return removeMysql();
    if (WRITE_MODE === 'mongo') return removeMongo();
    const [mysqlRes, mongoRes] = await Promise.allSettled([removeMysql(), removeMongo()]);
    if (mysqlRes.status === 'rejected' && mongoRes.status === 'rejected') throw mysqlRes.reason || mongoRes.reason;
    if (mysqlRes.status === 'rejected') console.warn('TodosRepo.remove: MySQL 删除失败，已使用 Mongo 结果：', mysqlRes.reason);
    if (mongoRes.status === 'rejected') console.warn('TodosRepo.remove: Mongo 删除失败，已使用 MySQL 结果：', mongoRes.reason);
    return mysqlRes.status === 'fulfilled' ? mysqlRes.value : mongoRes.value;
  }
};

// Users repository
const UsersRepo = {
  async create(userData) {
    // 归一化 group_id（若提供）
    const normArr = (userData.group_id !== undefined) ? await normalizeGroupIds([userData.group_id]) : [];
    const normalizedGroupId = normArr.length ? normArr[0] : null;

    const insertMysql = () => new Promise((resolve, reject) => {
      // 动态构建插入列，支持可选的 group_id
      const columns = ['username', 'name', 'password', 'role'];
      const values = [userData.username, userData.name, userData.password, userData.role || 'user'];
      if (userData.group_id !== undefined) {
        columns.push('group_id');
        values.push(normalizedGroupId);
      }
      const placeholders = columns.map(() => '?').join(', ');
      const sql = `INSERT INTO users (${columns.join(', ')}) VALUES (${placeholders})`;
      safeQuery(sql, values, (err, results) => {
        if (err) return reject(err);
        resolve({ insertId: results.insertId });
      });
    });

    const insertMongo = async () => {
      // 解析并映射 group_id（若提供）：
      // 1) 若为有效 ObjectId 字符串则直接使用；
      // 2) 若为数值或数值字符串则按 mysqlId 查找对应 Group 文档并取其 _id；
      // 3) 若未找到或不合法，跳过该字段。
      let mongoGroupId;
      try {
        const gid = userData.group_id;
        const isValidObjectId = (str) => typeof str === 'string' && /^[0-9a-fA-F]{24}$/.test(str);
        if (gid !== undefined && gid !== null) {
          if (isValidObjectId(gid)) {
            mongoGroupId = gid;
          } else if (!isNaN(parseInt(gid))) {
            const g = await GroupModel.findOne({ mysqlId: parseInt(gid) }).lean();
            if (g && g._id) mongoGroupId = g._id;
          }
        }
      } catch (e) {
        console.warn('UsersRepo.create: 解析/映射 group_id 到 Mongo 失败（已忽略）：', e);
      }

      const doc = new UserModel({
        username: userData.username,
        name: userData.name,
        password: userData.password,
        role: userData.role || 'user',
        ...(mongoGroupId ? { group_id: mongoGroupId } : {})
      });
      const saved = await doc.save();
      return { mongoId: saved._id.toString() };
    };

    if (WRITE_MODE === 'mysql') return insertMysql();
    if (WRITE_MODE === 'mongo') return insertMongo();
    // dual
    const [mysqlRes, mongoRes] = await Promise.allSettled([insertMysql(), insertMongo()]);
    if (mysqlRes.status === 'rejected' && mongoRes.status === 'rejected') throw mysqlRes.reason || mongoRes.reason;
    if (mysqlRes.status === 'rejected') console.warn('UsersRepo.create: MySQL 写入失败，已使用 Mongo 结果：', mysqlRes.reason);
    if (mongoRes.status === 'rejected') console.warn('UsersRepo.create: Mongo 写入失败，已使用 MySQL 结果：', mongoRes.reason);
    // 新增：双写均成功时，将 MySQL insertId 同步到 Mongo 用户文档的 mysqlId 字段
    if (mysqlRes.status === 'fulfilled' && mongoRes.status === 'fulfilled') {
      try {
        await UserModel.updateOne({ _id: mongoRes.value.mongoId }, { mysqlId: mysqlRes.value.insertId });
      } catch (e) {
        console.warn('UsersRepo.create: 同步 mysqlId 到 Mongo 失败：', e);
      }
    }
    return mysqlRes.status === 'fulfilled' ? mysqlRes.value : { insertId: null, ...mongoRes.value };
  },

  async findById(id) {
    if (READ_FROM === 'mongo' || READ_FROM === 'prefer-mongo') {
      // 尝试按 mysqlId 查找，如果找不到就按 ObjectId 查找
      let doc = await UserModel.findOne({ mysqlId: parseInt(id) }).lean();
      if (!doc) {
        doc = await UserModel.findById(id).lean().catch(() => null);
      }
      if (doc) {
        doc.id = doc.mysqlId || doc._id.toString();
        // 统一序列化 group_id，避免将原生 ObjectId 暴露到 token / JSON
        if (doc.group_id && typeof doc.group_id === 'object' && doc.group_id.toString) {
          doc.group_id = doc.group_id.toString();
        }
      }
      return doc;
    }
    
    try {
      const rows = await new Promise((resolve, reject) => {
        safeQuery('SELECT * FROM users WHERE id = ?', [id], (err, results) => err ? reject(err) : resolve(results));
      });
      return rows[0] || null;
    } catch (err) {
      console.warn('从 MySQL 获取用户失败，回落到 Mongo:', err?.message || err);
      let doc = await UserModel.findOne({ mysqlId: parseInt(id) }).lean();
      if (!doc) {
        doc = await UserModel.findById(id).lean().catch(() => null);
      }
      if (doc) {
        doc.id = doc.mysqlId || doc._id.toString();
        if (doc.group_id && typeof doc.group_id === 'object' && doc.group_id.toString) {
          doc.group_id = doc.group_id.toString();
        }
      }
      return doc;
    }
  },

  async findByUsername(username) {
    if (READ_FROM === 'mongo' || READ_FROM === 'prefer-mongo') {
      const doc = await UserModel.findOne({ username }).lean();
      if (doc) {
        doc.id = doc.mysqlId || doc._id.toString();
        if (doc.group_id && typeof doc.group_id === 'object' && doc.group_id.toString) {
          doc.group_id = doc.group_id.toString();
        }
      }
      return doc;
    }
    
    try {
      const rows = await new Promise((resolve, reject) => {
        safeQuery('SELECT * FROM users WHERE username = ?', [username], (err, results) => err ? reject(err) : resolve(results));
      });
      return rows[0] || null;
    } catch (err) {
      console.warn('从 MySQL 按用户名查询失败，回落到 Mongo:', err?.message || err);
      const doc = await UserModel.findOne({ username }).lean();
      if (doc) {
        doc.id = doc.mysqlId || doc._id.toString();
        if (doc.group_id && typeof doc.group_id === 'object' && doc.group_id.toString) {
          doc.group_id = doc.group_id.toString();
        }
      }
      return doc;
    }
  },

  async findAll() {
    if (READ_FROM === 'mongo' || READ_FROM === 'prefer-mongo') {
      const docs = await UserModel.find({}).lean();
      return docs.map(doc => ({
        ...doc,
        id: doc.mysqlId || doc._id.toString(),
        group_id: (doc.group_id && typeof doc.group_id === 'object' && doc.group_id.toString) ? doc.group_id.toString() : doc.group_id ?? null
      }));
    }
    
    try {
      const rows = await new Promise((resolve, reject) => {
        safeQuery('SELECT * FROM users ORDER BY id', (err, results) => err ? reject(err) : resolve(results));
      });
      return rows;
    } catch (err) {
      console.warn('从 MySQL 获取所有用户失败，回落到 Mongo:', err?.message || err);
      const docs = await UserModel.find({}).lean();
      return docs.map(doc => ({
        ...doc,
        id: doc.mysqlId || doc._id.toString(),
        group_id: (doc.group_id && typeof doc.group_id === 'object' && doc.group_id.toString) ? doc.group_id.toString() : doc.group_id ?? null
      }));
    }
  },

  async update(id, patch) {
    // 预归一化 group_id（供 MySQL 分支使用）
    const normArr = (patch.group_id !== undefined) ? await normalizeGroupIds([patch.group_id]) : [];
    const normalizedGroupId = normArr.length ? normArr[0] : null;

     const updateMysql = () => new Promise((resolve, reject) => {
       const fields = [];
       const values = [];
       if (patch.username !== undefined) { fields.push('username = ?'); values.push(patch.username); }
       if (patch.name !== undefined) { fields.push('name = ?'); values.push(patch.name); }
       if (patch.password !== undefined) { fields.push('password = ?'); values.push(patch.password); }
       if (patch.role !== undefined) { fields.push('role = ?'); values.push(patch.role); }
      if (patch.group_id !== undefined) { fields.push('group_id = ?'); values.push(normalizedGroupId); }
       if (!fields.length) return resolve({ affectedRows: 0 });
       const sql = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;
       values.push(id);
       safeQuery(sql, values, (err, results) => err ? reject(err) : resolve(results));
     });

    const updateMongo = async () => {
      const $set = {};
      if (patch.username !== undefined) $set.username = patch.username;
      if (patch.name !== undefined) $set.name = patch.name;
      if (patch.password !== undefined) $set.password = patch.password;
      if (patch.role !== undefined) $set.role = patch.role;
      if (patch.group_id !== undefined) {
        try {
          const gid = patch.group_id;
          if (gid === null) {
            $set.group_id = null;
          } else {
            const isValidObjectId = (str) => typeof str === 'string' && /^[0-9a-fA-F]{24}$/.test(str);
            if (isValidObjectId(gid)) {
              // 让 Mongoose 自动将字符串转换为 ObjectId
              $set.group_id = gid;
            } else if (!isNaN(parseInt(gid))) {
              const g = await GroupModel.findOne({ mysqlId: parseInt(gid) }).lean();
              if (g && g._id) $set.group_id = g._id;
              else $set.group_id = null; // 找不到就置空，避免脏数据
            } else {
              $set.group_id = null;
            }
          }
        } catch (e) {
          console.warn('UsersRepo.update: 映射 group_id 失败（已置空）:', e);
          $set.group_id = null;
        }
      }
      
      // 先尝试按 mysqlId 更新
      let res = await UserModel.updateOne({ mysqlId: parseInt(id) }, { $set });
      if (res.matchedCount === 0) {
        // 如果按 mysqlId 没找到，尝试按 ObjectId 更新
        res = await UserModel.updateOne({ _id: id }, { $set });
      }
      return res;
    };

    if (WRITE_MODE === 'mysql') return updateMysql();
    if (WRITE_MODE === 'mongo') return updateMongo();
    const [mysqlRes, mongoRes] = await Promise.allSettled([updateMysql(), updateMongo()]);
    if (mysqlRes.status === 'rejected' && mongoRes.status === 'rejected') throw mysqlRes.reason || mongoRes.reason;
    return mysqlRes.status === 'fulfilled' ? mysqlRes.value : mongoRes.value;
  },

  async remove(id) {
    const removeMysql = () => new Promise((resolve, reject) => {
      safeQuery('DELETE FROM users WHERE id = ?', [id], (err, results) => err ? reject(err) : resolve(results));
    });
    
    const removeMongo = async () => {
      // 先尝试按 mysqlId 删除
      let res = await UserModel.deleteOne({ mysqlId: parseInt(id) });
      if (res.deletedCount === 0) {
        // 如果按 mysqlId 没找到，尝试按 ObjectId 删除
        res = await UserModel.deleteOne({ _id: id });
      }
      return res;
    };

    if (WRITE_MODE === 'mysql') return removeMysql();
    if (WRITE_MODE === 'mongo') return removeMongo();
    const [mysqlRes, mongoRes] = await Promise.allSettled([removeMysql(), removeMongo()]);
    if (mysqlRes.status === 'rejected' && mongoRes.status === 'rejected') throw mysqlRes.reason || mongoRes.reason;
    return mysqlRes.status === 'fulfilled' ? mysqlRes.value : mongoRes.value;
  }
};

// Groups repository
const GroupsRepo = {
  async create(groupData) {
    // 预先归一化 leaders，避免在不同分支重复实现
    const normalizedLeaders = await normalizeLeaderIds(groupData.leaders);

    const insertMysql = () => new Promise((resolve, reject) => {
      const leadersStr = Array.isArray(normalizedLeaders) ? normalizedLeaders.join(',') : '';
      const sql = `INSERT INTO \`groups\` (name, description, leaders) VALUES (?, ?, ?)`;
      safeQuery(sql, [groupData.name, groupData.description, leadersStr], (err, results) => {
        if (err) return reject(err);
        resolve({ insertId: results.insertId });
      });
    });

    const insertMongo = async () => {
      const doc = new GroupModel({
        name: groupData.name,
        description: groupData.description,
        leaders: Array.isArray(normalizedLeaders) ? normalizedLeaders : []
      });
      const saved = await doc.save();
      return { mongoId: saved._id.toString() };
    };

    if (WRITE_MODE === 'mysql') return insertMysql();
    if (WRITE_MODE === 'mongo') return insertMongo();
    // dual
    const [mysqlRes, mongoRes] = await Promise.allSettled([insertMysql(), insertMongo()]);
    if (mysqlRes.status === 'rejected' && mongoRes.status === 'rejected') throw mysqlRes.reason || mongoRes.reason;
    if (mysqlRes.status === 'rejected') console.warn('GroupsRepo.create: MySQL 写入失败，已使用 Mongo 结果：', mysqlRes.reason);
    if (mongoRes.status === 'rejected') console.warn('GroupsRepo.create: Mongo 写入失败，已使用 MySQL 结果：', mongoRes.reason);
    // 成功双写后，同步 mysqlId 到 Mongo 文档
    if (mysqlRes.status === 'fulfilled' && mongoRes.status === 'fulfilled') {
      try {
        await GroupModel.updateOne({ _id: mongoRes.value.mongoId }, { mysqlId: mysqlRes.value.insertId });
      } catch (e) {
        console.warn('GroupsRepo.create: 同步 mysqlId 到 Mongo 失败：', e);
      }
    }
    return mysqlRes.status === 'fulfilled' ? mysqlRes.value : { insertId: null, ...mongoRes.value };
  },

  async findById(id) {
    if (READ_FROM === 'mongo' || READ_FROM === 'prefer-mongo') {
      // 尝试按 mysqlId 查找，如果找不到就按 ObjectId 查找
      let doc = await GroupModel.findOne({ mysqlId: parseInt(id) }).lean();
      if (!doc) {
        doc = await GroupModel.findById(id).lean().catch(() => null);
      }
      if (doc) {
        const mid = (typeof doc.mysqlId === 'number' && Number.isFinite(doc.mysqlId)) ? Math.trunc(doc.mysqlId) : null;
        // 若没有数字 mysqlId，则回退返回 Mongo 的 _id 字符串，避免空列表
        const retId = (mid != null) ? mid : ((doc._id && doc._id.toString) ? doc._id.toString() : String(doc._id));
        return {
          id: retId,
          name: doc.name,
          description: doc.description,
          leaders: Array.isArray(doc.leaders) ? doc.leaders : []
        };
      }
    }
    
    // MySQL 回退，并将 leaders 从逗号分隔的字符串解析为数字数组
    const rows = await new Promise((resolve, reject) => {
      safeQuery('SELECT id, name, description, leaders FROM `groups` WHERE id = ?', [id], (err, results) => err ? reject(err) : resolve(results));
    });
    if (!rows || rows.length === 0) return null;
    const row = rows[0];
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      leaders: row.leaders ? row.leaders.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)) : []
    };
  },

  async findAll() {
    if (READ_FROM === 'mongo' || READ_FROM === 'prefer-mongo') {
      const docs = await GroupModel.find({}).lean();
      return docs.map(doc => {
        const mid = (typeof doc.mysqlId === 'number' && Number.isFinite(doc.mysqlId)) ? Math.trunc(doc.mysqlId) : null;
        const id = (mid != null) ? mid : ((doc._id && doc._id.toString) ? doc._id.toString() : String(doc._id));
        return { id, name: doc.name, description: doc.description, leaders: Array.isArray(doc.leaders) ? doc.leaders : [] };
      });
    }
    
    const rows = await new Promise((resolve, reject) => {
      safeQuery('SELECT * FROM `groups` ORDER BY id', (err, results) => err ? reject(err) : resolve(results));
    });
    return rows.map(row => ({ id: row.id, name: row.name, description: row.description, leaders: row.leaders ? row.leaders.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)) : [] }));
  },

  async update(id, patch) {
    // 若携带 leaders，先归一化
    const normalizedLeaders = (patch.leaders !== undefined)
      ? await normalizeLeaderIds(patch.leaders)
      : undefined;

    const updateMysql = () => new Promise((resolve, reject) => {
      const fields = [];
      const values = [];
      if (patch.name !== undefined) { fields.push('name = ?'); values.push(patch.name); }
      if (patch.description !== undefined) { fields.push('description = ?'); values.push(patch.description); }
      if (patch.leaders !== undefined) { 
        fields.push('leaders = ?'); 
        values.push(Array.isArray(normalizedLeaders) ? normalizedLeaders.join(',') : ''); 
      }
      if (!fields.length) return resolve({ affectedRows: 0 });
      const sql = `UPDATE \`groups\` SET ${fields.join(', ')} WHERE id = ?`;
      values.push(id);
      safeQuery(sql, values, (err, results) => err ? reject(err) : resolve(results));
    });

    const updateMongo = async () => {
      const $set = {};
      if (patch.name !== undefined) $set.name = patch.name;
      if (patch.description !== undefined) $set.description = patch.description;
      if (patch.leaders !== undefined) $set.leaders = Array.isArray(normalizedLeaders) ? normalizedLeaders : [];
      
      // 先尝试按 mysqlId 更新
      let res = await GroupModel.updateOne({ mysqlId: parseInt(id) }, { $set });
      if (res.matchedCount === 0) {
        // 如果按 mysqlId 没找到，尝试按 ObjectId 更新
        res = await GroupModel.updateOne({ _id: id }, { $set });
      }
      return res;
    };

    if (WRITE_MODE === 'mysql') return updateMysql();
    if (WRITE_MODE === 'mongo') return updateMongo();
    const [mysqlRes, mongoRes] = await Promise.allSettled([updateMysql(), updateMongo()]);
    if (mysqlRes.status === 'rejected' && mongoRes.status === 'rejected') throw mysqlRes.reason || mongoRes.reason;
    if (mysqlRes.status === 'rejected') console.warn('GroupsRepo.update: MySQL 更新失败，已使用 Mongo 结果：', mysqlRes.reason);
    if (mongoRes.status === 'rejected') console.warn('GroupsRepo.update: Mongo 更新失败，已使用 MySQL 结果：', mongoRes.reason);
    return mysqlRes.status === 'fulfilled' ? mysqlRes.value : mongoRes.value;
  },

  async remove(id) {
    const removeMysql = () => new Promise((resolve, reject) => {
      safeQuery('DELETE FROM `groups` WHERE id = ?', [id], (err, results) => err ? reject(err) : resolve(results));
    });
    
    const removeMongo = async () => {
      // 先尝试按 mysqlId 删除
      let res = await GroupModel.deleteOne({ mysqlId: parseInt(id) });
      if (res.deletedCount === 0) {
        // 如果按 mysqlId 没找到，尝试按 ObjectId 删除
        res = await GroupModel.deleteOne({ _id: id });
      }
      return res;
    };

    if (WRITE_MODE === 'mysql') return removeMysql();
    if (WRITE_MODE === 'mongo') return removeMongo();
    const [mysqlRes, mongoRes] = await Promise.allSettled([removeMysql(), removeMongo()]);
    if (mysqlRes.status === 'rejected' && mongoRes.status === 'rejected') throw mysqlRes.reason || mongoRes.reason;
    if (mysqlRes.status === 'rejected') console.warn('GroupsRepo.remove: MySQL 删除失败，已使用 Mongo 结果：', mysqlRes.reason);
    if (mongoRes.status === 'rejected') console.warn('GroupsRepo.remove: Mongo 删除失败，已使用 MySQL 结果：', mongoRes.reason);
    return mysqlRes.status === 'fulfilled' ? mysqlRes.value : mongoRes.value;
  }
};

// 用户组成员关系仓储
const MembershipRepo = {
  async addUserToGroup(userId, groupId) {
    const insertMysql = () => new Promise((resolve, reject) => {
      safeQuery('INSERT IGNORE INTO user_group_memberships (user_id, group_id) VALUES (?, ?)', 
                [userId, groupId], (err, results) => err ? reject(err) : resolve(results));
    });
    
    const insertMongo = async () => {
      // 解析 uid/gid 为 mysql 数字ID
      let uid = null, gid = null;
      const isObjId = (v) => typeof v === 'string' && /^[a-f\d]{24}$/i.test(v);
      const isNumericLike = (v) => (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && /^\d+$/.test(v));

      if (isNumericLike(userId)) {
        uid = Number(userId);
       } else if (typeof userId === 'string') {
         const hex = extractHexObjectId(userId);
         if (hex) {
           const u = await UserModel.findById(hex).lean().catch(() => null);
          if (u && typeof u.mysqlId === 'number' && Number.isFinite(u.mysqlId)) uid = Math.trunc(u.mysqlId);
        }
      }

      if (isNumericLike(groupId)) {
        gid = Number(groupId);
      } else if (typeof groupId === 'string') {
        const hex = extractHexObjectId(groupId);
        if (hex) {
          const g = await GroupModel.findById(hex).lean().catch(() => null);
          if (g && typeof g.mysqlId === 'number' && Number.isFinite(g.mysqlId)) gid = Math.trunc(g.mysqlId);
        }
      }

      if (uid == null || gid == null) {
        throw new Error('无效的用户或用户组ID');
      }

      // 使用 upsert 避免重复
      const res = await UserGroupMembershipModel.updateOne(
        { user_id: uid, group_id: gid },
        { $setOnInsert: { joined_at: new Date() } },
        { upsert: true }
      );
      return res;
    };

    if (WRITE_MODE === 'mysql') return insertMysql();
    if (WRITE_MODE === 'mongo') return insertMongo();
    
    // dual
    const [mysqlRes, mongoRes] = await Promise.allSettled([insertMysql(), insertMongo()]);
    if (mysqlRes.status === 'rejected' && mongoRes.status === 'rejected') throw mysqlRes.reason || mongoRes.reason;
    if (mysqlRes.status === 'rejected') console.warn('MembershipRepo.addUserToGroup: MySQL 写入失败，已使用 Mongo 结果：', mysqlRes.reason);
    if (mongoRes.status === 'rejected') console.warn('MembershipRepo.addUserToGroup: Mongo 写入失败，已使用 MySQL 结果：', mongoRes.reason);
    return mysqlRes.status === 'fulfilled' ? mysqlRes.value : mongoRes.value;
  },

  async removeUserFromGroup(userId, groupId) {
    const removeMysql = () => new Promise((resolve, reject) => {
      safeQuery('DELETE FROM user_group_memberships WHERE user_id = ? AND group_id = ?', [userId, groupId], (err, results) => err ? reject(err) : resolve(results));
    });
    
    const removeMongo = async () => {
      const isObjId = (v) => typeof v === 'string' && /^[a-f\d]{24}$/i.test(v);
      const isNumericLike = (v) => (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && /^\d+$/.test(v));

      let uid = null, gid = null;
      if (isNumericLike(userId)) {
        uid = Number(userId);
      } else if (isObjId(userId)) {
        const u = await UserModel.findById(userId).lean().catch(() => null);
        if (u && typeof u.mysqlId === 'number' && Number.isFinite(u.mysqlId)) uid = Math.trunc(u.mysqlId);
      }

      if (isNumericLike(groupId)) {
        gid = Number(groupId);
      } else if (isObjId(groupId)) {
        const g = await GroupModel.findById(groupId).lean().catch(() => null);
        if (g && typeof g.mysqlId === 'number' && Number.isFinite(g.mysqlId)) gid = Math.trunc(g.mysqlId);
      }

      if (uid == null || gid == null) {
        return { deletedCount: 0 };
      }

      const res = await UserGroupMembershipModel.deleteOne({ user_id: uid, group_id: gid });
      return res;
    };

    if (WRITE_MODE === 'mysql') return removeMysql();
    if (WRITE_MODE === 'mongo') return removeMongo();

    // dual
    const [mysqlRes, mongoRes] = await Promise.allSettled([removeMysql(), removeMongo()]);
    if (mysqlRes.status === 'rejected' && mongoRes.status === 'rejected') throw mysqlRes.reason || mongoRes.reason;
    if (mysqlRes.status === 'rejected') console.warn('MembershipRepo.removeUserFromGroup: MySQL 删除失败，已使用 Mongo 结果：', mysqlRes.reason);
    if (mongoRes.status === 'rejected') console.warn('MembershipRepo.removeUserFromGroup: Mongo 删除失败，已使用 MySQL 结果：', mongoRes.reason);
    return mysqlRes.status === 'fulfilled' ? mysqlRes.value : mongoRes.value;
  },

  async getGroupMembers(groupId) {
    if (READ_FROM === 'mongo' || READ_FROM === 'prefer-mongo') {
      try {
        // 支持传入数字ID或 ObjectId 字符串，统一解析为 mysqlId
        let gid = null;
        if ((typeof groupId === 'number' && Number.isFinite(groupId)) || (typeof groupId === 'string' && /^\d+$/.test(groupId))) {
          gid = (typeof groupId === 'number') ? Math.trunc(groupId) : parseInt(groupId, 10);
        } else if (typeof groupId === 'string' && /^[a-f\d]{24}$/i.test(groupId)) {
          const g = await GroupModel.findById(groupId).lean().catch(() => null);
          if (g && typeof g.mysqlId === 'number' && Number.isFinite(g.mysqlId)) gid = Math.trunc(g.mysqlId);
        }
        if (gid == null) return [];

        const memberships = await UserGroupMembershipModel.find({ group_id: gid }).lean();
        const userIds = memberships.map(m => parseInt(m.user_id)).filter(v => !isNaN(v));
        if (userIds.length === 0) return [];
        
        const users = await UserModel.find({ mysqlId: { $in: userIds } }).lean();

        return users.map(u => ({
          id: u.mysqlId, // 始终返回数字ID
          username: u.username,
          name: u.name,
          role: u.role,
          joined_at: memberships.find(m => m.user_id === u.mysqlId)?.joined_at || new Date()
        }));
      } catch (err) {
        console.warn('从 MongoDB 获取成员失败，回落到 MySQL:', err);
      }
    }
    
    // 从 MySQL 获取
    return new Promise((resolve, reject) => {
      const query = `
        SELECT u.id, u.username, u.name, u.role, ugm.joined_at
        FROM users u
        INNER JOIN user_group_memberships ugm ON u.id = ugm.user_id
        WHERE ugm.group_id = ?
        ORDER BY ugm.joined_at DESC
      `;
      safeQuery(query, [groupId], (err, results) => err ? reject(err) : resolve(results || []));
    });
  },

  async getUserGroups(userId) {
    if (READ_FROM === 'mongo' || READ_FROM === 'prefer-mongo') {
      try {
        // 解析 uid
        const isObjId = (v) => typeof v === 'string' && /^[a-f\d]{24}$/i.test(v);
        const isNumericLike = (v) => (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && /^\d+$/.test(v));

        let uid = null;
        if (isNumericLike(userId)) {
          uid = Number(userId);
        } else if (isObjId(userId)) {
          const u = await UserModel.findById(userId).lean().catch(() => null);
          if (u && typeof u.mysqlId === 'number' && Number.isFinite(u.mysqlId)) uid = Math.trunc(u.mysqlId);
        }
        if (uid == null) return [];

        const memberships = await UserGroupMembershipModel.find({ user_id: uid }).lean();
        const groupIds = memberships.map(m => m.group_id);
        if (groupIds.length === 0) return [];

        // 仅按 mysqlId 查询，避免返回 ObjectId 字符串
        const groups = await GroupModel.find({ mysqlId: { $in: groupIds } }).lean();

        return groups.map(g => ({
          id: g.mysqlId, // 始终返回数字ID
          name: g.name,
          description: g.description,
          leaders: Array.isArray(g.leaders) ? g.leaders : []
        }));
      } catch (err) {
        console.warn('从 MongoDB 获取用户的用户组失败，回落到 MySQL:', err);
      }
    }

    // MySQL 回退
    return new Promise((resolve, reject) => {
      const query = `
        SELECT g.id, g.name, g.description, g.leaders
        FROM \`groups\` g
        INNER JOIN user_group_memberships ugm ON g.id = ugm.group_id
        WHERE ugm.user_id = ?
      `;
      safeQuery(query, [userId], (err, rows) => {
        if (err) return reject(err);
        const groups = (rows || []).map(row => ({
          id: row.id,
          name: row.name,
          description: row.description,
          leaders: row.leaders ? row.leaders.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)) : []
        }));
        resolve(groups);
      });
    });
  },

  async replaceUserGroups(userId, groupIds = []) {
    // 解析 uid 为 mysql 数字ID（支持 number、纯数字字符串、ObjectId 字符串、ObjectId("...") 包裹形式）
    let uid = null;
    const idStrOrNum = (typeof userId === 'string') ? userId.trim() : userId;
  
    if (typeof idStrOrNum === 'number' && Number.isFinite(idStrOrNum)) {
      uid = Math.trunc(idStrOrNum);
    } else if (typeof idStrOrNum === 'string' && /^\d+$/.test(idStrOrNum)) {
      uid = parseInt(idStrOrNum, 10);
    } else if (typeof idStrOrNum === 'string') {
      const hexId = extractHexObjectId(idStrOrNum);
      if (hexId) {
        const u = await UserModel.findById(hexId).lean().catch(() => null);
        if (u && typeof u.mysqlId === 'number' && Number.isFinite(u.mysqlId)) {
          uid = Math.trunc(u.mysqlId);
        } else if (u && u.username) {
          // 回退：通过 username 从 MySQL 反查 id，并回填到 Mongo 的 mysqlId
          const fetchedId = await new Promise(resolve => {
            safeQuery('SELECT id FROM users WHERE username = ?', [u.username], (err, rows) => {
              if (err) return resolve(null);
              if (rows && rows.length && typeof rows[0].id === 'number' && Number.isFinite(rows[0].id)) {
                return resolve(Math.trunc(rows[0].id));
              }
              resolve(null);
            });
          });
          if (typeof fetchedId === 'number' && Number.isFinite(fetchedId)) {
            uid = fetchedId;
            try { await UserModel.updateOne({ _id: u._id }, { $set: { mysqlId: uid } }); } catch (_) {}
          }
        }
      }
    }
  
    if (uid == null) {
      throw new Error('无效的用户ID');
    }

    const normalizedGroupIds = await normalizeGroupIds(groupIds);

    const replaceMysql = async () => {
      // 使用事务确保删除+插入的原子性
      const ensureConn = async () => {
        let conn = getConnection();
        if (!conn || conn.state === 'disconnected') {
          await initializeConnection();
          conn = getConnection();
        }
        return conn;
      };

      const conn = await ensureConn();

      const begin = () => new Promise((resolve, reject) => conn.beginTransaction(err => err ? reject(err) : resolve()));
      const commit = () => new Promise((resolve, reject) => conn.commit(err => err ? reject(err) : resolve()));
      const rollback = () => new Promise((resolve) => conn.rollback(() => resolve()));
      const query = (sql, params=[]) => new Promise((resolve, reject) => conn.query(sql, params, (err, results) => err ? reject(err) : resolve(results)));

      try {
        await begin();
        await query('DELETE FROM user_group_memberships WHERE user_id = ?', [uid]);

        if (normalizedGroupIds.length > 0) {
          const placeholders = normalizedGroupIds.map(() => '(?, ?)').join(', ');
          const values = normalizedGroupIds.flatMap(gid => [uid, gid]);
          const sql = `INSERT INTO user_group_memberships (user_id, group_id) VALUES ${placeholders}`;
          await query(sql, values);
        }

        await commit();
        return { affectedRows: normalizedGroupIds.length };
      } catch (err) {
        try { await rollback(); } catch (_) {}
        throw err;
      }
    };

    const replaceMongo = async () => {
      // 删除现有关系
      await UserGroupMembershipModel.deleteMany({ user_id: uid });

      if (!normalizedGroupIds || normalizedGroupIds.length === 0) return { deletedCount: 0 };

      const docs = normalizedGroupIds.map(gid => ({ user_id: uid, group_id: gid }));
      const results = await UserGroupMembershipModel.insertMany(docs);
      return { insertedCount: results.length };
    };

    if (WRITE_MODE === 'mysql') return replaceMysql();
    if (WRITE_MODE === 'mongo') return replaceMongo();

    const [mysqlRes, mongoRes] = await Promise.allSettled([replaceMysql(), replaceMongo()]);
    if (mysqlRes.status === 'rejected' && mongoRes.status === 'rejected') throw (mysqlRes.reason || mongoRes.reason);
    if (mysqlRes.status === 'rejected') console.warn('MembershipRepo.replaceUserGroups: MySQL 替换成员关系失败，已使用 Mongo 结果：', mysqlRes.reason);
    if (mongoRes.status === 'rejected') console.warn('MembershipRepo.replaceUserGroups: Mongo 替换成员关系失败，已使用 MySQL 结果：', mongoRes.reason);
    return mysqlRes.status === 'fulfilled' ? mysqlRes.value : mongoRes.value;
  }
};

module.exports = { TodosRepo, UsersRepo, GroupsRepo, MembershipRepo };

// 新增：将 leaders 归一化为 MySQL 数字ID，兼容传入的数字、数字字符串、以及 Mongo ObjectId 字符串
async function normalizeLeaderIds(leaders) {
  if (!Array.isArray(leaders) || leaders.length === 0) return [];
  const result = [];

  for (const v of leaders) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      const n = Math.trunc(v);
      if (!Number.isNaN(n)) result.push(n);
      continue;
    }

    if (typeof v === 'string' && /^\d+$/.test(v)) {
      const n = parseInt(v, 10);
      if (!Number.isNaN(n)) result.push(n);
      continue;
    }

    if (typeof v === 'string') {
      const hex = extractHexObjectId(v);
      if (hex) {
        try {
          const u = await UserModel.findById(hex).lean().catch(() => null);
          if (u && typeof u.mysqlId === 'number' && Number.isFinite(u.mysqlId)) {
            result.push(Math.trunc(u.mysqlId));
          }
        } catch (_) {}
      }
    }
  }

  return Array.from(new Set(result));
}

// 新增：将 groupIds 归一化为 MySQL 数字ID，兼容传入的数字、数字字符串、以及 Mongo ObjectId 字符串
async function normalizeGroupIds(groupIds) {
  if (!Array.isArray(groupIds) || groupIds.length === 0) return [];
  const result = [];

  for (const v of groupIds) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      const n = Math.trunc(v);
      if (!Number.isNaN(n)) result.push(n);
      continue;
    }

    if (typeof v === 'string' && /^\d+$/.test(v)) {
      const n = parseInt(v, 10);
      if (!Number.isNaN(n)) result.push(n);
      continue;
    }

    if (typeof v === 'string' && /^[a-f\d]{24}$/i.test(v)) {
      try {
        const g = await GroupModel.findById(v).lean().catch(() => null);
        if (g && typeof g.mysqlId === 'number' && Number.isFinite(g.mysqlId)) {
          result.push(Math.trunc(g.mysqlId));
        }
      } catch (_) {}
    }
    if (typeof v === 'string') {
      const hex = extractHexObjectId(v);
      if (hex) {
        try {
          const g = await GroupModel.findById(hex).lean().catch(() => null);
          if (g && typeof g.mysqlId === 'number' && Number.isFinite(g.mysqlId)) {
            result.push(Math.trunc(g.mysqlId));
          }
        } catch (_) {}
      }
    }
  }

  return Array.from(new Set(result));
}

// 工具：提取可能包裹形式的 ObjectId，如 ObjectId("...") 或 ObjectId('...')，或直接 24hex
function extractHexObjectId(input) {
  if (typeof input !== 'string') return null;
  const s = input.trim();
  const m = s.match(/^ObjectId\((?:"|')?([a-f\d]{24})(?:"|')?\)$/i);
  if (m) return m[1];
  if (/^[a-f\d]{24}$/i.test(s)) return s;
  return null;
}