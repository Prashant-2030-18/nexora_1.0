import { TravelMode } from '../../types';

const modeConfig: Record<TravelMode, { emoji: string; color: string; bg: string }> = {
  car: { emoji: '🚗', color: '#0284c7', bg: 'rgba(2, 132, 199, 0.25)' },
  truck: { emoji: '🚛', color: '#0284c7', bg: 'rgba(2, 132, 199, 0.25)' },
  walking: { emoji: '🚶', color: '#10b981', bg: 'rgba(16, 185, 129, 0.25)' },
  bicycle: { emoji: '🚲', color: '#0d9488', bg: 'rgba(13, 148, 136, 0.25)' },
  train: { emoji: '🚆', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.25)' },
  flight: { emoji: '✈️', color: '#ec4899', bg: 'rgba(236, 72, 153, 0.25)' },
};

/**
 * Creates an animated, hardware-accelerated DOM element for MapLibre GL Marker.
 */
export function createVehicleDOMElement(mode: TravelMode): HTMLElement {
  const cfg = modeConfig[mode] || modeConfig.truck;
  const container = document.createElement('div');
  container.className = 'nexora-nav-vehicle-marker';
  container.style.width = '44px';
  container.style.height = '44px';
  container.style.position = 'relative';
  container.style.cursor = 'pointer';
  container.style.transition = 'transform 0.4s cubic-bezier(0.25, 1, 0.5, 1)';
  container.style.willChange = 'transform';

  container.innerHTML = `
    <div style="
      position: absolute;
      inset: -6px;
      border-radius: 50%;
      border: 2px solid ${cfg.color};
      background: ${cfg.bg};
      animation: pulse-ring 2s cubic-bezier(0.2, 0.8, 0.2, 1) infinite;
      pointer-events: none;
    "></div>
    <div style="
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: ${cfg.color};
      border: 3px solid #ffffff;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
      color: white;
      position: relative;
    ">
      <span>${cfg.emoji}</span>
      <div style="
        position: absolute;
        top: -6px;
        left: 50%;
        transform: translateX(-50%);
        width: 0;
        height: 0;
        border-left: 5px solid transparent;
        border-right: 5px solid transparent;
        border-bottom: 7px solid #ffffff;
      "></div>
    </div>
  `;

  return container;
}

/**
 * Updates marker heading rotation smoothly
 */
export function updateVehicleDOMRotation(element: HTMLElement, headingDeg: number): void {
  const inner = element.firstElementChild?.nextElementSibling as HTMLElement;
  if (inner) {
    inner.style.transform = `rotate(${headingDeg}deg)`;
    inner.style.transition = 'transform 0.3s ease-out';
  }
}
