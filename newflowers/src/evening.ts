function button(id: string): HTMLButtonElement {
  const result = document.getElementById(id);
  if (!(result instanceof HTMLButtonElement)) throw new Error(`Missing evening button: ${id}`);
  return result;
}

// Original sparse piano voicings. No recorded soundtrack or remote audio.
let audio: AudioContext | undefined;
let output: GainNode | undefined;
let timer: number | undefined;
let soundOn = false;
let nextBar = 0;
let bar = 0;
const chords = [[48,55,59,64,69],[45,52,55,60,67],[50,57,60,65,69],[43,53,59,64,69]];
const sound = button('sound');

function note(midi: number, time: number, volume: number) {
  if (!audio || !output) return;
  const envelope = audio.createGain();
  envelope.gain.setValueAtTime(0, time);
  envelope.gain.linearRampToValueAtTime(volume, time + .012);
  envelope.gain.exponentialRampToValueAtTime(.0001, time + 2.9);
  envelope.connect(output);
  for (const [harmonic, strength] of [[1,1],[2,.2],[3,.075]]) {
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 440 * 2 ** ((midi - 69) / 12) * harmonic;
    gain.gain.value = strength;
    oscillator.connect(gain);gain.connect(envelope);
    oscillator.start(time);oscillator.stop(time+3);
    oscillator.onended = () => {oscillator.disconnect();gain.disconnect();};
  }
  window.setTimeout(() => envelope.disconnect(), Math.max(0,(time-audio.currentTime+3.2)*1000));
}

function schedule() {
  if (!audio || !soundOn || document.hidden) return;
  if (nextBar < audio.currentTime) nextBar = audio.currentTime + .08;
  if (nextBar > audio.currentTime + .6) return;
  const chord = chords[bar % chords.length];
  note(chord[0],nextBar,.11);
  chord.slice(1).forEach((pitch,i) => note(pitch,nextBar+.42+i*.045,.048));
  note(chord[4]+12,nextBar+1.65,.025);
  note(chord[3]+12,nextBar+2.48,.020);
  nextBar += 4.2;
  bar++;
}

sound.addEventListener('click', async () => {
  sound.disabled = true;
  if (!audio) {
    audio = new AudioContext();
    output = audio.createGain();output.gain.value=.48;
    const lowpass=audio.createBiquadFilter();lowpass.type='lowpass';lowpass.frequency.value=2400;
    output.connect(lowpass);lowpass.connect(audio.destination);
  }
  soundOn = !soundOn;
  if (soundOn) {
    try { await audio.resume(); } catch { soundOn=false; }
  }
  if (soundOn) {
    nextBar=audio.currentTime+.1;schedule();timer=window.setInterval(schedule,250);
  } else {
    window.clearInterval(timer);await audio.close();audio=undefined;output=undefined;
  }
  sound.setAttribute('aria-pressed',String(soundOn));
  sound.setAttribute('aria-label',soundOn?'turn off evening piano':'turn on evening piano');
  sound.disabled = false;
});

document.addEventListener('visibilitychange', () => {
  if (!audio || !soundOn) return;
  if (document.hidden) void audio.suspend();
  else { nextBar=audio.currentTime+.1;void audio.resume(); }
});
