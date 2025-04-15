/**
 * 炸雞店管理系統 - 模組配置
 * @version 2.0.0
 */

export const ModuleConfig = {
    // 核心模組
    CORE: {
        name: 'core',
        dependencies: [],
        routes: ['/'],
        permissions: ['basic_access']
    },

    // 認證模組
    AUTH: {
        name: 'auth',
        dependencies: ['core'],
        routes: ['/login', '/register', '/forgot-password'],
        permissions: ['auth_management']
    },

    // 排班模組
    SCHEDULING: {
        name: 'scheduling',
        dependencies: ['core', 'auth'],
        routes: ['/schedule', '/schedule-view', '/schedule-gen'],
        permissions: ['schedule_management']
    },

    // 出勤模組
    ATTENDANCE: {
        name: 'attendance',
        dependencies: ['core', 'auth'],
        routes: ['/clockin', '/attendance-report'],
        permissions: ['attendance_management']
    },

    // 請假模組
    LEAVE: {
        name: 'leave',
        dependencies: ['core', 'auth', 'scheduling'],
        routes: ['/leave', '/leave-approval'],
        permissions: ['leave_management']
    },

    // 薪資模組
    SALARY: {
        name: 'salary',
        dependencies: ['core', 'auth', 'attendance'],
        routes: ['/salary', '/salary-view', '/salary-stats'],
        permissions: ['salary_management']
    },

    // 預測模組
    PREDICTION: {
        name: 'prediction',
        dependencies: ['core', 'auth', 'salary'],
        routes: ['/salary-prediction'],
        permissions: ['prediction_access']
    },

    // 報表模組
    REPORTING: {
        name: 'reporting',
        dependencies: ['core', 'auth'],
        routes: ['/reports', '/analytics'],
        permissions: ['report_access']
    },

    // 管理模組
    ADMIN: {
        name: 'admin',
        dependencies: ['core', 'auth'],
        routes: ['/admin', '/system-config'],
        permissions: ['admin_access']
    }
};

// 模組加載順序
export const ModuleLoadOrder = [
    'CORE',
    'AUTH',
    'SCHEDULING',
    'ATTENDANCE',
    'LEAVE',
    'SALARY',
    'PREDICTION',
    'REPORTING',
    'ADMIN'
];

// 權限配置
export const PermissionConfig = {
    basic_access: { level: 1, description: '基本訪問權限' },
    auth_management: { level: 2, description: '認證管理權限' },
    schedule_management: { level: 3, description: '排班管理權限' },
    attendance_management: { level: 3, description: '出勤管理權限' },
    leave_management: { level: 3, description: '請假管理權限' },
    salary_management: { level: 4, description: '薪資管理權限' },
    prediction_access: { level: 5, description: '預測功能訪問權限' },
    report_access: { level: 5, description: '報表訪問權限' },
    admin_access: { level: 9, description: '管理員權限' }
};

// 路由配置
export const RouteConfig = {
    defaultRoute: '/',
    loginRoute: '/login',
    errorRoute: '/error',
    notFoundRoute: '/404',
    unauthorizedRoute: '/unauthorized'
}; 