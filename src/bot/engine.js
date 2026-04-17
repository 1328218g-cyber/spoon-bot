class BotEngine {
  constructor(options = {}) {
    this.commands = options.commands || [];
    this.hotkeys = options.hotkeys || [];
    this.joinMsgs = options.joinMsgs || [];
    this.fundings = options.fundings || [];
    this.fundingOptions = options.fundingOptions || { showPercent: true, showDday: true };
    this.shieldCount = options.shieldCount || 0;
    this.shieldOptions = options.shieldOptions || { format: "🛡️ 현재 보유 중인 실드는 {실드}개 입니다!", updateFormat: "{icon} 실드 {action} 완료!\n현재 실드: {실드}개" };
    this.songList = options.songList || [];
    this.songSettings = options.songSettings || { enabled: true };
    this.autoSettings = options.autoSettings || { join: [], like: [], gift: [], repeat: [] };
    this.onLog = options.onLog || (() => {});
    this.onSendChat = options.onSendChat || (() => {});
    this.onKeepQuery = options.onKeepQuery || (() => {});
    this.onCouponCheck = options.onCouponCheck || (() => {});
    this.onActivityRead = options.onActivityRead || (() => {});
    this.onActivityWrite = options.onActivityWrite || (() => {});
    this.miscSettings = options.miscSettings || {};
    this.actSettings = options.actSettings || {};
    this.actData = options.actData || {};
    this.activeTimers = [];
    this.cmdCounts = {};
    this.cmdTimes = {};
    this.enteredUsers = new Set();
    this.userJoinCounts = {};
    this.rouletteUserLogs = {};
    this.maxLen = 100;
    this.sendInterval = 200;
    this.repeatTimers = [];
  }

  updateConfig(commands, hotkeys, joinMsgs, autoSettings, fundings, fundingOptions, shieldCount, shieldOptions, songList, songSettings, rouletteSettings, miscSettings, actSettings, actData) {
    this.commands = commands || [];
    this.hotkeys = hotkeys || [];
    this.joinMsgs = joinMsgs || [];
    if (autoSettings && typeof autoSettings === 'object') this.autoSettings = autoSettings;
    this.fundings = fundings || this.fundings;
    this.fundingOptions = fundingOptions || this.fundingOptions;
    if (shieldCount !== undefined) this.shieldCount = shieldCount;
    if (shieldOptions) this.shieldOptions = shieldOptions;
    if (songList) this.songList = songList;
    if (songSettings) this.songSettings = songSettings;
    if (rouletteSettings) this.rouletteSettings = rouletteSettings;
    if (miscSettings !== undefined) this.miscSettings = miscSettings || this.miscSettings;
    if (actSettings !== undefined) this.actSettings = actSettings || this.actSettings;
    if (actData !== undefined) this.actData = actData || this.actData;
    if (this.isRunning) this.setupRepeatMessages();
  }

  // 반복 메시지 타이머 설정
  setupRepeatMessages() {
    this.isRunning = true;
    this.repeatTimers.forEach(timer => clearInterval(timer));
    this.repeatTimers = [];

    if (this.autoSettings && this.autoSettings.repeat) {
      this.autoSettings.repeat.forEach(item => {
        const enabled = item.enabled !== false;
        this.onLog({ type: 'debug', author: '반복', text: `반복문구: "${item.text.slice(0,20)}" delay=${item.delay}초 enabled=${enabled}` });
        if (item.text && item.delay > 0 && enabled) {
          const timer = setInterval(() => {
            this.onLog({ type: 'debug', author: '반복', text: `반복문구 전송: "${item.text.slice(0,20)}"` });
            this.sendSplitChat(item.text, '🔄반복');
          }, item.delay * 1000);
          this.repeatTimers.push(timer);
        }
      });
    }
  }

  // 중복 인사 기록 초기화 (방송 시작 시 또는 수동)
  clearEnteredUsers() {
    this.enteredUsers.clear();
  }

  handleMessage(author, text, streamName, isManager = false, tag = null, isDj = false) {
    const parts = text.trim().split(/\s+/);
    const first = parts[0].toLowerCase();
    const now = Date.now();

    // 0. 펀딩 명령어 처리 (커스텀 명령어 대응)
    const fundingCmd = (this.fundingOptions?.customCmd || '!펀딩').toLowerCase();
    if (first === fundingCmd) {
      this.onLog({ type: 'debug', author: '디버그', text: `펀딩 명령어 감지: ${text} (매니저여부: ${isManager})` });
      this.handleFundingCommand(parts, isManager);
      return;
    }

    // 0.1 실드 명령어 처리 (커스텀 명령어 대응)
    const shieldCmd = (this.shieldOptions?.customCmd || '!실드').toLowerCase();
    if (first === shieldCmd) {
      this.handleShieldCommand(parts, isManager);
      return;
    }

    // 0.2 신청곡 명령어 처리
    const songCmd = (this.songSettings?.customCmd || '!신청곡').toLowerCase();
    const songDelCmd = (this.songSettings?.delCmd || '!제거').toLowerCase();
    const songStopCmd = (this.songSettings?.stopCmd || '!마감').toLowerCase();
    const songStartCmd = (this.songSettings?.startCmd || '!접수').toLowerCase();
    const songResetCmd = (this.songSettings?.resetCmd || '리셋').toLowerCase();
    const isResetCmd = songResetCmd.startsWith('!') ? first === songResetCmd : first === '!' + songResetCmd;

    if (first === songCmd || first === songDelCmd || first === songStopCmd || first === songStartCmd || isResetCmd) {
      this.handleSongCommand(parts, isManager, author);
      return;
    }

    // 0.2 기타모듈 명령어 처리
    const diceCmd = (this.miscSettings?.diceCmd || '!주사위').toLowerCase();
    const timerCmd = (this.miscSettings?.timerCmd || '!리액션').toLowerCase();
    const ddayCmd = (this.miscSettings?.ddayCmd || '!디데이').toLowerCase();

    if (first === diceCmd) {
      this.handleDice(author, isManager);
      return;
    }
    if (first === timerCmd) {
      this.handleTimer(author, parts, isManager);
      return;
    }
    if (first === ddayCmd) {
      this.handleDday(author, parts, isManager);
      return;
    }

    // 0.5 애청지수 명령어 처리
    const act = this.actSettings || {};
    const cmdMyInfo   = (act.cmdMyInfo   || '!내정보').toLowerCase();
    const cmdCreate   = (act.cmdCreate   || '!내정보 생성').toLowerCase();
    const cmdDelete   = (act.cmdDelete   || '!내정보 삭제').toLowerCase();
    const cmdRank     = (act.cmdRank     || '!랭킹').toLowerCase();
    const cmdLotto    = (act.cmdLotto    || '!복권').toLowerCase();
    const cmdAttend   = (act.cmdAttend   || '!출석').toLowerCase();
    const cmdAt       = (act.cmdAt       || '@');

    const fullText = text.trim().toLowerCase();

    // !내정보 생성
    if (fullText === cmdCreate) {
      this.handleActCreate(author, tag);
      return;
    }
    // !내정보 삭제
    if (fullText === cmdDelete) {
      this.handleActDelete(author, tag);
      return;
    }
    // !내정보
    if (fullText === cmdMyInfo) {
      this.handleActMyInfo(author, tag);
      return;
    }
    // !랭킹
    if (fullText === cmdRank) {
      this.handleActRank();
      return;
    }
    // !출석
    if (fullText === cmdAttend) {
      this.handleActAttend(author, tag);
      return;
    }
    // !복권 [수량] or !복권 N1 N2 N3
    if (parts[0].toLowerCase() === cmdLotto) {
      this.handleActLotto(author, tag, parts.slice(1));
      return;
    }
    // @[고유닉] - DJ/매니저만
    if (isManager && parts[0].startsWith(cmdAt) && parts[0].length > cmdAt.length) {
      const targetTag = parts[0].slice(cmdAt.length);
      this.handleActViewOther(targetTag);
      return;
    }

    // !복권지급 전체 [수량] (DJ 전용)
    const cmdLottoGive = (act.cmdLottoGive || '!복권지급').toLowerCase();
    if (isDj && first === cmdLottoGive && parts[1] === '전체') {
      this.handleActLottoGiveAll(parts[2]);
      return;
    }

    // !복권지급 [고유닉] [수량] (DJ 전용)
    if (isDj && first === cmdLottoGive && parts[1] !== '전체') {
      this.handleActLottoGive(parts[1], parts[2]);
      return;
    }

    // !상점 [고유닉] [경험치] (DJ 전용)
    const cmdShop = (act.cmdShop || '!상점').toLowerCase();
    if (isDj && first === cmdShop) {
      this.handleActShopExp(parts[1], parts[2]);
      return;
    }

    // !우선온 / !우선오프 (DJ/매니저 전용)
    const priorityOnCmd = (this.songSettings?.priorityOnCmd || '!우선온').toLowerCase();
    const priorityOffCmd = (this.songSettings?.priorityOffCmd || '!우선오프').toLowerCase();
    if (isManager) {
      if (first === priorityOnCmd) {
        this.songSettings.priority = true;
        this.sendSplitChat('✅ 신청곡 우선 추가(1번 추가) 기능이 활성화되었습니다.', '🎵신청곡');
        this.onLog({ type: 'song_update', author: '시스템', text: JSON.stringify({ action: 'priority', value: true }) });
        return;
      }
      if (first === priorityOffCmd) {
        this.songSettings.priority = false;
        this.sendSplitChat('❌ 신청곡 우선 추가(1번 추가) 기능이 비활성화되었습니다.', '🎵신청곡');
        this.onLog({ type: 'song_update', author: '시스템', text: JSON.stringify({ action: 'priority', value: false }) });
        return;
      }
    }

    // 0.3 !킵 명령어 처리 (optKeep이 활성화된 룰렛의 유저 기록 조회)
    if (first === '!킵' || first === '킵') {
      this.handleKeepCommand(author, tag);
      return;
    }

    // 0.4 !룰렛N [수량] 명령어 처리 (룰렛권 사용 또는 DJ/매니저 실행)
    const rouletteMatch = first.match(/^!룰렛(\d+)$/);
    if (rouletteMatch) {
      const rouletteIdx = parseInt(rouletteMatch[1]);
      const useCount = parseInt(parts[1]) || 1;
      this.handleRouletteCommand(author, tag, rouletteIdx, useCount, isManager, streamName);
      return;
    }

    // 1. 일반 커맨드 처리
    for (const cmd of this.commands) {
      if (first !== cmd.trigger.toLowerCase()) continue;
      const ms = (cmd.cooldown || 10) * 1000;
      const last = this.cmdTimes[cmd.trigger] || 0;
      
      if (now - last < ms) return;
      
      this.cmdCounts[cmd.trigger] = (this.cmdCounts[cmd.trigger] || 0) + 1;
      this.cmdTimes[cmd.trigger] = now;
      
      const reply = this.resolveVars(cmd.response, author, this.cmdCounts[cmd.trigger], streamName);
      this.sendSplitChat(reply, '🤖봇');
      return;
    }

    // 2. 단축키 명령어 처리
    for (const hk of this.hotkeys) {
      if (first !== hk.trigger.toLowerCase()) continue;
      this.sendSplitChat(hk.response, '⌨️단축');
      return;
    }
  }

  // 지정 인사 및 자동 환영 메시지 처리
  handleJoin(nickname, tag, streamName) {
    const userKey = tag || nickname;
    this.onLog({ type: 'debug', author: '디버그', text: `handleJoin 호출: ${nickname} (태그: ${tag})` });
    
    // 재입장 시에도 메시지가 나오도록 중복 방지 로직 제거 (또는 완화)
    // if (this.enteredUsers.has(userKey)) {
    //   this.onLog({ type: 'debug', author: '디버그', text: `이미 입장 처리된 유저: ${userKey}` });
    //   return;
    // }
    this.enteredUsers.add(userKey);

    // 입장 횟수 증가
    this.userJoinCounts[userKey] = (this.userJoinCounts[userKey] || 0) + 1;
    const joinCount = this.userJoinCounts[userKey];

    // 1. 지정 인사 (우선순위 높음)
    const normTag = tag ? tag.replace(/@/g, '').trim().toLowerCase() : null;
    const normNick = nickname ? nickname.trim().toLowerCase() : null;
    
    let joinMatched = false;
    for (const jm of this.joinMsgs) {
      const savedTarget = jm.tag.replace(/@/g, '').trim().toLowerCase();
      if ((normTag && (normTag === savedTarget || normTag.includes(savedTarget))) || 
          (normNick && (normNick === savedTarget || normNick.includes(savedTarget)))) {
        const reply = this.resolveVars(jm.response, nickname, joinCount, streamName)
          .replace(/{count}/g, joinCount);
        setTimeout(() => this.sendSplitChat(reply, '👋인사'), 1500);
        joinMatched = true;
        break;
      }
    }

    // 2. 자동 환영 메시지 (지정 인사가 없을 때만 랜덤으로 하나 선택)
    if (!joinMatched && this.autoSettings && this.autoSettings.join && this.autoSettings.join.length > 0) {
      const validMsgs = this.autoSettings.join.filter(m => m.text && m.enabled !== false);
      if (validMsgs.length > 0) {
        const item = validMsgs[Math.floor(Math.random() * validMsgs.length)];
        const reply = item.text
          .replace(/{nickname}/g, nickname)
          .replace(/{count}/g, joinCount);
        setTimeout(() => this.sendSplitChat(reply, '✨환영'), (item.delay || 1) * 1000);
      }
    }
  }

  handleLike(nickname) {
    if (this.autoSettings.like && this.autoSettings.like.length > 0) {
      const validMsgs = this.autoSettings.like.filter(m => m.text && m.enabled !== false);
      if (validMsgs.length > 0) {
        const item = validMsgs[Math.floor(Math.random() * validMsgs.length)];
        const reply = item.text.replace(/{nickname}/g, nickname);
        setTimeout(() => this.sendSplitChat(reply, '❤️좋아요'), (item.delay || 0) * 1000);
      }
    }
  }

  handleGift(nickname, amount, sticker = '', comboCount = 1, tag = null) {
    // 1. 자동 선물 감사 메시지
    if (this.autoSettings.gift && this.autoSettings.gift.length > 0) {
      const validMsgs = this.autoSettings.gift.filter(m => m.text && m.enabled !== false);
      if (validMsgs.length > 0) {
        const item = validMsgs[Math.floor(Math.random() * validMsgs.length)];
        const reply = item.text.replace(/{nickname}/g, nickname).replace(/{amount}/g, amount);
        setTimeout(() => this.sendSplitChat(reply, '🎁선물'), (item.delay || 0) * 1000);
      }
    }

    // 2. 룰렛 실행 체크
    this.checkRoulette(nickname, amount, sticker, comboCount, tag);
  }

  checkRoulette(nickname, amount, sticker = '', comboCount = 1, tag = null) {
    if (!this.rouletteSettings || !Array.isArray(this.rouletteSettings)) return;

    this.rouletteSettings.forEach(r => {
      if (!r.enabled || !r.items || r.items.length === 0) return;

      let shouldRun = false;
      let runCount = 0;

      if (r.type === 'spoon') {
        const targetAmount = Number(r.amount);
        if (targetAmount > 0) {
          const payout = r.payout || 'combo';
          if (payout === 'normal') {
            // 일반: 정확히 X스푼 단발 선물일 때만 1회 (콤보 무시)
            if (amount === targetAmount && comboCount === 1) {
              shouldRun = true;
              runCount = 1;
            }
          } else if (payout === 'combo') {
            // 콤보: X스푼 X N개 선물 시 N회
            if (amount === targetAmount && comboCount > 0) {
              shouldRun = true;
              runCount = comboCount;
            }
          } else if (payout === 'dist') {
            // 배분: 총 금액(단발X콤보) 내에서 X스푼당 1회
            const totalAmount = amount * comboCount;
            if (totalAmount >= targetAmount) {
              shouldRun = true;
              runCount = Math.floor(totalAmount / targetAmount);
            }
          }
        }
      } else if (r.type === 'sticker') {
        const targetSticker = String(r.amount || '').trim().toLowerCase();
        const currentSticker = String(sticker || '').trim().toLowerCase();
        if (targetSticker && currentSticker && (currentSticker === targetSticker || currentSticker.includes(targetSticker))) {
          shouldRun = true;
          runCount = 1;
        }
      }

      if (shouldRun && runCount > 0) {
        this.onLog({ type: 'debug', author: '룰렛', text: `룰렛 실행: ${r.name} (${runCount}회)` });
        this.runRouletteMulti(r, nickname, runCount, tag);
      }
    });
  }

  runRouletteMulti(roulette, nickname, count, tag = null) {
    const items = roulette.items;
    const totalProb = items.reduce((sum, item) => sum + parseFloat(item.prob || 0), 0);
    if (totalProb <= 0) return;

    const results = [];
    for (let i = 0; i < count; i++) {
      let random = Math.random() * totalProb;
      let selectedItem = null;
      for (const item of items) {
        if (random < parseFloat(item.prob || 0)) {
          selectedItem = item;
          break;
        }
        random -= parseFloat(item.prob || 0);
      }
      if (!selectedItem) selectedItem = items[items.length - 1];
      results.push(selectedItem);
    }

    // 결과 집계 (동일 항목 합산)
    const summary = {};
    results.forEach(item => {
      if (!summary[item.name]) summary[item.name] = { count: 0, noLog: !!item.noLog };
      summary[item.name].count += 1;
      // 로그 기록 (기록안함 제외)
      if (!item.noLog) {
        this.onLog({
          type: 'system',
          author: '룰렛결과',
          text: `${tag ? nickname+'('+tag+')' : nickname} - ${roulette.name}: ${item.name}`
        });
      }
    });

    // optKeep: 유저별 룰렛 기록 저장 (tag 기준)
    if (roulette.optKeep) {
      const keepKey = tag || nickname;
      if (!this.rouletteUserLogs[keepKey]) this.rouletteUserLogs[keepKey] = [];
      Object.entries(summary).forEach(([name, info]) => {
        const cnt = info.count;
        // 기록안함 체크된 항목은 킵목록에도 저장하지 않음
        if (info.noLog) return;
        this.rouletteUserLogs[keepKey].push({
          rouletteName: roulette.name,
          itemName: name,
          count: cnt,
          time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
        });
        for (let i = 0; i < cnt; i++) {
          this.onLog({
            type: 'roulette_keep',
            author: nickname,
            text: JSON.stringify({ item: name, tag: keepKey })
          });
        }
      });
    }

    // 메시지 구성
    let resultMsg = `[🎡${roulette.name}] ${nickname}님 당첨! 🎉`;
    Object.entries(summary).forEach(([name, info]) => {
      const cnt = info.count;
      resultMsg += `\n👉 ${name}${cnt > 1 ? `(${cnt})` : ''}`;
    });

    this.sendSplitChat(resultMsg, '🎡룰렛');
  }

  handleDice(author, isManager = false) {
    if (!isManager) return; // DJ/매니저만 가능
    const result = Math.floor(Math.random() * 6) + 1;
    const faces = ['', '⚀','⚁','⚂','⚃','⚄','⚅'];
    const msg = (this.miscSettings?.diceMsg || '🎲 {user}님의 주사위: {result}!')
      .replace(/{user}/g, author)
      .replace(/{result}/g, `${faces[result]} ${result}`);
    this.sendSplitChat(msg, '🎲주사위');
  }

  handleTimer(author, parts, isManager = false) {
    // 목록 조회
    if (parts.length === 1) {
      if (this.activeTimers.length === 0) {
        this.sendSplitChat('⏱️ 등록된 타이머가 없습니다.', '⏱️타이머');
        return;
      }
      const now = Date.now();
      const list = this.activeTimers.map((t, i) => {
        const remain = Math.max(0, Math.ceil((t.endsAt - now) / 60000));
        return `${i + 1}. ${t.content} — ${remain}분 후`;
      }).join('\n');
      this.sendSplitChat('⏱️ 타이머 목록\n' + list, '⏱️타이머');
      return;
    }
    // 등록: [cmd] [분] [내용] — 매니저/DJ만 가능
    if (!isManager) {
      this.sendSplitChat('⏱️ 타이머 등록은 DJ/매니저만 가능합니다.', '⏱️타이머');
      return;
    }
    const min = parseInt(parts[1]);
    if (isNaN(min) || min <= 0) {
      this.sendSplitChat('⏱️ 사용법: [명령어] [분] [내용]', '⏱️타이머');
      return;
    }
    const content = parts.slice(2).join(' ') || '타이머';
    const endsAt = Date.now() + min * 60 * 1000;
    const timerIdx = this.activeTimers.length;
    const timeout = setTimeout(() => {
      const alertMsg = (this.miscSettings?.timerAlertMsg || '🔔 {content} 시간이 됐습니다!')
        .replace(/{content}/g, content).replace(/{min}/g, min);
      this.sendSplitChat(alertMsg, '⏱️타이머');
      const idx = this.activeTimers.findIndex(t => t.endsAt === endsAt && t.content === content);
      if (idx !== -1) this.activeTimers.splice(idx, 1);
      this.onLog({ type: 'timer_alert', author: '타이머', text: String(idx) });
    }, min * 60 * 1000);
    this.activeTimers.push({ content, endsAt, timeout });
    const setMsg = (this.miscSettings?.timerSetMsg || '⏱️ {min}분 후 알림: {content}')
      .replace(/{min}/g, min).replace(/{content}/g, content);
    this.sendSplitChat(setMsg, '⏱️타이머');
    // UI 목록 동기화
    this.onLog({ type: 'timer_update', author: '타이머', text: JSON.stringify(
      this.activeTimers.map(t => ({ content: t.content, endsAt: t.endsAt }))
    )});
  }

  handleDday(author, parts, isManager = false) {
    const ms = this.miscSettings || {};
    if (!ms.ddays) ms.ddays = [];
    // 목록 조회
    if (parts.length === 1) {
      if (ms.ddays.length === 0) {
        this.sendSplitChat('📅 등록된 디데이가 없습니다.', '📅디데이');
        return;
      }
      const today = new Date(); today.setHours(0,0,0,0);
      const list = ms.ddays.map((d, i) => {
        const target = new Date(d.date); target.setHours(0,0,0,0);
        const diff = Math.round((target - today) / 86400000);
        const label = diff > 0 ? `D-${diff}` : diff === 0 ? 'D-Day!' : `D+${Math.abs(diff)}`;
        return `${i + 1}. ${d.content} (${d.date}) ${label}`;
      }).join('\n');
      this.sendSplitChat('📅 디데이 목록\n' + list, '📅디데이');
      return;
    }
    // 등록: [cmd] [MM-DD] [내용] — 매니저/DJ만 가능
    if (!isManager) {
      this.sendSplitChat('📅 디데이 등록은 DJ/매니저만 가능합니다.', '📅디데이');
      return;
    }
    const datePart = parts[1];
    if (!/^\d{2}-\d{2}$/.test(datePart)) {
      this.sendSplitChat('📅 사용법: [명령어] [MM-DD] [내용]', '📅디데이');
      return;
    }
    // 연도 자동 결정: 올해 해당 날짜가 이미 지났으면 내년으로
    const now = new Date();
    const thisYear = now.getFullYear();
    let date = `${thisYear}-${datePart}`;
    const targetThisYear = new Date(date); targetThisYear.setHours(0,0,0,0);
    const today = new Date(); today.setHours(0,0,0,0);
    if (targetThisYear < today) date = `${thisYear + 1}-${datePart}`;
    const content = parts.slice(2).join(' ') || '디데이';
    ms.ddays.push({ date, content });
    this.miscSettings = ms;
    const setMsg = (ms.ddaySetMsg || '📅 디데이 등록: {content} ({date})')
      .replace(/{content}/g, content).replace(/{date}/g, date);
    this.sendSplitChat(setMsg, '📅디데이');
    // UI 동기화
    this.onLog({ type: 'dday_update', author: '디데이', text: JSON.stringify(ms.ddays) });
  }

  handleKeepCommand(author, tag) {
    const keepKey = tag || author;
    this.onKeepQuery({ keepKey, author });
  }

  handleKeepReply(author, msg) {
    this.sendSplitChat(msg, '🎡킵');
  }

  // !룰렛N [수량] 명령어 처리
  handleRouletteCommand(author, tag, rouletteIdx, useCount, isManager, streamName) {
    // 룰렛 인덱스 유효성 체크 (1부터 시작)
    if (!this.rouletteSettings || !Array.isArray(this.rouletteSettings)) {
      this.sendSplitChat(`🎡 등록된 룰렛이 없습니다.`, '🎡룰렛');
      return;
    }
    const arrayIdx = rouletteIdx - 1;
    if (arrayIdx < 0 || arrayIdx >= this.rouletteSettings.length) {
      this.sendSplitChat(`🎡 룰렛${rouletteIdx}은 등록되어 있지 않습니다.`, '🎡룰렛');
      return;
    }

    const roulette = this.rouletteSettings[arrayIdx];
    if (!roulette.enabled) {
      this.sendSplitChat(`🎡 ${roulette.name} 룰렛은 현재 비활성화 상태입니다.`, '🎡룰렛');
      return;
    }
    if (!roulette.items || roulette.items.length === 0) {
      this.sendSplitChat(`🎡 ${roulette.name} 룰렛에 등록된 항목이 없습니다.`, '🎡룰렛');
      return;
    }

    // 수량 유효성
    if (isNaN(useCount) || useCount <= 0) {
      this.sendSplitChat(`🎡 사용법: !룰렛${rouletteIdx} [수량]`, '🎡룰렛');
      return;
    }
    if (useCount > 50) {
      this.sendSplitChat(`🎡 한 번에 최대 50회까지만 실행할 수 있습니다.`, '🎡룰렛');
      return;
    }

    // DJ/매니저는 룰렛권 없이 바로 실행
    if (isManager) {
      this.onLog({ type: 'debug', author: '룰렛', text: `DJ/매니저 직접 실행: ${roulette.name} x ${useCount}` });
      this.runRouletteMulti(roulette, author, useCount, tag);
      return;
    }

    // 일반 시청자: 룰렛권 보유량 확인 후 차감 (파일 I/O는 app.js에서 처리)
    const keepKey = tag || author;
    this.onCouponCheck({
      keepKey,
      author,
      rouletteIdx,
      useCount,
      rouletteName: roulette.name
    });
  }

  // app.js에서 룰렛권 확인/차감 후 결과 전달
  handleCouponReply(author, tag, rouletteIdx, useCount, success, remaining, rouletteName) {
    if (!success) {
      const have = Number(remaining || 0);
      this.sendSplitChat(`🎡 ${author}님, 룰렛${rouletteIdx}(${rouletteName || ''}) 권이 부족합니다.\n(요청:${useCount}개 / 보유:${have}개)`, '🎡룰렛');
      return;
    }

    // 차감 성공 → 룰렛 실행
    const arrayIdx = rouletteIdx - 1;
    const roulette = this.rouletteSettings && this.rouletteSettings[arrayIdx];
    if (!roulette) {
      this.sendSplitChat(`🎡 룰렛${rouletteIdx}을 찾을 수 없습니다.`, '🎡룰렛');
      return;
    }

    this.sendSplitChat(`🎡 ${author}님이 룰렛${rouletteIdx} 권 ${useCount}개를 사용했습니다! (잔여: ${remaining}개)`, '🎡룰렛');
    this.runRouletteMulti(roulette, author, useCount, tag);
  }

  handleShieldCommand(parts, isManager) {
    // !실드 (조회)
    if (parts.length === 1) {
      let msg = this.shieldOptions?.format || "🛡️ 현재 보유 중인 실드는 {실드}개 입니다!";
      msg = msg.replace(/{실드}/g, String(this.shieldCount));
      this.sendSplitChat(msg, '🛡️실드');
      return;
    }

    // !실드 [+,-숫자] (적립/차감 - DJ/매니저 전용)
    if (parts.length >= 2) {
      if (!isManager) {
        // 일반 유저가 숫자를 붙여서 사용하면 조회만 시켜주거나 무시
        let msg = this.shieldOptions?.format || "🛡️ 현재 보유 중인 실드는 {실드}개 입니다!";
        msg = msg.replace(/{실드}/g, String(this.shieldCount));
        this.sendSplitChat(msg, '🛡️실드');
        return;
      }

      const input = parts[1];
      let amt = 0;
      
      // +10, -10 또는 그냥 10 형태 파싱
      if (input.startsWith('+')) {
        amt = parseInt(input.substring(1));
      } else if (input.startsWith('-')) {
        amt = -parseInt(input.substring(1));
      } else {
        amt = parseInt(input);
      }

      if (isNaN(amt)) {
        const usageCmd = this.shieldOptions?.customCmd || '!실드';
        this.sendSplitChat(`사용법: ${usageCmd} [+숫자/-숫자]`, '🛡️실드');
        return;
      }

      this.shieldCount += amt;
      if (this.shieldCount < 0) this.shieldCount = 0; // 음수 방지

      const action = amt >= 0 ? `${amt}개 적립` : `${Math.abs(amt)}개 차감`;
      const icon = amt >= 0 ? '✅' : '🔻';
      
      let msg = this.shieldOptions?.updateFormat || "{icon} 실드 {action} 완료!\n현재 실드: {실드}개";
      msg = msg.replace(/{icon}/g, icon)
               .replace(/{action}/g, action)
               .replace(/{실드}/g, String(this.shieldCount));
      
      this.sendSplitChat(msg, '🛡️실드');
      
      // UI 갱신을 위해 알림
      this.onLog({ 
        type: 'shield_update', 
        author: '실드', 
        text: String(this.shieldCount)
      });
    }
  }

  handleFundingCommand(parts, isManager) {
    const options = this.fundingOptions || { 
      showPercent: true, 
      showDday: true, 
      customCmd: "!펀딩",
      customHeader: "🪙 진행중인 {month}월 펀딩 🪙",
      customFormat: "{index}. {title}\\n💰{current}/{goal} [{percent} {dday}]" 
    };

    // !펀딩 (목록 조회)
    if (parts.length === 1) {
      if (!this.fundings || this.fundings.length === 0) {
        this.sendSplitChat('현재 진행 중인 펀딩이 없습니다.', '💰펀딩');
        return;
      }

      const now = new Date();
      const month = now.getMonth() + 1;
      const today = new Date().setHours(0,0,0,0);
      
      // 커스텀 헤더 적용
      let msg = (options.customHeader || "🪙 진행중인 {month}월 펀딩 🪙")
        .replace(/{month}/g, month)
        .replace(/\\n/g, "\n") + "\n";

      this.fundings.forEach((f, i) => {
        const percent = Math.min(100, Math.floor((f.current / f.goal) * 100)) || 0;
        
        let ddayText = 'D-Day';
        if (f.endDate) {
          const diff = new Date(f.endDate) - today;
          const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
          ddayText = days === 0 ? 'D-Day' : (days > 0 ? `D-${days}` : `종료`);
        }

        // 커스텀 포맷 적용
        let format = options.customFormat || "{index}. {title}\\n💰{current}/{goal} [{percent} {dday}]";
        let itemMsg = format
          .replace(/{index}/g, i + 1)
          .replace(/{title}/g, f.title)
          .replace(/{current}/g, f.current.toLocaleString())
          .replace(/{goal}/g, f.goal.toLocaleString())
          .replace(/{percent}/g, options.showPercent ? `${percent}%` : "")
          .replace(/{dday}/g, options.showDday ? ddayText : "")
          .replace(/\\n/g, "\n");

        msg += itemMsg + "\n";
      });

      this.sendSplitChat(msg.trim(), '💰펀딩');
      return;
    }

    // !펀딩 [번호] [금액] (적립/차감 - DJ/매니저 전용)
    if (parts.length >= 3) {
      // isManager가 falsy이면 권한 없음 (null, undefined, false, 0 모두 차단)
      if (!isManager) {
        this.onLog({ type: 'debug', author: '디버그', text: `권한 없음: isManager=${isManager}` });
        return;
      }

      const idx = parseInt(parts[1]) - 1;
      const amt = parseInt(parts[2]);

      if (isNaN(idx) || isNaN(amt) || !this.fundings[idx]) {
        this.onLog({ type: 'debug', author: '디버그', text: `파싱 실패 또는 펀딩 없음: idx=${idx}, amt=${amt}` });
        this.sendSplitChat('사용법: !펀딩 [번호] [숫자] (음수 입력 시 차감)', '💰펀딩');
        return;
      }

      this.fundings[idx].current += amt;
      const f = this.fundings[idx];
      const percent = Math.min(100, Math.floor((f.current / f.goal) * 100)) || 0;
      
      // 적립/차감 여부에 따라 메시지 분기
      const action = amt >= 0 ? `${amt.toLocaleString()} 적립` : `${Math.abs(amt).toLocaleString()} 차감`;
      const icon = amt >= 0 ? '✅' : '🔻';
      this.sendSplitChat(`${icon} ${f.title} ${action} 완료!\n현재: ${f.current.toLocaleString()} / ${f.goal.toLocaleString()} (${percent}%)`, '💰펀딩');
      
      // UI 갱신을 위해 메인 프로세스로 알림 (IPC를 통해 bot.html로 전달)
      this.onLog({ 
        type: 'funding_update', 
        author: '펀딩', 
        text: JSON.stringify({ index: idx, current: f.current }) 
      });
    }
  }

  handleLeave(nickname, tag) {
    const userKey = tag || nickname;
    if (this.enteredUsers.has(userKey)) {
      this.enteredUsers.delete(userKey);
    }
  }

  handleSongCommand(parts, isManager, author) {
    const cmd = parts[0].toLowerCase();
    const songCmd = (this.songSettings?.customCmd || '!신청곡').toLowerCase();
    const songDelCmd = (this.songSettings?.delCmd || '!제거').toLowerCase();
    const songStopCmd = (this.songSettings?.stopCmd || '!마감').toLowerCase();
    const songStartCmd = (this.songSettings?.startCmd || '!접수').toLowerCase();
    const songResetCmd = (this.songSettings?.resetCmd || '리셋').toLowerCase();
    const isResetCmd = songResetCmd.startsWith('!') ? cmd === songResetCmd : cmd === '!' + songResetCmd;

    // 0. !리셋 (단독 명령어 처리, 매니저 전용)
    if (isResetCmd) {
      if (!isManager) return;
      this.songList = [];
      this.sendSplitChat('✅ 신청곡 목록이 초기화되었습니다.', '🎵신청곡');
      this.onLog({ type: 'song_update', author: '시스템', text: JSON.stringify({ action: 'clear' }) });
      return;
    }

    // 1. !마감 (매니저 전용)
    if (cmd === songStopCmd) {
      if (!isManager) return;
      this.songSettings.enabled = false;
      this.sendSplitChat('🚫 신청곡 접수가 마감되었습니다.', '🎵신청곡');
      this.onLog({ type: 'song_update', author: '시스템', text: JSON.stringify({ action: 'status', enabled: false }) });
      return;
    }

    // 2. !접수 (매니저 전용)
    if (cmd === songStartCmd) {
      if (!isManager) return;
      this.songSettings.enabled = true;
      this.sendSplitChat('🟢 신청곡 접수가 시작되었습니다.', '🎵신청곡');
      this.onLog({ type: 'song_update', author: '시스템', text: JSON.stringify({ action: 'status', enabled: true }) });
      return;
    }

    // 3. !제거 [번호...] (매니저 전용)
    if (cmd === songDelCmd) {
      if (!isManager) return;
      if (parts.length < 2) {
        this.sendSplitChat(`사용법: ${songDelCmd} [번호1] [번호2] ...`, '🎵신청곡');
        return;
      }

      const indices = parts.slice(1)
        .map(p => parseInt(p) - 1)
        .filter(idx => !isNaN(idx) && idx >= 0 && idx < this.songList.length);

      if (indices.length === 0) return;

      const uniqueIndices = [...new Set(indices)].sort((a, b) => b - a);
      uniqueIndices.forEach(idx => {
        this.songList.splice(idx, 1);
      });

      this.sendSplitChat(`✅ 신청곡 ${uniqueIndices.length}개를 제거했습니다.`, '🎵신청곡');
      this.onLog({ type: 'song_update', author: '시스템', text: JSON.stringify({ action: 'remove', indices: uniqueIndices }) });
      return;
    }

    // 4. !신청곡 관련
    if (cmd === songCmd) {
      // 4.1 !신청곡 단독 입력 시 리스트 출력
      if (parts.length === 1) {
        if (this.songList.length === 0) {
          this.sendSplitChat('현재 대기 중인 신청곡이 없습니다.', '🎵신청곡');
          return;
        }
        let msg = (this.songSettings?.listHeader || '🎵 현재 신청곡 목록 🎵') + '\n';
        const format = this.songSettings?.listFormat || '{index}. {artist} - {title}';
        this.songList.forEach((s, i) => {
          msg += format
            .replace(/{index}/g, i + 1)
            .replace(/{artist}/g, s.artist)
            .replace(/{title}/g, s.title) + '\n';
        });
        this.sendSplitChat(msg.trim(), '🎵신청곡');
        return;
      }

      const sub = parts[1]?.toLowerCase();

      // 4.2 리셋 (서브 명령어 처리, 매니저 전용)
      if (sub === songResetCmd.replace('!', '')) {
        if (!isManager) return;
        this.songList = [];
        this.sendSplitChat('✅ 신청곡 목록이 초기화되었습니다.', '🎵신청곡');
        this.onLog({ type: 'song_update', author: '시스템', text: JSON.stringify({ action: 'clear' }) });
        return;
      }

      // 4.3 곡 신청
      if (!this.songSettings.enabled) {
        this.sendSplitChat('🚫 현재는 신청곡을 받지 않는 시간입니다.', '🎵신청곡');
        return;
      }

      let artist = parts[1];
      let title = parts.slice(2).join(' ');
      if (!title) {
        title = artist;
        artist = '알수없음';
      }

      const newSong = { artist, title, user: author };
      const regFormat = this.songSettings?.regFormat || '✅ [{artist} - {title}] 신청 완료! (대기: {count}번)';
      
      if (this.songSettings.priority) {
        this.songList.unshift(newSong);
        let res = regFormat
          .replace(/{artist}/g, artist)
          .replace(/{title}/g, title)
          .replace(/{count}/g, '1');
        this.sendSplitChat(res + ' (우선순위 추가)', '🎵신청곡');
      } else {
        this.songList.push(newSong);
        let res = regFormat
          .replace(/{artist}/g, artist)
          .replace(/{title}/g, title)
          .replace(/{count}/g, this.songList.length);
        this.sendSplitChat(res, '🎵신청곡');
      }
      
      this.onLog({ type: 'song_update', author: '시스템', text: JSON.stringify({ action: this.songSettings.priority ? 'unshift' : 'add', song: newSong }) });
    }
  }

  // 메시지 분할 전송 로직
  sendSplitChat(text, typeLabel) {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    if (lines.length === 0) return;

    const chunks = [];
    let currentChunk = "";

    for (let line of lines) {
      if (line.length > this.maxLen) {
        if (currentChunk) {
          chunks.push(currentChunk);
          currentChunk = "";
        }
        for (let i = 0; i < line.length; i += this.maxLen) {
          chunks.push(line.substring(i, i + this.maxLen));
        }
        continue;
      }

      const nextPotentialChunk = currentChunk ? currentChunk + "\n" + line : line;
      if (nextPotentialChunk.length > this.maxLen) {
        chunks.push(currentChunk);
        currentChunk = line;
      } else {
        currentChunk = nextPotentialChunk;
      }
    }

    if (currentChunk) chunks.push(currentChunk);

    chunks.forEach((chunk, index) => {
      setTimeout(() => {
        this.onSendChat(chunk);
        this.onLog({ type: 'bot', author: typeLabel, text: chunk });
      }, index * this.sendInterval);
    });
  }

  resolveVars(tpl, user, count, streamName) {
    const t = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    return tpl
      .replace(/{유저}/g, user)
      .replace(/{시간}/g, t)
      .replace(/{횟수}/g, String(this.shieldCount)) // {횟수} 변수를 실드 개수로 매핑 (기존 요청 호환)
      .replace(/{실드}/g, String(this.shieldCount))
      .replace(/{스트림}/g, streamName || '');
  }

  stop() {
    this.isRunning = false;
    this.repeatTimers.forEach(timer => clearInterval(timer));
    this.repeatTimers = [];
  }

  // ══════════════════════════════════════════
  //  ⭐ 애청지수 메서드
  // ══════════════════════════════════════════

  _actKey(author, tag) {
    return tag || author;
  }

  // tag → author → nickname 순서로 actData에서 key 탐색
  _findActKey(author, tag) {
    if (tag && this.actData[tag]) return tag;
    if (this.actData[author]) return author;
    const found = Object.keys(this.actData).find(k => this.actData[k].nickname === author);
    return found || null;
  }

  _actGetLevel(exp) {
    const base = Number(this.actSettings.lvBase) || 100;
    const exponent = Number(this.actSettings.lvExp) || 1.3;
    const max = Number(this.actSettings.lvMax) || 100;
    let lv = 1, cumExp = 0;
    while (lv < max) {
      const needed = Math.floor(base * Math.pow(lv, exponent));
      if (exp < cumExp + needed) return { level: lv, curExp: exp - cumExp, nextExp: needed };
      cumExp += needed;
      lv++;
    }
    return { level: max, curExp: 0, nextExp: 0 };
  }

  _actRank(key) {
    const entries = Object.entries(this.actData).sort((a, b) => (b[1].exp||0) - (a[1].exp||0));
    const idx = entries.findIndex(([k]) => k === key);
    return idx >= 0 ? idx + 1 : 0;
  }

  _actFormat(tpl, data) {
    const v = (val) => (val === undefined || val === null || val === '') ? '0' : String(val);
    return tpl
      .replace(/{nickname}/g, data.nickname || '')
      .replace(/{tag}/g, data.tag || '')
      .replace(/{rank}/g, v(data.rank))
      .replace(/{level}/g, v(data.level))
      .replace(/{exp}/g, v(data.exp))
      .replace(/{nextExp}/g, v(data.nextExp))
      .replace(/{heart}/g, v(data.heart))
      .replace(/{chat}/g, v(data.chat))
      .replace(/{attend}/g, v(data.attend))
      .replace(/{lp}/g, v(data.lp))
      .replace(/{lpMax}/g, v(data.lpMax))
      .replace(/{lotto}/g, v(data.lotto))
      .replace(/{count}/g, v(data.count))
      .replace(/{totalExp}/g, v(data.totalExp))
      .replace(/{winNums}/g, data.winNums || '')
      .replace(/{myNums}/g, data.myNums || '');
  }

  _actSave() {
    this.onActivityWrite(this.actData);
  }

  // !내정보 생성
  handleActCreate(author, tag) {
    const key = this._actKey(author, tag);
    if (this.actData[key]) {
      this.sendSplitChat(`⚠️ ${author}님은 이미 애청지수 정보가 있습니다.`, '⭐애청');
      return;
    }
    this.actData[key] = { nickname: author, heart: 0, chat: 0, attend: 0, lp: 0, lotto: 0, exp: 0, lastAttend: '' };
    this._actSave();
    const msg = this._actFormat(
      this.actSettings.msgCreate || '✅ {nickname}님의 애청지수 정보가 생성되었습니다!',
      { nickname: author, tag: key }
    );
    this.sendSplitChat(msg, '⭐애청');
  }

  // !내정보 삭제
  handleActDelete(author, tag) {
    const key = this._findActKey(author, tag);
    if (!key) {
      this.sendSplitChat(`⚠️ ${author}님의 정보가 없습니다.`, '⭐애청');
      return;
    }
    delete this.actData[key];
    this._actSave();
    const msg = this._actFormat(
      this.actSettings.msgDeleteOk || '🗑️ {nickname}님의 애청지수 정보가 삭제되었습니다.',
      { nickname: author, tag: key }
    );
    this.sendSplitChat(msg, '⭐애청');
  }

  // !내정보
  handleActMyInfo(author, tag) {
    const key = this._findActKey(author, tag);
    if (!key) {
      this.sendSplitChat(`⚠️ ${author}님은 정보가 없습니다. '!내정보 생성' 으로 등록하세요.`, '⭐애청');
      return;
    }
    const d = this.actData[key];
    const { level, curExp, nextExp } = this._actGetLevel(d.exp || 0);
    const rank = this._actRank(key);
    const lpMax = Number(this.actSettings.lottoExchange) || 22;
    const tpl = this.actSettings.msgMyInfo ||
      "[ '{nickname}'님 활동정보 ]\n순위 : {rank}위\n레벨 : {level} ({exp}/{nextExp})\n하트 : {heart}\n채팅 : {chat}\n출석 : {attend}\n복권포인트 : {lp}/{lpMax}\n복권 : {lotto}";
    const msg = this._actFormat(tpl, {
      nickname: d.nickname || author, tag: key,
      rank, level, exp: curExp, nextExp,
      heart: d.heart || 0, chat: d.chat || 0, attend: d.attend || 0,
      lp: d.lp || 0, lpMax, lotto: d.lotto || 0
    });
    this.sendSplitChat(msg, '⭐애청');
  }

  // !랭킹
  handleActRank() {
    const sorted = Object.entries(this.actData)
      .sort((a, b) => (b[1].exp||0) - (a[1].exp||0))
      .slice(0, 5);
    if (sorted.length === 0) {
      this.sendSplitChat('📊 아직 애청지수 데이터가 없습니다.', '⭐애청');
      return;
    }
    const header = this.actSettings.msgRankHeader || '🏆 애청지수 TOP 5 🏆';
    const lineTpl = this.actSettings.msgRankLine || '{rank}위: {nickname} (Lv.{level})';
    let msg = header + '\n';
    sorted.forEach(([key, d], i) => {
      const { level } = this._actGetLevel(d.exp || 0);
      msg += this._actFormat(lineTpl, {
        rank: i + 1, nickname: d.nickname || key, level, exp: d.exp || 0
      }) + '\n';
    });
    this.sendSplitChat(msg.trim(), '⭐애청');
  }

  // !복권
  handleActLotto(author, tag, args) {
    const key = this._findActKey(author, tag);
    if (!key) {
      this.sendSplitChat(`⚠️ ${author}님은 정보가 없습니다. '!내정보 생성' 으로 등록하세요.`, '⭐애청');
      return;
    }
    const d = this.actData[key];

    const s = this.actSettings;
    const exp1st   = Number(s.lotto1st)   || 3000;
    const exp2nd   = Number(s.lotto2nd)   || 500;
    const exp3rd   = Number(s.lotto3rd)   || 100;
    const expFail  = Number(s.lottoFail)  || 1;

    // 지정 복권: !복권 1 2 8 (숫자 3개)
    const nums = args.map(a => parseInt(a)).filter(n => !isNaN(n) && n >= 1 && n <= 9);
    if (nums.length === 3) {
      // 지정 복권 1장 사용
      if ((d.lotto || 0) < 1) {
        this.sendSplitChat(`⚠️ ${author}님의 복권이 없습니다.`, '⭐애청');
        return;
      }
      d.lotto -= 1;
      const winNums = [1,2,3,4,5,6,7,8,9].sort(() => Math.random() - 0.5).slice(0, 3).sort((a,b)=>a-b);
      const myNums = nums.slice().sort((a,b)=>a-b);
      const matches = myNums.filter(n => winNums.includes(n)).length;
      let gainExp = expFail, grade = '💀 꽝(0개)';
      if (matches === 3) { gainExp = exp1st; grade = '🥇 1등(3개)'; }
      else if (matches === 2) { gainExp = exp2nd; grade = '🥈 2등(2개)'; }
      else if (matches === 1) { gainExp = exp3rd; grade = '🥉 3등(1개)'; }
      d.exp = (d.exp || 0) + gainExp;
      this._actSave();

      const headerTpl = s.msgLottoHeader || '🎰 {nickname}님의 복권 {count}개 지정 결과';
      const winTpl    = s.msgLottoWin    || '🎊당첨번호:{winNums}';
      const myTpl     = s.msgLottoMy     || '✨나의번호:{myNums}';
      const totalTpl  = s.msgLottoTotal  || '🎁 총 획득 경험치: +{totalExp} EXP';
      const msg =
        this._actFormat(headerTpl, { nickname: d.nickname||author, count: 1 }) + '\n' +
        this._actFormat(winTpl, { winNums: winNums.join(',') }) + '\n' +
        this._actFormat(myTpl,  { myNums: myNums.join(',') }) + '\n' +
        '━━━━━━━━━━━━━━\n' +
        `🥇 1등(3개): ${matches===3?1:0}회 (+${exp1st} EXP)\n` +
        `🥈 2등(2개): ${matches===2?1:0}회 (+${exp2nd} EXP)\n` +
        `🥉 3등(1개): ${matches===1?1:0}회 (+${exp3rd} EXP)\n` +
        `💀 꽝(0개): ${matches===0?1:0}회 (+${expFail} EXP)\n` +
        '━━━━━━━━━━━━━━\n' +
        this._actFormat(totalTpl, { totalExp: gainExp });
      this.sendSplitChat(msg, '⭐복권');
      return;
    }

    // 자동 복권: !복권 or !복권 20
    const count = args.length > 0 && !isNaN(parseInt(args[0])) ? parseInt(args[0]) : (d.lotto || 0);
    if (count <= 0 || (d.lotto || 0) <= 0) {
      this.sendSplitChat(`⚠️ ${author}님의 복권이 없습니다.`, '⭐애청');
      return;
    }
    const useCount = Math.min(count, d.lotto || 0);
    d.lotto -= useCount;

    let cnt1=0, cnt2=0, cnt3=0, cntFail=0;
    for (let i = 0; i < useCount; i++) {
      const win = [1,2,3,4,5,6,7,8,9].sort(()=>Math.random()-0.5).slice(0,3);
      const my  = [1,2,3,4,5,6,7,8,9].sort(()=>Math.random()-0.5).slice(0,3);
      const m = my.filter(n => win.includes(n)).length;
      if (m===3) cnt1++; else if (m===2) cnt2++; else if (m===1) cnt3++; else cntFail++;
    }
    const totalExp = cnt1*exp1st + cnt2*exp2nd + cnt3*exp3rd + cntFail*expFail;
    d.exp = (d.exp || 0) + totalExp;
    this._actSave();

    const headerTpl = s.msgLottoAutoHeader || '🎰 {nickname}님의 복권 {count}개 자동 결과';
    const totalTpl  = s.msgLottoTotal      || '🎁 총 획득 경험치: +{totalExp} EXP';
    const msg =
      this._actFormat(headerTpl, { nickname: d.nickname||author, count: useCount }) + '\n' +
      '━━━━━━━━━━━━━━\n' +
      `🥇 1등(3개): ${cnt1}회 (+${exp1st} EXP)\n` +
      `🥈 2등(2개): ${cnt2}회 (+${exp2nd} EXP)\n` +
      `🥉 3등(1개): ${cnt3}회 (+${exp3rd} EXP)\n` +
      `💀 꽝(0개): ${cntFail}회 (+${expFail} EXP)\n` +
      '━━━━━━━━━━━━━━\n' +
      this._actFormat(totalTpl, { totalExp });
    this.sendSplitChat(msg, '⭐복권');
  }

  // !복권지급 전체 [수량]
  handleActLottoGiveAll(amountStr) {
    const amount = parseInt(amountStr);
    if (isNaN(amount) || amount <= 0) {
      this.sendSplitChat(`⚠️ 사용법: !복권지급 전체 [수량]`, '⭐애청');
      return;
    }
    let count = 0;
    for (const key in this.actData) {
      this.actData[key].lotto = (this.actData[key].lotto || 0) + amount;
      count++;
    }
    if (count > 0) {
      this._actSave();
      this.sendSplitChat(`🎁 등록된 모든 유저(${count}명)에게 복권 ${amount}장이 지급되었습니다.`, '⭐복권');
    } else {
      this.sendSplitChat(`⚠️ 등록된 유저가 없습니다.`, '⭐애청');
    }
  }

  // !복권지급 [고유닉] [수량]
  handleActLottoGive(targetTag, amountStr) {
    const amount = parseInt(amountStr);
    if (!targetTag || isNaN(amount) || amount <= 0) {
      this.sendSplitChat(`⚠️ 사용법: !복권지급 [고유닉] [수량]`, '⭐애청');
      return;
    }
    const d = this.actData[targetTag];
    if (!d) {
      this.sendSplitChat(`⚠️ '${targetTag}' 유저의 정보가 없습니다.`, '⭐애청');
      return;
    }
    d.lotto = (d.lotto || 0) + amount;
    this._actSave();
    this.sendSplitChat(`🎁 ${d.nickname || targetTag}님에게 복권 ${amount}장이 지급되었습니다. (현재: ${d.lotto}장)`, '⭐복권');
  }

  // !상점 [고유닉] [경험치]
  handleActShopExp(targetTag, expStr) {
    const expAmount = parseInt(expStr);
    if (!targetTag || isNaN(expAmount)) {
      this.sendSplitChat(`⚠️ 사용법: !상점 [고유닉] [경험치]`, '⭐애청');
      return;
    }
    const d = this.actData[targetTag];
    if (!d) {
      this.sendSplitChat(`⚠️ '${targetTag}' 유저의 정보가 없습니다.`, '⭐애청');
      return;
    }
    d.exp = (d.exp || 0) + expAmount;
    this._actSave();
    const action = expAmount >= 0 ? '지급' : '차감';
    this.sendSplitChat(`🛍️ ${d.nickname || targetTag}님의 경험치가 ${Math.abs(expAmount)}만큼 ${action}되었습니다. (현재: ${d.exp} EXP)`, '⭐상점');
  }

  // @[고유닉] - DJ/매니저 전용 타인 정보 조회
  handleActViewOther(targetTag) {
    const d = this.actData[targetTag];
    if (!d) {
      this.sendSplitChat(`⚠️ '${targetTag}' 유저의 정보가 없습니다.`, '⭐애청');
      return;
    }
    const { level, curExp, nextExp } = this._actGetLevel(d.exp || 0);
    const rank = this._actRank(targetTag);
    const lpMax = Number(this.actSettings.lottoExchange) || 22;
    const tpl = this.actSettings.msgMyInfo ||
      "[ '{nickname}'님 활동정보 ]\n순위 : {rank}위\n레벨 : {level} ({exp}/{nextExp})\n하트 : {heart}\n채팅 : {chat}\n출석 : {attend}\n복권포인트 : {lp}/{lpMax}\n복권 : {lotto}";
    const msg = this._actFormat(tpl, {
      nickname: d.nickname || targetTag, tag: targetTag,
      rank, level, exp: curExp, nextExp,
      heart: d.heart||0, chat: d.chat||0, attend: d.attend||0,
      lp: d.lp||0, lpMax, lotto: d.lotto||0
    });
    this.sendSplitChat(msg, '⭐애청');
  }

  // 하트 수신 시 외부에서 호출
  handleActHeart(author, tag) {
    // 1) tag로 먼저 찾기
    let key = tag || author;
    if (!this.actData[key]) {
      // 2) author(닉네임)로 찾기
      if (this.actData[author]) {
        key = author;
      } else {
        // 3) actData 전체에서 nickname이 일치하는 유저 찾기
        const found = Object.keys(this.actData).find(k => this.actData[k].nickname === author);
        if (found) key = found;
        else return; // 등록된 유저 없음
      }
    }
    this.actData[key].nickname = author;
    this.actData[key].heart = (this.actData[key].heart || 0) + 1;
    this.actData[key].exp   = (this.actData[key].exp   || 0) + (Number(this.actSettings.scoreHeart) || 1);
    this._actSave();
  }

  // 채팅 수신 시 외부에서 호출
  handleActChat(author, tag) {
    let key = tag || author;
    if (!this.actData[key]) {
      if (this.actData[author]) {
        key = author;
      } else {
        const found = Object.keys(this.actData).find(k => this.actData[k].nickname === author);
        if (found) key = found;
        else return;
      }
    }
    this.actData[key].nickname = author;
    this.actData[key].chat = (this.actData[key].chat || 0) + 1;
    this.actData[key].exp  = (this.actData[key].exp  || 0) + (Number(this.actSettings.scoreChat) || 2);
    this._actSave();
  }

  // 출석 자동 처리 (입장 시 자동 호출, 30분마다 1회, 채팅 출력 없음)
  handleActAttend(author, tag) {
    const key = this._findActKey(author, tag);
    if (!key) return; // 미등록 유저는 조용히 무시
    const now = Date.now();
    const lastAttend = this.actData[key].lastAttendTime || 0;
    const interval = 30 * 60 * 1000; // 30분
    if (now - lastAttend < interval) return; // 아직 30분 안 됨, 조용히 무시
    this.actData[key].lastAttendTime = now;
    this.actData[key].attend = (this.actData[key].attend || 0) + 1;
    this.actData[key].exp    = (this.actData[key].exp    || 0) + (Number(this.actSettings.scoreAttend) || 10);
    this._actSave();
  }

  // 복권포인트 적립 (스푼 선물 1개당 1포인트, exchange 도달시 복권 1장 지급 + 채팅 알림)
  handleActLottoPoint(author, tag, amount) {
    let key = tag || author;
    if (!this.actData[key]) {
      if (this.actData[author]) key = author;
      else {
        const found = Object.keys(this.actData).find(k => this.actData[k].nickname === author);
        if (found) key = found;
        else return;
      }
    }
    const exchange = Number(this.actSettings.lottoExchange) || 22;
    this.actData[key].lp = (this.actData[key].lp || 0) + amount;
    let gained = 0;
    while (this.actData[key].lp >= exchange) {
      this.actData[key].lp -= exchange;
      this.actData[key].lotto = (this.actData[key].lotto || 0) + 1;
      gained++;
    }
    if (gained > 0) {
      const nick = this.actData[key].nickname || author;
      this.sendSplitChat(
        `🎟️ ${nick}님 복권 ${gained}장 지급! (보유: ${this.actData[key].lotto}장 | 포인트: ${this.actData[key].lp}/${exchange})`,
        '⭐복권'
      );
    }
    this._actSave();
  }
}

module.exports = BotEngine;