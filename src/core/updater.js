const { app, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');

function setupAutoUpdater(mainWindow) {
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    console.log('[updater] 개발 모드에서는 자동업데이트를 건너뜁니다.');
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    console.log('[updater] 업데이트 확인 중');
  });

  autoUpdater.on('update-available', (info) => {
    console.log(`[updater] 새 버전 발견: ${info.version}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('app:update-status', {
        status: 'available',
        version: info.version
      });
    }
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log(`[updater] 최신 버전 사용 중: ${info.version || '현재 버전'}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('app:update-status', {
        status: 'latest',
        version: info.version || app.getVersion()
      });
    }
  });

  autoUpdater.on('download-progress', (progress) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('app:update-status', {
        status: 'downloading',
        percent: progress.percent,
        bytesPerSecond: progress.bytesPerSecond
      });
    }
  });

  autoUpdater.on('update-downloaded', async (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('app:update-status', {
        status: 'downloaded',
        version: info.version
      });
    }

    const result = await dialog.showMessageBox({
      type: 'info',
      title: '업데이트 준비 완료',
      message: `새 버전(${info.version})이 다운로드되었습니다.`,
      detail: '지금 앱을 재시작하면 업데이트가 적용됩니다.',
      buttons: ['지금 재시작', '나중에'],
      defaultId: 0,
      cancelId: 1
    });

    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });

  autoUpdater.on('error', (error) => {
    console.error('[updater] 자동업데이트 오류:', error == null ? 'unknown' : error.message);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('app:update-status', {
        status: 'error',
        message: error == null ? 'unknown error' : error.message
      });
    }
  });

  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify().catch((error) => {
      console.error('[updater] 업데이트 확인 실패:', error.message);
    });
  }, 5000);
}

module.exports = {
  setupAutoUpdater
};
