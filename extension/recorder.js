let mediaRecorder = null;
let chunks = [];
let screenStream = null;
let cameraStream = null;
let timerInterval = null;
let seconds = 0;

const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const copyBtn = document.getElementById('copy-btn');
const newBtn = document.getElementById('new-btn');
const timerEl = document.getElementById('timer');
const urlInput = document.getElementById('url-input');
const cameraPreview = document.getElementById('camera-preview');

function showSection(name) {
  ['idle', 'recording', 'uploading', 'done'].forEach(id => {
    document.getElementById(id + '-section').style.display = id === name ? 'block' : 'none';
  });
}

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
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 30 },
      audio: true
    });
  } catch (err) {
    if (err.name !== 'NotAllowedError') {
      alert('画面の共有に失敗しました: ' + err.message);
    }
    return;
  }

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    cameraPreview.srcObject = cameraStream;
    cameraPreview.style.display = 'block';
  } catch (e) {
    // カメラなしでも続行
  }

  const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    .find(t => MediaRecorder.isTypeSupported(t)) || '';

  mediaRecorder = new MediaRecorder(screenStream, mimeType ? { mimeType } : {});
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
  screenStream = null;
  cameraStream = null;
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
    showSection('done');

  } catch (err) {
    alert('アップロードに失敗しました: ' + err.message);
    showSection('idle');
  }
}
