// 全局配置文件

// 后端API基础URL
// 通过Nginx代理访问后端服务
const isVite = import.meta.env.MODE === 'development'

export const API_BASE_URL = isVite 
  ? 'http://localhost:3000' // Vite开发环境
  : '/api' // 生产环境