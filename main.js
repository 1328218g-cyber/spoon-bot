const { app, ipcMain } = require('electron');
const SpoonBotApp = require('./src/core/app');
const fs = require('fs');
const path = require('path');

// 데이터 저장 경로 (userData 폴더 = 재시작해도 유지)
function getDataPath(filename) {
  return path.join(app.getPath('userData'), filename);
}

// 파일 저장/로드 IPC 핸들러
ipcMain.handle('store:get', (e, filename) => {
  try {
    const filePath = getDataPath(filename);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch { return null; }
});

ipcMain.handle('store:set', (e, filename, data) => {
  try {
    const filePath = getDataPath(filename);
    fs.writeFileSync(filePath, JSON.stringify(data), 'utf-8');
    return true;
  } catch { return false; }
});

// 사운드 파일 경로 반환 IPC 핸들러
ipcMain.handle('sound:getPath', (e, filename) => {
  return path.join(__dirname, filename);
});

// Electron 보안 경고 메시지만 끄기 (샘플 프로젝트와 동일)
// 주의: no-sandbox / disable-web-security / ignore-certificate-errors 등은
// 구글 로그인을 "비정상 환경"으로 감지시켜 차단하는 원인이 되므로 추가하지 않음.
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';

let spoonBot = null;

app.whenReady().then(() => {
  spoonBot = new SpoonBotApp();
  spoonBot.createWindows();
});

app.on('window-all-closed', () => {
  if (spoonBot && spoonBot.spoon) spoonBot.spoon.disconnect();
  app.quit();
});
