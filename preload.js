// preload.js - bot.html 에서 ipcRenderer 사용 가능하게
const { ipcRenderer } = require('electron')
window.ipc = ipcRenderer

// 파일 기반 영구 저장소 API
window.store = {
  get: (filename) => ipcRenderer.invoke('store:get', filename),
  set: (filename, data) => ipcRenderer.invoke('store:set', filename, data),
}
window.sound = { getPath: (filename) => ipcRenderer.invoke('sound:getPath', filename) };
