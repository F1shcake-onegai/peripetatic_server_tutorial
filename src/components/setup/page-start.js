// @ts-check
// Setup page 1 (/setup/): the Raspberry Pi and the track, as two boxes each. Next needs
// both. Skip leaves without saving anything: the tutorial then shows all its content.
// A track that can't run on the chosen board (School Server on a Zero 2 W) is greyed out,
// and so is a board the chosen track can't use.
import { BOARDS, TRACK_BOARDS, emptySetup, setBoard, setTrack, clearDraft, trackFits } from '../../data/setup/index.js';
import { esc, urlsOf, currentSetup, keepDraft, stepper, session } from './common.js';

const TRACKS = { student: 'Student Kit', server: 'School Server' };
/** 'Raspberry Pi 5' for the boards a track can use @param {'student' | 'server'} t */
const boardsFor = (t) => (TRACK_BOARDS[/** @type {keyof typeof TRACK_BOARDS} */ (t)] ?? Object.keys(BOARDS))
  .map((b) => BOARDS[/** @type {keyof typeof BOARDS} */ (b)]?.name ?? b).join(' or ');

/** @param {HTMLElement} root */
export function mountStart(root) {
  const urls = urlsOf(root);
  const start = currentSetup();
  /** @type {string | null} */
  let board = start ? start.board : null;
  /** @type {'student' | 'server' | null} */
  let track = start?.track ?? null;

  /** @param {string} name @param {string} value @param {string} title @param {boolean} on @param {string} [off]  Why it can't be picked */
  const box = (name, value, title, on, off) => `
    <label class="pst-box${on ? ' pst-on' : ''}${off ? ' pst-off' : ''}">
      <input class="pst-sr" type="radio" name="${name}" id="${name}-${value}" value="${value}" ${on ? 'checked' : ''} ${off ? 'disabled' : ''}>
      <span class="pst-box-title">${esc(title)}</span>
      ${off ? `<span class="pst-box-reason">${esc(off)}</span>` : ''}
    </label>`;

  const render = () => {
    const focused = document.activeElement?.id;
    const ready = Boolean(board && track);
    root.innerHTML = `
      ${stepper(1, ready ? { ...emptySetup(), board: /** @type {string} */ (board), track } : start, urls)}
      <section class="pst-section">
        <h2>Raspberry Pi</h2>
        <div class="pst-boxes" role="radiogroup" aria-label="Raspberry Pi">
          ${Object.entries(BOARDS).map(([id, b]) => box('pst-board', id, b.name, board === id,
            track && !trackFits(track, id) ? `${TRACKS[track]} requires ${boardsFor(track)}` : undefined)).join('')}
        </div>
      </section>
      <section class="pst-section">
        <h2>Track</h2>
        <div class="pst-boxes" role="radiogroup" aria-label="Track">
          ${Object.entries(TRACKS).map(([id, name]) => box('pst-track', id, name, track === id,
            board && !trackFits(/** @type {'student' | 'server'} */ (id), board) ? `Requires ${boardsFor(/** @type {'student' | 'server'} */ (id))}` : undefined)).join('')}
        </div>
      </section>
      <div class="pst-nav">
        <a class="pst-btn" id="pst-skip" href="${esc(urls.home)}">Skip</a>
        <button type="button" class="pst-btn pst-primary" id="pst-next" ${ready ? '' : 'disabled'}>Next</button>
      </div>`;
    if (focused) document.getElementById(focused)?.focus();
  };

  root.addEventListener('change', (e) => {
    const el = /** @type {HTMLInputElement} */ (e.target);
    if (el.name === 'pst-board') board = el.value;
    if (el.name === 'pst-track' && (el.value === 'student' || el.value === 'server')) track = el.value;
    if (board && track) keepDraft(setTrack(setBoard(currentSetup() ?? emptySetup(), board), track));
    render();
  });

  root.addEventListener('click', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    if (target.closest('#pst-skip')) clearDraft(session);
    if (target.closest('#pst-next') && board && track) {
      keepDraft(setTrack(setBoard(currentSetup() ?? emptySetup(), board), track));
      window.location.href = urls.peripherals;
    }
  });

  render();
}
