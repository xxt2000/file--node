// 引入 Express 框架
const express = require('express');
// 创建路由实例，用于定义一组相关的路由规则
const router = express.Router();

// 引入文件控制器，包含处理业务逻辑的函数（上传、下载、删除等）
const fileController = require('../controllers/fileController');
// 引入文件夹控制器
const folderController = require('../controllers/folderController');

// 引入文件上传中间件（通常基于 multer），用于处理 multipart/form-data 格式的请求
const upload = require('../utils/upload');
// 引入身份验证中间件，用于保护需要登录才能访问的接口
const auth = require('../middleware/auth');


// ==================== 文件夹相关路由（放在前面，避免与通用路由冲突） ====================

// 获取文件夹列表
router.get('/folders', folderController.getFolderList);

// 创建文件夹
router.post('/folders', auth, folderController.createFolder);

// 更新/重命名文件夹
router.put('/folders/:id', auth, folderController.updateFolder);

// 删除文件夹
router.delete('/folders/:id', auth, folderController.deleteFolder);

// ==================== 文件相关路由 ====================

// 定义 POST 请求：处理文件上传
router.post('/upload', auth, upload.single('file'), fileController.upload);

// 定义 GET 请求：获取文件列表
router.get('/', fileController.getList);

// 定义 GET 请求：下载文件
router.get('/:id/download', fileController.download);

// 定义 DELETE 请求：删除文件
router.delete('/:id', auth, fileController.delete);

// 定义 PUT 请求：更新文件信息
router.put('/:id', auth, fileController.update);

// 将定义好的路由实例导出，以便在主应用文件（app.js）中通过 app.use() 挂载
module.exports = router;
