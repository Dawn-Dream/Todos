<template>
  <div class="min-h-screen bg-gray-50">
    <nav class="fixed top-0 left-0 right-0 z-50 flex items-center px-4 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 justify-between">
      <div class="flex items-center">
        <a class="transition-all duration-500 text-2xl font-bold text-white hover:text-gray-300" href="/home">ToDos 后台</a>
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
                  <span v-if="groupLeaders && groupLeaders.length > 0" class="ml-2">
                  (组长: {{ groupLeaders.map(id => {
                    const user = allUsers.find(u => u.id === id);
                    return user ? user.name : id;
                  }).join(', ') }})
                </span>
                </span>
                <span class="text-xs text-indigo-200">
                  角色: {{ user.role === 'admin' ? '管理员' : '普通用户' }}
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
                  <a href="/home" :class="[active ? 'bg-gray-100' : '', 'block px-4 py-2 text-sm text-gray-700']">个人信息</a>
                </MenuItem>
                <MenuItem v-slot="{ active }">
                  <a href="#" :class="[active ? 'bg-gray-100' : '', 'block px-4 py-2 text-sm text-gray-700']">系统设置</a>
                </MenuItem>
                <MenuItem v-slot="{ active }">
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
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-8">
      
      
      <!-- 后台管理功能区域 -->
      <div class="mt-8">
        <!-- 用户管理 -->
      <div class="bg-white shadow overflow-hidden sm:rounded-lg mb-8">
        <div class="px-4 py-5 sm:px-6 border-b border-gray-200 flex justify-between items-center">
          <h2 class="text-lg leading-6 font-medium text-gray-900">用户管理</h2>
          <button @click="showAddUserModal" class="btn btn-primary">添加用户</button>
        </div>
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">用户名</th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">用户组</th>
                <th scope="col" class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="user in users" :key="user.id">
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ user.id }}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{{ user.username }}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ user.groups ? user.groups.map(g => g.name).join(', ') : '' }}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-center">
                  <button 
                    @click="showEditUserModal(user)" 
                    class="text-indigo-600 hover:text-indigo-900 mr-3"
                  >
                    编辑
                  </button>
                  <button 
                    @click="deleteUser(user.id)" 
                    class="text-red-600 hover:text-red-900"
                  >
                    删除
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

        <!-- 用户组管理 -->
        <div class="bg-white shadow overflow-hidden sm:rounded-lg mb-8">
        <div class="px-4 py-5 sm:px-6 border-b border-gray-200 flex justify-between items-center">
          <h2 class="text-lg leading-6 font-medium text-gray-900">用户组管理</h2>
          <button @click="showAddGroupModal" class="btn btn-primary">添加用户组</button>
        </div>
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">组名</th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">描述</th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">组长</th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">成员</th>
                <th scope="col" class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="group in groups" :key="group.id">
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ group.id }}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{{ group.name }}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ group.description }}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <span 
                    v-for="leaderId in (group.leaders || [])" 
                    :key="leaderId" 
                    class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 mr-1"
                  >
                    {{ getUserById(leaderId) }}
                  </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <span 
                    v-for="member in getGroupMembers(group.id)" 
                    :key="member.id" 
                    class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 mr-1 mb-1"
                  >
                    {{ member.name }}
                  </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                  <button @click="showEditGroupModal(group)" class="text-indigo-600 hover:text-indigo-900 mr-3">编辑</button>
                  <button @click="deleteGroup(group.id)" class="text-red-600 hover:text-red-900">删除</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="bg-white shadow overflow-hidden sm:rounded-lg">
        <div class="px-4 py-5 sm:px-6 border-b border-gray-200">
          <h2 class="text-lg leading-6 font-medium text-gray-900">任务管理</h2>
        </div>
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">任务名称</th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">描述</th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">截止日期</th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">优先级</th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">所属用户</th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">所属用户组</th>
                <th scope="col" class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="todo in todos" :key="todo.id">
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ todo.id }}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{{ todo.name }}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ todo.description }}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ formatDate(todo.Deadline) }}</td>
                <td class="px-6 py-4 whitespace-nowrap">
              <span v-if="todo.Priority === '紧急'" class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">紧急</span>
              <span v-else-if="todo.Priority === '重要'" class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">重要</span>
              <span v-else-if="todo.Priority === '普通'" class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">普通</span>
              <span v-else-if="todo.Priority === '低'" class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">低</span>
            </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span v-if="todo.Status === -1" class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">计划中</span>
              <span v-else-if="todo.Status === 0" class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">进行中</span>
              <span v-else-if="todo.Status === 1" class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">已完成</span>
              <span v-else-if="todo.Status === 2" class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">已取消</span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ (todo.Belonging_users || []).map(userId => getUserById(userId)).join(', ') }}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ (todo.Belonging_groups || []).map(groupId => getGroupById(groupId)).join(', ') }}</td>
                <td class="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                  <button @click="showEditTaskModal(todo)" class="text-indigo-600 hover:text-indigo-900 mr-3">编辑</button>
                  <button @click="deleteTask(todo.id)" class="text-red-600 hover:text-red-900">删除</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      </div>
    <!-- 添加用户模态框 -->
    <div v-if="isAddUserModalVisible" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-md p-1">
        <div class="px-6 py-4 border-b border-gray-200">
          <h3 class="text-lg font-medium text-gray-900">添加用户</h3>
        </div>
        <div class="px-6 py-4">
          <div class="mb-4">
            <label class="block text-gray-700 text-sm font-bold mb-2" for="new-user-username">
              用户名 *
            </label>
            <input 
              v-model="newUserUsername" 
              id="new-user-username" 
              type="text" 
              class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" 
              placeholder="请输入用户名"
            >
          </div>
          
          <div class="mb-4">
            <label class="block text-gray-700 text-sm font-bold mb-2" for="new-user-password">
              密码 *
            </label>
            <input 
              v-model="newUserPassword" 
              id="new-user-password" 
              type="password" 
              class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" 
              placeholder="请输入密码"
            >
          </div>
          
          <div class="mb-4">
            <label class="block text-gray-700 text-sm font-bold mb-2" for="new-user-name">
              姓名 *
            </label>
            <input 
              v-model="newUserName" 
              id="new-user-name" 
              type="text" 
              class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" 
              placeholder="请输入姓名"
            >
          </div>
          
          <div class="mb-4">
            <label class="block text-gray-700 text-sm font-bold mb-2" for="new-user-role">
              角色
            </label>
            <select 
              v-model="newUserRole" 
              id="new-user-role" 
              class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            >
              <option value="user">普通用户</option>
              <option value="admin">管理员</option>
            </select>
          </div>
        </div>
        <div class="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end space-x-3">
          <button 
            @click="isAddUserModalVisible = false" 
            class="btn btn-ghost"
          >
            取消
          </button>
          <button 
            @click="submitNewUser" 
            class="btn btn-primary"
          >
            添加用户
          </button>
        </div>
      </div>
    </div>
    
    <!-- 编辑用户组模态框 -->
    <div v-if="isEditGroupModalVisible" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-md p-1">
        <div class="px-6 py-4 border-b border-gray-200">
          <h3 class="text-lg font-medium text-gray-900">编辑用户组</h3>
        </div>
        <div class="px-6 py-4">
          <div class="mb-4">
            <label class="block text-gray-700 text-sm font-bold mb-2" for="edit-group-name">
              用户组名称 *
            </label>
            <input 
              v-model="editGroupName" 
              id="edit-group-name" 
              type="text" 
              class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" 
              placeholder="请输入用户组名称"
            >
          </div>
          
          <div class="mb-4">
            <label class="block text-gray-700 text-sm font-bold mb-2" for="edit-group-description">
              描述
            </label>
            <input 
              v-model="editGroupDescription" 
              id="edit-group-description" 
              type="text" 
              class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" 
              placeholder="请输入描述"
            >
          </div>
          
          <div class="mb-4">
            <label class="block text-gray-700 text-sm font-bold mb-2">
              组长
            </label>
            <div class="space-y-2 max-h-40 overflow-y-auto p-2 border border-gray-300 rounded">
              <div 
                v-for="user in users" 
                :key="user.id" 
                class="flex items-center"
              >
                <input 
                  type="checkbox" 
                  :id="'edit-leader-' + user.id" 
                  :value="user.id" 
                  v-model="editGroupLeaders"
                  class="mr-2 h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                >
                <label 
                  :for="'edit-leader-' + user.id" 
                  class="text-sm text-gray-700"
                >
                  {{ user.name }} ({{ user.username }})
                </label>
              </div>
            </div>
          </div>
        </div>
        <div class="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end space-x-3">
          <button 
            @click="isEditGroupModalVisible = false" 
            class="btn btn-ghost"
          >
            取消
          </button>
          <button 
            @click="submitEditGroup" 
            class="btn btn-primary"
          >
            保存
          </button>
        </div>
      </div>
    </div>
    </div>
  </div>
  
  <!-- 添加用户组模态框 -->
  <div v-if="isAddGroupModalVisible" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div class="bg-white rounded-lg shadow-xl w-full max-w-md p-1">
      <div class="px-6 py-4 border-b border-gray-200">
        <h3 class="text-lg font-medium text-gray-900">添加用户组</h3>
      </div>
      <div class="px-6 py-4">
        <div class="mb-4">
          <label class="block text-gray-700 text-sm font-bold mb-2" for="new-group-name">
            用户组名称 *
          </label>
          <input 
            v-model="newGroupName" 
            id="new-group-name" 
            type="text" 
            class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" 
            placeholder="请输入用户组名称"
          >
        </div>
        
        <div class="mb-4">
          <label class="block text-gray-700 text-sm font-bold mb-2" for="new-group-description">
            描述
          </label>
          <input 
            v-model="newGroupDescription" 
            id="new-group-description" 
            type="text" 
            class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" 
            placeholder="请输入描述"
          >
        </div>
        
        <div class="mb-4">
          <label class="block text-gray-700 text-sm font-bold mb-2">
            组长
          </label>
          <div class="space-y-2 max-h-40 overflow-y-auto p-2 border border-gray-300 rounded">
            <div 
              v-for="user in users" 
              :key="user.id" 
              class="flex items-center"
            >
              <input 
                type="checkbox" 
                :id="'new-leader-' + user.id" 
                :value="user.id" 
                v-model="newGroupLeaders"
                class="mr-2 h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
              >
              <label 
                :for="'new-leader-' + user.id" 
                class="text-sm text-gray-700"
              >
                {{ user.name }} ({{ user.username }})
              </label>
            </div>
          </div>
        </div>
      </div>
      <div class="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end space-x-3">
        <button 
          @click="isAddGroupModalVisible = false" 
          class="btn btn-ghost"
        >
          取消
        </button>
        <button 
          @click="submitNewGroup" 
          class="btn btn-primary"
        >
          添加
        </button>
      </div>
    </div>
  </div>
  
  <!-- 编辑用户模态框 -->
  <div v-if="isEditUserModalVisible" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div class="bg-white rounded-lg shadow-xl w-full max-w-md p-1">
      <div class="px-6 py-4 border-b border-gray-200">
        <h3 class="text-lg font-medium text-gray-900">编辑用户</h3>
      </div>
      <div class="px-6 py-4">
        <div class="mb-4">
          <label class="block text-gray-700 text-sm font-bold mb-2" for="edit-user-username">
            用户名 *
          </label>
          <input 
            v-model="editUserUsername" 
            id="edit-user-username" 
            type="text" 
            class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" 
            placeholder="请输入用户名"
          >
        </div>
        
        <div class="mb-4">
          <label class="block text-gray-700 text-sm font-bold mb-2" for="edit-user-password">
            密码
            <span class="text-xs text-gray-500 font-normal ml-1">(留空表示不修改)</span>
          </label>
          <input 
            v-model="editUserPassword" 
            id="edit-user-password" 
            type="password" 
            class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" 
            placeholder="请输入新密码"
          >
        </div>
        
        <div class="mb-4">
          <label class="block text-gray-700 text-sm font-bold mb-2" for="edit-user-name">
            姓名 *
          </label>
          <input 
            v-model="editUserName" 
            id="edit-user-name" 
            type="text" 
            class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" 
            placeholder="请输入姓名"
          >
        </div>
        
        <div class="mb-4">
          <label class="block text-gray-700 text-sm font-bold mb-2" for="edit-user-role">
            角色
          </label>
          <select 
            v-model="editUserRole" 
            id="edit-user-role" 
            class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
          >
            <option value="user">普通用户</option>
            <option value="admin">管理员</option>
          </select>
        </div>
        
        <div class="mb-4">
          <label class="block text-gray-700 text-sm font-bold mb-2">
            用户组
          </label>
          <div class="space-y-2 max-h-40 overflow-y-auto p-2 border border-gray-300 rounded">
            <div 
              v-for="group in groups" 
              :key="group.id" 
              class="flex items-center"
            >
              <input 
                type="checkbox" 
                :id="'edit-user-group-' + group.id" 
                :value="group.id" 
                v-model="editUserGroupIds"
                class="mr-2 h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
              >
              <label 
                :for="'edit-user-group-' + group.id" 
                class="text-sm text-gray-700"
              >
                {{ group.name }}
              </label>
            </div>
          </div>
        </div>
      </div>
      <div class="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end space-x-3">
        <button 
          @click="isEditUserModalVisible = false" 
          class="btn btn-ghost"
        >
          取消
        </button>
        <button 
          @click="submitEditUser" 
          class="btn btn-primary"
        >
          保存
        </button>
      </div>
    </div>
  </div>
  <!-- 编辑任务模态框 -->
  <div v-if="isEditTaskModalVisible" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div class="bg-white rounded-lg shadow-xl w-full max-w-md p-1">
      <div class="px-6 py-4 border-b border-gray-200">
        <h3 class="text-lg font-medium text-gray-900">编辑任务</h3>
      </div>
      <div class="px-6 py-4">
        <div class="mb-4">
          <label class="block text-gray-700 text-sm font-bold mb-2" for="edit-task-name">
            任务名称 *
          </label>
          <input 
            v-model="editTaskName" 
            id="edit-task-name" 
            type="text" 
            class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" 
            placeholder="请输入任务名称"
          >
        </div>
        
        <div class="mb-4">
          <label class="block text-gray-700 text-sm font-bold mb-2" for="edit-task-description">
            任务描述
          </label>
          <textarea 
            v-model="editTaskDescription" 
            id="edit-task-description" 
            class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" 
            placeholder="请输入任务描述"
            rows="3"
          ></textarea>
        </div>
        
        <div class="mb-4">
          <label class="block text-gray-700 text-sm font-bold mb-2" for="edit-task-deadline">
            截止日期
          </label>
          <input 
            v-model="editTaskDeadline" 
            id="edit-task-deadline" 
            type="date" 
            class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
          >
        </div>
        
        <div class="mb-4">
          <label class="block text-gray-700 text-sm font-bold mb-2" for="edit-task-priority">
            优先级
          </label>
          <select 
            v-model="editTaskPriority" 
            id="edit-task-priority" 
            class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
          >
            <option value="紧急">紧急</option>
            <option value="重要">重要</option>
            <option value="普通">普通</option>
            <option value="低">低</option>
          </select>
        </div>
        
        <div class="mb-4">
          <label class="block text-gray-700 text-sm font-bold mb-2" for="edit-task-status">
            状态
          </label>
          <select 
            v-model="editTaskStatus" 
            id="edit-task-status" 
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
              v-for="user in users" 
              :key="user.id" 
              class="flex items-center mb-1"
            >
              <input 
                type="checkbox" 
                :id="'edit-task-user-' + user.id" 
                :value="user.id" 
                v-model="selectedEditTaskUsers" 
                class="mr-2"
              >
              <label :for="'edit-task-user-' + user.id" class="text-gray-700 text-sm">
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
              v-for="group in groups" 
              :key="group.id" 
              class="flex items-center mb-1"
            >
              <input 
                type="checkbox" 
                :id="'edit-task-group-' + group.id" 
                :value="group.id" 
                v-model="selectedEditTaskGroups" 
                class="mr-2"
              >
              <label :for="'edit-task-group-' + group.id" class="text-gray-700 text-sm">
                {{ group.name }}
              </label>
            </div>
          </div>
        </div>
      </div>
      <div class="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end space-x-3">
        <button 
          @click="isEditTaskModalVisible = false" 
          class="btn btn-ghost"
        >
          取消
        </button>
        <button 
          @click="submitEditTask" 
          class="btn btn-primary"
        >
          保存
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { inject, ref, onMounted, onUnmounted, computed } from 'vue'
import axios from 'axios'
import { API_BASE_URL } from '../config'

// 注入认证状态
const authStore = inject('authStore')

// 计算属性获取用户信息
const user = computed(() => authStore.user.value)

// 用户组名称
const groupName = computed(() => authStore.groupName.value)

// 强制清除所有登录数据
const forceLogout = () => {
  authStore.forceLogout()
}

// 用户菜单开关（移动端点击 + PC 端 hover 共存）
const isUserMenuOpen = ref(false)
const userMenuRef = ref(null)
const toggleUserMenu = () => {
  isUserMenuOpen.value = !isUserMenuOpen.value
}

onMounted(() => {
  const onClickOutside = (e) => {
    if (userMenuRef.value && !userMenuRef.value.contains(e.target)) {
      isUserMenuOpen.value = false
    }
  }
  const onKeydown = (e) => {
    if (e.key === 'Escape') isUserMenuOpen.value = false
  }
  document.addEventListener('click', onClickOutside)
  document.addEventListener('keydown', onKeydown)
  onUnmounted(() => {
    document.removeEventListener('click', onClickOutside)
    document.removeEventListener('keydown', onKeydown)
  })
})
// 用户管理数据
const users = ref([])
const isUsersLoading = ref(false)
const usersError = ref(null)

// 添加用户模态框数据
const isAddUserModalVisible = ref(false)
const newUserUsername = ref('')
const newUserPassword = ref('')
const newUserName = ref('')
const newUserRole = ref('user')

// 编辑用户模态框数据
const isEditUserModalVisible = ref(false)
const editingUser = ref(null)
const editUserUsername = ref('')
const editUserName = ref('')
const editUserRole = ref('user')
const editUserGroupIds = ref([])
const editUserPassword = ref('')

// 添加用户组模态框数据
const isAddGroupModalVisible = ref(false)
const newGroupName = ref('')
const newGroupDescription = ref('')
const newGroupLeaders = ref([])

// 编辑用户组模态框数据
const isEditGroupModalVisible = ref(false)
const editingGroup = ref(null)
const editGroupName = ref('')
const editGroupDescription = ref('')
const editGroupLeaders = ref([])

// 用户组管理数据
const groups = ref([])
const isGroupsLoading = ref(false)
const groupsError = ref(null)

// 任务管理数据
const todos = ref([])
const isTodosLoading = ref(false)
const todosError = ref(null)

// 用户和组数据
const allUsers = ref([])
const allGroups = ref([])
const groupLeaders = ref([])

// 显示添加用户模态框
const showAddUserModal = () => {
  // 初始化模态框数据
  newUserUsername.value = ''
  newUserPassword.value = ''
  newUserName.value = ''
  newUserRole.value = 'user'
  
  // 显示模态框
  isAddUserModalVisible.value = true
}

// 显示编辑用户模态框
const showEditUserModal = (user) => {
  // 设置当前编辑的用户
  editingUser.value = user
  
  // 初始化模态框数据
  editUserUsername.value = user.username || ''
  editUserName.value = user.name || ''
  editUserRole.value = user.role || 'user'
  editUserGroupIds.value = user.groups ? user.groups.map(g => g.id) : []
  editUserPassword.value = '' // 清空密码字段
  
  // 显示模态框
  isEditUserModalVisible.value = true
}

// 显示添加用户组模态框
const showAddGroupModal = () => {
  newGroupName.value = ''
  newGroupDescription.value = ''
  isAddGroupModalVisible.value = true
}

// 显示编辑用户组模态框
const showEditGroupModal = (group) => {
  editingGroup.value = group
  editGroupName.value = group.name
  editGroupDescription.value = group.description || ''
  editGroupLeaders.value = group.leaders || []
  isEditGroupModalVisible.value = true
}

// 提交新用户
const submitNewUser = async () => {
  try {
    // 验证必填字段
    if (!newUserUsername.value.trim() || !newUserPassword.value.trim() || !newUserName.value.trim()) {
      alert('用户名、密码和姓名是必填项')
      return
    }
    
    // 准备数据
    const userData = {
      username: newUserUsername.value,
      name: newUserName.value,
      password: newUserPassword.value,
      role: newUserRole.value
    }
    
    // 发送请求到/register接口
    const response = await axios.post(`${API_BASE_URL}/register`, userData, {
      headers: {
        'Authorization': `Bearer ${authStore.token.value}`
      }
    })
    
    // 检查响应状态码
    if (response.status === 201) {
      // 成功后隐藏模态框
      isAddUserModalVisible.value = false
      
      // 显示成功消息
      alert('用户添加成功')
      
      // 刷新用户列表
      await fetchUsers();
      
      // 刷新token以获取最新的用户信息
      await authStore.fetchUserGroups()
    } else {
      alert('添加失败: ' + response.data.message)
    }
  } catch (error) {
    console.error('添加用户失败:', error)
    alert('添加用户失败，请重试')
  }
}

// 提交添加用户组
const submitNewGroup = async () => {
  if (!newGroupName.value.trim()) {
    alert('用户组名称不能为空')
    return
  }

  const groupData = {
    name: newGroupName.value.trim(),
    description: newGroupDescription.value.trim(),
    leaders: newGroupLeaders.value
  }

  try {
    const response = await axios.post(`${API_BASE_URL}/groups`, groupData, {
      headers: { Authorization: `Bearer ${authStore.token.value}` }
    })

    if (response.status === 201) {
      isAddGroupModalVisible.value = false
      newGroupLeaders.value = [] // Reset leaders selection
      // 刷新token以获取最新的用户组信息
      await authStore.fetchUserGroups()
      alert('用户组添加成功')
      fetchGroups() // 刷新用户组列表
    } else {
      alert('添加用户组失败')
    }
  } catch (error) {
    console.error('添加用户组时出错:', error)
    alert('添加用户组时出错')
  }
}

// 提交编辑用户
const submitEditUser = async () => {
  try {
    // 验证必填字段
    if (!editUserUsername.value.trim() || !editUserName.value.trim()) {
      alert('用户名和姓名是必填项')
      return
    }
    
    // 准备数据
    const userData = {
      username: editUserUsername.value,
      name: editUserName.value,
      role: editUserRole.value,
      groupIds: editUserGroupIds.value
    }
    
    // 如果密码字段不为空，则添加到请求数据中
    if (editUserPassword.value.trim()) {
      userData.password = editUserPassword.value.trim()
    }
    
    // 发送请求到/users/:id接口
    const response = await axios.put(`${API_BASE_URL}/users/${editingUser.value.id}`, userData, {
      headers: {
        'Authorization': `Bearer ${authStore.token.value}`
      }
    })
    
    // 检查响应状态码
    if (response.status === 200) {
      // 成功后隐藏模态框
      isEditUserModalVisible.value = false
      
      // 显示成功消息
      alert('用户更新成功')
      
      // 刷新用户列表
      await fetchUsers();
      
      // 刷新token以获取最新的用户信息
      await authStore.fetchUserGroups()
    } else {
      alert('更新失败: ' + response.data.message)
    }
  } catch (error) {
    console.error('更新用户失败:', error)
    alert('更新用户失败，请重试')
  }
}

// 提交编辑用户组
const submitEditGroup = async () => {
  if (!editGroupName.value.trim()) {
    alert('用户组名称不能为空')
    return
  }

  const groupData = {
    name: editGroupName.value.trim(),
    description: editGroupDescription.value.trim(),
    leaders: editGroupLeaders.value
  }

  try {
    const response = await axios.put(`${API_BASE_URL}/groups/${editingGroup.value.id}`, groupData, {
      headers: { Authorization: `Bearer ${authStore.token.value}` }
    })

    if (response.status === 200) {
      isEditGroupModalVisible.value = false
      alert('用户组更新成功')
      // 刷新token以获取最新的用户组信息
      await authStore.fetchUserGroups()
      fetchGroups() // 刷新用户组列表
    } else {
      alert('更新用户组失败')
    }
  } catch (error) {
    console.error('更新用户组时出错:', error)
    alert('更新用户组时出错')
  }
}

// 获取所有用户
const fetchUsers = async () => {
  try {
    isUsersLoading.value = true
    usersError.value = null
    
    const response = await axios.get(`${API_BASE_URL}/users`, {
      headers: {
        'Authorization': `Bearer ${authStore.token.value}`
      }
    })
    
    users.value = response.data.users
  } catch (err) {
    console.error('获取用户数据失败:', err)
    usersError.value = '获取用户数据失败'
  } finally {
    isUsersLoading.value = false
  }
}

// 删除用户
const deleteUser = async (userId) => {
  if (!confirm('确定要删除这个用户吗？')) {
    return;
  }
  
  try {
    // 发送请求到/users/:id接口
    const response = await axios.delete(`${API_BASE_URL}/users/${userId}`, {
      headers: {
        'Authorization': `Bearer ${authStore.token.value}`
      }
    })
    
    // 检查响应状态码
    if (response.status === 200) {
      // 显示成功消息
      alert('用户删除成功')
      
      // 刷新用户列表
      await fetchUsers();
      
      // 刷新token以获取最新的用户信息
      await authStore.fetchUserGroups()
    } else {
      alert('删除失败: ' + response.data.message)
    }
  } catch (error) {
    console.error('删除用户失败:', error)
    alert('删除用户失败，请重试')
  }
}

// 删除用户组
const deleteGroup = async (groupId) => {
  if (!confirm('确定要删除这个用户组吗？这将把该组的所有用户移至默认组。')) return;

  try {
    const response = await axios.delete(`${API_BASE_URL}/groups/${groupId}`, {
      headers: { Authorization: `Bearer ${authStore.token.value}` }
    });

    if (response.status === 200) {
      alert('用户组删除成功');
      // 刷新token以获取最新的用户组信息
      await authStore.fetchUserGroups();
      // 刷新用户列表以更新用户的groupId
      await fetchUsers();
      fetchGroups(); // 刷新用户组列表
    } else {
      alert('删除用户组失败');
    }
  } catch (error) {
    console.error('删除用户组时出错:', error);
    alert('删除用户组时出错');
  }
}

// 获取所有用户组
const fetchGroups = async () => {
  try {
    isGroupsLoading.value = true
    groupsError.value = null
    
    const response = await axios.get(`${API_BASE_URL}/groups`, {
      headers: {
        'Authorization': `Bearer ${authStore.token.value}`
      }
    })
    
    groups.value = response.data.groups
  } catch (err) {
    console.error('获取用户组数据失败:', err)
    groupsError.value = '获取用户组数据失败'
  } finally {
    isGroupsLoading.value = false
  }
}

// 获取所有任务
const fetchTodos = async () => {
  try {
    isTodosLoading.value = true
    todosError.value = null
    
    const response = await axios.get(`${API_BASE_URL}/todos`, {
      headers: {
        'Authorization': `Bearer ${authStore.token.value}`
      }
    })
    // 处理Todos数据，确保状态和优先级是正确的类型
    todos.value = response.data.todos.map(todo => ({
      ...todo,
      // 确保状态值是数字类型
      Status: Number(todo.Status),
      // 确保优先级值是字符串类型
      Priority: String(todo.Priority)
    }))
    
  } catch (err) {
    console.error('获取任务数据失败:', err)
    todosError.value = '获取任务数据失败'
  } finally {
    isTodosLoading.value = false
  }
}

// 根据ID获取用户信息
const getUserById = (userId) => {
  const user = users.value.find(user => user.id === userId);
  return user ? user.name : '未知用户';
}

// 根据ID获取用户组信息
const getGroupById = (groupId) => {
  const group = groups.value.find(group => group.id === groupId);
  return group ? group.name : '未知用户组';
}

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

// 格式化日期
const formatDate = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}

// 挂载时获取数据
// 编辑任务相关的响应式数据
const isEditTaskModalVisible = ref(false)
const editTaskId = ref('')
const editTaskName = ref('')
const editTaskDescription = ref('')
const editTaskDeadline = ref('')
const editTaskPriority = ref('普通')
const editTaskStatus = ref('计划中')
const selectedEditTaskUsers = ref([])
const selectedEditTaskGroups = ref([])

// 显示编辑任务模态框
const showEditTaskModal = (todo) => {
  editTaskId.value = todo.id
  editTaskName.value = todo.name
  editTaskDescription.value = todo.description || ''
  // 正确处理Deadline的各种情况
  if (todo.Deadline) {
    const deadlineDate = new Date(todo.Deadline);
    // 检查日期是否有效
    if (!isNaN(deadlineDate.getTime())) {
      editTaskDeadline.value = deadlineDate.toISOString().split('T')[0];
    } else {
      editTaskDeadline.value = '';
    }
  } else {
    editTaskDeadline.value = '';
  }
  editTaskPriority.value = todo.Priority;
  // 确保状态值正确转换为状态文本
  editTaskStatus.value = getStatusText(String(todo.Status));
  
  // 初始化用户和组选择
  selectedEditTaskUsers.value = [...(todo.Belonging_users || [])];
  selectedEditTaskGroups.value = [...(todo.Belonging_groups || [])];
  
  isEditTaskModalVisible.value = true
}

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

// 提交编辑任务
const submitEditTask = async () => {
  try {
    // 验证必填字段
    if (!editTaskName.value.trim()) {
      alert('请输入任务名称')
      return
    }
    
    // 准备数据
    const todoData = {
      name: editTaskName.value,
      description: editTaskDescription.value,
      deadline: editTaskDeadline.value || null,
      Priority: editTaskPriority.value,
      Status: getStatusValue(editTaskStatus.value),
      // 使用用户选择的值，确保空数组被正确处理
      Belonging_users: selectedEditTaskUsers.value.length > 0 ? selectedEditTaskUsers.value : [],
      Belonging_groups: selectedEditTaskGroups.value.length > 0 ? selectedEditTaskGroups.value : []
    }
    
    // 发送请求
    const response = await axios.put(`${API_BASE_URL}/todos/${editTaskId.value}`, todoData, {
      headers: {
        'Authorization': `Bearer ${authStore.token.value}`
      }
    })
    
    // 检查响应状态码
    if (response.status === 200) {
      // 成功后隐藏模态框
      isEditTaskModalVisible.value = false
      
      // 显示成功消息
      alert('任务更新成功')
      
      // 刷新任务列表
      await fetchTodos();
    } else {
      alert('更新失败: ' + response.data.message)
    }
  } catch (error) {
    console.error('更新任务失败:', error)
    alert('更新任务失败，请重试')
  }
}

// 删除任务
const deleteTask = async (taskId) => {
  if (!confirm('确定要删除这个任务吗？')) {
    return
  }
  
  try {
    const token = authStore.token.value
    await axios.delete(`${API_BASE_URL}/todos/${taskId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
    
    // 删除成功后刷新任务列表
    await fetchTodos()
  } catch (error) {
    console.error('删除任务失败:', error)
    alert('删除任务失败')
  }
}

// 获取用户组成员
const getGroupMembers = (groupId) => {
  return users.value.filter(user => 
    user.groups && user.groups.some(group => group.id === groupId)
  )
}

// 获取所有用户和组数据
const fetchAllUsersAndGroups = async () => {
  try {
    // 获取所有用户
    const usersResponse = await axios.get(`${API_BASE_URL}/users`, {
      headers: {
        'Authorization': `Bearer ${authStore.token.value}`
      }
    })
    allUsers.value = usersResponse.data.users || []
    
    // 获取所有用户组
    const groupsResponse = await axios.get(`${API_BASE_URL}/groups`, {
      headers: {
        'Authorization': `Bearer ${authStore.token.value}`
      }
    })
    allGroups.value = groupsResponse.data.groups || []
    
    // 获取当前用户的组信息和组长信息（多用户组）
    const ugResult = await authStore.fetchUserGroups()
    if (ugResult.success && Array.isArray(ugResult.groups)) {
      const leadersSet = new Set()
      ugResult.groups.forEach(g => {
        if (Array.isArray(g.leaders)) {
          g.leaders.forEach(id => leadersSet.add(id))
        }
      })
      groupLeaders.value = Array.from(leadersSet)
    }
  } catch (error) {
    console.error('获取用户和组数据失败:', error)
  }
}

onMounted(async () => {
  await Promise.all([
    fetchUsers(),
    fetchGroups(),
    fetchTodos(),
    fetchAllUsersAndGroups(),
    authStore.fetchUserGroups()
  ])
})
</script>

<style scoped>
</style>
