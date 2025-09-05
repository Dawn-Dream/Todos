/**
 * MongoDB数据访问层
 * 提供统一的数据访问接口，替换原有的SQL查询
 */

const {
  GroupModel,
  UserModel,
  UserGroupMembershipModel,
  TodoModel,
  SchemaMigrationModel
} = require('./mongodb-schema');
const { safeOperation, startTransaction, commitTransaction, abortTransaction } = require('./mongodb-connection');

/**
 * 用户组数据访问对象
 */
const GroupsRepo = {
  /**
   * 查找所有用户组
   * @returns {Promise<Array>} 用户组列表
   */
  async findAll() {
    return await safeOperation(async () => {
      const groups = await GroupModel.find({ deletedAt: null }).lean();
      return groups.map(group => ({
        id: group.mysqlId || group._id.toString(),
        name: group.name,
        description: group.description,
        leaders: group.leaders || [],
        created_at: group.createdAt
      }));
    }, '查找所有用户组');
  },

  /**
   * 根据ID查找用户组
   * @param {string|number} id - 用户组ID
   * @returns {Promise<Object|null>} 用户组对象
   */
  async findById(id) {
    return await safeOperation(async () => {
      let group;
      
      // 尝试通过mysqlId查找
      if (!isNaN(id)) {
        group = await GroupModel.findOne({ mysqlId: parseInt(id), deletedAt: null }).lean();
      }
      
      // 如果没找到，尝试通过ObjectId查找
      if (!group && id.toString().match(/^[0-9a-fA-F]{24}$/)) {
        group = await GroupModel.findOne({ _id: id, deletedAt: null }).lean();
      }
      
      if (!group) return null;
      
      return {
        id: group.mysqlId || group._id.toString(),
        name: group.name,
        description: group.description,
        leaders: group.leaders || [],
        created_at: group.createdAt
      };
    }, '根据ID查找用户组');
  },

  /**
   * 创建用户组
   * @param {Object} groupData - 用户组数据
   * @returns {Promise<Object>} 创建的用户组
   */
  async create(groupData) {
    return await safeOperation(async () => {
      // 获取下一个mysqlId
      const lastGroup = await GroupModel.findOne().sort({ mysqlId: -1 }).lean();
      const nextMysqlId = (lastGroup?.mysqlId || 0) + 1;
      
      const group = new GroupModel({
        mysqlId: nextMysqlId,
        name: groupData.name,
        description: groupData.description,
        leaders: groupData.leaders || []
      });
      
      const savedGroup = await group.save();
      
      return {
        id: savedGroup.mysqlId,
        name: savedGroup.name,
        description: savedGroup.description,
        leaders: savedGroup.leaders || [],
        created_at: savedGroup.createdAt
      };
    }, '创建用户组');
  },

  /**
   * 更新用户组
   * @param {string|number} id - 用户组ID
   * @param {Object} updateData - 更新数据
   * @returns {Promise<Object|null>} 更新后的用户组
   */
  async update(id, updateData) {
    return await safeOperation(async () => {
      const query = !isNaN(id) ? { mysqlId: parseInt(id) } : { _id: id };
      
      const updatedGroup = await GroupModel.findOneAndUpdate(
        query,
        {
          ...updateData,
          updatedAt: new Date()
        },
        { new: true, lean: true }
      );
      
      if (!updatedGroup) return null;
      
      return {
        id: updatedGroup.mysqlId || updatedGroup._id.toString(),
        name: updatedGroup.name,
        description: updatedGroup.description,
        leaders: updatedGroup.leaders || [],
        created_at: updatedGroup.createdAt
      };
    }, '更新用户组');
  },

  /**
   * 删除用户组
   * @param {string|number} id - 用户组ID
   * @returns {Promise<boolean>} 删除结果
   */
  async delete(id) {
    return await safeOperation(async () => {
      const query = !isNaN(id) ? { mysqlId: parseInt(id) } : { _id: id };
      const result = await GroupModel.deleteOne(query);
      return result.deletedCount > 0;
    }, '删除用户组');
  }
};

/**
 * 用户数据访问对象
 */
const UsersRepo = {
  /**
   * 查找所有用户
   * @returns {Promise<Array>} 用户列表
   */
  async findAll() {
    return await safeOperation(async () => {
      const users = await UserModel.find({ deletedAt: null }).lean();
      return users.map(user => ({
        id: user.mysqlId || user._id.toString(),
        username: user.username,
        name: user.name,
        role: user.role,
        group_id: user.groupId,
        created_at: user.createdAt
      }));
    }, '查找所有用户');
  },

  /**
   * 根据ID查找用户
   * @param {string|number} id - 用户ID
   * @returns {Promise<Object|null>} 用户对象
   */
  async findById(id) {
    return await safeOperation(async () => {
      let user;
      
      // 尝试通过mysqlId查找
      if (!isNaN(id)) {
        user = await UserModel.findOne({ mysqlId: parseInt(id), deletedAt: null }).lean();
      }
      
      // 如果没找到，尝试通过ObjectId查找
      if (!user && id.toString().match(/^[0-9a-fA-F]{24}$/)) {
        user = await UserModel.findOne({ _id: id, deletedAt: null }).lean();
      }
      
      if (!user) return null;
      
      return {
        id: user.mysqlId || user._id.toString(),
        username: user.username,
        name: user.name,
        password: user.password,
        role: user.role,
        group_id: user.groupId,
        created_at: user.createdAt
      };
    }, '根据ID查找用户');
  },

  /**
   * 根据用户名查找用户
   * @param {string} username - 用户名
   * @returns {Promise<Object|null>} 用户对象
   */
  async findByUsername(username) {
    return await safeOperation(async () => {
      const user = await UserModel.findOne({ username, deletedAt: null }).lean();
      if (!user) return null;
      
      return {
        id: user.mysqlId || user._id.toString(),
        username: user.username,
        name: user.name,
        password: user.password,
        role: user.role,
        group_id: user.groupId,
        created_at: user.createdAt
      };
    }, '根据用户名查找用户');
  },

  /**
   * 创建用户
   * @param {Object} userData - 用户数据
   * @returns {Promise<Object>} 创建的用户
   */
  async create(userData) {
    return await safeOperation(async () => {
      // 获取下一个mysqlId
      const lastUser = await UserModel.findOne().sort({ mysqlId: -1 }).lean();
      const nextMysqlId = (lastUser?.mysqlId || 0) + 1;
      
      const user = new UserModel({
        mysqlId: nextMysqlId,
        username: userData.username,
        name: userData.name,
        password: userData.password,
        role: userData.role || 'user',
        groupId: userData.group_id
      });
      
      const savedUser = await user.save();
      
      return {
        id: savedUser.mysqlId,
        username: savedUser.username,
        name: savedUser.name,
        role: savedUser.role,
        group_id: savedUser.groupId,
        created_at: savedUser.createdAt
      };
    }, '创建用户');
  },

  /**
   * 更新用户
   * @param {string|number} id - 用户ID
   * @param {Object} updateData - 更新数据
   * @returns {Promise<Object|null>} 更新后的用户
   */
  async update(id, updateData) {
    return await safeOperation(async () => {
      const query = !isNaN(id) ? { mysqlId: parseInt(id) } : { _id: id };
      
      const updatedUser = await UserModel.findOneAndUpdate(
        query,
        {
          ...updateData,
          groupId: updateData.group_id,
          updatedAt: new Date()
        },
        { new: true, lean: true }
      );
      
      if (!updatedUser) return null;
      
      return {
        id: updatedUser.mysqlId || updatedUser._id.toString(),
        username: updatedUser.username,
        name: updatedUser.name,
        role: updatedUser.role,
        group_id: updatedUser.groupId,
        created_at: updatedUser.createdAt
      };
    }, '更新用户');
  },

  /**
   * 删除用户
   * @param {string|number} id - 用户ID
   * @returns {Promise<boolean>} 删除结果
   */
  async delete(id) {
    return await safeOperation(async () => {
      const query = !isNaN(id) ? { mysqlId: parseInt(id) } : { _id: id };
      const result = await UserModel.deleteOne(query);
      return result.deletedCount > 0;
    }, '删除用户');
  }
};

/**
 * 用户组成员关系数据访问对象
 */
const MembershipRepo = {
  /**
   * 获取用户的所有用户组
   * @param {string|number} userId - 用户ID
   * @returns {Promise<Array>} 用户组列表
   */
  async getUserGroups(userId) {
    return await safeOperation(async () => {
      const memberships = await UserGroupMembershipModel.find({ userId: parseInt(userId) }).lean();
      const groupIds = memberships.map(m => m.groupId);
      
      if (groupIds.length === 0) return [];
      
      const groups = await GroupModel.find({ mysqlId: { $in: groupIds } }).lean();
      return groups.map(group => ({
        id: group.mysqlId,
        name: group.name,
        description: group.description,
        leaders: group.leaders || []
      }));
    }, '获取用户的所有用户组');
  },

  /**
   * 获取用户组的所有成员
   * @param {string|number} groupId - 用户组ID
   * @returns {Promise<Array>} 用户列表
   */
  async getGroupMembers(groupId) {
    return await safeOperation(async () => {
      const memberships = await UserGroupMembershipModel.find({ groupId: parseInt(groupId) }).lean();
      const userIds = memberships.map(m => m.userId);
      
      if (userIds.length === 0) return [];
      
      const users = await UserModel.find({ mysqlId: { $in: userIds } }).lean();
      return users.map(user => ({
        id: user.mysqlId,
        username: user.username,
        name: user.name,
        role: user.role
      }));
    }, '获取用户组的所有成员');
  },

  /**
   * 替换用户的用户组关系
   * @param {string|number} userId - 用户ID
   * @param {Array} groupIds - 新的用户组ID列表
   * @returns {Promise<void>}
   */
  async replaceUserGroups(userId, groupIds) {
    try {
      const userIdNum = parseInt(userId);
      const groupIdNums = groupIds.map(id => parseInt(id));
      
      // 删除现有关系
      await UserGroupMembershipModel.deleteMany({ userId: userIdNum });
      
      // 插入新关系
      if (groupIdNums.length > 0) {
        const memberships = groupIdNums.map(groupId => ({
          userId: userIdNum,
          groupId: groupId
        }));
        await UserGroupMembershipModel.insertMany(memberships);
      }
    } catch (error) {
      throw error;
    }
  },

  /**
   * 添加用户到用户组
   * @param {string|number} userId - 用户ID
   * @param {string|number} groupId - 用户组ID
   * @returns {Promise<void>}
   */
  async addUserToGroup(userId, groupId) {
    return await safeOperation(async () => {
      const membership = new UserGroupMembershipModel({
        userId: parseInt(userId),
        groupId: parseInt(groupId)
      });
      await membership.save();
    }, '添加用户到用户组');
  },

  /**
   * 从用户组中移除用户
   * @param {string|number} userId - 用户ID
   * @param {string|number} groupId - 用户组ID
   * @returns {Promise<boolean>} 移除结果
   */
  async removeUserFromGroup(userId, groupId) {
    return await safeOperation(async () => {
      const result = await UserGroupMembershipModel.deleteOne({
        userId: parseInt(userId),
        groupId: parseInt(groupId)
      });
      return result.deletedCount > 0;
    }, '从用户组中移除用户');
  }
};

/**
 * 任务数据访问对象
 */
const TodosRepo = {
  /**
   * 查找所有任务
   * @returns {Promise<Array>} 任务列表
   */
  async findAll() {
    return await safeOperation(async () => {
      const todos = await TodoModel.find({ deletedAt: null }).lean();
      return todos.map(todo => ({
        id: todo.mysqlId || todo._id.toString(),
        name: todo.name,
        description: todo.description,
        Belonging_users: todo.belongingUsers || [],
        Belonging_groups: todo.belongingGroups || [],
        Completion_time: todo.completionTime,
        create_time: todo.createdAt,
        update_time: todo.updatedAt,
        delete_time: todo.deletedAt,
        Deadline: todo.deadline,
        Priority: todo.priority,
        Status: todo.status,
        creator_id: todo.creatorId,
        administrator_id: todo.administratorId,
        admin_users: todo.adminUsers || []
      }));
    }, '查找所有任务');
  },

  /**
   * 根据ID查找任务
   * @param {string|number} id - 任务ID
   * @returns {Promise<Object|null>} 任务对象
   */
  async findById(id) {
    return await safeOperation(async () => {
      let todo;
      
      // 尝试通过mysqlId查找
      if (!isNaN(id)) {
        todo = await TodoModel.findOne({ mysqlId: parseInt(id), deletedAt: null }).lean();
      }
      
      // 如果没找到，尝试通过ObjectId查找
      if (!todo && id.toString().match(/^[0-9a-fA-F]{24}$/)) {
        todo = await TodoModel.findOne({ _id: id, deletedAt: null }).lean();
      }
      
      if (!todo) return null;
      
      return {
        id: todo.mysqlId || todo._id.toString(),
        name: todo.name,
        description: todo.description,
        Belonging_users: todo.belongingUsers || [],
        Belonging_groups: todo.belongingGroups || [],
        Completion_time: todo.completionTime,
        create_time: todo.createdAt,
        update_time: todo.updatedAt,
        delete_time: todo.deletedAt,
        Deadline: todo.deadline,
        Priority: todo.priority,
        Status: todo.status,
        creator_id: todo.creatorId,
        administrator_id: todo.administratorId,
        admin_users: todo.adminUsers || []
      };
    }, '根据ID查找任务');
  },

  /**
   * 创建任务
   * @param {Object} todoData - 任务数据
   * @returns {Promise<Object>} 创建的任务
   */
  async create(todoData) {
    return await safeOperation(async () => {
      // 获取下一个mysqlId
      const lastTodo = await TodoModel.findOne().sort({ mysqlId: -1 }).lean();
      const nextMysqlId = (lastTodo?.mysqlId || 0) + 1;
      
      const todo = new TodoModel({
        mysqlId: nextMysqlId,
        name: todoData.name,
        description: todoData.description,
        belongingUsers: todoData.Belonging_users || [],
        belongingGroups: todoData.Belonging_groups || [],
        deadline: todoData.Deadline,
        priority: todoData.Priority || 0,
        status: todoData.Status || 0,
        creatorId: todoData.creator_id,
        administratorId: todoData.administrator_id,
        adminUsers: todoData.admin_users || []
      });
      
      const savedTodo = await todo.save();
      
      return {
        id: savedTodo.mysqlId,
        name: savedTodo.name,
        description: savedTodo.description,
        Belonging_users: savedTodo.belongingUsers || [],
        Belonging_groups: savedTodo.belongingGroups || [],
        Completion_time: savedTodo.completionTime,
        create_time: savedTodo.createdAt,
        update_time: savedTodo.updatedAt,
        delete_time: savedTodo.deletedAt,
        Deadline: savedTodo.deadline,
        Priority: savedTodo.priority,
        Status: savedTodo.status,
        creator_id: savedTodo.creatorId,
        administrator_id: savedTodo.administratorId,
        admin_users: savedTodo.adminUsers || []
      };
    }, '创建任务');
  },

  /**
   * 更新任务
   * @param {string|number} id - 任务ID
   * @param {Object} updateData - 更新数据
   * @returns {Promise<Object|null>} 更新后的任务
   */
  async update(id, updateData) {
    return await safeOperation(async () => {
      const query = !isNaN(id) ? { mysqlId: parseInt(id) } : { _id: id };
      
      const updateFields = {
        name: updateData.name,
        description: updateData.description,
        belongingUsers: updateData.Belonging_users,
        belongingGroups: updateData.Belonging_groups,
        deadline: updateData.Deadline,
        priority: updateData.Priority,
        status: updateData.Status,
        completionTime: updateData.Completion_time,
        administratorId: updateData.administrator_id,
        adminUsers: updateData.admin_users,
        updatedAt: new Date()
      };
      
      // 移除undefined值
      Object.keys(updateFields).forEach(key => {
        if (updateFields[key] === undefined) {
          delete updateFields[key];
        }
      });
      
      const updatedTodo = await TodoModel.findOneAndUpdate(
        query,
        updateFields,
        { new: true, lean: true }
      );
      
      if (!updatedTodo) return null;
      
      return {
        id: updatedTodo.mysqlId || updatedTodo._id.toString(),
        name: updatedTodo.name,
        description: updatedTodo.description,
        Belonging_users: updatedTodo.belongingUsers || [],
        Belonging_groups: updatedTodo.belongingGroups || [],
        Completion_time: updatedTodo.completionTime,
        create_time: updatedTodo.createdAt,
        update_time: updatedTodo.updatedAt,
        delete_time: updatedTodo.deletedAt,
        Deadline: updatedTodo.deadline,
        Priority: updatedTodo.priority,
        Status: updatedTodo.status,
        creator_id: updatedTodo.creatorId,
        administrator_id: updatedTodo.administratorId,
        admin_users: updatedTodo.adminUsers || []
      };
    }, '更新任务');
  },

  /**
   * 删除任务
   * @param {string|number} id - 任务ID
   * @returns {Promise<boolean>} 删除结果
   */
  async delete(id) {
    return await safeOperation(async () => {
      const query = !isNaN(id) ? { mysqlId: parseInt(id) } : { _id: id };
      const result = await TodoModel.deleteOne(query);
      return result.deletedCount > 0;
    }, '删除任务');
  }
};

module.exports = {
  GroupsRepo,
  UsersRepo,
  MembershipRepo,
  TodosRepo
};