// 引入 mysql2 库的 Promise 版本，支持 async/await 语法
const mysql = require('mysql2/promise');
// 加载 .env 环境变量文件，将配置读取到 process.env 中
require('dotenv').config();

// 创建数据库连接池
// 连接池可以复用数据库连接，提高性能，避免频繁建立和断开连接的开销
const pool = mysql.createPool({
  // 数据库主机地址，优先从环境变量读取，默认为 localhost
  host: process.env.DB_HOST || 'localhost',
  // 数据库端口号，优先从环境变量读取并转为整数，默认为 3306
  port: parseInt(process.env.DB_PORT) || 3306,
  // 数据库用户名，优先从环境变量读取，默认为 root
  user: process.env.DB_USER || 'root',
  // 数据库密码，优先从环境变量读取，默认为空
  password: process.env.DB_PASSWORD || '',
  // 数据库名称，优先从环境变量读取，默认为 myapp
  database: process.env.DB_NAME || 'myapp',
  charset: 'utf8mb4', // 设置字符集为 utf8mb4
  // 当连接池没有可用连接时，是否等待连接释放（true 为等待，false 为立即报错）
  waitForConnections: true,
  // 连接池中最大连接数
  connectionLimit: 10,
  // 获取连接前的最大排队请求数，0 表示不限制
  queueLimit: 0,
  multipleStatements: true, // 允许执行多条语句
});

// 监听 connection 事件，为每个连接设置字符集
pool.on('connection', function (connection) {
  connection.query('SET NAMES utf8mb4');
});

// 定义一个异步函数用于初始化数据库表结构
async function initTables() {
  try {
    // 1. 从连接池中获取一个连接
    const connection = await pool.getConnection();

    // 创建 'folders' 表 (如果不存在)
    // 用于存储文件夹分类
    await connection.query(`
      CREATE TABLE IF NOT EXISTS folders (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(255) NOT NULL UNIQUE,
        user_id INT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 创建 'files' 表 (如果不存在)
    // 用于存储上传文件的基本信息
    await connection.query(`
      CREATE TABLE IF NOT EXISTS files (
        id INT PRIMARY KEY AUTO_INCREMENT,
        filename VARCHAR(255) NOT NULL,
        stored_name VARCHAR(255) NOT NULL,
        file_path VARCHAR(500) NOT NULL,
        file_size INT,
        file_type VARCHAR(100),
        version VARCHAR(50),
        category VARCHAR(100),
        tags TEXT,
        uploader VARCHAR(100),
        description TEXT,
        folder_id INT,
        download_count INT DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 创建 'users' 表 (如果不存在)
    // 用于存储系统用户信息
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT PRIMARY KEY AUTO_INCREMENT,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'viewer',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 创建 'download_logs' 表 (如果不存在)
    // 用于记录文件的下载日志
    await connection.query(`
      CREATE TABLE IF NOT EXISTS download_logs (
        id INT PRIMARY KEY AUTO_INCREMENT,
        file_id INT,
        downloader VARCHAR(100),
        ip_address VARCHAR(50),
        downloaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
      ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 检查并创建默认管理员账号
    // 查询用户名为 'admin' 的用户
    const [rows] = await connection.query("SELECT * FROM users WHERE username = 'admin'");

    // 如果查询结果为空（即不存在 admin 用户）
    if (rows.length === 0) {
      // 引入 bcryptjs 库用于密码加密
      const bcrypt = require('bcryptjs');
      // 对默认密码 'admin123' 进行哈希加密，盐值设为 10
      const hashedPassword = bcrypt.hashSync('admin123', 10);

      // 插入新的管理员记录
      await connection.query(
          "INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
          ['admin', hashedPassword, 'admin']
      );
      // 打印提示信息
      console.log('默认管理员账号已创建: admin / admin123');
    }

    // 打印初始化成功信息
    console.log('MySQL 数据库表初始化完成');

    // 释放连接回连接池
    connection.release();
  } catch (error) {
    // 捕获并打印初始化过程中的错误
    console.error('数据库初始化失败:', error);
  }
}

// 执行初始化函数
initTables();

// 将连接池对象导出，供其他模块（如路由处理函数）使用
module.exports = pool;
