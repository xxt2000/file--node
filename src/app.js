/**
 * Express 应用程序入口文件
 * 负责初始化服务器、中间件配置和路由挂载
 */

// 1. 引入核心框架和中间件
const express = require('express');
const cors = require('cors');
const path = require('path');
const morgan = require('morgan');
require('dotenv').config();

// 引入日志工具
const logger = require('./utils/logger');

// 引入路由模块
const fileRoutes = require('./routes/fileRoutes');
const userRoutes = require('./routes/userRoutes');

// 初始化数据库
require('./models/database');

// 2. 创建 Express 应用实例
const app = express();

// 3. 配置全局中间件
// CORS 配置
const allowedOrigins = [
  process.env.CORS_ORIGIN,
  'http://localhost:5173' // 开发环境，可以硬编码
].filter(Boolean); // 过滤掉 undefined 或空的值

const corsOptions = {
  origin: (origin, callback) => {
    // 如果没有 origin (比如 Postman 等工具) 或者 origin 在允许列表中，则允许
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));

// 请求解析中间件
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 日志中间件
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

// 静态文件服务
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// 4. 挂载 API 路由
const apiRouter = express.Router();

// 健康检查端点
apiRouter.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// 挂载业务路由
apiRouter.use('/files', fileRoutes);
apiRouter.use('/users', userRoutes);

// 将 API 路由挂载到 /api 前缀
app.use('/api', apiRouter);

// 兼容旧版健康检查端点 (不带 /api 前缀)
app.get('/health', (req, res) => {
  res.redirect('/api/health');
});

// 5. 404 处理中间件
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ 
      error: '接口不存在', 
      path: req.path,
      method: req.method 
    });
  }
  res.status(404).send('Not Found');
});

// 6. 全局错误处理中间件
app.use((err, req, res, next) => {
  // 记录错误日志
  logger.error({
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip
  });

  // 根据环境决定是否返回详细错误信息
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(err.status || 500).json({
    error: '服务器内部错误',
    message: isDevelopment ? err.message : '发生错误，请稍后再试',
    ...(isDevelopment && { stack: err.stack })
  });
});

// 7. 启动服务器监听
const PORT = process.env.PORT;

// 验证必要的环境变量
const requiredEnvVars = ['DB_HOST', 'DB_NAME', 'JWT_SECRET'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  logger.error(`缺少必要的环境变量: ${missingEnvVars.join(', ')}`);
  process.exit(1);
}

// 启动服务器
const server = app.listen(PORT, () => {
  logger.info(`服务器运行在 http://localhost:${PORT}`);
  logger.info(`API健康检查: http://localhost:${PORT}/api/health`);
  logger.info(`环境: ${process.env.NODE_ENV || 'development'}`);
});

// 优雅关闭处理
process.on('SIGTERM', () => {
  logger.info('收到 SIGTERM 信号，开始优雅关闭服务器...');
  server.close(() => {
    logger.info('服务器已关闭');
    process.exit(0);
  });
});

process.on('uncaughtException', (err) => {
  logger.error('未捕获的异常:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('未处理的 Promise 拒绝:', reason);
  process.exit(1);
});
