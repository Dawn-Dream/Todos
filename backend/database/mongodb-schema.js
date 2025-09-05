/**
 * MongoDB数据模型设计
 * 基于原有MySQL表结构设计的MongoDB集合架构
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

// 用户组集合
const GroupSchema = new Schema({
  _id: { type: Schema.Types.ObjectId, auto: true },
  mysqlId: { type: Number, unique: true, sparse: true }, // 迁移期间保留MySQL ID映射
  name: { type: String, required: true, unique: true, maxlength: 50 },
  description: { type: String },
  leaders: [{ type: Number }], // 存储用户的mysqlId数组
  createdAt: { type: Date, default: Date.now }
}, {
  collection: 'groups',
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' }
});

// 用户集合
const UserSchema = new Schema({
  _id: { type: Schema.Types.ObjectId, auto: true },
  mysqlId: { type: Number, unique: true, sparse: true }, // 迁移期间保留MySQL ID映射
  username: { type: String, required: true, unique: true, maxlength: 50 },
  name: { type: String, required: true, maxlength: 100 },
  password: { type: String, required: true },
  role: { type: String, default: 'user', enum: ['user', 'admin'] },
  groupId: { type: Number }, // 主要用户组的mysqlId，保持向后兼容
  createdAt: { type: Date, default: Date.now }
}, {
  collection: 'users',
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' }
});

// 用户组成员关系集合
const UserGroupMembershipSchema = new Schema({
  _id: { type: Schema.Types.ObjectId, auto: true },
  userId: { type: Number, required: true }, // 用户的mysqlId
  groupId: { type: Number, required: true }, // 用户组的mysqlId
  joinedAt: { type: Date, default: Date.now }
}, {
  collection: 'user_group_memberships'
});

// 为用户组成员关系创建复合唯一索引
UserGroupMembershipSchema.index({ userId: 1, groupId: 1 }, { unique: true });

// 任务集合
const TodoSchema = new Schema({
  _id: { type: Schema.Types.ObjectId, auto: true },
  mysqlId: { type: Number, unique: true, sparse: true }, // 迁移期间保留MySQL ID映射
  name: { type: String, required: true, maxlength: 255 },
  description: { type: String },
  belongingUsers: [{ type: Number }], // 存储用户mysqlId数组
  belongingGroups: [{ type: Number }], // 存储用户组mysqlId数组
  completionTime: { type: Date },
  deadline: { type: Date },
  priority: { type: Number, default: 0 },
  status: { type: Number, default: 0 },
  creatorId: { type: Number }, // 创建者的mysqlId
  administratorId: { type: Number }, // 管理员的mysqlId
  adminUsers: [{ type: Number }], // 任务管理员数组，存储用户mysqlId
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  deletedAt: { type: Date, default: null }
}, {
  collection: 'todos',
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' }
});

// 数据库迁移版本记录集合
const SchemaMigrationSchema = new Schema({
  version: { type: Number, required: true, unique: true },
  name: { type: String, required: true },
  appliedAt: { type: Date, default: Date.now }
}, {
  collection: 'schema_migrations'
});

// 创建模型
const GroupModel = mongoose.model('Group', GroupSchema);
const UserModel = mongoose.model('User', UserSchema);
const UserGroupMembershipModel = mongoose.model('UserGroupMembership', UserGroupMembershipSchema);
const TodoModel = mongoose.model('Todo', TodoSchema);
const SchemaMigrationModel = mongoose.model('SchemaMigration', SchemaMigrationSchema);

// 创建索引
async function createIndexes() {
  try {
    // 用户组索引
    await GroupModel.collection.createIndex({ name: 1 }, { unique: true });
    
    // 用户索引
    await UserModel.collection.createIndex({ username: 1 }, { unique: true });
    await UserModel.collection.createIndex({ groupId: 1 });
    await TodoModel.collection.createIndex({ creatorId: 1 });
    await TodoModel.collection.createIndex({ mysqlId: 1 }, { unique: true, sparse: true });
    await TodoModel.collection.createIndex({ belongingUsers: 1 });
    await TodoModel.collection.createIndex({ belongingGroups: 1 });
    await TodoModel.collection.createIndex({ status: 1 });
    await TodoModel.collection.createIndex({ createdAt: -1 });
    
    console.log('MongoDB索引创建完成');
  } catch (error) {
    console.error('创建索引失败:', error);
  }
}

module.exports = {
  GroupModel,
  UserModel,
  UserGroupMembershipModel,
  TodoModel,
  SchemaMigrationModel,
  createIndexes
};