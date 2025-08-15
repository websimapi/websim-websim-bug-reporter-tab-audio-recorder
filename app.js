const els = {
  start: document.getElementById('startBtn'),
  stop: document.getElementById('stopBtn'),
  status: document.getElementById('status'),
  timer: document.getElementById('timer'),
  previewWrap: document.getElementById('previewWrap'),
  preview: document.getElementById('preview'),
  sizeLabel: document.getElementById('sizeLabel'),
  durationLabel: document.getElementById('durationLabel'),
  packageBtn: document.getElementById('packageBtn'),
  downloadLink: document.getElementById('downloadLink'),
  packageName: document.getElementById('packageName'),
  bugTitle: document.getElementById('bugTitle'),
  bugCategory: document.getElementById('bugCategory'),
  bugDescription: document.getElementById('bugDescription'),
  expected: document.getElementById('expected'),
  actual: document.getElementById('actual'),
};

let recorder = null;
let chunks = [];
let recordStart = 0;
let timerInterval = null;
let recordedBlob = null;
let fileBaseName = null;

function fmtTime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const r = (s % 60).toString().padStart(2, '0');
  return `${m}:${r}`;
}

function slugify(str) {
  return (str || 'bug-report')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80) || 'bug-report';
}

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function updateStatus(text) {
  els.status.textContent = text;
}

function startTimer() {
  recordStart = Date.now();
  els.timer.textContent = '00:00';
  timerInterval = setInterval(() => {
    els.timer.textContent = fmtTime(Date.now() - recordStart);
  }, 500);
}

function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
}

async function startRecording() {
  chunks = [];
  recordedBlob = null;
  els.previewWrap.hidden = true;
  els.downloadLink.hidden = true;
  els.packageName.textContent = '';
  els.packageBtn.disabled = true;

  try {
    updateStatus('Requesting tab + audio...');
    if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('UNSUPPORTED:getDisplayMedia');
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        displaySurface: 'browser',
        frameRate: 30,
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        preferCurrentTab: true
      },
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        sampleRate: 48000,
        suppressLocalAudioPlayback: true,
        selfBrowserSurface: 'include'
      }
    });

    // When the user stops sharing via browser UI, stop recording gracefully.
    stream.getVideoTracks()[0].addEventListener('ended', () => {
      if (recorder && recorder.state === 'recording') {
        recorder.stop();
      }
    });

    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
      ? 'video/webm;codecs=vp8,opus'
      : 'video/webm';

    recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 });

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstart = () => {
      els.start.disabled = true;
      els.stop.disabled = false;
      updateStatus('Recording…');
      startTimer();
    };

    recorder.onstop = () => {
      stopTimer();
      updateStatus('Processing…');
      recordedBlob = new Blob(chunks, { type: mime });
      const url = URL.createObjectURL(recordedBlob);
      els.preview.src = url;
      els.previewWrap.hidden = false;
      els.sizeLabel.textContent = `Size: ${(recordedBlob.size / (1024*1024)).toFixed(2)} MB`;
      els.durationLabel.textContent = `Duration: ${els.timer.textContent}`;

      els.start.disabled = false;
      els.stop.disabled = true;
      els.packageBtn.disabled = false;
      updateStatus('Ready');
      // Stop tracks to release capture prompt light
      stream.getTracks().forEach(t => t.stop());
    };

    recorder.start(1000); // collect data every second
  } catch (err) {
    console.error(err);
    let msg = 'Permission denied or capture failed';
    const proto = location.protocol;
    if (String(err).includes('UNSUPPORTED')) msg = 'This browser does not support screen capture. Use Chrome, Edge, or Firefox.';
    else if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') msg = 'Capture was blocked or cancelled. Pick a specific tab and check “Share tab audio”.';
    else if (err?.name === 'NotFoundError') msg = 'No capture sources found. On macOS, enable Screen Recording in System Settings > Privacy & Security.';
    else if (err?.name === 'AbortError') msg = 'Capture picker was closed. Try again.';
    if (proto !== 'https:') msg = 'Screen capture requires HTTPS. Open this page over https://';
    updateStatus(msg);
    alert(msg);
    els.start.disabled = false;
    els.stop.disabled = true;
    stopTimer();
  }
}

function stopRecording() {
  try {
    if (recorder && recorder.state === 'recording') {
      recorder.stop();
      updateStatus('Stopping…');
      els.stop.disabled = true;
    }
  } catch (e) {
    console.error(e);
  }
}

function buildREADME({ title, category, description, expected, actual, videoName }) {
  const ua = navigator.userAgent;
  const platform = navigator.platform || navigator.userAgentData?.platform || 'unknown';
  const lang = navigator.language;
  const vw = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
  const vh = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);

  const instructions = `HOW TO DIAGNOSE HOMEPAGE LOAD ERRORS/OTHER SITE SPECIFIC ERRORS, NOT PROJECT ERRORS
open chrome, download it if necessary,
hit ctrl+shift+c to open dev tools (or right click inspect),
make sure the tab opened is Console - should look like the 1st attached screenshot. ,
start screen recording,
go to websim and let the console log fill up if it happens,
from that dev tools menu, navigate to the network tab - second screenshot,
you may have to resize the network tab, it should look like third screenshot,
refresh the websim tab,
DM me the video, or email it to support@websim.ai`;

  return `# ${title || 'Bug report'}

Category: ${category}

## Summary
${description || '(no description provided)'}

## Expected behavior
${expected || '(not specified)'}

## Actual behavior
${actual || '(not specified)'}

## Attachments
- ${videoName} (tab + audio recording)

## Environment
- User agent: ${ua}
- Platform: ${platform}
- Language: ${lang}
- Viewport: ${vw}x${vh}
- Time: ${new Date().toISOString()}

## Steps to reproduce (if applicable)
1. 
2. 
3. 

## Console & Network capture instructions (WebSim)
${instructions}

## Contact
Send this ZIP via DM or email to support@websim.ai
`;
}

async function packageZip() {
  if (!recordedBlob) {
    alert('Please record a video first.');
    return;
  }
  const title = (els.bugTitle.value || 'Bug report').trim();
  const category = els.bugCategory.value;
  const description = els.bugDescription.value.trim();
  const expected = els.expected.value.trim();
  const actual = els.actual.value.trim();

  const base = `websim-${slugify(title)}-${nowStamp()}`;
  fileBaseName = base;

  const videoName = `${base}.webm`;
  const readmeName = 'README.md';

  const zip = new JSZip();
  zip.file(readmeName, buildREADME({ title, category, description, expected, actual, videoName }));
  zip.file(videoName, recordedBlob, { binary: true });

  updateStatus('Zipping…');
  const content = await zip.generateAsync({ type: 'blob' });
  const zipName = `${base}.zip`;
  els.packageName.textContent = `Package: ${zipName}`;
  els.downloadLink.href = URL.createObjectURL(content);
  els.downloadLink.download = zipName;
  els.downloadLink.hidden = false;
  updateStatus('ZIP ready');
  try {
    saveAs(content, zipName);
  } catch {
    // If FileSaver fails, the link is still available.
  }
}

els.start.addEventListener('click', startRecording);
els.stop.addEventListener('click', stopRecording);
els.packageBtn.addEventListener('click', packageZip);

// Enable/disable package button based on having a recording
const updatePackageBtn = () => {
  els.packageBtn.disabled = !recordedBlob;
};
['bugTitle','bugDescription','expected','actual'].forEach(id => {
  document.getElementById(id).addEventListener('input', updatePackageBtn);
});