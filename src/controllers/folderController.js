const path = require('path');
const fs = require('fs');
const db = require('../models/database');

// 定义基础上传目录
const BASE_UPLOAD_DIR = path.join(__dirname, '../../uploads');

// 确保基础目录存在
if (!fs.existsSync(BASE_UPLOAD_DIR)) {
    try {
        fs.mkdirSync(BASE_UPLOAD_DIR, { recursive: true });
        console.log(`[初始化] 已创建基础上传目录: ${BASE_UPLOAD_DIR}`);
    } catch (err) {
        console.error(`[初始化] 基础上传目录创建失败: ${BASE_UPLOAD_DIR}`, err);
    }
}

// 获取文件夹列表
exports.getFolderList = async (req, res) => {
    try {
        const sql = 'SELECT * FROM folders ORDER BY created_at DESC';
        const [rows] = await db.query(sql);
        res.json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('获取文件夹列表失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误'
        });
    }
};

// 创建文件夹
exports.createFolder = async (req, res) => {
    try {
        const { name } = req.body;
        const userId = req.user.id;

        // 1. 校验名称
        if (!name) {
            return res.status(400).json({ success: false, message: '文件夹名称不能为空' });
        }

        // 2. 插入数据库
        const sql = 'INSERT INTO folders (name, user_id) VALUES (?, ?)';
        const [result] = await db.query(sql, [name, userId]);

        // 3. 在服务器上创建物理文件夹
        const targetDir = path.join(BASE_UPLOAD_DIR, name);

        // 检查目录是否存在，不存在则创建
        if (!fs.existsSync(targetDir)) {
            try {
                fs.mkdirSync(targetDir, { recursive: true });
                console.log(`[创建文件夹] 已创建物理目录: ${targetDir}`);
            } catch (err) {
                console.error(`[创建文件夹] 物理目录创建失败: ${targetDir}`, err);
                // 即使物理创建失败，数据库记录已经插入，这里可以选择回滚或者仅提示
                return res.status(500).json({ success: false, message: '文件夹创建失败，请检查服务器权限' });
            }
        }

        res.json({
            success: true,
            message: '创建成功',
            data: {
                id: result.insertId,
                name: name
            }
        });
    } catch (error) {
        console.error('创建文件夹失败:', error);
        res.status(500).json({ success: false, message: '服务器内部错误' });
    }
};

// 更新文件夹
exports.updateFolder = async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;
        const userId = req.user.id;

        // 校验名称
        if (!name) {
            return res.status(400).json({ success: false, message: '文件夹名称不能为空' });
        }

        // 查询原文件夹信息
        const [folders] = await db.query('SELECT * FROM folders WHERE id = ?', [id]);
        if (folders.length === 0) {
            return res.status(404).json({ success: false, message: '文件夹不存在' });
        }

        const oldFolder = folders[0];

        // 更新数据库
        await db.query('UPDATE folders SET name = ? WHERE id = ?', [name, id]);

        // 重命名物理文件夹
        const oldDir = path.join(BASE_UPLOAD_DIR, oldFolder.name);
        const newDir = path.join(BASE_UPLOAD_DIR, name);

        if (fs.existsSync(oldDir) && !fs.existsSync(newDir)) {
            try {
                fs.renameSync(oldDir, newDir);
                console.log(`[重命名文件夹] 已将 ${oldDir} 重命名为 ${newDir}`);
            } catch (err) {
                console.error(`[重命名文件夹] 重命名失败:`, err);
                // 这里可以选择回滚数据库操作
            }
        }

        res.json({
            success: true,
            message: '更新成功',
            data: {
                id: parseInt(id),
                name: name
            }
        });
    } catch (error) {
        console.error('更新文件夹失败:', error);
        res.status(500).json({ success: false, message: '服务器内部错误' });
    }
};

// 删除文件夹
exports.deleteFolder = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        // 查询文件夹信息
        const [folders] = await db.query('SELECT * FROM folders WHERE id = ?', [id]);
        if (folders.length === 0) {
            return res.status(404).json({ success: false, message: '文件夹不存在' });
        }

        const folder = folders[0];

        // 删除数据库记录
        await db.query('DELETE FROM folders WHERE id = ?', [id]);

        // 删除物理文件夹
        const folderDir = path.join(BASE_UPLOAD_DIR, folder.name);
        if (fs.existsSync(folderDir)) {
            try {
                fs.rmSync(folderDir, { recursive: true, force: true });
                console.log(`[删除文件夹] 已删除物理目录: ${folderDir}`);
            } catch (err) {
                console.error(`[删除文件夹] 物理目录删除失败: ${folderDir}`, err);
            }
        }

        res.json({
            success: true,
            message: '删除成功'
        });
    } catch (error) {
        console.error('删除文件夹失败:', error);
        res.status(500).json({ success: false, message: '服务器内部错误' });
    }
};
