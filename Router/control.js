const express = require('express');
const router = express.Router();
const { startExe, stopExe, deleteExe, getCurrentFolder } = require('../Services/exeService');
const archiver = require('archiver');
const fs = require('fs');
const path = require('path');
const { spawn } = require("child_process");
const { exec } = require('child_process'); // Thêm child_process

let lastFolderName = ''; // Lưu tên thư mục output khi chạy file .exe


// 👉 Route để chạy file exe
router.post('/start', (req, res) => {
    const { folderName } = req.body; 

    if (!folderName) {
        return res.status(400).json({ message: 'folderName is required' });
    }

    lastFolderName = folderName;

    try {
        startExe(folderName); // Gọi hàm chạy exe
        res.json({ message: 'Đã chạy file exe' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// 👉 Route để dừng file exe
router.post('/stop', (req, res) => {
    try {
        stopExe();
        res.json({ message: 'Đã dừng file exe' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// 👉 Route để xóa file exe
router.delete('/delete', (req, res) => {
    try {
        deleteExe();
        res.json({ message: 'Đã xóa file exe' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

let ftpProcess = null;

async function zipFolderWithoutCompression(sourceFolder, outPath) {
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(outPath);
        const archive = archiver("zip", { store: true }); // Không nén, chỉ đóng gói

        output.on("close", () => resolve(outPath));
        archive.on("error", (err) => reject(err));

        archive.pipe(output);
        archive.directory(sourceFolder, false);
        archive.finalize();
    });
}

router.post("/start-ftp", async (req, res) => {
    let folder = req.query.folder;
    console.log(`📂 Nhận đường dẫn chia sẻ: ${folder}`);

    if (!folder) return res.status(400).json({ error: "Thiếu thư mục chia sẻ" });

    folder = folder.replace(/[:]+$/, ""); // Chuẩn hóa đường dẫn
    console.log(`📂 Đường dẫn sau khi chuẩn hóa: ${folder}`);

    if (!fs.existsSync(folder) || !fs.lstatSync(folder).isDirectory()) {
        return res.status(400).json({ error: "Thư mục không tồn tại hoặc không hợp lệ" });
    }

    const zipFileName = `${path.basename(folder)}.zip`;
    const zipFilePath = path.join(path.dirname(folder), zipFileName);

    console.log(`📦 Đang đóng gói thư mục vào: ${zipFilePath}`);

    try {
        await zipFolderWithoutCompression(folder, zipFilePath);
        console.log(`✅ Đóng gói hoàn tất: ${zipFilePath}`);

        if (ftpProcess && !ftpProcess.killed) {
            ftpProcess.kill();
        }

        const ftpScriptPath = "D:/ftp-server.txt";
        ftpProcess = spawn("python", [ftpScriptPath, zipFilePath]);

        ftpProcess.stdout.on("data", (data) => {
            console.log(`[FTP] ${data}`);
        });

        ftpProcess.stderr.on("data", (data) => {
            console.error(`[FTP Error] ${data}`);
        });

        res.json({ message: "✅ Đã bật FTP chia sẻ file ZIP: " + zipFilePath });
    } catch (error) {
        console.error(`❌ Lỗi khi đóng gói thư mục: ${error.message}`);
        res.status(500).json({ error: "Không thể đóng gói thư mục" });
    }
});


let pythonProcess = null;
router.get('/liveview', (req, res) => {
    const isOn = req.query.on !== undefined;

    if (isOn) {
        if (pythonProcess) {
            return res.send('⚠️ Server Python đã chạy rồi.');
        }

        const filePath = path.join(__dirname, '../..', 'sv.txt');
        const folderPath = path.dirname(filePath);

        pythonProcess = spawn('py', [filePath], {
            cwd: folderPath,
            detached: true,
            shell: true,
            stdio: 'ignore' // hoặc ['ignore', 'ignore', 'ignore'] nếu không cần log
        });

        pythonProcess.unref(); // cho phép tiến trình sống độc lập
        console.log('🚀 Đã khởi động server Python.', pythonProcess.pid);
        res.send('🚀 Server Python đã khởi động.');
    } else {
        res.send('⚠️ Không bật liveview.');
    }
});


router.post('/terminate', (req, res) => {
    if (pythonProcess) {
        const pid = pythonProcess.pid;
        console.log(pid)

        exec(`taskkill /PID ${pid} /T /F`, (err, stdout, stderr) => {
            if (err) {
                console.error('❌ Kill failed:', err);
                return res.status(500).send('❌ Không thể dừng server.');
            } else {
                console.log('✅ Process killed');
                pythonProcess = null;
                res.send('🛑 Python server stopped.');
            }
        });
    } else {
        res.send('⚠️ Không có server Python nào đang chạy.');
    }
});


module.exports = router;
