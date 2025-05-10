const express = require('express');
const router = express.Router();
const { startExe, stopExe, deleteExe, getCurrentFolder } = require('../Services/exeService');
const archiver = require('archiver');
const fs = require('fs');
const path = require('path');
const { spawn } = require("child_process");
const { exec } = require('child_process'); // Thêm child_process
const { promisify } = require('util')
const axios = require('axios');

const execAsync = promisify(exec);

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


async function getPidOnPort2121() {
    try {
        const { stdout: psOutput } = await execAsync(
            'powershell -Command "(Get-NetTCPConnection -LocalPort 2121 -State Listen | Select-Object -First 1).OwningProcess"'
        );
        const output = psOutput.trim();
        console.log('🎯 Output PID Powershell:', output);
        if (output) return parseInt(output);

        const { stdout: netstatOutput } = await execAsync('netstat -a -n -o | find "0.0.0.0:2121"');
        const netstatResult = netstatOutput.trim();
        console.log('🎯 Output netstat:', netstatResult);
        const pidMatch = netstatResult.match(/LISTENING\s+(\d+)/);
        return pidMatch ? parseInt(pidMatch[1]) : null;
    } catch (error) {
        console.error('❌ Error getting PID:', error.message);
        return null;
    }
}

// ❌ Kill tiến trình theo PID
async function killProcess(pid) {
    try {
        await execAsync(`taskkill /F /PID ${pid}`);
        console.log(`❌ Đã kill tiến trình PID ${pid}`);
        return true;
    } catch (e) {
        console.error(`❌ Không thể kill PID ${pid}:`, e.message);
        return false;
    }
}

// ▶️ Chạy ftp.py (không detach, inherit IO)
function runPythonProcess() {
    const ftpPath = path.join(__dirname, '..', 'ftp.py');
    if (!fs.existsSync(ftpPath)) {
        console.error(`❌ FTP script not found at: ${ftpPath}`);
        throw new Error('FTP script not found');
    }

    const pythonProcess = spawn('python', [ftpPath], {
        detached: false,
        stdio: ['ignore', process.stdout, process.stderr],
    });

    pythonProcess.on('error', (err) => {
        console.error('❌ Lỗi khi chạy Python:', err.message);
    });

    pythonProcess.on('exit', (code) => {
        console.log(`🐍 Python process exited with code ${code}`);
    });

    return pythonProcess;
}


// ⏳ Đợi cổng 2121 mở
async function waitUntilPort2121Open(timeout = 50000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        if (getPidOnPort2121()) return;
        await new Promise(res => setTimeout(res, 500)); // chờ 500ms
    }
    throw new Error("timeout");
}

// 🛠️ Endpoint chính
router.get('/check-ftp', async (req, res) => {
    let pid = await getPidOnPort2121();
    console.log('🧪 PID trước khi kill:', pid);

    if (pid) {
        console.log('🔧 Killing existing process on port 2121');
        await killProcess(pid);
        await new Promise(res => setTimeout(res, 1000));
    }

    runPythonProcess();
    await new Promise(res => setTimeout(res, 2000)); // Đợi 2 giây để FTP bind cổng

    try {
        await waitUntilPort2121Open();
        const newPid = await getPidOnPort2121();
        console.log('✅ FTP server đã mở, PID mới:', newPid);
        res.json(1);
    } catch (err) {
        console.error('❌ Lỗi khi đợi mở cổng:', err.message);
        res.json(0);
    }
});
async function zipFolderWithoutCompression(folderName) {
    return new Promise((resolve, reject) => {
        const basePath = "D:\\test\\";
        const sourceFolder = path.join(basePath, folderName);
        const outPath = path.join(basePath, `${folderName}.zip`);

        const output = fs.createWriteStream(outPath);
        const archive = archiver("zip", { store: true }); // Không nén, chỉ đóng gói

        output.on("close", () => resolve(outPath));
        archive.on("error", (err) => reject(err));

        archive.pipe(output);
        archive.directory(sourceFolder, false);
        archive.finalize();
    });
}

router.get("/download-ftp-file", async (req, res) => {
    const { ip, remotePath, localFolder, folderName } = req.query;
    console.log("📦 Request:", ip, remotePath, localFolder, folderName);

    // Kiểm tra tham số đầu vào
    if (!ip || !remotePath || !localFolder || !folderName) {
        return res.status(400).json({ error: "Thiếu ip, remotePath hoặc localFolder" });
    }

    try {
        await zipFolderWithoutCompression(folderName);
        console.log("✅ Nén thư mục thành công:", folderName);
    } catch (zipErr) {
        console.error("❌ Lỗi khi nén thư mục:", zipErr.message);
        return res.status(500).json({ error: "Lỗi khi nén thư mục" });
    }

    try {
        const response = await axios.get("http://192.168.100.212:3002/check-ftp");
        console.log("📡 Kết quả check-ftp:", response.data);

        if (response.data === 1) {
            res.json(1)
        } else {
            res.json(0)
        }
    } catch (e) {
        console.error("❌ Lỗi khi gọi check-ftp:", e.message);
        res.status(500).json({ error: "❌ Không thể gọi check-ftp" });
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
