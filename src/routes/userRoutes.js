// 引入 Express 框架
const express = require('express');
// 创建路由实例，用于定义用户相关的路由规则
const router = express.Router();

// 引入用户控制器，包含处理登录、注册等业务逻辑的函数
const userController = require('../controllers/userController');
// 引入身份验证中间件，用于保护需要登录才能访问的接口
const auth = require('../middleware/auth');

// 定义 POST 请求：用户登录
// 路径: /login (完整路径通常是 /api/users/login)
// 中间件: userController.login
// 说明: 这是一个公开接口，不需要 auth 中间件。用户提交用户名和密码，验证成功后返回 Token
router.post('/login', userController.login);

// 定义 POST 请求：用户注册
// 路径: /register
// 中间件链:
// 1. auth: 验证 Token。注意：这里使用了 auth 中间件，意味着只有已登录的管理员或特定权限用户才能创建新用户。
//    如果希望允许任何人注册，通常不需要 auth 中间件。
// 2. userController.register: 执行注册逻辑，将新用户信息存入数据库
router.post('/register', auth, userController.register);

// 定义 GET 请求：获取当前登录用户信息
// 路径: /me
// 中间件链:
// 1. auth: 必须先验证 Token，确认身份
// 2. userController.getMe: 从 Token 中解析出用户 ID，然后查询并返回该用户的详细信息
router.get('/me', auth, userController.getMe);

// 定义 PUT 请求：修改密码
// 路径: /password
// 中间件链:
// 1. auth: 必须先验证 Token
// 2. userController.changePassword: 验证旧密码正确后，更新数据库中的密码
router.put('/password', auth, userController.changePassword);

// 将定义好的路由实例导出，以便在主应用文件（app.js）中通过 app.use() 挂载
module.exports = router;
