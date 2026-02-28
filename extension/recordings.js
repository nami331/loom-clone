document.getElementById('new-rec-btn').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('recorder.html') });
});

function formatDate(isoString) {
  const d = new Date(isoString);
  return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
    + ' ' + d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}分${s}秒` : `${s}秒`;
}

function renderList(recordings) {
  const content = document.getElementById('content');

  if (!recordings || recordings.length === 0) {
    content.innerHTML = `
      <div class="empty">
        <p>録画がまだありません</p>
        <small>録画ボタンから最初の動画を撮ってみましょう</small>
      </div>`;
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'grid';

  recordings.forEach((rec, index) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <img class="thumbnail" src="${rec.thumbnail}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
      <div class="thumbnail-placeholder" style="display:none;">🎬</div>
      <div class="card-body">
        <div class="card-date">${formatDate(rec.date)}</div>
        <div class="card-duration">録画時間: ${formatDuration(rec.duration)}</div>
        <div class="card-actions">
          <button class="btn-card-copy" data-url="${rec.viewerUrl}">URLをコピー</button>
          <a class="btn-card-open" href="${rec.viewerUrl}" target="_blank">開く</a>
          <button class="btn-card-delete" data-index="${index}" title="削除">🗑</button>
        </div>
      </div>`;
    grid.appendChild(card);
  });

  content.innerHTML = '';
  content.appendChild(grid);

  // コピーボタン
  content.querySelectorAll('.btn-card-copy').forEach(btn => {
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(btn.dataset.url).then(() => {
        btn.textContent = 'コピーしました！';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = 'URLをコピー';
          btn.classList.remove('copied');
        }, 2000);
      });
    });
  });

  // 削除ボタン
  content.querySelectorAll('.btn-card-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = parseInt(btn.dataset.index);
      chrome.storage.local.get(['recordings'], (result) => {
        const recordings = result.recordings || [];
        recordings.splice(i, 1);
        chrome.storage.local.set({ recordings }, () => renderList(recordings));
      });
    });
  });
}

// 一覧を読み込む
chrome.storage.local.get(['recordings'], (result) => {
  renderList(result.recordings || []);
});
