# ToDos - 小组任务管理系统（完整说明）

一个基于 Vue 3 + Vite + Node.js + Express + MySQL 的现代化任务管理系统，支持多用户、多用户组、精细化权限与任务详情（Markdown）。

本 README 覆盖：功能特性、架构与目录、环境变量、启动与部署、API 列表、权限模型、数据库迁移、常见问题等，确保你能快速、稳定地运行与二次开发。

---

## 功能总览

- 认证与会话
  - 用户注册/登录，JWT 认证与自动刷新
  - 本地持久化 token（localStorage），前端拦截器自动带上 Authorization: Bearer <token>
- 用户与用户组
  - 用户可同时属于多个用户组（多对多）
  - 组长（leaders）与成员（members）管理
- 任务管理（Todos）
  - 创建/查看/编辑/删除任务，支持优先级、状态、截止时间、分配到用户或用户组
  - 任务详情 Markdown 存储到后端文件系统
- 访问控制（核心）
  - 服务器端对 GET /todos 与 GET /todos/:id 做严格权限过滤
  - 只有创建者/管理员/属于任务 Belonging_users 或与任务 Belonging_groups 相交的成员可见
  - 编辑/删除继续由后端权限中间件校验
- 部署与维护
  - Docker Compose 一键三件套（前端/后端/数据库）
  - 后端启动自动建库、自动迁移（带并发锁），数据库持续演进

---

## 技术栈

- 前端：Vue 3、Vue Router、Axios、Tailwind CSS、DaisyUI、Marked、Vite
- 后端：Node.js、Express、JWT、bcryptjs、mysql2
- 数据库：MySQL 8.0
- 部署：Docker / Docker Compose（生产镜像已提供）

---

## 项目结构

```
Todos/
├── docker-compose.yml          # Docker 一键部署
├── frontend.Dockerfile         # 前端镜像
├── backend.Dockerfile          # 后端镜像
├── .env.example                # Docker 部署需要的环境变量示例
├── src/                        # 前端源码
│   ├── components/             # 视图组件（Home / Admin / TaskDetail / Login / Register）
│   ├── store/auth.js           # 认证与多组支持（token/刷新/组名/组列表）
│   ├── api.js                  # Axios 封装（自动带 token、401 自动刷新）
│   └── config.js               # API_BASE_URL = '/api'（通过反向代理访问后端）
├── backend/
│   ├── index.js                # Express 入口（鉴权、路由、权限校验、详情文件读写）
│   └── database/               # 数据库连接与迁移
│       ├── connection.js       # 自动创建库、重试、断线重连、安全查询
│       ├── schema.js           # 表结构 DDL
│       └── migration.js        # 版本迁移与并发锁
└── README.md
```

---

## 环境变量

创建 .env（Docker 部署在项目根目录；本地后端可在 backend/.env）并配置：

```
# Docker 部署必填
MYSQL_ROOT_PASSWORD=强随机密码
JWT_SECRET=强随机JWT密钥

# 本地后端（backend/.env）可用（如不使用 Docker）
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=你的数据库密码
DB_NAME=todos_db
PORT=3000
```

说明：
- 后端启动将自动创建 DB_NAME 指定的数据库（若不存在），并执行所有未应用的迁移。
- 生产环境务必使用强随机的 JWT_SECRET 与数据库密码，不要提交到版本库。

---

## 启动与部署

### 方式一：Docker 一键启动（推荐）

1) 准备环境变量
```
cp .env.example .env
# 编辑 .env，设置 MYSQL_ROOT_PASSWORD 与 JWT_SECRET
```

2) 启动
```
docker-compose up -d
```

3) 访问
- 前端：http://localhost:10001
- 后端（直连）：http://localhost:10002

> 说明：前端镜像内置 Nginx 将 /api 反向代理到后端，无需改动前端代码。

### 方式二：本地开发（独立运行前后端）

- 启动数据库（自行安装 MySQL 8.0），创建用户/密码
- 后端
```
cd backend
npm install
# backend/.env 内设置 DB_ 系列变量与 JWT_SECRET
npm run dev
```
- 前端
```
npm install
# 开发环境下，Vite 未设置 /api 代理。
# 临时方案 A：将 src/config.js 的 API_BASE_URL 改成 'http://localhost:3000'
# 临时方案 B：自行在 Vite 配置 server.proxy 将 /api 指向 http://localhost:3000
npm run dev
```

---

## 权限与安全

- 登录成功后，前端把 token 与过期时间写入 localStorage；请求自动带 Authorization: Bearer <token>
- 401 将自动尝试调用 POST /refresh-token 刷新 token；失败会强制登出
- 列表与详情接口服务器端强制过滤：
  - GET /todos 仅返回：创建者/管理员/Belonging_users 含当前用户/Belonging_groups 与用户任一所属组相交的任务
  - GET /todos/:id 若无权限返回 403
- 编辑/删除接口继续通过权限中间件校验（创建者/管理员/组长/关联成员等）

---

## 数据库与迁移

- 表：users、groups、user_group_memberships（多对多）、TodosList、schema_migrations
- 启动流程：
  1. 自动创建数据库（若不存在）
  2. 获取迁移锁（MySQL 命名锁）避免并发迁移
  3. 执行未应用的版本迁移并记录
- 已包含迁移：
  - v1: 初始表结构（users/groups/user_group_memberships/TodosList）
  - v2: 兼容历史 group_id 到关系表的迁移

> 提醒：如需修改数据库结构，务必编写新的迁移版本（backend/database/migration.js），并在发布前做好备份与回滚方案。

---

## API 速览

- 认证
  - POST /register
  - POST /login
  - POST /refresh-token
- 用户
  - GET /users
  - PUT /users/:id
  - DELETE /users/:id
  - GET /user/groups            # 当前登录用户所属的所有用户组
- 用户组
  - GET /groups
  - GET /groups/:id
  - POST /groups
  - PUT /groups/:id
  - DELETE /groups/:id
  - POST /users/:userId/groups/:groupId
  - DELETE /users/:userId/groups/:groupId
  - GET /groups/:groupId/members
- 任务（Todos）
  - GET /todos                  # 服务器端已做权限过滤
  - GET /todos/:id              # 服务器端鉴权，无权访问 403
  - POST /todos
  - PUT /todos/:id
  - DELETE /todos/:id
- 任务详情（Markdown）
  - GET /todo-details/:id/exists
  - POST /todo-details/:id
  - GET /todo-details/:id
  - DELETE /todo-details/:id

字段约定：
- Status: -1=计划中, 0=进行中, 1=已完成, 2=已取消
- Priority: '低' | '普通' | '重要' | '紧急'

---

## 前端开发要点

- 入口 <src/main.js>，页面在 <src/components/>
- Axios 实例在 <src/api.js>：自动加 token + 401 自动刷新
- 认证与多组状态在 <src/store/auth.js>：
  - localStorage token 持久化
  - refreshToken 与 fetchUserGroups
- API_BASE_URL 在 <src/config.js>，默认 '/api'（需由反向代理映射到后端）

---

## 任务详情存储

- 后端把每个任务详情保存为 Markdown 文件（在容器中挂载卷：todo_details）
- Docker Compose 已将目录持久化到卷，升级/重启不丢失

---

## 常见问题

1) 前端本地开发请求失败 404/网络错误？
- 因为 API_BASE_URL='/api' 需要本地反向代理
- 方案 A：临时将 src/config.js 改为 'http://localhost:3000'
- 方案 B：在 Vite 设置 server.proxy（推荐团队配置）

2) 登录后仍看见其他组的任务？
- 现在 GET /todos 在后端已严格过滤；若仍出现，请检查你的账号是否为管理员/创建者，或任务是否确实关联了你所在组

3) 首次运行数据库连不上？
- 后端已带重试，确认 DB_HOST/PORT/USER/PASSWORD/DB_NAME 与实例一致，确认数据库服务已启动

4) 如何成为管理员？
- 通过管理员账号在“用户管理”中升级，或调用 PUT /users/:id 设置 role=admin（初始管理员需要运维侧在数据库中设定）

---

## 许可证与贡献

- 许可证：详见 LICENSE
- 欢迎提交 Issue / PR 改进项目

—

让团队协作与任务管理更简单！
