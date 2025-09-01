// 认证状态管理
// 包含用户验证、JWT令牌、过期机制和权限管理
import { ref, computed } from 'vue'
import axios from 'axios'
import { API_BASE_URL } from '../config'

export function createAuthStore() {
  // 从localStorage获取认证状态
  const isAuthenticated = ref(false)
  const user = ref(null)
  const token = ref(localStorage.getItem('authToken') || null)
  const tokenExpiry = ref(localStorage.getItem('authTokenExpiry') || null)
  const groupName = ref('')
  
  
  
  // 支持多用户组
  const userGroups = ref([])

  // 初始化时检查token有效性
  // 注意：这里会从localStorage读取之前保存的token，如果有效则自动登录
  initAuth()

  function initAuth() {
    if (token.value && tokenExpiry.value) {
      const expiryTime = parseInt(tokenExpiry.value)
      if (Date.now() < expiryTime) {
        // Token未过期，解析用户信息
        try {
          const decoded = decodeToken(token.value)
          isAuthenticated.value = true
          // 直接使用解码后的token数据，因为后端返回的token中没有user对象
      user.value = {
        id: decoded.userId,
        username: decoded.username,
        name: decoded.name,
        role: decoded.role,
        groupId: decoded.groupId || null
      }
        } catch (error) {
          console.error('Token解析失败:', error)
          clearAuthData()
        }
      } else {
        // Token已过期
        clearAuthData()
      }
    }
  }

  // 注册函数
  async function register(username, name, password, group) {
    try {
      // 调用后端注册API
      const response = await axios.post(`${API_BASE_URL}/register`, { username, name, password, groupId: group })
      
      return { success: true, message: response.data.message }
    } catch (error) {
      console.error('注册失败:', error)
      if (error.response && error.response.data && error.response.data.message) {
        return { success: false, message: error.response.data.message }
      }
      return { success: false, message: '注册失败，请重试' }
    }
  }

  // 登录函数
  async function login(username, password) {
    try {
      // 调用后端登录API
      const response = await axios.post(`${API_BASE_URL}/login`, { username, password })
      
      const { token: newToken, user: userInfo } = response.data
      
      // 计算过期时间（JWT通常包含exp字段）
      const decodedToken = decodeToken(newToken)
      const expiry = decodedToken.exp * 1000 // JWT的exp是秒数，转换为毫秒

      // 存储认证数据
      token.value = newToken
      tokenExpiry.value = expiry.toString()
      localStorage.setItem('authToken', newToken)
      localStorage.setItem('authTokenExpiry', expiry.toString())

      // 更新状态
      isAuthenticated.value = true
      user.value = {
        ...userInfo,
        groupId: userInfo.groupId || null
      }

      return { success: true, message: '登录成功' }
    } catch (error) {
      console.error('登录失败:', error)
      if (error.response && error.response.data && error.response.data.message) {
        return { success: false, message: error.response.data.message }
      }
      return { success: false, message: '登录失败，请重试' }
    }
  }

  // 退出登录函数
  function logout() {
    clearAuthData()
  }

  // 清除认证数据
  function clearAuthData() {
    token.value = null
    tokenExpiry.value = null
    isAuthenticated.value = false
    user.value = null
    localStorage.removeItem('authToken')
    localStorage.removeItem('authTokenExpiry')
  }

  // 强制清除所有认证数据（包括localStorage）
  function forceLogout() {
    clearAuthData()
    // 确保完全清除，防止任何残留数据导致的自动登录
    window.location.reload()
  }
  // 解析JWT令牌
  function decodeToken(token) {
    try {
      const parts = token.split('.')
      if (parts.length !== 3) {
        throw new Error('无效的token格式')
      }

      // 使用TextDecoder处理可能的中文字符
      const base64Url = parts[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      
      const decodedPayload = JSON.parse(jsonPayload);
      return decodedPayload;
    } catch (error) {
      console.error('Token解析错误:', error);
      throw new Error('token解析失败');
    }
  }

  // 检查权限
  function hasPermission(permission) {
    return isAuthenticated.value &&
           user.value &&
           user.value.permissions &&
           user.value.permissions.includes(permission)
  }

  // 检查角色
  function hasRole(role) {
    return isAuthenticated.value &&
           user.value &&
           user.value.role === role
  }

  // 刷新token
  async function refreshToken() {
    try {
      if (!isAuthenticated.value || !token.value || !tokenExpiry.value) {
        return { success: false, message: '未登录或token无效' }
      }

      const currentTime = Date.now()
      const expiryTime = parseInt(tokenExpiry.value)

      // 在token过期前5分钟刷新
      if (currentTime < expiryTime - 300000) {
        return { success: false, message: 'token未到刷新时间' }
      }

      // 调用后端刷新token API
      const response = await axios.post(`${API_BASE_URL}/refresh-token`, {}, {
        headers: {
          Authorization: `Bearer ${token.value}`
        }
      })

      const { token: newToken } = response.data
      
      // 计算过期时间（JWT通常包含exp字段）
      const decodedToken = decodeToken(newToken)
      const expiry = decodedToken.exp * 1000 // JWT的exp是秒数，转换为毫秒

      // 更新token
      token.value = newToken
      tokenExpiry.value = expiry.toString()
      localStorage.setItem('authToken', newToken)
      localStorage.setItem('authTokenExpiry', expiry.toString())
      
      // 更新用户信息
      user.value = {
        ...user.value,
        groupId: decodedToken.groupId || null
      }

      return { success: true, message: 'token刷新成功' }
    } catch (error) {
      console.error('token刷新失败:', error)
      clearAuthData()
      return { success: false, message: 'token刷新失败，请重新登录' }
    }
  }

  // 获取当前登录用户的所有用户组
  async function fetchUserGroups() {
    try {
      if (!isAuthenticated.value || !token.value || !user.value) {
        userGroups.value = []
        return { success: false, message: '未登录或用户信息无效' }
      }
      const resp = await axios.get(`${API_BASE_URL}/user/groups`, {
        headers: { Authorization: `Bearer ${token.value}` }
      })
      userGroups.value = resp.data.groups || []

      // 同步一个聚合的groupName用于兼容旧UI（多组时用 / 拼接）
      if (userGroups.value.length === 0) {
        groupName.value = '默认用户组'
      } else if (userGroups.value.length === 1) {
        groupName.value = userGroups.value[0].name
      } else {
        groupName.value = userGroups.value.map(g => g.name).join(' / ')
      }

      return { success: true, groups: userGroups.value }
    } catch (err) {
      console.error('获取当前用户组失败:', err)
      return { success: false, message: '获取当前用户组失败' }
    }
  }
  // 获取用户组名称
  async function fetchGroupName() {
    // 确保用户信息已完全加载
    if (user.value) {
      // 如果用户没有groupId，设置默认用户组名称
      if (!user.value.groupId) {
        groupName.value = '默认用户组';
        return { success: true, message: '用户未分配到任何用户组' };
      }
      
      try {
        const response = await axios.get(`${API_BASE_URL}/groups/${user.value.groupId}`, {
          headers: {
            Authorization: `Bearer ${token.value}`
          }
        });
        groupName.value = response.data.group.name;
        return { success: true, groupName: response.data.group.name, group: response.data.group };
      } catch (err) {
        console.error('获取用户组信息错误:', err);
        // 如果是404错误，说明用户组已被删除，需要更新用户信息
        if (err.response && err.response.status === 404) {
          // 将用户的groupId设置为null
          user.value.groupId = null;
          // 设置默认的用户组名称
          groupName.value = '默认用户组';
          return { success: true, message: '用户组已被删除，已更新为默认用户组' };
        }
        // 如果是401错误，将在调用处处理token刷新逻辑
        return { success: false, message: '获取用户组信息失败' };
      }
    } else {
      console.log('用户信息未完全加载，无法获取用户组名称');
      return { success: false, message: '用户信息未完全加载' };
    }
  };

  return {
    isAuthenticated,
    user,
    token,
    groupName, // 暴露groupName
    // 多组支持
    userGroups,
    // 方法
    login,
    register,
    logout,
    forceLogout,
    hasPermission,
    hasRole,
    refreshToken,
    fetchGroupName, // 暴露fetchGroupName方法
    fetchUserGroups // 暴露fetchUserGroups方法
  }
}