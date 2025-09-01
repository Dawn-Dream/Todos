<template>
  <div class="min-h-screen bg-gray-50">
    <nav class="fixed top-0 left-0 right-0 z-50 flex items-center px-4 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 justify-between">
      <div class="flex items-center">
        <a class="transition-all duration-500 text-2xl font-bold text-white hover:text-gray-300" href="/home">ToDos</a>
      </div>
      
      <div class="flex items-center space-x-4">
        <Menu as="div" class="relative inline-block text-left">
          <div>
            <MenuButton class="flex items-center space-x-2 cursor-pointer text-white py-1 px-3 rounded-lg transition-all duration-300 bg-indigo-600 hover:bg-indigo-700">
              <div class="flex flex-col items-start">
                <span class="font-medium text-1xl">{{ user.name || 'Guest' }}</span>
                <span class="text-xs text-indigo-200 flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                  {{ groupName || '无用户组' }}
                </span>
              </div>
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
              </svg>
            </MenuButton>
          </div>

          <transition
            enter-active-class="transition ease-out duration-100"
            enter-from-class="transform opacity-0 scale-95"
            enter-to-class="transform opacity-100 scale-100"
            leave-active-class="transition ease-in duration-75"
            leave-from-class="transform opacity-100 scale-100"
            leave-to-class="transform opacity-0 scale-95"
          >
            <MenuItems class="absolute right-0 mt-2 w-48 origin-top-right divide-y divide-gray-100 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
              <div class="px-1 py-1">
                <MenuItem v-slot="{ active }">
                  <a href="/" :class="[active ? 'bg-gray-100' : '', 'block px-4 py-2 text-sm text-gray-700']">个人信息</a>
                </MenuItem>
                <MenuItem v-slot="{ active }">
                  <a href="#" :class="[active ? 'bg-gray-100' : '', 'block px-4 py-2 text-sm text-gray-700']">系统设置</a>
                </MenuItem>
                <MenuItem v-if="isAdmin" v-slot="{ active }">
                  <a href="/admin" :class="[active ? 'bg-gray-100' : '', 'block px-4 py-2 text-sm text-gray-700']">后台管理</a>
                </MenuItem>
              </div>
              <div class="px-1 py-1">
                <MenuItem v-slot="{ active }">
                  <button @click="forceLogout" :class="[active ? 'bg-gray-100' : '', 'w-full text-left block px-4 py-2 text-sm text-red-600 font-medium']">
                    <span class="flex items-center">
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      登出
                    </span>
                  </button>
                </MenuItem>
              </div>
            </MenuItems>
          </transition>
        </Menu>
      </div>
    </nav>
    
    <div class="container mx-auto px-4 pt-24 pb-8">
      <div class="flex items-center mb-6">
        <button @click="goBack" class="btn btn-ghost btn-sm mr-4">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clip-rule="evenodd" />
          </svg>
          返回
        </button>
        <h1 class="text-3xl font-bold text-gray-800">任务详情</h1>
      </div>
      
      <div v-if="loading" class="text-center py-8">
  <div class="loading loading-spinner loading-lg"></div>
  <p class="mt-2 text-gray-600">加载中...</p>
  <p class="mt-2 text-gray-600">任务ID: {{ route.params.id }}</p>
</div>
      
      <div v-else-if="error" class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
  <strong class="font-bold">错误: </strong>
  <span class="block sm:inline">{{ error }}</span>
  <p class="mt-2 text-gray-600">任务ID: {{ route.params.id }}</p>
</div>
      
      <div v-else-if="todo" class="bg-white rounded-lg shadow-md overflow-hidden">
        <div class="p-6">
          <div class="flex justify-between items-start mb-4">
            <h2 class="text-2xl font-bold text-gray-800">{{ todo.name }}</h2>
            <span 
              class="px-3 py-1 text-sm font-semibold rounded-full" 
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
          
          <div class="mb-6">
            <h3 class="text-lg font-semibold text-gray-700 mb-2">任务描述</h3>
            <p class="text-gray-600" v-if="todo.description">{{ todo.description }}</p>
            <p class="text-gray-500 italic" v-else>暂无描述</p>
          </div>
          
          <div class="mb-6">
            <div class="flex justify-between items-center mb-2">
              <h3 class="text-lg font-semibold text-gray-700">任务详情</h3>
              <button 
                v-if="hasEditPermission"
                @click="editDetail" 
                class="btn btn-sm btn-outline btn-primary"
              >
                编辑详情
              </button>
            </div>
            <div 
              v-if="todoDetail" 
              class="markdown-content text-gray-600"
              v-html="formatDetailContent(todoDetail)"
            ></div>
            <p v-else class="text-gray-500 italic">暂无详情内容</p>
          </div>
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div class="bg-gray-50 p-4 rounded-lg">
              <h3 class="text-lg font-semibold text-gray-700 mb-3">任务信息</h3>
              <div class="space-y-3">
                <div class="flex justify-between">
                  <span class="text-gray-600">优先级:</span>
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
                </div>
                
                <div class="flex justify-between">
                  <span class="text-gray-600">截止时间:</span>
                  <span class="text-gray-800" v-if="todo.Deadline">{{ formatDate(todo.Deadline) }}</span>
                  <span class="text-gray-500 italic" v-else>未设置</span>
                </div>
                
                <div class="flex justify-between">
                  <span class="text-gray-600">创建时间:</span>
                  <span class="text-gray-800">{{ formatDate(todo.create_time) }}</span>
                </div>
                
                <div class="flex justify-between" v-if="todo.update_time && todo.update_time !== todo.create_time">
                  <span class="text-gray-600">更新时间:</span>
                  <span class="text-gray-800">{{ formatDate(todo.update_time) }}</span>
                </div>
              </div>
            </div>
            
            <div class="bg-gray-50 p-4 rounded-lg">
              <h3 class="text-lg font-semibold text-gray-700 mb-3">关联信息</h3>
              <div class="space-y-3">
                <div>
                  <span class="text-gray-600 block mb-1">关联用户:</span>
                  <div class="flex flex-wrap gap-2">
                    <span 
                      v-if="todo.Belonging_users && todo.Belonging_users.length > 0" 
                      v-for="id in todo.Belonging_users" 
                      :key="id" 
                      class="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800"
                    >
                      {{ (getUserById(id) && getUserById(id).name) ? getUserById(id).name : id }}
                    </span>
                    <span v-else class="text-gray-500 italic">无关联用户</span>
                  </div>
                </div>
                
                <div>
                  <span class="text-gray-600 block mb-1">关联用户组:</span>
                  <div class="flex flex-wrap gap-2">
                    <span 
                      v-if="todo.Belonging_groups && todo.Belonging_groups.length > 0" 
                      v-for="id in todo.Belonging_groups" 
                      :key="id" 
                      class="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800"
                    >
                      {{ (getGroupById(id) && getGroupById(id).name) ? getGroupById(id).name : id }}
                    </span>
                    <span v-else class="text-gray-500 italic">无关联用户组</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div class="flex justify-end space-x-3">
            <button 
              v-if="hasEditPermission"
              @click="editTodo" 
              class="btn btn-primary"
            >
              编辑任务
            </button>
            <button 
              v-if="hasEditPermission"
              @click="deleteTodo" 
              class="btn btn-error"
            >
              删除任务
            </button>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 编辑详情模态框 -->
    <div v-if="isEditingDetail" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div class="px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
          <h3 class="text-lg font-medium text-gray-900">编辑任务详情</h3>
        </div>
        <div class="px-6 py-4">
          <div class="mb-4">
            <label class="block text-gray-700 text-sm font-bold mb-2" for="todo-detail">
              详情内容
            </label>
            <textarea 
              v-model="editedDetail" 
              id="todo-detail" 
              class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" 
              placeholder="请输入任务详情内容"
              rows="10"
            ></textarea>
          </div>
        </div>
        <div class="px-6 py-4 border-t border-gray-200 bg-gray-50 sticky bottom-0">
          <div class="flex justify-end space-x-3">
            <button 
              @click="cancelEditDetail" 
              class="btn btn-ghost"
            >
              取消
            </button>
            <button 
              @click="saveDetail" 
              class="btn btn-primary"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 编辑任务模态框 -->
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
<!-- 移除多余的结束标签，修复无效结束标签问题 -->
</template>

<script setup>
import { inject, ref, onMounted, onUnmounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import { marked } from 'marked'
import { API_BASE_URL } from '../config'
import { Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/vue'

// 注入认证状态
const authStore = inject('authStore')

// 路由相关
const route = useRoute()
const router = useRouter()

// 数据
const todo = ref(null)
const loading = ref(true)
const error = ref(null)

// 权限控制数据
const hasEditPermission = ref(false)

// 任务详情数据
const todoDetail = ref('')
const isEditingDetail = ref(false)
const editedDetail = ref('')

// 编辑任务数据
const isEditTodoModalVisible = ref(false)
const editTodoName = ref('')
const editTodoDescription = ref('')
const editTodoDeadline = ref('')
const editTodoPriority = ref('普通')
const editTodoStatus = ref('计划中')
const selectedEditUsers = ref([])
const selectedEditGroups = ref([])

// 用户和组数据
const allUsers = ref([])
const allGroups = ref([])

// 获取用户信息（computed 只读）
const user = computed(() => authStore.user.value || {})
const isAdmin = computed(() => (authStore.user.value?.role === 'admin'))
const groupName = ref('')

// 移除错误的对 computed 赋值逻辑
// onMounted 初始化
onMounted(async () => {
  try {
    await authStore.fetchGroupName()
    groupName.value = authStore.groupName.value || ''

    await fetchAllUsers()
    await fetchAllGroups()

    await fetchTodo()
  } catch (e) {
    console.error('Error in onMounted:', e)
    error.value = '页面加载失败: ' + (e?.message || e)
  }
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

// 根据ID获取用户
const getUserById = (id) => {
  if (!Array.isArray(allUsers.value)) return null
  return allUsers.value.find(user => idsEqual(user.id, id))
}

// ID 比较工具：优先数值等值，其次字符串等值（兼容 MySQL 数字ID与 Mongo ObjectId 字符串）
const idsEqual = (a, b) => {
  if (a == null || b == null) return false
  const numA = Number(a)
  const numB = Number(b)
  if (!Number.isNaN(numA) && !Number.isNaN(numB)) return numA === numB
  return String(a) === String(b)
}

// 根据ID获取用户组
const getGroupById = (id) => {
  if (!Array.isArray(allGroups.value)) return null
  return allGroups.value.find(group => idsEqual(group.id, id))
}

// 获取任务详情
const fetchTodo = async () => {
  try {
    //console.log('Fetching todo with ID:', route.params.id)
    loading.value = true
    error.value = null
    
    const response = await axios.get(`${API_BASE_URL}/todos/${route.params.id}`, {
      headers: {
        'Authorization': `Bearer ${authStore.token.value}`
      }
    })
    
    //console.log('Todo response:', response.data)
    todo.value = response.data.todo
    //console.log('Todo value set:', todo.value)
    
    // 检查用户是否有编辑权限
    checkEditPermission()
    
    // 获取任务详情内容
    await fetchTodoDetail()
  } catch (err) {
    console.error('获取任务详情失败:', err)
    error.value = '获取任务详情失败，请重试'
  } finally {
    loading.value = false
  }
}

// 检查用户是否有编辑权限
const checkEditPermission = () => {
  // 管理员直接放行
  if (isAdmin.value) {
    hasEditPermission.value = true
    return
  }
  const me = user.value || {}
  const t = todo.value || {}

  // 创建者或管理员
  if (t.creator_id && idsEqual(t.creator_id, me.id)) {
    hasEditPermission.value = true
    return
  }
  if (t.administrator_id && idsEqual(t.administrator_id, me.id)) {
    hasEditPermission.value = true
    return
  }

  // 用户所在组的组长并且任务关联该组
  if (Array.isArray(t.Belonging_groups)) {
    const myGroup = allGroups.value?.find(g => idsEqual(g.id, me.groupId))
    if (myGroup && Array.isArray(myGroup.leaders)) {
      const isLeader = myGroup.leaders.some(id => idsEqual(id, me.id))
      if (isLeader && t.Belonging_groups.some(gid => idsEqual(gid, me.groupId))) {
        hasEditPermission.value = true
        return
      }
    }
  }

  hasEditPermission.value = false
}

// 获取任务详情内容
const fetchTodoDetail = async () => {
  try {
    // 检查后端是否存在该任务的详情
    const response = await axios.get(`${API_BASE_URL}/todo-details/${route.params.id}/exists`, {
      headers: {
        'Authorization': `Bearer ${authStore.token.value}`
      }
    })
    
    // 如果存在详情，则获取详情内容
    if (response.data.exists) {
      const detailResponse = await axios.get(`${API_BASE_URL}/todo-details/${route.params.id}`, {
        headers: {
          'Authorization': `Bearer ${authStore.token.value}`
        }
      })
      todoDetail.value = detailResponse.data.detail
    }
  } catch (err) {
    // 如果是404错误，说明详情不存在，这是正常的
    if (err.response && err.response.status !== 404) {
      console.error('获取任务详情内容失败:', err)
    }
  }
}

// 编辑详情
const editDetail = () => {
  // 检查权限
  if (!hasEditPermission.value) {
    alert('您没有权限编辑此任务的详情')
    return
  }
  
  isEditingDetail.value = true
  editedDetail.value = todoDetail.value
}

// 保存详情
const saveDetail = async () => {
  try {
    // 将详情内容保存到后端
    await axios.post(`${API_BASE_URL}/todo-details/${route.params.id}`, 
      { detail: editedDetail.value },
      {
        headers: {
          'Authorization': `Bearer ${authStore.token.value}`
        }
      }
    )
    
    todoDetail.value = editedDetail.value
    isEditingDetail.value = false
    
    // 显示保存成功的提示
    alert('详情保存成功')
  } catch (err) {
    console.error('保存任务详情失败:', err)
    alert('保存任务详情失败，请重试')
  }
}

// 取消编辑详情
const cancelEditDetail = () => {
  isEditingDetail.value = false
  editedDetail.value = ''
}

// 格式化详情内容
const formatDetailContent = (content) => {
  // 使用 marked.js 解析 Markdown 内容
  return marked(content)
}

// 格式化日期
const formatDate = (dateString) => {
  if (!dateString) return ''
  const date = new Date(dateString)
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// 获取状态文本
const getStatusText = (status) => {
  const statusMap = {
    '-1': '计划中',
    '0': '进行中',
    '1': '已完成',
    '2': '已取消'
  }
  return statusMap[status] || '未知'
}

// 返回上一页
const goBack = () => {
  router.go(-1)
}

// 编辑任务
const editTodo = () => {
  // 检查权限
  if (!hasEditPermission.value) {
    alert('您没有权限编辑此任务')
    return
  }
  
  // 初始化编辑的Todo数据
  editTodoName.value = todo.value.name
  editTodoDescription.value = todo.value.description
  // 正确处理Deadline的各种情况
  if (todo.value.Deadline) {
    const deadlineDate = new Date(todo.value.Deadline)
    // 检查日期是否有效
    if (!isNaN(deadlineDate.getTime())) {
      editTodoDeadline.value = deadlineDate.toISOString().split('T')[0]
    } else {
      editTodoDeadline.value = ''
    }
  } else {
    editTodoDeadline.value = ''
  }
  editTodoPriority.value = todo.value.Priority
  // 确保状态值正确转换为状态文本
  editTodoStatus.value = getStatusText(String(todo.value.Status))
  
  // 初始化用户和组选择
  selectedEditUsers.value = [...(todo.value.Belonging_users || [])]
  selectedEditGroups.value = [...(todo.value.Belonging_groups || [])]
  
  isEditTodoModalVisible.value = true
}

// 删除任务详情
const deleteTodoDetail = async () => {
  try {
    // 从后端删除该任务的详情
    await axios.delete(`${API_BASE_URL}/todo-details/${route.params.id}`, {
      headers: {
        'Authorization': `Bearer ${authStore.token.value}`
      }
    })
    todoDetail.value = ''
    
    // 显示删除成功的提示
    alert('详情删除成功')
  } catch (err) {
    // 如果是404错误，说明详情不存在，这也是可以接受的
    if (err.response && err.response.status !== 404) {
      console.error('删除任务详情失败:', err)
      alert('删除任务详情失败，请重试')
    } else {
      // 即使后端没有详情，前端也清空显示
      todoDetail.value = ''
      alert('详情删除成功')
    }
  }
}

// 更新Todo
const updateTodo = async () => {
  try {
    // 验证必填字段
    if (!editTodoName.value.trim()) {
      alert('请输入任务名称')
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
      Belonging_groups: selectedEditGroups.value.length > 0 ? selectedEditGroups.value.map(id => Number(id)).filter(n => !isNaN(n)) : []
    }
    
    // 发送请求
    const response = await axios.put(`${API_BASE_URL}/todos/${todo.value.id}`, todoData, {
      headers: {
        'Authorization': `Bearer ${authStore.token.value}`
      }
    })
    
    // 检查响应状态码
    if (response.status === 200) {
      // 成功后隐藏模态框
      isEditTodoModalVisible.value = false
      
      // 显示成功消息
      alert('任务更新成功')
      
      // 刷新任务数据
      await fetchTodo()
    } else {
      alert('更新失败: ' + response.data.message)
    }
  } catch (error) {
    console.error('更新任务失败:', error)
    alert('更新任务失败，请重试')
  }
}

// 获取状态值
const getStatusValue = (statusText) => {
  // 确保状态文本是字符串类型
  const statusTextStr = String(statusText)
  const statusValueMap = {
    '计划中': '-1',
    '进行中': '0',
    '已完成': '1',
    '已取消': '2'
  }
  return statusValueMap[statusTextStr] || '-1'
}

// 删除任务
const deleteTodo = async () => {
  // 检查权限
  if (!hasEditPermission.value) {
    alert('您没有权限删除此任务')
    return
  }
  
  if (!confirm('确定要删除这个任务吗？')) return
  
  try {
    const response = await axios.delete(`${API_BASE_URL}/todos/${todo.value.id}`, {
      headers: {
        'Authorization': `Bearer ${authStore.token.value}`
      }
    })
    
    if (response.status === 200) {
      alert('任务删除成功')
      router.push('/home')
    } else {
      alert('删除失败: ' + response.data.message)
    }
  } catch (err) {
    console.error('删除任务失败:', err)
    alert('删除任务失败，请重试')
  }
}

// 强制清除所有登录数据
const forceLogout = () => {
  authStore.forceLogout()
}


</script>

<style scoped>
/* Enhanced Markdown content styling */
.markdown-content {
  font-size: 0.875rem; /* 14px */
  line-height: 1.714; /* 24px */
  color: #374151; /* gray-700 */
  font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif;
}

/* Headers */
.markdown-content :deep(h1) {
  font-size: 1.875rem; /* 30px */
  font-weight: 800;
  margin: 2rem 0 1rem 0;
  color: #111827; /* gray-900 */
  letter-spacing: -0.025em;
}

.markdown-content :deep(h2) {
  font-size: 1.5rem; /* 24px */
  font-weight: 700;
  margin: 1.75rem 0 1rem 0;
  color: #111827; /* gray-900 */
  letter-spacing: -0.025em;
}

.markdown-content :deep(h3) {
  font-size: 1.25rem; /* 20px */
  font-weight: 600;
  margin: 1.5rem 0 0.75rem 0;
  color: #111827; /* gray-900 */
}

.markdown-content :deep(h4) {
  font-size: 1.125rem; /* 18px */
  font-weight: 600;
  margin: 1.25rem 0 0.75rem 0;
  color: #111827; /* gray-900 */
}

.markdown-content :deep(h5) {
  font-size: 1rem; /* 16px */
  font-weight: 600;
  margin: 1rem 0 0.5rem 0;
  color: #111827; /* gray-900 */
}

.markdown-content :deep(h6) {
  font-size: 0.875rem; /* 14px */
  font-weight: 600;
  margin: 1rem 0 0.5rem 0;
  color: #111827; /* gray-900 */
  text-transform: uppercase;
}

/* Paragraphs */
.markdown-content :deep(p) {
  margin-bottom: 1.25rem;
  line-height: 1.714;
}

/* Lists */
.markdown-content :deep(ul), 
.markdown-content :deep(ol) {
  margin: 1.25rem 0;
  padding-left: 1.75rem;
}

.markdown-content :deep(li) {
  margin-bottom: 0.5rem;
}

.markdown-content :deep(ul li) {
  list-style-type: disc;
}

.markdown-content :deep(ul ul li) {
  list-style-type: circle;
}

.markdown-content :deep(ul ul ul li) {
  list-style-type: square;
}

.markdown-content :deep(ol li) {
  list-style-type: decimal;
}

.markdown-content :deep(ol ol li) {
  list-style-type: lower-alpha;
}

.markdown-content :deep(ol ol ol li) {
  list-style-type: lower-roman;
}

/* Code */
.markdown-content :deep(code) {
  background-color: #f3f4f6; /* gray-100 */
  padding: 0.25rem 0.5rem;
  border-radius: 0.375rem;
  font-size: 0.875rem; /* 14px */
  color: #374151; /* gray-700 */
  font-family: 'Fira Code', 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  font-weight: 500;
}

.markdown-content :deep(pre) {
  background-color: #f9fafb; /* gray-50 */
  border: 1px solid #e5e7eb; /* gray-200 */
  border-radius: 0.5rem;
  padding: 1.25rem;
  margin: 1.25rem 0;
  overflow-x: auto;
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
}

.markdown-content :deep(pre code) {
  background-color: transparent;
  padding: 0;
  color: inherit;
  font-size: 0.875rem; /* 14px */
  font-weight: 400;
}

/* Blockquotes */
.markdown-content :deep(blockquote) {
  border-left: 4px solid #d1d5db; /* gray-300 */
  padding: 0.25rem 1.25rem;
  margin: 1.25rem 0;
  color: #4b5563; /* gray-600 */
  background-color: #f9fafb; /* gray-50 */
  border-radius: 0 0.375rem 0.375rem 0;
}

/* Links */
.markdown-content :deep(a) {
  color: #3b82f6; /* blue-500 */
  text-decoration: underline;
  font-weight: 500;
}

.markdown-content :deep(a:hover) {
  color: #1d4ed8; /* blue-700 */
  text-decoration: none;
}

/* Tables */
.markdown-content :deep(table) {
  width: 100%;
  margin: 1.25rem 0;
  border-collapse: collapse;
  border-radius: 0.5rem;
  overflow: hidden;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1);
}

.markdown-content :deep(th), 
.markdown-content :deep(td) {
  padding: 0.75rem 1rem;
  border: 1px solid #e5e7eb; /* gray-200 */
  text-align: left;
}

.markdown-content :deep(th) {
  background-color: #f3f4f6; /* gray-100 */
  font-weight: 600;
  color: #111827; /* gray-900 */
}

.markdown-content :deep(tr:nth-child(even)) {
  background-color: #f9fafb; /* gray-50 */
}

/* Horizontal rule */
.markdown-content :deep(hr) {
  margin: 1.75rem 0;
  border: 0;
  border-top: 1px solid #e5e7eb; /* gray-200 */
  height: 1px;
}

/* Images */
.markdown-content :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 0.5rem;
  margin: 1rem 0;
}

/* Strong and emphasis */
.markdown-content :deep(strong) {
  font-weight: 700;
}

.markdown-content :deep(em) {
  font-style: italic;
}
</style>