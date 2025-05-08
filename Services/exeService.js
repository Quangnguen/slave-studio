import { exec } from 'child_process'
import fs from 'fs'
import path from 'path'
import axios from 'axios'
import { myIp, ipMaster } from '../utils/ipConfig.js'

const exePath = 'D:\\Acquisition.exe'



let currentFolderName = '';

const startExe = (folderName) => {
    const workingDir = path.join('D:\\test\\', folderName);
    //const workingDir = path.join(__dirname, 'test', folderName);
    console.log('f:',workingDir)
    currentFolderName = folderName;

    if (!fs.existsSync(workingDir)) {
        fs.mkdirSync(workingDir, { recursive: true });
        console.log(`📁 Đã tạo thư mục: ${workingDir}`);
    }

    // escape đường dẫn exe
    const escapedExe = exePath.replace(/\\/g, '\\');
    const resultFile = path.join(workingDir, 'result.txt');

    // Tạo command: chạy exe rồi echo errorlevel vào file
    const command = `cd /d ${workingDir} && ${escapedExe} && echo %errorlevel% > result.txt`;

    console.log(`🚀 Đang chạy: ${command}`);

    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`❌ Lỗi khi chạy EXE: ${error.message}`);
            return;
        }

        console.log(`📥 Đã chạy xong exe. Đợi kiểm tra kết quả...`);

        // Đợi 3-5 giây rồi đọc result.txt
        setTimeout(() => {
            if (fs.existsSync(resultFile)) {
                const status = fs.readFileSync(resultFile, 'utf-8').trim();
                console.log(`📄 Trạng thái exe trả về: ${status}`);
                if (status === '0') {
                    notifyMaster();
                } else {
                    console.warn(`⚠️ EXE trả về lỗi: ${status}`);
                }
            } else {
                console.warn('⚠️ Không tìm thấy result.txt (có thể exe chưa chạy xong)');
            }
        }, 1000);
    });
};


const getCurrentFolder = () => currentFolderName;
const notifyMaster = async () => {
   
    try {
        await axios.post(`http://${ipMaster}:3001/slave-status`, {
            slaveIp: `${myIp}`,
            status: 'done',
            folderName: currentFolderName,
        });

        console.log('📨 Đã gửi trạng thái hoàn thành về master.');
    } catch (err) {
        console.error('❌ Không gửi được trạng thái:', err.message);
    }
};

let runningProcess = null

const stopExe = () => {
    if (runningProcess) {
        runningProcess.kill()
        runningProcess = null
    }
}

const deleteExe = () => {
    if (fs.existsSync(exePath)) fs.unlinkSync(exePath)
}

export { startExe, stopExe, deleteExe, getCurrentFolder }
