var Uploader = {
  upload: async function(file, onProgress) {
    var client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    var ext = file.name.split('.').pop() || 'mp4';
    var key = 'v/' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.' + ext;

    // Direct XHR upload to Supabase Storage with progress tracking
    await new Promise(function(resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.upload.addEventListener('progress', function(e) {
        if (e.lengthComputable && onProgress) onProgress(e.loaded, e.total);
      });
      xhr.addEventListener('load', function() {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error('Upload error ' + xhr.status + ': ' + xhr.responseText));
      });
      xhr.addEventListener('error', function() { reject(new Error('Network error')); });
      xhr.open('POST', SUPABASE_URL + '/storage/v1/object/videos/' + key);
      xhr.setRequestHeader('apikey', SUPABASE_ANON_KEY);
      xhr.setRequestHeader('Authorization', 'Bearer ' + SUPABASE_ANON_KEY);
      xhr.setRequestHeader('Content-Type', file.type);
      xhr.setRequestHeader('x-upsert', 'false');
      xhr.send(file);
    });

    var publicUrl = SUPABASE_URL + '/storage/v1/object/public/videos/' + key;
    return { publicUrl: publicUrl, key: key };
  },

  remove: async function(key) {
    var client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    await client.storage.from('videos').remove([key]);
  }
};
