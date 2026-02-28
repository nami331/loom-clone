let mediaRecorder = null;
let chunks = [];
let screenStream = null;
let cameraStream = null;
let micStream = null;
let timerInterval = null;
let seconds = 0;
let cameraEnabled = true;
let micEnabled = true;

const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const copyBtn = document.getElementById('copy-btn');
const newBtn = document.getElementById('new-btn');
const cameraToggle = document.getElementById('camera-toggle');
const micToggle = document.getElementById('mic-toggle');
const listBtn = document.getElementById('list-btn');
const listBtnDone = document.getElementById('list-btn-done');
const timerEl = document.getElementById('timer');
const urlInput = document.getElementById('url-input');
const cameraPreview = document.getElementById('camera-preview');

function showSection(name) {
  ['idle', 'recording', 'uploading', 'done'].forEach(id => {
    document.getElementById(id + '-section').style.display = id === name ? 'block' : 'none';
  });
}

// カメラトグル
cameraToggle.addEventListener('click', () => {
  cameraEnabled = !cameraEnabled;
  cameraToggle.textContent = cameraEnabled ? '📷 カメラ ON' : '📷 カメラ OFF';
  cameraToggle.classList.toggle('active', cameraEnabled);
});

// マイクトグル
micToggle.addEventListener('click', () => {
  micEnabled = !micEnabled;
  micToggle.textContent = micEnabled ? '🎤 マイク ON' : '🎤 マイク OFF';
  micToggle.classList.toggle('active', micEnabled);
});

// 録画一覧ボタン
listBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('recordings.html') });
});
listBtnDone.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('recordings.html') });
});

startBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);
newBtn.addEventListener('click', () => showSection('idle'));

copyBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(urlInput.value).then(() => {
    copyBtn.textContent = 'コピーしました！';
    copyBtn.classList.add('copied');
    setTimeout(() => {
      copyBtn.textContent = 'コピー';
      copyBtn.classList.remove('copied');
    }, 2000);
  });
});

async function startRecording() {
  // 画面キャプチャ
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 30 },
      audio: false
    });
  } catch (err) {
    if (err.name !== 'NotAllowedError') {
      alert('画面の共有に失敗しました: ' + err.message);
    }
    return;
  }

  // マイク
  if (micEnabled) {
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch (e) {
      alert('マイクへのアクセスが拒否されました。マイクをOFFにして録画するか、ブラウザの設定を確認してください。');
      screenStream.getTracks().forEach(t => t.stop());
      screenStream = null;
      return;
    }
  }

  // カメラ
  if (cameraEnabled) {
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      cameraPreview.srcObject = cameraStream;
      cameraPreview.style.display = 'block';
    } catch (e) {
      // カメラなしでも続行
    }
  }

  // 録音するトラックを組み立てる（画面映像 + マイク音声）
  const tracks = [...screenStream.getVideoTracks()];
  if (micStream) tracks.push(...micStream.getAudioTracks());

  const combinedStream = new MediaStream(tracks);

  const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    .find(t => MediaRecorder.isTypeSupported(t)) || '';

  mediaRecorder = new MediaRecorder(combinedStream, mimeType ? { mimeType } : {});
  chunks = [];

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  mediaRecorder.onstop = uploadVideo;
  mediaRecorder.start(1000);

  screenStream.getVideoTracks()[0].onended = stopRecording;

  showSection('recording');
  startTimer();
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
  screenStream?.getTracks().forEach(t => t.stop());
  cameraStream?.getTracks().forEach(t => t.stop());
  micStream?.getTracks().forEach(t => t.stop());
  screenStream = null;
  cameraStream = null;
  micStream = null;
  cameraPreview.style.display = 'none';
  stopTimer();
  showSection('uploading');
}

function startTimer() {
  seconds = 0;
  timerEl.textContent = '00:00';
  timerInterval = setInterval(() => {
    seconds++;
    const m = String(Math.floor(seconds / 60)).padStart(2, '0');
    const s = String(seconds % 60).padStart(2, '0');
    timerEl.textContent = `${m}:${s}`;
  }, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
}

async function uploadVideo() {
  const blob = new Blob(chunks, { type: 'video/webm' });
  const formData = new FormData();
  formData.append('file', blob, 'recording.webm');
  formData.append('upload_preset', CONFIG.uploadPreset);

  try {
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${CONFIG.cloudName}/video/upload`,
      { method: 'POST', body: formData }
    );
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);

    const viewerUrl = `${CONFIG.viewerBaseUrl}?v=${encodeURIComponent(data.secure_url)}`;
    urlInput.value = viewerUrl;

    // 録画履歴を保存
    const recording = {
      id: data.public_id,
      viewerUrl: viewerUrl,
      date: new Date().toISOString(),
      duration: seconds,
      thumbnail: `https://res.cloudinary.com/${CONFIG.cloudName}/video/upload/so_0/${data.public_id}.jpg`
    };
    chrome.storage.local.get(['recordings'], (result) => {
      const recordings = result.recordings || [];
      recordings.unshift(recording);
      chrome.storage.local.set({ recordings });
    });

    showSection('done');

  } catch (err) {
    alert('アップロードに失敗しました: ' + err.message);
    showSection('idle');
  }
}
