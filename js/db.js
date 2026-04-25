var _sb = null;
function sb() {
  if (!_sb) _sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return _sb;
}

var CATEGORIES = ['All','Games','Music','Sport','Auto','Travel','Food','Tech','Comedy','Education','News','Other'];

var DB = {
  getVideos: async function(search, category) {
    var q = sb().from('videos').select('*').order('created_at', {ascending:false});
    if (search) q = q.ilike('title', '%'+search+'%');
    if (category && category !== 'All') q = q.eq('category', category);
    var r = await q;
    if (r.error) throw r.error;
    var data = r.data || [];
    var uids = [];
    data.forEach(function(v){ if(v.user_id && uids.indexOf(v.user_id)===-1) uids.push(v.user_id); });
    if (uids.length) {
      var pr = await sb().from('profiles').select('id,username,avatar_url').in('id', uids);
      var pmap = {};
      (pr.data||[]).forEach(function(p){pmap[p.id]=p;});
      data.forEach(function(v){v.profiles = v.user_id ? (pmap[v.user_id]||null) : null;});
    }
    return data;
  },

  getVideo: async function(id) {
    var r = await sb().from('videos').select('*').eq('id', id).single();
    if (r.error) throw r.error;
    sb().from('videos').update({views:(r.data.views||0)+1}).eq('id',id).then(function(){});
    var v = r.data;
    if (v.user_id) {
      var pr = await sb().from('profiles').select('id,username,avatar_url').eq('id', v.user_id).maybeSingle();
      v.profiles = pr.data || null;
    }
    return v;
  },

  saveVideo: async function(p) {
    var r = await sb().from('videos').insert([{
      title: p.title,
      description: p.description || '',
      video_url: p.videoUrl || '',
      magnet_link: p.videoUrl || '',
      thumbnail_url: p.thumbnailUrl || null,
      file_size: p.fileSize || 0,
      duration: p.duration || 0,
      views: 0,
      user_id: p.userId || null,
      storage_key: p.storageKey || null,
      category: p.category || 'Other'
    }]).select().single();
    if (r.error) throw r.error;
    return r.data;
  },

  updateVideo: async function(id, patch) {
    await sb().from('videos').update(patch).eq('id', id);
  },

  uploadThumbnail: async function(id, blob) {
    var name = id+'.jpg';
    var up = await sb().storage.from(THUMB_BUCKET).upload(name, blob, {contentType:'image/jpeg',upsert:true});
    if (up.error) throw up.error;
    return sb().storage.from(THUMB_BUCKET).getPublicUrl(name).data.publicUrl;
  },

  deleteVideo: async function(id, storageKey) {
    if (storageKey) { try { await sb().storage.from('videos').remove([storageKey]); } catch(e) {} }
    var r = await sb().from('videos').delete().eq('id', id);
    if (r.error) throw r.error;
  },

  getLikes: async function(videoId) {
    var r = await sb().from('likes').select('user_fingerprint').eq('video_id', videoId);
    if (r.error) return {count:0, liked:false};
    var user = await Auth.getUser();
    var uid = user ? user.id : getFP();
    return {count: r.data.length, liked: r.data.some(function(l){return l.user_fingerprint===uid;})};
  },

  toggleLike: async function(videoId) {
    var user = await Auth.getUser();
    if (!user) return null;
    var uid = user.id;
    var r = await sb().from('likes').select('id').eq('video_id',videoId).eq('user_fingerprint',uid).maybeSingle();
    if (r.data) { await sb().from('likes').delete().eq('video_id',videoId).eq('user_fingerprint',uid); return false; }
    await sb().from('likes').insert([{video_id:videoId, user_fingerprint:uid}]);
    return true;
  },

  getComments: async function(videoId) {
    var r = await sb().from('comments').select('*').eq('video_id',videoId).order('created_at',{ascending:true});
    if (r.error) return [];
    return r.data;
  },

  addComment: async function(videoId, text, user) {
    var name = (user&&user.user_metadata&&user.user_metadata.full_name) ? user.user_metadata.full_name : 'User';
    var r = await sb().from('comments').insert([{video_id:videoId, author_name:name, body:text.trim()}]).select().single();
    if (r.error) throw r.error;
    return r.data;
  },

  getUserVideos: async function(userId) {
    var r = await sb().from('videos').select('*').eq('user_id',userId).order('created_at',{ascending:false});
    if (r.error) return [];
    return r.data;
  },

  // Subscriptions
  getSubscriptions: async function(userId) {
    if (!userId) return [];
    var r = await sb().from('subscriptions').select('channel_id').eq('subscriber_id', userId);
    return (r.data||[]).map(function(s){return s.channel_id;});
  },
  toggleSubscription: async function(subscriberId, channelId) {
    var r = await sb().from('subscriptions').select('id').eq('subscriber_id', subscriberId).eq('channel_id', channelId).maybeSingle();
    if (r.data) {
      await sb().from('subscriptions').delete().eq('subscriber_id', subscriberId).eq('channel_id', channelId);
      return false;
    }
    await sb().from('subscriptions').insert([{subscriber_id: subscriberId, channel_id: channelId}]);
    return true;
  },
  isSubscribed: async function(subscriberId, channelId) {
    var r = await sb().from('subscriptions').select('id').eq('subscriber_id', subscriberId).eq('channel_id', channelId).maybeSingle();
    return !!r.data;
  },

  getRecommended: async function() {
    var r = await sb().from('videos').select('*').order('created_at', {ascending:false});
    if (r.error) throw r.error;
    var data = r.data || [];

    // load profiles
    var uids = [];
    data.forEach(function(v){ if(v.user_id && uids.indexOf(v.user_id)===-1) uids.push(v.user_id); });
    if (uids.length) {
      var pr = await sb().from('profiles').select('id,username,avatar_url').in('id', uids);
      var pmap = {};
      (pr.data||[]).forEach(function(p){ pmap[p.id]=p; });
      data.forEach(function(v){ v.profiles = v.user_id ? (pmap[v.user_id]||null) : null; });
    }

    var history = DB.getHistory();
    if (!history.length) return data;

    var now = Date.now();
    var watchedIds = history.map(function(v){return v.id;});

    // category preference weighted by watch_pct
    var catPref = {}, catN = {};
    history.forEach(function(v){
      if (!v.category) return;
      catPref[v.category] = (catPref[v.category]||0) + (v.watch_pct||0);
      catN[v.category] = (catN[v.category]||0) + 1;
    });
    Object.keys(catPref).forEach(function(c){ catPref[c] = catPref[c] / catN[c]; });

    // keyword preference from liked videos (>40%)
    var kwPref = {};
    history.filter(function(v){return (v.watch_pct||0)>=40;}).forEach(function(v){
      ((v.title||'') + ' ' + (v.tags||'')).toLowerCase().split(/[\s,._-]+/).forEach(function(w){
        if (w.length > 3) kwPref[w] = (kwPref[w]||0) + (v.watch_pct||0) / 100;
      });
    });

    // channel quality
    var chQ = {};
    history.forEach(function(v){
      if (!v.user_id) return;
      if (!chQ[v.user_id]) chQ[v.user_id] = {t:0,n:0};
      chQ[v.user_id].t += (v.watch_pct||0); chQ[v.user_id].n++;
    });

    // subscriptions
    var subIds = [];
    try {
      var user = await Auth.getUser();
      if (user) subIds = await DB.getSubscriptions(user.id);
    } catch(e) {}

    data.forEach(function(v){
      var s = 0;
      var wp = watchedIds.indexOf(v.id) !== -1 ? (history.find(function(h){return h.id===v.id;})||{}).watch_pct : undefined;
      var age = (now - new Date(v.created_at)) / 86400000;

      // subscribed channel - top priority
      if (v.user_id && subIds.indexOf(v.user_id)!==-1) {
        s += 80;
        if (wp===undefined) s += 60;
      }

      // watch history
      if (wp !== undefined) {
        if (wp < 10) s -= 40;
        else if (wp < 25) s -= 15;
        else if (wp < 50) s -= 5;
        else s -= 3;
      } else { s += 12; }

      // category
      if (v.category && catPref[v.category]) s += catPref[v.category] / 100 * 25;

      // keywords
      var kw = 0;
      ((v.title||'') + ' ' + (v.tags||'')).toLowerCase().split(/[\s,._-]+/).forEach(function(w){
        if (kwPref[w]) kw += kwPref[w];
      });
      s += Math.min(kw * 4, 25);

      // channel quality
      if (v.user_id && chQ[v.user_id]) s += (chQ[v.user_id].t / chQ[v.user_id].n / 100) * 20;

      // new/unknown creator bonus
      if (v.user_id && !chQ[v.user_id] && subIds.indexOf(v.user_id)===-1) s += 6;

      // freshness
      if (age < 1) s += 10; else if (age < 3) s += 5; else if (age < 7) s += 2;

      // mild popularity
      s += Math.min((v.views||0)/300, 4);

      v._score = s;
    });

    data.sort(function(a,b){ return b._score - a._score; });

    // diversity: max 2 per channel, 1 discovery slot per 8
    var chCount = {}, result = [], main = [], disc = [];
    data.forEach(function(v){
      (v.user_id && !chQ[v.user_id] && subIds.indexOf(v.user_id)===-1 ? disc : main).push(v);
    });
    var mi=0, di=0;
    while (result.length < 40) {
      var pick;
      if ((result.length+1) % 8 === 0 && di < disc.length) pick = disc[di++];
      else if (mi < main.length) pick = main[mi++];
      else if (di < disc.length) pick = disc[di++];
      else break;
      if (pick.user_id) {
        chCount[pick.user_id] = (chCount[pick.user_id]||0) + 1;
        if (chCount[pick.user_id] > 2) continue;
      }
      result.push(pick);
    }
    return result;
  },

  addToHistory: function(video, watchPct) {
    try {
      var h = JSON.parse(localStorage.getItem('_rt_h')||'[]');
      var existing = null;
      for (var i=0; i<h.length; i++) { if (h[i].id===video.id) { existing=h[i]; break; } }
      var pct = watchPct || 0;
      if (existing) {
        existing.watch_pct = Math.max(existing.watch_pct||0, pct);
        existing.watched_at = Date.now();
        h = h.filter(function(v){return v.id!==video.id;});
        h.unshift(existing);
      } else {
        h.unshift({ id:video.id, title:video.title, thumbnail_url:video.thumbnail_url||null,
          duration:video.duration||0, category:video.category||'', tags:video.tags||'',
          user_id:video.user_id||null, watch_pct:pct, watched_at:Date.now() });
      }
      localStorage.setItem('_rt_h', JSON.stringify(h.slice(0,100)));
    } catch(e) {}
    // save to server
    DB.saveWatchEvent(video.id, pct);
  },

  updateWatchPct: function(id, pct) {
    try {
      var h = JSON.parse(localStorage.getItem('_rt_h')||'[]');
      for (var i=0; i<h.length; i++) {
        if (h[i].id===id) { h[i].watch_pct = Math.max(h[i].watch_pct||0, pct); break; }
      }
      localStorage.setItem('_rt_h', JSON.stringify(h));
    } catch(e) {}
    if (pct % 10 === 0) DB.saveWatchEvent(id, pct); // save every 10%
  },

  saveWatchEvent: async function(videoId, watchPct) {
    try {
      var user = null;
      try { user = await Auth.getUser(); } catch(e) {}
      await sb().from('watch_events').insert([{
        video_id: videoId,
        user_fingerprint: getFP(),
        user_id: user ? user.id : null,
        watch_pct: watchPct || 0
      }]);
    } catch(e) {}
  },
  getHistory: function() { try{return JSON.parse(localStorage.getItem('_rt_h')||'[]');}catch(e){return [];} },
  clearHistory: function() { localStorage.removeItem('_rt_h'); },
  removeFromHistory: function(id) {
    try {
      var h = JSON.parse(localStorage.getItem('_rt_h')||'[]');
      localStorage.setItem('_rt_h', JSON.stringify(h.filter(function(v){return v.id!==id;})));
    } catch(e) {}
  }
};

function getFP() {
  var k='_rt_fp', v=localStorage.getItem(k);
  if(!v){v=Math.random().toString(36).slice(2)+Date.now().toString(36);localStorage.setItem(k,v);}
  return v;
}
