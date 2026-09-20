/**
 * NEXORA Voice Navigation Service
 * ================================
 * Multilingual speech guidance powered by the Web Speech API.
 * Provides concise audio turn prompts, hazard warnings, and arrival notices.
 * Throttles announcements to prevent repetitive audio on every GPS sample.
 */

export interface VoiceInstruction {
  id: string;
  text: string;
  priority?: 'high' | 'normal';
}

class VoiceNavigationService {
  private isMuted: boolean = false;
  private lastSpokenText: string = '';
  private lastSpokenTime: number = 0;
  private currentLanguage: string = 'en-IN';
  private voiceCache: SpeechSynthesisVoice[] = [];

  constructor() {
    // Restore mute preference from localStorage
    try {
      const savedMute = localStorage.getItem('nexora_voice_muted');
      if (savedMute !== null) {
        this.isMuted = savedMute === 'true';
      }
    } catch {
      this.isMuted = false;
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.loadVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        this.loadVoices();
      };
    }
  }

  private loadVoices() {
    try {
      this.voiceCache = window.speechSynthesis.getVoices() || [];
    } catch {
      this.voiceCache = [];
    }
  }

  public setLanguage(langCode: string) {
    // Mapping NEXORA language codes to BCP 47 language tags
    const langMap: Record<string, string> = {
      en: 'en-IN',
      hi: 'hi-IN',
      as: 'as-IN',
      bn: 'bn-IN',
      ne: 'ne-NP',
      mr: 'mr-IN',
      ta: 'ta-IN',
      te: 'te-IN',
      gu: 'gu-IN',
    };
    this.currentLanguage = langMap[langCode] || langCode || 'en-IN';
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    try {
      localStorage.setItem('nexora_voice_muted', String(muted));
    } catch {
      // ignore
    }
    if (muted && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  /**
   * Speak a navigation instruction if not muted and not recently spoken.
   */
  public speak(text: string, force: boolean = false): void {
    if (this.isMuted || typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }

    const now = Date.now();
    // Suppress exact duplicate within 8 seconds unless forced
    if (!force && text === this.lastSpokenText && now - this.lastSpokenTime < 8000) {
      return;
    }

    // Cancel any pending speech to speak high-priority turn/hazard prompt immediately
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = this.currentLanguage;
      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      // Select best voice available for current language or fallback to English/Hindi
      if (this.voiceCache.length > 0) {
        const matchingVoice = this.voiceCache.find(v => v.lang.startsWith(this.currentLanguage.split('-')[0])) ||
                              this.voiceCache.find(v => v.lang.includes('hi') || v.lang.includes('en'));
        if (matchingVoice) {
          utterance.voice = matchingVoice;
        }
      }

      this.lastSpokenText = text;
      this.lastSpokenTime = now;
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn('[VoiceNavigation] Speech synthesis error:', err);
    }
  }

  /**
   * Speak turn guidance with distance rounding
   */
  public announceManeuver(distanceMeters: number, instruction: string, roadName?: string): void {
    if (this.isMuted) return;

    let distText = '';
    if (distanceMeters >= 1000) {
      const km = (distanceMeters / 1000).toFixed(1);
      distText = `In ${km} kilometers, `;
    } else if (distanceMeters > 150) {
      const rounded = Math.round(distanceMeters / 50) * 50;
      distText = `In ${rounded} meters, `;
    } else if (distanceMeters > 30) {
      distText = `In ${Math.round(distanceMeters)} meters, `;
    } else {
      distText = `Now, `;
    }

    const targetRoad = roadName && roadName !== 'ROAD UNAVAILABLE' ? ` onto ${roadName}` : '';
    const prompt = `${distText}${instruction}${targetRoad}`;
    this.speak(prompt);
  }

  /**
   * Announce critical hazard ahead
   */
  public announceHazard(hazardType: string, distanceKm: number): void {
    const kmText = distanceKm > 1 ? `${distanceKm.toFixed(1)} kilometers` : `${Math.round(distanceKm * 1000)} meters`;
    const prompt = `Warning. ${hazardType} reported ${kmText} ahead on your route. Review safer bypass options.`;
    this.speak(prompt, true);
  }

  /**
   * Announce rerouting
   */
  public announceReroute(): void {
    this.speak('Route updated to avoid active hazard ahead.', true);
  }

  /**
   * Announce arrival
   */
  public announceArrival(): void {
    this.speak('You have arrived at your destination.', true);
  }
}

export const voiceNavigation = new VoiceNavigationService();
