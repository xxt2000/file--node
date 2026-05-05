// 1. 引入核心框架和中间件
const express = require('express');
const cors = require('cors');
const path = require('path');
const morgan = require('morgan');
require('dotenv').config();

// 2. 引入路由模块
console.log('[调试] 开始加载路由模块...');
const fileRoutes = require('./routes/fileRoutes');
console.log('[调试] fileRoutes 已加载:', typeof fileRoutes);
const userRoutes = require('./routes/userRoutes');
console.log('[调试] userRoutes 已加载:', typeof userRoutes);

// 3. 初始化数据库
console.log('[调试] 开始初始化数据库...');
require('./models/database');
console.log('[调试] 数据库初始化完成');

// 4. 创建 Express 应用实例
const app = express();

// 5. 设置服务器端口
const PORT = process.env.PORT || 3000;

// 6. 配置全局中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));

// 托管静态文件
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// 7. 挂载 API 路由
console.log('[调试] 开始挂载路由...');
try {
    app.use('/api/files', fileRoutes);
    console.log('[调试] fileRoutes 挂载成功');
} catch (error) {
    console.error('[错误] 挂载 fileRoutes 时出错:', error);
}

try {
    app.use('/api/users', userRoutes);
    console.log('[调试] userRoutes 挂载成功');
} catch (error) {
    console.error('[错误] 挂载 userRoutes 时出错:', error);
}

// 8. 定义健康检查接口
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 9. 404 处理中间件
app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: '接口不存在', path: req.path });
    }
    res.status(404).send('Not Found');
});

// 10. 全局错误处理中间件
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: '服务器内部错误', message: err.message });
});

// 11. 启动服务器监听
app.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
    console.log(`API健康检查: http://localhost:${PORT}/api/health`);
});
