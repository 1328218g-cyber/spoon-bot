const { app, BrowserWindow, ipcMain, session } = require('electron');
const fs = require('fs');
const path = require('path');
const SpoonClient = require('../spoon/client');
const BotEngine = require('../bot/engine');

class SpoonBotApp {
  constructor() {
    this.mainWin = null;
    this.botWin = null;
    this.isBotRunning = false;
    this.tokens = { accessToken: '', roomToken: '', streamName: '', liveId: '', apiStreamName: '' };
    this.liveInfo = { djId: 0, managerIds: [], myId: 0 };
    this.rankData = { next_choice: [], free_like: [], live_time: [], lastScanned: 0 };
    this.autoJoinTag = '';
    this.ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
    
    this.spoon = new SpoonClient({
      ua: this.ua,
      onLog: (log) => this.sendToBot('bot:log', log),
      onConnected: (stream) => {
        this.sendToBot('bot:connected', stream);
        this.sendToBot('bot:log', { type: 'system', author: '시스템', text: '✅ 채팅 연결 완료!' });
      },
      onDisconnected: () => {
        this.isBotRunning = false;
        this.sendToBot('bot:disconnected');
      },
      onMessage: (body) => this.handleSpoonMessage(body)
    });

    this.bot = new BotEngine({
      onLog: (log) => this.sendToBot('bot:log', log),
      onSendChat: (text) => this.sendChat(text),
      onKeepQuery: ({ keepKey, author }) => {
        try {
          const filePath = path.join(app.getPath('userData'), 'roulette_history.json');
          const history = fs.existsSync(filePath)
            ? JSON.parse(fs.readFileSync(filePath, 'utf-8'))
            : {};
          const keepData = (history[keepKey] || {})['킵목록'] || {};
          let msg;
          if (Object.keys(keepData).length === 0) {
            msg = `📋 ${author}님의 룰렛 기록이 없습니다.`;
          } else {
            msg = `📋 ${author}님의 룰렛 기록\n`;
            Object.entries(keepData).forEach(([itemName, count], i) => {
              const cnt = count > 1 ? `(${count})` : '';
              msg += `${i + 1}. ${itemName}${cnt}\n`;
            });
            msg = msg.trim();
          }
          this.bot.handleKeepReply(author, msg);
        } catch(e) {
          this.bot.handleKeepReply(author, `📋 ${author}님의 룰렛 기록이 없습니다.`);
        }
      },
      onActivityWrite: (actData) => {
        try {
          const filePath = path.join(app.getPath('userData'), 'act_data.json');
          fs.writeFileSync(filePath, JSON.stringify(actData, null, 2), 'utf-8');
          this.sendToBot('act:data-updated', actData);
        } catch(e) {}
      }
    });

    this.setupIpc();
  }

  setupIpc() {
    ipcMain.on('bot:start', (_e, { commands, hotkeys, joinMsgs, autoSettings, fundings, fundingOptions, shieldCount, shieldOptions, songList, songSettings, rouletteSettings, miscSettings, actSettings, actData }) => {
      // act_data.json 파일에서 최신 데이터 로드 (bot.html localStorage보다 우선)
      try {
        const filePath = path.join(app.getPath('userData'), 'act_data.json');
        if (fs.existsSync(filePath)) actData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      } catch(e) {}
      this.bot.updateConfig(commands, hotkeys, joinMsgs, autoSettings, fundings, fundingOptions, shieldCount, shieldOptions, songList, songSettings, rouletteSettings, miscSettings, actSettings, actData);
      this.startBot();
    });

    ipcMain.on('bot:stop', () => this.stopBot());

    ipcMain.on('config:update', (_e, { commands, hotkeys, joinMsgs, autoSettings, fundings, fundingOptions, shieldCount, shieldOptions, songList, songSettings, rouletteSettings, miscSettings, actSettings, actData }) => {
      this.bot.updateConfig(commands, hotkeys, joinMsgs, autoSettings, fundings, fundingOptions, shieldCount, shieldOptions, songList, songSettings, rouletteSettings, miscSettings, actSettings, actData);
      if (this.isBotRunning) {
        this.sendToBot('bot:log', { type: 'system', author: '시스템', text: '설정이 즉시 적용되었습니다.' });
      }
    });

    ipcMain.on('bot:response-config', (_e, { commands, hotkeys, joinMsgs, autoSettings, fundings, fundingOptions, shieldCount, shieldOptions, songList, songSettings, rouletteSettings, miscSettings, actSettings, actData }) => {
      try {
        const filePath = path.join(app.getPath('userData'), 'act_data.json');
        if (fs.existsSync(filePath)) actData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      } catch(e) {}
      this.bot.updateConfig(commands, hotkeys, joinMsgs, autoSettings, fundings, fundingOptions, shieldCount, shieldOptions, songList, songSettings, rouletteSettings, miscSettings, actSettings, actData);
      if (!this.isBotRunning) {
        this.sendToBot('bot:log', { type: 'system', author: '시스템', text: '방 입장 감지 - 봇을 자동으로 시작합니다...' });
        this.startBot();
      }
    });

    // act_data.json 직접 쓰기 IPC (window.store 없는 환경 대비)
    ipcMain.on('act:write', (_e, data) => {
      try {
        const filePath = path.join(app.getPath('userData'), 'act_data.json');
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
        this.bot.actData = data;
      } catch(e) {}
    });

    // 랭킹 데이터 스캔 및 조회
    ipcMain.handle('rank:scan', async () => {
      if (!this.tokens.accessToken) return { success: false, error: '토큰이 없습니다. 방송 페이지에 먼저 접속해주세요.' };
      
      try {
        const types = ['next_choice', 'free_like', 'live_time'];
        for (const type of types) {
          this.rankData[type] = await this.spoon.fetchMonthlyRank(type, this.tokens.accessToken);
        }
        this.rankData.lastScanned = Date.now();
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message };
      }
    });

    ipcMain.handle('rank:search', async (_e, tag) => {
      if (!tag) return { success: false, error: '태그를 입력해주세요.' };
      if (this.rankData.lastScanned === 0) return { success: false, error: '먼저 랭킹 데이터를 스캔해주세요.' };

      const results = { nickname: '', tag: tag, ranks: {} };
      let found = false;

      for (const type of ['next_choice', 'free_like', 'live_time']) {
        const idx = this.rankData[type].findIndex(x => x.author && x.author.tag === tag);
        if (idx !== -1) {
          found = true;
          results.nickname = this.rankData[type][idx].author.nickname;
          results.ranks[type] = idx + 1;
        }
      }

      if (!found) return { success: false, error: '랭킹 데이터에서 해당 유저를 찾을 수 없습니다.' };
      return { success: true, data: results };
    });

    ipcMain.on('bot:set-auto-join', (_e, tag) => {
      this.autoJoinTag = tag;
      this.checkAutoStart();
    });
  }

  setupWebRequest() {
    session.defaultSession.webRequest.onBeforeSendHeaders(
      { urls: ['*://*.spooncast.net/*'] },  // 스푼 도메인만 감시 (구글 도메인 절대 건드리지 않음)
      (details, callback) => {
        const h = details.requestHeaders;
        // User-Agent는 절대 수정하지 않음 (구글 로그인 차단 방지)
        // 토큰 감지만 수행

        if (details.url.includes('spooncast.net')) {
          const auth = h['Authorization'] || h['authorization'] || '';
          if (auth.startsWith('Bearer ') && auth.length > 30) {
            const t = auth.slice(7);
            if (t !== this.tokens.accessToken) { 
              this.tokens.accessToken = t; 
              this.sendToBot('token:access', t);
              this.checkAutoStart();
            }
          }
          const live = h['x-live-authorization'] || h['X-Live-Authorization'] || '';
          if (live.startsWith('Bearer ') && live.length > 30) {
            const t = live.slice(7);
            if (t !== this.tokens.roomToken) { 
              this.tokens.roomToken = t; 
              this.sendToBot('token:room', t);
              this.checkAutoStart();
            }
          }

          const mName = details.url.match(/\/lives\/@([^/?#&]+)/);
          if (mName && mName[1] && mName[1] !== this.tokens.streamName) {
            this.tokens.streamName = mName[1];
            this.sendToBot('token:stream', this.tokens.liveId ? `${mName[1]} ✅` : mName[1]);
            this.checkAutoStart();
          }

          const mId = details.url.match(/\/lives\/(\d+)/);
          if (mId && mId[1] && mId[1] !== this.tokens.liveId) {
            this.tokens.liveId = mId[1];
            this.sendToBot('token:stream', this.tokens.streamName ? `${this.tokens.streamName} ✅` : `ID:${mId[1]} ✅`);
            this.fetchStreamName(mId[1]);
          }
        }
        callback({ requestHeaders: h });
      }
    );
  }

  async fetchStreamName(liveId) {
    const info = await this.spoon.fetchStreamName(liveId, this.tokens.accessToken);
    if (info) {
      const sn = info.stream_name;
      this.liveInfo.djId = info.dj_user_id || (info.author && info.author.id) || (info.user && info.user.id) || 0;
      this.liveInfo.managerIds = info.manager_ids || [];
      
      if (sn && sn !== this.tokens.apiStreamName) {
        this.tokens.apiStreamName = sn;
        this.sendToBot('bot:log', { type: 'system', author: '시스템', text: `채널 확인됨: ${sn}` });
        this.checkAutoStart();
      }
    }
  }

  async checkAutoStart() {
    // 1. 이미 봇이 실행 중이면 패스
    if (this.isBotRunning) return;

    // 2. 고유닉 기반 자동 접속 시도 (토큰은 있고 방송 정보가 없을 때)
    if (this.tokens.accessToken && this.autoJoinTag && !this.tokens.liveId && !this.tokens.streamName) {
      const live = await this.spoon.fetchLiveByTag(this.autoJoinTag, this.tokens.accessToken);
      if (live && live.live_id) {
        this.tokens.liveId = live.live_id;
        this.tokens.streamName = live.stream_name;
        this.liveInfo.djId = live.dj_user_id;
        this.sendToBot('bot:log', { type: 'system', author: '시스템', text: `자동 접속 대상 발견: @${this.autoJoinTag} (${live.title})` });
        this.sendToBot('token:stream', `${live.stream_name} ✅`);
      }
    }

    // 3. 모든 정보가 갖춰지면 설정 요청 (이후 startBot 호출됨)
    if (this.tokens.accessToken && this.tokens.roomToken && (this.tokens.streamName || this.tokens.liveId)) {
      this.sendToBot('bot:request-config');
    }
  }

  async startBot() {
    if (!this.tokens.accessToken || !this.tokens.roomToken) return;
    const channelId = this.tokens.apiStreamName || this.tokens.streamName || this.tokens.liveId;
    this.isBotRunning = true;
    
    // 봇 시작 시 본인 정보 가져오기 (권한 체크용)
    const myProfile = await this.spoon.fetchMyProfile(this.tokens.accessToken);
    if (myProfile) {
      this.liveInfo.myId = myProfile.id || 0;
      this.sendToBot('bot:log', { type: 'debug', author: '시스템', text: `내 정보 확인됨: ID:${this.liveInfo.myId}` });
    }

    // 봇 시작 시 중복 인사 기록 초기화
    this.bot.clearEnteredUsers();
    
    // 봇 시작 시 반복 메시지 타이머 재설정
    this.bot.setupRepeatMessages();
    
    this.spoon.connect(channelId, this.tokens.accessToken, this.tokens.roomToken);
  }

  stopBot() {
    this.spoon.disconnect();
    this.bot.stop();
    this.isBotRunning = false;
    this.sendToBot('bot:disconnected');
  }

  async handleSpoonMessage(evt) {
    const liveId = this.tokens.liveId;
    const eventName = evt.eventName;

    // 1. 채팅 메시지 처리 (live_message)
    if (eventName === 'live_message' || eventName === 'ChatMessage') {
      const user = evt.data?.user || evt.eventPayload?.generator || {};
      const author = user.nickname || user.name || '?';
      const userId = user.id;
      const message = evt.update_component?.message?.value || evt.eventPayload?.message || '';

      if (!message) return;

      // 매니저 권한 체크 (DJ 또는 매니저)
      // 1. ID 기반 체크 (타입 차이 방지를 위해 == 사용 및 명시적 숫자 변환)
      const curUserId = Number(userId);
      const djId = Number(this.liveInfo.djId);
      const myId = Number(this.liveInfo.myId);
      const managerIds = (this.liveInfo.managerIds || []).map(id => Number(id));

      const isDjById = curUserId !== 0 && djId !== 0 && (curUserId === djId);
      const isManagerById = curUserId !== 0 && managerIds.includes(curUserId);
      const isMe = curUserId !== 0 && myId !== 0 && (curUserId === myId); // 봇 실행자 본인
      
      // 2. 이벤트 데이터 기반 체크 (보조)
      const isDj = !!(isDjById || isMe || user.is_dj || user.role === 'dj' || evt.data?.is_dj || evt.data?.user?.is_dj || evt.eventPayload?.is_dj || evt.eventPayload?.generator?.is_dj || evt.eventPayload?.generator?.role === 'dj');
      const isManager = !!(isDj || isManagerById || user.is_manager || user.is_staff || user.role === 'manager' || evt.data?.is_manager || evt.data?.user?.is_manager || evt.eventPayload?.is_manager || evt.eventPayload?.generator?.is_manager || evt.eventPayload?.generator?.role === 'manager');

      let displayAuthor = author;
      let chatTag = null;
      if (userId && liveId) {
        const chatProfile = await this.spoon.fetchUserProfile(liveId, userId, this.tokens.accessToken);
        chatTag = chatProfile ? chatProfile.tag : null;
        if (chatTag) displayAuthor = `${author}(${chatTag})`;
        // 프로필 이미지 별도 조회 (비동기, 채팅 흐름 블로킹 없이)
        this.spoon.fetchUserImgUrl(userId, this.tokens.accessToken).then(imgUrl => {
          if (chatTag && imgUrl) this.sendToBot('bot:log', { type: 'user_img', author: chatTag, text: imgUrl });
        });
      }

      this.sendToBot('bot:log', { type: 'chat', author: displayAuthor, text: message });
      this.sendToBot('bot:log', { type: 'debug', author: '권한체크', text: `ID:${userId} / DJ:${this.liveInfo.djId} / 본인:${this.liveInfo.myId} / 결과:${isManager}` });
      this.bot.handleMessage(author, message, this.tokens.streamName, isManager, chatTag, isDj);
      // 애청지수 채팅 기록
      try { this.bot.handleActChat(author, chatTag); } catch(e) {}
      return;
    }

    // 2. 입장 메시지 처리
    const isJoinEvent = !!(eventName && (
      eventName === 'live_join' || 
      eventName === 'JoinMessage' || 
      eventName === 'RoomJoin' ||
      eventName === 'live_join_event' ||
      eventName === 'LiveJoin' ||
      eventName === 'UserJoin' ||
      eventName === 'live_user_join' ||
      eventName === 'join' ||
      eventName === 'Join' ||
      eventName.toLowerCase().includes('join')
    ));

    if (isJoinEvent) {
      // 디버깅을 위한 전체 이벤트 데이터 로그 출력
      this.sendToBot('bot:log', { type: 'debug', author: '디버그', text: `입장 이벤트 감지: ${eventName} (데이터: ${JSON.stringify(evt).slice(0, 300)})` });

      const user = evt.data?.author || evt.data?.user || evt.eventPayload?.author || evt.eventPayload?.generator || evt.author || evt.user || {};
      const author = user.nickname || user.name || user.display_name || user.username || '?';
      const userId = user.id || user.user_id || user.userId || 0;

      if (userId && liveId) {
        const tag = await this.spoon.fetchUserTag(liveId, userId, this.tokens.accessToken);
        const logText = tag ? `[${author}] 님이 입장했습니다. (태그: @${tag})` : `[${author}] 님이 입장했습니다. (ID:${userId})`;
        this.sendToBot('bot:log', { type: 'join', author: '입장', text: logText });
        this.bot.handleJoin(author, tag, this.tokens.streamName);
        // 애청지수 자동 출석 (30분마다 1회, 조용히 처리)
        try { this.bot.handleActAttend(author, tag); } catch(e) {}
      } else if (author && author !== '?') {
        this.sendToBot('bot:log', { type: 'join', author: '입장', text: `[${author}] 님이 입장했습니다. (닉네임 기반)` });
        this.bot.handleJoin(author, null, this.tokens.streamName);
        try { this.bot.handleActAttend(author, null); } catch(e) {}
      }
      return;
    }

    // 3. 좋아요 처리 (LiveFreeLike / live_like)
    if (eventName === 'live_like' || eventName === 'LiveFreeLike') {
      const author = evt.eventPayload?.nickname || evt.data?.author?.nickname || evt.data?.user?.nickname || '시청자';
      const userId = evt.eventPayload?.userId || evt.eventPayload?.user_id || evt.data?.user?.id || 0;

      this.sendToBot('bot:log', { type: 'system', author: '좋아요', text: `${author}님이 좋아요를 눌렀습니다.` });
      this.bot.handleLike(author);

      // userId → tag 조회 후 하트 기록 (userId 있으면 정확한 tag, 없으면 닉네임 fallback)
      if (userId && liveId) {
        this.spoon.fetchUserProfile(liveId, userId, this.tokens.accessToken).then(profile => {
          const tag = profile ? profile.tag : null;
          try { this.bot.handleActHeart(author, tag); } catch(e) {}
        });
      } else {
        try { this.bot.handleActHeart(author, null); } catch(e) {}
      }
      return;
    }

    // 4. 선물 처리 (live_present 및 LiveDonation 등 모든 선물 이벤트 대응)
    if (eventName === 'live_present' || eventName === 'LiveDonation' || eventName === 'DonationMessage') {
      const data = evt.data || evt.eventPayload || evt;
      
      // 유저 정보 추출 (다양한 필드명 대응)
      const user = data.author || data.user || data.generator || data;
      const author = user.nickname || user.name || user.display_name || '?';
      
      // 스푼 개수 추출 (amount, spoonCount, quantity, value 등 모든 가능성 체크)
      const amount = Number(data.amount || data.spoonCount || data.spoon_count || data.quantity || data.value || 0);
      
      // 콤보 횟수 추출 (comboCount, combo_count 등)
      const comboCount = Number(data.comboCount || data.combo_count || data.combo || 1);
      
      // 스티커 정보 추출
      const sticker = data.sticker || data.stickerName || data.sticker_name || data.name || '';
      
      if (amount > 0) {
        const userId = user.id || user.user_id || user.userId || 0;
        this.spoon.fetchUserProfile(liveId, userId, this.tokens.accessToken).then(profile => {
          const tag = profile ? profile.tag : null;
          const displayAuthor = tag ? `${author}(${tag})` : author;
          const logText = `${displayAuthor}님이 ${sticker ? '['+sticker+'] ' : ''}스푼 ${amount}개${comboCount > 1 ? ' X ' + comboCount : ''}를 선물했습니다. 🎁`;
          this.sendToBot('bot:log', { type: 'system', author: '선물', text: logText });
          this.spoon.fetchUserImgUrl(userId, this.tokens.accessToken).then(imgUrl => {
            if (tag && imgUrl) this.sendToBot('bot:log', { type: 'user_img', author: tag, text: imgUrl });
          });
          this.bot.handleGift(author, amount, sticker, comboCount, tag);
          // 애청지수 복권포인트 적립
          try { this.bot.handleActLottoPoint(author, tag, amount); } catch(e) {}
        });
      } else {
        // 디버깅용 로그: 스푼 개수가 0으로 파싱된 경우 전체 데이터 출력
        this.sendToBot('bot:log', { type: 'debug', author: '선물오류', text: `선물 감지되었으나 스푼 개수 파싱 실패: ${JSON.stringify(data).slice(0, 200)}` });
      }
      return;
    }
  }

  async sendChat(text) {
    const channelId = this.tokens.apiStreamName || this.tokens.streamName || this.tokens.liveId;
    await this.spoon.sendChat(channelId, text, this.tokens.accessToken, this.tokens.roomToken);
  }

  createWindows() {
    const { screen } = require('electron');
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    const spoonW = Math.min(700, width - 420);

    this.mainWin = new BrowserWindow({
      width: spoonW, height, x: 0, y: 0, title: '스푼라디오',
      // 샘플 프로젝트와 동일한 webPreferences (구글 로그인 작동 확인된 구성)
      webPreferences: {
        contextIsolation: false,
        nodeIntegration: true,
        webSecurity: false,
        sandbox: false,
        backgroundThrottling: false,
        offscreen: false,
      },
    });
    this.mainWin.setMenuBarVisibility(false);
    // 중요: setUserAgent() 호출하지 않음
    // → Electron 기본 Chrome UA 그대로 사용해야 구글이 "embedded webview"로 차단하지 않음
    this.mainWin.loadURL('https://www.spooncast.net');

    this.botWin = new BrowserWindow({
      width: 920, height, x: spoonW, y: 0, title: '🎙️ 스푼봇',
      webPreferences: { nodeIntegration: true, contextIsolation: false, preload: path.join(__dirname, '../../preload.js') },
    });
    this.botWin.setMenuBarVisibility(false);
    this.botWin.loadFile('bot.html');
    
    this.setupWebRequest();
  }

  sendToBot(ch, data) {
    if (this.botWin && !this.botWin.isDestroyed()) this.botWin.webContents.send(ch, data);
  }
}

module.exports = SpoonBotApp;
