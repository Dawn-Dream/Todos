<template>
  <div class="min-h-screen bg-gray-50">
    <nav class="fixed top-0 left-0 right-0 z-50 flex items-center px-4 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 justify-between">
      <div class="flex items-center">
        <a class="transition-all duration-500 text-2xl font-bold text-white hover:text-gray-300" href="/home">ToDos</a>
      </div>
      
      <div class="flex items-center space-x-4">
        <div class="relative group">
          <div class="flex items-center space-x-2 cursor-pointer text-white py-1 px-3 rounded-lg transition-all duration-300 bg-indigo-600 hover:bg-indigo-700">
            <div class="flex flex-col items-start">
              <span class="font-medium text-1xl">{{ user.name || 'Guest' }}</span>
              <span class="text-xs text-indigo-200 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                <template v-if="userGroups && userGroups.length > 0">
                  <span v-for="g in userGroups" :key="g.id" class="mr-2">
                    {{ g.name }}
                    <span v-if="g.leaders && g.leaders.length > 0" class="ml-1">
                      (组长: {{ g.leaders.map(id => {
                        const u = allUsers.find(u => u.id === id);
                        return u ? u.name : id;
                      }).join(', ') }})
                    </span>
                  </span>
                </template>
                <template v-else>
                  无用户组
                </template>
              </span>
            </div>
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
            </svg>
          </div>
          <div class="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-20">
            <a href="#" class="block px-4 py-2 text-sm text-gray-500 hover:bg-gray-100">个人信息 </a>
            <a href="#" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">系统设置 未实现</a>
            <a v-if="user && user.role === 'admin'" href="/admin" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">后台管理</a>
            <button @click="forceLogout" class="w-full text-left block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors duration-200">
              <span class="flex items-center text-red-600 font-medium">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                登出
              </span>
            </button>
          </div>
        </div>
      </div>
    </nav>
    
    <div class="container mx-auto px-4 pt-20 pb-8">
      <!-- 饼：组长可在此处设置通知 -->
      <h1 class="text-3xl font-bold text-gray-800 mb-6">欢迎来到任务管理系统</h1>
      <p class="text-gray-600 mb-8">在这里您可以管理您的所有任务，提高工作效率。</p>
      
      <!-- Todos展示区域 -->
      <div class="mt-8">
        <h2 class="text-2xl font-semibold text-gray-700 mb-4">我的任务</h2>
        
        <!-- 加载状态 -->
        <div v-if="loading" class="text-center py-8">
          <div class="loading loading-spinner loading-lg"></div>
          <p class="mt-2 text-gray-600">加载中...</p>
        </div>
        
        <!-- 错误状态 -->
        <div v-else-if="error" class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
          <strong class="font-bold">错误: </strong>
          <span class="block sm:inline">{{ error }}</span>
        </div>
        
        <!-- 空状态 -->
        <div v-else-if="todos.length === 0" class="text-center py-8 bg-white rounded-lg shadow">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 mx-auto text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p class="mt-2 text-gray-600">暂无任务</p>
          <button @click="showAddTodoModal" class="mt-4 btn btn-primary">添加新任务</button>
        </div>
        
        <!-- Todos列表 -->
        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div 
            v-for="todo in todos" 
            :key="todo.id" 
            class="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow duration-300 cursor-pointer"
            @click="goToTaskDetail(todo.id)"
          >
            <div class="p-6">
              <div class="flex justify-between items-start">
                <h3 class="text-xl font-semibold text-gray-800">{{ todo.name }}</h3>
                <span 
                  class="px-2 py-1 text-xs font-semibold rounded-full" 
                  :class="{
                    'bg-blue-100 text-blue-800': todo.Status == -1, // 计划中
                    'bg-yellow-100 text-yellow-800': todo.Status == 0, // 进行中
                    'bg-green-100 text-green-800': todo.Status == 1, // 已完成
                    'bg-red-100 text-red-800': todo.Status == 2 // 已取消
                  }"
                >
                  {{ getStatusText(todo.Status) }}
                </span>
              </div>
              
              <p class="mt-2 text-gray-600" v-if="todo.description">{{ todo.description.length > 100 ? todo.description.substring(0, 100) + '...' : todo.description }}</p>
              
              <div class="mt-4 flex flex-wrap gap-2">
                <span 
                  class="px-2 py-1 text-xs font-semibold rounded-full" 
                  :class="{
                    'bg-red-100 text-red-800': todo.Priority === '紧急',
                    'bg-orange-100 text-orange-800': todo.Priority === '重要',
                    'bg-blue-100 text-blue-800': todo.Priority === '普通',
                    'bg-gray-100 text-gray-800': todo.Priority === '低'
                  }"
                >
                  {{ todo.Priority }}
                </span>
                
                <span v-if="todo.Deadline" class="px-2 py-1 text-xs font-semibold rounded-full bg-purple-100 text-purple-800">
                  截止: {{ formatDate(todo.Deadline) }}
                </span>
              </div>
              
              <div class="mt-4 flex flex-wrap gap-2">
                <span v-if="todo.Belonging_users && todo.Belonging_users.length > 0" class="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                  用户: {{ todo.Belonging_users.map(id => {
                    const user = allUsers.find(u => u.id === id);
                    return user ? user.name : id;
                  }).join(', ') }}
                </span>
                <span v-if="todo.Belonging_groups && todo.Belonging_groups.length > 0" class="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                  组: {{ todo.Belonging_groups.map(id => {
                    const group = allGroups.find(g => g.id === id);
                    return group ? group.name : id;
                  }).join(', ') }}
                </span>
              </div>
              
              <div class="mt-4 flex justify-between items-center">
                <span class="text-xs text-gray-500">创建于 {{ formatDate(todo.create_time) }}</span>
                <div class="flex space-x-2">
                  <button 
                    @click.stop="editTodoDetail(todo.id)" 
                    class="btn btn-sm btn-outline btn-primary"
                  >
                    查看详情
                  </button>
                  <button 
                    v-if="checkEditPermission(todo)"
                    @click.stop="editTodo(todo)" 
                    class="btn btn-sm btn-outline btn-primary"
                  >
                    编辑
                  </button>
                  <button 
                    v-if="checkEditPermission(todo)"
                    @click.stop="deleteTodo(todo.id)" 
                    class="btn btn-sm btn-outline btn-error"
                  >
                    删除
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 浮动添加Todo按钮 -->
    <div class="fixed bottom-8 right-8 z-40 transition-all duration-300 hover:scale-110">
      <button 
        @click="showAddTodoModal"
        class="btn btn-primary btn-circle btn-lg shadow-lg hover:shadow-xl transition-all duration-300"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
      </button>
    </div>
    
    <!-- Toast提醒容器 -->
    <div class="toast toast-start toast-bottom z-50">
      <div v-if="toastMessage" :class="['alert', toastType === 'success' ? 'alert-success' : 'alert-error']">
        <!-- 成功图标 -->
        <svg v-if="toastType === 'success'" xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
        </svg>
        <!-- 错误图标 -->
        <svg v-if="toastType === 'error'" xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
        <span>{{ toastMessage }}</span>
      </div>
    </div>
    
    <!-- 添加Todo模态框 -->
    <div v-if="isAddTodoModalVisible" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div class="px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
          <h3 class="text-lg font-medium text-gray-900">添加新任务</h3>
        </div>
        <div class="px-6 py-4">
          <div class="mb-4">
            <label class="block text-gray-700 text-sm font-bold mb-2" for="todo-name">
              任务名称 *
            </label>
            <input 
              v-model="newTodoName" 
              id="todo-name" 
              type="text" 
              class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" 
              placeholder="请输入任务名称"
            >
          </div>
          
          <div class="mb-4">
            <label class="block text-gray-700 text-sm font-bold mb-2" for="todo-description">
              任务描述
            </label>
            <textarea 
              v-model="newTodoDescription" 
              id="todo-description" 
              class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" 
              placeholder="请输入任务描述"
              rows="3"
            ></textarea>
          </div>
          
          <div class="mb-4">
            <label class="block text-gray-700 text-sm font-bold mb-2" for="todo-deadline">
              截止日期
            </label>
            <input 
              v-model="newTodoDeadline" 
              id="todo-deadline" 
              type="date" 
              class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            >
          </div>
          
          <div class="mb-4">
            <label class="block text-gray-700 text-sm font-bold mb-2" for="todo-priority">
              优先级
            </label>
            <select 
              v-model="newTodoPriority" 
              id="todo-priority" 
              class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            >
              <option value="紧急">紧急</option>
              <option value="重要">重要</option>
              <option value="普通">普通</option>
              <option value="低">低</option>
            </select>
          </div>
          
          <div class="mb-4">
            <label class="block text-gray-700 text-sm font-bold mb-2" for="todo-status">
              状态
            </label>
            <select 
              v-model="newTodoStatus" 
              id="todo-status" 
              class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            >
              <option value="计划中">计划中</option>
              <option value="进行中">进行中</option>
              <option value="已完成">已完成</option>
              <option value="已取消">已取消</option>
            </select>
          </div>
          
          <!-- 用户选择控件 -->
          <div class="mb-4">
            <label class="block text-gray-700 text-sm font-bold mb-2">
              关联用户
            </label>
            <div class="max-h-32 overflow-y-auto border rounded p-2">
              <div 
                v-for="user in allUsers" 
                :key="user.id" 
                class="flex items-center mb-1"
              >
                <input 
                  type="checkbox" 
                  :id="'user-' + user.id" 
                  :value="user.id" 
                  v-model="selectedUsers" 
                  class="mr-2"
                >
                <label :for="'user-' + user.id" class="text-gray-700 text-sm">
                  {{ user.name }} ({{ user.username }})
                </label>
              </div>
            </div>
          </div>
          
          <!-- 用户组选择控件 -->
          <div class="mb-4">
            <label class="block text-gray-700 text-sm font-bold mb-2">
              关联用户组
            </label>
            <div class="max-h-32 overflow-y-auto border rounded p-2">
              <div 
                v-for="group in allGroups" 
                :key="group.id" 
                class="flex items-center mb-1"
              >
                <input 
                  type="checkbox" 
                  :id="'group-' + group.id" 
                  :value="group.id" 
                  v-model="selectedGroups" 
                  class="mr-2"
                >
                <label :for="'group-' + group.id" class="text-gray-700 text-sm">
                  {{ group.name }}
                </label>
              </div>
            </div>
          </div>
        </div>
        <div class="px-6 py-4 border-t border-gray-200 bg-gray-50 sticky bottom-0">
          <div class="flex justify-end space-x-3">
            <button 
              @click="isAddTodoModalVisible = false" 
              class="btn btn-ghost"
            >
              取消
            </button>
            <button 
              @click="submitNewTodo" 
              class="btn btn-primary"
            >
              添加任务
            </button>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 编辑Todo模态框 -->
    <div v-if="isEditTodoModalVisible" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div class="px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
          <h3 class="text-lg font-medium text-gray-900">编辑任务</h3>
        </div>
        <div class="px-6 py-4">
          <div class="mb-4">
            <label class="block text-gray-700 text-sm font-bold mb-2" for="edit-todo-name">
              任务名称 *
            </label>
            <input 
              v-model="editTodoName" 
              id="edit-todo-name" 
              type="text" 
              class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" 
              placeholder="请输入任务名称"
            >
          </div>
          
          <div class="mb-4">
            <label class="block text-gray-700 text-sm font-bold mb-2" for="edit-todo-description">
              任务描述
            </label>
            <textarea 
              v-model="editTodoDescription" 
              id="edit-todo-description" 
              class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" 
              placeholder="请输入任务描述"
              rows="3"
            ></textarea>
          </div>
          
          <div class="mb-4">
            <label class="block text-gray-700 text-sm font-bold mb-2" for="edit-todo-deadline">
              截止日期
            </label>
            <input 
              v-model="editTodoDeadline" 
              id="edit-todo-deadline" 
              type="date" 
              class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            >
          </div>
          
          <div class="mb-4">
            <label class="block text-gray-700 text-sm font-bold mb-2" for="edit-todo-priority">
              优先级
            </label>
            <select 
              v-model="editTodoPriority" 
              id="edit-todo-priority" 
              class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            >
              <option value="紧急">紧急</option>
              <option value="重要">重要</option>
              <option value="普通">普通</option>
              <option value="低">低</option>
            </select>
          </div>
          
          <div class="mb-4">
            <label class="block text-gray-700 text-sm font-bold mb-2" for="edit-todo-status">
              状态
            </label>
            <select 
              v-model="editTodoStatus" 
              id="edit-todo-status" 
              class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            >
              <option value="计划中">计划中</option>
              <option value="进行中">进行中</option>
              <option value="已完成">已完成</option>
              <option value="已取消">已取消</option>
            </select>
          </div>
          
          <!-- 用户选择控件 -->
          <div class="mb-4">
            <label class="block text-gray-700 text-sm font-bold mb-2">
              关联用户
            </label>
            <div class="max-h-32 overflow-y-auto border rounded p-2">
              <div 
                v-for="user in allUsers" 
                :key="user.id" 
                class="flex items-center mb-1"
              >
                <input 
                  type="checkbox" 
                  :id="'edit-user-' + user.id" 
                  :value="user.id" 
                  v-model="selectedEditUsers" 
                  class="mr-2"
                >
                <label :for="'edit-user-' + user.id" class="text-gray-700 text-sm">
                  {{ user.name }} ({{ user.username }})
                </label>
              </div>
            </div>
          </div>
          
          <!-- 用户组选择控件 -->
          <div class="mb-4">
            <label class="block text-gray-700 text-sm font-bold mb-2">
              关联用户组
            </label>
            <div class="max-h-32 overflow-y-auto border rounded p-2">
              <div 
                v-for="group in allGroups" 
                :key="group.id" 
                class="flex items-center mb-1"
              >
                <input 
                  type="checkbox" 
                  :id="'edit-group-' + group.id" 
                  :value="group.id" 
                  v-model="selectedEditGroups" 
                  class="mr-2"
                >
                <label :for="'edit-group-' + group.id" class="text-gray-700 text-sm">
                  {{ group.name }}
                </label>
              </div>
            </div>
          </div>
        </div>
        <div class="px-6 py-4 border-t border-gray-200 bg-gray-50 sticky bottom-0">
          <div class="flex justify-end space-x-3">
            <button 
              @click="isEditTodoModalVisible = false" 
              class="btn btn-ghost"
            >
              取消
            </button>
            <button 
              @click="updateTodo" 
              class="btn btn-primary"
            >
              更新任务
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { inject, computed, ref, onMounted, onUnmounted } from 'vue'
import axios from 'axios'
import { API_BASE_URL } from '../config'
import { useRouter } from 'vue-router'

axios.defaults.responseType = 'json';
axios.defaults.headers.common['Accept'] = 'application/json; charset=utf-8';

// 注入认证状态
const authStore = inject('authStore')

// 获取路由实例
const router = useRouter()

// Todos数据
const todos = ref([])
const loading = ref(true)
const error = ref(null)

// 用户和组数据
const allUsers = ref([])
const allGroups = ref([])
const groupLeaders = ref([])
const selectedUsers = ref([])
const selectedGroups = ref([])
const selectedEditUsers = ref([])
const selectedEditGroups = ref([])

// 挂载时获取用户信息并验证token
onMounted(async () => {
  // 获取多用户组信息，替换旧的单组名获取逻辑，避免首次加载错误
  await authStore.fetchUserGroups()
  
  // 获取所有用户和组数据
  await fetchAllUsers()
  await fetchAllGroups()
  
  // 获取Todos数据
  await fetchTodos()

  // 实时同步：窗口聚焦时刷新用户组和任务
  const onFocus = async () => {
    await authStore.fetchUserGroups()
    await fetchTodos()
  }
  window.addEventListener('focus', onFocus)

  // 周期性刷新用户组和任务
  const interval = setInterval(async () => {
    await authStore.fetchUserGroups()
    await fetchTodos()
  }, 30000)

  // 清理
  onUnmounted(() => {
    window.removeEventListener('focus', onFocus)
    clearInterval(interval)
  })
})

// 获取所有用户
const fetchAllUsers = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/users`, {
      headers: {
        'Authorization': `Bearer ${authStore.token.value}`
      }
    })
    
    allUsers.value = response.data.users
  } catch (err) {
    console.error('获取用户数据失败:', err)
  }
}

// 获取所有用户组
const fetchAllGroups = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/groups`, {
      headers: {
        'Authorization': `Bearer ${authStore.token.value}`
      }
    })
    
    allGroups.value = response.data.groups
  } catch (err) {
    console.error('获取用户组数据失败:', err)
  }
}

// 检查用户是否有编辑权限
const checkEditPermission = (todo) => {
  // 检查用户是否是管理员
  if (authStore.user.value && authStore.user.value.role === 'admin') {
    return true
  }
  
  // 检查用户是否是任务的创建者
  if (todo.creator_id === authStore.user.value.id) {
    return true
  }
  
  // 检查用户是否是任务的管理员
  if (todo.admin_users && todo.admin_users.includes(authStore.user.value.id)) {
    return true
  }
  
  // 检查用户是否是任务关联用户组的组长
  if (todo.Belonging_groups && todo.Belonging_groups.length > 0) {
    for (const groupId of todo.Belonging_groups) {
      const group = allGroups.value.find(g => g.id === groupId)
      if (group && group.leaders && group.leaders.includes(authStore.user.value.id)) {
        return true
      }
    }
  }
  
  return false
}

// 获取Todos数据
const fetchTodos = async () => {
  try {
    loading.value = true
    error.value = null
    
    const response = await axios.get(`${API_BASE_URL}/todos`, {
      headers: {
        'Authorization': `Bearer ${authStore.token.value}`
      }
    })
    
    const userId = authStore.user.value.id
    const userGroupIds = (authStore.userGroups.value || []).map(g => g.id)
    
    todos.value = response.data.todos.filter(todo => {
      if (todo.Belonging_users && todo.Belonging_users.includes(userId)) {
        return true
      }
      if (userGroupIds.length > 0 && todo.Belonging_groups && todo.Belonging_groups.some(gid => userGroupIds.includes(gid))) {
        return true
      }
      return false
    }).map(todo => ({
      ...todo,
      Status: Number(todo.Status),
      Priority: String(todo.Priority)
    }))
  } catch (err) {
    console.error('获取Todos数据失败:', err)
    error.value = '获取任务列表失败，请重试'
  } finally {
    loading.value = false
  }
}

// 计算属性获取用户信息
const user = computed(() => authStore.user.value)

// 从认证仓库获取多用户组
const userGroups = computed(() => authStore.userGroups.value || [])

// 用户组名称（兼容旧逻辑，可能不再用于展示）
const groupName = computed(() => authStore.groupName.value)

// 强制清除所有登录数据
const forceLogout = () => {
  authStore.forceLogout()
}

// 添加Todo相关
const showAddTodoModal = () => {
  // 初始化模态框数据
  newTodoName.value = ''
  newTodoDescription.value = ''
  newTodoDeadline.value = ''
  newTodoPriority.value = '普通'
  newTodoStatus.value = '计划中'
  
  // 初始化用户和组选择
  selectedUsers.value = [authStore.user.value.id]
  selectedGroups.value = authStore.user.value.groupId ? [authStore.user.value.groupId] : []
  
  // 显示模态框
  isAddTodoModalVisible.value = true
}

// 新Todo数据
const newTodoName = ref('')
const newTodoDescription = ref('')
const newTodoDeadline = ref('')
const newTodoPriority = ref('普通')
const newTodoStatus = ref('计划中')
const isAddTodoModalVisible = ref(false)

// 编辑Todo数据
const editingTodoId = ref(null)
const editTodoName = ref('')
const editTodoDescription = ref('')
const editTodoDeadline = ref('')
const editTodoPriority = ref('普通')
const editTodoStatus = ref('计划中')
const isEditTodoModalVisible = ref(false)

// Toast提醒数据
const toastMessage = ref('')
const toastType = ref('success') // 'success' 或 'error'

// 显示Toast消息
const showToast = (message, type = 'success') => {
  toastMessage.value = message;
  toastType.value = type;
  
  // 3秒后自动隐藏Toast
  setTimeout(() => {
    toastMessage.value = ''
  }, 3000)
};

// 获取状态文本
const getStatusText = (status) => {
  // 确保状态值是字符串类型
  const statusStr = String(status);
  const statusMap = {
    '-1': '计划中',
    '0': '进行中',
    '1': '已完成',
    '2': '已取消'
  };
  return statusMap[statusStr] || '未知';
};

// 获取状态值
const getStatusValue = (statusText) => {
  // 确保状态文本是字符串类型
  const statusTextStr = String(statusText);
  const statusValueMap = {
    '计划中': '-1',
    '进行中': '0',
    '已完成': '1',
    '已取消': '2'
  };
  return statusValueMap[statusTextStr] || '-1';
};

// 格式化日期
const formatDate = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
};

// 提交新Todo
const submitNewTodo = async () => {
  try {
    // 验证必填字段
    if (!newTodoName.value.trim()) {
      showToast('请输入任务名称', 'error')
      return
    }
    
    // 准备数据
    const todoData = {
      name: newTodoName.value,
      description: newTodoDescription.value,
      deadline: newTodoDeadline.value || null,
      Priority: newTodoPriority.value,
      Status: getStatusValue(newTodoStatus.value),
      // 使用用户选择的值，确保空数组被正确处理
      Belonging_users: selectedUsers.value.length > 0 ? selectedUsers.value : [],
      Belonging_groups: selectedGroups.value.length > 0 ? selectedGroups.value : []
    }
    
    // 发送请求
    const response = await axios.post(`${API_BASE_URL}/todos`, todoData, {
      headers: {
        'Authorization': `Bearer ${authStore.token.value}`
      }
    })
    
    // 检查响应状态码
    if (response.status === 201) {
      // 成功后隐藏模态框
      isAddTodoModalVisible.value = false
      
      // 显示成功消息
      showToast('任务添加成功', 'success')
      
      // 刷新任务列表
      await fetchTodos();
    } else {
      showToast('添加失败: ' + response.data.message, 'error')
    }
  } catch (error) {
    console.error('添加任务失败:', error)
    showToast('添加任务失败，请重试', 'error')
  }
}

// 编辑Todo
const editTodo = (todo) => {
  // 检查权限
  if (!checkEditPermission(todo)) {
    alert('您没有权限编辑此任务');
    return;
  }
  
  // 初始化编辑的Todo数据
  editingTodoId.value = todo.id;
  editTodoName.value = todo.name;
  editTodoDescription.value = todo.description;
  // 正确处理Deadline的各种情况
  if (todo.Deadline) {
    const deadlineDate = new Date(todo.Deadline);
    // 检查日期是否有效
    if (!isNaN(deadlineDate.getTime())) {
      editTodoDeadline.value = deadlineDate.toISOString().split('T')[0];
    } else {
      editTodoDeadline.value = '';
    }
  } else {
    editTodoDeadline.value = '';
  }
  editTodoPriority.value = todo.Priority;
  // 确保状态值正确转换为状态文本
  editTodoStatus.value = getStatusText(String(todo.Status));
  
  // 初始化用户和组选择
  selectedEditUsers.value = [...(todo.Belonging_users || [])];
  selectedEditGroups.value = [...(todo.Belonging_groups || [])];
  
  isEditTodoModalVisible.value = true;
};

// 更新Todo
const updateTodo = async () => {
  try {
    // 验证必填字段
    if (!editTodoName.value.trim()) {
      showToast('请输入任务名称', 'error')
      return
    }
    
    // 准备数据
    const todoData = {
      name: editTodoName.value,
      description: editTodoDescription.value,
      deadline: editTodoDeadline.value || null,
      Priority: editTodoPriority.value,
      Status: getStatusValue(editTodoStatus.value),
      // 使用用户选择的值，确保空数组被正确处理
      Belonging_users: selectedEditUsers.value.length > 0 ? selectedEditUsers.value : [],
      Belonging_groups: selectedEditGroups.value.length > 0 ? selectedEditGroups.value : []
    }
    
    // 发送请求
    const response = await axios.put(`${API_BASE_URL}/todos/${editingTodoId.value}`, todoData, {
      headers: {
        'Authorization': `Bearer ${authStore.token.value}`
      }
    })
    
    // 检查响应状态码
    if (response.status === 200) {
      // 成功后隐藏模态框
      isEditTodoModalVisible.value = false
      
      // 显示成功消息
      showToast('任务更新成功', 'success')
      
      // 刷新任务列表
      await fetchTodos();
    } else {
      showToast('更新失败: ' + response.data.message, 'error')
    }
  } catch (error) {
    console.error('更新任务失败:', error)
    showToast('更新任务失败，请重试', 'error')
  }
};

// 删除Todo
const deleteTodo = async (id) => {
  // 找到要删除的todo以检查权限
  const todo = todos.value.find(t => t.id === id);
  if (todo && !checkEditPermission(todo)) {
    alert('您没有权限删除此任务');
    return;
  }
  
  if (!confirm('确定要删除这个任务吗？')) return;
  
  try {
    const response = await axios.delete(`${API_BASE_URL}/todos/${id}`, {
      headers: {
        'Authorization': `Bearer ${authStore.token.value}`
      }
    });
    
    if (response.status === 200) {
      showToast('任务删除成功', 'success');
      await fetchTodos();
    } else {
      showToast('删除失败: ' + response.data.message, 'error');
    }
  } catch (error) {
    console.error('删除任务失败:', error);
    showToast('删除任务失败，请重试', 'error');
  }
};

// 导航到任务详情页面
const goToTaskDetail = (id) => {
  router.push(`/task/${id}`);
};

// 编辑任务详情
const editTodoDetail = (id) => {
  router.push(`/task/${id}`);
};
</script>