// 引入数据库连接池模块
const db = require('../models/database');
// 引入 bcryptjs 库，用于密码的哈希加密和比对
const bcrypt = require('bcryptjs');
// 引入 jsonwebtoken 库，用于生成和验证 JSON Web Token (JWT)
const jwt = require('jsonwebtoken');

// 从环境变量中获取 JWT 密钥，如果没有设置则使用默认值（仅用于开发环境）
// 在生产环境中，务必在 .env 文件中设置一个强密钥
const JWT_SECRET = process.env.JWT_SECRET || 'default_secret_key_for_development';

/**
 * 用户登录
 * 验证用户名和密码，成功后签发 JWT Token
 */
/**
 * 用户登录
 */
exports.login = async (req, res) => {
    try {
        const { username, password } = req.body;

        // 【新增】步骤 1：打印接收到的参数
        console.log('>>> [Login] 步骤 1: 接收到请求');
        console.log('    用户名:', username);
        console.log('    密码:', password);

        // 1. 查询用户
        const sql = 'SELECT * FROM users WHERE username = ?';

        // 【新增】步骤 2：打印 SQL
        console.log('>>> [Login] 步骤 2: 执行 SQL');
        console.log('    语句:', sql);
        console.log('    参数:', [username]);

        const [users] = await db.query(sql, [username]);

        // 【新增】步骤 3：打印查询结果
        console.log('>>> [Login] 步骤 3: 查询结果');
        console.log('    找到用户数:', users.length);
        if (users.length > 0) {
            console.log('    用户对象:', users[0]);
            console.log('    数据库密码哈希:', users[0].password);
        }

        if (users.length === 0) {
            console.log('    >>> [Login] 结果: 用户不存在');
            return res.status(400).json({ success: false, message: '用户名或密码错误' });
        }

        const user = users[0];

        // 2. 验证密码
        // 【新增】步骤 4：打印比对过程
        console.log('>>> [Login] 步骤 4: 开始验证密码');
        const isMatch = await bcrypt.compare(password, user.password);
        console.log('    比对结果:', isMatch);

        if (!isMatch) {
            console.log('    >>> [Login] 结果: 密码错误');
            return res.status(400).json({ success: false, message: '用户名或密码错误' });
        }

        // 3. 生成 Token
        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, process.env.JWT_SECRET, {
            expiresIn: '24h'
        });

        // 4. 返回
        console.log('>>> [Login] 步骤 5: 登录成功，生成 Token');
        res.json({
            success: true,
            message: '登录成功',
            token: token,
            data: {
                id: user.id,
                username: user.username,
                role: user.role
            }
        });

    } catch (error) {
        console.error('>>> [Login] 发生异常:', error);
        res.status(500).json({ success: false, message: '服务器内部错误' });
    }
};

/**
 * 用户注册
 * 创建新用户，密码加密后存入数据库
 */
exports.register = async (req, res) => {
    try {
        // 1. 获取注册信息，role 默认为 'viewer'
        const { username, password, role = 'viewer' } = req.body;

        // 2. 校验必填项
        if (!username || !password) {
            return res.status(400).json({ error: '用户名和密码不能为空' });
        }

        // 3. 对密码进行哈希加密（加盐）
        // 10 是 salt rounds（盐的迭代次数），数值越高越安全但越慢
        const hashedPassword = await bcrypt.hash(password, 10);

        // 4. 将用户信息插入数据库
        const [result] = await db.query(
            'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
            [username, hashedPassword, role]
        );

        // 5. 返回成功结果
        res.json({
            success: true,
            message: '注册成功',
            user: { id: result.insertId, username, role }
        });
    } catch (error) {
        // 6. 错误处理
        // 捕获 MySQL 的唯一索引冲突错误（即用户名重复）
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: '用户名已存在' });
        }
        console.error('注册错误:', error);
        res.status(500).json({ error: error.message });
    }
};

/**
 * 获取当前登录用户信息
 * 需要在中间件中验证 Token 后，将用户信息挂载到 req.user 上
 */
exports.getMe = async (req, res) => {
    try {
        // 1. 从数据库查询当前用户（根据中间件解析出的 req.user.id）
        // 注意：只查询非敏感字段（不包含密码）
        const [rows] = await db.query(
            'SELECT id, username, role, created_at FROM users WHERE id = ?',
            [req.user.id]
        );

        // 2. 如果用户不存在（理论上 Token 验证通过后不应发生，除非用户被删除）
        if (rows.length === 0) {
            return res.status(404).json({ error: '用户不存在' });
        }

        // 3. 返回用户信息
        res.json({ success: true, user: rows[0] });
    } catch (error) {
        console.error('获取用户信息错误:', error);
        res.status(500).json({ error: error.message });
    }
};

/**
 * 修改密码
 * 验证旧密码后更新为新密码
 */
exports.changePassword = async (req, res) => {
    try {
        // 1. 获取旧密码和新密码
        const { oldPassword, newPassword } = req.body;

        // 2. 查询当前用户信息（需要密码字段进行比对）
        const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [req.user.id]);

        if (rows.length === 0) {
            return res.status(404).json({ error: '用户不存在' });
        }

        // 3. 验证旧密码是否正确
        const user = rows[0];
        const isValid = await bcrypt.compare(oldPassword, user.password);

        if (!isValid) {
            return res.status(401).json({ error: '原密码错误' });
        }

        // 4. 对新密码进行哈希加密
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // 5. 更新数据库中的密码
        await db.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, req.user.id]);

        // 6. 返回成功结果
        res.json({ success: true, message: '密码修改成功' });
    } catch (error) {
        console.error('修改密码错误:', error);
        res.status(500).json({ error: error.message });
    }
};
