# ToDos - 小组任务管理系统

一个基于 Vue 3 + Node.js + MySQL 的现代化任务管理系统，支持多用户协作、用户组管理和权限控制。

## ✨ 功能特性

### 🔐 用户认证与权限
- **用户注册/登录**：支持用户注册、登录和JWT令牌认证
- **角色权限**：区分管理员和普通用户权限
- **令牌刷新**：自动刷新过期令牌，保持用户会话

### 👥 用户组管理
- **多用户组归属**：用户可以同时属于多个用户组
- **组长管理**：支持设置多个组长管理用户组
- **成员管理**：添加/移除用户组成员
- **权限继承**：基于用户组的任务访问权限

### 📋 任务管理
- **任务CRUD**：创建、查看、编辑、删除任务
- **任务属性**：
  - 优先级设置（低/中/高）
  - 状态管理（计划中/进行中/已完成/已取消）
  - 截止日期设置
  - 任务描述和详情
- **任务分配**：支持分配给特定用户或用户组
- **任务详情**：支持Markdown格式的详细描述

### 🛠️ 管理功能
- **用户管理**：管理员可以管理所有用户信息
- **用户组管理**：创建、编辑、删除用户组
- **权限控制**：基于角色和用户组的访问控制
- **数据统计**：任务完成情况统计

### 🎨 用户体验
- **响应式设计**：适配桌面端和移动端
- **现代化UI**：基于Tailwind CSS的美观界面
- **实时更新**：动态数据更新和状态同步
- **友好交互**：直观的操作流程和反馈

## 🛠️ 技术栈

### 前端
- **Vue 3**：现代化的渐进式JavaScript框架
- **Vue Router 4**：官方路由管理器
- **Axios**：HTTP客户端库
- **Tailwind CSS**：实用优先的CSS框架
- **DaisyUI**：Tailwind CSS组件库
- **Marked**：Markdown解析器
- **Vite**：快速的前端构建工具

### 后端
- **Node.js**：JavaScript运行时环境
- **Express.js**：Web应用框架
- **MySQL 8.0**：关系型数据库
- **JWT**：JSON Web Token认证
- **bcryptjs**：密码加密库
- **CORS**：跨域资源共享

### 部署
- **Docker**：容器化部署
- **Docker Compose**：多容器编排
- **Nginx**：反向代理和静态文件服务

## 📁 项目结构

```
Todos/
├── .env.example         # 环境变量示例文件
├── .github/             # GitHub Actions工作流
│   └── workflows/
│       └── docker-publish.yml
├── README.md            # 项目说明文档
├── docker-compose.yml   # Docker Compose配置
├── frontend.Dockerfile  # 前端Docker镜像构建文件
├── backend.Dockerfile   # 后端Docker镜像构建文件
├── package.json         # 前端依赖配置
├── vite.config.js       # Vite构建配置
├── tailwind.config.js   # Tailwind CSS配置
├── src/                 # 前端源码
│   ├── App.vue          # 根组件
│   ├── main.js          # 应用入口
│   ├── api.js           # API接口封装
│   ├── config.js        # 配置文件
│   ├── main.css         # 主样式文件
│   ├── components/      # Vue组件
│   │   ├── Login.vue    # 登录页面
│   │   ├── Register.vue # 注册页面
│   │   ├── Home.vue     # 主页面
│   │   ├── Admin.vue    # 管理后台
│   │   └── TaskDetail.vue # 任务详情
│   └── store/           # 状态管理
│       └── auth.js      # 认证状态管理
├── backend/             # 后端源码
│   ├── index.js         # 主服务文件
│   ├── design.md        # 后端设计文档
│   ├── package.json     # 后端依赖配置
│   └── todo-details/    # 任务详情存储目录
└── public/              # 静态资源
    └── favicon.ico      # 网站图标
```

## 🚀 快速开始

### 使用Docker部署（推荐）

1. **克隆项目**
   ```bash
   git clone <repository-url>
   cd Todos
   ```

2. **配置环境变量**
   ```bash
   cp .env.example .env
   # 编辑 .env 文件，设置数据库密码和JWT密钥
   ```

3. **启动服务**
   ```bash
   docker-compose up -d
   ```

4. **访问应用**
   - 前端：http://localhost:10001
   - 后端API：http://localhost:10002

### 本地开发

#### 前端开发
```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 启动tailwindcss watch
npm run tailwind:watch
```



#### 后端开发
```bash
cd backend

# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 启动生产服务器
npm start
```

## ⚙️ 环境变量配置

创建 `.env` 文件并配置以下变量：

```env
# 数据库配置
MYSQL_ROOT_PASSWORD=your_super_secret_db_password

# JWT配置
JWT_SECRET=your_super_secret_jwt_key
```

### 环境变量说明

- `MYSQL_ROOT_PASSWORD`：MySQL数据库root用户密码
- `JWT_SECRET`：JWT令牌签名密钥，建议使用长随机字符串

## 🗄️ 数据库设计

### 核心表结构

- **users**：用户信息表
- **groups**：用户组信息表
- **user_group_memberships**：用户-用户组关系表（支持多对多关系）
- **TodosList**：任务信息表

### 任务状态说明

- **-1**：计划中
- **0**：进行中
- **1**：已完成
- **2**：已取消

### 优先级说明

- **0**：低优先级
- **1**：中优先级
- **2**：高优先级

## 🔧 API接口

### 认证接口
- `POST /register` - 用户注册
- `POST /login` - 用户登录
- `POST /refresh-token` - 刷新令牌

### 用户管理
- `GET /users` - 获取用户列表
- `PUT /users/:id` - 更新用户信息
- `DELETE /users/:id` - 删除用户

### 用户组管理
- `GET /groups` - 获取用户组列表
- `GET /groups/:id` - 获取用户组详情
- `POST /groups` - 创建用户组
- `PUT /groups/:id` - 更新用户组
- `DELETE /groups/:id` - 删除用户组
- `POST /users/:userId/groups/:groupId` - 添加用户到组
- `DELETE /users/:userId/groups/:groupId` - 从组中移除用户
- `GET /groups/:groupId/members` - 获取组成员列表

### 任务管理
- `GET /todos` - 获取任务列表
- `GET /todos/:id` - 获取任务详情
- `POST /todos` - 创建任务
- `PUT /todos/:id` - 更新任务
- `DELETE /todos/:id` - 删除任务

### 任务详情
- `GET /todo-details/:id/exists` - 检查任务详情是否存在
- `POST /todo-details/:id` - 保存任务详情
- `GET /todo-details/:id` - 获取任务详情
- `DELETE /todo-details/:id` - 删除任务详情

## 🔒 权限说明

### 角色权限
- **管理员（admin）**：拥有所有权限，可以管理用户、用户组和所有任务
- **普通用户（user）**：只能管理自己的任务和所属用户组的任务

### 任务访问权限
- 任务创建者可以编辑和删除自己的任务
- 用户组成员可以查看组内任务
- 管理员可以访问所有任务

## 🐳 Docker部署说明

项目支持完整的Docker容器化部署：

- **frontend**：前端服务容器（端口10001）
- **backend**：后端API服务容器（端口10002）
- **database**：MySQL数据库容器

所有服务通过Docker网络互联，数据持久化存储在Docker卷中。

## 📝 开发说明

### 代码规范
- 前端使用Vue 3 Composition API
- 后端使用Express.js RESTful API设计
- 数据库使用MySQL 8.0
- 所有密码使用bcrypt加密存储
- JWT令牌用于用户认证和授权

### 安全特性
- 密码加密存储
- JWT令牌认证
- CORS跨域保护
- SQL注入防护
- XSS攻击防护

## 📄 许可证

本项目采用开源许可证，详见 [LICENSE](LICENSE) 文件。

## 🤝 贡献

欢迎提交Issue和Pull Request来改进项目！

## 📞 支持

如有问题或建议，请通过以下方式联系：
- 提交GitHub Issue
- 发送邮件至项目维护者

---

**ToDos** - 让任务管理更简单高效！
