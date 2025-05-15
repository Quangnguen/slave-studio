import { exec, spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import axios from 'axios'
import { myIp, ipMaster } from '../utils/ipConfig.js'
import { fileURLToPath } from 'url';

let SLAVE_ID = 12

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

            if (SLAVE_ID === 12) {
                triggerMap.triggerY = () => runY();
                triggerMap.triggerS = () => runS(globalFolderName);
            }
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
async function runS(globalFolderName) {
    const exeFolder = path.join(__dirname, '..', 'exe');
    const sFile = path.join(exeFolder, 's.txt');
    const workingDir = path.join('D:\\test\\', globalFolderName);
    const resultFile = path.join(workingDir, 'result.txt');

    console.log(`📄 Đang chạy s.txt...`);

    exec(`python ${sFile}`, { cwd: workingDir }, async (err, stdout, stderr) => {
        const exitCode = err ? err.code : 0;

        // 📝 Ghi kết quả vào result.txt trước
        fs.writeFileSync(resultFile, `${exitCode}`);
        console.log('✅ Đã chạy xong s.txt');

        // ✅ Nếu exitCode === 0 thì gửi tín hiệu đến các slave khác
        if (exitCode === 0) {
            const slaveIps = [
                //'192.168.100.201',
                //'192.168.100.202',
                '192.168.100.203',
                //'192.168.100.204',
                //'192.168.100.205',
                //'192.168.100.206',
                //'192.168.100.207',
                //'192.168.100.208',
                //'192.168.100.209',
                //'192.168.100.210',
                //'192.168.100.211',
                //'192.168.100.212'
            ];

            // Loại bỏ IP hiện tại
            const targetIps = slaveIps.filter(ip => ip !== '192.168.100.212');

            const requests = targetIps.map(ip =>
                axios.post(`http://${ip}:3002/write-result`, {
                    folderName: globalFolderName,
                    exitCode: exitCode
                }).then(() => {
                    console.log(`📤 Đã gửi đến ${ip}`);
                }).catch(err => {
                    console.error(`❌ Lỗi gửi đến ${ip}: ${err.message}`);
                })
            );

            await Promise.all(requests);
            console.log("✅ Đã gửi tín hiệu đến tất cả slave");

            // 🕒 Đọc lại file sau 3 giây để chắc chắn ghi xong
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
        } else {
            console.warn(`⚠️ s.txt thất bại với mã lỗi: ${exitCode}`);
        }
    });
}
// Gọi từ master để trigger chạy y.txt
export function triggerY() {
    if (SLAVE_ID === 12 && triggerMap.triggerY) {
        triggerMap.triggerY();
    } else {
        console.log(`ℹ️ Máy ${SLAVE_ID} không chạy y.txt`);
    }
}

// Gọi từ master để trigger chạy s.txt
export function triggerS(globalFolderName) {
    if (SLAVE_ID === 12 && triggerMap.triggerS) {
        // Máy số 12: thực thi s.txt
        triggerMap.triggerS(globalFolderName);
    } else {
        // Máy khác: chỉ kiểm tra result.txt
        checkResultOnly(globalFolderName);
    }
}


function checkResultOnly(globalFolderName) {
    const workingDir = path.join('D:\\test\\', globalFolderName);
    const resultFile = path.join(workingDir, 'result.txt');

    console.log(`⏳ [Slave ${SLAVE_ID}] Đợi 3 giây để kiểm tra result.txt...`);
    setTimeout(() => {
        if (fs.existsSync(resultFile)) {
            const status = fs.readFileSync(resultFile, 'utf-8').trim();
            console.log(`📄 [Slave ${SLAVE_ID}] Trạng thái trong result.txt: ${status}`);
            if (status === '0') {
                notifyMaster();
            } else {
                console.warn(`⚠️ [Slave ${SLAVE_ID}] result.txt lỗi: ${status}`);
            }
        } else {
            console.warn(`❌ [Slave ${SLAVE_ID}] Không tìm thấy result.txt`);
        }
    }, 3000);
}

const getCurrentFolder = () => currentFolderName;
const notifyMaster = async () => {
   
    try {
        await axios.post(`http://${ipMaster}:3001/slave-status`, {
            slaveIp: `${myIp}`,
            status: 'done',
            folderName: globalFolderName,
        });

        console.log('📨 Đã gửi trạng thái hoàn thành về master.');
    } catch (err) {
        console.error('❌ Không gửi được trạng thái:', err.message);
    }
};

const notifyMasterStrigger = async (globalFolderName) => {

    try {
        await axios.post(`http://${ipMaster}:3001/strigger-ok`, {
            slaveIp: `${myIp}`,
            status: 'ready',
            folderName: globalFolderName,
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
