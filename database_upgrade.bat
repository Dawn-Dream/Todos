@echo off
setlocal enabledelayedexpansion

REM =====================================================
REM 数据库升级脚本 - 多用户组支持功能 (Windows版本)
REM 版本: v1.1.0_multi_group_support
REM 用途: 自动化执行数据库结构升级
REM =====================================================

REM 设置代码页为UTF-8
chcp 65001 >nul

REM 颜色定义（Windows CMD）
set "RED=[91m"
set "GREEN=[92m"
set "YELLOW=[93m"
set "BLUE=[94m"
set "NC=[0m"

REM 配置变量
set "SCRIPT_DIR=%~dp0"
set "ENV_FILE=%SCRIPT_DIR%backend\.env"
set "UPGRADE_SCRIPT=%SCRIPT_DIR%database_upgrade.sql"

REM 默认数据库配置
set "DB_HOST=localhost"
set "DB_PORT=3306"
set "DB_USER=root"
set "DB_PASSWORD="
set "DB_NAME=todos_db"

REM 备份配置
set "BACKUP_DIR=%SCRIPT_DIR%database_backups"
for /f "tokens=2 delims==" %%a in ('wmic OS Get localdatetime /value') do set "dt=%%a"
set "TIMESTAMP=%dt:~0,4%%dt:~4,2%%dt:~6,2%_%dt:~8,2%%dt:~10,2%%dt:~12,2%"
set "BACKUP_FILE=%BACKUP_DIR%\backup_before_upgrade_%TIMESTAMP%.sql"

REM 命令行参数
set "CHECK_ONLY=false"
set "BACKUP_ONLY=false"
set "VERIFY_ONLY=false"
set "SKIP_BACKUP=false"
set "FORCE_UPGRADE=false"

REM 日志函数
:log_info
echo %BLUE%[INFO]%NC% %~1
goto :eof

:log_success
echo %GREEN%[SUCCESS]%NC% %~1
goto :eof

:log_warning
echo %YELLOW%[WARNING]%NC% %~1
goto :eof

:log_error
echo %RED%[ERROR]%NC% %~1
goto :eof

REM 显示帮助信息
:show_help
echo 数据库升级脚本 - 多用户组支持功能
echo.
echo 用法: %~nx0 [选项]
echo.
echo 选项:
echo   /h, /help              显示此帮助信息
echo   /c, /check-only        仅检查升级状态，不执行升级
echo   /b, /backup-only       仅执行备份，不升级
echo   /v, /verify-only       仅验证升级结果
echo   /skip-backup          跳过备份步骤（不推荐）
echo   /force                强制执行升级（即使已升级过）
echo.
echo 环境变量:
echo   DB_HOST                数据库主机 (默认: localhost)
echo   DB_PORT                数据库端口 (默认: 3306)
echo   DB_USER                数据库用户名 (默认: root)
echo   DB_PASSWORD            数据库密码
echo   DB_NAME                数据库名称 (默认: todos_db)
echo.
echo 示例:
echo   %~nx0                  执行完整升级流程
echo   %~nx0 /check-only      仅检查升级状态
echo   %~nx0 /backup-only     仅备份数据库
goto :eof

REM 加载环境变量
:load_env_vars
call :log_info "加载环境变量..."
if exist "%ENV_FILE%" (
    call :log_info "找到环境变量文件: %ENV_FILE%"
    for /f "usebackq tokens=1,2 delims==" %%a in ("%ENV_FILE%") do (
        if not "%%a"=="" if not "%%a:~0,1%"=="#" (
            set "%%a=%%b"
        )
    )
    call :log_success "环境变量加载完成"
) else (
    call :log_warning "未找到环境变量文件: %ENV_FILE%"
)
goto :eof

REM 检查必要的工具
:check_requirements
call :log_info "检查系统要求..."

REM 检查mysql客户端
mysql --version >nul 2>&1
if errorlevel 1 (
    call :log_error "MySQL客户端未安装或不在PATH中"
    call :log_error "请安装MySQL客户端或将其添加到PATH环境变量"
    exit /b 1
)

REM 检查mysqldump
mysqldump --version >nul 2>&1
if errorlevel 1 (
    call :log_error "mysqldump工具未安装或不在PATH中"
    exit /b 1
)

REM 检查升级脚本是否存在
if not exist "%UPGRADE_SCRIPT%" (
    call :log_error "升级脚本不存在: %UPGRADE_SCRIPT%"
    exit /b 1
)

call :log_success "系统要求检查通过"
goto :eof

REM 测试数据库连接
:test_database_connection
call :log_info "测试数据库连接..."

if "%DB_PASSWORD%"=="" (
    mysql -h"%DB_HOST%" -P"%DB_PORT%" -u"%DB_USER%" -e "SELECT 1;" >nul 2>&1
) else (
    mysql -h"%DB_HOST%" -P"%DB_PORT%" -u"%DB_USER%" -p"%DB_PASSWORD%" -e "SELECT 1;" >nul 2>&1
)

if errorlevel 1 (
    call :log_error "数据库连接失败，请检查连接参数"
    call :log_error "Host: %DB_HOST%, Port: %DB_PORT%, User: %DB_USER%"
    exit /b 1
)

call :log_success "数据库连接成功"
goto :eof

REM 检查数据库是否存在
:check_database_exists
call :log_info "检查数据库是否存在..."

if "%DB_PASSWORD%"=="" (
    mysql -h"%DB_HOST%" -P"%DB_PORT%" -u"%DB_USER%" -e "USE %DB_NAME%;" >nul 2>&1
) else (
    mysql -h"%DB_HOST%" -P"%DB_PORT%" -u"%DB_USER%" -p"%DB_PASSWORD%" -e "USE %DB_NAME%;" >nul 2>&1
)

if errorlevel 1 (
    call :log_error "数据库 %DB_NAME% 不存在"
    exit /b 1
)

call :log_success "数据库 %DB_NAME% 存在"
goto :eof

REM 创建备份目录
:create_backup_directory
call :log_info "创建备份目录..."

if not exist "%BACKUP_DIR%" (
    mkdir "%BACKUP_DIR%"
    call :log_success "备份目录已创建: %BACKUP_DIR%"
) else (
    call :log_info "备份目录已存在: %BACKUP_DIR%"
)
goto :eof

REM 备份数据库
:backup_database
call :log_info "开始备份数据库..."

if "%DB_PASSWORD%"=="" (
    mysqldump -h"%DB_HOST%" -P"%DB_PORT%" -u"%DB_USER%" --single-transaction --routines --triggers --events --add-drop-table "%DB_NAME%" > "%BACKUP_FILE%"
) else (
    mysqldump -h"%DB_HOST%" -P"%DB_PORT%" -u"%DB_USER%" -p"%DB_PASSWORD%" --single-transaction --routines --triggers --events --add-drop-table "%DB_NAME%" > "%BACKUP_FILE%"
)

if errorlevel 1 (
    call :log_error "数据库备份失败"
    exit /b 1
)

call :log_success "数据库备份完成: %BACKUP_FILE%"

REM 显示备份文件大小
for %%A in ("%BACKUP_FILE%") do (
    set "BACKUP_SIZE=%%~zA"
)
set /a BACKUP_SIZE_MB=!BACKUP_SIZE!/1024/1024
call :log_info "备份文件大小: !BACKUP_SIZE_MB! MB"
goto :eof

REM 执行升级脚本
:execute_upgrade
call :log_info "开始执行数据库升级..."

if "%DB_PASSWORD%"=="" (
    mysql -h"%DB_HOST%" -P"%DB_PORT%" -u"%DB_USER%" "%DB_NAME%" < "%UPGRADE_SCRIPT%"
) else (
    mysql -h"%DB_HOST%" -P"%DB_PORT%" -u"%DB_USER%" -p"%DB_PASSWORD%" "%DB_NAME%" < "%UPGRADE_SCRIPT%"
)

if errorlevel 1 (
    call :log_error "数据库升级失败"
    call :log_error "请检查升级脚本或数据库状态"
    call :log_info "可以使用以下命令恢复备份:"
    if "%DB_PASSWORD%"=="" (
        call :log_info "mysql -h%DB_HOST% -P%DB_PORT% -u%DB_USER% %DB_NAME% < %BACKUP_FILE%"
    ) else (
        call :log_info "mysql -h%DB_HOST% -P%DB_PORT% -u%DB_USER% -p%DB_PASSWORD% %DB_NAME% < %BACKUP_FILE%"
    )
    exit /b 1
)

call :log_success "数据库升级脚本执行完成"
goto :eof

REM 验证升级结果
:verify_upgrade
call :log_info "验证升级结果..."

REM 检查新表是否创建成功
if "%DB_PASSWORD%"=="" (
    mysql -h"%DB_HOST%" -P"%DB_PORT%" -u"%DB_USER%" "%DB_NAME%" -e "SHOW TABLES LIKE 'user_group_memberships';" | findstr "user_group_memberships" >nul
) else (
    mysql -h"%DB_HOST%" -P"%DB_PORT%" -u"%DB_USER%" -p"%DB_PASSWORD%" "%DB_NAME%" -e "SHOW TABLES LIKE 'user_group_memberships';" | findstr "user_group_memberships" >nul
)

if errorlevel 1 (
    call :log_error "user_group_memberships 表创建失败"
    exit /b 1
) else (
    call :log_success "user_group_memberships 表创建成功"
)

REM 检查数据迁移结果
if "%DB_PASSWORD%"=="" (
    for /f "skip=1" %%i in ('mysql -h"%DB_HOST%" -P"%DB_PORT%" -u"%DB_USER%" "%DB_NAME%" -e "SELECT COUNT(*) FROM user_group_memberships WHERE notes LIKE '%%数据迁移%%';"') do set "MIGRATED_COUNT=%%i"
    for /f "skip=1" %%i in ('mysql -h"%DB_HOST%" -P"%DB_PORT%" -u"%DB_USER%" "%DB_NAME%" -e "SELECT COUNT(*) FROM users WHERE group_id IS NOT NULL;"') do set "ORIGINAL_COUNT=%%i"
) else (
    for /f "skip=1" %%i in ('mysql -h"%DB_HOST%" -P"%DB_PORT%" -u"%DB_USER%" -p"%DB_PASSWORD%" "%DB_NAME%" -e "SELECT COUNT(*) FROM user_group_memberships WHERE notes LIKE '%%数据迁移%%';"') do set "MIGRATED_COUNT=%%i"
    for /f "skip=1" %%i in ('mysql -h"%DB_HOST%" -P"%DB_PORT%" -u"%DB_USER%" -p"%DB_PASSWORD%" "%DB_NAME%" -e "SELECT COUNT(*) FROM users WHERE group_id IS NOT NULL;"') do set "ORIGINAL_COUNT=%%i"
)

call :log_info "数据迁移统计:"
call :log_info "  原始用户组关系数量: !ORIGINAL_COUNT!"
call :log_info "  迁移的关系数量: !MIGRATED_COUNT!"

if "!MIGRATED_COUNT!"=="!ORIGINAL_COUNT!" (
    call :log_success "数据迁移验证通过"
) else (
    call :log_warning "数据迁移数量不匹配，请手动检查"
)
goto :eof

REM 显示升级摘要
:show_upgrade_summary
call :log_info "升级摘要:"
echo ======================================
echo 升级版本: v1.1.0_multi_group_support
echo 升级时间: %date% %time%
echo 数据库: %DB_NAME%
echo 备份文件: %BACKUP_FILE%
echo ======================================

call :log_info "主要变更:"
echo   ✓ 创建 user_group_memberships 表（支持多对多关系）
echo   ✓ 迁移现有用户组关系数据
echo   ✓ 创建便捷查询视图
echo   ✓ 添加用户组管理存储过程
echo   ✓ 保留原有 group_id 字段（向后兼容）

call :log_success "数据库升级完成！"
call :log_info "请重启应用程序以使用新功能"
goto :eof

REM 解析命令行参数
:parse_args
:parse_loop
if "%~1"=="" goto :parse_done
if /i "%~1"=="/h" goto :show_help_and_exit
if /i "%~1"=="/help" goto :show_help_and_exit
if /i "%~1"=="/c" set "CHECK_ONLY=true" & shift & goto :parse_loop
if /i "%~1"=="/check-only" set "CHECK_ONLY=true" & shift & goto :parse_loop
if /i "%~1"=="/b" set "BACKUP_ONLY=true" & shift & goto :parse_loop
if /i "%~1"=="/backup-only" set "BACKUP_ONLY=true" & shift & goto :parse_loop
if /i "%~1"=="/v" set "VERIFY_ONLY=true" & shift & goto :parse_loop
if /i "%~1"=="/verify-only" set "VERIFY_ONLY=true" & shift & goto :parse_loop
if /i "%~1"=="/skip-backup" set "SKIP_BACKUP=true" & shift & goto :parse_loop
if /i "%~1"=="/force" set "FORCE_UPGRADE=true" & shift & goto :parse_loop
call :log_error "未知参数: %~1"
call :show_help
exit /b 1

:show_help_and_exit
call :show_help
exit /b 0

:parse_done
goto :eof

REM 主函数
:main
call :parse_args %*
if errorlevel 1 exit /b 1

call :log_info "开始数据库升级流程..."

REM 加载环境变量
call :load_env_vars

REM 基础检查
call :check_requirements
if errorlevel 1 exit /b 1

call :test_database_connection
if errorlevel 1 exit /b 1

call :check_database_exists
if errorlevel 1 exit /b 1

if "%CHECK_ONLY%"=="true" (
    call :log_info "检查完成"
    exit /b 0
)

if "%VERIFY_ONLY%"=="true" (
    call :verify_upgrade
    exit /b 0
)

REM 创建备份目录
call :create_backup_directory

REM 备份数据库（除非跳过或仅验证）
if "%SKIP_BACKUP%"=="false" (
    if "%BACKUP_ONLY%"=="false" (
        call :backup_database
        if errorlevel 1 exit /b 1
    ) else (
        call :backup_database
        if errorlevel 1 exit /b 1
        call :log_success "备份完成，退出"
        exit /b 0
    )
) else if "%BACKUP_ONLY%"=="true" (
    call :backup_database
    if errorlevel 1 exit /b 1
    call :log_success "备份完成，退出"
    exit /b 0
)

REM 执行升级
call :execute_upgrade
if errorlevel 1 exit /b 1

REM 验证升级结果
call :verify_upgrade
if errorlevel 1 exit /b 1

REM 显示升级摘要
call :show_upgrade_summary

exit /b 0

REM 脚本入口点
call :main %*
exit /b %errorlevel%

REM =====================================================
REM 使用说明
REM =====================================================
REM 
REM 1. 基本使用:
REM    database_upgrade.bat
REM 
REM 2. 仅检查状态:
REM    database_upgrade.bat /check-only
REM 
REM 3. 仅备份数据库:
REM    database_upgrade.bat /backup-only
REM 
REM 4. 强制重新升级:
REM    database_upgrade.bat /force
REM 
REM 5. 跳过备份（不推荐）:
REM    database_upgrade.bat /skip-backup
REM 
REM 注意事项:
REM - 确保有足够的磁盘空间进行备份
REM - 建议在维护窗口期间执行升级
REM - 升级前请停止应用程序服务
REM - 升级后请重启应用程序
REM - 需要安装MySQL客户端工具
REM =====================================================