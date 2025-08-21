#!/bin/bash

# =====================================================
# 数据库升级脚本 - 多用户组支持功能
# 版本: v1.1.0_multi_group_support
# 用途: 自动化执行数据库结构升级
# =====================================================

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 配置变量
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 数据库连接配置（将通过交互式输入获取）
DB_HOST=""
DB_PORT=""
DB_USER=""
DB_PASSWORD=""
DB_NAME=""

# 备份配置
BACKUP_DIR="${SCRIPT_DIR}/database_backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/backup_before_upgrade_${TIMESTAMP}.sql"

# 升级脚本路径
UPGRADE_SCRIPT="${SCRIPT_DIR}/database_upgrade.sql"

# 函数：安全读取密码（隐藏输入）
read_password() {
    local prompt="$1"
    local password=""
    
    echo -n "$prompt"
    while IFS= read -r -s -n1 char; do
        if [[ $char == $'\0' ]]; then
            break
        elif [[ $char == $'\177' ]]; then  # 退格键
            if [ ${#password} -gt 0 ]; then
                password="${password%?}"
                echo -ne "\b \b"
            fi
        else
            password+="$char"
            echo -n "*"
        fi
    done
    echo
    echo "$password"
}

# 函数：交互式获取数据库连接信息
get_database_connection_info() {
    log_info "请输入数据库连接信息"
    echo "======================================"
    
    # 获取数据库主机地址
    while [ -z "$DB_HOST" ]; do
        echo -n "数据库服务器地址 [默认: localhost]: "
        read -r input_host
        DB_HOST=${input_host:-"localhost"}
        
        if [[ ! $DB_HOST =~ ^[a-zA-Z0-9.-]+$ ]]; then
            log_error "无效的主机地址格式，请重新输入"
            DB_HOST=""
        fi
    done
    
    # 获取数据库端口
    while [ -z "$DB_PORT" ]; do
        echo -n "数据库端口 [默认: 3306]: "
        read -r input_port
        DB_PORT=${input_port:-"3306"}
        
        if [[ ! $DB_PORT =~ ^[0-9]+$ ]] || [ "$DB_PORT" -lt 1 ] || [ "$DB_PORT" -gt 65535 ]; then
            log_error "无效的端口号，请输入1-65535之间的数字"
            DB_PORT=""
        fi
    done
    
    # 获取数据库用户名
    while [ -z "$DB_USER" ]; do
        echo -n "数据库用户名 [默认: root]: "
        read -r input_user
        DB_USER=${input_user:-"root"}
        
        if [[ ${#DB_USER} -lt 1 ]]; then
            log_error "用户名不能为空，请重新输入"
            DB_USER=""
        fi
    done
    
    # 获取数据库密码
    while true; do
        DB_PASSWORD=$(read_password "数据库密码: ")
        if [ -z "$DB_PASSWORD" ]; then
            echo -n "密码为空，是否继续？(y/N): "
            read -r confirm
            if [[ $confirm =~ ^[Yy]$ ]]; then
                break
            fi
        else
            break
        fi
    done
    
    # 获取数据库名称
    while [ -z "$DB_NAME" ]; do
        echo -n "数据库名称 [默认: todos_db]: "
        read -r input_db
        DB_NAME=${input_db:-"todos_db"}
        
        if [[ ! $DB_NAME =~ ^[a-zA-Z0-9_]+$ ]]; then
            log_error "无效的数据库名称格式，只能包含字母、数字和下划线"
            DB_NAME=""
        fi
    done
    
    echo "======================================"
    log_info "连接信息确认:"
    echo "  主机: $DB_HOST"
    echo "  端口: $DB_PORT"
    echo "  用户: $DB_USER"
    echo "  数据库: $DB_NAME"
    echo "  密码: $([ -n "$DB_PASSWORD" ] && echo "已设置" || echo "未设置")"
    echo "======================================"
    
    echo -n "确认以上信息是否正确？(Y/n): "
    read -r confirm
    if [[ $confirm =~ ^[Nn]$ ]]; then
        log_info "重新输入连接信息..."
        DB_HOST=""
        DB_PORT=""
        DB_USER=""
        DB_PASSWORD=""
        DB_NAME=""
        get_database_connection_info
    fi
}

# 函数：检查必要的工具
check_requirements() {
    log_info "检查系统要求..."
    
    # 检查mysql客户端
    if ! command -v mysql &> /dev/null; then
        log_error "MySQL客户端未安装或不在PATH中"
        log_error "请安装MySQL客户端工具包"
        log_info "Ubuntu/Debian: sudo apt-get install mysql-client"
        log_info "CentOS/RHEL: sudo yum install mysql"
        log_info "macOS: brew install mysql-client"
        exit 1
    fi
    
    # 检查mysqldump
    if ! command -v mysqldump &> /dev/null; then
        log_error "mysqldump工具未安装或不在PATH中"
        log_error "请安装MySQL客户端工具包（包含mysqldump）"
        exit 1
    fi
    
    # 检查升级脚本是否存在
    if [ ! -f "$UPGRADE_SCRIPT" ]; then
        log_error "升级脚本不存在: $UPGRADE_SCRIPT"
        log_error "请确保database_upgrade.sql文件在脚本同一目录下"
        exit 1
    fi
    
    log_success "系统要求检查通过"
}

# 函数：构建MySQL连接参数
build_mysql_connection() {
    local connection_params="-h$DB_HOST -P$DB_PORT -u$DB_USER"
    if [ -n "$DB_PASSWORD" ]; then
        connection_params="$connection_params -p$DB_PASSWORD"
    fi
    echo "$connection_params"
}

# 函数：测试数据库连接
test_database_connection() {
    log_info "测试数据库连接..."
    
    local connection_params=$(build_mysql_connection)
    
    if eval "mysql $connection_params -e 'SELECT 1;'" &> /dev/null; then
        log_success "数据库连接成功"
    else
        log_error "数据库连接失败，请检查以下连接参数:"
        echo "  主机: $DB_HOST"
        echo "  端口: $DB_PORT"
        echo "  用户: $DB_USER"
        echo "  密码: $([ -n "$DB_PASSWORD" ] && echo "已设置" || echo "未设置")"
        echo ""
        log_error "可能的原因:"
        echo "  1. 数据库服务器未启动"
        echo "  2. 网络连接问题"
        echo "  3. 用户名或密码错误"
        echo "  4. 用户权限不足"
        echo "  5. 防火墙阻止连接"
        echo ""
        echo -n "是否重新输入连接信息？(Y/n): "
        read -r retry
        if [[ ! $retry =~ ^[Nn]$ ]]; then
            DB_HOST=""
            DB_PORT=""
            DB_USER=""
            DB_PASSWORD=""
            DB_NAME=""
            get_database_connection_info
            test_database_connection
        else
            exit 1
        fi
    fi
}

# 函数：检查数据库是否存在
check_database_exists() {
    log_info "检查数据库是否存在..."
    
    local connection_params=$(build_mysql_connection)
    
    if eval "mysql $connection_params -e 'USE $DB_NAME;'" &> /dev/null; then
        log_success "数据库 $DB_NAME 存在"
    else
        log_error "数据库 $DB_NAME 不存在"
        echo ""
        echo -n "是否要创建数据库 $DB_NAME？(y/N): "
        read -r create_db
        if [[ $create_db =~ ^[Yy]$ ]]; then
            log_info "正在创建数据库 $DB_NAME..."
            if eval "mysql $connection_params -e 'CREATE DATABASE $DB_NAME CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;'"; then
                log_success "数据库 $DB_NAME 创建成功"
            else
                log_error "数据库创建失败"
                exit 1
            fi
        else
            log_error "无法继续，数据库不存在"
            exit 1
        fi
    fi
}

# 函数：检查是否已经升级过
check_upgrade_status() {
    log_info "检查升级状态..."
    
    local connection_params=$(build_mysql_connection)
    
    # 检查是否存在版本控制表
    if eval "mysql $connection_params \"$DB_NAME\" -e 'SHOW TABLES LIKE \"database_versions\";'" | grep -q "database_versions"; then
        # 检查是否已经应用过此版本的升级
        if eval "mysql $connection_params \"$DB_NAME\" -e 'SELECT COUNT(*) FROM database_versions WHERE version = \"v1.1.0_multi_group_support\";'" | tail -n 1 | grep -q "1"; then
            log_warning "检测到数据库已经升级过 (v1.1.0_multi_group_support)"
            echo -n "是否要强制重新执行升级？(y/N): "
            read -r force_reply
            if [[ ! $force_reply =~ ^[Yy]$ ]]; then
                log_info "升级已取消"
                exit 0
            fi
        fi
    fi
}

# 函数：创建备份目录
create_backup_directory() {
    log_info "创建备份目录..."
    
    if [ ! -d "$BACKUP_DIR" ]; then
        mkdir -p "$BACKUP_DIR"
        log_success "备份目录已创建: $BACKUP_DIR"
    else
        log_info "备份目录已存在: $BACKUP_DIR"
    fi
}

# 函数：备份数据库
backup_database() {
    log_info "开始备份数据库..."
    
    local connection_params=$(build_mysql_connection)
    local dump_cmd="mysqldump $connection_params --single-transaction --routines --triggers --events --add-drop-table \"$DB_NAME\""
    
    log_info "正在备份数据库，请稍候..."
    if eval "$dump_cmd" > "$BACKUP_FILE"; then
        log_success "数据库备份完成: $BACKUP_FILE"
        
        # 显示备份文件大小
        BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
        log_info "备份文件大小: $BACKUP_SIZE"
        
        # 验证备份文件
        if [ ! -s "$BACKUP_FILE" ]; then
            log_error "备份文件为空，备份可能失败"
            exit 1
        fi
    else
        log_error "数据库备份失败"
        log_error "请检查磁盘空间和数据库权限"
        exit 1
    fi
}

# 函数：执行升级脚本
execute_upgrade() {
    log_info "开始执行数据库升级..."
    log_info "正在应用数据库结构变更，请稍候..."
    
    local connection_params=$(build_mysql_connection)
    
    if eval "mysql $connection_params \"$DB_NAME\"" < "$UPGRADE_SCRIPT"; then
        log_success "数据库升级脚本执行完成"
    else
        log_error "数据库升级失败"
        log_error "请检查升级脚本或数据库状态"
        echo ""
        log_warning "如需恢复备份，请使用以下命令:"
        echo "mysql $connection_params \"$DB_NAME\" < \"$BACKUP_FILE\""
        echo ""
        echo -n "是否要自动恢复备份？(y/N): "
        read -r restore_backup
        if [[ $restore_backup =~ ^[Yy]$ ]]; then
            log_info "正在恢复备份..."
            if eval "mysql $connection_params \"$DB_NAME\"" < "$BACKUP_FILE"; then
                log_success "备份恢复成功"
            else
                log_error "备份恢复失败，请手动恢复"
            fi
        fi
        exit 1
    fi
}

# 函数：验证升级结果
verify_upgrade() {
    log_info "验证升级结果..."
    
    local connection_params=$(build_mysql_connection)
    
    # 检查新表是否创建成功
    if eval "mysql $connection_params \"$DB_NAME\" -e 'SHOW TABLES LIKE \"user_group_memberships\";'" | grep -q "user_group_memberships"; then
        log_success "user_group_memberships 表创建成功"
    else
        log_error "user_group_memberships 表创建失败"
        return 1
    fi
    
    # 检查视图是否创建成功
    if eval "mysql $connection_params \"$DB_NAME\" -e 'SHOW FULL TABLES WHERE Table_type = \"VIEW\";'" | grep -q "user_groups_view"; then
        log_success "视图创建成功"
    else
        log_warning "视图创建可能失败，请手动检查"
    fi
    
    # 检查数据迁移结果
    MIGRATED_COUNT=$(eval "mysql $connection_params \"$DB_NAME\" -e 'SELECT COUNT(*) FROM user_group_memberships WHERE notes LIKE \"%数据迁移%\";'" | tail -n 1)
    ORIGINAL_COUNT=$(eval "mysql $connection_params \"$DB_NAME\" -e 'SELECT COUNT(*) FROM users WHERE group_id IS NOT NULL;'" | tail -n 1)
    
    log_info "数据迁移统计:"
    log_info "  原始用户组关系数量: $ORIGINAL_COUNT"
    log_info "  迁移的关系数量: $MIGRATED_COUNT"
    
    if [ "$MIGRATED_COUNT" -eq "$ORIGINAL_COUNT" ]; then
        log_success "数据迁移验证通过"
    else
        log_warning "数据迁移数量不匹配，请手动检查"
    fi
    
    # 检查版本记录
    if eval "mysql $connection_params \"$DB_NAME\" -e 'SELECT version, applied_at FROM database_versions WHERE version = \"v1.1.0_multi_group_support\";'" | grep -q "v1.1.0_multi_group_support"; then
        log_success "版本记录创建成功"
    else
        log_warning "版本记录创建失败"
    fi
}

# 函数：显示升级摘要
show_upgrade_summary() {
    log_info "升级摘要:"
    echo "======================================"
    echo "升级版本: v1.1.0_multi_group_support"
    echo "升级时间: $(date)"
    echo "数据库: $DB_NAME"
    echo "备份文件: $BACKUP_FILE"
    echo "======================================"
    
    log_info "主要变更:"
    echo "  ✓ 创建 user_group_memberships 表（支持多对多关系）"
    echo "  ✓ 迁移现有用户组关系数据"
    echo "  ✓ 创建便捷查询视图"
    echo "  ✓ 添加用户组管理存储过程"
    echo "  ✓ 保留原有 group_id 字段（向后兼容）"
    
    log_success "数据库升级完成！"
    log_info "请重启应用程序以使用新功能"
}

# 函数：清理旧备份文件
cleanup_old_backups() {
    log_info "清理旧备份文件..."
    
    # 保留最近7天的备份文件
    find "$BACKUP_DIR" -name "backup_before_upgrade_*.sql" -mtime +7 -delete 2>/dev/null || true
    
    REMAINING_BACKUPS=$(find "$BACKUP_DIR" -name "backup_before_upgrade_*.sql" | wc -l)
    log_info "当前保留的备份文件数量: $REMAINING_BACKUPS"
}

# 函数：显示帮助信息
show_help() {
    echo "数据库升级脚本 - 多用户组支持功能"
    echo "======================================"
    echo "此脚本将通过交互式方式获取数据库连接信息，"
    echo "然后执行数据库结构升级以支持多用户组功能。"
    echo ""
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  -h, --help              显示此帮助信息"
    echo "  -c, --check-only        仅检查升级状态，不执行升级"
    echo "  -b, --backup-only       仅执行备份，不升级"
    echo "  -v, --verify-only       仅验证升级结果"
    echo "  --skip-backup          跳过备份步骤（不推荐）"
    echo "  --force                强制执行升级（即使已升级过）"
    echo ""
    echo "功能说明:"
    echo "  • 交互式输入数据库连接信息（安全密码输入）"
    echo "  • 自动备份数据库（可选择跳过）"
    echo "  • 执行数据库结构升级"
    echo "  • 迁移现有用户组关系数据"
    echo "  • 验证升级结果"
    echo "  • 支持失败时自动恢复备份"
    echo ""
    echo "安全特性:"
    echo "  • 密码输入时隐藏显示"
    echo "  • 输入验证和格式检查"
    echo "  • 连接测试和错误处理"
    echo "  • 自动备份和恢复机制"
    echo ""
    echo "示例:"
    echo "  $0                     执行完整升级流程（推荐）"
    echo "  $0 --check-only        仅检查当前升级状态"
    echo "  $0 --backup-only       仅备份数据库"
    echo "  $0 --verify-only       仅验证已完成的升级"
    echo ""
    echo "注意事项:"
    echo "  • 请确保MySQL客户端工具已安装"
    echo "  • 建议在维护窗口期间执行升级"
    echo "  • 升级前请停止应用程序服务"
    echo "  • 确保有足够的磁盘空间进行备份"
}

# 主函数
main() {
    local CHECK_ONLY=false
    local BACKUP_ONLY=false
    local VERIFY_ONLY=false
    local SKIP_BACKUP=false
    local FORCE_UPGRADE=false
    
    # 解析命令行参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help
                exit 0
                ;;
            -c|--check-only)
                CHECK_ONLY=true
                shift
                ;;
            -b|--backup-only)
                BACKUP_ONLY=true
                shift
                ;;
            -v|--verify-only)
                VERIFY_ONLY=true
                shift
                ;;
            --skip-backup)
                SKIP_BACKUP=true
                shift
                ;;
            --force)
                FORCE_UPGRADE=true
                shift
                ;;
            *)
                log_error "未知参数: $1"
                show_help
                exit 1
                ;;
        esac
    done
    
    # 显示脚本信息
    echo "======================================"
    echo "数据库升级脚本 - 多用户组支持功能"
    echo "版本: v1.1.0_multi_group_support"
    echo "======================================"
    echo ""
    
    # 基础检查
    check_requirements
    
    # 获取数据库连接信息（交互式输入）
    get_database_connection_info
    
    # 测试数据库连接
    test_database_connection
    
    # 检查数据库是否存在
    check_database_exists
    
    if [ "$CHECK_ONLY" = true ]; then
        check_upgrade_status
        log_info "检查完成"
        exit 0
    fi
    
    if [ "$VERIFY_ONLY" = true ]; then
        verify_upgrade
        exit 0
    fi
    
    # 检查升级状态（除非强制升级）
    if [ "$FORCE_UPGRADE" = false ]; then
        check_upgrade_status
    fi
    
    # 创建备份目录
    create_backup_directory
    
    # 备份数据库（除非跳过）
    if [ "$SKIP_BACKUP" = false ]; then
        if [ "$BACKUP_ONLY" = true ]; then
            backup_database
            log_success "备份完成，退出"
            exit 0
        else
            backup_database
        fi
    elif [ "$BACKUP_ONLY" = true ]; then
        log_warning "跳过备份参数与仅备份参数冲突，将执行备份"
        backup_database
        log_success "备份完成，退出"
        exit 0
    fi
    
    # 最后确认
    echo ""
    log_warning "即将开始数据库升级，这将修改数据库结构"
    echo -n "确认继续执行升级？(Y/n): "
    read -r final_confirm
    if [[ $final_confirm =~ ^[Nn]$ ]]; then
        log_info "升级已取消"
        exit 0
    fi
    
    # 执行升级
    execute_upgrade
    
    # 验证升级结果
    verify_upgrade
    
    # 清理旧备份
    cleanup_old_backups
    
    # 显示升级摘要
    show_upgrade_summary
}

# 脚本入口点
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi

# =====================================================
# 使用说明
# =====================================================
# 
# 1. 基本使用（推荐）:
#    chmod +x database_upgrade.sh
#    ./database_upgrade.sh
#    
#    脚本将交互式引导您输入数据库连接信息，
#    然后执行完整的升级流程。
# 
# 2. 仅检查升级状态:
#    ./database_upgrade.sh --check-only
# 
# 3. 仅备份数据库:
#    ./database_upgrade.sh --backup-only
# 
# 4. 仅验证升级结果:
#    ./database_upgrade.sh --verify-only
# 
# 5. 强制重新升级:
#    ./database_upgrade.sh --force
# 
# 6. 跳过备份（不推荐）:
#    ./database_upgrade.sh --skip-backup
# 
# 安全特性:
# - 密码输入时完全隐藏显示
# - 输入验证和格式检查
# - 连接测试和错误处理
# - 自动备份和恢复机制
# - 升级前最终确认
# 
# 注意事项:
# - 确保MySQL客户端工具已安装
# - 确保有足够的磁盘空间进行备份
# - 建议在维护窗口期间执行升级
# - 升级前请停止应用程序服务
# - 升级后请重启应用程序
# - 脚本不依赖环境变量或配置文件
# =====================================================