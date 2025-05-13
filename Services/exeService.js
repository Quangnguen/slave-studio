import { exec, spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import axios from 'axios'
import { myIp, ipMaster } from '../utils/ipConfig.js'
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const exePath = 'D:\\Acquisition.exe'

let currentFolderName = '';
const triggerMap = {}; // Lưu callback chờ từ master
let globalFolderName = '';


function startExe(folderName) {
    console.log('🚀 Đang chạy EXE:', exePath);
    globalFolderName = folderName
    
    const workingDir = path.join('D:\\test\\', folderName);

    if (!fs.existsSync(workingDir)) {
            fs.mkdirSync(workingDir, { recursive: true });
            console.log(`📁 Đã tạo thư mục: ${workingDir}`);
        }
    const escapedExe = `"${exePath.replace(/\\/g, '\\\\')}"`;
   
    const child = spawn(exePath, [], { cwd: workingDir, detached: true, stdio: 'ignore' });
    child.unref(); // Tách tiến trình ra hoàn toàn

    // Sau 3 giây → kiểm tra file *_ready.txt
    let elapsed = 0;
    const interval = 1000; // kiểm tra mỗi 1 giây
    const maxTime = 10000;
    // Sau 3 giây → kiểm tra file *_ready.txt
    let checker = setInterval(() => {
        const readyFiles = fs.readdirSync(workingDir).filter(f => f.endsWith('_ready.txt'));
        console.log(`📂 Đã tìm thấy ${readyFiles.length} file *_ready.txt`);

        if (readyFiles.length >= 5) {
            clearInterval(checker);
            console.log("✅ Đã đủ 5 file *_ready.txt, báo về master");
            notifyMasterStrigger(folderName);

            triggerMap.triggerY = () => runY();
            triggerMap.triggerS = () => runS(globalFolderName);
            console.log(triggerMap)
        } else {
            elapsed += interval;
            if (elapsed >= maxTime) {
                clearInterval(checker);
                console.warn(`⏱️ Quá 10s nhưng chưa đủ 5 file *_ready.txt`);
            }
        }
    }, interval);
}



function runY() {
    const exeFolder = path.join(__dirname, '..', 'exe');
    const yFile = path.join(exeFolder, 'y.txt');
    console.log(`📄 Đang chạy y.txt...`);

    exec(`python ${yFile}`, (err, stdout, stderr) => {
        if (err) {
            console.error('❌ Lỗi khi chạy y.txt:', err);
            return;
        }
        console.log('✅ Đã chạy xong y.txt');
    });
}
function runS(globalFolderName) {
    const exeFolder = path.join(__dirname, '..', 'exe');
    const sFile = path.join(exeFolder, 's.txt');

    console.log(`📄 Đang chạy s.txt...`);
    const workingDir = path.join('D:\\test\\', globalFolderName);
    const resultFile = path.join(workingDir, 'result.txt'); // đặt đúng chỗ

    exec(`python ${sFile}`, { cwd: workingDir }, (err, stdout, stderr) => {
        const exitCode = err ? err.code : 0;

        // Ghi kết quả vào result.txt
        fs.writeFileSync(resultFile, `${exitCode}`);

        console.log('✅ Đã chạy xong s.txt');

        // Đọc file sau 3 giây (để chắc chắn đã ghi xong)
        setTimeout(() => {
            if (fs.existsSync(resultFile)) {
                const status = fs.readFileSync(resultFile, 'utf-8').trim();
                console.log(`📄 Trạng thái exe sau s.txt: ${status}`);
                if (status === '0') {
                    notifyMaster();
                } else {
                    console.warn(`⚠️ Lỗi khi chạy s.txt: ${status}`);
                }
            } else {
                console.warn(`⚠️ Không tìm thấy result.txt sau khi chạy s.txt`);
            }
        }, 3000);
    });
}
// Gọi từ master để trigger chạy y.txt
export function triggerY() {
    if (triggerMap.triggerY) {
        triggerMap.triggerY();
    } else {
        console.warn('⚠️ Chưa sẵn sàng để trigger y.txt');
    }
}

// Gọi từ master để trigger chạy s.txt
export function triggerS(globalFolderName) {
    if (triggerMap.triggerS) {
        triggerMap.triggerS(globalFolderName);
    } else {
        console.warn('⚠️ Chưa sẵn sàng để trigger s.txt');
    }
}


const checkReadyFiles = (workingDir) => {
    const files = fs.readdirSync(workingDir);
    const readyFiles = files.filter(file => file.endsWith('_ready.txt'));
    return readyFiles.length >= 5;
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

const notifyMasterStrigger = async (folderName) => {

    try {
        await axios.post(`http://${ipMaster}:3001/strigger-ok`, {
            slaveIp: `${myIp}`,
            status: 'ready',
            folderName: folderName,
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
