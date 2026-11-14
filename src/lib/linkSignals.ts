import { judgeLink, type DownloadSample, type LinkVerdict } from './textureQuality';

/** NetworkInformation is Chromium-only and not in TypeScript's DOM types. */
interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: string;
  downlink?: number;
}

const STORAGE_KEY = 'lunar-link';

function connection(): NetworkInformationLike | undefined {
  return (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
}

/** Storage can be blocked (private windows, strict settings); the verdict is only a hint, so failures are ignored. */
function readPrevious(): LinkVerdict | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'slow' || value === 'fast' ? value : null;
  } catch {
    return null;
  }
}

function savePrevious(verdict: LinkVerdict): void {
  try {
    localStorage.setItem(STORAGE_KEY, verdict);
  } catch {
    // Not saved: the next visit measures again or asks the browser.
  }
}

/** Judges the link from a timed download plus what the browser knows, and remembers the verdict for next time. */
export function judgeThisLink(sample: DownloadSample): LinkVerdict {
  const info = connection();
  const verdict = judgeLink({
    sample,
    saveData: info?.saveData === true,
    effectiveType: info?.effectiveType,
    downlinkMbps: info?.downlink,
    previous: readPrevious(),
  });
  savePrevious(verdict);
  return verdict;
}
