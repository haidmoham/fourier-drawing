import './style.css';
import { updateAnatomy } from './wave-anatomy';
import { Instrument, type InstrumentState } from './instrument';

function element<T extends HTMLElement>(selector: string): T {
  const result = document.querySelector<T>(selector);
  if (!result) throw new Error(`Missing instrument element: ${selector}`);
  return result;
}
const canvas = element<HTMLCanvasElement>('#instrument');
const terms = element<HTMLInputElement>('#terms');
const phase = element<HTMLInputElement>('#phase');
const play = element<HTMLButtonElement>('#play');
const cards = element<HTMLDivElement>('#wave-cards');
const anatomy = element<HTMLDivElement>('#wave-anatomy');
const drawButton = element<HTMLButtonElement>('#draw');
const exploreButton = element<HTMLButtonElement>('#explore');
const status = element<HTMLParagraphElement>('#status');
const colors = ['#e85835', '#4774bf', '#829143', '#9874ad', '#bb8b3d', '#429587'];
let lastSignature = '';
let currentState: InstrumentState | null = null;
let drawingMode = true;

function update(state: InstrumentState): void {
  currentState = state;
  updateAnatomy(anatomy, state);
  document.body.dataset.state = state.hasDrawing ? "drawn" : "empty";
  document.body.classList.toggle("is-drawing", state.drawing);
  const rotating = Math.max(0, state.terms - 1);
  terms.max = String(Math.max(0, state.maxTerms - 1));
  terms.value = String(rotating);
  terms.disabled = !state.hasDrawing;
  element<HTMLOutputElement>('#term-value').value = String(rotating);
  phase.value = String(Math.round(state.phase * 1000));
  phase.disabled = !state.hasDrawing;
  element<HTMLOutputElement>('#phase-value').value = state.phase.toFixed(2);
  element<HTMLOutputElement>('#error').value = state.hasDrawing ? `${(state.error * 100).toFixed(2)}%` : '—';
  play.textContent = state.playing ? 'Ⅱ' : '▶';
  play.setAttribute('aria-label', state.playing ? 'pause playback' : 'play reconstruction');
  play.disabled = !state.hasDrawing;
  document.querySelectorAll<HTMLButtonElement>('[data-terms]').forEach(button => {
    button.classList.toggle('selected', Math.min(Number(button.dataset.terms), state.maxTerms - 1) === rotating);
    button.disabled = !state.hasDrawing;
  });
  const signature = `${state.terms}:${state.selected}:${state.harmonics.slice(0, 7).map(h => `${h.re},${h.im}`).join(';')}`;
  if (signature !== lastSignature) {
    lastSignature = signature;
    renderCards(state);
  }
  cards.querySelectorAll<SVGCircleElement>('[data-wave-dot]').forEach(dot => {
    const harmonic = state.harmonics[Number(dot.dataset.waveDot)];
    if (!harmonic) return;
    const value = harmonic.re * Math.cos(2 * Math.PI * harmonic.frequency * state.phase) - harmonic.im * Math.sin(2 * Math.PI * harmonic.frequency * state.phase);
    dot.setAttribute('cx', String(2 + state.phase * 156));
    dot.setAttribute('cy', String(30 - (harmonic.amplitude ? value / harmonic.amplitude : 0) * 19));
  });
  if (state.drawing) status.textContent = 'keep going. release your line to discover its waves.';
}

function renderCards(state: InstrumentState): void {
  cards.replaceChildren();
  if (!state.hasDrawing) {
    const empty = document.createElement('p');
    empty.className = 'wave-empty';
    empty.textContent = 'draw a line above. its waves will appear here.';
    cards.append(empty);
    return;
  }
  state.harmonics.slice(1, 7).forEach((harmonic, offset) => {
    const index = offset + 1;
    const button = document.createElement('button');
    button.className = 'wave-card';
    button.style.setProperty('--wave', colors[offset % colors.length]);
    button.setAttribute('aria-pressed', String(state.selected === index));
    button.setAttribute('aria-label', `follow wave ${index}, frequency ${harmonic.frequency}`);
    button.disabled = index >= state.terms;
    const path = Array.from({length: 81}, (_, i) => {
      const t = i / 80;
      const x = 2 + t * 156;
      const value = harmonic.re * Math.cos(2 * Math.PI * harmonic.frequency * t) - harmonic.im * Math.sin(2 * Math.PI * harmonic.frequency * t);
      const y = 30 - (harmonic.amplitude ? value / harmonic.amplitude : 0) * 19;
      return `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(' ');
    button.innerHTML = `<div class="wave-meta"><span>wave ${String(index).padStart(2, '0')}</span><span>${harmonic.frequency > 0 ? '+' : ''}${harmonic.frequency} ${harmonic.frequency > 0 ? '↺' : '↻'}</span></div><svg viewBox="0 0 160 60" aria-hidden="true"><path d="M0 30H160" stroke="#d9d7cc" fill="none"/><path d="${path}" stroke="${colors[offset % colors.length]}" stroke-width="1.6" fill="none"/><circle data-wave-dot="${index}" cx="2" cy="30" r="3" fill="${colors[offset % colors.length]}"/></svg><span class="wave-detail">radius ${harmonic.amplitude.toFixed(3)} · ${index < state.terms ? 'follow ↗' : 'add more waves'}</span>`;
    button.addEventListener('click', () => instrument.setSelected(currentState?.selected === index ? null : index));
    cards.append(button);
  });
}

const instrument = new Instrument(canvas, update);
setMode(true);
function setMode(draw: boolean): void {
  drawingMode = draw;
  instrument.setMode(draw ? 'draw' : 'explore');
  drawButton.classList.toggle('active', draw);
  exploreButton.classList.toggle('active', !draw);
  drawButton.setAttribute('aria-pressed', String(draw));
  exploreButton.setAttribute('aria-pressed', String(!draw));
  status.textContent = draw ? 'drag in “your curve” to draw. release to discover its waves.' : 'follow the arrows. their sum is the point tracing your line.';
}
terms.addEventListener('input', () => instrument.setTerms(Number(terms.value) + 1));
phase.addEventListener('input', () => instrument.setPhase(Number(phase.value) / 1000));
play.addEventListener('click', () => instrument.togglePlay());
const speed = element<HTMLSelectElement>('#speed');
speed.addEventListener('change', () => instrument.setSpeed(Number(speed.value)));
drawButton.addEventListener('click', () => setMode(true));
exploreButton.addEventListener('click', () => setMode(false));
element<HTMLButtonElement>('#clear').addEventListener('click', () => { instrument.clear(); setMode(true); status.textContent = 'a blank page. draw a continuous line in “your curve”.'; document.querySelectorAll('[data-example]').forEach(button => button.classList.remove('selected')); });
document.querySelectorAll<HTMLButtonElement>('[data-terms]').forEach(button => button.addEventListener('click', () => instrument.setTerms(Number(button.dataset.terms) + 1)));
document.querySelectorAll<HTMLButtonElement>('[data-example]').forEach(button => button.addEventListener('click', () => {
  const name = button.dataset.example;
  if (name !== 'flower' && name !== 'orbit' && name !== 'heart') return;
  instrument.loadExample(name);
  setMode(false);
  document.querySelectorAll('[data-example]').forEach(item => item.classList.toggle('selected', item === button));
  status.textContent = `${button.textContent?.trim().split(' ').at(-1) ?? 'a shape'}, translated into motion. now make it yours.`;
}));
canvas.addEventListener('pointerup', () => {
  if (!drawingMode || !currentState?.hasDrawing) return;
  setMode(false);
  document.querySelectorAll('[data-example]').forEach(button => button.classList.remove('selected'));
  status.textContent = 'your gesture, rebuilt from circles. try fewer waves.';
});
const observer = new ResizeObserver(() => instrument.resize());
observer.observe(canvas.parentElement!);
window.addEventListener('pagehide', () => { observer.disconnect(); instrument.dispose(); }, { once: true });
