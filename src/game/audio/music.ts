/**
 * The score: three recorded tracks (made with Lyria 3 Pro), one for each part of the day's walk.
 *
 *   valley  — the day in the valley: Hearth Hollow, the wood, the springs, the Reach, the hamlet
 *   heights — up on Windscar Ridge and the peak, or anywhere high
 *   dusk    — blue hour and the aurora, once the last errand is given
 *
 * Which track is wanted is a pure decision (`trackFor`), and a change has to hold for a few seconds
 * before the music follows (`createTrackChooser`), so a hop off a ledge doesn't flip the score.
 * A track that fades out is paused, not rewound: coming back to it picks up where it left off.
 *
 * The tracks stream through media elements rather than decoded buffers: three songs decoded to PCM
 * would hold about 170 MB, a streamed element a few hundred KB.
 */
import valleyUrl from '../../assets/music/valley.mp3?url';
import heightsUrl from '../../assets/music/heights.mp3?url';
import duskUrl from '../../assets/music/dusk.mp3?url';
import type { AudioRuntime } from './context';

export type Track = 'valley' | 'heights' | 'dusk';
export const TRACKS: readonly Track[] = ['valley', 'heights', 'dusk'];

/** Where the player is, as far as the music cares. */
export interface MusicPlace {
  zone: string;
  /** Feet above the valley floor, world units. */
  altitude: number;
  /** 0 day .. 1 blue hour. */
  dusk: number;
}

/** Above this the valley track gives way to the heights, wherever you are. */
export const HIGH = 62;

export function trackFor(p: MusicPlace): Track {
  if (p.dusk > 0.5) return 'dusk';
  if (p.zone === 'ridge' || p.zone === 'peak' || p.altitude > HIGH) return 'heights';
  return 'valley';
}

/** Seconds a new place has to hold before the music changes track. */
export const HOLD_SECONDS = 5;

export interface TrackChooser {
  /** Feed the wanted track each frame; returns the track that should be playing. */
  update(dt: number, wanted: Track): Track;
}

export function createTrackChooser(): TrackChooser {
  let current: Track | null = null;
  let pending: Track | null = null;
  let held = 0;
  return {
    update(dt, wanted): Track {
      if (current === null || wanted === current) {
        current = wanted;
        pending = null;
        held = 0;
        return current;
      }
      if (wanted !== pending) {
        pending = wanted;
        held = 0;
      }
      held += Number.isFinite(dt) ? Math.max(0, dt) : 0;
      // Dusk comes on over a minute anyway; it follows at once rather than holding again.
      if (held >= HOLD_SECONDS || wanted === 'dusk') {
        current = wanted;
        pending = null;
        held = 0;
      }
      return current;
    },
  };
}

/**
 * Track level into the music bus. The tracks are levelled to -16 LUFS; the master bus carries a
 * make-up gain written for the old synth, so the recordings sit well below unity here: at 0.07 they
 * land between where the synth score sat in the valley and on the heights, so the effects keep their balance.
 */
const LEVEL = 0.07;
/** A gust on the ridge pulls the music back a little, under the wind. */
const GUST_DUCK = 0.75;
/** Crossfade time constant, seconds: about four seconds to trade one track for another. */
const FADE_TAU = 1.3;

export interface MusicPlayer {
  play(track: Track, gust: boolean): void;
  dispose(): void;
}

const URLS: Record<Track, string> = { valley: valleyUrl, heights: heightsUrl, dusk: duskUrl };

/**
 * One copy of a track playing. A deck has two, so it can hand over to a fresh copy before the
 * recording's own fade-out: the Lyria tracks fade over their last fifteen seconds and sit near silence
 * for the last five, so a plain loop dipped under the wind every two and a half minutes, and the
 * director heard the music just stop.
 */
interface Voice {
  el: HTMLAudioElement;
  /** This copy's share of the deck, 0..1, for the handover crossfade. */
  gain: GainNode;
  /** When play() was last asked of the element, ms (performance.now), so a stalled copy is retried calmly. */
  tried: number;
}

interface Deck {
  voices: [Voice, Voice];
  /** The copy carrying the track now. */
  live: 0 | 1;
  gain: GainNode;
  on: boolean;
  /** Pause timer once a fade-out has finished. */
  stop: ReturnType<typeof setTimeout> | null;
}

/** A track that should be playing but has stopped (a refused start, a stall) is started again this often, ms. */
const RETRY_MS = 2000;
/** Seconds before a recording's end that the next copy takes over, ahead of its fade-out. */
const SEAM_S = 14;
/** Handover time constants, seconds: the new copy comes up in about four seconds, the old one eases away. */
const SEAM_IN = 1.2;
const SEAM_OUT = 2.5;

export function createMusic(rt: AudioRuntime): MusicPlayer | null {
  if (typeof Audio === 'undefined') return null;
  const { ctx } = rt;
  const decks = new Map<Track, Deck>();
  let duck = -1;

  const start = (v: Voice): void => {
    v.tried = performance.now();
    void v.el.play().catch(() => undefined);
  };

  const deck = (t: Track): Deck => {
    const had = decks.get(t);
    if (had) return had;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.connect(rt.music);
    const voice = (share: number): Voice => {
      const el = new Audio(URLS[t]);
      el.preload = 'auto';
      el.crossOrigin = 'anonymous';
      const g = ctx.createGain();
      g.gain.setValueAtTime(share, ctx.currentTime);
      ctx.createMediaElementSource(el).connect(g);
      g.connect(gain);
      return { el, gain: g, tried: 0 };
    };
    const d: Deck = { voices: [voice(1), voice(0.0001)], live: 0, gain, on: false, stop: null };
    // If a copy reaches its end anyway (the page was in the background through the handover), the
    // track goes on from the top rather than stopping.
    d.voices.forEach((v, i) =>
      v.el.addEventListener('ended', () => {
        if (!d.on || d.live !== i) return;
        v.el.currentTime = 0;
        v.gain.gain.setTargetAtTime(1, ctx.currentTime, 0.05);
        start(v);
      }),
    );
    decks.set(t, d);
    return d;
  };

  /** Keeps the wanted deck sounding: restarts a stopped copy, and hands over before the fade-out. */
  const tend = (d: Deck): void => {
    const v = d.voices[d.live];
    if (v.el.paused) {
      if (performance.now() - v.tried > RETRY_MS) start(v);
      return;
    }
    const left = v.el.duration - v.el.currentTime;
    if (!Number.isFinite(left) || left > SEAM_S) return;
    const next = d.live === 0 ? 1 : 0;
    const n = d.voices[next];
    const now = ctx.currentTime;
    n.el.currentTime = 0;
    n.gain.gain.cancelScheduledValues(now);
    n.gain.gain.setValueAtTime(0.0001, now);
    n.gain.gain.setTargetAtTime(1, now, SEAM_IN);
    start(n);
    v.gain.gain.cancelScheduledValues(now);
    v.gain.gain.setTargetAtTime(0.0001, now, SEAM_OUT);
    d.live = next;
  };

  const pauseAll = (d: Deck): void => {
    for (const v of d.voices) v.el.pause();
  };

  return {
    play(track, gust): void {
      const level = LEVEL * (gust ? GUST_DUCK : 1);
      for (const t of TRACKS) {
        const want = t === track;
        const d = want ? deck(t) : decks.get(t);
        if (!d) continue;
        if (want && (!d.on || level !== duck)) {
          if (d.stop) clearTimeout(d.stop);
          d.stop = null;
          const v = d.voices[d.live];
          if (v.el.paused) start(v);
          d.gain.gain.setTargetAtTime(level, ctx.currentTime, d.on ? 0.4 : FADE_TAU);
          d.on = true;
        } else if (want) {
          tend(d);
        } else if (d.on) {
          d.on = false;
          d.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, FADE_TAU);
          d.stop = setTimeout(() => pauseAll(d), FADE_TAU * 6000);
        }
      }
      duck = level;
    },
    dispose(): void {
      for (const d of decks.values()) {
        if (d.stop) clearTimeout(d.stop);
        for (const v of d.voices) {
          v.el.pause();
          v.el.removeAttribute('src');
        }
        try {
          d.gain.disconnect();
        } catch {
          /* already gone */
        }
      }
      decks.clear();
    },
  };
}
