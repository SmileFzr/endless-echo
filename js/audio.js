/* ============================================================
   音频引擎：背景音乐与音效 / audio engine
   无尽回响 Endless Echo
   ============================================================ */

/* ---------- 音频 ---------- */
const NOTE_FREQ = {
  'A2':110,'B2':123.47,'C3':130.81,'D3':146.83,'E3':164.81,'F3':174.61,'G3':196,
  'A3':220,'B3':246.94,'C4':261.63,'D4':293.66,'E4':329.63,'F4':349.23,'G4':392,
  'A4':440,'B4':493.88,'C5':523.25,'D5':587.33,'E5':659.25,'F5':698.46,'G5':783.99,
  'A5':880,'C6':1046.50,
};
const BPM = 132, STEP_DUR = 60 / BPM / 2, MUSIC_LEN = 32;
const TRACK_BASS = ['A2','A2','A2','A2','F2','F2','F2','F2','C3','C3','C3','C3','G2','G2','G2','G2','A2','A2','A2','A2','F2','F2','F2','F2','C3','C3','C3','C3','G2','G2','G2','G2'].map(n => NOTE_FREQ[n] || null);
const TRACK_LEAD = ['E4',null,'G4','A4',null,'G4','E4',null,'F4',null,'A4','C5',null,'A4','F4',null,'E4',null,'G4','C5',null,'G4','E4',null,'D4',null,'G4','B4',null,'D5','B4','G4'].map(n => n ? NOTE_FREQ[n] : null);
const TRACK_DRUM = (() => { const a = new Array(32).fill(0); for (let i = 0; i < 32; i++) { if (i % 2 === 0) a[i] = 2; if (i % 8 === 0 || i % 8 === 6) a[i] = 1; if (i % 8 === 4) a[i] = 3; } return a; })();
let actx = null, masterGain = null, musicGain = null, sfxGain = null;
let audioReady = false, musicOn = true, sfxOn = true;
let musicTimer = null, musicStep = 0, musicNextTime = 0, _noiseBuf = null;
function noiseBuffer() { if (_noiseBuf) return _noiseBuf; const len = Math.floor(actx.sampleRate * 0.5); const buf = actx.createBuffer(1, len, actx.sampleRate); const d = buf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; _noiseBuf = buf; return buf; }
function initAudio() { if (audioReady) { if (actx.state === 'suspended') actx.resume().catch(()=>{}); return; } try { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; actx = new AC(); masterGain = actx.createGain(); masterGain.gain.value = 0.85; masterGain.connect(actx.destination); musicGain = actx.createGain(); musicGain.gain.value = musicOn ? 0.26 : 0; musicGain.connect(masterGain); sfxGain = actx.createGain(); sfxGain.gain.value = sfxOn ? 0.5 : 0; sfxGain.connect(masterGain); audioReady = true; startMusic(); } catch (e) {} }
function playNote(freq, t, dur, type, vol, dest) { const o = actx.createOscillator(), g = actx.createGain(); o.type = type; o.frequency.setValueAtTime(freq, t); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0006, t + dur); o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.02); }
function playKick(t) { const o = actx.createOscillator(), g = actx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(46, t + 0.11); g.gain.setValueAtTime(0.55, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16); o.connect(g); g.connect(musicGain); o.start(t); o.stop(t + 0.18); }
function playHat(t) { const s = actx.createBufferSource(); s.buffer = noiseBuffer(); const f = actx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7200; const g = actx.createGain(); g.gain.setValueAtTime(0.09, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.035); s.connect(f); f.connect(g); g.connect(musicGain); s.start(t); s.stop(t + 0.05); }
function playSnare(t) { const s = actx.createBufferSource(); s.buffer = noiseBuffer(); const f = actx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.8; const g = actx.createGain(); g.gain.setValueAtTime(0.22, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.13); s.connect(f); f.connect(g); g.connect(musicGain); s.start(t); s.stop(t + 0.15); }
function startMusic() { if (!audioReady || musicTimer) return; musicStep = 0; musicNextTime = actx.currentTime + 0.12; musicTimer = setInterval(musicScheduler, 40); }
function stopMusic() { if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } }
function musicScheduler() { if (!audioReady || !musicOn) { stopMusic(); return; } if (typeof document !== 'undefined' && document.hidden) { stopMusic(); return; } if (actx.state !== 'running') return; while (musicNextTime < actx.currentTime + 0.22) { const s = musicStep; const b = TRACK_BASS[s]; if (b) playNote(b, musicNextTime, STEP_DUR * 0.92, 'triangle', 0.16, musicGain); const l = TRACK_LEAD[s]; if (l) playNote(l, musicNextTime, STEP_DUR * 0.72, 'square', 0.062, musicGain); const d = TRACK_DRUM[s]; if (d === 1) playKick(musicNextTime); else if (d === 2) playHat(musicNextTime); else if (d === 3) playSnare(musicNextTime); musicNextTime += STEP_DUR; musicStep = (musicStep + 1) % MUSIC_LEN; } }
const SFX_GAP = { shoot: 0.055, hit: 0.05, kill: 0.09, coin: 0.09, hurt: 0.18, levelup: 0.4, elite: 0.8, eliteKill: 0.6, shop: 0.4, mut: 0.4, over: 1.0, win: 1.0 };
const _sfxLast = {};
function tone(freq, dur, type, vol, slideTo, delay) { const t = actx.currentTime + (delay || 0); const o = actx.createOscillator(), g = actx.createGain(); o.type = type || 'square'; o.frequency.setValueAtTime(freq, t); if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0006, t + dur); o.connect(g); g.connect(sfxGain); o.start(t); o.stop(t + dur + 0.03); }
function noiseBurst(t, dur, vol, filterType, freq) { const s = actx.createBufferSource(); s.buffer = noiseBuffer(); const f = actx.createBiquadFilter(); f.type = filterType || 'highpass'; f.frequency.value = freq || 3000; const g = actx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0006, t + dur); s.connect(f); f.connect(g); g.connect(sfxGain); s.start(t); s.stop(t + dur + 0.02); }
function sfx(name) {
  if (!audioReady || !sfxOn || actx.state !== 'running') return;
  const now = actx.currentTime; const gap = SFX_GAP[name] || 0.06;
  if (_sfxLast[name] && now - _sfxLast[name] < gap) return;
  _sfxLast[name] = now;
  switch (name) {
    case 'shoot': tone(920, 0.045, 'square', 0.028, 520); break;
    case 'hit': noiseBurst(now, 0.035, 0.05, 'highpass', 4200); break;
    case 'kill': tone(260, 0.075, 'square', 0.05, 105); noiseBurst(now, 0.05, 0.035, 'highpass', 2600); break;
    case 'coin': tone(1180, 0.05, 'square', 0.06, 1420); tone(1560, 0.06, 'square', 0.05, null, 0.05); break;
    case 'hurt': tone(200, 0.16, 'sawtooth', 0.13, 62); noiseBurst(now, 0.1, 0.06, 'lowpass', 900); break;
    case 'levelup': tone(523.25, 0.09, 'square', 0.10); tone(659.25, 0.09, 'square', 0.10, null, 0.075); tone(783.99, 0.09, 'square', 0.10, null, 0.15); tone(1046.5, 0.20, 'square', 0.11, null, 0.225); break;
    case 'elite': tone(110, 0.30, 'sawtooth', 0.11, 92); tone(146, 0.30, 'sawtooth', 0.09, 122, 0.16); tone(110, 0.34, 'sawtooth', 0.11, 88, 0.32); break;
    case 'eliteKill': tone(196, 0.10, 'square', 0.11); tone(261.6, 0.10, 'square', 0.11, null, 0.08); tone(392, 0.10, 'square', 0.11, null, 0.16); tone(523.25, 0.24, 'square', 0.12, null, 0.24); break;
    case 'shop': tone(880, 0.09, 'square', 0.08); tone(1174.7, 0.14, 'square', 0.08, null, 0.09); break;
    case 'mut': tone(440, 0.07, 'sawtooth', 0.09); tone(587.3, 0.07, 'sawtooth', 0.09, null, 0.06); tone(880, 0.07, 'sawtooth', 0.09, null, 0.12); tone(1318.5, 0.28, 'sawtooth', 0.10, null, 0.18); break;
    case 'over': tone(392, 0.22, 'square', 0.10, 330); tone(330, 0.22, 'square', 0.10, 262, 0.20); tone(262, 0.55, 'square', 0.11, 130, 0.42); break;
    case 'win': tone(523.25, 0.14, 'square', 0.11); tone(659.25, 0.14, 'square', 0.11, null, 0.12); tone(783.99, 0.14, 'square', 0.11, null, 0.24); tone(1046.5, 0.42, 'square', 0.12, null, 0.36); break;
  }
}
document.addEventListener('pointerdown', initAudio);
document.addEventListener('keydown', initAudio);
// 切到后台时停掉 BGM 调度器, 回到前台再平滑续上
document.addEventListener('visibilitychange', () => {
  if (!audioReady) return;
  if (document.hidden) stopMusic();
  else if (musicOn && actx.state === 'running') startMusic();
});
