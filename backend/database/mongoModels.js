const mongoose = require('mongoose');

// Users
const UserSchema = new mongoose.Schema({
  mysqlId: { type: Number },
  username: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user', index: true },
  created_at: { type: Date, default: Date.now }
}, { collection: 'users' });

// Groups
const GroupSchema = new mongoose.Schema({
  mysqlId: { type: Number },
  name: { type: String, required: true, unique: true, index: true },
  description: { type: String },
  leaders: { type: [Number], default: [] },
  created_at: { type: Date, default: Date.now }
}, { collection: 'groups' });

// User-Group Memberships (many-to-many)
const UserGroupMembershipSchema = new mongoose.Schema({
  user_id: { type: Number, required: true, index: true }, // 初期保留数值ID用于对账
  group_id: { type: Number, required: true, index: true },
  joined_at: { type: Date, default: Date.now }
}, { collection: 'user_group_memberships' });

// Todos
const TodoSchema = new mongoose.Schema({
  mysqlId: { type: Number },
  name: { type: String, required: true },
  description: { type: String },
  Belonging_users: { type: [Number], default: [] },
  Belonging_groups: { type: [Number], default: [] },
  Completion_time: { type: Date },
  create_time: { type: Date, default: Date.now },
  update_time: { type: Date, default: Date.now },
  delete_time: { type: Date },
  Deadline: { type: Date },
  Priority: { type: Number, default: 0 },
  Status: { type: Number, default: 0 },
  // 改为 Mixed，兼容数值ID和字符串ID（Mongo ObjectId 字符串）
  creator_id: { type: mongoose.Schema.Types.Mixed },
  administrator_id: { type: mongoose.Schema.Types.Mixed }
}, { collection: 'todos' });

// 手动创建索引，避免重复索引警告
UserSchema.index({ mysqlId: 1 });
GroupSchema.index({ mysqlId: 1 });
TodoSchema.index({ mysqlId: 1 });
TodoSchema.index({ creator_id: 1 });
TodoSchema.index({ Belonging_users: 1 });
TodoSchema.index({ Belonging_groups: 1 });
TodoSchema.index({ Deadline: -1 });

module.exports = {
  UserModel: mongoose.model('User', UserSchema),
  GroupModel: mongoose.model('Group', GroupSchema),
  UserGroupMembershipModel: mongoose.model('UserGroupMembership', UserGroupMembershipSchema),
  TodoModel: mongoose.model('Todo', TodoSchema)
};