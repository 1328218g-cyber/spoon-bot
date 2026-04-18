const WebSocket = require('ws');
const https = require('https');

class SpoonClient {
  constructor(options = {}) {
    this.ua = options.ua || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
    this.wsBase = 'wss://kr-wala.spooncast.net/ws';
    this.ws = null;
    this.onLog = options.onLog || (() => {});
    this.onConnected = options.onConnected || (() => {});
    this.onDisconnected = options.onDisconnected || (() => {});
    this.onMessage = options.onMessage || (() => {});
    
    // 유저 정보 캐시 (API 호출 최소화)
    this.userCache = new Map();
    this.nickCache = new Map();
  }

  // 제공해주신 방송 정보 데이터 구조(live_id, stream_name 등) 반영
  async fetchStreamName(liveId, accessToken) {
    if (!liveId || !accessToken) return null;
    const rawToken = accessToken.replace('Bearer ', '');
    
    return new Promise((resolve) => {
      const options = {
        hostname: 'api.spooncast.net',
        path: `/lives/${liveId}/`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${rawToken}`,
          'User-Agent': this.ua,
          'Origin': 'https://www.spooncast.net',
        },
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const results = json.results || [];
            const live = results[0] || json;
            
            // 제공해주신 데이터 구조 반영
            const liveData = {
                "live_id":            live.id || live.live_id || String(liveId),
                "title":              live.title || "",
                "live_img_url":       live.img_url || live.image || "",
                "member_count":       live.member_count || 0,
                "like_count":         live.like_count || 0,
                "total_spoon_count":  live.total_spoon_count || 0,
                "room_token":         "",
                "ws_url":             "",
                "stream_name":        live.stream_name || live.live_id || String(liveId),
                "engine_name":        live.engine_name || "sori",
                "created":            live.created || "",
                "close_air_time":     live.close_air_time || "",
                "total_member_count": live.total_member_count || 0,
                "manager_ids":        live.manager_ids || [],
                "dj_user_id":         live.user_id || (live.author && live.author.id) || 0,
                "author":             live.author || live.user || null,
            };
            
            // 핵심 식별자인 stream_name 반환
            resolve(liveData);
          } catch (e) { resolve(null); }
        });
      });
      req.on('error', () => resolve(null));
      req.end();
    });
  }

  // 고유닉 기반 방송 정보 조회
  async fetchLiveByTag(tag, accessToken) {
    if (!tag || !accessToken) return null;
    const rawToken = accessToken.replace('Bearer ', '');
    const cleanTag = tag.replace('@', '').trim();
    
    return new Promise((resolve) => {
      const options = {
        hostname: 'kr-api.spooncast.net',
        path: `/lives/@${cleanTag}/`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${rawToken}`,
          'User-Agent': this.ua,
          'Origin': 'https://www.spooncast.net',
        },
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const results = json.results || [];
            const live = results[0] || json;
            if (!live || !live.id) return resolve(null);
            
            const liveData = {
                "live_id":            String(live.id),
                "title":              live.title || "",
                "stream_name":        live.stream_name || cleanTag,
                "room_token":         "",
                "ws_url":             "",
                "dj_user_id":         live.user_id || (live.author && live.author.id) || 0,
                "author":             live.author || live.user || null,
            };
            resolve(liveData);
          } catch (e) { resolve(null); }
        });
      });
      req.on('error', () => resolve(null));
      req.end();
    });
  }

  // 랭킹 데이터 조회 (월간)
  async fetchMonthlyRank(type, accessToken, maxCount = 600) {
    if (!accessToken) return [];
    const rawToken = accessToken.replace('Bearer ', '');
    const baseUrl = 'kr-api.spooncast.net';
    const pathMap = {
      next_choice: '/ranks/v2/dj/live/?sub-type=monthly',
      free_like: '/ranks/v2/dj/live-free-like/?sub-type=monthly',
      live_time: '/ranks/v2/dj/live-time/?sub-type=monthly'
    };
    
    let address = pathMap[type];
    if (!address) return [];
    
    let list = [];
    
    const fetchPage = (url) => {
      return new Promise((resolve) => {
        const options = {
          hostname: baseUrl,
          path: url,
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${rawToken}`,
            'User-Agent': this.ua,
            'Origin': 'https://www.spooncast.net',
          },
        };
        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', (c) => { data += c; });
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              resolve(json);
            } catch (e) { resolve(null); }
          });
        });
        req.on('error', () => resolve(null));
        req.end();
      });
    };

    try {
      while (list.length < maxCount && address) {
        const res = await fetchPage(address);
        if (!res || !res.results) break;
        list = list.concat(res.results);
        address = res.next ? res.next.replace('https://' + baseUrl, '') : null;
      }
      return list;
    } catch (error) {
      return list;
    }
  }

  // 유저 정보(태그 및 닉네임) 조회 로직 강화
  async fetchUserProfile(liveId, userId, accessToken) {
    if (!userId) return null;

    // 캐시 확인 (imgUrl 포함)
    if (this.userCache.has(userId) && this.nickCache.has(userId)) {
      return {
        tag: this.userCache.get(userId),
        nickname: this.nickCache.get(userId),
        imgUrl: (this.imgCache || new Map()).get(userId) || null
      };
    }

    if (!liveId || !accessToken) return null;
    const rawToken = accessToken.replace('Bearer ', '');
    
    return new Promise((resolve) => {
      const options = {
        hostname: 'kr-api.spooncast.net',
        path: `/lives/${liveId}/member/${userId}/profile/`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${rawToken}`,
          'User-Agent': this.ua,
          'Origin': 'https://www.spooncast.net',
        },
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const profile = (json.results && json.results[0]) || json;
            
            let tag = profile.tag || profile.tag_name || profile.username || profile.id_name || null;
            let nickname = profile.nickname || profile.name || profile.display_name || null;
            let imgUrl = profile.profile_img_url || profile.img_url || profile.thumbnail_url
                      || profile.photo_url || profile.avatar_url || profile.image_url || null;
            
            if (tag) tag = tag.replace('@', '').trim();
            
            if (tag) this.userCache.set(userId, tag);
            if (nickname) this.nickCache.set(userId, nickname);
            if (imgUrl) this.imgCache = this.imgCache || new Map(), this.imgCache.set(userId, imgUrl);
            
            resolve({ tag, nickname, imgUrl });
          } catch (e) { 
            resolve(null); 
          }
        });
      });
      req.on('error', () => resolve(null));
      req.end();
    });
  }

  async fetchUserTag(liveId, userId, accessToken) {
    const profile = await this.fetchUserProfile(liveId, userId, accessToken);
    return profile ? profile.tag : null;
  }

  async fetchUserImgUrl(userId, accessToken) {
    if (!userId) return null;
    if (this.imgCache && this.imgCache.has(userId)) return this.imgCache.get(userId);
    const rawToken = accessToken.replace('Bearer ', '');
    return new Promise((resolve) => {
      const options = {
        hostname: 'kr-api.spooncast.net',
        path: `/users/${userId}/`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${rawToken}`,
          'User-Agent': this.ua,
          'Origin': 'https://www.spooncast.net',
        },
      };
      const req = require('https').request(options, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const user = (json.results && json.results[0]) || json;
            const imgUrl = user.profile_img_url || user.img_url || user.thumbnail_url || null;
            if (!this.imgCache) this.imgCache = new Map();
            if (imgUrl) this.imgCache.set(userId, imgUrl);
            resolve(imgUrl);
          } catch { resolve(null); }
        });
      });
      req.on('error', () => resolve(null));
      req.end();
    });
  }

  async fetchUserNickname(liveId, userId, accessToken) {
    const profile = await this.fetchUserProfile(liveId, userId, accessToken);
    return profile ? profile.nickname : null;
  }

  async fetchMyProfile(accessToken) {
    if (!accessToken) return null;
    const rawToken = accessToken.replace('Bearer ', '');
    
    return new Promise((resolve) => {
      const options = {
        hostname: 'kr-api.spooncast.net',
        path: '/users/me/',
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${rawToken}`,
          'User-Agent': this.ua,
          'Origin': 'https://www.spooncast.net',
        },
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const profile = json.results[0] || json;
            resolve(profile);
          } catch (e) { resolve(null); }
        });
      });
      req.on('error', () => resolve(null));
      req.end();
    });
  }

  connect(channelId, accessToken, roomToken) {
    if (this.ws) this.disconnect();

    const rawToken = accessToken.replace('Bearer ', '');
    const wsUrl = `${this.wsBase}?token=${rawToken}`;

    this.ws = new WebSocket(wsUrl, {
      headers: {
        'Origin': 'https://www.spooncast.net',
        'User-Agent': this.ua,
      }
    });

    this.ws.on('open', () => {
      this.ws.send(JSON.stringify({
        command: 'ACTIVATE_CHANNEL',
        payload: { channelId, liveToken: roomToken },
      }));
      
      setTimeout(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.onConnected(channelId);
        }
      }, 1500);
    });

    this.ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw);
        if (msg.command !== 'MESSAGE') return;
        const body = JSON.parse(msg.payload.body);
        
        if (body.eventName === 'ActivateChannel') {
          this.onConnected(channelId);
        }

        // [전수 로그 모드] 모든 수신 이벤트를 로그로 남김
        if (body.eventName) {
           // LiveRank, LiveMetaUpdate 이벤트 로그 숨김 처리
           const hiddenEvents = ['LiveRank', 'LiveMetaUpdate'];
           if (!hiddenEvents.includes(body.eventName)) {
             const eventDetail = JSON.stringify(body).slice(0, 200); // 너무 길면 자름
             this.onLog({ 
               type: 'debug', 
               author: 'RAW_EVT', 
               text: `[${body.eventName}] ${eventDetail}` 
             });
           }
        }
        
        this.onMessage(body);
      } catch (e) {}
    });

    this.ws.on('close', () => {
      this.ws = null;
      this.onDisconnected();
    });

    this.ws.on('error', (err) => {
      this.onLog({ type: 'error', author: '오류', text: err.message });
    });
  }

  disconnect() {
    if (this.ws) {
      this.ws.terminate();
      this.ws = null;
    }
    this.userCache.clear();
  }

  async sendChat(channelId, text, accessToken, roomToken) {
    if (!channelId || !text) return;

    const rawAccess = accessToken.replace('Bearer ', '');
    const rawRoom = roomToken.replace('Bearer ', '');
    const body = JSON.stringify({ message: text, messageType: 'GENERAL_MESSAGE' });

    return new Promise((resolve) => {
      const options = {
        hostname: 'kr-gw.spooncast.net',
        path: `/lives/${channelId}/chat/message`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'Authorization': `Bearer ${rawAccess}`,
          'x-live-authorization': `Bearer ${rawRoom}`,
          'User-Agent': this.ua,
          'Origin': 'https://www.spooncast.net',
        },
      };

      const req = https.request(options, (res) => {
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.write(body);
      req.end();
    });
  }
}

module.exports = SpoonClient;
