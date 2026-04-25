var _sb2 = null;
function getSB() {
  if (!_sb2) _sb2 = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return _sb2;
}

var Auth = {
  signInGoogle: function() {
    getSB().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: location.origin + '/index.html' }
    });
  },

  signOut: function() {
    getSB().auth.signOut().then(function(){ location.href = 'index.html'; });
  },

  getUser: async function() {
    var r = await getSB().auth.getUser();
    return r.data && r.data.user ? r.data.user : null;
  },

  getProfile: async function(userId) {
    var r = await getSB().from('profiles').select('*').eq('id', userId).maybeSingle();
    return r.data || null;
  },

  upsertProfile: async function(userId, data) {
    await getSB().from('profiles').upsert(Object.assign({ id: userId }, data));
  },

  renderNavUser: async function(navEl) {
    var user = await Auth.getUser();
    var btn = navEl ? navEl.querySelector('#authBtn') : null;
    if (!btn) return;
    if (user) {
      var profile = await Auth.getProfile(user.id);
      var avatar = (profile && profile.avatar_url) ? profile.avatar_url : (user.user_metadata && user.user_metadata.avatar_url ? user.user_metadata.avatar_url : '');
      var name = (profile && profile.username) ? profile.username : (user.user_metadata && user.user_metadata.full_name ? user.user_metadata.full_name : 'Profile');
      if (avatar) {
        btn.innerHTML = '<img src="' + avatar + '" style="width:32px;height:32px;border-radius:50%;object-fit:cover;border:2px solid var(--accent)" alt="">';
      } else {
        btn.innerHTML = '<div style="width:32px;height:32px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.9rem;color:#fff">' + name[0].toUpperCase() + '</div>';
      }
      btn.title = name;
      btn.onclick = function(){ location.href = 'profile.html'; };
      btn.style.cssText = 'background:none;border:none;cursor:pointer;padding:0';
    } else {
      btn.textContent = 'Sign in';
      btn.className = 'btn btn-ghost btn-sm';
      btn.onclick = function(){ Auth.signInGoogle(); };
    }
  }
};
