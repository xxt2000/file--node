// 引入数据库连接池模块
const db = require('../models/database');
// 引入 Node.js 文件系统模块，用于文件操作（如删除文件）
const fs = require('fs');
// 引入 Node.js 路径模块，用于处理和拼接文件路径
const path = require('path');
const { v4: uuidv4 } = require('uuid'); // 确保安装了 uuid 包


/**
 * 获取文件列表
 * 支持分页、关键词搜索和分类筛选
 */
exports.getList = async (req, res) => {
    try {
        // 1. 获取参数
        const { page = 1, limit = 20, keyword = '', category = '', folder_id } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        // 2. 构建 SQL
        let sql = 'SELECT * FROM files WHERE 1=1';
        const params = [];

        // 【新增】如果有 folder_id，添加筛选条件
        if (folder_id) {
            sql += ' AND folder_id = ?';
            params.push(folder_id);
        }

        // 关键词搜索
        if (keyword) {
            sql += ' AND (filename LIKE ? OR description LIKE ?)';
            params.push(`%${keyword}%`, `%${keyword}%`);
        }

        // 分类筛选
        if (category && category !== '全部') {
            sql += ' AND category = ?';
            params.push(category);
        }

        // 3. 查询总数
        const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
        const [countResult] = await db.query(countSql, params);
        const total = countResult[0].total;

        // 4. 查询数据
        sql += ` ORDER BY created_at DESC LIMIT ${parseInt(limit)} OFFSET ${offset}`;
        const [rows] = await db.query(sql, params);

        // 5. 返回结果
        res.json({
            success: true,
            data: rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('查询失败:', error);
        res.status(500).json({ error: error.message });
    }
};

/**
 * 上传文件
 * 处理文件接收，根据 folder_id 在服务器创建对应目录，并将文件信息保存到数据库
 */
exports.upload = async (req, res) => {
    try {
        // 1. 检查文件
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: '请选择文件'
            });
        }

        // 2. 获取参数
        const { version, category, tags, description, folder_id } = req.body;
        const uploader = req.user?.username || 'unknown';

        // 3. 生成唯一的存储文件名
        const ext = path.extname(req.file.originalname);
        const storedName = `${uuidv4()}${ext}`;

        // 4. 确定目标目录
        let targetDir = path.join(__dirname, '../../uploads');
        let relativePath = ''; // 用于存入数据库的相对路径

        if (folder_id) {
            try {
                // 查询文件夹名称
                const [folders] = await db.query('SELECT name FROM folders WHERE id = ?', [folder_id]);
                if (folders.length > 0) {
                    const folderName = folders[0].name;
                    targetDir = path.join(__dirname, '../../uploads', folderName);
                    relativePath = path.join(folderName, storedName);
                }
            } catch (err) {
                console.error('查询文件夹失败:', err);
            }
        } else {
            relativePath = storedName;
        }

        // 5. 创建目录
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        // 6. 移动文件
        const oldPath = req.file.path;
        const newPath = path.join(targetDir, storedName);
        fs.renameSync(oldPath, newPath);

        // 7. 存入数据库
        const [result] = await db.query(
            `INSERT INTO files 
             (filename, stored_name, file_path, file_size, file_type, 
              version, category, tags, uploader, description, folder_id) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                req.file.originalname,
                storedName,  // 添加 stored_name 字段的值
                relativePath,
                req.file.size,
                req.file.mimetype,
                version || '1.0.0',
                category || '未分类',
                tags ? JSON.stringify(tags.split(',')) : '[]',
                uploader,
                description || '',
                folder_id || null
            ]
        );

        res.json({
            success: true,
            id: result.insertId,
            message: '上传成功',
            file: {
                id: result.insertId,
                originalname: req.file.originalname,
                storedName: storedName,
                path: relativePath,
                size: req.file.size,
                mimetype: req.file.mimetype,
                version: version || '1.0.0',
                category: category || '未分类',
                tags: tags ? tags.split(',') : [],
                uploader: uploader,
                description: description || '',
                folder_id: folder_id || null
            }
        });

    } catch (error) {
        console.error('上传错误:', error);

        // 如果上传过程中出错，删除已上传的文件
        if (req.file && req.file.path && fs.existsSync(req.file.path)) {
            try {
                fs.unlinkSync(req.file.path);
            } catch (err) {
                console.error('删除临时文件失败:', err);
            }
        }

        res.status(500).json({
            success: false,
            message: '上传文件失败',
            error: error.message
        });
    }
};

/**
 * 下载文件
 * 增加下载计数，记录日志，并触发浏览器下载
 */
exports.download = async (req, res) => {
    try {
        // 获取要下载文件的 ID
        const { id } = req.params;

        // 1. 查询数据库获取文件信息
        const [rows] = await db.query('SELECT * FROM files WHERE id = ?', [id]);

        if (rows.length === 0) {
            return res.status(404).json({ error: '文件不存在' });
        }

        const file = rows[0];

        // 2. 更新该文件的下载计数
        await db.query('UPDATE files SET download_count = download_count + 1 WHERE id = ?', [id]);

        // 3. 记录下载日志 (可选，如果你有 download_logs 表)
        // const downloader = req.query.downloader || 'anonymous';
        // const ipAddress = req.ip || req.connection.remoteAddress;
        // await db.query('INSERT INTO download_logs (file_id, downloader, ip_address) VALUES (?, ?, ?)', [id, downloader, ipAddress]);

        // 4. 【关键修改】构建服务器上的物理文件路径
        // __dirname 是 src/controllers
        // ../../ 是项目根目录
        // uploads 是上传根目录
        // file.file_path 是数据库存的相对路径 (例如 "2024款/xxx.docx" 或 "xxx.jpg")
        const filePath = path.join(__dirname, '../../uploads', file.file_path);

        console.log('--- 下载文件 ---');
        console.log('文件名:', file.filename);
        console.log('相对路径:', file.file_path);
        console.log('完整物理路径:', filePath);

        // 5. 检查物理文件是否存在
        if (!fs.existsSync(filePath)) {
            console.error('❌ 物理文件不存在:', filePath);
            return res.status(404).json({ error: '文件不存在于服务器' });
        }

        // 6. 使用 Express 的 res.download 方法触发文件下载
        // 浏览器会收到文件流，并弹出保存对话框，保存名为 file.filename (原始文件名)
        res.download(filePath, file.filename);

    } catch (error) {
        console.error('下载错误:', error);
        res.status(500).json({ error: error.message });
    }
};

/**
 * 删除文件
 * 同时删除数据库记录和服务器上的物理文件
 */
exports.delete = async (req, res) => {
    try {
        const { id } = req.params;

        // 1. 先查询数据库，获取文件路径
        const [rows] = await db.query('SELECT file_path FROM files WHERE id = ?', [id]);

        if (rows.length === 0) {
            return res.status(404).json({ error: '文件不存在' });
        }

        const filePath = rows[0].file_path;

        // 2. 删除服务器上的物理文件
        if (filePath) {
            // 拼接完整物理路径: 项目根目录/uploads/相对路径
            const fullPath = path.join(__dirname, '../../uploads', filePath);

            if (fs.existsSync(fullPath)) {
                try {
                    fs.unlinkSync(fullPath); // 同步删除文件
                    console.log(`已删除物理文件: ${fullPath}`);
                } catch (err) {
                    console.error(`删除物理文件失败: ${fullPath}`, err);
                    // 即使物理文件删除失败，也继续删除数据库记录，防止“僵尸”数据
                }
            }
        }

        // 3. 删除数据库中的记录
        await db.query('DELETE FROM files WHERE id = ?', [id]);

        res.json({ success: true, message: '删除成功' });
    } catch (error) {
        console.error('删除错误:', error);
        res.status(500).json({ error: error.message });
    }
};

/**
 * 批量删除文件
 * 循环删除物理文件，然后批量删除数据库记录
 */
exports.batchDelete = async (req, res) => {
    try {
        const { ids } = req.body; // 前端传来的 ID 数组

        if (!ids || ids.length === 0) {
            return res.status(400).json({ error: '请选择要删除的文件' });
        }

        // 1. 先查询所有要删除文件的路径
        // 使用 SQL IN 语句一次性查询
        const [files] = await db.query(`SELECT file_path FROM files WHERE id IN (?)`, [ids]);

        // 2. 遍历删除物理文件
        files.forEach(file => {
            if (file.file_path) {
                const fullPath = path.join(__dirname, '../../uploads', file.file_path);
                if (fs.existsSync(fullPath)) {
                    try {
                        fs.unlinkSync(fullPath);
                        console.log(`[批量删除] 已删除: ${fullPath}`);
                    } catch (err) {
                        console.error(`[批量删除] 失败: ${fullPath}`, err);
                    }
                }
            }
        });

        // 3. 批量删除数据库记录
        await db.query(`DELETE FROM files WHERE id IN (?)`, [ids]);

        res.json({ success: true, message: `成功删除 ${ids.length} 个文件` });
    } catch (error) {
        console.error('批量删除错误:', error);
        res.status(500).json({ error: error.message });
    }
};


/**
 * 更新文件信息
 * 仅更新元数据（版本、分类、标签、描述），不替换文件本身
 */
exports.update = async (req, res) => {
    try {
        const {id} = req.params;
        const {version, category, tags, description} = req.body;

        // 执行 UPDATE 语句
        // updated_at = CURRENT_TIMESTAMP 会自动更新为当前时间
        const [result] = await db.query(
            `UPDATE files SET version = ?, category = ?, tags = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [version, category, tags, description, id]
        );

        // affectedRows 为 0 表示没有找到匹配的 ID 进行更新
        if (result.affectedRows === 0) {
            return res.status(404).json({error: '文件不存在'});
        }

        res.json({success: true, message: '更新成功'});
    } catch (error) {
        console.error('更新错误:', error);
        res.status(500).json({error: error.message});
    }
};

/**
 * 【新增】更新文件夹名称
 */
exports.updateFolder = async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;

        // 1. 简单校验
        if (!name) {
            return res.status(400).json({ success: false, message: '文件夹名称不能为空' });
        }

        // 2. 执行更新 SQL
        const sql = 'UPDATE folders SET name = ? WHERE id = ?';
        const [result] = await db.query(sql, [name, id]);

        // 3. 检查是否更新成功
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: '文件夹不存在' });
        }

        res.json({ success: true, message: '文件夹更新成功' });
    } catch (error) {
        console.error('更新文件夹失败:', error);
        res.status(500).json({ success: false, message: '服务器内部错误' });
    }
};

/**
 * 【新增】删除文件夹
 */
exports.deleteFolder = async (req, res) => {
    try {
        const { id } = req.params;

        // 注意：实际生产环境中，删除文件夹前通常需要检查：
        // 1. 文件夹内是否有文件？如果有，是否级联删除文件？
        // 2. 是否有权限删除？

        // 这里为了演示，我们假设直接删除文件夹，且数据库设置了外键级联删除（ON DELETE CASCADE）
        // 或者你需要先手动删除文件夹下的文件：
        // await db.query('DELETE FROM files WHERE folder_id = ?', [id]);

        const sql = 'DELETE FROM folders WHERE id = ?';
        const [result] = await db.query(sql, [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: '文件夹不存在' });
        }

        res.json({ success: true, message: '文件夹删除成功' });
    } catch (error) {
        console.error('删除文件夹失败:', error);
        // 捕获外键约束错误（如果文件夹下有文件且未设置级联删除）
        if (error.code === 'ER_ROW_IS_REFERENCED_2') {
            return res.status(400).json({ success: false, message: '无法删除：文件夹内还有文件' });
        }
        res.status(500).json({ success: false, message: '服务器内部错误' });
    }
};

