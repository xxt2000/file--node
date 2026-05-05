// 引入 jsonwebtoken 库，用于解析和验证 Token
const jwt = require('jsonwebtoken');

// 从环境变量中获取 JWT 密钥
// 如果未在 .env 文件中设置，则使用默认字符串（注意：生产环境必须设置强密钥）
const JWT_SECRET = process.env.JWT_SECRET || 'default_secret_key_for_development';

// 导出一个中间件函数
// Express 中间件的标准签名是 (req, res, next)
module.exports = (req, res, next) => {
    // 1. 尝试从请求头中获取 Token
    // 通常 Token 存放在 'Authorization' 请求头中，格式为 'Bearer <token_string>'
    // 使用可选链操作符 (?.) 防止 header 不存在时报错
    // 使用 replace('Bearer ', '') 去掉 'Bearer ' 前缀，只获取 Token 字符串本身
    const token = req.header('Authorization')?.replace('Bearer ', '');

    // 2. 检查 Token 是否存在
    if (!token) {
        // 如果没有 Token，返回 401 未授权状态码，并提示用户登录
        return res.status(401).json({ error: '请先登录' });
    }

    try {
        // 3. 验证 Token
        // jwt.verify 方法用于解析 Token 并验证签名和有效期
        // 如果验证失败（如密钥错误、Token 被篡改、已过期），会抛出错误
        const decoded = jwt.verify(token, JWT_SECRET);

        // 4. 将解析出的用户信息（Payload）挂载到 req 对象上
        // 这样，后续的路由处理函数就可以通过 req.user 获取当前登录用户的 ID、角色等信息
        req.user = decoded;

        // 5. 调用 next()，将控制权传递给下一个中间件或路由处理函数
        // 这一步非常关键，如果不调用，请求就会挂在这里，不会继续往下走
        next();
    } catch (error) {
        // 6. 捕获验证过程中的错误
        // 例如 Token 过期、格式错误或签名不匹配
        console.error('Token验证失败:', error);
        res.status(401).json({ error: 'token无效或已过期' });
    }
};
