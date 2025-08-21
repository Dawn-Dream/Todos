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

# 配置变量（从环境变量或.env文件读取）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/backend/.env"

# 加载环境变量
if [ -f "$ENV_FILE" ]; then
    log_info "加载环境变量文件: $ENV_FILE"
    export $(grep -v '^#' "$ENV_FILE" | xargs)
else
    log_warning "未找到环境变量文件: $ENV_FILE"
fi

# 数据库连接配置
DB_HOST=${DB_HOST:-"localhost"}
DB_PORT=${DB_PORT:-"3306"}
DB_USER=${DB_USER:-"root"}
DB_PASSWORD=${DB_PASSWORD:-""}
DB_NAME=${DB_NAME:-"todos_db"}

# 备份配置
BACKUP_DIR="${SCRIPT_DIR}/database_backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/backup_before_upgrade_${TIMESTAMP}.sql"

# 升级脚本路径
UPGRADE_SCRIPT="${SCRIPT_DIR}/database_upgrade.sql"

# 函数：检查必要的工具
check_requirements() {
    log_info "检查系统要求..."
    
    # 检查mysql客户端
    if ! command -v mysql &> /dev/null; then
        log_error "MySQL客户端未安装或不在PATH中"
        exit 1
    fi
    
    # 检查mysqldump
    if ! command -v mysqldump &> /dev/null; then
        log_error "mysqldump工具未安装或不在PATH中"
        exit 1
    fi
    
    # 检查升级脚本是否存在
    if [ ! -f "$UPGRADE_SCRIPT" ]; then
        log_error "升级脚本不存在: $UPGRADE_SCRIPT"
        exit 1
    fi
    
    log_success "系统要求检查通过"
}

# 函数：测试数据库连接
test_database_connection() {
    log_info "测试数据库连接..."
    
    if mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" -e "SELECT 1;" &> /dev/null; then
        log_success "数据库连接成功"
    else
        log_error "数据库连接失败，请检查连接参数"
        log_error "Host: $DB_HOST, Port: $DB_PORT, User: $DB_USER"
        exit 1
    fi
}

# 函数：检查数据库是否存在
check_database_exists() {
    log_info "检查数据库是否存在..."
    
    if mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" -e "USE $DB_NAME;" &> /dev/null; then
        log_success "数据库 $DB_NAME 存在"
    else
        log_error "数据库 $DB_NAME 不存在"
        exit 1
    fi
}

# 函数：检查是否已经升级过
check_upgrade_status() {
    log_info "检查升级状态..."
    
    # 检查是否存在版本控制表
    if mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "SHOW TABLES LIKE 'database_versions';" | grep -q "database_versions"; then
        # 检查是否已经应用过此版本的升级
        if mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "SELECT COUNT(*) FROM database_versions WHERE version = 'v1.1.0_multi_group_support';" | tail -n 1 | grep -q "1"; then
            log_warning "检测到数据库已经升级过 (v1.1.0_multi_group_support)"
            read -p "是否要强制重新执行升级？(y/N): " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
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
    
    if mysqldump -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" \
        --single-transaction \
        --routines \
        --triggers \
        --events \
        --add-drop-table \
        "$DB_NAME" > "$BACKUP_FILE"; then
        log_success "数据库备份完成: $BACKUP_FILE"
        
        # 显示备份文件大小
        BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
        log_info "备份文件大小: $BACKUP_SIZE"
    else
        log_error "数据库备份失败"
        exit 1
    fi
}

# 函数：执行升级脚本
execute_upgrade() {
    log_info "开始执行数据库升级..."
    
    if mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < "$UPGRADE_SCRIPT"; then
        log_success "数据库升级脚本执行完成"
    else
        log_error "数据库升级失败"
        log_error "请检查升级脚本或数据库状态"
        log_info "可以使用以下命令恢复备份:"
        log_info "mysql -h$DB_HOST -P$DB_PORT -u$DB_USER -p$DB_PASSWORD $DB_NAME < $BACKUP_FILE"
        exit 1
    fi
}

# 函数：验证升级结果
verify_upgrade() {
    log_info "验证升级结果..."
    
    # 检查新表是否创建成功
    if mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "SHOW TABLES LIKE 'user_group_memberships';" | grep -q "user_group_memberships"; then
        log_success "user_group_memberships 表创建成功"
    else
        log_error "user_group_memberships 表创建失败"
        return 1
    fi
    
    # 检查视图是否创建成功
    if mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "SHOW FULL TABLES WHERE Table_type = 'VIEW';" | grep -q "user_groups_view"; then
        log_success "视图创建成功"
    else
        log_warning "视图创建可能失败，请手动检查"
    fi
    
    # 检查数据迁移结果
    MIGRATED_COUNT=$(mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "SELECT COUNT(*) FROM user_group_memberships WHERE notes LIKE '%数据迁移%';" | tail -n 1)
    ORIGINAL_COUNT=$(mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "SELECT COUNT(*) FROM users WHERE group_id IS NOT NULL;" | tail -n 1)
    
    log_info "数据迁移统计:"
    log_info "  原始用户组关系数量: $ORIGINAL_COUNT"
    log_info "  迁移的关系数量: $MIGRATED_COUNT"
    
    if [ "$MIGRATED_COUNT" -eq "$ORIGINAL_COUNT" ]; then
        log_success "数据迁移验证通过"
    else
        log_warning "数据迁移数量不匹配，请手动检查"
    fi
    
    # 检查版本记录
    if mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "SELECT version, applied_at FROM database_versions WHERE version = 'v1.1.0_multi_group_support';" | grep -q "v1.1.0_multi_group_support"; then
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
    echo "环境变量:"
    echo "  DB_HOST                数据库主机 (默认: localhost)"
    echo "  DB_PORT                数据库端口 (默认: 3306)"
    echo "  DB_USER                数据库用户名 (默认: root)"
    echo "  DB_PASSWORD            数据库密码"
    echo "  DB_NAME                数据库名称 (默认: todos_db)"
    echo ""
    echo "示例:"
    echo "  $0                     执行完整升级流程"
    echo "  $0 --check-only        仅检查升级状态"
    echo "  $0 --backup-only       仅备份数据库"
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
    
    log_info "开始数据库升级流程..."
    
    # 基础检查
    check_requirements
    test_database_connection
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
    
    # 备份数据库（除非跳过或仅验证）
    if [ "$SKIP_BACKUP" = false ] && [ "$BACKUP_ONLY" = false ]; then
        backup_database
    elif [ "$BACKUP_ONLY" = true ]; then
        backup_database
        log_success "备份完成，退出"
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
# 1. 基本使用:
#    chmod +x database_upgrade.sh
#    ./database_upgrade.sh
# 
# 2. 仅检查状态:
#    ./database_upgrade.sh --check-only
# 
# 3. 仅备份数据库:
#    ./database_upgrade.sh --backup-only
# 
# 4. 强制重新升级:
#    ./database_upgrade.sh --force
# 
# 5. 跳过备份（不推荐）:
#    ./database_upgrade.sh --skip-backup
# 
# 注意事项:
# - 确保有足够的磁盘空间进行备份
# - 建议在维护窗口期间执行升级
# - 升级前请停止应用程序服务
# - 升级后请重启应用程序
# =====================================================