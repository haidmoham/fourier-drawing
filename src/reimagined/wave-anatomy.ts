import { chain } from './engine';
import type { InstrumentState } from './instrument';

const TAU = Math.PI * 2;
const colors = ['#e85835', '#4774bf', '#829143', '#9874ad', '#bb8b3d', '#429587'];
const number = (value: number): string => (Math.abs(value) < .0005 ? 0 : value).toFixed(3);

/** The same coefficient and phase used by the canvas, expressed as live arithmetic. */
export function updateAnatomy(host: HTMLElement, state: InstrumentState): void {
  const selected = state.selected;
  const harmonic = selected === null ? undefined : state.harmonics[selected];
  host.hidden = !state.hasDrawing;
  const endpoints = chain(state.harmonics, state.terms, state.phase);
  const sum = endpoints.at(-1) ?? { x: 0, y: 0 };
  const key = `${selected}:${state.terms}:${harmonic?.re}:${harmonic?.im}`;
  if (host.dataset.key !== key) {
    host.dataset.key = key;
    host.style.setProperty('--wave', colors[Math.max(0, (selected ?? 1) - 1) % colors.length]);
    host.innerHTML = `<div class="anatomy-heading"><span>${harmonic && selected !== null ? `wave ${String(selected).padStart(2, '0')} · under the lens` : 'the sum · right now'}</span><span class="anatomy-time">t = <output data-value="time"></output></span></div>
      ${harmonic ? `<div class="anatomy-grid"><div class="wave-parameters"><span>radius r <b>${number(harmonic.amplitude)}</b></span><span>turns / loop k <b>${harmonic.frequency > 0 ? '+' : ''}${harmonic.frequency}</b></span><span>start angle φ <b>${(harmonic.phase * 180 / Math.PI).toFixed(1)}°</b></span></div>
      <div class="wave-arithmetic"><div class="angle-equation">θ = φ + 2πkt <span>→ <output data-value="angle"></output>°</span></div><div><span class="x-label">Δx</span> = r cos θ <span>= <output data-value="x"></output></span></div><div><span class="y-label">Δy</span> = r sin θ <span>= <output data-value="y"></output></span></div></div>
      <svg class="projection-diagram" viewBox="0 0 160 130" role="img" aria-label="selected wave horizontal and vertical projections"><circle cx="80" cy="65" r="47"/><path class="projection-axes" d="M18 65H142M80 8V122"/><path data-vector="legs" class="projection-legs"/><path data-vector="radius" class="projection-radius"/><circle data-vector="tip" r="3" class="projection-tip"/><text x="133" y="79">x</text><text x="86" y="12">y</text></svg></div>` : '<p class="select-wave-hint">touch a circle or wave below to look inside it.</p>'}
      <div class="sum-arithmetic"><span>${harmonic ? 'previous arrows + this arrow' : 'all active arrows'}</span><div data-value="addition"></div><span data-value="remaining" class="remaining-arrows"></span><span class="final-point">tracing point <b>(<output data-value="sum-x"></output>, <output data-value="sum-y"></output>)</b></span></div>`;
  }
  function value(name: string, text: string): void {
    const output = host.querySelector<HTMLElement>(`[data-value="${name}"]`);
    if (output) output.textContent = text;
  }
  value('time', state.phase.toFixed(3));
  value('sum-x', number(sum.x));
  value('sum-y', number(sum.y));
  if (!harmonic || selected === null) { value('addition', `c₀ + ${Math.max(0, state.terms - 1)} rotating terms`); return; }
  const theta = harmonic.phase + TAU * harmonic.frequency * state.phase;
  const x = harmonic.amplitude * Math.cos(theta);
  const y = harmonic.amplitude * Math.sin(theta);
  const before = endpoints[selected];
  const after = endpoints[selected + 1];
  value('remaining', `then + ${Math.max(0, state.terms - selected - 1)} remaining arrows (${number(sum.x - after.x)}, ${number(sum.y - after.y)})`);
  value('angle', (theta * 180 / Math.PI).toFixed(1));
  value('x', number(x));
  value('y', number(y));
  value('addition', `(${number(before.x)}, ${number(before.y)}) + (${number(x)}, ${number(y)}) = (${number(after.x)}, ${number(after.y)})`);
  const px = 80 + 47 * Math.cos(theta);
  const py = 65 - 47 * Math.sin(theta);
  host.querySelector('[data-vector="legs"]')?.setAttribute('d', `M80 65H${px}V${py}`);
  host.querySelector('[data-vector="radius"]')?.setAttribute('d', `M80 65L${px} ${py}`);
  host.querySelector('[data-vector="tip"]')?.setAttribute('cx', String(px));
  host.querySelector('[data-vector="tip"]')?.setAttribute('cy', String(py));
}
