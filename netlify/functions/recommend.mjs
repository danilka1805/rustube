const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_KEY;

async function q(path) {
  var res = await fetch(SB_URL + '/rest/v1/' + path, {
    headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY }
  });
  if (!res.ok) return [];
  return res.json();
}

export const handler = async (event) => {
  var h = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: h, body: '' };

  var p = event.queryStringParameters || {};
  var fp = p.fp || '';
  var uid = p.uid || null;
  var limit = Math.min(parseInt(p.limit)||20, 40);
  var now = Date.now();

  try {
    // 1. Load all videos
    var videos = await q('videos?select=id,title,category,tags,user_id,views,created_at,thumbnail_url,duration,video_url,magnet_link&order=created_at.desc&limit=500');
    if (!videos.length) return { statusCode: 200, headers: h, body: '[]' };

    // 2. Load profiles for all videos
    var uids = [];
    videos.forEach(function(v){ if(v.user_id && uids.indexOf(v.user_id)===-1) uids.push(v.user_id); });
    if (uids.length) {
      var profiles = await q('profiles?id=in.(' + uids.join(',') + ')&select=id,username,avatar_url');
      var pmap = {};
      profiles.forEach(function(p){ pmap[p.id] = p; });
      videos.forEach(function(v){ v.profiles = v.user_id ? (pmap[v.user_id]||null) : null; });
    }

    // 3. User watch history from server
    var history = fp ? await q('watch_events?user_fingerprint=eq.' + encodeURIComponent(fp) + '&select=video_id,watch_pct,created_at&order=created_at.desc&limit=300') : [];

    // Build watch map: video_id -> max watch_pct
    var watchMap = {};
    history.forEach(function(e){ watchMap[e.video_id] = Math.max(watchMap[e.video_id]||0, e.watch_pct); });

    // 4. Subscriptions
    var subs = uid ? await q('subscriptions?subscriber_id=eq.' + encodeURIComponent(uid) + '&select=channel_id') : [];
    var subIds = subs.map(function(s){ return s.channel_id; });

    // 5. Trending last 48h
    var cutoff = new Date(now - 172800000).toISOString();
    var trending = await q('watch_events?created_at=gte.' + cutoff + '&select=video_id,watch_pct&limit=3000');
    var trendMap = {};
    trending.forEach(function(e){
      if (!trendMap[e.video_id]) trendMap[e.video_id] = { n: 0, pct: 0 };
      trendMap[e.video_id].n++;
      trendMap[e.video_id].pct += e.watch_pct;
    });

    // 6. Collaborative filtering: find co-watchers
    var likedIds = Object.keys(watchMap).filter(function(id){ return watchMap[id] >= 50; });
    var collabMap = {};
    if (likedIds.length) {
      var coEvents = await q('watch_events?video_id=in.(' + likedIds.slice(0,15).join(',') + ')&watch_pct=gte.50&select=user_fingerprint,video_id&limit=1000');
      var coFps = [];
      coEvents.forEach(function(e){ if(e.user_fingerprint !== fp && coFps.indexOf(e.user_fingerprint)===-1) coFps.push(e.user_fingerprint); });
      if (coFps.length) {
        var coLiked = await q('watch_events?user_fingerprint=in.(' + coFps.slice(0,50).map(encodeURIComponent).join(',') + ')&watch_pct=gte.50&select=video_id&limit=1500');
        coLiked.forEach(function(e){
          if (!watchMap[e.video_id]) collabMap[e.video_id] = (collabMap[e.video_id]||0) + 1;
        });
      }
    }

    // 7. Build preference profile
    var catPref = {}, catN = {}, kwPref = {}, chPref = {};
    history.forEach(function(e){
      var v = videos.find(function(v){ return v.id === e.video_id; });
      if (!v) return;
      // category (weighted by completion)
      if (v.category) {
        catPref[v.category] = (catPref[v.category]||0) + e.watch_pct;
        catN[v.category] = (catN[v.category]||0) + 1;
      }
      // channel quality
      if (v.user_id) {
        if (!chPref[v.user_id]) chPref[v.user_id] = { total: 0, n: 0 };
        chPref[v.user_id].total += e.watch_pct;
        chPref[v.user_id].n++;
      }
      // keywords from liked videos only
      if (e.watch_pct >= 40) {
        var words = ((v.title||'') + ' ' + (v.tags||'')).toLowerCase().split(/[\s,._-]+/);
        words.forEach(function(w){
          if (w.length > 3) kwPref[w] = (kwPref[w]||0) + (e.watch_pct / 100);
        });
      }
    });
    // normalize category pref to avg
    Object.keys(catPref).forEach(function(c){ catPref[c] = catPref[c] / catN[c]; });

    // 8. Score
    var scored = videos.map(function(v){
      var s = 0;
      var wp = watchMap[v.id];
      var watched = wp !== undefined;
      var age = (now - new Date(v.created_at)) / 86400000;

      // Subscribed channel
      if (v.user_id && subIds.indexOf(v.user_id) !== -1) {
        s += 80;
        if (!watched) s += 60;
      }

      // Collaborative filtering
      if (collabMap[v.id]) s += Math.min(collabMap[v.id] * 5, 40);

      // Trending
      if (trendMap[v.id]) {
        var t = trendMap[v.id];
        s += Math.min(Math.log(t.n + 1) * (t.pct / t.n / 100) * 12, 20);
      }

      // Category match
      if (v.category && catPref[v.category]) s += catPref[v.category] / 100 * 25;

      // Keywords
      var words = ((v.title||'') + ' ' + (v.tags||'')).toLowerCase().split(/[\s,._-]+/);
      var kw = 0;
      words.forEach(function(w){ if (kwPref[w]) kw += kwPref[w]; });
      s += Math.min(kw * 4, 25);

      // Channel preference
      if (v.user_id && chPref[v.user_id]) {
        s += (chPref[v.user_id].total / chPref[v.user_id].n / 100) * 20;
      }

      // Watch history penalty/boost
      if (watched) {
        if (wp < 10) s -= 40;      // skipped = strong dislike
        else if (wp < 25) s -= 20; // watched little
        else if (wp < 50) s -= 8;  // partial
        else s -= 5;               // seen, just deprioritize
      } else {
        s += 12;                   // unseen bonus
      }

      // Freshness
      if (age < 1) s += 10;
      else if (age < 3) s += 6;
      else if (age < 7) s += 2;

      // Discovery: unknown channel gets small boost so new creators surface
      if (v.user_id && !chPref[v.user_id] && subIds.indexOf(v.user_id) === -1) s += 6;

      // Light popularity signal
      s += Math.min((v.views||0) / 300, 4);

      return { v: v, s: s };
    });

    scored.sort(function(a, b){ return b.s - a.s; });

    // 9. Diversity: max 2 per channel, inject 1 discovery per 8 slots
    var chCount = {}, result = [], mainQ = [], discQ = [];
    scored.forEach(function(item){
      var v = item.v;
      var isNew = v.user_id && !chPref[v.user_id] && subIds.indexOf(v.user_id)===-1;
      (isNew ? discQ : mainQ).push(item);
    });

    var mi = 0, di = 0;
    while (result.length < limit) {
      var pick;
      if ((result.length + 1) % 8 === 0 && di < discQ.length) {
        pick = discQ[di++];
      } else if (mi < mainQ.length) {
        pick = mainQ[mi++];
      } else if (di < discQ.length) {
        pick = discQ[di++];
      } else break;
      if (!pick) break;
      var vid = pick.v;
      if (vid.user_id) {
        chCount[vid.user_id] = (chCount[vid.user_id]||0) + 1;
        if (chCount[vid.user_id] > 2) continue;
      }
      result.push(vid);
    }

    return { statusCode: 200, headers: h, body: JSON.stringify(result) };
  } catch(err) {
    console.error(err);
    try {
      var fb = await q('videos?select=*&order=created_at.desc&limit=' + limit);
      return { statusCode: 200, headers: h, body: JSON.stringify(fb) };
    } catch(e2) {
      return { statusCode: 500, headers: h, body: JSON.stringify({ error: err.message }) };
    }
  }
};
