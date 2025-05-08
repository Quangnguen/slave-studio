//const express = require('express')
//const multer = require('multer')
//const { startExe } = require('../Services/exeService')

//const router = express.Router()
//const storage = multer.diskStorage({
//  destination: (req, file, cb) => cb(null, 'D:\\'),
//  filename: (req, file, cb) => cb(null, 'slave_app.exe'),
//})

//const upload = multer({ storage })

//router.post('/upload', upload.single('file'), (req, res) => {
//  try {
//    startExe()
//    res.json({ message: 'Upload và chạy file exe thành công' })
//  } catch (err) {
//    res.status(500).json({ message: err.message })
//  }
//})

//module.exports = router




const express = require('express');
const fs = require('fs');
const path = require('path');
const { startConfigCam } = require('../Services/cameraService');

const router = express.Router();

router.post('/upload-configfile', async (req, res) => {
    try {
        const { content } = req.body;

        if (!content) {
            return res.status(400).json({ message: 'Không có nội dung config' });
        }

        const filePath = path.join('D:', 'config-camxyz', 'conf.txt');
        //path.join(__dirname, "batches");

        // Đảm bảo thư mục tồn tại
        fs.mkdirSync(path.dirname(filePath), { recursive: true });

        // Ghi file
        fs.writeFileSync(filePath, content, 'utf-8');
        console.log('Đã lưu file config:', filePath);

        // Tùy chọn: chạy file exe sau khi lưu config
        await startConfigCam();

        res.json({ message: 'Lưu config và chạy exe thành công' });
    } catch (err) {
        console.error('Lỗi khi ghi config:', err);
        res.status(500).json({ message: 'Lỗi ghi file hoặc chạy exe' });
    }
});

module.exports = router;
